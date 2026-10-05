import { SCHEMA_VERSION, type AnyCommand, type Assignment, type Change, type CommandSuccess, type ContractBody, type ContractProposal,
  type ContractVersion, type Decision, type DecisionRequest, type Digest, type DomainError,
  type InternalId, type LifecycleTransitionRecord, type PlanBody, type PlanProposal, type PlanVersion, type Project, type RiskAssessment } from "@cimiloop/protocol/v2";
import type { IntentReader, StoreTransaction } from "@cimiloop/store";
import { assignmentIsEffective } from "./authorization.js";
import { requestDigest } from "./canonical.js";
import { conditionProofs, professionalAction } from "./review-facts.js";
import { verifyReviewRaw } from "./review.js";
import type { EvidenceVerifierPort } from "./verification.js";

export class IntentFailure extends Error {
  constructor(readonly result: DomainError) { super(result.message); }
}
type IntentCommand = Extract<AnyCommand, { command_type: "SubmitContractProposal" | "SubmitPlanProposal" | "RecordRiskAssessment" | "RequestDecision" | "RecordDecision" | "ConfirmContract" | "ConfirmPlan" }>;
export interface IntentContext { project: Project; actorId: InternalId; now: string; id: () => InternalId }
interface Mutation { event_type: string; payload: Record<string, unknown>; aggregate: CommandSuccess["aggregate"]; revision: number; data: CommandSuccess["data"] }
type IntentReadPort = Pick<StoreTransaction, "getIntentRecord" | "listIntentRecords" | "getChange" | "listChanges" | "getActor" | "listAssignments">;
export const contentDigest = (body: unknown): Digest => ({ algorithm: "sha256", value: requestDigest(body) });
const equal = (left: unknown, right: unknown): boolean => requestDigest(left ?? null) === requestDigest(right ?? null);
const validInstant = (value: string) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === (value.length === 20 ? value.replace("Z", ".000Z") : value);
const critical = (body: ContractBody) => body.risk.level === "high" || body.risk.impact_categories.some(category => category !== "other");
const reject = (command: { correlation_id: string }, code: DomainError["code"], message: string, details: Record<string, unknown> = {}, category: DomainError["category"] = "conflict"): never => {
  throw new IntentFailure({ schema_version: SCHEMA_VERSION, correlation_id: command.correlation_id, code, message, details, category, retryable: false });
};
const meta = (change: Change, context: IntentContext) => ({ schema_version: SCHEMA_VERSION, id: context.id(), project_id: change.project_id,
  change_id: change.id, created_at: context.now, producer_actor_id: context.actorId });
