import * as v2 from "../../packages/protocol/src/v2/index.js";
import { createFlowProject, flowSuccess, type FlowFixtureOptions } from "./flow-project.js";

export const contractBody = (): v2.ContractBody => ({ goal: "返回可核对结果", scope: "改进本地查询", non_goals: ["发布到生产"], constraints: ["兼容原接口"],
  acceptance_criteria: [{ key: "A1", scenario: "查询有效需求", expected: "返回同一快照与序号", evidence_requirements: ["可复查自动测试"] }],
  delivery_endpoint: "production_verified", knowledge_impact: [], risk: { level: "ordinary", impact_categories: ["other"], rationale: "仅本地低风险查询" }, unresolved_questions: [] });
export const planBody = (changeId: string, contractRef: v2.PlanBody["contract_ref"]): v2.PlanBody => {
  const implementationId = v2.createInternalId();
  const task = (purpose: v2.TaskDefinition["purpose"], id = v2.createInternalId()): v2.TaskDefinition => ({ task_id: id, version: 1,
    scope: { kind: "change", id: changeId }, purpose, goal: "完成约定结果", inputs: [], outputs: ["可核对结果"], dependencies: [],
    allowed_changes: purpose === "implementation" ? ["src/query.ts"] : [], affected_targets: [], closure_requirement: "before_release", knowledge_keys: [],
    verification: { method: "自动检查与独立复核", mode: purpose === "verification" ? "independent" : "self_check", acceptance_keys: ["A1"], evidence_requirements: ["原始测试结果"] } });
  const verification = task("verification"); verification.dependencies = [implementationId];
  return { contract_ref: contractRef, approach: "修改查询并独立验证", task_definitions: [task("implementation", implementationId), verification],
    dependencies: [], verification_strategy: { description: "本阶段验证后再验证正式交付", deferred_checks: [] } };
};
export const createIntentProject = (directory: string, options: FlowFixtureOptions = {}) => {
  const f = createFlowProject(directory, options); f.configure(); f.grant("technical_owner");
  const create = (title = "约定需求") => {
    const result = flowSuccess(f.kernel.execute({ ...f.context(), command_type: "CreateChange", payload: { title, requirement_owner_actor_id: f.actor.id } }));
    if (result.command_type !== "CreateChange") throw new Error("create expected"); return result.data.change;
  };
  const execute = <P>(type: string, changeId: string, payload: P, role: string) => flowSuccess(f.kernel.execute(f.changeCommand(type, f.store.getChange(changeId)!, payload, role)));
  const submitContract = (id: string, body = contractBody()) => {
    const result = execute("SubmitContractProposal", id, { base_version_ref: f.store.getChange(id)!.contract_ref ?? null, body }, "change_owner");
    if (result.command_type !== "SubmitContractProposal") throw new Error("proposal expected"); return result.data.proposal;
  };
  const assess = (id: string, proposal: v2.ContractProposal, level: "ordinary" | "high" = "ordinary") => {
    const result = execute("RecordRiskAssessment", id, { proposal_ref: { object_type: "contract_proposal", id: proposal.id, domain_version: proposal.proposal_revision }, level, rationale: "专业责任人检查实际范围" }, "technical_owner");
    if (result.command_type !== "RecordRiskAssessment") throw new Error("risk expected"); return result.data.risk_assessment;
  };
  const request = (id: string, proposal: v2.ContractProposal | v2.PlanProposal, kind: "contract" | "plan", risk?: v2.RiskAssessment) => {
    const result = execute("RequestDecision", id, { action: `confirm_${kind}`, proposal_ref: { object_type: `${kind}_proposal`, id: proposal.id, domain_version: proposal.proposal_revision },
      ...(risk ? { risk_ref: { object_type: "risk_assessment", id: risk.id } } : {}) }, kind === "contract" ? "change_owner" : "technical_owner");
    if (result.command_type !== "RequestDecision") throw new Error("request expected"); return result.data.request;
  };
  const decide = (id: string, request: v2.DecisionRequest, choice: v2.Decision["choice"] = "approve", conditions: string[] = []) => {
    const result = execute("RecordDecision", id, { request_id: request.id, input_digest: request.input_digest, choice, conditions, reason: "人工核对精确候选" }, request.required_role);
    if (result.command_type !== "RecordDecision") throw new Error("decision expected"); return result.data.decision;
  };
  const confirmPayload = (request: v2.DecisionRequest, decision: v2.Decision) => ({ proposal_ref: request.target_ref,
    decision_request_ref: { object_type: "decision_request", id: request.id }, decision_ref: { object_type: "decision", id: decision.id }, input_digest: request.input_digest });
  const prepareContract = (id: string, body = contractBody()) => {
    const proposal = submitContract(id, body), risk = assess(id, proposal), requested = request(id, proposal, "contract", risk), decision = decide(id, requested);
    const result = execute("ConfirmContract", id, confirmPayload(requested, decision), "requirement_owner");
    if (result.command_type !== "ConfirmContract") throw new Error("contract expected"); return { proposal, risk, request: requested, decision, version: result.data.contract_version };
  };
  const submitPlan = (id: string, body?: v2.PlanBody) => {
    const change = f.store.getChange(id)!;
    const result = execute("SubmitPlanProposal", id, { base_version_ref: change.plan_ref ?? null, body: body ?? planBody(id, change.contract_ref!) }, "technical_owner");
    if (result.command_type !== "SubmitPlanProposal") throw new Error("plan proposal expected"); return result.data.proposal;
  };
  const preparePlan = (id: string, body?: v2.PlanBody) => {
    const proposal = submitPlan(id, body), requested = request(id, proposal, "plan"), decision = decide(id, requested);
    const result = execute("ConfirmPlan", id, confirmPayload(requested, decision), "technical_owner");
    if (result.command_type !== "ConfirmPlan") throw new Error("plan expected"); return { proposal, request: requested, decision, version: result.data.plan_version };
  };
  return { ...f, create, execute, submitContract, assess, request, decide, confirmPayload, prepareContract, submitPlan, preparePlan };
};
