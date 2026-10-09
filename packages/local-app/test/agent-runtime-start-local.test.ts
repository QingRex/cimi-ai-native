import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CimiLoopKernel } from "../../kernel/src/index.js";
import { contentDigest } from "../../kernel/src/intent.js";
import { claimAgentRuntimeOperation } from "../../runtime-adapter/src/agent-runtime-operation.js";
import { LocalAgentRuntimeStart, type AgentRuntimeStartContext, type AgentRuntimeStartPort } from "../src/agent-runtime-start-local.js";
import { createAgentRunProject } from "../../../tests/fixtures/agent-run-project.js";
import { flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";
// Real Kernel/SQLite and original registration, constructed host/owner only.
// No OS process, model, Skill or billing qualification is inferred here.
describe("shared original Agent launch assembly", () => {
  let root: string, f: ReturnType<typeof createAgentRunProject>, local: AgentRuntimeStartContext, runId: string;
  const prepare = vi.fn<AgentRuntimeStartPort["prepare"]>(), launch = vi.fn(), dispose = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks(); root = mkdtempSync(join(tmpdir(), "cimiloop-agent-start-")); f = createAgentRunProject(root);
    runId = f.reserveAgent(f.prepareAgent()).run.id;
    f.runPort.agent.checkRunAuthority = (_project, input) => contentDigest({ constructed: true, input });
    local = { store: f.store, caller: f.caller, kernel: new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, runVerifier: f.runPort }),
      location: { repositoryKind: "git", repositoryPath: root, dataDirectory: dirname(f.path), databasePath: f.path, instancePath: join(dirname(f.path), "instance.json"), suggestedName: "Constructed launch" } };
    prepare.mockImplementation(async inputs => ({ launch: async () => {
      launch(inputs); claimAgentRuntimeOperation(local.location.dataDirectory, inputs.scope, { constructed: true, material_digest: inputs.material_digest },
        { pid: 1234, creation_ticks: "123456", image: process.execPath });
    }, dispose }));
  }, 60000);
  afterEach(() => { f?.store.close(); if (root) {
    if (dirname(root) !== tmpdir() || !basename(root).startsWith("cimiloop-agent-start-")) throw Error("Unsafe cleanup");
    rmSync(root, { recursive: true, force: true });
  } });
  it("assembles Task/Plan/Contract from Kernel records and starts once across concurrent callers and service instances", async () => {
    const service = new LocalAgentRuntimeStart(local, { prepare }), sequence = f.store.asOfEventSequence();
    const results = await Promise.all([service.start(runId), new LocalAgentRuntimeStart(local, { prepare }).start(runId)]);
    expect(results.every(value => value.ok && !value.completion_proven)).toBe(true); expect(launch).toHaveBeenCalledTimes(1); expect(dispose).toHaveBeenCalledTimes(1);
    const inputs = prepare.mock.calls[0]![0]; expect(inputs.definition.task_id).toBe(f.item.task_id);
    expect(inputs.plan.id).toBe(f.task().plan_ref.id); expect(inputs.contract.id).toBe(f.task().contract_ref.id);
    expect(inputs.scope.run_id).toBe(runId); expect(inputs.context.input_digest).toEqual(inputs.scope.context_digest);
    await service.start(runId); expect(launch).toHaveBeenCalledTimes(1); expect(f.store.asOfEventSequence()).toBe(sequence);
    expect(f.store.listRuns(f.change.id)).toHaveLength(1); expect(f.task().usage.cost_reserved_micros).toBe(100);
  });
  it("defaults closed before preparation and refuses Human caller or request-supplied launch material", async () => {
    await expect(new LocalAgentRuntimeStart(local).start(runId)).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    await expect(new LocalAgentRuntimeStart({ ...local, caller: { kind: "human", project_id: f.project.id, actor_id: f.actor.id } } as unknown as AgentRuntimeStartContext, { prepare }).start(runId)).rejects.toThrow();
    await expect(new LocalAgentRuntimeStart(local, { prepare }).start({ run_id: runId, approved: true } as unknown as string)).rejects.toThrow();
    expect(prepare).not.toHaveBeenCalled(); expect(launch).not.toHaveBeenCalled();
  });
  it("rechecks Kernel cancellation after asynchronous preparation, disposes staging and produces no start", async () => {
    prepare.mockImplementation(async () => {
      flowSuccess(f.humanKernel.execute(f.humanCommand("CancelRun", "run", runId, { reason: "Cancel during staging" }, "technical_owner")));
      return { launch, dispose };
    });
    await expect(new LocalAgentRuntimeStart(local, { prepare }).start(runId)).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(launch).not.toHaveBeenCalled(); expect(dispose).toHaveBeenCalledTimes(1); expect(f.task().usage.pending_reconciliation).toBe(true);
  });
  it("keeps one original dispatch after response loss and reads it even after cancellation", async () => {
    const originalPrepare = prepare.getMockImplementation()!;
    prepare.mockImplementation(async inputs => { const staged = await originalPrepare(inputs); return { ...staged, launch: async () => { await staged.launch(); throw Error("Lost acknowledgement"); } }; });
    const service = new LocalAgentRuntimeStart(local, { prepare });
    expect(await service.start(runId)).toMatchObject({ outcome: "original", completion_proven: false });
    flowSuccess(f.humanKernel.execute(f.humanCommand("CancelRun", "run", runId, { reason: "Stop original" }, "technical_owner")));
    expect(await new LocalAgentRuntimeStart(local, { prepare }).start(runId)).toMatchObject({ outcome: "original", completion_proven: false });
    expect(launch).toHaveBeenCalledTimes(1); expect(prepare).toHaveBeenCalledTimes(1);
  });
  it("retains partial original Native registration and never fills it with another start", async () => {
    const path = join(local.location.dataDirectory, "agent-runtime-claims", f.project.id, "runs", runId); mkdirSync(path, { recursive: true });
    const result = await new LocalAgentRuntimeStart(local, { prepare }).start(runId);
    expect(result).toMatchObject({ outcome: "unknown", completion_proven: false }); expect(prepare).not.toHaveBeenCalled();
  });
  it("preserves dispatch without a Native claim after a lost effect acknowledgement, and never retries launch", async () => {
    prepare.mockResolvedValue({ launch: async () => { launch(); throw Error("Original effect/claim state unavailable"); }, dispose });
    const service = new LocalAgentRuntimeStart(local, { prepare }); expect(await service.start(runId)).toMatchObject({ outcome: "unknown" });
    const path = join(local.location.dataDirectory, "agent-runtime-starts", f.project.id, runId, "dispatch.json"), bytes = readFileSync(path);
    expect(await new LocalAgentRuntimeStart(local, { prepare }).start(runId)).toMatchObject({ outcome: "unknown" });
    expect(launch).toHaveBeenCalledTimes(1); expect(readFileSync(path)).toEqual(bytes);
    writeFileSync(path, "{}"); expect(await service.start(runId)).toMatchObject({ outcome: "unknown" }); expect(launch).toHaveBeenCalledTimes(1);
  });
  it("does not treat missing new-host local registration as independent first-start custody", async () => {
    await new LocalAgentRuntimeStart(local, { prepare }).start(runId);
    const newData = join(root, ".git", "constructed-new-host"); mkdirSync(newData);
    // No trusted original host ledger is installed on this new composition.
    // It must deny even though both local Native/start registration are absent.
    delete f.runPort.agent.checkRunAuthority;
    await expect(new LocalAgentRuntimeStart({ ...local, location: { ...local.location, dataDirectory: newData } }, { prepare }).start(runId))
      .rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(launch).toHaveBeenCalledTimes(1); expect(prepare).toHaveBeenCalledTimes(1);
  });
});
