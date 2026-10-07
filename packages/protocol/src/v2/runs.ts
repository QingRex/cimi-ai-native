import { Type, type Static } from "typebox";
import { DigestSchema, InternalIdSchema, ProjectMutableMetadata, RecordMetadata, UtcTimestampSchema, referenceSchema, versionedReferenceSchema } from "./common.js";
import { TaskUsageSchema } from "./execution.js";
import { NamedSkillMethodRequestSchema } from "./fixed-method.js";
import { SkillMethodOutputSchema, SkillPackageReferenceSchema } from "./skills.js";
import { CapabilityReferenceSchema, SchemaReferenceSchema } from "./providers.js";
const count = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const text = Type.String({ minLength: 1, maxLength: 4000 });
const oid = Type.String({ pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" });
export const contentReferenceSchema = <const T extends string>(resourceType: T) => Type.Object({ provider: Type.Literal("local_content"), resource_type: Type.Literal(resourceType),
  locator: Type.String({ pattern: "^[0-9a-f]{64}$" }), digest: DigestSchema }, { additionalProperties: false });
export const RunRawReferenceSchema = contentReferenceSchema("manual_run");
export const AgentRunRawReferenceSchema = contentReferenceSchema("agent_run");
export const AgentHostAdmissionReferenceSchema = contentReferenceSchema("agent_host_admission");
export const AgentRunProofReferenceSchema = contentReferenceSchema("agent_run_proof");
export const AnyRunRawReferenceSchema = Type.Union([RunRawReferenceSchema, AgentRunRawReferenceSchema]);
export const RunBindingPinSchema = Type.Object({ binding_ref: referenceSchema("provider_binding"), digest: DigestSchema }, { additionalProperties: false });
export const AgentRunBindingsSchema = Type.Object({ runtime_binding: RunBindingPinSchema,
  skill_bindings: Type.Array(RunBindingPinSchema, { maxItems: 8, uniqueItems: true }) }, { additionalProperties: false });
export type AgentRunBindings = Static<typeof AgentRunBindingsSchema>;
export const WorkspaceManifestReferenceSchema = contentReferenceSchema("workspace_manifest");
export const WorkspaceFileReferenceSchema = contentReferenceSchema("workspace_file");
export const WorkspaceDiffReferenceSchema = contentReferenceSchema("workspace_diff");
const file = Type.Union([
  Type.Object({ path: text, state: Type.Literal("present"), content_ref: WorkspaceFileReferenceSchema }, { additionalProperties: false }),
  Type.Object({ path: text, state: Type.Literal("deleted") }, { additionalProperties: false })
]);
const workspaceManifestSchema = Type.Object({ format: Type.Literal("cimiloop/workspace/1.0.0"), project_id: InternalIdSchema,
  head_commit_id: oid, head_source_digest: DigestSchema, allowed_resources: Type.Array(text, { minItems: 1, uniqueItems: true }),
  worktree_diff_ref: WorkspaceDiffReferenceSchema, index_diff_ref: WorkspaceDiffReferenceSchema, files: Type.Array(file) }, { additionalProperties: false });
export type WorkspaceManifest = Static<typeof workspaceManifestSchema>;
export const WorkspaceManifestSchema = Type.Unsafe<WorkspaceManifest>(workspaceManifestSchema);
const common = { ...RecordMetadata, change_id: InternalIdSchema, task_id: InternalIdSchema, work_item_ref: referenceSchema("work_item"),
  definition_ref: versionedReferenceSchema("task_definition"), contract_ref: versionedReferenceSchema("contract_version"), plan_ref: versionedReferenceSchema("plan_version") };
const workspaceSnapshotSchema = Type.Object({ ...common, source_snapshot_ref: referenceSchema("source_snapshot"), head_commit_id: oid,
  state_digest: DigestSchema, manifest_ref: WorkspaceManifestReferenceSchema }, { additionalProperties: false });
export type WorkspaceSnapshot = Static<typeof workspaceSnapshotSchema>;
export const WorkspaceSnapshotSchema = Type.Unsafe<WorkspaceSnapshot>(workspaceSnapshotSchema);
const contextManifestSchema = Type.Object({ ...common, source_snapshot_ref: referenceSchema("source_snapshot"), workspace_snapshot_ref: referenceSchema("workspace_snapshot"),
  executor_ref: referenceSchema("actor"), boundary: Type.Union([Type.Literal("manual_scoped"), Type.Literal("manual_independent_read_only")]),
  input_refs: Type.Array(Type.Union([referenceSchema("source_snapshot"), referenceSchema("workspace_snapshot"), versionedReferenceSchema("contract_version"), versionedReferenceSchema("plan_version"), versionedReferenceSchema("task_definition")]), { minItems: 5, maxItems: 5, uniqueItems: true }),
  allowed_actions: Type.Array(Type.Union([Type.Literal("read_files"), Type.Literal("edit_files"), Type.Literal("run_checks")]), { minItems: 1, uniqueItems: true }),
  allowed_resources: Type.Array(text, { minItems: 1, uniqueItems: true }), input_digest: DigestSchema }, { additionalProperties: false });
export const HumanContextManifestSchema = contextManifestSchema;
export type HumanContextManifest = Static<typeof HumanContextManifestSchema>;
export const AgentContextManifestSchema = Type.Object({ ...contextManifestSchema.properties,
  boundary: Type.Union([Type.Literal("agent_scoped"), Type.Literal("agent_independent_read_only")]),
  ...AgentRunBindingsSchema.properties, host_admission_ref: AgentHostAdmissionReferenceSchema }, { additionalProperties: false });
export type AgentContextManifest = Static<typeof AgentContextManifestSchema>;
export const ContextManifestSchema = Type.Union([HumanContextManifestSchema, AgentContextManifestSchema]);
export type ContextManifest = Static<typeof ContextManifestSchema>;
export const RunStatusSchema = Type.Union([Type.Literal("Reserved"), Type.Literal("Running"), Type.Literal("Succeeded"), Type.Literal("Failed"), Type.Literal("Cancelled"), Type.Literal("Unknown"), Type.Literal("NotStarted")]);
export const RunObservationStatusSchema = Type.Union([Type.Literal("running"), Type.Literal("succeeded"), Type.Literal("failed"), Type.Literal("cancelled"), Type.Literal("unknown"), Type.Literal("not_started")]);
const runRecordSchema = Type.Object({ ...common, run_id: InternalIdSchema, run_kind: Type.Literal("human"), attempt_no: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  operation_key: InternalIdSchema, context_ref: referenceSchema("context_manifest"), source_snapshot_ref: referenceSchema("source_snapshot"), workspace_before_ref: referenceSchema("workspace_snapshot"),
  executor_ref: referenceSchema("actor"), reserved_at: UtcTimestampSchema, input_digest: DigestSchema, reserved_cost_micros: count,
  cost_currency: Type.Optional(Type.String({ pattern: "^[A-Z]{3}$" })), resumption_ref: Type.Optional(referenceSchema("resumption_record")) }, { additionalProperties: false });
export const HumanRunRecordSchema = runRecordSchema;
export type HumanRunRecord = Static<typeof HumanRunRecordSchema>;
export const AgentRunRecordSchema = Type.Object({ ...runRecordSchema.properties, run_kind: Type.Literal("agent"),
  ...AgentRunBindingsSchema.properties, host_admission_ref: AgentHostAdmissionReferenceSchema }, { additionalProperties: false });
export type AgentRunRecord = Static<typeof AgentRunRecordSchema>;
export const RunRecordSchema = Type.Union([HumanRunRecordSchema, AgentRunRecordSchema]);
export type RunRecord = Static<typeof RunRecordSchema>;
const runSchema = Type.Object({ ...ProjectMutableMetadata, change_id: InternalIdSchema, task_id: InternalIdSchema, work_item_ref: referenceSchema("work_item"),
  record_ref: referenceSchema("run_record"), status: RunStatusSchema, cancel_requested: Type.Boolean(), reservation_released: Type.Boolean(), release_reversed: Type.Optional(Type.Boolean()), cost_charged_micros: count,
  cost_known: Type.Boolean(), latest_observation_ref: Type.Optional(referenceSchema("run_observation")) }, { additionalProperties: false });
export type Run = Static<typeof runSchema>;
export const RunSchema = Type.Unsafe<Run>(runSchema);
const usage = Type.Union([
  Type.Object({ cost_known: Type.Literal(true), cost_micros: count, currency: Type.Optional(Type.String({ pattern: "^[A-Z]{3}$" })) }, { additionalProperties: false }),
  Type.Object({ cost_known: Type.Literal(false) }, { additionalProperties: false })
]);
export const SkillMethodInputReferenceSchema = contentReferenceSchema("skill_method_input");
export const SkillMethodQualificationReferenceSchema = contentReferenceSchema("skill_method_qualification");
export const SkillInvocationRawReferenceSchema = contentReferenceSchema("skill_invocation_report");
export const SkillInvocationProofReferenceSchema = contentReferenceSchema("skill_invocation_proof");
export const SkillInvocationPreparationSchema = Type.Object({ request: NamedSkillMethodRequestSchema,
  package_ref: SkillPackageReferenceSchema, input_schema_ref: SchemaReferenceSchema, output_schema_ref: SchemaReferenceSchema,
  method_qualification_ref: SkillMethodQualificationReferenceSchema }, { additionalProperties: false });
export type SkillInvocationPreparation = Static<typeof SkillInvocationPreparationSchema>;
export const SkillInvocationSchema = Type.Object({ ...common, run_ref: referenceSchema("run"), run_operation_key: InternalIdSchema,
  invocation_key: InternalIdSchema, context_ref: referenceSchema("context_manifest"), executor_ref: referenceSchema("actor"),
  runtime_binding: RunBindingPinSchema, skill_binding: RunBindingPinSchema, host_admission_ref: AgentHostAdmissionReferenceSchema,
  capability: CapabilityReferenceSchema, input_ref: SkillMethodInputReferenceSchema,
  ...SkillInvocationPreparationSchema.properties, input_digest: DigestSchema }, { additionalProperties: false });
export type SkillInvocation = Static<typeof SkillInvocationSchema>;
const skillReportFields = { format: Type.Literal("cimiloop/skill-invocation/1.0.0"), invocation_ref: referenceSchema("skill_invocation"),
  invocation_key: InternalIdSchema, run_ref: referenceSchema("run"), run_operation_key: InternalIdSchema,
  producer_actor_id: InternalIdSchema, input_digest: DigestSchema, observed_at: UtcTimestampSchema,
  basis: Type.Union([Type.Literal("direct_observation"), Type.Literal("reconciliation")]), usage,
  result_proof_ref: SkillInvocationProofReferenceSchema,
  resolves_observation_refs: Type.Array(referenceSchema("skill_invocation_observation"), { uniqueItems: true, maxItems: 256 }) };
export const RawSkillInvocationObservationSchema = Type.Union([
  Type.Object({ ...skillReportFields, status: Type.Literal("succeeded"), output: SkillMethodOutputSchema }, { additionalProperties: false }),
  Type.Object({ ...skillReportFields, status: Type.Union([Type.Literal("running"), Type.Literal("failed"), Type.Literal("cancelled"),
    Type.Literal("unknown"), Type.Literal("not_started")]) }, { additionalProperties: false })
]);
export type RawSkillInvocationObservation = Static<typeof RawSkillInvocationObservationSchema>;
export const SkillInvocationObservationSchema = Type.Object({ ...common, invocation_ref: referenceSchema("skill_invocation"),
  raw_result_ref: SkillInvocationRawReferenceSchema, report: RawSkillInvocationObservationSchema,
  received_at: UtcTimestampSchema, applicability: Type.Union([Type.Literal("current"), Type.Literal("late"), Type.Literal("conflicting")]),
  resulting_status: RunStatusSchema }, { additionalProperties: false });
export type SkillInvocationObservation = Static<typeof SkillInvocationObservationSchema>;
const rawRunObservationSchema = Type.Object({ format: Type.Literal("cimiloop/manual-run/1.0.0"), run_id: InternalIdSchema, operation_key: InternalIdSchema,
  producer_actor_id: InternalIdSchema, observed_at: UtcTimestampSchema, input_digest: DigestSchema,
  basis: Type.Union([Type.Literal("direct_observation"), Type.Literal("reconciliation")]), status: RunObservationStatusSchema, usage,
  method: text, observation: text, resolves_observation_refs: Type.Array(referenceSchema("run_observation"), { uniqueItems: true }) }, { additionalProperties: false });
export const RawHumanRunObservationSchema = rawRunObservationSchema;
export type RawHumanRunObservation = Static<typeof RawHumanRunObservationSchema>;
export const RawAgentRunObservationSchema = Type.Object({ ...rawRunObservationSchema.properties, format: Type.Literal("cimiloop/agent-run/1.0.0"),
  context_ref: referenceSchema("context_manifest"), ...AgentRunBindingsSchema.properties,
  host_admission_ref: AgentHostAdmissionReferenceSchema, result_proof_ref: AgentRunProofReferenceSchema }, { additionalProperties: false });
export type RawAgentRunObservation = Static<typeof RawAgentRunObservationSchema>;
export const RawRunObservationSchema = Type.Union([RawHumanRunObservationSchema, RawAgentRunObservationSchema]);
export type RawRunObservation = Static<typeof RawRunObservationSchema>;
const runObservationSchema = Type.Object({ ...common, run_ref: referenceSchema("run"), raw_result_ref: RunRawReferenceSchema, report: RawHumanRunObservationSchema,
  received_at: UtcTimestampSchema, workspace_received_ref: referenceSchema("workspace_snapshot"),
  applicability: Type.Union([Type.Literal("current"), Type.Literal("stale"), Type.Literal("late"), Type.Literal("conflicting")]), resulting_status: RunStatusSchema }, { additionalProperties: false });
export const HumanRunObservationSchema = runObservationSchema;
export type HumanRunObservation = Static<typeof HumanRunObservationSchema>;
export const AgentRunObservationSchema = Type.Object({ ...runObservationSchema.properties,
  raw_result_ref: AgentRunRawReferenceSchema, report: RawAgentRunObservationSchema }, { additionalProperties: false });
export const RunObservationSchema = Type.Union([HumanRunObservationSchema, AgentRunObservationSchema]);
export type RunObservation = Static<typeof RunObservationSchema>;
export const RemainingRunBudgetSchema = Type.Object({ attempts: count, elapsed_ms: count, cost_micros: Type.Union([count, Type.Null()]) }, { additionalProperties: false });
const handoffRecordSchema = Type.Object({ ...common, source_snapshot_ref: referenceSchema("source_snapshot"), workspace_snapshot_ref: referenceSchema("workspace_snapshot"),
  run_ref: Type.Optional(referenceSchema("run")), next_actor_ref: referenceSchema("actor"), completed: Type.Array(text), unresolved: Type.Array(text), next_action: text,
  evidence_refs: Type.Array(referenceSchema("evidence"), { uniqueItems: true }), usage_snapshot: TaskUsageSchema, budget_remaining: RemainingRunBudgetSchema }, { additionalProperties: false });
export type HandoffRecord = Static<typeof handoffRecordSchema>;
export const HandoffRecordSchema = Type.Unsafe<HandoffRecord>(handoffRecordSchema);
const resumptionRecordSchema = Type.Object({ ...common, handoff_ref: referenceSchema("handoff_record"), context_ref: referenceSchema("context_manifest"),
  source_snapshot_ref: referenceSchema("source_snapshot"), workspace_snapshot_ref: referenceSchema("workspace_snapshot"), usage_digest: DigestSchema,
  input_digest: DigestSchema, budget_remaining: RemainingRunBudgetSchema }, { additionalProperties: false });
export type ResumptionRecord = Static<typeof resumptionRecordSchema>;
export const ResumptionRecordSchema = Type.Unsafe<ResumptionRecord>(resumptionRecordSchema);
export const runtimeRecordSchemas = { workspace_snapshot: WorkspaceSnapshotSchema, context_manifest: ContextManifestSchema, run_record: RunRecordSchema,
  run_observation: RunObservationSchema, handoff_record: HandoffRecordSchema, resumption_record: ResumptionRecordSchema,
  skill_invocation: SkillInvocationSchema, skill_invocation_observation: SkillInvocationObservationSchema };
// Format 7–9 contain only the original Human run shapes.
export const humanRuntimeRecordSchemas = { workspace_snapshot: WorkspaceSnapshotSchema, context_manifest: HumanContextManifestSchema,
  run_record: HumanRunRecordSchema, run_observation: HumanRunObservationSchema, handoff_record: HandoffRecordSchema, resumption_record: ResumptionRecordSchema };
export type RuntimeRecords = { workspace_snapshot: WorkspaceSnapshot; context_manifest: ContextManifest; run_record: RunRecord; run_observation: RunObservation; handoff_record: HandoffRecord; resumption_record: ResumptionRecord;
  skill_invocation: SkillInvocation; skill_invocation_observation: SkillInvocationObservation };
export type RuntimeRecordType = keyof RuntimeRecords;
const runShowResultSchema = Type.Object({ schema_version: Type.Literal("2.0.0"), ok: Type.Literal(true), runs: Type.Array(RunSchema),
  workspaces: Type.Array(WorkspaceSnapshotSchema), contexts: Type.Array(ContextManifestSchema), records: Type.Array(RunRecordSchema), observations: Type.Array(RunObservationSchema),
  handoffs: Type.Array(HandoffRecordSchema), resumptions: Type.Array(ResumptionRecordSchema), as_of_event_sequence: count,
  skill_invocations: Type.Optional(Type.Array(SkillInvocationSchema)), skill_observations: Type.Optional(Type.Array(SkillInvocationObservationSchema)) }, { additionalProperties: false });
export type RunShowResult = Static<typeof runShowResultSchema>;
export const RunShowResultSchema = Type.Unsafe<RunShowResult>(runShowResultSchema);
