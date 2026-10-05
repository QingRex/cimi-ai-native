import { SCHEMA_VERSION, RawProfessionalReviewSchema, RawEvidenceResultSchema, compileValidator, type AnyCommand, type Change, type CommandSuccess,
  type Decision, type DecisionRequest, type DomainError, type Evidence, type Project, type RawProfessionalReview, type RawEvidenceResult } from "@cimiloop/protocol/v2";
import type { StoreTransaction } from "@cimiloop/store";
import { admissionFailure, contentDigest, IntentFailure, requestIsCurrent, type IntentContext } from "./intent.js";
import type { EvidenceVerifierPort } from "./verification.js";
import { conditionInput, independentProfessional, integrationInput, invalidationInput, reviewAssignment, reviewEqual as equal, sameEvidenceBaseline } from "./review-facts.js";

type Command = Extract<AnyCommand, { command_type: "RequestDecision" | "RecordDecision" }>;
function fail(command: { correlation_id: string }, code: DomainError["code"], message: string): never {
  throw new IntentFailure({ schema_version: SCHEMA_VERSION, code, message, category: "conflict", retryable: false, details: {}, correlation_id: command.correlation_id });
}
const instant = (value: string) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === (value.length === 20 ? value.replace("Z", ".000Z") : value);
export const verifyReviewRaw = (command: { correlation_id: string }, decision: Decision, project: Project, port: EvidenceVerifierPort | undefined) => {
  if (!port || !decision.review) fail(command, "EVIDENCE_MISSING", "专业复核的可信原始报告尚未接通或缺失");
  try {
    const raw = compileValidator<RawProfessionalReview>(RawProfessionalReviewSchema)(port!.readRawResult(project, decision.review!.raw_result_ref));
    if (!equal(raw, decision.review!.report)) fail(command, "BASELINE_MISMATCH", "专业复核原始报告与不可变决定不一致");
  } catch (error) { if (error instanceof IntentFailure) throw error; fail(command, "EVIDENCE_MISSING", "专业复核原始报告缺失、摘要不符或结构无效"); }
};
const verifyEvidence = (command: Command, evidence: Evidence, tx: StoreTransaction, context: IntentContext, port: EvidenceVerifierPort) => {
  const source = tx.getVerificationRecord("source_snapshot", evidence.source_snapshot_ref.id);
  try {
    const raw = compileValidator<RawEvidenceResult>(RawEvidenceResultSchema)(port.readRawResult(context.project, evidence.raw_result_ref));
    if (!source || !equal(port.sourceDigest(context.project, source.commit_id), source.source_digest) || !equal(raw.source_digest, source.source_digest) ||
      raw.producer_actor_id !== evidence.producer_actor_id || raw.observed_at !== evidence.observed_at || !equal(raw.claims, evidence.claims)) fail(command, "BASELINE_MISMATCH", "处置证据的源码、身份或原始断言不一致");
  } catch (error) { if (error instanceof IntentFailure) throw error; fail(command, "EVIDENCE_MISSING", "不能处置缺失或无法核验的原始证据"); }
};
const binding = (tx: StoreTransaction, command: Command, change: Change, request: Pick<DecisionRequest, "action" | "target_ref" | "professional_subject_ref">, context: IntentContext, port: EvidenceVerifierPort) => {
  const subject = request.professional_subject_ref;
  if (!subject) fail(command, "INVALID_COMMAND", "专业决定必须绑定精确复核对象");
  if (request.action === "verify_decision_conditions") {
    if (change.operating_status !== "Active" || !["Draft", "IntentReady"].includes(change.lifecycle_state) || subject!.object_type !== "decision") fail(command, "CHANGE_STATE_INVALID", "批准条件只在正式确认之前核验");
    const parent = tx.getIntentRecord("decision", subject!.id), original = parent ? tx.getIntentRecord("decision_request", parent.request_id) : undefined;
    if (!parent || !original || !["confirm_contract", "confirm_plan"].includes(original.action) || parent.choice !== "approve" || !parent.conditions.length ||
      parent.project_id !== change.project_id || parent.change_id !== change.id || !equal(parent.target_ref, request.target_ref) || !equal(parent.input_digest, original.input_digest) ||
      !requestIsCurrent(tx, change, original, context.now)) fail(command, "DECISION_STALE", "原批准、条件、候选或确认请求已失效");
    return { digest: conditionInput(tx, parent!), role: original!.required_role, risk: original!.risk_ref, parent: parent! };
  }
  if (change.operating_status !== "Active" || change.lifecycle_state !== "Executing") fail(command, "CHANGE_STATE_INVALID", "集成复核与证据处置需要未暂停的执行中需求");
  const admission = admissionFailure(tx, command, change); if (admission) throw new IntentFailure(admission);
  const contract = tx.getIntentRecord("contract_version", change.contract_ref!.id)!;
  if (!equal(request.target_ref, contract.proposal_ref)) fail(command, "BASELINE_MISMATCH", "专业复核须绑定当前正式约定的精确候选");
  if (request.action === "confirm_integration") {
    const gate = subject!.object_type === "evaluation" ? tx.getVerificationRecord("evaluation", subject!.id) : undefined;
    if (!gate || gate.purpose !== "safe_integration" || gate.project_id !== change.project_id || gate.change_id !== change.id || gate.outcome !== "REQUIRE_HUMAN" || gate.reasons.length !== 1 ||
      tx.getIntentRecord("risk_assessment", contract.risk_ref.id)?.level !== "high" || !equal(gate.contract_ref, change.contract_ref) || !equal(gate.plan_ref, change.plan_ref)) fail(command, "DECISION_STALE", "只能复核证据检查已经通过、仅待高风险决定的本需求集成评价");
    const source = tx.getVerificationRecord("source_snapshot", gate!.source_snapshot_ref.id)!;
    const digest = source ? integrationInput(tx, change, source, gate!.deferred_checks) : contentDigest(null);
    if (!source || !equal(gate!.input_digest, digest) || gate!.deferred_checks.some(item => Date.parse(item.next_check_at) <= Date.parse(context.now))) fail(command, "DECISION_STALE", "集成输入或延期检查期限已变化");
    try { if (!equal(port.sourceDigest(context.project, source.commit_id), source.source_digest) || !port.sourceIsCurrent(context.project, source)) fail(command, "BASELINE_MISMATCH", "专业集成决定须核对当前干净源码"); }
    catch (error) { if (error instanceof IntentFailure) throw error; fail(command, "EVIDENCE_MISSING", "无法核对专业集成复核源码"); }
    tx.listVerificationRecords("evidence", change.id).filter(item => item.source_snapshot_ref.id === source.id).forEach(item => verifyEvidence(command, item, tx, context, port));
    return { digest, role: "quality_owner" as const, risk: contract.risk_ref, gate: gate! };
  }
  if (request.action !== "invalidate_evidence" || subject!.object_type !== "evidence") fail(command, "INVALID_COMMAND", "专业动作与复核对象类型不匹配");
  const evidence = tx.getVerificationRecord("evidence", subject!.id);
  if (!evidence || evidence.project_id !== change.project_id || evidence.change_id !== change.id || !equal(evidence.contract_ref, change.contract_ref) || !equal(evidence.plan_ref, change.plan_ref)) fail(command, "BASELINE_MISMATCH", "证据不适用于当前约定与计划");
  verifyEvidence(command, evidence!, tx, context, port);
  return { digest: invalidationInput(tx, change, evidence!), role: "quality_owner" as const, risk: contract.risk_ref, evidence: evidence! };
};
export const executeReview = (tx: StoreTransaction, command: Command, context: IntentContext, port: EvidenceVerifierPort | undefined): { event_type: string; aggregate: CommandSuccess["aggregate"]; revision: number; data: CommandSuccess["data"]; payload: Record<string, unknown> } => {
  const change = tx.getChange(command.target.id);
  if (!change || change.project_id !== context.project.id) fail(command, "CHANGE_NOT_FOUND", "未找到本项目需求");
  if (change!.revision !== command.expected_revision) fail(command, "REVISION_CONFLICT", "Change已变化");
  if (!port) fail(command, "CAPABILITY_UNAVAILABLE", "专业复核需要可信原始报告核验器");
  const current = change!, meta = { schema_version: SCHEMA_VERSION, id: context.id(), project_id: current.project_id, change_id: current.id, created_at: context.now, producer_actor_id: context.actorId };
  const mutation = (event_type: string, extra: Record<string, unknown>) => ({ event_type, aggregate: { object_type: "change" as const, id: current.id }, revision: current.revision,
    payload: extra, data: { change: current, ...extra } as CommandSuccess["data"] });
  if (command.command_type === "RequestDecision") {
    const request = { ...meta, scope: { kind: "change" as const, id: current.id }, action: command.payload.action, target_ref: command.payload.proposal_ref,
      ...(command.payload.professional_subject_ref ? { professional_subject_ref: command.payload.professional_subject_ref } : {}), expected_revision: current.revision, input_refs: [command.payload.proposal_ref, ...(command.payload.professional_subject_ref ? [command.payload.professional_subject_ref] : [])],
      input_digest: contentDigest(null), required_role: "quality_owner" as DecisionRequest["required_role"], expires_at: command.payload.expires_at ?? new Date(Date.parse(context.now) + 15 * 60_000).toISOString(),
      policy_version: "professional-review/1.0.0" as const };
    const bound = binding(tx, command, current, request, context, port!);
    const requesterRole = request.action === "verify_decision_conditions" ? bound.role : "technical_owner";
    if (command.acting_role !== requesterRole || !reviewAssignment(tx, current, context.actorId, requesterRole, context.now) || (bound.parent && bound.parent.actor_id !== context.actorId)) fail(command, "ROLE_NOT_ASSIGNED", "请求须由实际责任人提出；条件复核须由原批准人提出");
    if (!instant(request.expires_at) || Date.parse(request.expires_at) <= Date.parse(context.now) || Date.parse(request.expires_at) > Date.parse(context.now) + 86_400_000) fail(command, "INVALID_COMMAND", "请求期限须为未来有效UTC时间且不超过24小时");
    if (command.payload.risk_ref && !equal(command.payload.risk_ref, bound.risk)) fail(command, "INPUT_CHANGED", "风险依据与复核对象不同");
    const actual: DecisionRequest = { ...request, input_digest: bound.digest, required_role: bound.role, ...(bound.risk ? { risk_ref: bound.risk } : {}) };
    tx.insertIntentRecord("decision_request", actual); return mutation("DecisionRequested", { request: actual });
  }
  const request = tx.getIntentRecord("decision_request", command.payload.request_id);
  if (!request || request.project_id !== current.project_id || request.change_id !== current.id || request.policy_version !== "professional-review/1.0.0") fail(command, "DECISION_NOT_FOUND", "未找到本需求专业复核请求");
  const actual = request!, bound = binding(tx, command, current, actual, context, port!);
  if (actual.expected_revision !== current.revision || !instant(actual.expires_at) || Date.parse(context.now) >= Date.parse(actual.expires_at) || !equal(bound.digest, actual.input_digest) ||
    !equal(command.payload.input_digest, actual.input_digest) || (command.expected_input_digest && !equal(command.expected_input_digest, actual.input_digest)) || actual.required_role !== bound.role || !equal(actual.risk_ref, bound.risk)) fail(command, "DECISION_STALE", "专业复核的输入、风险、职责或期限已变化");
  const assignment = command.acting_role === actual.required_role ? reviewAssignment(tx, current, context.actorId, actual.required_role, context.now) : undefined;
  if (!assignment) fail(command, "ROLE_NOT_ASSIGNED", "需要实际 Human 专业职责及当前有效指派");
  if ((bound.parent && bound.parent.actor_id !== context.actorId) || (!bound.parent && !independentProfessional(tx, current, context.actorId, bound.evidence?.producer_actor_id ?? bound.gate!.producer_actor_id))) fail(command, "INDEPENDENCE_REQUIRED", "专业集成与证据处置须独立于实施者及被复核证据的生产者");
  if (tx.listIntentRecords("decision", current.id).some(item => item.request_id === actual.id)) fail(command, "DECISION_ALREADY_RECORDED", "请求已作决定；调整须提出新请求");
  if (command.payload.conditions.length) fail(command, "INVALID_COMMAND", "专业复核不能以新增条件替代当前检查；有条件意见须选择request_changes");
  let report: RawProfessionalReview | undefined;
  if (command.payload.raw_review_ref) {
    try { report = compileValidator<RawProfessionalReview>(RawProfessionalReviewSchema)(port!.readRawResult(context.project, command.payload.raw_review_ref)); }
    catch { fail(command, "EVIDENCE_MISSING", "专业原始报告缺失、摘要不符或结构无效"); }
    if (report!.producer_actor_id !== context.actorId || !equal(report!.request_input_digest, actual.input_digest) || !instant(report!.observed_at) || Date.parse(report!.observed_at) < Date.parse(actual.created_at) || Date.parse(report!.observed_at) > Date.parse(context.now)) fail(command, "BASELINE_MISMATCH", "专业原始报告的身份、输入或观察时间不符");
    const finding = report!.finding;
    if (bound.parent) {
      if (finding.kind !== "condition_verification" || new Set(finding.results.map(item => item.condition_index)).size !== finding.results.length || finding.results.some(item => bound.parent!.conditions[item.condition_index] !== item.condition)) fail(command, "BASELINE_MISMATCH", "条件序号、文字或报告类型与原批准不同");
      if (command.payload.choice === "approve" && finding.results.some(item => item.result !== "supports")) fail(command, "DECISION_NOT_APPROVED", "未知或否定的条件不能核验为通过");
    } else if (bound.evidence) {
      if (finding.kind !== "evidence_invalidation") fail(command, "BASELINE_MISMATCH", "证据处置需要记录方法、观察或断言的具体缺陷");
      const corrections = finding.correction_evidence_refs.map(ref => tx.getVerificationRecord("evidence", ref.id));
      if (corrections.some(item => !item || !sameEvidenceBaseline(bound.evidence!, item) || item.producer_actor_id === context.actorId)) fail(command, "INDEPENDENCE_REQUIRED", "纠正证据须同任务同源码，且不能由处置决定者自产自批");
      corrections.forEach(item => verifyEvidence(command, item!, tx, context, port!));
      const corrected = finding.claim_keys.every(key => bound.evidence!.claims.some(claim => claim.key === key && claim.result !== "supports" &&
        corrections.some(item => item!.claims.some(other => other.key === key && other.description === claim.description && other.result === "supports"))));
      if (!corrected) fail(command, "EVIDENCE_MISSING", "每项失效反证或未知断言都需要适用的纠正观察；风险接受不能替代证据处置");
    } else {
      if (finding.kind !== "integration_review") fail(command, "BASELINE_MISMATCH", "高风险集成需要对应的安全集成专业报告");
      if (command.payload.choice === "approve" && finding.result !== "supports") fail(command, "DECISION_NOT_APPROVED", "否定或未知的专业结论不能批准集成");
    }
  } else if (command.payload.choice === "approve") fail(command, "EVIDENCE_MISSING", "专业批准必须附实际原始复核报告");
  const decision: Decision = { ...meta, request_id: actual.id, target_ref: actual.target_ref, input_digest: actual.input_digest, actor_id: context.actorId,
    acting_role: command.acting_role, assignment_ref: { object_type: "assignment", id: assignment!.id }, choice: command.payload.choice, reason: command.payload.reason,
    conditions: [], decided_at: context.now, ...(report ? { review: { raw_result_ref: command.payload.raw_review_ref!, report } } : {}) };
  tx.insertIntentRecord("decision", decision); return mutation("DecisionRecorded", { decision });
};
