import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CimiLoopKernel } from "../../kernel/src/index.js";
import { SqliteProjectStore } from "../src/index.js";
import * as v2 from "../../protocol/src/v2/index.js";
import { createSkillInvocationProject } from "../../../tests/fixtures/skill-invocation-project.js";
import { flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";

const directories: string[] = [], stores: { close(): void }[] = [];
vi.setConfig({ testTimeout: 45_000 });
afterEach(() => { while (stores.length) stores.pop()!.close(); while (directories.length) {
  const root = resolve(directories.pop()!); if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("cimiloop-skill-invocation-")) throw new Error("Unsafe cleanup");
  rmSync(root, { recursive: true, force: true });
} });
const fixture = () => { const directory = mkdtempSync(join(tmpdir(), "cimiloop-skill-invocation-")); directories.push(directory);
  const f = createSkillInvocationProject(directory); stores.push(f.store); return f; };

describe("Native SkillInvocation with constructed qualification and trusted host only", () => {
  it("reserves before effects, replays/reopens the original call and closes the parent only after strict output and cumulative billing", () => {
    const f = fixture(), command = f.reserveSkillCommand(), result = flowSuccess(f.kernel.execute(command));
    if (result.command_type !== "ReserveSkillInvocation") throw new Error("Skill expected"); const invocation = result.data.invocation;
    expect(invocation).toMatchObject({ run_ref: { id: f.reserved.run.id }, run_operation_key: f.reserved.record.operation_key,
      context_ref: { id: f.prepared.context.id }, runtime_binding: f.pins.runtime_binding, skill_binding: f.pins.skill_bindings[0] });
    expect(invocation.request.invocation_key).toBe(invocation.invocation_key); expect(f.skillState.prepare_calls).toBe(1);
    expect(f.kernel.execute(command)).toEqual(result); expect(f.skillState.prepare_calls).toBe(1); expect(f.task().usage.attempts_consumed).toBe(1);
    const reopened = new SqliteProjectStore(f.path); stores.push(reopened);
    const kernel = new CimiLoopKernel({ store: reopened, caller: f.caller, now: () => flowTime, runVerifier: f.runPort });
    expect(kernel.execute(command)).toEqual(result); expect(kernel.getObject("skill_invocation", invocation.id)).toMatchObject({ object: invocation });
    expect(kernel.getRuns(f.change.id)).toMatchObject({ skill_invocations: [invocation], skill_observations: [] });
    expect(f.agentObserve(f.currentRun(), "succeeded")).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    flowSuccess(f.observeSkill(invocation, "succeeded", { output: { purpose: "review", findings: [{ axis: "standards", severity: "non_blocking", observation: "Fixed basis accepted",
      basis_refs: f.methodInput.artifact_refs }], limitations: ["Constructed Native fixture only"] } })); expect(f.task().usage.cost_consumed_micros ?? 0).toBe(0);
    expect(f.agentObserve(f.currentRun(), "succeeded", { usage: { cost_known: true, cost_micros: 5, currency: "USD" } })).toMatchObject({ code: "BASELINE_MISMATCH" });
    flowSuccess(f.agentObserve(f.currentRun(), "succeeded"));
    expect(f.task().usage).toMatchObject({ attempts_consumed: 1, cost_consumed_micros: 25, cost_reserved_micros: 0, pending_reconciliation: false });
    expect(f.task().status).toBe("InProgress"); expect(f.store.getChange(f.change.id)?.lifecycle_state).toBe("Executing");
    expect(f.store.listVerificationRecords("evaluation", f.change.id)).toEqual([]);
  });
  it("refuses unwired, unqualified, unfixed, wrong-source and wrong-schema methods without saving records or changing Native usage", () => {
    const f = fixture(), before = f.currentRun(), task = f.task(), events = f.store.asOfEventSequence();
    f.skillState.qualification_available = false; expect(f.kernel.execute(f.reserveSkillCommand())).toMatchObject({ code: "EVIDENCE_MISSING" });
    f.skillState.qualification_available = true; f.skillState.wrong_source = true; expect(f.kernel.execute(f.reserveSkillCommand())).toMatchObject({ code: "BASELINE_MISMATCH" });
    f.skillState.wrong_source = false; f.skillState.wrong_schema = true; expect(f.kernel.execute(f.reserveSkillCommand())).toMatchObject({ code: "BASELINE_MISMATCH" });
    f.skillState.wrong_schema = false;
    const unfixed = f.runPort.content.storeContent(Buffer.from(JSON.stringify({ ...f.methodInput, artifact_refs: [{ provider: "fixture", resource_type: "diff", locator: "mutable" }] })), "skill_method_input");
    expect(f.kernel.execute(f.reserveSkillCommand({ input_ref: unfixed }))).toMatchObject({ code: "PROVIDER_OUTPUT_INVALID" });
    f.skillState.wrong_schema = false; expect(f.kernel.execute(f.reserveSkillCommand({ skill_binding_ref: { object_type: "provider_binding", id: f.runtime.id } }))).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    delete f.runPort.agent.skills; expect(f.kernel.execute(f.reserveSkillCommand())).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(f.currentRun()).toEqual(before); expect(f.task()).toEqual(task); expect(f.store.asOfEventSequence()).toBe(events); expect(f.store.listRuntimeRecords("skill_invocation", f.change.id)).toEqual([]);
  });
  it("keeps original unknown effects and fees until complete Human reconciliation even after authorization is revoked", () => {
    const f = fixture(), { invocation } = f.reserveSkill();
    flowSuccess(f.observeSkill(invocation, "unknown", { usage: { cost_known: false } }));
    expect(f.currentRun()).toMatchObject({ status: "Unknown", cost_known: false }); expect(f.task().usage).toMatchObject({ cost_known: false, pending_reconciliation: true });
    expect(f.kernel.execute(f.reserveSkillCommand())).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    expect(f.agentReconcile(f.currentRun(), "succeeded")).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    flowSuccess(f.humanKernel.execute(f.humanCommand("RevokeWorkItem", "work_item", f.item.id, { reason: "Stop original call" }, "technical_owner")));
    f.state.admission_available = false; f.skillState.qualification_available = false;
    expect(f.reconcileSkill(invocation, "succeeded", { resolves_observation_refs: [] })).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    flowSuccess(f.reconcileSkill(invocation, "succeeded")); expect(f.currentRun()).toMatchObject({ status: "Unknown", cost_known: false });
    flowSuccess(f.agentReconcile(f.currentRun(), "succeeded"));
    expect(f.currentRun()).toMatchObject({ status: "Succeeded", cost_known: true, cost_charged_micros: 25 });
    expect(f.task().usage).toMatchObject({ attempts_consumed: 1, cost_consumed_micros: 25, pending_reconciliation: false });
    expect(f.store.getExecutionObject("work_item", f.item.id)?.status).toBe("Revoked");
  });
  it("rejects unproven, cross-operation, wrong-purpose and authority-bearing outputs while retaining the original reservation", () => {
    const f = fixture(), { invocation } = f.reserveSkill(), before = f.currentRun();
    f.skillState.proof_available = false; expect(f.observeSkill(invocation, "succeeded")).toMatchObject({ code: "EVIDENCE_MISSING" }); f.skillState.proof_available = true;
    expect(f.observeSkill(invocation, "succeeded", { invocation_key: v2.createInternalId() })).toMatchObject({ code: "BASELINE_MISMATCH" });
    expect(f.observeSkill(invocation, "succeeded", { usage: { cost_known: true, cost_micros: 10, currency: "CNY" } })).toMatchObject({ code: "BASELINE_MISMATCH" });
    expect(f.observeSkill(invocation, "succeeded", { output: { purpose: "clarification", questions: [], unresolved: [] } })).toMatchObject({ code: "BASELINE_MISMATCH" });
    expect(f.observeSkill(invocation, "succeeded", { output: { purpose: "review", findings: [], limitations: [], approve_gate: true } })).toMatchObject({ code: "EVIDENCE_MISSING" });
    expect(f.observeSkill(invocation, "succeeded", { output: { purpose: "review", findings: [{ axis: "verification", severity: "blocking", observation: "Unfixed basis",
      basis_refs: [{ provider: "fixture", resource_type: "diff", locator: "unfixed" }] }], limitations: [] } })).toMatchObject({ code: "PROVIDER_OUTPUT_INVALID" });
    expect(f.currentRun()).toEqual(before); expect(f.store.listRuntimeRecords("skill_invocation_observation", f.change.id)).toEqual([]);
  });
  it("retains conflicting successful output and requires Human coverage before admitting another invocation", () => {
    const f = fixture(), { invocation } = f.reserveSkill(); flowSuccess(f.observeSkill(invocation, "succeeded"));
    flowSuccess(f.observeSkill(invocation, "succeeded", { output: { purpose: "review", findings: [], limitations: ["Changed original output"] } }));
    expect(f.currentRun().status).toBe("Unknown"); expect(f.store.listRuntimeRecords("skill_invocation_observation", f.change.id).at(-1)).toMatchObject({ applicability: "conflicting", resulting_status: "Unknown" });
    expect(f.reconcileSkill(invocation, "succeeded", { resolves_observation_refs: [] })).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    const raw = f.skillRaw(invocation, "succeeded", { basis: "reconciliation" });
    expect(f.kernel.execute(f.skillCommand("ReconcileSkillInvocation", { invocation_ref: { object_type: "skill_invocation", id: invocation.id }, raw_result_ref: raw.reference }))).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    flowSuccess(f.reconcileSkill(invocation, "succeeded")); flowSuccess(f.agentReconcile(f.currentRun(), "succeeded"));
    expect(f.kernel.execute(f.reserveSkillCommand())).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
  });
  it("reopens a returned parent attempt when late original Skill effects contradict not-started proof without changing operation keys", () => {
    const f = fixture(), { invocation } = f.reserveSkill();
    flowSuccess(f.reconcileSkill(invocation, "not_started", { usage: { cost_known: true, cost_micros: 0, currency: "USD" } }));
    flowSuccess(f.agentReconcile(f.currentRun(), "not_started", { usage: { cost_known: true, cost_micros: 0, currency: "USD" } }));
    expect(f.task().usage.attempts_released).toBe(1);
    flowSuccess(f.observeSkill(invocation, "succeeded")); expect(f.currentRun().status).toBe("Unknown"); expect(f.task().usage.pending_reconciliation).toBe(true);
    expect(f.agentReconcile(f.currentRun(), "not_started", { usage: { cost_known: true, cost_micros: 0, currency: "USD" } })).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    flowSuccess(f.reconcileSkill(invocation, "succeeded")); flowSuccess(f.agentReconcile(f.currentRun(), "succeeded"));
    expect(f.task().usage).toMatchObject({ attempts_consumed: 1, attempts_released: 1, attempt_releases_reversed: 1, pending_reconciliation: false, cost_consumed_micros: 25 });
    expect(f.store.getRuntimeRecord("skill_invocation", invocation.id)?.invocation_key).toBe(invocation.invocation_key);
    expect(f.store.getRuntimeRecord("run_record", f.reserved.record.id)?.operation_key).toBe(f.reserved.record.operation_key);
  });
  it("rolls back invocation, parent revision, event and receipt together on event persistence failure", () => {
    const f = fixture(), before = f.currentRun(), events = f.store.asOfEventSequence(), db = new DatabaseSync(f.path);
    try { db.exec("CREATE TRIGGER fail_skill_reservation BEFORE INSERT ON event_ledger WHEN NEW.event_type='SkillInvocationReserved' BEGIN SELECT RAISE(ABORT,'fault'); END;"); } finally { db.close(); }
    const command = f.reserveSkillCommand(); expect(f.kernel.execute(command)).toMatchObject({ code: "STORE_FAILURE" });
    expect(f.currentRun()).toEqual(before); expect(f.store.asOfEventSequence()).toBe(events); expect(f.store.listRuntimeRecords("skill_invocation", f.change.id)).toEqual([]);
    expect(f.store.transaction(tx => tx.getCommandReceipt(command.command_id))).toBeUndefined();
  });
  it("rolls back an unknown observation and both parent ledgers when its event cannot be persisted", () => {
    const f = fixture(), { invocation } = f.reserveSkill(), before = f.currentRun(), task = f.task(), events = f.store.asOfEventSequence(), db = new DatabaseSync(f.path);
    try { db.exec("CREATE TRIGGER fail_skill_observation BEFORE INSERT ON event_ledger WHEN NEW.event_type='SkillInvocationObserved' BEGIN SELECT RAISE(ABORT,'fault'); END;"); } finally { db.close(); }
    const raw = f.skillRaw(invocation, "unknown", { usage: { cost_known: false } });
    const command = f.skillCommand("RecordSkillInvocationObservation", { invocation_ref: { object_type: "skill_invocation", id: invocation.id }, raw_result_ref: raw.reference });
    expect(f.kernel.execute(command)).toMatchObject({ code: "STORE_FAILURE" }); expect(f.currentRun()).toEqual(before); expect(f.task()).toEqual(task);
    expect(f.store.asOfEventSequence()).toBe(events); expect(f.store.listRuntimeRecords("skill_invocation_observation", f.change.id)).toEqual([]);
    expect(f.store.transaction(tx => tx.getCommandReceipt(command.command_id))).toBeUndefined();
  });
  it("rejects duplicate original keys and altered parent pins through the Store and preserves immutable original records", () => {
    const f = fixture(), { invocation } = f.reserveSkill();
    expect(() => f.store.transaction(tx => tx.insertRuntimeRecord("skill_invocation", { ...invocation, id: v2.createInternalId() }))).toThrow(/already reserved/);
    expect(() => f.store.transaction(tx => tx.insertRuntimeRecord("skill_invocation", { ...invocation, id: v2.createInternalId(), invocation_key: v2.createInternalId(),
      runtime_binding: { ...invocation.runtime_binding, digest: { algorithm: "sha256", value: "a".repeat(64) } } }))).toThrow(/binding mismatch/);
    const db = new DatabaseSync(f.path); try {
      expect(() => db.prepare("UPDATE run_records SET payload_json = ? WHERE id = ?").run(JSON.stringify({ ...invocation, request: {} }), invocation.id)).toThrow(/immutable/);
      expect(() => db.prepare("DELETE FROM run_records WHERE id = ?").run(invocation.id)).toThrow(/immutable/);
    } finally { db.close(); }
  });
});
