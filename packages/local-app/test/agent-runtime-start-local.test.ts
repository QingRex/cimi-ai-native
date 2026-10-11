import {createInternalId} from "@cimiloop/protocol/v2";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CimiLoopKernel } from "../../kernel/src/index.js";
import { contentDigest } from "../../kernel/src/intent.js";
import { claimAgentRuntimeOperation } from "../../runtime-adapter/src/agent-runtime-operation.js";
import { AgentStartLedger } from "@cimiloop/runtime-adapter";
import { LocalAgentStartCustody, type AgentStartFullCustodyPort } from "../src/agent-start-custody-local.js";
import { LocalAgentRuntimeStart, type AgentRuntimeStartContext, type AgentRuntimeStartPort } from "../src/agent-runtime-start-local.js";
import { createAgentRunProject } from "../../../tests/fixtures/agent-run-project.js";
import { flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";
// Real Kernel/SQLite and original registration, constructed host/owner only.
// No OS process, model, Skill or billing qualification is inferred here.
describe("shared original Agent launch assembly", () => {
  let root: string, f: ReturnType<typeof createAgentRunProject>, local: AgentRuntimeStartContext, runId: string, custody: LocalAgentStartCustody, ledger: AgentStartLedger, full: AgentStartFullCustodyPort;
  const prepare = vi.fn<AgentRuntimeStartPort["prepare"]>(), launch = vi.fn(), dispose = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks(); root = mkdtempSync(join(tmpdir(), "cimiloop-agent-start-")); f = createAgentRunProject(root);
    ledger = AgentStartLedger.initialize(join(dirname(f.path), "original-host"), { machine_digest: contentDigest("constructed machine").value, principal_digest: contentDigest("constructed principal").value });
    const originalAdmission = f.runPort.agent.admitContext.bind(f.runPort.agent);
    full = {
      admit: originalAdmission, verifyLaunch: (_project, input, original) => contentDigest({ constructed: true, input, original })
    };
    custody = new LocalAgentStartCustody(root, dirname(f.path), ledger, full);
    f.runPort.agent.admitContext = custody.admit.bind(custody);
    f.runPort.agent.checkRunAuthority = custody.checkRunAuthority.bind(custody);
    runId = f.reserveAgent(f.prepareAgent()).run.id;
    local = { store: f.store, caller: f.caller, kernel: new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, runVerifier: f.runPort }),
      location: { repositoryKind: "git", repositoryPath: root, dataDirectory: dirname(f.path), databasePath: f.path, instancePath: join(dirname(f.path), "instance.json"), suggestedName: "Constructed launch" } };
    prepare.mockImplementation(async inputs => ({ launch: async () => {
      launch(inputs); claimAgentRuntimeOperation(local.location.dataDirectory, inputs.scope, { constructed: true, material_digest: inputs.material_digest },
        { pid: 1234, creation_ticks: "123456", image: process.execPath });
    }, dispose }));
  }, 60000);
  afterEach(() => { ledger?.close(); f?.store.close(); if (root) {
    if (dirname(root) !== tmpdir() || !basename(root).startsWith("cimiloop-agent-start-")) throw Error("Unsafe cleanup");
    rmSync(root, { recursive: true, force: true });
  } });
  it("re-reads original custody after a synchronous independent callback and denies substituted immutable originals",async()=>{
    const original=ledger.readOriginalScope.bind(ledger);let substitute=false;
    vi.spyOn(ledger,'readOriginalScope').mockImplementation((ticket,scope)=>{const value=original(ticket,scope);return substitute?{...value,basis:{PUBLIC:'substituted original'}}:value;});
    full.verifyLaunch=()=>{substitute=true;return contentDigest('PUBLIC positive independent callback');};
    await expect(new LocalAgentRuntimeStart(local,{custody,prepare}).start(runId)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});
    expect(prepare).not.toHaveBeenCalled();expect(launch).not.toHaveBeenCalled();
  });
  it("pins the original scope across a callback that claims it then mutates its input to hide that change",()=>{
    const run=f.store.getRun(runId)!,record=f.store.getRuntimeRecord('run_record',run.record_ref.id)!;if(record.run_kind!=='agent')throw Error('Agent expected');
    const scope={project_id:record.project_id,run_id:runId,operation_key:record.operation_key,executor_actor_id:record.executor_ref.id,context_digest:record.input_digest,runtime_binding:record.runtime_binding,skill_bindings:record.skill_bindings,host_admission_ref:record.host_admission_ref};
    const cuts=vi.spyOn(ledger,'readOriginalScope');
    full.verifyLaunch=(_project,input)=>{const ticket=cuts.mock.calls.at(-1)![0];ledger.claim(ticket,structuredClone(input.request),contentDigest('PUBLIC original claimed during callback'));input.request.run_id=createInternalId();input.request.operation_key=createInternalId();return contentDigest('PUBLIC positive mutated callback');};
    expect(local.kernel.assessAgentRunLaunch(scope)).toMatchObject({decision:'DENY',reasons:['AGENT_LAUNCH_HOST_PROOF_UNPROVEN']});
    expect(prepare).not.toHaveBeenCalled();expect(launch).not.toHaveBeenCalled();
  });
  it("assembles Task/Plan/Contract from Kernel records and starts once across concurrent callers and service instances", async () => {
    const service = new LocalAgentRuntimeStart(local, { custody, prepare }), sequence = f.store.asOfEventSequence();
    const results = await Promise.all([service.start(runId), new LocalAgentRuntimeStart(local, { custody, prepare }).start(runId)]);
    expect(results.every(value => value.ok && !value.completion_proven)).toBe(true); expect(launch).toHaveBeenCalledTimes(1); expect(dispose).toHaveBeenCalledTimes(1);
    const inputs = prepare.mock.calls[0]![0]; expect(inputs.definition.task_id).toBe(f.item.task_id);
    expect(inputs.plan.id).toBe(f.task().plan_ref.id); expect(inputs.contract.id).toBe(f.task().contract_ref.id);
    expect(inputs.scope.run_id).toBe(runId); expect(inputs.context.input_digest).toEqual(inputs.scope.context_digest);
    await service.start(runId); expect(launch).toHaveBeenCalledTimes(1); expect(f.store.asOfEventSequence()).toBe(sequence);
    expect(f.store.listRuns(f.change.id)).toHaveLength(1); expect(f.task().usage.cost_reserved_micros).toBe(100);
  });
  it("defaults closed before preparation and refuses Human caller or request-supplied launch material", async () => {
    await expect(new LocalAgentRuntimeStart(local).start(runId)).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    await expect(new LocalAgentRuntimeStart({ ...local, caller: { kind: "human", project_id: f.project.id, actor_id: f.actor.id } } as unknown as AgentRuntimeStartContext, { custody, prepare }).start(runId)).rejects.toThrow();
    await expect(new LocalAgentRuntimeStart(local, { custody, prepare }).start({ run_id: runId, approved: true } as unknown as string)).rejects.toThrow();
    expect(prepare).not.toHaveBeenCalled(); expect(launch).not.toHaveBeenCalled();
  });
  it("rechecks Kernel cancellation after asynchronous preparation, disposes staging and produces no start", async () => {
    prepare.mockImplementation(async () => {
      flowSuccess(f.humanKernel.execute(f.humanCommand("CancelRun", "run", runId, { reason: "Cancel during staging" }, "technical_owner")));
      return { launch, dispose };
    });
    await expect(new LocalAgentRuntimeStart(local, { custody, prepare }).start(runId)).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(launch).not.toHaveBeenCalled(); expect(dispose).toHaveBeenCalledTimes(1); expect(f.task().usage.pending_reconciliation).toBe(true);
  });
  it("keeps one original dispatch after response loss and reads it even after cancellation", async () => {
    const originalPrepare = prepare.getMockImplementation()!;
    prepare.mockImplementation(async inputs => { const staged = await originalPrepare(inputs); return { ...staged, launch: async () => { await staged.launch(); throw Error("Lost acknowledgement"); } }; });
    const service = new LocalAgentRuntimeStart(local, { custody, prepare });
    expect(await service.start(runId)).toMatchObject({ outcome: "original", completion_proven: false });
    flowSuccess(f.humanKernel.execute(f.humanCommand("CancelRun", "run", runId, { reason: "Stop original" }, "technical_owner")));
    expect(await new LocalAgentRuntimeStart(local, { custody, prepare }).start(runId)).toMatchObject({ outcome: "original", completion_proven: false });
    expect(launch).toHaveBeenCalledTimes(1); expect(prepare).toHaveBeenCalledTimes(1);
  });
  it("retains partial original Native registration and never fills it with another start", async () => {
    const path = join(local.location.dataDirectory, "agent-runtime-claims", f.project.id, "runs", runId); mkdirSync(path, { recursive: true });
    const result = await new LocalAgentRuntimeStart(local, { custody, prepare }).start(runId);
    expect(result).toMatchObject({ outcome: "unknown", completion_proven: false }); expect(prepare).not.toHaveBeenCalled();
  });
  it("preserves dispatch without a Native claim after a lost effect acknowledgement, and never retries launch", async () => {
    prepare.mockResolvedValue({ launch: async () => { launch(); throw Error("Original effect/claim state unavailable"); }, dispose });
    const service = new LocalAgentRuntimeStart(local, { custody, prepare }); expect(await service.start(runId)).toMatchObject({ outcome: "unknown" });
    const path = join(local.location.dataDirectory, "agent-runtime-starts", f.project.id, runId, "dispatch.json"), bytes = readFileSync(path);
    expect(await new LocalAgentRuntimeStart(local, { custody, prepare }).start(runId)).toMatchObject({ outcome: "unknown" });
    expect(launch).toHaveBeenCalledTimes(1); expect(readFileSync(path)).toEqual(bytes);
    writeFileSync(path, "{}"); expect(await service.start(runId)).toMatchObject({ outcome: "unknown" }); expect(launch).toHaveBeenCalledTimes(1);
  });
  it("does not treat missing new-host local registration as independent first-start custody", async () => {
    await new LocalAgentRuntimeStart(local, { custody, prepare }).start(runId);
    const newData = join(root, ".git", "constructed-new-host"); mkdirSync(newData);
    // Global custody retains the original claim even with an otherwise positive
    // Kernel callback and absent local Native/start registration.
    expect(await new LocalAgentRuntimeStart({ ...local, location: { ...local.location, dataDirectory: newData } }, { custody, prepare }).start(runId))
      .toMatchObject({ outcome: "unknown", completion_proven: false });
    expect(launch).toHaveBeenCalledTimes(1); expect(prepare).toHaveBeenCalledTimes(1);
  });
  it("refuses even a positive launch callback when no independent original start ledger is installed", async () => {
    // Positive constructed Kernel proof cannot substitute for persistent first-start custody.
    await expect(new LocalAgentRuntimeStart(local, { prepare }).start(runId)).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(prepare).not.toHaveBeenCalled(); expect(launch).not.toHaveBeenCalled();
  });
  it("retains global first-start custody when both local dispatch and Native registration disappear", async () => {
    expect(await new LocalAgentRuntimeStart(local, { custody, prepare }).start(runId)).toMatchObject({ outcome: "original" });
    // Only constructed test registration is moved; no OS process/resource exists.
    renameSync(join(local.location.dataDirectory, "agent-runtime-starts"), join(root, "retained-starts"));
    renameSync(join(local.location.dataDirectory, "agent-runtime-claims"), join(root, "retained-claims"));
    expect(await new LocalAgentRuntimeStart(local, { custody, prepare }).start(runId)).toMatchObject({ outcome: "unknown" });
    expect(launch).toHaveBeenCalledTimes(1); expect(prepare).toHaveBeenCalledTimes(1);
  });
  it("denies before staging when the installed full host custody rejects despite a positive Kernel callback", async () => {
    f.runPort.agent.checkRunAuthority = () => contentDigest("unrelated positive host");
    full.verifyLaunch = () => { throw Error("Current model/account custody unavailable"); };
    await expect(new LocalAgentRuntimeStart(local, { custody, prepare }).start(runId)).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(prepare).not.toHaveBeenCalled(); expect(launch).not.toHaveBeenCalled();
  });
});
