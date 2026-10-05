import type { Assignment, Change, Decision, DecisionRequest, Evidence, GateEvaluation, SourceSnapshot } from "@cimiloop/protocol/v2";
import type { ProjectReader } from "@cimiloop/store";
import { assignmentIsEffective } from "./authorization.js";
import { contentDigest } from "./intent.js";

export type ReviewReader = Pick<ProjectReader, "getActor" | "listAssignments" | "getIntentRecord" | "listIntentRecords" | "getExecutionRecord" | "listExecutionObjects" | "getVerificationRecord" | "listVerificationRecords">;
export const reviewEqual = (a: unknown, b: unknown) => contentDigest(a ?? null).value === contentDigest(b ?? null).value;
export const professionalAction = (action: DecisionRequest["action"]) => !["confirm_contract", "confirm_plan"].includes(action);
export const reviewAssignment = (reader: Pick<ReviewReader, "getActor" | "listAssignments">, change: Change, actorId: string, role: DecisionRequest["required_role"], now: string): Assignment | undefined => {
  if (reader.getActor(actorId)?.actor_type !== "human" || reader.getActor(actorId)?.project_id !== change.project_id ||
    (role === "requirement_owner" && change.requirement_owner_actor_id !== actorId)) return;
  return reader.listAssignments(actorId).find(item => item.project_id === change.project_id && item.role_key === role && assignmentIsEffective(item, now) &&
    ((item.scope.kind === "change" && item.scope.id === change.id) || (role !== "requirement_owner" && item.scope.kind === "project" && item.scope.id === change.project_id)));
};
const historicalAssignment = (reader: Pick<ReviewReader, "getActor" | "listAssignments">, decision: Decision, request: DecisionRequest) => {
  const assignment = reader.listAssignments(decision.actor_id).find(item => item.id === decision.assignment_ref.id);
  return !!assignment && reader.getActor(decision.actor_id)?.actor_type === "human" && reader.getActor(decision.actor_id)?.project_id === decision.project_id &&
    assignment.project_id === decision.project_id && assignment.role_key === request.required_role &&
    ((assignment.scope.kind === "change" && assignment.scope.id === decision.change_id) || (request.required_role !== "requirement_owner" && assignment.scope.kind === "project" && assignment.scope.id === decision.project_id)) &&
    Date.parse(assignment.effective_at) <= Date.parse(decision.decided_at) && (!assignment.ended_at || Date.parse(assignment.ended_at) >= Date.parse(decision.decided_at)) &&
    (!assignment.expires_at || Date.parse(assignment.expires_at) > Date.parse(decision.decided_at));
};
export const reviewPair = (reader: Pick<ReviewReader, "getActor" | "listAssignments" | "getIntentRecord">, decision: Decision): DecisionRequest | undefined => {
  const request = reader.getIntentRecord("decision_request", decision.request_id), report = decision.review?.report;
  if (!request || !professionalAction(request.action) || request.policy_version !== "professional-review/1.0.0" || !request.professional_subject_ref || request.scope.kind !== "change" || request.scope.id !== decision.change_id ||
    !reviewEqual(request.input_refs, [request.target_ref, request.professional_subject_ref]) ||
    request.project_id !== decision.project_id || request.change_id !== decision.change_id || decision.actor_id !== decision.producer_actor_id ||
    decision.acting_role !== request.required_role || !reviewEqual(decision.input_digest, request.input_digest) || !reviewEqual(decision.target_ref, request.target_ref) ||
    decision.decided_at !== decision.created_at || Date.parse(decision.decided_at) < Date.parse(request.created_at) || Date.parse(decision.decided_at) >= Date.parse(request.expires_at) ||
    !historicalAssignment(reader, decision, request) || (report && (report.producer_actor_id !== decision.actor_id || !reviewEqual(report.request_input_digest, request.input_digest) ||
      Date.parse(report.observed_at) < Date.parse(request.created_at) || Date.parse(report.observed_at) > Date.parse(decision.decided_at)))) return;
  return request;
};
export const conditionInput = (reader: Pick<ReviewReader, "getIntentRecord">, parent: Decision) => contentDigest({ policy: "professional-review/1.0.0", action: "verify_decision_conditions",
  decision: parent, request: reader.getIntentRecord("decision_request", parent.request_id), proposal: reader.getIntentRecord(parent.target_ref.object_type, parent.target_ref.id) });
