import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { createAgentRunProject } from "../../../tests/fixtures/agent-run-project.js";
import { flowTime } from "../../../tests/fixtures/flow-project.js";
import { LocalAgentRuntimeControl, type AgentRuntimeControlPort, type AgentRuntimeControlContext } from "../src/agent-runtime-control-local.js";

// Real Kernel/SQLite authority; constructed Agent qualification and Native port.
// These tests establish application control, never real model/OS qualification.
describe("Human controls original Agent operations through Kernel cancellation", () => {
  let root: string, f: ReturnType<typeof createAgentRunProject>, local: AgentRuntimeControlContext, runId: string;
  const query = vi.fn<AgentRuntimeControlPort["query"]>(), collect = vi.fn<AgentRuntimeControlPort["collect"]>(),
    cancel = vi.fn<AgentRuntimeControlPort["requestCancellation"]>(), recover = vi.fn<AgentRuntimeControlPort["recover"]>();
  let control: LocalAgentRuntimeControl;
  const command = (role = "technical_owner") => ({ command_id: createInternalId(), requested_at: flowTime, acting_role: role,
    command_type: "CancelRun", target: { object_type: "run", id: runId }, expected_revision: f.store.getRun(runId)!.revision, payload: { reason: "Stop original operation" } });
  beforeEach(() => {
    vi.resetAllMocks(); root = mkdtempSync(join(tmpdir(), "cimiloop-human-agent-control-")); f = createAgentRunProject(root);
    runId = f.reserveAgent(f.prepareAgent()).run.id;
    local = { store: f.store, kernel: f.humanKernel, instance: { schema_version: "1.0.0", instance_id: f.project.instance_id,
      project_id: f.project.id, actor_id: f.actor.id, created_at: flowTime }, location: { repositoryKind: "git", repositoryPath: root,
      dataDirectory: dirname(f.path), databasePath: f.path, instancePath: join(dirname(f.path), "instance.json"), suggestedName: "Constructed control contract" } };
    query.mockResolvedValue({ status: "Unknown", constructed: true }); collect.mockResolvedValue({ constructed: true });
    cancel.mockReturnValue({ requested: true, constructed: true }); recover.mockResolvedValue({ outcome: "unknown", constructed: true });
    control = new LocalAgentRuntimeControl(local, { query, collect, requestCancellation: cancel, recover });
  }, 60000);
  afterEach(() => { f?.store.close(); if (root) {
    if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("cimiloop-human-agent-control-")) throw Error("Unsafe cleanup");
    rmSync(root, { recursive: true, force: true });
  } });
  it("queries and collects original pins without adopting the Agent caller or mutating domain facts", async () => {
    const sequence = f.store.asOfEventSequence(), usage = f.task().usage;
    expect(await control.query(runId)).toMatchObject({ run_id: runId, operation: { outcome: "observed", result: { status: "Unknown" } } });
    await control.collect(runId);
    expect(query.mock.calls[0]![1]).toMatchObject({ project_id: f.project.id, run_id: runId, executor_actor_id: f.agent.id });
    expect(collect.mock.calls[0]![2]).toMatchObject({ project: { id: f.project.id }, record: { run_id: runId, run_kind: "agent" } });
    expect(local.instance.actor_id).toBe(f.actor.id); expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage).toEqual(usage);
  });
  it("denies a Human executor cancellation before touching the Native operation", async () => {
    const sequence = f.store.asOfEventSequence(), result = await control.stop(command("executor"));
    expect(result).toMatchObject({ code: "ROLE_NOT_ASSIGNED" }); expect(cancel).not.toHaveBeenCalled();
    expect(f.store.getRun(runId)!.cancel_requested).toBe(false); expect(f.store.asOfEventSequence()).toBe(sequence);
  });
  it("commits the Kernel cancellation before the original Native marker and reuses one command after response loss", async () => {
    cancel.mockImplementation(() => { expect(f.store.getRun(runId)!.cancel_requested).toBe(true); return { requested: true }; });
    const input = command(), sequence = f.store.asOfEventSequence();
    const first = await control.stop(input), second = await control.stop(input);
    expect(first).toMatchObject({ ok: true, operation: { outcome: "observed", result: { requested: true } } });
    expect(second).toEqual(first); expect(f.store.asOfEventSequence()).toBe(sequence + 1);
    expect(f.store.getRun(runId)!.status).toBe("Unknown"); expect(f.task().usage.pending_reconciliation).toBe(true);
  });
  it("keeps the committed cancellation when Native acknowledgement is lost and retries only the same marker", async () => {
    cancel.mockImplementationOnce(() => { throw Error("Constructed missing acknowledgement"); });
    const input = command(), sequence = f.store.asOfEventSequence();
    expect(await control.stop(input)).toMatchObject({ ok: true, operation: { outcome: "unknown" } });
    expect(f.store.getRun(runId)!.cancel_requested).toBe(true);
    expect(await control.stop(input)).toMatchObject({ ok: true, operation: { outcome: "observed" } });
    expect(f.store.asOfEventSequence()).toBe(sequence + 1); expect(cancel).toHaveBeenCalledTimes(2);
  });
  it("requires Kernel cancellation for resource recovery and never records completion", async () => {
    await expect(control.recover(runId)).rejects.toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" }); expect(recover).not.toHaveBeenCalled();
    await control.stop(command()); const sequence = f.store.asOfEventSequence();
    expect(await control.recover(runId)).toMatchObject({ operation: { outcome: "observed" } });
    expect(recover).toHaveBeenCalledTimes(1); expect(f.store.asOfEventSequence()).toBe(sequence);
    expect(f.store.listRuntimeRecords("run_observation", f.change.id)).toHaveLength(0);
  });
  it("rejects stale revisions, forged identity and unsupported operations before cancellation", async () => {
    const stale = { ...command(), expected_revision: f.store.getRun(runId)!.revision + 1 };
    expect(await control.stop(stale)).toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(control.stop({ ...command(), actor_id: f.agent.id })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await expect(control.stop({ ...command(), command_type: "ReserveRun" })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    expect(cancel).not.toHaveBeenCalled();
  });
  it("rejects foreign local identity, missing originals and mutations during asynchronous collection", async () => {
    await expect(new LocalAgentRuntimeControl({ ...local, instance: { ...local.instance, actor_id: f.agent.id } }, { query, collect, requestCancellation: cancel, recover }).query(runId))
      .rejects.toMatchObject({ code: "CALLER_IDENTITY_MISMATCH" });
    await expect(control.query(createInternalId())).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    collect.mockImplementation(async () => { local.location.repositoryPath = dirname(root); return {}; });
    await expect(control.collect(runId)).rejects.toMatchObject({ code: "INPUT_CHANGED" });
  });
  const revokeControl = () => f.store.transaction(tx => {
    for (const assignment of tx.listAssignments(f.actor.id).filter(a => a.role_key === "technical_owner"))
      tx.endAssignment({ ...assignment, ended_at: flowTime, updated_at: flowTime, revision: assignment.revision + 1 }, assignment.revision);
  });
  it.each(["retryCancellation", "recover"] as const)("denies %s after the original Human role is revoked, preserving cancellation and budget", async action => {
    await control.stop(command()); cancel.mockClear(); recover.mockClear(); revokeControl();
    const sequence = f.store.asOfEventSequence(), run = f.store.getRun(runId), usage = f.task().usage;
    await expect(control[action](runId)).rejects.toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    expect(cancel).not.toHaveBeenCalled(); expect(recover).not.toHaveBeenCalled();
    expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.store.getRun(runId)).toEqual(run); expect(f.task().usage).toEqual(usage);
    expect(await control.query(runId)).toMatchObject({ ok: true });
  });
  it("replaying an original cancellation receipt cannot grant physical control after role revocation", async () => {
    const input = command(); await control.stop(input); cancel.mockClear(); revokeControl();
    const receipt = f.store.transaction(tx => tx.getCommandReceipt(input.command_id)), sequence = f.store.asOfEventSequence();
    await expect(control.stop(input)).rejects.toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    expect(cancel).not.toHaveBeenCalled(); expect(f.store.transaction(tx => tx.getCommandReceipt(input.command_id))).toEqual(receipt);
    expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.store.listRuns(f.change.id)).toHaveLength(1);
  });
  it.each(['retryCancellation','recover'] as const)('passes current Human authority into each model effect during %s',async action=>{
    await control.stop(command());cancel.mockClear();let effects=0;const effect:AgentRuntimeControlPort['requestCancellation']=(_root,_scope,guard)=>{expect(guard).toBeTypeOf('function');revokeControl();guard!();effects++;return{requested:true};};if(action==='retryCancellation')cancel.mockImplementation(effect);else recover.mockImplementation(async(...args)=>effect(...args));
    await expect(control[action](runId)).rejects.toMatchObject({code:'ROLE_NOT_ASSIGNED'});expect(effects).toBe(0);expect(f.store.getRun(runId)!.cancel_requested).toBe(true);
  });
  it.each(["retryCancellation", "recover"] as const)("rechecks current Human control after awaiting %s", async action => {
    await control.stop(command()); cancel.mockClear(); recover.mockClear();
    const result = async () => { revokeControl(); return { requested: true }; };
    if (action === "recover") recover.mockImplementation(result); else cancel.mockImplementation(result);
    const sequence = f.store.asOfEventSequence(), usage = f.task().usage;
    await expect(control[action](runId)).rejects.toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    expect(action === "recover" ? recover : cancel).toHaveBeenCalledTimes(1);
    expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage).toEqual(usage);
    expect(f.store.getRun(runId)!.cancel_requested).toBe(true);
  });
  it.each(["retryCancellation", "recover"] as const)("rejects replaced Kernel permission after awaiting %s with real role revocation", async action => {
    await control.stop(command()); cancel.mockClear(); recover.mockClear();
    const permission = f.humanKernel.authorizeAgentRunControl(runId), method = f.humanKernel.authorizeAgentRunControl;
    const stale = vi.fn(() => permission), result = async () => { revokeControl(); Reflect.set(f.humanKernel, "authorizeAgentRunControl", stale); return { requested: true }; };
    if (action === "recover") recover.mockImplementation(result); else cancel.mockImplementation(result);
    const sequence = f.store.asOfEventSequence(), usage = f.task().usage;
    try {
      await expect(control[action](runId)).rejects.toMatchObject({ code: "INPUT_CHANGED" });
      expect(stale).not.toHaveBeenCalled(); expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage).toEqual(usage);
    } finally { Reflect.set(f.humanKernel, "authorizeAgentRunControl", method); }
  });
  it.each(["method", "object"] as const)("rejects replaced Kernel permission %s between original physical attempts", async replacement => {
    await control.stop(command()); cancel.mockClear(); recover.mockClear();
    const kernel = local.kernel, method = kernel.authorizeAgentRunControl, permission = kernel.authorizeAgentRunControl(runId), stale = vi.fn(() => permission);
    revokeControl(); const sequence = f.store.asOfEventSequence(), usage = f.task().usage;
    if (replacement === "method") Reflect.set(kernel, "authorizeAgentRunControl", stale);
    else local.kernel = { getObject: kernel.getObject.bind(kernel), execute: kernel.execute.bind(kernel), authorizeAgentRunControl: stale };
    try {
      await expect(control.retryCancellation(runId)).rejects.toMatchObject({ code: "INPUT_CHANGED" });
      expect(cancel).not.toHaveBeenCalled(); expect(recover).not.toHaveBeenCalled(); expect(stale).not.toHaveBeenCalled();
      expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage).toEqual(usage);
    } finally { local.kernel = kernel; Reflect.set(kernel, "authorizeAgentRunControl", method); }
  });
});
