import { Type, type Static } from "typebox";
import { DigestSchema, InternalIdSchema, PositiveIntegerSchema, RecordMetadata, RoleKeySchema, ScopeSchema,
  TypedReferenceSchema, UtcTimestampSchema, ChangeLifecycleStateSchema, referenceSchema, versionedReferenceSchema } from "./common.js";

const text = Type.String({ minLength: 1, maxLength: 4000 });
const key = Type.String({ pattern: "^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$" });
const texts = Type.Array(text, { uniqueItems: true });
export const ClosureRequirementSchema = Type.Union([Type.Literal("none"), Type.Literal("before_release"), Type.Literal("before_change_complete"), Type.Literal("before_batch_end")]);
export const AcceptanceCriterionSchema = Type.Object({ key, scenario: text, expected: text,
  evidence_requirements: Type.Array(text, { minItems: 1, uniqueItems: true }) }, { additionalProperties: false });
export const RiskDeclarationSchema = Type.Object({ level: Type.Union([Type.Literal("ordinary"), Type.Literal("high")]),
  impact_categories: Type.Array(Type.Union([Type.Literal("permissions"), Type.Literal("important_data"), Type.Literal("key_compatibility"), Type.Literal("other")]), { uniqueItems: true }),
  rationale: text }, { additionalProperties: false });
export const ContractBodySchema = Type.Object({ goal: text, scope: text, non_goals: texts, constraints: texts,
  acceptance_criteria: Type.Array(AcceptanceCriterionSchema, { minItems: 1 }), delivery_endpoint: Type.Literal("production_verified"),
  knowledge_impact: Type.Array(Type.Object({ key, description: text, required_before: ClosureRequirementSchema }, { additionalProperties: false })),
  risk: RiskDeclarationSchema, unresolved_questions: texts }, { additionalProperties: false });
export const TaskDefinitionSchema = Type.Object({ task_id: InternalIdSchema, version: PositiveIntegerSchema, scope: ScopeSchema,
  purpose: Type.Union([Type.Literal("implementation"), Type.Literal("verification"), Type.Literal("knowledge"), Type.Literal("synchronization"), Type.Literal("release_operation"), Type.Literal("learning")]),
  goal: text, inputs: Type.Array(TypedReferenceSchema, { uniqueItems: true }), outputs: Type.Array(text, { minItems: 1, uniqueItems: true }),
  dependencies: Type.Array(InternalIdSchema, { uniqueItems: true }), allowed_changes: texts, affected_targets: texts, closure_requirement: ClosureRequirementSchema,
  knowledge_keys: Type.Array(key, { uniqueItems: true }), verification: Type.Object({ method: text,
    mode: Type.Union([Type.Literal("self_check"), Type.Literal("independent")]), acceptance_keys: Type.Array(key, { uniqueItems: true }),
    evidence_requirements: Type.Array(text, { minItems: 1, uniqueItems: true }) }, { additionalProperties: false }) }, { additionalProperties: false });
export const ChangeDependencySchema = Type.Object({ change_id: InternalIdSchema, contract_ref: versionedReferenceSchema("contract_version"),
  required_state: Type.Union([Type.Literal("ready_for_delivery"), Type.Literal("completed")]) }, { additionalProperties: false });
export const PlanBodySchema = Type.Object({ contract_ref: versionedReferenceSchema("contract_version"), approach: text,
  task_definitions: Type.Array(TaskDefinitionSchema, { minItems: 1 }), dependencies: Type.Array(ChangeDependencySchema),
  verification_strategy: Type.Object({ description: text, deferred_checks: Type.Array(Type.Object({ acceptance_key: key, reason: text,
    arrangement: text, required_before: ClosureRequirementSchema }, { additionalProperties: false })) }, { additionalProperties: false }) }, { additionalProperties: false });
const proposalFields = { ...RecordMetadata, change_id: InternalIdSchema, proposal_id: InternalIdSchema, proposal_revision: PositiveIntegerSchema, content_digest: DigestSchema };
export const ContractProposalSchema = Type.Object({ ...proposalFields, base_version_ref: Type.Union([versionedReferenceSchema("contract_version"), Type.Null()]),
  predecessor_ref: Type.Optional(versionedReferenceSchema("contract_proposal")), body: ContractBodySchema }, { additionalProperties: false });