export const conditionProofs = (reader: Pick<ReviewReader, "getActor" | "listAssignments" | "getIntentRecord" | "listIntentRecords">, parent: Decision, at: string): Decision[] | undefined => {
  if (!parent.conditions.length) return [];
  const original = reader.getIntentRecord("decision_request", parent.request_id);
  if (!original || !["confirm_contract", "confirm_plan"].includes(original.action)) return;
  const digest = conditionInput(reader, parent), proofs: Decision[] = [], covered = new Set<number>(); let unresolved = false;
  for (const decision of reader.listIntentRecords("decision", parent.change_id)) {
    if (Date.parse(decision.created_at) > Date.parse(at)) continue;
    const request = reviewPair(reader, decision), finding = decision.review?.report.finding;
    if (request?.action !== "verify_decision_conditions" || request.professional_subject_ref?.id !== parent.id || !reviewEqual(request.input_digest, digest) ||
      !reviewEqual(request.target_ref, parent.target_ref) || request.required_role !== original.required_role || decision.actor_id !== parent.actor_id || finding?.kind !== "condition_verification") continue;
    if (new Set(finding.results.map(item => item.condition_index)).size !== finding.results.length || finding.results.some(item => parent.conditions[item.condition_index] !== item.condition)) return;
    if (finding.results.some(item => item.result !== "supports") || decision.choice !== "approve") unresolved = true;
    else { finding.results.forEach(item => covered.add(item.condition_index)); proofs.push(decision); }
  }
  return !unresolved && covered.size === parent.conditions.length ? proofs : undefined;
};
export const sameEvidenceBaseline = (a: Evidence, b: Evidence) => a.id !== b.id && a.project_id === b.project_id && a.change_id === b.change_id && a.task_id === b.task_id &&
  reviewEqual(a.definition_ref, b.definition_ref) && reviewEqual(a.contract_ref, b.contract_ref) && reviewEqual(a.plan_ref, b.plan_ref) && reviewEqual(a.source_snapshot_ref, b.source_snapshot_ref);
export const invalidationInput = (reader: ReviewReader, change: Change, evidence: Evidence) => contentDigest({ policy: "professional-review/1.0.0", action: "invalidate_evidence", change,
  evidence, source: reader.getVerificationRecord("source_snapshot", evidence.source_snapshot_ref.id),
  definition: reader.getExecutionRecord("task_definition", evidence.definition_ref.id),
  observations: reader.listVerificationRecords("evidence", change.id).filter(item => sameEvidenceBaseline(evidence, item)) });
export const applicableInvalidations = (reader: ReviewReader, changeId: string, evidence: Evidence): Decision[] => {
  const decisions = reader.listIntentRecords("decision", changeId);
  if (decisions.some(decision => { const request = reviewPair(reader, decision); return request?.action === "invalidate_evidence" && request.professional_subject_ref?.id === evidence.id &&
    request.required_role === "quality_owner" && decision.actor_id !== evidence.producer_actor_id && decision.choice !== "approve"; })) return [];
  return decisions.filter(decision => {
  const request = reviewPair(reader, decision), finding = decision.review?.report.finding;
  if (decision.choice !== "approve" || decision.conditions.length || request?.action !== "invalidate_evidence" || request.required_role !== "quality_owner" ||
    request.professional_subject_ref?.id !== evidence.id || finding?.kind !== "evidence_invalidation" || decision.actor_id === evidence.producer_actor_id) return false;
  // Each disputed claim needs a distinct, applicable corrective observation.
  return finding.claim_keys.every(key => evidence.claims.some(claim => claim.key === key && finding.correction_evidence_refs.some(ref => {
    const correction = reader.getVerificationRecord("evidence", ref.id);
    return correction && correction.producer_actor_id !== decision.actor_id && sameEvidenceBaseline(evidence, correction) && claim.result !== "supports" && correction.claims.some(item => item.key === key && item.description === claim.description && item.result === "supports");
  })));
  });
};
export const effectiveClaims = (reader: ReviewReader, evidence: Evidence) => {
  const keys = new Set(applicableInvalidations(reader, evidence.change_id, evidence).flatMap(item => item.review!.report.finding.kind === "evidence_invalidation" ? item.review!.report.finding.claim_keys : []));
  return evidence.claims.filter(claim => !keys.has(claim.key));
};
export const integrationInput = (reader: ReviewReader, change: Change, source: SourceSnapshot, deferred: GateEvaluation["deferred_checks"]) => {
  const dispositions = reader.listVerificationRecords("evidence", change.id).flatMap(evidence => applicableInvalidations(reader, change.id, evidence)).filter((value, i, all) => all.findIndex(other => other.id === value.id) === i);
  return contentDigest({ rule_version: "verification/1.0.0", change,
  source_digest: source.source_digest, deferred_checks: deferred, tasks: reader.listExecutionObjects("task", change.id), work_items: reader.listExecutionObjects("work_item", change.id),
  evidence: reader.listVerificationRecords("evidence", change.id), task_evaluations: reader.listVerificationRecords("evaluation", change.id).filter(item => item.purpose !== "safe_integration"),
  satisfactions: reader.listVerificationRecords("task_satisfaction_record", change.id), ...(dispositions.length ? { dispositions } : {}) });
};
export const integrationDecision = (reader: ReviewReader, change: Change, source: SourceSnapshot, deferred: GateEvaluation["deferred_checks"], now: string): Decision | undefined => {
  const digest = integrationInput(reader, change, source, deferred), contract = reader.getIntentRecord("contract_version", change.contract_ref!.id)!;
  const decisions = reader.listIntentRecords("decision", change.id);
  if (decisions.some(decision => { const request = reviewPair(reader, decision); return request?.action === "confirm_integration" && request.required_role === "quality_owner" &&
    request.expected_revision === change.revision && reviewEqual(request.input_digest, digest) && decision.choice !== "approve"; })) return;
  return decisions.find(decision => {
    const request = reviewPair(reader, decision), finding = decision.review?.report.finding;
    const gate = request?.professional_subject_ref?.object_type === "evaluation" ? reader.getVerificationRecord("evaluation", request.professional_subject_ref.id) : undefined;
    return decision.choice === "approve" && !decision.conditions.length && request?.action === "confirm_integration" && request.required_role === "quality_owner" &&
      request.expected_revision === change.revision && Date.parse(now) < Date.parse(request.expires_at) && reviewAssignment(reader, change, decision.actor_id, "quality_owner", now)?.id === decision.assignment_ref.id &&
      reviewEqual(request.target_ref, contract.proposal_ref) && request.risk_ref?.id === contract.risk_ref.id && reviewEqual(request.input_digest, digest) && gate?.purpose === "safe_integration" &&
      gate.outcome === "REQUIRE_HUMAN" && gate.reasons.length === 1 && gate.source_snapshot_ref.id === source.id && reviewEqual(gate.input_digest, digest) &&
      finding?.kind === "integration_review" && finding.result === "supports" && independentProfessional(reader, change, decision.actor_id, gate.producer_actor_id);
  });
};
export const independentProfessional = (reader: ReviewReader, change: Change, actorId: string, producer: string) => actorId !== producer &&
  !reader.listExecutionObjects("work_item", change.id).some(item => item.executor_ref.id === actorId && reader.getExecutionRecord("task_definition", item.definition_ref.id)?.body.purpose === "implementation");
