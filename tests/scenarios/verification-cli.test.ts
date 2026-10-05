import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { writeInstance } from "../../apps/cli/src/instance.js";
import { createVerificationProject } from "../fixtures/verification-project.js";
import { flowTime } from "../fixtures/flow-project.js";
import * as v2 from "../../packages/protocol/src/v2/index.js";
import { CimiLoopKernel } from "../../packages/kernel/src/index.js";
import { flowSuccess } from "../fixtures/flow-project.js";
import { contractBody } from "../fixtures/intent-project.js";

const dirs: string[] = [], stores: { close(): void }[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
it("runs the actual manual verification CLI and replays exact receipts after task closure and ReadyForDelivery", () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-verification-cli-")); dirs.push(directory); const f = createVerificationProject(directory); stores.push(f.store);
  writeInstance(join(dirname(f.path), "instance.json"), { schema_version: "1.0.0", instance_id: f.project.instance_id, project_id: f.project.id, actor_id: f.actor.id, created_at: flowTime });
  const bin = resolve("apps/cli/dist/bin.js"), history: { args: string[]; result: v2.CommandSuccess }[] = [];
  const argsFor = (args: string[]) => ["--no-warnings", bin, "--project-dir", directory, "--json", ...args];
  const run = (args: string[]) => JSON.parse(execFileSync(process.execPath, argsFor(args), { encoding: "utf8", windowsHide: true }));
  const payloadFile = (payload: unknown) => { const file = join(dirname(f.path), `payload-${v2.createInternalId()}.json`); writeFileSync(file, JSON.stringify(payload)); return file; };
  const act = <T extends v2.CommandSuccess["command_type"]>(kind: T, name: string, target: string, payload: unknown, rawFile?: string): Extract<v2.CommandSuccess, { command_type: T }> => {
    const args = ["--command-id", v2.createInternalId(), "verification", name, target, "--file", payloadFile(payload), ...(rawFile ? ["--raw-file", rawFile] : [])];
    const result = v2.parseCommandSuccess(run(args)); expect(result.command_type).toBe(kind); history.push({ args, result }); return result as Extract<v2.CommandSuccess, { command_type: T }>;
  };
  f.authorize(); const source = act("CaptureSourceSnapshot", "capture-source", f.change.display_key, { commit_id: f.git("rev-parse", "HEAD").trim() }).data.source_snapshot;
  const first = act("PrepareTaskEvaluation", "prepare-task", f.task().id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id } });
  const raw = f.report(source, first.data.requirement_set);
  act("RecordEvidence", "record-evidence", f.task().id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id } }, raw.file);
  const prepared = act("PrepareTaskEvaluation", "prepare-task", f.task().id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id } });
  const evaluation = act("EvaluateTask", "evaluate-task", f.task().id, { requirement_set_ref: { object_type: "requirement_set_record", id: prepared.data.requirement_set.id }, input_digest: prepared.data.input_digest }).data.evaluation;
  expect(evaluation.outcome).toBe("ALLOW"); act("SatisfyTask", "satisfy-task", f.task().id, { evaluation_ref: { object_type: "evaluation", id: evaluation.id } });
  f.authorize(1);
  const denied = spawnSync(process.execPath, argsFor(["verification", "prepare-task", f.task(1).id, "--file", payloadFile({ source_snapshot_ref: { object_type: "source_snapshot", id: source.id } })]), { encoding: "utf8", windowsHide: true });
  expect(denied.status).toBe(1); expect(JSON.parse(denied.stdout)).toMatchObject({ ok: false, error: { code: "EXECUTOR_NOT_ALLOWED" } });
  const review = f.prepare(source, 1), reviewReport = f.report(source, review.requirement_set, 1); f.record(source, reviewReport.raw_result_ref, 1);
  const reviewed = v2.parseCommandSuccess(f.evaluate(f.prepare(source, 1), 1)); if (reviewed.command_type !== "EvaluateTask" || reviewed.data.evaluation.purpose === "safe_integration") throw new Error("review expected");
  const satisfied = v2.parseCommandSuccess(f.satisfy(reviewed.data.evaluation, 1)); expect(satisfied.command_type).toBe("SatisfyTask");
  const gate = act("EvaluateIntegration", "evaluate-integration", f.change.display_key, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id }, deferred_checks: [] }).data.evaluation;
  expect(gate.outcome).toBe("ALLOW"); act("MarkReadyForIntegration", "mark-ready", f.change.display_key, { evaluation_ref: { object_type: "evaluation", id: gate.id }, input_digest: gate.input_digest, reason: "当前源码已独立复核" });
  const events = f.store.listEvents(); for (const previous of history) expect(run(previous.args)).toEqual(previous.result); expect(f.store.listEvents()).toEqual(events);
  expect(v2.compileValidator<v2.VerificationShowResult>(v2.VerificationShowResultSchema)(run(["verification", "show", f.change.display_key]))).toMatchObject({ ok: true, integration_readiness: [expect.any(Object)], satisfactions: [expect.any(Object), expect.any(Object)] });
}, 120_000);