const roleAssignment = (tx: IntentReadPort, change: Change, actorId: InternalId, role: "change_owner" | "requirement_owner" | "technical_owner", now: string): Assignment | undefined => {
  if (tx.getActor(actorId)?.actor_type !== "human" || (role === "change_owner" && change.owner_actor_id !== actorId) ||
    (role === "requirement_owner" && change.requirement_owner_actor_id !== actorId)) return undefined;
  return tx.listAssignments(actorId).find(assignment => assignment.project_id === change.project_id && assignment.role_key === role && assignmentIsEffective(assignment, now) &&
    ((assignment.scope.kind === "change" && assignment.scope.id === change.id) || (role === "technical_owner" && assignment.scope.kind === "project" && assignment.scope.id === change.project_id)));
};
const requireRole = (tx: StoreTransaction, command: Exclude<AnyCommand, { command_type: "InitializeProject" }>, change: Change,
  role: "change_owner" | "requirement_owner" | "technical_owner", context: IntentContext): Assignment => {
  const assignment = command.acting_role === role ? roleAssignment(tx, change, context.actorId, role, context.now) : undefined;
  if (!assignment) reject(command, "ROLE_NOT_ASSIGNED", `需要当前 Human ${role} 及独立有效指派`, {}, "forbidden");
  return assignment!;
};
const editable = (command: { correlation_id: string }, change: Change) => {
  if (change.operating_status !== "Active" || !["Draft", "IntentReady"].includes(change.lifecycle_state)) reject(command, "CHANGE_STATE_INVALID", "当前只确认未暂停、尚未开工的约定与计划；在途执行调整须接入受控处置");
};
const unique = (values: string[]): boolean => new Set(values).size === values.length;
const contractProblem = (body: ContractBody): string | undefined => {
  if (body.unresolved_questions.length) return "关键歧义仍未解决";
  if (!unique(body.acceptance_criteria.map(item => item.key)) || !unique(body.knowledge_impact.map(item => item.key))) return "验收 / 知识义务 key 必须唯一";
  if (body.knowledge_impact.some(item => item.required_before === "none")) return "知识影响必须说明完成时点";
};
const graphCycle = (graph: Map<string, string[]>): boolean => {
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true; if (visited.has(id)) return false;
    visiting.add(id); if ((graph.get(id) ?? []).some(visit)) return true;
    visiting.delete(id); visited.add(id); return false;
  };
  return [...graph.keys()].some(visit);
};
export const planProblem = (body: PlanBody, contract: ContractVersion, change: Change, reader: IntentReader & { getChange(id: string): Change | undefined; listChanges(): Change[] }): string | undefined => {
  const tasks = body.task_definitions, ids = tasks.map(task => task.task_id), keys = new Set(contract.body.acceptance_criteria.map(item => item.key));
  if (!unique(ids) || tasks.some(task => task.scope.kind !== "change" || task.scope.id !== change.id || task.dependencies.some(id => !ids.includes(id)))) return "任务ID、作用域或依赖引用无效";
  if (graphCycle(new Map(tasks.map(task => [task.task_id, task.dependencies])))) return "任务依赖存在环";
  if (!tasks.some(task => task.purpose === "implementation" && task.allowed_changes.length) || !tasks.some(task => task.purpose === "verification" && task.verification.mode === "independent")) return "缺少有界实施任务或独立验证安排";
  if (tasks.some(task => task.verification.acceptance_keys.some(key => !keys.has(key))) ||
    [...keys].some(key => !tasks.some(task => task.purpose === "verification" && task.verification.mode === "independent" && task.verification.acceptance_keys.includes(key)))) return "验收缺少独立验证覆盖或引用未知验收项";
  if (body.verification_strategy.deferred_checks.some(check => !keys.has(check.acceptance_key) || check.required_before === "none")) return "延期检查缺少有效验收项或完成时点";
  const knowledgeKeys = new Set(contract.body.knowledge_impact.map(item => item.key));
  if (tasks.some(task => task.knowledge_keys.some(key => !knowledgeKeys.has(key))) || contract.body.knowledge_impact.some(impact =>
    !tasks.some(task => ["knowledge", "synchronization"].includes(task.purpose) && task.knowledge_keys.includes(impact.key) && task.closure_requirement === impact.required_before))) return "知识 / 同步义务没有对应任务与关闭时点";
  for (const old of reader.listIntentRecords("plan_version", change.id)) for (const task of tasks) {
    const prior = old.body.task_definitions.find(item => item.task_id === task.task_id && item.version === task.version);
    if (prior && !equal(prior, task)) return "固定TaskDefinition版本不能改变内容";
  }
  if (!unique(body.dependencies.map(item => item.change_id))) return "需求依赖重复";
  const graph = new Map<string, string[]>();
  for (const other of reader.listChanges()) {
    if (!other.plan_ref) continue;
    const plan = reader.getIntentRecord("plan_version", other.plan_ref.id);
    if (!plan || plan.change_id !== other.id || plan.project_id !== change.project_id || plan.version !== other.plan_ref.domain_version) return "现有依赖计划指针无效";
    graph.set(other.id, plan.body.dependencies.map(item => item.change_id));
  }
  for (const dependency of body.dependencies) {
    const other = reader.getChange(dependency.change_id), fixed = reader.getIntentRecord("contract_version", dependency.contract_ref.id);
    if (!other || other.project_id !== change.project_id || other.id === change.id || !equal(other.contract_ref, dependency.contract_ref) ||
      !fixed || fixed.change_id !== other.id || fixed.project_id !== change.project_id || fixed.version !== dependency.contract_ref.domain_version) return "需求依赖必须固定同项目真实当前Contract";
  }
  graph.set(change.id, body.dependencies.map(item => item.change_id));
  if (graphCycle(graph)) return "需求依赖存在环";
};

