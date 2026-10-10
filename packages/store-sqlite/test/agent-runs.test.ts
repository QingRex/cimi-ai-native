import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CimiLoopKernel } from "../../kernel/src/index.js";
import { SqliteProjectStore } from "../src/index.js";
import * as v2 from "../../protocol/src/v2/index.js";
import { createAgentRunProject } from "../../../tests/fixtures/agent-run-project.js";
import { flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";

const dirs: string[] = [], stores: { close(): void }[] = [];
vi.setConfig({ testTimeout: 45_000 });
afterEach(() => { while (stores.length) stores.pop()!.close(); while (dirs.length) { const root = resolve(dirs.pop()!); if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("cimiloop-agent-run-")) throw new Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true }); } });
const fixture = (scope: "task_execution" | "isolated_provider_probe" = "task_execution", cost: number | undefined = 100) => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-agent-run-")); dirs.push(directory); const f = createAgentRunProject(directory, scope, cost); stores.push(f.store); return f;
};
describe("Agent native records with constructed qualification and trusted port", () => {
  it("provides original immutable Kernel domain records to the result verifier without granting current-plan authority", () => {
    const f = fixture(), prepared = f.prepareAgent(), reserved = f.reserveAgent(prepared);
    if (reserved.record.run_kind !== "agent") throw Error("Agent expected");
    const expected = { definition: f.store.getExecutionRecord("task_definition", reserved.record.definition_ref.id),
      contract: f.store.getIntentRecord("contract_version", reserved.record.contract_ref.id),
      plan: f.store.getIntentRecord("plan_version", reserved.record.plan_ref.id), run: reserved.run };
    const read = f.runPort.agent!.readRunResult.bind(f.runPort.agent), seen: unknown[] = [];
    f.runPort.agent!.readRunResult = ((...args: any[]) => {
      seen.push(structuredClone(args[4]));
      if (args[4]) { args[4].definition.body.goal = "Verifier must receive a detached copy"; args[4].run.cancel_requested = true; }
      return (read as (...args: any[]) => unknown)(...args);
    }) as typeof read;
    flowSuccess(f.agentObserve(reserved.run, "unknown", { usage: { cost_known: false } }));
    expect(seen).toEqual([expected]);
    expect(f.store.getExecutionRecord("task_definition", reserved.record.definition_ref.id)).toEqual(expected.definition);
    expect(f.store.getRun(reserved.run.id)!.cancel_requested).toBe(false);
    expect(f.task().usage.pending_reconciliation).toBe(true); expect(f.task().status).toBe("InProgress");
  });
  it("pins Context and Run, reserves one original operation and replays/reopens without another admission or attempt", () => {
    const f = fixture(), prepared = f.prepareAgent(), command = f.reserveCommand(prepared), result = flowSuccess(f.kernel.execute(command));
    if (result.command_type !== "ReserveRun") throw new Error("Reservation expected");
    expect(prepared.context).toMatchObject({ boundary: "agent_scoped", ...f.pins });
    expect(result.data.record).toMatchObject({ run_kind: "agent", ...f.pins, host_admission_ref: prepared.context.host_admission_ref, attempt_no: 1 });
    const calls = f.state.admission_calls; expect(f.kernel.execute(command)).toEqual(result); expect(f.state.admission_calls).toBe(calls);
    expect(f.humanKernel.execute(command)).toMatchObject({ code: "CALLER_IDENTITY_MISMATCH" });
    const reopened = new SqliteProjectStore(f.path); stores.push(reopened);
    const kernel = new CimiLoopKernel({ store: reopened, caller: f.caller, now: () => flowTime, runVerifier: f.runPort });
    expect(kernel.execute(command)).toEqual(result); expect(kernel.getRuns(f.change.id)).toMatchObject({ records: [{ run_kind: "agent" }] });
    expect(f.task().usage).toMatchObject({ attempts_consumed: 1, cost_reserved_micros: 100, pending_reconciliation: true });
    flowSuccess(f.agentObserve(result.data.run, "succeeded")); expect(f.task().usage).toMatchObject({ cost_consumed_micros: 25, cost_reserved_micros: 0, pending_reconciliation: false });
    expect(f.task().status).toBe("InProgress"); expect(f.store.getChange(f.change.id)?.lifecycle_state).toBe("Executing");
  });
  it("rejects probe-only approval and an unwired host without saving a context or consuming usage", () => {
    const f = fixture("isolated_provider_probe"), before = f.task(), events = f.store.asOfEventSequence();
    expect(f.kernel.execute(f.prepareCommand())).toMatchObject({ code: "CAPABILITY_UNAVAILABLE", details: { blockers: expect.arrayContaining(["PROVIDER_BINDING_SCOPE_PROBE_ONLY"]) } });
    const unwired = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime }); expect(unwired.execute(f.prepareCommand())).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(f.store.listRuntimeRecords("workspace_snapshot", f.change.id)).toEqual([]); expect(f.store.listRuntimeRecords("context_manifest", f.change.id)).toEqual([]);
    expect(f.state.admission_calls).toBe(0); expect(f.task()).toEqual(before); expect(f.store.asOfEventSequence()).toBe(events);
  });
  it("rejects missing cost bounds, stale/duplicate/wrong-kind pins and Human-shaped Agent input", () => {
    const f = fixture(), before = f.task();
    expect(f.kernel.execute(f.prepareCommand({ ...f.pins, runtime_binding: { ...f.pins.runtime_binding, digest: { algorithm: "sha256", value: "a".repeat(64) } } }))).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(f.kernel.execute(f.prepareCommand({ ...f.pins, skill_bindings: [f.pins.skill_bindings[0]!, f.pins.skill_bindings[0]!] }))).toMatchObject({ code: "PROTOCOL_VALIDATION_FAILED" });
    expect(f.kernel.execute(f.prepareCommand({ ...f.pins, skill_bindings: [f.pins.runtime_binding] }))).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(f.kernel.execute(f.command("PrepareRunContext", "work_item", f.item.id, { source_snapshot_ref: { object_type: "source_snapshot", id: f.source.id } }))).toMatchObject({ code: "INPUT_CHANGED" });
    expect(f.task()).toEqual(before);
    const unbounded = fixture("task_execution", 0); expect(unbounded.kernel.execute(unbounded.prepareCommand())).toMatchObject({ code: "CAPABILITY_UNAVAILABLE", details: { blockers: expect.arrayContaining(["AGENT_COST_BOUND_REQUIRED"]) } });
  });
  it("rechecks the host pin and reserves the full remaining ceiling before any new Agent effect", () => {
    const f = fixture(), prepared = f.prepareAgent(), before = f.task();
    expect(f.kernel.execute(f.reserveCommand(prepared, 0))).toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(f.kernel.execute(f.reserveCommand(prepared, 50))).toMatchObject({ code: "BUDGET_EXCEEDED" });
    f.state.admission_epoch++; expect(f.kernel.execute(f.reserveCommand(prepared))).toMatchObject({ code: "INPUT_CHANGED" });
    f.state.admission_epoch--; f.state.admission_available = false; expect(f.kernel.execute(f.reserveCommand(prepared))).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(f.store.listRuns(f.change.id)).toEqual([]); expect(f.task()).toEqual(before);
  });
  it("rejects a previously prepared context when its approving owner assignment is ended", () => {
    const f = fixture(), prepared = f.prepareAgent(), before = f.task(); f.grant("project_owner", f.reviewer.id);
    flowSuccess(f.humanKernel.execute(f.settingsCommand({ priority_arbiter_actor_id: f.reviewer.id })));
    const assignment = f.store.listAssignments(f.actor.id).find(a => a.id === f.runtime.approval!.assignment_ref.id)!;
    flowSuccess(f.humanKernel.execute(f.projectCommand("EndAssignment", { assignment_id: assignment.id, expected_assignment_revision: assignment.revision, reason: "Revoke original Provider approving authority" })));
    const calls = f.state.admission_calls;
    expect(f.kernel.execute(f.reserveCommand(prepared))).toMatchObject({ code: "CAPABILITY_UNAVAILABLE", details: { blockers: expect.arrayContaining(["PROVIDER_APPROVAL_NOT_EFFECTIVE"]) } });
    expect(f.state.admission_calls).toBe(calls); expect(f.task()).toEqual(before); expect(f.store.listRuns(f.change.id)).toEqual([]);
  });
  it("rejects manual reports, cross-run/context/binding pins and unreadable proofs before mutating an Agent result", () => {
    const f = fixture(), reserved = f.reserveAgent(f.prepareAgent()), before = f.task(), events = f.store.asOfEventSequence();
    const manual = f.raw(reserved.run, "succeeded"); expect(f.kernel.execute(f.command("RecordRunObservation", "run", reserved.run.id, { raw_result_ref: manual.reference }))).toMatchObject({ code: "EVIDENCE_MISSING" });
    expect(f.agentObserve(reserved.run, "succeeded", { context_ref: { object_type: "context_manifest", id: v2.createInternalId() } })).toMatchObject({ code: "EVIDENCE_MISSING" });
    expect(f.agentObserve(reserved.run, "succeeded", { skill_bindings: [] })).toMatchObject({ code: "EVIDENCE_MISSING" });
    expect(f.agentObserve(reserved.run, "succeeded", { operation_key: v2.createInternalId() })).toMatchObject({ code: "BASELINE_MISMATCH" });
    f.state.proof_available = false; expect(f.agentObserve(reserved.run, "succeeded")).toMatchObject({ code: "EVIDENCE_MISSING" });
    expect(f.task()).toEqual(before); expect(f.store.asOfEventSequence()).toBe(events); expect(f.store.listRuntimeRecords("run_observation", f.change.id)).toEqual([]);
  });
  it("preserves Unknown and accumulated cost until Human reconciliation even after WorkItem/host admission is revoked", () => {
    const f = fixture(), reserved = f.reserveAgent(f.prepareAgent()); flowSuccess(f.agentObserve(reserved.run, "unknown", { usage: { cost_known: false } }));
    flowSuccess(f.kernel.execute(f.command("CancelRun", "run", reserved.run.id, { reason: "Request stop; keep original operation" })));
    expect(f.agentObserve(reserved.run, "not_started", { usage: { cost_known: true, cost_micros: 0, currency: "USD" } })).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    flowSuccess(f.humanKernel.execute(f.humanCommand("RevokeWorkItem", "work_item", f.item.id, { reason: "Stop authorization" }, "technical_owner")));
    f.state.admission_available = false; flowSuccess(f.agentObserve(reserved.run, "cancelled")); expect(f.store.getRun(reserved.run.id)?.status).toBe("Unknown");
    expect(f.agentReconcile(reserved.run, "cancelled", { resolves_observation_refs: [] })).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    flowSuccess(f.agentReconcile(reserved.run, "cancelled")); expect(f.store.getRun(reserved.run.id)).toMatchObject({ status: "Cancelled", cost_known: true, cost_charged_micros: 25 });
    expect(f.task().usage).toMatchObject({ attempts_consumed: 1, cost_reserved_micros: 0, cost_consumed_micros: 25, pending_reconciliation: false });
    expect(f.store.getExecutionObject("work_item", f.item.id)?.status).toBe("Revoked");
  });
  it("rolls back Context, workspace and receipt together when Native event persistence fails", () => {
    const f = fixture(), before = f.task(), events = f.store.asOfEventSequence(), db = new DatabaseSync(f.path);
    try { db.exec("CREATE TRIGGER fail_agent_context BEFORE INSERT ON event_ledger WHEN NEW.event_type='RunContextPrepared' BEGIN SELECT RAISE(ABORT,'fault'); END;"); } finally { db.close(); }
    const command = f.prepareCommand(); expect(f.kernel.execute(command)).toMatchObject({ code: "STORE_FAILURE" });
    expect(f.task()).toEqual(before); expect(f.store.asOfEventSequence()).toBe(events); expect(f.store.listRuntimeRecords("context_manifest", f.change.id)).toEqual([]);
    expect(f.store.listRuntimeRecords("workspace_snapshot", f.change.id)).toEqual([]); expect(f.store.transaction(tx => tx.getCommandReceipt(command.command_id))).toBeUndefined();
  });
  it("accepts semantically identical Agent pins with reordered JSON keys", () => {
    const f = fixture(), prepared = f.prepareAgent(), reserved = f.reserveAgent(prepared);
    const reverse = (value: unknown): unknown => Array.isArray(value) ? value.map(reverse) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverse(entry)])) : value;
    const result = flowSuccess(f.agentObserve(reserved.run, "succeeded", {
      context_ref: reverse(reserved.record.context_ref) as v2.RawAgentRunObservation["context_ref"],
      runtime_binding: reverse(f.pins.runtime_binding) as v2.AgentRunBindings["runtime_binding"],
      skill_bindings: reverse(f.pins.skill_bindings) as v2.AgentRunBindings["skill_bindings"],
      host_admission_ref: reverse(prepared.context.host_admission_ref) as v2.AgentContextManifest["host_admission_ref"]
    }));
    expect(result.command_type).toBe("RecordRunObservation"); expect(f.store.getRun(reserved.run.id)?.status).toBe("Succeeded");
  });
  it("pins Agent handoff/resumption and rechecks host admission when a Human resumes the paused Change", () => {
    const f = fixture(), reserved = f.reserveAgent(f.prepareAgent()); flowSuccess(f.agentObserve(reserved.run, "succeeded"));
    const changeCommand = (kind: string, payload: unknown) => ({ ...f.context("change_owner"), command_type: kind, target: { object_type: "change", id: f.change.id }, expected_revision: f.store.getChange(f.change.id)!.revision, payload });
    flowSuccess(f.humanKernel.execute(changeCommand("PauseChange", { reason: "Resume original Agent scope" })));
    const saved = flowSuccess(f.kernel.execute(f.command("SaveHandoff", "work_item", f.item.id, { source_snapshot_ref: { object_type: "source_snapshot", id: f.source.id }, run_ref: { object_type: "run", id: reserved.run.id }, next_actor_ref: { object_type: "actor", id: f.agent.id }, completed: ["Constructed first result"], unresolved: ["Further verification"], next_action: "Recheck current scope", evidence_refs: [] })));
    if (saved.command_type !== "SaveHandoff") throw new Error("Handoff expected"); const prepared = f.prepareAgent();
    const checked = flowSuccess(f.kernel.execute(f.command("CheckResumption", "work_item", f.item.id, { handoff_ref: { object_type: "handoff_record", id: saved.data.handoff.id }, context_ref: { object_type: "context_manifest", id: prepared.context.id }, input_digest: prepared.context.input_digest })));
    if (checked.command_type !== "CheckResumption") throw new Error("Resumption expected");
    const payload = { reconciliation_refs: [{ object_type: "resumption_record", id: checked.data.resumption.id }] };
    f.state.admission_epoch++; expect(f.humanKernel.execute(changeCommand("ResumeChange", payload))).toMatchObject({ code: "INPUT_CHANGED" });
    f.state.admission_epoch--; flowSuccess(f.humanKernel.execute(changeCommand("ResumeChange", payload)));
    const result = flowSuccess(f.kernel.execute({ ...f.reserveCommand(prepared, 75), payload: { ...f.reserveCommand(prepared, 75).payload as object, resumption_ref: { object_type: "resumption_record", id: checked.data.resumption.id } } }));
    if (result.command_type !== "ReserveRun") throw new Error("Reservation expected"); expect(result.data.record.attempt_no).toBe(2); expect(result.data.record.reserved_cost_micros).toBe(75);
    expect(f.task().usage).toMatchObject({ attempts_consumed: 2, cost_consumed_micros: 25, cost_reserved_micros: 75 });
  });
  it("rejects direct SQL attempts to mix Human Context/Agent Run or replace an Agent result's pins", () => {
    const f = fixture(), prepared = f.prepareAgent(), reserved = f.reserveAgent(prepared); flowSuccess(f.agentObserve(reserved.run, "succeeded"));
    const db = new DatabaseSync(f.path); const insert = (kind: string, value: unknown, id: string) => db.prepare("INSERT INTO run_records VALUES (?, ?, ?, ?, ?, ?)").run(id, f.project.id, f.change.id, f.agent.id, kind, JSON.stringify(value));
    try {
      expect(() => insert("run_record", { ...reserved.record, id: v2.createInternalId(), run_id: v2.createInternalId(), operation_key: v2.createInternalId(), attempt_no: 2, run_kind: "human" }, v2.createInternalId())).toThrow(/binding mismatch/);
      const observation = f.store.listRuntimeRecords("run_observation", f.change.id)[0]!;
      expect(() => insert("run_observation", { ...observation, id: v2.createInternalId(), report: { ...observation.report, skill_bindings: [] } }, v2.createInternalId())).toThrow(/binding mismatch/);
    } finally { db.close(); }
  });
});
