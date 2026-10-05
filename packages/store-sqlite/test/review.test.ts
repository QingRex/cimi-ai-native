import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { CimiLoopKernel } from "../../kernel/src/index.js";
import * as v2 from "../../protocol/src/v2/index.js";
import { createVerificationProject } from "../../../tests/fixtures/verification-project.js";
import { flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";

const directories: string[] = [], stores: { close(): void }[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }); });
const fixture = (high = false) => { const directory = mkdtempSync(join(tmpdir(), "cimiloop-review-")); directories.push(directory); const f = createVerificationProject(directory, true, false, "requirement", high); stores.push(f.store); return f; };
type Fixture = ReturnType<typeof fixture>;
const changeCommand = <P>(f: Fixture, kind: string, change: v2.Change, payload: P, role = "flow_owner") => ({ ...f.context(role), command_type: kind,
  target: { object_type: "change", id: change.id }, expected_revision: change.revision, payload });
const gate = (f: Fixture) => { const result = flowSuccess(f.kernel.execute(f.gateCommand())); if (result.command_type !== "EvaluateIntegration" || result.data.evaluation.purpose !== "safe_integration") throw new Error("gate expected"); return result.data.evaluation; };
const evaluation = (f: Fixture) => { const source = f.store.listVerificationRecords("source_snapshot", f.change.id).at(-1)!; const result = flowSuccess(f.evaluate(f.prepare(source))); if (result.command_type !== "EvaluateTask") throw new Error("evaluation expected"); return result.data.evaluation; };
const requestCommand = (f: Fixture, action: v2.DecisionRequest["action"], subject: NonNullable<v2.DecisionRequest["professional_subject_ref"]>, changeId = f.change.id, role = "technical_owner", proposal: v2.DecisionRequest["target_ref"] = f.store.getIntentRecord("contract_version", f.store.getChange(changeId)!.contract_ref!.id)!.proposal_ref) =>
  changeCommand(f, "RequestDecision", f.store.getChange(changeId)!, { action, proposal_ref: proposal, professional_subject_ref: subject }, role);
const request = (f: Fixture, command: ReturnType<typeof requestCommand>) => { const result = flowSuccess(f.kernel.execute(command)); if (result.command_type !== "RequestDecision") throw new Error("request expected"); return result.data.request; };
const report = (f: Fixture, request: v2.DecisionRequest, finding: v2.RawProfessionalReview["finding"], actorId = f.reviewer.id) => {
  const raw: v2.RawProfessionalReview = { format: "cimiloop/manual-review/1.0.0", producer_actor_id: actorId, observed_at: flowTime, request_input_digest: request.input_digest,
    method: "具名人工对照固定输入复核；测试只验证控制路径", finding };
  const file = join(dirname(f.path), `review-${v2.createInternalId()}.json`); writeFileSync(file, JSON.stringify(raw));
  return { file, raw, ref: f.port.importRawResult(file, "manual_review") };
};
const decisionCommand = (f: Fixture, request: v2.DecisionRequest, raw?: ReturnType<typeof report>, actorId = f.reviewer.id, choice: v2.Decision["choice"] = "approve") => ({
  ...changeCommand(f, "RecordDecision", f.store.getChange(request.change_id)!, { request_id: request.id, input_digest: request.input_digest, choice, reason: "实际专业判断依据", conditions: [], ...(raw ? { raw_review_ref: raw.ref } : {}) }, request.required_role), actor_id: actorId });
