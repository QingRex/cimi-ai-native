import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CimiLoopKernel } from "../../packages/kernel/src/index.js";
import * as v2 from "../../packages/protocol/src/v2/index.js";
import { LocalEvidenceVerifier } from "../../apps/cli/src/evidence-local.js";
import { createIntentProject, contractBody, planBody } from "./intent-project.js";
import { flowSuccess, flowTime } from "./flow-project.js";

export const createVerificationProject = (directory: string, start = true, withDeferral = false, kind: "requirement" | "bug" = "requirement", high = false, allowedChanges?: string[]) => {
  const git = (...args: string[]) => execFileSync("git", ["-C", directory, ...args], { encoding: "utf8", windowsHide: true });
  git("init", "--quiet"); git("config", "core.autocrlf", "false"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test");
  mkdirSync(join(directory, "src")); writeFileSync(join(directory, "src", "query.ts"), "export const query = () => 1;\n"); git("add", "src/query.ts"); git("commit", "--quiet", "-m", "Fixed source for manual verification");
  const f = createIntentProject(directory, { repositoryKind: "git", databasePath: join(directory, ".git", "cimiloop", "project.db") });
  const registered = flowSuccess(f.kernel.execute(f.projectCommand("RegisterActor", { actor_type: "human", identity_source: "local_operator", display_name: "Independent reviewer" })));
  if (registered.command_type !== "RegisterActor") throw new Error("actor expected");
  const reviewer = registered.data.actor, port = new LocalEvidenceVerifier(directory, dirname(f.path));
  const kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, evidenceVerifier: port });
  const reviewerKernel = new CimiLoopKernel({ store: f.store, caller: { kind: "local_operator", project_id: f.project.id, actor_id: reviewer.id }, now: () => flowTime, evidenceVerifier: port });
  if (high) f.grant("technical_owner", reviewer.id);
  const created = flowSuccess(kernel.execute({ ...f.context(), command_type: "CreateChange", payload: { title: "真实人工证据与独立复核", kind, requirement_owner_actor_id: high ? reviewer.id : f.actor.id } })); if (created.command_type !== "CreateChange") throw new Error("change expected");
  const change = created.data.change; const contract = contractBody(); contract.acceptance_criteria[0]!.evidence_requirements = ["固定源码人工复核记录"];
  const reviewerDecision = (request: v2.DecisionRequest) => {
    const result = flowSuccess(reviewerKernel.execute({ ...f.changeCommand("RecordDecision", f.store.getChange(change.id)!, { request_id: request.id, input_digest: request.input_digest, choice: "approve", reason: "另一位具名 Human 独立复核高风险候选", conditions: [] }, request.required_role), actor_id: reviewer.id }));
    if (result.command_type !== "RecordDecision") throw new Error("decision expected"); return result.data.decision;
  };
  if (high) {
    contract.risk = { level: "high", impact_categories: ["key_compatibility"], rationale: "高风险兼容性专业复核样本" };
    const proposal = f.submitContract(change.id, contract), risk = f.assess(change.id, proposal, "high"), request = f.request(change.id, proposal, "contract", risk), decision = reviewerDecision(request);
    flowSuccess(reviewerKernel.execute({ ...f.changeCommand("ConfirmContract", f.store.getChange(change.id)!, f.confirmPayload(request, decision), "requirement_owner"), actor_id: reviewer.id }));
  } else f.prepareContract(change.id, contract);
  const body = planBody(change.id, f.store.getChange(change.id)!.contract_ref!);
  if (allowedChanges) body.task_definitions[0]!.allowed_changes = [...allowedChanges];
  for (const task of body.task_definitions) { task.verification.method = "人工源码审阅"; task.verification.evidence_requirements = ["原始人工审阅记录"]; }
  if (withDeferral) body.verification_strategy.deferred_checks = [{ acceptance_key: "A1", reason: "生产环境补充检查", arrangement: "发布后按固定方法核对", required_before: "before_change_complete" }];
  const prepareHighPlan = () => {
    const proposal = f.submitPlan(change.id, body), request = f.request(change.id, proposal, "plan"), decision = reviewerDecision(request);
    const result = flowSuccess(reviewerKernel.execute({ ...f.changeCommand("ConfirmPlan", f.store.getChange(change.id)!, f.confirmPayload(request, decision), "technical_owner"), actor_id: reviewer.id }));
    if (result.command_type !== "ConfirmPlan") throw new Error("plan expected"); return { proposal, request, decision, version: result.data.plan_version };
  };
  const plan = high ? prepareHighPlan() : f.preparePlan(change.id, body);
  flowSuccess(f.kernel.execute(f.changeCommand("InitializePlanTasks", f.store.getChange(change.id)!, { plan_ref: f.store.getChange(change.id)!.plan_ref }, "technical_owner")));
  if (start) flowSuccess(f.kernel.execute(f.changeCommand("StartChange", f.store.getChange(change.id)!, { plan_ref: f.store.getChange(change.id)!.plan_ref, opening_reason: "按固定计划开工" })));
  const task = (i = 0) => f.store.getExecutionObject("task", body.task_definitions[i]!.task_id)!;
  const taskCommand = <P>(kind: string, taskId: string, payload: P, actorId = f.actor.id, role = "executor") => ({ ...f.context(role), actor_id: actorId, command_type: kind,
    target: { object_type: "task", id: taskId }, expected_revision: f.store.getExecutionObject("task", taskId)!.revision, payload });
  const changeCommand = <P>(kind: string, payload: P) => f.changeCommand(kind, f.store.getChange(change.id)!, payload, "technical_owner");
  const authorize = (i = 0, actorId = i === 1 ? reviewer.id : f.actor.id) => {
    const target = task(i), result = flowSuccess(kernel.execute(taskCommand("CreateWorkItem", target.id, { definition_ref: target.definition_ref, executor_ref: { object_type: "actor", id: actorId },
      allowed_actions: ["read_files"], allowed_resources: ["src/query.ts"], budget: { max_attempts: 3, max_elapsed_ms: 60_000 }, stop_conditions: ["不超出人工审阅边界"], reason: "固定人工审阅授权" }, f.actor.id, "technical_owner")));
    if (result.command_type !== "CreateWorkItem") throw new Error("work expected"); return result.data.work_item;
  };
  const capture = () => {
    const result = flowSuccess(kernel.execute(changeCommand("CaptureSourceSnapshot", { commit_id: git("rev-parse", "HEAD").trim() })));
    if (result.command_type !== "CaptureSourceSnapshot") throw new Error("source expected"); return result.data.source_snapshot;
  };
  const prepare = (source: v2.SourceSnapshot, i = 0) => {
    const bound = i === 1 ? reviewerKernel : kernel, actorId = i === 1 ? reviewer.id : f.actor.id;
    const result = flowSuccess(bound.execute(taskCommand("PrepareTaskEvaluation", task(i).id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id } }, actorId)));
    if (result.command_type !== "PrepareTaskEvaluation") throw new Error("prepare expected"); return result.data;
  };
  const report = (source: v2.SourceSnapshot, requirements: v2.RequirementSetRecord, i = 0, result: v2.RawEvidenceResult["claims"][number]["result"] = "supports") => {
    const raw: v2.RawEvidenceResult = { format: "cimiloop/manual-evidence/1.0.0", producer_actor_id: i === 1 ? reviewer.id : f.actor.id, observed_at: flowTime,
      source_digest: source.source_digest, method: "实际阅读固定 src/query.ts 并对照约定；仅为人工审阅", claims: requirements.requirements.map(item => ({ ...item, result, observation: "已由具名人工检查固定源码与对应断言" })) };
    const file = join(dirname(f.path), `raw-${v2.createInternalId()}.json`); writeFileSync(file, JSON.stringify(raw));
    return { raw, file, raw_result_ref: port.importRawResult(file) };
  };
  const record = (source: v2.SourceSnapshot, rawRef: v2.Evidence["raw_result_ref"], i = 0) => (i === 1 ? reviewerKernel : kernel).execute(taskCommand("RecordEvidence", task(i).id,
    { source_snapshot_ref: { object_type: "source_snapshot", id: source.id }, raw_result_ref: rawRef }, i === 1 ? reviewer.id : f.actor.id));
  const evaluate = (prepared: ReturnType<typeof prepare>, i = 0) => (i === 1 ? reviewerKernel : kernel).execute(taskCommand("EvaluateTask", task(i).id,
    { requirement_set_ref: { object_type: "requirement_set_record", id: prepared.requirement_set.id }, ...(prepared.context ? { context_ref: { object_type: "evaluation_context", id: prepared.context.id } } : {}), input_digest: prepared.input_digest }, i === 1 ? reviewer.id : f.actor.id));
  const satisfy = (evaluation: v2.TaskEvaluation, i = 0) => kernel.execute(taskCommand("SatisfyTask", task(i).id, { evaluation_ref: { object_type: "evaluation", id: evaluation.id } }, f.actor.id, "technical_owner"));
  const finish = (source: v2.SourceSnapshot, i = 0) => { authorize(i); const prepared = prepare(source, i), raw = report(source, prepared.requirement_set, i); flowSuccess(record(source, raw.raw_result_ref, i));
    const evaluation = flowSuccess(evaluate(prepare(source, i), i)); if (evaluation.command_type !== "EvaluateTask" || evaluation.data.evaluation.purpose === "safe_integration") throw new Error("task eval expected"); flowSuccess(satisfy(evaluation.data.evaluation, i)); return { ...raw, evaluation: evaluation.data.evaluation }; };
  const deferred: v2.GateEvaluation["deferred_checks"] = withDeferral ? [{ acceptance_key: "A1", reason: "生产环境补充检查", responsible_actor_id: reviewer.id, environment: "production", next_check_at: "2026-10-04T12:00:00.000Z", method: "上线后核对同一验收场景", required_before: "before_change_complete" }] : [];
  const gateCommand = () => changeCommand("EvaluateIntegration", { source_snapshot_ref: { object_type: "source_snapshot", id: f.store.listVerificationRecords("source_snapshot", change.id).at(-1)!.id }, deferred_checks: deferred });
  const mark = (evaluation: v2.GateEvaluation) => changeCommand("MarkReadyForIntegration", { evaluation_ref: { object_type: "evaluation", id: evaluation.id }, input_digest: evaluation.input_digest, reason: "依据真实独立评价推进到待交付" });
  return { ...f, kernel, reviewerKernel, reviewer, port, git, change, plan, task, taskCommand, changeCommand, authorize, capture, prepare, report, record, evaluate, satisfy, finish, deferred, gateCommand, mark };
};