// A read status describes current domain inputs. The mutation still verifies
// external bytes and Git through the trusted port before recording a decision.
export const professionalRequestCurrent = (reader: ReviewReader, change: Change, request: DecisionRequest, now: string): boolean => {
  if (!professionalAction(request.action) || request.policy_version !== "professional-review/1.0.0" || request.project_id !== change.project_id || request.change_id !== change.id ||
    request.expected_revision !== change.revision || Date.parse(now) >= Date.parse(request.expires_at) || change.operating_status !== "Active") return false;
  const subject = request.professional_subject_ref;
  if (request.action === "verify_decision_conditions") {
    const parent = subject?.object_type === "decision" ? reader.getIntentRecord("decision", subject.id) : undefined;
    const original = parent ? reader.getIntentRecord("decision_request", parent.request_id) : undefined;
    const proposal = parent ? reader.getIntentRecord(parent.target_ref.object_type, parent.target_ref.id) : undefined;
    return !!parent && !!original && !!proposal && ["Draft", "IntentReady"].includes(change.lifecycle_state) && parent.choice === "approve" && !!parent.conditions.length &&
      original.expected_revision === change.revision && Date.parse(now) < Date.parse(original.expires_at) && reader.listIntentRecords(parent.target_ref.object_type, change.id).at(-1)?.id === proposal.id &&
      request.required_role === original.required_role && reviewEqual(request.target_ref, parent.target_ref) && reviewEqual(request.input_digest, conditionInput(reader, parent));
  }
  if (change.lifecycle_state !== "Executing" || !change.contract_ref || !change.plan_ref) return false;
  const contract = reader.getIntentRecord("contract_version", change.contract_ref.id);
  if (!contract || !reviewEqual(request.target_ref, contract.proposal_ref) || request.risk_ref?.id !== contract.risk_ref.id || request.required_role !== "quality_owner") return false;
  if (request.action === "invalidate_evidence") {
    const evidence = subject?.object_type === "evidence" ? reader.getVerificationRecord("evidence", subject.id) : undefined;
    return !!evidence && evidence.change_id === change.id && reviewEqual(evidence.contract_ref, change.contract_ref) && reviewEqual(evidence.plan_ref, change.plan_ref) && reviewEqual(request.input_digest, invalidationInput(reader, change, evidence));
  }
  const gate = subject?.object_type === "evaluation" ? reader.getVerificationRecord("evaluation", subject.id) : undefined;
  const source = gate ? reader.getVerificationRecord("source_snapshot", gate.source_snapshot_ref.id) : undefined;
  return !!gate && !!source && gate.purpose === "safe_integration" && gate.change_id === change.id && gate.outcome === "REQUIRE_HUMAN" && gate.reasons.length === 1 &&
    reader.getIntentRecord("risk_assessment", contract.risk_ref.id)?.level === "high" && !gate.deferred_checks.some(item => Date.parse(item.next_check_at) <= Date.parse(now)) &&
    reviewEqual(request.input_digest, gate.input_digest) && reviewEqual(request.input_digest, integrationInput(reader, change, source, gate.deferred_checks));
};