const decide = (f: Fixture, request: v2.DecisionRequest, raw: ReturnType<typeof report>, kernel = f.reviewerKernel, actorId = f.reviewer.id) => {
  const result = flowSuccess(kernel.execute(decisionCommand(f, request, raw, actorId))); if (result.command_type !== "RecordDecision") throw new Error("decision expected"); return result.data.decision;
};
const conditional = (f: Fixture) => { const change = f.create(), proposal = f.submitContract(change.id), risk = f.assess(change.id, proposal), parentRequest = f.request(change.id, proposal, "contract", risk), parent = f.decide(change.id, parentRequest, "approve", ["需求责任人已核对范围", "兼容约束已有具名检查"]);
  const command = requestCommand(f, "verify_decision_conditions", { object_type: "decision", id: parent.id }, change.id, "requirement_owner", parent.target_ref);
  const check = request(f, command); return { change, proposal, parentRequest, parent, check, confirm: () => f.kernel.execute(changeCommand(f, "ConfirmContract", f.store.getChange(change.id)!, f.confirmPayload(parentRequest, parent), "requirement_owner")) };
};
const results = (parent: v2.Decision, result: "supports" | "refutes" | "inconclusive" = "supports"): v2.RawProfessionalReview["finding"] => ({ kind: "condition_verification", results: parent.conditions.map((condition, condition_index) => ({ condition_index, condition, result, observation: "实际检查记录" })) });
const conflict = (f: Fixture) => {
  const source = f.capture(); f.authorize(); const prepared = f.prepare(source), negative = f.report(source, prepared.requirement_set, 0, "refutes"), positive = f.report(source, prepared.requirement_set);
  const old = flowSuccess(f.record(source, negative.raw_result_ref)), corrected = flowSuccess(f.record(source, positive.raw_result_ref)); if (old.command_type !== "RecordEvidence" || corrected.command_type !== "RecordEvidence") throw new Error("evidence expected");
  return { source, negative: old.data.evidence, positive: corrected.data.evidence };
};
const invalidation = (facts: ReturnType<typeof conflict>): v2.RawProfessionalReview["finding"] => ({ kind: "evidence_invalidation", claim_keys: facts.negative.claims.map(item => item.key),
  defect: "wrong_observation", analysis: "逐项复核发现原报告误读返回值；纠正记录包含同源码的实际观察", correction_evidence_refs: [{ object_type: "evidence", id: facts.positive.id }] });