const resolveProposal = (tx: IntentReadPort, command: { correlation_id: string }, change: Change, ref: DecisionRequest["target_ref"]): ContractProposal | PlanProposal => {
  const proposal = ref.object_type === "contract_proposal" ? tx.getIntentRecord("contract_proposal", ref.id) : tx.getIntentRecord("plan_proposal", ref.id);
  if (!proposal || proposal.project_id !== change.project_id || proposal.change_id !== change.id || proposal.proposal_revision !== ref.domain_version) reject(command, "PROPOSAL_NOT_FOUND", "未找到本需求的精确候选修订");
  const latest = tx.listIntentRecords(ref.object_type, change.id).at(-1);
  if (latest?.id !== ref.id || !equal(proposal!.content_digest, contentDigest(proposal!.body)) ||
    !equal(proposal!.base_version_ref, ref.object_type === "contract_proposal" ? change.contract_ref : change.plan_ref)) reject(command, "DECISION_STALE", "候选、摘要或正式基准已变化");
  if (ref.object_type === "plan_proposal" && !equal((proposal as PlanProposal).body.contract_ref, change.contract_ref)) reject(command, "DECISION_STALE", "计划绑定的Contract已变化");
  return proposal!;
};
const requestInput = (change: Change, proposal: ContractProposal | PlanProposal, request: Pick<DecisionRequest, "action" | "target_ref" | "risk_ref">) => contentDigest({
  policy_version: "intent-confirmation/1.0.0", change_id: change.id, revision: change.revision,
  requirement_owner_actor_id: change.requirement_owner_actor_id ?? null, contract_ref: change.contract_ref ?? null,
  plan_ref: change.plan_ref ?? null, action: request.action, target_ref: request.target_ref, content_digest: proposal.content_digest, risk_ref: request.risk_ref ?? null
});
const riskForRequest = (tx: IntentReadPort, command: { correlation_id: string }, change: Change, request: Pick<DecisionRequest, "action" | "target_ref" | "risk_ref">, now: string): RiskAssessment => {
  const risk = request.risk_ref ? tx.getIntentRecord("risk_assessment", request.risk_ref.id) : undefined;
  if (!risk || risk.change_id !== change.id || risk.project_id !== change.project_id) reject(command, "RISK_ASSESSMENT_REQUIRED", "需要本需求真实风险判断");
  if (request.action === "confirm_contract") {
    const proposal = resolveProposal(tx, command, change, request.target_ref);
    const latest = tx.listIntentRecords("risk_assessment", change.id).filter(item => item.subject_refs[0]?.id === proposal.id).at(-1);
    const role = roleAssignment(tx, change, risk!.producer_actor_id, "technical_owner", now);
    if (latest?.id !== risk!.id || !equal(risk!.subject_refs[0], request.target_ref) || !equal(risk!.input_digest, proposal.content_digest) || role?.id !== risk!.assignment_ref.id) reject(command, "DECISION_STALE", "风险依据、精确候选或专业指派已变化");
  } else {
    const contract = currentContract(tx, change);
    if (!contract || contract.risk_ref.id !== risk!.id) reject(command, "DECISION_STALE", "计划风险依据不属于当前正式约定");
  }
  return risk!;
};
export const requestIsCurrent = (tx: IntentReadPort, change: Change, request: DecisionRequest, now: string): boolean => {
  try {
    if (professionalAction(request.action)) return false;
    if (!validInstant(request.expires_at) || Date.parse(now) >= Date.parse(request.expires_at) || request.expected_revision !== change.revision) return false;
    const proposal = resolveProposal(tx, { correlation_id: request.id }, change, request.target_ref);
    riskForRequest(tx, { correlation_id: request.id }, change, request, now);
    return equal(request.input_digest, requestInput(change, proposal, request));
  } catch (error) { if (error instanceof IntentFailure) return false; throw error; }
};
export const lifecycleRecord = (change: Change, toState: Change["lifecycle_state"], command: Extract<AnyCommand, { command_type: "ConfirmContract" | "StartChange" }>, context: IntentContext, reason: string, basisRefs: LifecycleTransitionRecord["basis_refs"]): LifecycleTransitionRecord => ({
  ...meta(change, context), command_id: command.command_id, from_state: change.lifecycle_state, to_state: toState,
  actor_id: context.actorId, acting_role: command.acting_role, reason, basis_refs: basisRefs
});