it("runs condition review request, raw report import, confirmation and exact receipt replay through the CLI", () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-condition-cli-")); dirs.push(directory); const f = createVerificationProject(directory, false); stores.push(f.store);
  writeInstance(join(dirname(f.path), "instance.json"), { schema_version: "1.0.0", instance_id: f.project.instance_id, project_id: f.project.id, actor_id: f.actor.id, created_at: flowTime });
  const kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, evidenceVerifier: f.port }), change = f.create();
  const command = <P>(kind: string, payload: P, role: string) => ({ ...f.context(role), command_type: kind, target: { object_type: "change", id: change.id }, expected_revision: f.store.getChange(change.id)!.revision, payload });
  const proposalResult = flowSuccess(kernel.execute(command("SubmitContractProposal", { base_version_ref: null, body: contractBody() }, "change_owner"))); if (proposalResult.command_type !== "SubmitContractProposal") throw new Error("proposal expected");
  const proposalRef = { object_type: "contract_proposal", id: proposalResult.data.proposal.id, domain_version: 1 };
  const risk = flowSuccess(kernel.execute(command("RecordRiskAssessment", { proposal_ref: proposalRef, level: "ordinary", rationale: "实际责任人核对风险" }, "technical_owner"))); if (risk.command_type !== "RecordRiskAssessment") throw new Error("risk expected");
  const requested = flowSuccess(kernel.execute(command("RequestDecision", { action: "confirm_contract", proposal_ref: proposalRef, risk_ref: { object_type: "risk_assessment", id: risk.data.risk_assessment.id } }, "change_owner"))); if (requested.command_type !== "RequestDecision") throw new Error("request expected");
  const parent = flowSuccess(kernel.execute(command("RecordDecision", { request_id: requested.data.request.id, input_digest: requested.data.request.input_digest, choice: "approve", conditions: ["核对范围"], reason: "范围核对后才确认" }, "requirement_owner"))); if (parent.command_type !== "RecordDecision") throw new Error("decision expected");
  const run = (args: string[]) => v2.parseCommandSuccess(JSON.parse(execFileSync(process.execPath, ["--no-warnings", resolve("apps/cli/dist/bin.js"), "--project-dir", directory, "--json", ...args], { encoding: "utf8", windowsHide: true })));
  const args = ["--command-id", v2.createInternalId(), "decision", "request", change.display_key, "--action", "verify_decision_conditions", "--proposal-id", proposalRef.id, "--proposal-revision", "1", "--subject-kind", "decision", "--subject-id", parent.data.decision.id];
  const review = run(args); if (review.command_type !== "RequestDecision") throw new Error("review expected"); expect(review.data.request.required_role).toBe("requirement_owner");
  const raw: v2.RawProfessionalReview = { format: "cimiloop/manual-review/1.0.0", producer_actor_id: f.actor.id, observed_at: new Date().toISOString(), request_input_digest: review.data.request.input_digest,
    method: "实际人工范围检查，测试仅验证控制路径", finding: { kind: "condition_verification", results: [{ condition_index: 0, condition: "核对范围", result: "supports", observation: "实际记录检查范围" }] } };
  const file = join(dirname(f.path), "actual-review.json"); writeFileSync(file, JSON.stringify(raw));
  const recordArgs = ["--command-id", v2.createInternalId(), "decision", "record", change.display_key, "--request-id", review.data.request.id, "--input-digest", review.data.request.input_digest.value, "--choice", "approve", "--reason", "条件已具名核对", "--raw-file", file];
  const decision = run(recordArgs); if (decision.command_type !== "RecordDecision") throw new Error("decision expected"); expect(decision.data.decision.review?.raw_result_ref.resource_type).toBe("manual_review");
  const confirmed = run(["contract", "confirm", change.display_key, "--proposal-id", proposalRef.id, "--proposal-revision", "1", "--request-id", requested.data.request.id, "--decision-id", parent.data.decision.id, "--input-digest", requested.data.request.input_digest.value]);
  if (confirmed.command_type !== "ConfirmContract") throw new Error("confirmed expected"); expect(confirmed.data.contract_version.condition_verification_refs).toEqual([{ object_type: "decision", id: decision.data.decision.id }]);
  const events = f.store.listEvents(); expect(run(args)).toEqual(review); expect(run(recordArgs)).toEqual(decision); expect(f.store.listEvents()).toEqual(events);
}, 120_000);