describe("V1-06 bounded professional reviews", () => {
  it("verifies every conditional approval before confirmation and retains its historical proof when opening", () => {
    const f = fixture(), c = conditional(f); expect(c.confirm()).toMatchObject({ code: "EVIDENCE_MISSING" });
    const partial = report(f, c.check, { kind: "condition_verification", results: [{ condition_index: 0, condition: c.parent.conditions[0]!, result: "supports", observation: "已检查范围" }] }, f.actor.id);
    decide(f, c.check, partial, f.kernel, f.actor.id); expect(c.confirm()).toMatchObject({ code: "EVIDENCE_MISSING" });
    const next = request(f, requestCommand(f, "verify_decision_conditions", { object_type: "decision", id: c.parent.id }, c.change.id, "requirement_owner", c.parent.target_ref));
    const second = report(f, next, { kind: "condition_verification", results: [{ condition_index: 1, condition: c.parent.conditions[1]!, result: "supports", observation: "已检查兼容约束" }] }, f.actor.id);
    decide(f, next, second, f.kernel, f.actor.id); const confirmed = flowSuccess(c.confirm()); if (confirmed.command_type !== "ConfirmContract") throw new Error("contract expected");
    expect(confirmed.data.contract_version.condition_verification_refs).toHaveLength(2);
    const plan = f.submitPlan(c.change.id), planRequest = f.request(c.change.id, plan, "plan"), planDecision = f.decide(c.change.id, planRequest, "approve", ["技术责任人核对独立任务安排"]);
    const planReview = request(f, requestCommand(f, "verify_decision_conditions", { object_type: "decision", id: planDecision.id }, c.change.id, "technical_owner", planDecision.target_ref));
    decide(f, planReview, report(f, planReview, results(planDecision), f.actor.id), f.kernel, f.actor.id);
    const planConfirmed = flowSuccess(f.kernel.execute(changeCommand(f, "ConfirmPlan", f.store.getChange(c.change.id)!, f.confirmPayload(planRequest, planDecision), "technical_owner")));
    expect(planConfirmed.command_type).toBe("ConfirmPlan"); flowSuccess(f.kernel.execute(changeCommand(f, "InitializePlanTasks", f.store.getChange(c.change.id)!, { plan_ref: f.store.getChange(c.change.id)!.plan_ref }, "technical_owner")));
    expect(flowSuccess(f.kernel.execute(changeCommand(f, "StartChange", f.store.getChange(c.change.id)!, { plan_ref: f.store.getChange(c.change.id)!.plan_ref, opening_reason: "核验条件后开工" }))).command_type).toBe("StartChange");
    expect(f.kernel.getIntent(c.change.id)).toMatchObject({ decision_requests: expect.arrayContaining([expect.objectContaining({ request: expect.objectContaining({ id: next.id }), status: "applied" })]) });
  }, 30_000);

  it.each(["refutes", "inconclusive"] as const)("keeps a %s condition unresolved even after a later positive report", result => {
    const f = fixture(), c = conditional(f), raw = report(f, c.check, results(c.parent, result), f.actor.id);
    expect(f.kernel.execute(decisionCommand(f, c.check, raw, f.actor.id))).toMatchObject({ code: "DECISION_NOT_APPROVED" });
    flowSuccess(f.kernel.execute(decisionCommand(f, c.check, raw, f.actor.id, "request_changes")));
    const next = request(f, requestCommand(f, "verify_decision_conditions", { object_type: "decision", id: c.parent.id }, c.change.id, "requirement_owner", c.parent.target_ref));
    decide(f, next, report(f, next, results(c.parent), f.actor.id), f.kernel, f.actor.id); expect(c.confirm()).toMatchObject({ code: "EVIDENCE_MISSING" });
  }, 30_000);

  it("rejects wrong condition text, actor, source report and stale parent inputs", () => {
    const f = fixture(), c = conditional(f);
    const wrong = report(f, c.check, { kind: "condition_verification", results: [{ condition_index: 0, condition: "不同的条件", result: "supports", observation: "错误条件" }] }, f.actor.id);
    expect(f.kernel.execute(decisionCommand(f, c.check, wrong, f.actor.id))).toMatchObject({ code: "BASELINE_MISMATCH" });
    const good = report(f, c.check, results(c.parent), f.actor.id); expect(f.reviewerKernel.execute(decisionCommand(f, c.check, good))).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    writeFileSync(join(dirname(f.path), "objects", good.ref.locator), "{}"); expect(f.kernel.execute(decisionCommand(f, c.check, good, f.actor.id))).toMatchObject({ code: "EVIDENCE_MISSING" });
    f.submitContract(c.change.id); expect(f.kernel.execute(decisionCommand(f, c.check, good, f.actor.id))).toMatchObject({ code: "DECISION_STALE" });
  }, 30_000);

  it("requires independent quality responsibility for high risk, then reevaluates and marks ready with exact decision proof", () => {
    const f = fixture(true), source = f.capture(); f.finish(source); f.finish(source, 1); const before = gate(f); expect(before.outcome).toBe("REQUIRE_HUMAN");
    const command = requestCommand(f, "confirm_integration", { object_type: "evaluation", id: before.id }), req = request(f, command), raw = report(f, req, { kind: "integration_review", result: "supports", observation: "核对兼容性与集成约束" });
    expect(f.reviewerKernel.execute(decisionCommand(f, req, raw))).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    f.grant("quality_owner", f.actor.id); f.grant("quality_owner", f.reviewer.id);
    const own = report(f, req, raw.raw.finding, f.actor.id); expect(f.kernel.execute(decisionCommand(f, req, own, f.actor.id))).toMatchObject({ code: "INDEPENDENCE_REQUIRED" });
    const recordedCommand = decisionCommand(f, req, raw), revision = f.store.getChange(f.change.id)!.revision, result = flowSuccess(f.reviewerKernel.execute(recordedCommand)); if (result.command_type !== "RecordDecision") throw new Error("decision expected");
    expect(f.store.getChange(f.change.id)!.revision).toBe(revision); const after = gate(f); expect(after).toMatchObject({ outcome: "ALLOW", professional_decision_ref: { id: result.data.decision.id } }); expect(after.input_digest).not.toEqual(before.input_digest);
    expect(f.kernel.execute(f.mark(before))).toMatchObject({ code: "EVIDENCE_MISSING" }); flowSuccess(f.kernel.execute(f.mark(after)));
    const events = f.store.listEvents(); expect(flowSuccess(f.kernel.execute(command)).data).toEqual({ change: result.data.change, request: req }); expect(flowSuccess(f.reviewerKernel.execute(recordedCommand))).toEqual(result); expect(f.store.listEvents()).toEqual(events);
    expect(f.kernel.getIntent(f.change.id)).toMatchObject({ decision_requests: expect.arrayContaining([expect.objectContaining({ request: expect.objectContaining({ id: req.id }), status: "applied" })]) });
  }, 40_000);

  it("does not create a high risk override while required evidence is missing", () => {
    const f = fixture(true); f.capture(); const missing = gate(f); expect(missing.outcome).toBe("NEED_MORE_EVIDENCE");
    expect(f.kernel.execute(requestCommand(f, "confirm_integration", { object_type: "evaluation", id: missing.id }))).toMatchObject({ code: "DECISION_STALE" });
  }, 30_000);

  it("does not conceal a later negative professional integration review with an older approval", () => {
    const f = fixture(true), source = f.capture(); f.finish(source); f.finish(source, 1); f.grant("quality_owner", f.reviewer.id);
    const pending = gate(f), first = request(f, requestCommand(f, "confirm_integration", { object_type: "evaluation", id: pending.id }));
    decide(f, first, report(f, first, { kind: "integration_review", result: "supports", observation: "首次复核" })); const allowed = gate(f);
    const second = request(f, requestCommand(f, "confirm_integration", { object_type: "evaluation", id: pending.id }));
    flowSuccess(f.reviewerKernel.execute(decisionCommand(f, second, report(f, second, { kind: "integration_review", result: "refutes", observation: "发现未核实的兼容问题" }), f.reviewer.id, "request_changes")));
    expect(f.kernel.execute(f.mark(allowed))).toMatchObject({ code: "INPUT_CHANGED" }); expect(gate(f).outcome).toBe("REQUIRE_HUMAN");
  }, 40_000);

  it("invalidates high risk approval on expiry, ended responsibility, missing report or changed inputs", () => {
    const f = fixture(true), source = f.capture(); f.finish(source); f.finish(source, 1); f.grant("quality_owner", f.reviewer.id);
    const initial = gate(f), req = request(f, requestCommand(f, "confirm_integration", { object_type: "evaluation", id: initial.id })), raw = report(f, req, { kind: "integration_review", result: "supports", observation: "已专业复核" }); decide(f, req, raw); const allowed = gate(f);
    const expired = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => "2026-10-03T00:16:00.000Z", evidenceVerifier: f.port }); expect(expired.execute(f.mark(allowed))).toMatchObject({ code: "INPUT_CHANGED" });
    writeFileSync(join(dirname(f.path), "objects", raw.ref.locator), "{}"); expect(f.kernel.execute(f.mark(allowed))).toMatchObject({ code: "EVIDENCE_MISSING" });
    writeFileSync(join(dirname(f.path), "objects", raw.ref.locator), JSON.stringify(raw.raw));
    const assignment = f.store.listAssignments(f.reviewer.id).find(item => item.role_key === "quality_owner")!; flowSuccess(f.kernel.execute(f.projectCommand("EndAssignment", { assignment_id: assignment.id, expected_assignment_revision: assignment.revision, reason: "结束复核责任" })));
    expect(f.kernel.execute(f.mark(allowed))).toMatchObject({ code: "INPUT_CHANGED" });
    f.git("commit", "--allow-empty", "--quiet", "-m", "Changed source"); expect(f.reviewerKernel.execute(decisionCommand(f, req, raw))).toMatchObject({ code: "BASELINE_MISMATCH" });
  }, 40_000);

  it("disposes only demonstrated invalid claims, preserves negative evidence, and requires a new evaluation before satisfaction", () => {
    const f = fixture(), facts = conflict(f); f.grant("quality_owner", f.reviewer.id); const old = evaluation(f); expect(old.outcome).toBe("REQUIRE_HUMAN");
    const req = request(f, requestCommand(f, "invalidate_evidence", { object_type: "evidence", id: facts.negative.id })), raw = report(f, req, invalidation(facts)), decision = decide(f, req, raw);
    expect(f.store.getVerificationRecord("evidence", facts.negative.id)).toEqual(facts.negative); expect(f.satisfy(old as v2.TaskEvaluation)).toMatchObject({ code: "EVIDENCE_MISSING" });
    const after = evaluation(f); expect(after).toMatchObject({ outcome: "ALLOW", disposition_refs: [{ object_type: "decision", id: decision.id }] }); expect(after.input_digest).not.toEqual(old.input_digest);
    flowSuccess(f.satisfy(after as v2.TaskEvaluation)); f.finish(facts.source, 1); expect(gate(f).outcome).toBe("ALLOW");
    writeFileSync(join(dirname(f.path), "objects", raw.ref.locator), "{}"); expect(f.kernel.execute(f.gateCommand())).toMatchObject({ code: "EVIDENCE_MISSING" });
  }, 40_000);

  it("rejects unsupported disposition, self approval and stale evidence inventory", () => {
    const f = fixture(), facts = conflict(f); f.grant("quality_owner", f.reviewer.id); f.grant("quality_owner", f.actor.id);
    const req = request(f, requestCommand(f, "invalidate_evidence", { object_type: "evidence", id: facts.negative.id })), raw = report(f, req, invalidation(facts));
    expect(f.reviewerKernel.execute(decisionCommand(f, req))).toMatchObject({ code: "EVIDENCE_MISSING" });
    expect(f.kernel.execute(decisionCommand(f, req, report(f, req, invalidation(facts), f.actor.id), f.actor.id))).toMatchObject({ code: "INDEPENDENCE_REQUIRED" });
    const bad = report(f, req, { kind: "evidence_invalidation", claim_keys: ["unknown-claim"], defect: "wrong_method", analysis: "没有适用纠正依据", correction_evidence_refs: [{ object_type: "evidence", id: facts.positive.id }] });
    expect(f.reviewerKernel.execute(decisionCommand(f, req, bad))).toMatchObject({ code: "EVIDENCE_MISSING" });
    const more = f.report(facts.source, f.prepare(facts.source).requirement_set); flowSuccess(f.record(facts.source, more.raw_result_ref)); expect(f.reviewerKernel.execute(decisionCommand(f, req, raw))).toMatchObject({ code: "DECISION_STALE" });
    expect(evaluation(f).outcome).toBe("REQUIRE_HUMAN");
  }, 30_000);

  it("reapplies original negative claims when a later professional review rejects their invalidation", () => {
    const f = fixture(), facts = conflict(f); f.grant("quality_owner", f.reviewer.id);
    const command = requestCommand(f, "invalidate_evidence", { object_type: "evidence", id: facts.negative.id }), first = request(f, command);
    decide(f, first, report(f, first, invalidation(facts))); const allowed = evaluation(f); expect(allowed.outcome).toBe("ALLOW");
    const second = request(f, requestCommand(f, "invalidate_evidence", { object_type: "evidence", id: facts.negative.id }));
    flowSuccess(f.reviewerKernel.execute(decisionCommand(f, second, undefined, f.reviewer.id, "reject")));
    expect(f.satisfy(allowed as v2.TaskEvaluation)).toMatchObject({ code: "INPUT_CHANGED" }); expect(evaluation(f).outcome).toBe("REQUIRE_HUMAN");
    expect(f.store.getVerificationRecord("evidence", facts.negative.id)).toEqual(facts.negative);
  }, 30_000);

  it("rolls back professional decision, event and outbox if receipt persistence fails", () => {
    const f = fixture(), c = conditional(f), raw = report(f, c.check, results(c.parent), f.actor.id), events = f.store.listEvents();
    const database = new DatabaseSync(f.path); database.exec("CREATE TRIGGER fail_review_receipt BEFORE INSERT ON command_receipts BEGIN SELECT RAISE(ABORT, 'receipt failure'); END;"); database.close();
    expect(f.kernel.execute(decisionCommand(f, c.check, raw, f.actor.id))).toMatchObject({ code: "STORE_FAILURE" }); expect(f.store.listEvents()).toEqual(events);
    expect(f.store.listIntentRecords("decision", c.change.id)).toEqual([c.parent]); expect(c.confirm()).toMatchObject({ code: "EVIDENCE_MISSING" });
  }, 30_000);
});