export const PlanProposalSchema = Type.Object({ ...proposalFields, base_version_ref: Type.Union([versionedReferenceSchema("plan_version"), Type.Null()]),
  predecessor_ref: Type.Optional(versionedReferenceSchema("plan_proposal")), body: PlanBodySchema }, { additionalProperties: false });
export const RiskAssessmentSchema = Type.Object({ ...RecordMetadata, change_id: InternalIdSchema, scope: ScopeSchema, subject_refs: Type.Array(versionedReferenceSchema("contract_proposal"), { minItems: 1, maxItems: 1 }),
  input_digest: DigestSchema, level: Type.Union([Type.Literal("ordinary"), Type.Literal("high")]), impact_categories: RiskDeclarationSchema.properties.impact_categories,
  rationale: text, assignment_ref: referenceSchema("assignment") }, { additionalProperties: false });
export const DecisionActionSchema = Type.Union([Type.Literal("confirm_contract"), Type.Literal("confirm_plan"), Type.Literal("confirm_integration"), Type.Literal("verify_decision_conditions"), Type.Literal("invalidate_evidence")]);
export const ProposalReferenceSchema = Type.Union([versionedReferenceSchema("contract_proposal"), versionedReferenceSchema("plan_proposal")]);
export const ProfessionalSubjectReferenceSchema = Type.Union([referenceSchema("evaluation"), referenceSchema("decision"), referenceSchema("evidence")]);
export const ProfessionalRawReferenceSchema = Type.Object({ provider: Type.Literal("local_content"), resource_type: Type.Literal("manual_review"),
  locator: Type.String({ pattern: "^[0-9a-f]{64}$" }), digest: DigestSchema }, { additionalProperties: false });
export const ProfessionalFindingSchema = Type.Union([
  Type.Object({ kind: Type.Literal("condition_verification"), results: Type.Array(Type.Object({ condition_index: Type.Integer({ minimum: 0 }), condition: text,
    result: Type.Union([Type.Literal("supports"), Type.Literal("refutes"), Type.Literal("inconclusive")]), observation: text }, { additionalProperties: false }), { minItems: 1 }) }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal("evidence_invalidation"), claim_keys: Type.Array(text, { minItems: 1, uniqueItems: true }),
    defect: Type.Union([Type.Literal("wrong_method"), Type.Literal("wrong_observation"), Type.Literal("inapplicable_assertion")]), analysis: text,
    correction_evidence_refs: Type.Array(referenceSchema("evidence"), { minItems: 1, uniqueItems: true }) }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal("integration_review"), result: Type.Union([Type.Literal("supports"), Type.Literal("refutes"), Type.Literal("inconclusive")]), observation: text }, { additionalProperties: false })
]);
export const RawProfessionalReviewSchema = Type.Object({ format: Type.Literal("cimiloop/manual-review/1.0.0"), producer_actor_id: InternalIdSchema,
  observed_at: UtcTimestampSchema, request_input_digest: DigestSchema, method: text, finding: ProfessionalFindingSchema }, { additionalProperties: false });
export type RawProfessionalReview = Static<typeof RawProfessionalReviewSchema>;
export const DecisionRequestSchema = Type.Object({ ...RecordMetadata, change_id: InternalIdSchema, scope: ScopeSchema, action: DecisionActionSchema, target_ref: ProposalReferenceSchema,
  expected_revision: PositiveIntegerSchema, input_refs: Type.Array(TypedReferenceSchema, { minItems: 1, uniqueItems: true }), input_digest: DigestSchema,
  required_role: Type.Union([Type.Literal("requirement_owner"), Type.Literal("technical_owner"), Type.Literal("quality_owner")]), expires_at: UtcTimestampSchema,
  policy_version: Type.Union([Type.Literal("intent-confirmation/1.0.0"), Type.Literal("professional-review/1.0.0")]), risk_ref: Type.Optional(referenceSchema("risk_assessment")),
  professional_subject_ref: Type.Optional(ProfessionalSubjectReferenceSchema) }, { additionalProperties: false });
