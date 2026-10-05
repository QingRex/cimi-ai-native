import { Type, type Static } from "typebox";
import { DigestSchema, InternalIdSchema, RecordMetadata, SCHEMA_VERSION, UtcTimestampSchema, referenceSchema, versionedReferenceSchema } from "./common.js";

const text = Type.String({ minLength: 1, maxLength: 4000 });
const result = Type.Union([Type.Literal("supports"), Type.Literal("refutes"), Type.Literal("inconclusive")]);
export const GateOutcomeSchema = Type.Union([Type.Literal("ALLOW"), Type.Literal("NEED_MORE_EVIDENCE"), Type.Literal("REQUIRE_HUMAN"), Type.Literal("DENY")]);
const baseline = { change_id: InternalIdSchema, contract_ref: versionedReferenceSchema("contract_version"), plan_ref: versionedReferenceSchema("plan_version"), source_snapshot_ref: referenceSchema("source_snapshot") };
const sourceSnapshotSchema = Type.Object({ ...RecordMetadata, change_id: InternalIdSchema, repository_ref: referenceSchema("project"),
  commit_id: Type.String({ pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" }), source_digest: DigestSchema }, { additionalProperties: false });
export type SourceSnapshot = Static<typeof sourceSnapshotSchema>;
export const SourceSnapshotSchema = Type.Unsafe<SourceSnapshot>(sourceSnapshotSchema);
export const RawEvidenceResultSchema = Type.Object({ format: Type.Literal("cimiloop/manual-evidence/1.0.0"), producer_actor_id: InternalIdSchema,
  observed_at: UtcTimestampSchema, source_digest: DigestSchema, method: text,
  claims: Type.Array(Type.Object({ key: text, description: text, result, observation: text }, { additionalProperties: false }), { minItems: 1 }) }, { additionalProperties: false });
export type RawEvidenceResult = Static<typeof RawEvidenceResultSchema>;
export const RawResultReferenceSchema = Type.Object({ provider: Type.Literal("local_content"), resource_type: Type.Literal("manual_evidence"),
  locator: Type.String({ pattern: "^[0-9a-f]{64}$" }), digest: DigestSchema }, { additionalProperties: false });
const evidenceSchema = Type.Object({ ...RecordMetadata, ...baseline, task_id: InternalIdSchema, definition_ref: versionedReferenceSchema("task_definition"),
  work_item_ref: referenceSchema("work_item"), origin: Type.Literal("manual_observation"),
  raw_result_ref: RawResultReferenceSchema,
  observed_at: UtcTimestampSchema, claims: RawEvidenceResultSchema.properties.claims }, { additionalProperties: false });
export type Evidence = Static<typeof evidenceSchema>;
export const EvidenceSchema = Type.Unsafe<Evidence>(evidenceSchema);
const policySnapshotSchema = Type.Object({ ...RecordMetadata, ...baseline, rule_version: Type.Literal("verification/1.0.0"),
  profile: Type.Union([Type.Literal("Feature"), Type.Literal("Bugfix")]), risk_ref: referenceSchema("risk_assessment") }, { additionalProperties: false });
export type PolicySnapshot = Static<typeof policySnapshotSchema>;
export const PolicySnapshotSchema = Type.Unsafe<PolicySnapshot>(policySnapshotSchema);
const requirementSetRecordSchema = Type.Object({ ...RecordMetadata, ...baseline, task_id: InternalIdSchema, definition_ref: versionedReferenceSchema("task_definition"),
  policy_snapshot_ref: referenceSchema("policy_snapshot"), requirements: Type.Array(Type.Object({ key: text, description: text }, { additionalProperties: false }), { minItems: 1 }) }, { additionalProperties: false });
export type RequirementSetRecord = Static<typeof requirementSetRecordSchema>;
export const RequirementSetRecordSchema = Type.Unsafe<RequirementSetRecord>(requirementSetRecordSchema);
const evaluationContextSchema = Type.Object({ ...RecordMetadata, ...baseline, task_id: InternalIdSchema, definition_ref: versionedReferenceSchema("task_definition"),
  work_item_ref: referenceSchema("work_item"), evaluator_actor_id: InternalIdSchema, boundary: Type.Literal("manual_independent_read_only"),
  allowed_resources: Type.Array(text, { minItems: 1, uniqueItems: true }), requirement_set_ref: referenceSchema("requirement_set_record"), input_digest: DigestSchema }, { additionalProperties: false });
export type EvaluationContext = Static<typeof evaluationContextSchema>;
export const EvaluationContextSchema = Type.Unsafe<EvaluationContext>(evaluationContextSchema);
const taskEvaluationSchema = Type.Object({ ...RecordMetadata, ...baseline, purpose: Type.Union([Type.Literal("self_check"), Type.Literal("independent")]),
  task_id: InternalIdSchema, definition_ref: versionedReferenceSchema("task_definition"), work_item_ref: referenceSchema("work_item"),
  requirement_set_ref: referenceSchema("requirement_set_record"), context_ref: Type.Optional(referenceSchema("evaluation_context")),
  input_digest: DigestSchema, evidence_refs: Type.Array(referenceSchema("evidence"), { uniqueItems: true }), disposition_refs: Type.Optional(Type.Array(referenceSchema("decision"), { minItems: 1, uniqueItems: true })), outcome: GateOutcomeSchema,
  reasons: Type.Array(text), assessments: Type.Array(Type.Object({ key: text, result,
    evidence_refs: Type.Array(referenceSchema("evidence"), { uniqueItems: true }) }, { additionalProperties: false }), { minItems: 1 }) }, { additionalProperties: false });
export const DeferredVerificationSchema = Type.Object({ acceptance_key: text, reason: text, responsible_actor_id: InternalIdSchema,
  environment: Type.Union([Type.Literal("test"), Type.Literal("production")]), next_check_at: UtcTimestampSchema, method: text,
  required_before: Type.Union([Type.Literal("before_release"), Type.Literal("before_change_complete"), Type.Literal("before_batch_end")]) }, { additionalProperties: false });
const gateEvaluationSchema = Type.Object({ ...RecordMetadata, ...baseline, purpose: Type.Literal("safe_integration"), policy_snapshot_ref: referenceSchema("policy_snapshot"),
  input_digest: DigestSchema, task_evaluation_refs: Type.Array(referenceSchema("evaluation"), { uniqueItems: true }),
  evidence_refs: Type.Array(referenceSchema("evidence"), { uniqueItems: true }), deferred_checks: Type.Array(DeferredVerificationSchema),
  outcome: GateOutcomeSchema, reasons: Type.Array(text), professional_decision_ref: Type.Optional(referenceSchema("decision")) }, { additionalProperties: false });
export type TaskEvaluation = Static<typeof taskEvaluationSchema>;
export type GateEvaluation = Static<typeof gateEvaluationSchema>;
export type Evaluation = TaskEvaluation | GateEvaluation;
export const EvaluationSchema = Type.Unsafe<Evaluation>(Type.Union([taskEvaluationSchema, gateEvaluationSchema]));
const taskSatisfactionRecordSchema = Type.Object({ ...RecordMetadata, ...baseline, task_id: InternalIdSchema, definition_ref: versionedReferenceSchema("task_definition"),
  work_item_ref: referenceSchema("work_item"), evaluation_ref: referenceSchema("evaluation"), assignment_ref: referenceSchema("assignment"), task_revision: Type.Integer({ minimum: 1 }) }, { additionalProperties: false });
export type TaskSatisfactionRecord = Static<typeof taskSatisfactionRecordSchema>;
export const TaskSatisfactionRecordSchema = Type.Unsafe<TaskSatisfactionRecord>(taskSatisfactionRecordSchema);
const integrationReadinessRecordSchema = Type.Object({ ...RecordMetadata, ...baseline, evaluation_ref: referenceSchema("evaluation"),
  input_digest: DigestSchema, assignment_ref: referenceSchema("assignment"), deferred_checks: Type.Array(DeferredVerificationSchema),
  change_revision: Type.Integer({ minimum: 1 }) }, { additionalProperties: false });
export type IntegrationReadinessRecord = Static<typeof integrationReadinessRecordSchema>;
export const IntegrationReadinessRecordSchema = Type.Unsafe<IntegrationReadinessRecord>(integrationReadinessRecordSchema);
export const verificationRecordSchemas = { source_snapshot: SourceSnapshotSchema, evidence: EvidenceSchema, policy_snapshot: PolicySnapshotSchema,
  requirement_set_record: RequirementSetRecordSchema, evaluation_context: EvaluationContextSchema, evaluation: EvaluationSchema,
  task_satisfaction_record: TaskSatisfactionRecordSchema, integration_readiness_record: IntegrationReadinessRecordSchema };
export type VerificationRecords = { source_snapshot: SourceSnapshot; evidence: Evidence; policy_snapshot: PolicySnapshot; requirement_set_record: RequirementSetRecord;
  evaluation_context: EvaluationContext; evaluation: Evaluation; task_satisfaction_record: TaskSatisfactionRecord; integration_readiness_record: IntegrationReadinessRecord };
export type VerificationRecordType = keyof VerificationRecords;
const verificationShowResultSchema = Type.Object({ schema_version: Type.Literal(SCHEMA_VERSION), ok: Type.Literal(true),
  source_snapshots: Type.Array(SourceSnapshotSchema), evidence: Type.Array(EvidenceSchema), policy_snapshots: Type.Array(PolicySnapshotSchema),
  requirement_sets: Type.Array(RequirementSetRecordSchema), contexts: Type.Array(EvaluationContextSchema), evaluations: Type.Array(EvaluationSchema),
  satisfactions: Type.Array(TaskSatisfactionRecordSchema), integration_readiness: Type.Array(IntegrationReadinessRecordSchema),
  as_of_event_sequence: Type.Integer({ minimum: 0 }) }, { additionalProperties: false });
export type VerificationShowResult = Static<typeof verificationShowResultSchema>;
export const VerificationShowResultSchema = Type.Unsafe<VerificationShowResult>(verificationShowResultSchema);
