import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fork } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { CimiLoopKernel } from "../../kernel/src/index.js";
import * as v2 from "../../protocol/src/v2/index.js";
import { createVerificationProject } from "../../../tests/fixtures/verification-project.js";
import { flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";

const directories: string[] = [], stores: { close(): void }[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }); });
const fixture = (deferral = false, kind: "requirement" | "bug" = "requirement") => { const dir = mkdtempSync(join(tmpdir(), "cimiloop-verification-")); directories.push(dir); const f = createVerificationProject(dir, true, deferral, kind); stores.push(f.store); return f; };
const taskEvaluation = (result: ReturnType<CimiLoopKernel["execute"]>): v2.TaskEvaluation => { const success = flowSuccess(result); if (success.command_type !== "EvaluateTask" || success.data.evaluation.purpose === "safe_integration") throw new Error("task evaluation expected"); return success.data.evaluation; };
const gateEvaluation = (result: ReturnType<CimiLoopKernel["execute"]>): v2.GateEvaluation => { const success = flowSuccess(result); if (success.command_type !== "EvaluateIntegration" || success.data.evaluation.purpose !== "safe_integration") throw new Error("gate expected"); return success.data.evaluation; };

describe("V1-06 manual evidence, evaluation and safe integration", () => {
  it("requires Bugfix reproduction and regression conclusions in its fixed policy profile", () => {
    const f = fixture(false, "bug"), source = f.capture(); f.finish(source); f.authorize(1); const prepared = f.prepare(source, 1);
    expect(prepared.policy_snapshot.profile).toBe("Bugfix"); expect(prepared.requirement_set.requirements.map(item => item.key)).toEqual(expect.arrayContaining(["bug_reproduction", "bug_regression", "safe_integration"]));
    expect(taskEvaluation(f.evaluate(prepared, 1)).outcome).toBe("NEED_MORE_EVIDENCE");
  }, 20_000);

  it("does not accept an Agent registration and executor grant as a real independent runtime context", () => {
    const f = fixture(), source = f.capture(), providerIdentity = { provider: "opencode", resource_type: "session", locator: "registered-only" };
    const registered = flowSuccess(f.kernel.execute(f.projectCommand("RegisterActor", { actor_type: "agent", identity_source: "runtime_binding", display_name: "Agent", provider_identity_ref: providerIdentity })));
    if (registered.command_type !== "RegisterActor") throw new Error("actor expected"); const actor = registered.data.actor;
    f.authorize(0, actor.id); const agent = new CimiLoopKernel({ store: f.store, caller: { kind: "agent", project_id: f.project.id, actor_id: actor.id, provider_identity_ref: providerIdentity }, evidenceVerifier: f.port, now: () => flowTime });
    const command = { ...f.taskCommand("PrepareTaskEvaluation", f.task().id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id } }, actor.id), source: { origin: "agent", producer: "registered-only" } };
    expect(agent.execute(command)).toMatchObject({ code: "EXECUTOR_NOT_ALLOWED" }); expect(f.store.listVerificationRecords("evaluation_context", f.change.id)).toEqual([]);
  }, 20_000);

  it("allows only one concurrent native satisfaction with Task CAS and the actual local verifier", async () => {
    const f = fixture(), source = f.capture(); f.authorize(); const first = f.prepare(source), raw = f.report(source, first.requirement_set); flowSuccess(f.record(source, raw.raw_result_ref)); const evaluation = taskEvaluation(f.evaluate(f.prepare(source)));
    const commands = [f.taskCommand("SatisfyTask", f.task().id, { evaluation_ref: { object_type: "evaluation", id: evaluation.id } }, f.actor.id, "technical_owner"), f.taskCommand("SatisfyTask", f.task().id, { evaluation_ref: { object_type: "evaluation", id: evaluation.id } }, f.actor.id, "technical_owner")];
    const clients = commands.map(() => fork(resolve("tests/fixtures/verification-client.mjs"), [f.path], { silent: true, execArgv: ["--no-warnings"] }));
    try {
      await Promise.all(clients.map(client => new Promise<void>((done, reject) => { client.once("error", reject); client.once("message", () => done()); })));
      const outcomes = clients.map(client => new Promise<unknown>((done, reject) => { client.once("error", reject); client.once("message", message => { const value = message as { result?: unknown; error?: string }; value.error ? reject(new Error(value.error)) : done(value.result); }); }));
      const exits = clients.map(client => new Promise<void>((done, reject) => client.once("exit", code => code === 0 ? done() : reject(new Error(`exit ${code}`)))));
      clients.forEach((client, i) => client.send({ caller: f.caller, command: commands[i], now: flowTime })); const results = await Promise.all(outcomes); await Promise.all(exits);
      expect(results.filter(value => value && typeof value === "object" && "ok" in value)).toHaveLength(1); expect(results).toContainEqual(expect.objectContaining({ code: "REVISION_CONFLICT" })); expect(f.store.listVerificationRecords("task_satisfaction_record", f.change.id)).toHaveLength(1); expect(f.task().status).toBe("Satisfied");
    } finally { clients.forEach(client => { if (client.exitCode === null) client.kill(); }); }
  }, 30_000);
  it("verifies real source and reports, unlocks the independent task, and advances only after a current native ALLOW", () => {
    const f = fixture(true), source = f.capture();
    expect(source.source_digest).toEqual(f.port.sourceDigest(f.store.getProject()!, source.commit_id));
    const incomplete = gateEvaluation(f.kernel.execute(f.gateCommand())); expect(incomplete.outcome).toBe("NEED_MORE_EVIDENCE");
    expect(f.kernel.execute(f.mark(incomplete))).toMatchObject({ code: "EVIDENCE_MISSING" });
    f.finish(source); const independent = f.finish(source, 1); expect(independent.evaluation).toMatchObject({ purpose: "independent", outcome: "ALLOW", producer_actor_id: f.reviewer.id });
    const gateCmd = f.gateCommand(), gateResult = f.kernel.execute(gateCmd), gate = gateEvaluation(gateResult);
    expect(gate.outcome).toBe("ALLOW"); expect(f.kernel.execute(gateCmd)).toEqual(gateResult);
    const before = f.store.listEvents().length, mark = f.mark(gate), result = flowSuccess(f.kernel.execute(mark));
    expect(result.command_type).toBe("MarkReadyForIntegration"); expect(f.kernel.execute(mark)).toEqual(result); expect(f.store.listEvents()).toHaveLength(before + 1);
    expect(f.store.getChange(f.change.id)).toMatchObject({ lifecycle_state: "ReadyForDelivery", operating_status: "Active" });
    expect(f.store.listVerificationRecords("integration_readiness_record", f.change.id)[0]!.deferred_checks).toEqual(f.deferred);
    expect(f.store.listExecutionObjects("task", f.change.id).every(item => item.status === "Satisfied" && item.usage.attempts_consumed === 0)).toBe(true);
    const view = f.kernel.getVerification(f.change.id); expect(view).toMatchObject({ ok: true, evidence: expect.any(Array), satisfactions: expect.any(Array), integration_readiness: [expect.any(Object)], as_of_event_sequence: f.store.asOfEventSequence() });
    const flow = f.kernel.getFlowStatus(); expect(flow).toMatchObject({ wip: { used: 1 } });
    const db = new DatabaseSync(f.path); try { expect(() => db.exec("DELETE FROM verification_records")).toThrow("immutable record");
      expect(db.prepare("SELECT count(*) AS n FROM command_receipts").get()!.n).toBe(f.store.listEvents().length); expect(f.store.listOutbox()).toHaveLength(f.store.listEvents().length);
    } finally { db.close(); }
  }, 30_000);

  it("does not infer success from missing evidence and preserves refutes and conflicting evidence", () => {
    const f = fixture(), source = f.capture(); f.authorize(); const prepared = f.prepare(source);
    const missing = taskEvaluation(f.evaluate(prepared)); expect(missing.outcome).toBe("NEED_MORE_EVIDENCE"); expect(f.satisfy(missing)).toMatchObject({ code: "EVIDENCE_MISSING" });
    const negative = f.report(source, prepared.requirement_set, 0, "refutes"); flowSuccess(f.record(source, negative.raw_result_ref));
    const denied = taskEvaluation(f.evaluate(f.prepare(source))); expect(denied.outcome).toBe("DENY");
    const positive = f.report(source, prepared.requirement_set); flowSuccess(f.record(source, positive.raw_result_ref));
    const conflict = taskEvaluation(f.evaluate(f.prepare(source))); expect(conflict.outcome).toBe("REQUIRE_HUMAN"); expect(f.satisfy(conflict)).toMatchObject({ code: "EVIDENCE_MISSING" });
    expect(f.task().status).toBe("Pending"); expect(gateEvaluation(f.kernel.execute(f.gateCommand())).outcome).toBe("DENY");
  }, 20_000);

  it("invalidates prepared inputs on new evidence and blocks unknown observations even alongside supports", () => {
    const f = fixture(), source = f.capture(); f.authorize(); const prepared = f.prepare(source), positive = f.report(source, prepared.requirement_set);
    flowSuccess(f.record(source, positive.raw_result_ref)); const events = f.store.listEvents();
    expect(f.evaluate(prepared)).toMatchObject({ code: "INPUT_CHANGED" }); expect(f.store.listEvents()).toEqual(events);
    const allowed = taskEvaluation(f.evaluate(f.prepare(source))); expect(allowed.outcome).toBe("ALLOW");
    const unknown = f.report(source, prepared.requirement_set, 0, "inconclusive"); flowSuccess(f.record(source, unknown.raw_result_ref));
    expect(f.satisfy(allowed)).toMatchObject({ code: "INPUT_CHANGED" }); expect(taskEvaluation(f.evaluate(f.prepare(source))).outcome).toBe("NEED_MORE_EVIDENCE");
  }, 20_000);

  it.each(["tampered", "missing", "producer", "source", "future", "claims"] as const)("rejects invalid raw evidence %s without saving records or events", kind => {
    const f = fixture(), source = f.capture(); f.authorize(); const prepared = f.prepare(source), raw = f.report(source, prepared.requirement_set), before = f.store.listEvents();
    let rawRef = raw.raw_result_ref;
    if (kind === "tampered") writeFileSync(join(dirname(f.path), "objects", rawRef.locator), "{}");
    else if (kind === "missing") rmSync(join(dirname(f.path), "objects", rawRef.locator));
    else {
      const body = { ...raw.raw, ...(kind === "producer" ? { producer_actor_id: f.reviewer.id } : kind === "source" ? { source_digest: { algorithm: "sha256", value: "0".repeat(64) } } : kind === "future" ? { observed_at: "2026-10-04T00:00:00.000Z" } : { claims: [...raw.raw.claims, raw.raw.claims[0]] }) };
      writeFileSync(raw.file, JSON.stringify(body)); rawRef = f.port.importRawResult(raw.file);
    }
    expect(f.record(source, rawRef)).toMatchObject({ code: ["tampered", "missing"].includes(kind) ? "EVIDENCE_MISSING" : "BASELINE_MISMATCH" });
    expect(f.store.listVerificationRecords("evidence", f.change.id)).toEqual([]); expect(f.store.listEvents()).toEqual(before);
  }, 20_000);

  it("requires a bound independent Human and a minimal context, and never imports implementation reasoning", () => {
    const f = fixture(), source = f.capture(); f.finish(source); f.authorize(1); const prepared = f.prepare(source, 1);
    expect(prepared.context).toMatchObject({ evaluator_actor_id: f.reviewer.id, boundary: "manual_independent_read_only", allowed_resources: ["src/query.ts"] });
    expect(JSON.stringify(prepared.context)).not.toMatch(/transcript|reasoning|implementation_summary|self_evaluation/);
    const payload = { requirement_set_ref: { object_type: "requirement_set_record", id: prepared.requirement_set.id }, input_digest: prepared.input_digest };
    expect(f.reviewerKernel.execute(f.taskCommand("EvaluateTask", f.task(1).id, payload, f.reviewer.id))).toMatchObject({ code: "INDEPENDENCE_REQUIRED" });
    expect(f.kernel.execute(f.taskCommand("PrepareTaskEvaluation", f.task(1).id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id } }))).toMatchObject({ code: "EXECUTOR_NOT_ALLOWED" });
    expect(f.kernel.execute(f.taskCommand("PrepareTaskEvaluation", f.task(1).id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id } }, f.reviewer.id))).toMatchObject({ code: "CALLER_IDENTITY_MISMATCH" });
  }, 20_000);

  it.each(["dirty", "head", "missing_raw"] as const)("rejects stale integration source or raw content %s", kind => {
    const f = fixture(), source = f.capture(), first = f.finish(source); f.finish(source, 1); const gate = gateEvaluation(f.kernel.execute(f.gateCommand())); expect(gate.outcome).toBe("ALLOW");
    if (kind === "missing_raw") rmSync(join(dirname(f.path), "objects", first.raw_result_ref.locator));
    else { writeFileSync(join(f.directory, "src", "query.ts"), "export const query = () => 2;\n"); if (kind === "head") { f.git("add", "src/query.ts"); f.git("commit", "--quiet", "-m", "Changed fixed source"); } }
    const events = f.store.listEvents(); expect(f.kernel.execute(f.mark(gate))).toMatchObject({ code: kind === "missing_raw" ? "EVIDENCE_MISSING" : "BASELINE_MISMATCH" }); expect(f.store.listEvents()).toEqual(events); expect(f.store.getChange(f.change.id)!.lifecycle_state).toBe("Executing");
  }, 30_000);

  it("rechecks a deferred check deadline at the transition and refuses to defer safe integration", () => {
    const f = fixture(true), source = f.capture(); f.finish(source); f.finish(source, 1); const gate = gateEvaluation(f.kernel.execute(f.gateCommand())); expect(gate.outcome).toBe("ALLOW");
    const late = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => "2026-10-05T00:00:00.000Z", evidenceVerifier: f.port });
    expect(late.execute(f.mark(gate))).toMatchObject({ code: "EVIDENCE_MISSING" });
    const forged = { ...f.gateCommand(), payload: { ...f.gateCommand().payload, deferred_checks: [{ ...f.deferred[0], acceptance_key: "safe_integration" }] } };
    expect(gateEvaluation(f.kernel.execute(forged)).outcome).toBe("DENY"); expect(f.store.getChange(f.change.id)!.lifecycle_state).toBe("Executing");
  }, 30_000);

  it("fails closed without the trusted verifier and rolls back task closure when receipt persistence fails", () => {
    const f = fixture(), source = f.capture(); f.authorize(); const prepared = f.prepare(source), raw = f.report(source, prepared.requirement_set); flowSuccess(f.record(source, raw.raw_result_ref)); const evaluation = taskEvaluation(f.evaluate(f.prepare(source)));
    const noPort = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime }); expect(noPort.execute(f.changeCommand("CaptureSourceSnapshot", { commit_id: source.commit_id }))).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    const db = new DatabaseSync(f.path); db.exec("CREATE TRIGGER fail_satisfaction_receipt BEFORE INSERT ON command_receipts BEGIN SELECT RAISE(ABORT, 'fault'); END;"); db.close();
    const before = f.store.listEvents(); expect(f.satisfy(evaluation)).toMatchObject({ code: "STORE_FAILURE" }); expect(f.task().status).toBe("Pending"); expect(f.store.getExecutionObject("work_item", f.task().active_work_item_ref!.id)!.status).toBe("Ready"); expect(f.store.listVerificationRecords("task_satisfaction_record", f.change.id)).toEqual([]); expect(f.store.listEvents()).toEqual(before);
    expect(readFileSync(join(dirname(f.path), "objects", raw.raw_result_ref.locator), "utf8")).toBe(JSON.stringify(raw.raw));
  }, 20_000);
});