export const DecisionSchema = Type.Object({ ...RecordMetadata, change_id: InternalIdSchema, request_id: InternalIdSchema, target_ref: ProposalReferenceSchema, input_digest: DigestSchema,
  actor_id: InternalIdSchema, acting_role: RoleKeySchema, assignment_ref: referenceSchema("assignment"),
  choice: Type.Union([Type.Literal("approve"), Type.Literal("request_changes"), Type.Literal("reject")]), reason: text,
  conditions: texts, decided_at: UtcTimestampSchema,
  review: Type.Optional(Type.Object({ raw_result_ref: ProfessionalRawReferenceSchema, report: RawProfessionalReviewSchema }, { additionalProperties: false })) }, { additionalProperties: false });
const versionFields = { ...RecordMetadata, change_id: InternalIdSchema, version: PositiveIntegerSchema, proposal_ref: ProposalReferenceSchema,
  content_digest: DigestSchema, confirmation_decision_ref: referenceSchema("decision"), condition_verification_refs: Type.Optional(Type.Array(referenceSchema("decision"), { minItems: 1, uniqueItems: true })) };
export const ContractVersionSchema = Type.Object({ ...versionFields, proposal_ref: versionedReferenceSchema("contract_proposal"),
  predecessor_ref: Type.Optional(versionedReferenceSchema("contract_version")), body: ContractBodySchema, risk_ref: referenceSchema("risk_assessment") }, { additionalProperties: false });
export const PlanVersionSchema = Type.Object({ ...versionFields, proposal_ref: versionedReferenceSchema("plan_proposal"),
  predecessor_ref: Type.Optional(versionedReferenceSchema("plan_version")), contract_ref: versionedReferenceSchema("contract_version"), body: PlanBodySchema }, { additionalProperties: false });
export const LifecycleTransitionRecordSchema = Type.Object({ ...RecordMetadata, change_id: InternalIdSchema, command_id: InternalIdSchema,
  from_state: ChangeLifecycleStateSchema, to_state: ChangeLifecycleStateSchema, actor_id: InternalIdSchema, acting_role: RoleKeySchema,
  reason: text, basis_refs: Type.Array(TypedReferenceSchema, { minItems: 1, uniqueItems: true }) }, { additionalProperties: false });

export type ContractBody = Static<typeof ContractBodySchema>;
export type PlanBody = Static<typeof PlanBodySchema>;
export type ContractProposal = Static<typeof ContractProposalSchema>;
export type PlanProposal = Static<typeof PlanProposalSchema>;
export type ContractVersion = Static<typeof ContractVersionSchema>;
export type PlanVersion = Static<typeof PlanVersionSchema>;
export type RiskAssessment = Static<typeof RiskAssessmentSchema>;
export type DecisionRequest = Static<typeof DecisionRequestSchema>;
export type Decision = Static<typeof DecisionSchema>;
export type LifecycleTransitionRecord = Static<typeof LifecycleTransitionRecordSchema>;
export type TaskDefinition = Static<typeof TaskDefinitionSchema>;
export type ChangeDependency = Static<typeof ChangeDependencySchema>;
export const intentRecordSchemas = { contract_proposal: ContractProposalSchema, plan_proposal: PlanProposalSchema,
  contract_version: ContractVersionSchema, plan_version: PlanVersionSchema, risk_assessment: RiskAssessmentSchema,
  decision_request: DecisionRequestSchema, decision: DecisionSchema, lifecycle_transition_record: LifecycleTransitionRecordSchema } as const;
export type IntentRecordType = keyof typeof intentRecordSchemas;
export type IntentRecords = { contract_proposal: ContractProposal; plan_proposal: PlanProposal; contract_version: ContractVersion; plan_version: PlanVersion;
  risk_assessment: RiskAssessment; decision_request: DecisionRequest; decision: Decision; lifecycle_transition_record: LifecycleTransitionRecord };
