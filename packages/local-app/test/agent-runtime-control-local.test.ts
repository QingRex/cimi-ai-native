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
});