export const executeIntent = (tx: StoreTransaction, command: IntentCommand, context: IntentContext, port?: EvidenceVerifierPort): Mutation => {
  const change = tx.getChange(command.target.id);
  if (!change || change.project_id !== context.project.id) reject(command, "CHANGE_NOT_FOUND", "未找到当前Project Change", {}, "not_found");
  if (change!.revision !== command.expected_revision) reject(command, "REVISION_CONFLICT", "Change已变化", { current_revision: change!.revision });
  const current = change!; editable(command, current);
  const mutation = (eventType: string, extra: Record<string, unknown>, next = current, payload = extra): Mutation => {
    if (next !== current) tx.updateChange(next, current.revision);
    return { event_type: eventType, payload, aggregate: { object_type: "change", id: current.id }, revision: next.revision, data: { change: next, ...extra } as CommandSuccess["data"] };
  };
  if (command.command_type === "SubmitContractProposal" || command.command_type === "SubmitPlanProposal") {
    const isContract = command.command_type === "SubmitContractProposal", kind = isContract ? "contract_proposal" : "plan_proposal";
    requireRole(tx, command, current, isContract ? "change_owner" : "technical_owner", context);
    if (!equal(command.payload.base_version_ref, isContract ? current.contract_ref : current.plan_ref)) reject(command, "INPUT_CHANGED", "候选正式基准不是当前版本");
    if (!isContract) {
      const contract = currentContract(tx, current);
      if (!contract || current.lifecycle_state !== "IntentReady" || !equal((command.payload.body as PlanBody).contract_ref, current.contract_ref)) reject(command, "CONTRACT_NOT_FOUND", "计划必须绑定真实当前正式约定");
    }
    const latest = tx.listIntentRecords(kind, current.id).at(-1), sameChain = command.payload.proposal_id !== undefined;
    if (sameChain && (latest?.proposal_id !== command.payload.proposal_id || command.payload.expected_proposal_revision !== latest?.proposal_revision)) reject(command, "PROPOSAL_REVISION_CONFLICT", "候选修订基准已变化");
    if (!sameChain && command.payload.expected_proposal_revision !== undefined && command.payload.expected_proposal_revision !== 0) reject(command, "PROPOSAL_REVISION_CONFLICT", "新候选期望修订只能是0");
    const proposal = { ...meta(current, context), proposal_id: command.payload.proposal_id ?? context.id(), proposal_revision: sameChain ? latest!.proposal_revision + 1 : 1,
      content_digest: contentDigest(command.payload.body), base_version_ref: command.payload.base_version_ref, body: command.payload.body,
      ...(sameChain ? { predecessor_ref: { object_type: kind, id: latest!.id, domain_version: latest!.proposal_revision } } : {}) };
    if (isContract) tx.insertIntentRecord("contract_proposal", proposal as ContractProposal); else tx.insertIntentRecord("plan_proposal", proposal as PlanProposal);
    return mutation(isContract ? "ContractProposalSubmitted" : "PlanProposalSubmitted", { proposal }, { ...current, revision: current.revision + 1, updated_at: context.now });
  }
  if (command.command_type === "RecordRiskAssessment") {
    const assignment = requireRole(tx, command, current, "technical_owner", context), proposal = resolveProposal(tx, command, current, command.payload.proposal_ref) as ContractProposal;
    const priorHigh = tx.listIntentRecords("risk_assessment", current.id).some(risk => risk.level === "high");
    if (command.payload.level === "ordinary" && (critical(proposal.body) || priorHigh)) reject(command, "RISK_DOWNGRADE_FORBIDDEN", "关键影响或既有高风险不能自行降级；专业降低风险决定尚未接通");
    const risk: RiskAssessment = { ...meta(current, context), scope: { kind: "change", id: current.id }, subject_refs: [command.payload.proposal_ref],
      input_digest: proposal.content_digest, level: command.payload.level, impact_categories: proposal.body.risk.impact_categories,
      rationale: command.payload.rationale, assignment_ref: { object_type: "assignment", id: assignment.id } };
    tx.insertIntentRecord("risk_assessment", risk); return mutation("RiskAssessed", { risk_assessment: risk });
  }
  if (command.command_type === "RequestDecision") {
    if (professionalAction(command.payload.action) || command.payload.professional_subject_ref) reject(command, "INVALID_COMMAND", "约定与计划确认不能混入专业复核对象");
    const action = command.payload.action, contractAction = action === "confirm_contract";
    requireRole(tx, command, current, contractAction ? "change_owner" : "technical_owner", context);
    if (command.payload.proposal_ref.object_type !== (contractAction ? "contract_proposal" : "plan_proposal")) reject(command, "PROPOSAL_INVALID", "确认动作与候选类型不匹配");
    const proposal = resolveProposal(tx, command, current, command.payload.proposal_ref);
    const contract = currentContract(tx, current);
    const riskRef = contractAction ? command.payload.risk_ref : contract?.risk_ref;
    const request: DecisionRequest = { ...meta(current, context), scope: { kind: "change", id: current.id }, action,
      target_ref: command.payload.proposal_ref, expected_revision: current.revision,
      input_refs: [command.payload.proposal_ref, ...(current.contract_ref ? [current.contract_ref] : []), ...(riskRef ? [riskRef] : [])],
      input_digest: contentDigest(null), required_role: contractAction ? "requirement_owner" : "technical_owner",
      expires_at: command.payload.expires_at ?? new Date(Date.parse(context.now) + 15 * 60_000).toISOString(), policy_version: "intent-confirmation/1.0.0", ...(riskRef ? { risk_ref: riskRef } : {}) };
    if (!validInstant(request.expires_at) || Date.parse(request.expires_at) <= Date.parse(context.now) || Date.parse(request.expires_at) > Date.parse(context.now) + 86_400_000) reject(command, "INVALID_COMMAND", "决定请求期限须为未来有效UTC时间且不超过24小时");
    riskForRequest(tx, command, current, request, context.now);
    if (contractAction) {
      const problem = contractProblem((proposal as ContractProposal).body); if (problem) reject(command, "PROPOSAL_INVALID", problem);
      if (!current.requirement_owner_actor_id || !roleAssignment(tx, current, current.requirement_owner_actor_id, "requirement_owner", context.now)) reject(command, "HUMAN_RESPONSIBILITY_REQUIRED", "确认约定前须有当前需求验收责任人");
    } else {
      if (command.payload.risk_ref && !equal(command.payload.risk_ref, riskRef)) reject(command, "INPUT_CHANGED", "计划风险引用与当前约定不符");
      const problem = planProblem((proposal as PlanProposal).body, contract!, current, tx); if (problem) reject(command, "PLAN_INVALID", problem);
    }
    request.input_digest = requestInput(current, proposal, request);
    tx.insertIntentRecord("decision_request", request); return mutation("DecisionRequested", { request });
  }
  const requestId = command.command_type === "RecordDecision" ? command.payload.request_id : command.payload.decision_request_ref.id;
  const request = tx.getIntentRecord("decision_request", requestId);
  if (!request || request.project_id !== current.project_id || request.change_id !== current.id) reject(command, "DECISION_NOT_FOUND", "未找到本需求的决定请求");
  const actualRequest = request!;
  if (!requestIsCurrent(tx, current, actualRequest, context.now) || !equal(command.payload.input_digest, actualRequest.input_digest) ||
    (command.expected_input_digest && !equal(command.expected_input_digest, actualRequest.input_digest))) reject(command, "DECISION_STALE", "决定输入、候选、风险、基准或期限已变化");
  if (actualRequest.required_role === "quality_owner" || professionalAction(actualRequest.action) || actualRequest.professional_subject_ref || actualRequest.policy_version !== "intent-confirmation/1.0.0") reject(command, "DECISION_STALE", "确认请求的动作、专业职责或策略不适用");
  const assignment = requireRole(tx, command, current, actualRequest.required_role === "requirement_owner" ? "requirement_owner" : "technical_owner", context);
  const risk = riskForRequest(tx, command, current, actualRequest, context.now), proposal = resolveProposal(tx, command, current, actualRequest.target_ref);
  if (risk.level === "high" && (actualRequest.action === "confirm_contract" ? risk.producer_actor_id === context.actorId : proposal.producer_actor_id === context.actorId)) reject(command, "INDEPENDENCE_REQUIRED", "高风险需要另一位实际Human承担相应专业复核，不因同人兼任豁免", {}, "forbidden");
  if (command.command_type === "RecordDecision") {
    if (command.payload.raw_review_ref) reject(command, "INVALID_COMMAND", "确认决定的条件须通过独立条件复核请求核验");
    if (tx.listIntentRecords("decision", current.id).some(item => item.request_id === actualRequest.id)) reject(command, "DECISION_ALREADY_RECORDED", "请求已作决定；调整意见须基于新的请求");
    const decision: Decision = { ...meta(current, context), request_id: actualRequest.id, target_ref: actualRequest.target_ref,
      input_digest: actualRequest.input_digest, actor_id: context.actorId, acting_role: command.acting_role,
      assignment_ref: { object_type: "assignment", id: assignment.id }, choice: command.payload.choice, reason: command.payload.reason,
      conditions: command.payload.conditions, decided_at: context.now };
    tx.insertIntentRecord("decision", decision); return mutation("DecisionRecorded", { decision });
  }
  if (actualRequest.action !== (command.command_type === "ConfirmContract" ? "confirm_contract" : "confirm_plan") || !equal(command.payload.proposal_ref, actualRequest.target_ref)) reject(command, "DECISION_STALE", "确认动作或精确候选与决定请求不同");
  const decision = tx.getIntentRecord("decision", command.payload.decision_ref.id);
  if (!decision || decision.change_id !== current.id || decision.project_id !== current.project_id || decision.request_id !== actualRequest.id ||
    !equal(decision.target_ref, actualRequest.target_ref) || !equal(decision.input_digest, actualRequest.input_digest)) reject(command, "DECISION_NOT_FOUND", "未找到匹配的精确决定");
  if (decision!.actor_id !== context.actorId || decision!.assignment_ref.id !== assignment.id || !assignmentIsEffective(assignment, context.now)) reject(command, "AUTHORIZATION_REVOKED", "决定者与当前有效指派不符", {}, "forbidden");
  if (decision!.choice !== "approve") reject(command, "DECISION_NOT_APPROVED", "请求没有得到批准；拒绝不自动取消需求");
  const proofs = conditionProofs(tx, decision!, context.now);
  if (!proofs) reject(command, "EVIDENCE_MISSING", "批准条件尚未逐项核验，或仍有否定与未知的条件结论");
  proofs!.forEach(proof => verifyReviewRaw(command, proof, context.project, port));
  const conditionRefs = proofs!.length ? { condition_verification_refs: proofs!.map(proof => ({ object_type: "decision" as const, id: proof.id })) } : {};
  if (command.command_type === "ConfirmContract") {
    const body = (proposal as ContractProposal).body, problem = contractProblem(body); if (problem) reject(command, "PROPOSAL_INVALID", problem);
    const version: ContractVersion = { ...meta(current, context), version: (tx.listIntentRecords("contract_version", current.id).at(-1)?.version ?? 0) + 1,
      proposal_ref: actualRequest.target_ref as ContractVersion["proposal_ref"], content_digest: proposal.content_digest, body,
      confirmation_decision_ref: command.payload.decision_ref, ...conditionRefs, risk_ref: { object_type: "risk_assessment", id: risk.id }, ...(current.contract_ref ? { predecessor_ref: current.contract_ref } : {}) };
    tx.insertIntentRecord("contract_version", version);
    const { plan_ref: _oldPlan, ...fields } = current;
    const next: Change = { ...fields, contract_ref: { object_type: "contract_version", id: version.id, domain_version: version.version }, lifecycle_state: "IntentReady", revision: current.revision + 1, updated_at: context.now };
    const transition = current.lifecycle_state === "Draft" ? lifecycleRecord(current, "IntentReady", command, context, decision!.reason, [next.contract_ref!, command.payload.decision_ref]) : undefined;
    if (transition) tx.insertIntentRecord("lifecycle_transition_record", transition);
    return mutation("ContractConfirmed", { contract_version: version }, next, { contract_version: version, ...(transition ? { lifecycle_transition: transition } : {}) });
  }
  const contract = currentContract(tx, current);
  if (!contract) reject(command, "CONTRACT_NOT_FOUND", "当前正式约定不存在");
  const body = (proposal as PlanProposal).body, problem = planProblem(body, contract!, current, tx); if (problem) reject(command, "PLAN_INVALID", problem);
  const version: PlanVersion = { ...meta(current, context), version: (tx.listIntentRecords("plan_version", current.id).at(-1)?.version ?? 0) + 1,
    proposal_ref: actualRequest.target_ref as PlanVersion["proposal_ref"], content_digest: proposal.content_digest, body, contract_ref: body.contract_ref,
    confirmation_decision_ref: command.payload.decision_ref, ...conditionRefs, ...(current.plan_ref ? { predecessor_ref: current.plan_ref } : {}) };
  tx.insertIntentRecord("plan_version", version);
  return mutation("PlanConfirmed", { plan_version: version }, { ...current, plan_ref: { object_type: "plan_version", id: version.id, domain_version: version.version }, revision: current.revision + 1, updated_at: context.now });
};

// The original command checked the live assignment. A later end can share its
// timestamp with confirmation; immutable confirmation remains valid in that tie.
const assignmentWasEffective = (assignment: Assignment, at: string): boolean => Date.parse(assignment.effective_at) <= Date.parse(at) &&
  (!assignment.expires_at || Date.parse(at) < Date.parse(assignment.expires_at)) && (!assignment.ended_at || Date.parse(at) <= Date.parse(assignment.ended_at));
const confirmedDecision = (reader: IntentReadPort, version: ContractVersion | PlanVersion): boolean => {
  const decision = reader.getIntentRecord("decision", version.confirmation_decision_ref.id);
  const request = decision ? reader.getIntentRecord("decision_request", decision.request_id) : undefined;
  const proposal = reader.getIntentRecord(version.proposal_ref.object_type, version.proposal_ref.id);
  const role = version.proposal_ref.object_type === "contract_proposal" ? "requirement_owner" : "technical_owner";
  const assignment = decision ? reader.listAssignments(decision.actor_id).find(item => item.id === decision.assignment_ref.id) : undefined;
  const proofs = decision ? conditionProofs(reader, decision, version.created_at) : undefined;
  return !!proofs && equal(version.condition_verification_refs ?? [], proofs.map(proof => ({ object_type: "decision", id: proof.id }))) && !!decision && !!request && !!proposal && decision.choice === "approve" && decision.project_id === version.project_id && decision.change_id === version.change_id &&
    request.project_id === version.project_id && request.change_id === version.change_id && proposal.project_id === version.project_id && proposal.change_id === version.change_id &&
    proposal.proposal_revision === version.proposal_ref.domain_version && request.action === (role === "requirement_owner" ? "confirm_contract" : "confirm_plan") && request.required_role === role &&
    request.policy_version === "intent-confirmation/1.0.0" && decision.acting_role === role && decision.actor_id === decision.producer_actor_id && decision.actor_id === version.producer_actor_id &&
    reader.getActor(decision.actor_id)?.actor_type === "human" && !!assignment && assignment.project_id === version.project_id && assignment.role_key === role && assignmentWasEffective(assignment, version.created_at) &&
    ((assignment.scope.kind === "change" && assignment.scope.id === version.change_id) || (role === "technical_owner" && assignment.scope.kind === "project" && assignment.scope.id === version.project_id)) &&
    Date.parse(decision.decided_at) < Date.parse(request.expires_at) && Date.parse(version.created_at) < Date.parse(request.expires_at) &&
    equal(decision.input_digest, request.input_digest) && equal(decision.target_ref, version.proposal_ref) && equal(request.target_ref, version.proposal_ref) &&
    equal(proposal.content_digest, version.content_digest) && equal(version.content_digest, contentDigest(version.body)) && equal(proposal.body, version.body);
};
const currentContract = (reader: IntentReadPort, change: Change): ContractVersion | undefined => {
  const contract = change.contract_ref ? reader.getIntentRecord("contract_version", change.contract_ref.id) : undefined;
  if (!contract || contract.project_id !== change.project_id || contract.change_id !== change.id || contract.version !== change.contract_ref?.domain_version || !confirmedDecision(reader, contract) || contractProblem(contract.body)) return undefined;
  const risk = reader.getIntentRecord("risk_assessment", contract.risk_ref.id);
  const assignment = risk ? reader.listAssignments(risk.producer_actor_id).find(item => item.id === risk.assignment_ref.id) : undefined;
  const decision = reader.getIntentRecord("decision", contract.confirmation_decision_ref.id)!;
  const request = reader.getIntentRecord("decision_request", decision.request_id)!;
  if (!risk || risk.project_id !== change.project_id || risk.change_id !== change.id || !equal(request.risk_ref, contract.risk_ref) ||
    !equal(risk.subject_refs[0], contract.proposal_ref) || !equal(risk.input_digest, contract.content_digest) || !equal(risk.impact_categories, contract.body.risk.impact_categories) ||
    reader.getActor(risk.producer_actor_id)?.actor_type !== "human" || !assignment || assignment.project_id !== change.project_id || assignment.role_key !== "technical_owner" || !assignmentWasEffective(assignment, risk.created_at) ||
    !((assignment.scope.kind === "change" && assignment.scope.id === change.id) || (assignment.scope.kind === "project" && assignment.scope.id === change.project_id)) ||
    (critical(contract.body) && risk.level !== "high") || (risk.level === "high" && risk.producer_actor_id === decision.actor_id)) return undefined;
  return contract;
};
export const admissionFailure = (tx: StoreTransaction, command: { correlation_id: string }, change: Change, checkDependencies = true): DomainError | undefined => {
  try {
    const contract = currentContract(tx, change);
    const plan = change.plan_ref ? tx.getIntentRecord("plan_version", change.plan_ref.id) : undefined;
    if (!contract || !plan || contract.change_id !== change.id || plan.change_id !== change.id || contract.project_id !== change.project_id || plan.project_id !== change.project_id ||
      contract.version !== change.contract_ref?.domain_version || plan.version !== change.plan_ref?.domain_version || !equal(plan.contract_ref, change.contract_ref) || !equal(plan.body.contract_ref, change.contract_ref) ||
      !confirmedDecision(tx, plan)) reject(command, "EVIDENCE_MISSING", "缺少当前真实正式Contract / Plan及精确确认事实");
    const risk = tx.getIntentRecord("risk_assessment", contract!.risk_ref.id);
    const planDecision = tx.getIntentRecord("decision", plan!.confirmation_decision_ref.id)!;
    const planRequest = tx.getIntentRecord("decision_request", planDecision.request_id)!;
    const planProposal = tx.getIntentRecord("plan_proposal", plan!.proposal_ref.id)!;
    if (!risk || !equal(planRequest.risk_ref, contract!.risk_ref) || (risk.level === "high" && planDecision.actor_id === planProposal.producer_actor_id)) reject(command, "EVIDENCE_MISSING", "正式计划风险或独立复核依据不一致");
    const problem = planProblem(plan!.body, contract!, change, tx); if (problem) reject(command, "PLAN_INVALID", problem);
    for (const dependency of checkDependencies ? plan!.body.dependencies : []) {
      const other = tx.getChange(dependency.change_id);
      if (!other || !equal(other.contract_ref, dependency.contract_ref) ||
        !(other.lifecycle_state === "Completed" || (dependency.required_state === "ready_for_delivery" && other.lifecycle_state === "ReadyForDelivery" && other.operating_status === "Active"))) reject(command, "DEPENDENCY_UNSATISFIED", "需求依赖尚未达到固定条件", { dependency });
    }
  } catch (error) { if (error instanceof IntentFailure) return error.result; throw error; }
};
