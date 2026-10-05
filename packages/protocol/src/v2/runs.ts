import { Type, type Static } from "typebox";
import { DigestSchema, InternalIdSchema, ProjectMutableMetadata, RecordMetadata, UtcTimestampSchema, referenceSchema, versionedReferenceSchema } from "./common.js";
import { TaskUsageSchema } from "./execution.js";
const count = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const text = Type.String({ minLength: 1, maxLength: 4000 });
const oid = Type.String({ pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" });
export const contentReferenceSchema = <const T extends string>(resourceType: T) => Type.Object({ provider: Type.Literal("local_content"), resource_type: Type.Literal(resourceType),
  locator: Type.String({ pattern: "^[0-9a-f]{64}$" }), digest: DigestSchema }, { additionalProperties: false });
export const RunRawReferenceSchema = contentReferenceSchema("manual_run");
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
export type ContextManifest = Static<typeof contextManifestSchema>;
export const ContextManifestSchema = Type.Unsafe<ContextManifest>(contextManifestSchema);
export const RunStatusSchema = Type.Union([Type.Literal("Reserved"), Type.Literal("Running"), Type.Literal("Succeeded"), Type.Literal("Failed"), Type.Literal("Cancelled"), Type.Literal("Unknown"), Type.Literal("NotStarted")]);
export const RunObservationStatusSchema = Type.Union([Type.Literal("running"), Type.Literal("succeeded"), Type.Literal("failed"), Type.Literal("cancelled"), Type.Literal("unknown"), Type.Literal("not_started")]);
const runRecordSchema = Type.Object({ ...common, run_id: InternalIdSchema, run_kind: Type.Literal("human"), attempt_no: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  operation_key: InternalIdSchema, context_ref: referenceSchema("context_manifest"), source_snapshot_ref: referenceSchema("source_snapshot"), workspace_before_ref: referenceSchema("workspace_snapshot"),
  executor_ref: referenceSchema("actor"), reserved_at: UtcTimestampSchema, input_digest: DigestSchema, reserved_cost_micros: count,
  cost_currency: Type.Optional(Type.String({ pattern: "^[A-Z]{3}$" })), resumption_ref: Type.Optional(referenceSchema("resumption_record")) }, { additionalProperties: false });
export type RunRecord = Static<typeof runRecordSchema>;
export const RunRecordSchema = Type.Unsafe<RunRecord>(runRecordSchema);
const runSchema = Type.Object({ ...ProjectMutableMetadata, change_id: InternalIdSchema, task_id: InternalIdSchema, work_item_ref: referenceSchema("work_item"),
  record_ref: referenceSchema("run_record"), status: RunStatusSchema, cancel_requested: Type.Boolean(), reservation_released: Type.Boolean(), release_reversed: Type.Optional(Type.Boolean()), cost_charged_micros: count,
  cost_known: Type.Boolean(), latest_observation_ref: Type.Optional(referenceSchema("run_observation")) }, { additionalProperties: false });
export type Run = Static<typeof runSchema>;
export const RunSchema = Type.Unsafe<Run>(runSchema);
const usage = Type.Union([
  Type.Object({ cost_known: Type.Literal(true), cost_micros: count, currency: Type.Optional(Type.String({ pattern: "^[A-Z]{3}$" })) }, { additionalProperties: false }),
  Type.Object({ cost_known: Type.Literal(false) }, { additionalProperties: false })
]);
const rawRunObservationSchema = Type.Object({ format: Type.Literal("cimiloop/manual-run/1.0.0"), run_id: InternalIdSchema, operation_key: InternalIdSchema,
  producer_actor_id: InternalIdSchema, observed_at: UtcTimestampSchema, input_digest: DigestSchema,
  basis: Type.Union([Type.Literal("direct_observation"), Type.Literal("reconciliation")]), status: RunObservationStatusSchema, usage,
  method: text, observation: text, resolves_observation_refs: Type.Array(referenceSchema("run_observation"), { uniqueItems: true }) }, { additionalProperties: false });
export type RawRunObservation = Static<typeof rawRunObservationSchema>;
export const RawRunObservationSchema = Type.Unsafe<RawRunObservation>(rawRunObservationSchema);
const runObservationSchema = Type.Object({ ...common, run_ref: referenceSchema("run"), raw_result_ref: RunRawReferenceSchema, report: RawRunObservationSchema,
  received_at: UtcTimestampSchema, workspace_received_ref: referenceSchema("workspace_snapshot"),
  applicability: Type.Union([Type.Literal("current"), Type.Literal("stale"), Type.Literal("late"), Type.Literal("conflicting")]), resulting_status: RunStatusSchema }, { additionalProperties: false });
export type RunObservation = Static<typeof runObservationSchema>;
export const RunObservationSchema = Type.Unsafe<RunObservation>(runObservationSchema);
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
  run_observation: RunObservationSchema, handoff_record: HandoffRecordSchema, resumption_record: ResumptionRecordSchema };
export type RuntimeRecords = { workspace_snapshot: WorkspaceSnapshot; context_manifest: ContextManifest; run_record: RunRecord; run_observation: RunObservation; handoff_record: HandoffRecord; resumption_record: ResumptionRecord };
export type RuntimeRecordType = keyof RuntimeRecords;
const runShowResultSchema = Type.Object({ schema_version: Type.Literal("2.0.0"), ok: Type.Literal(true), runs: Type.Array(RunSchema),
  workspaces: Type.Array(WorkspaceSnapshotSchema), contexts: Type.Array(ContextManifestSchema), records: Type.Array(RunRecordSchema), observations: Type.Array(RunObservationSchema),
  handoffs: Type.Array(HandoffRecordSchema), resumptions: Type.Array(ResumptionRecordSchema), as_of_event_sequence: count }, { additionalProperties: false });
export type RunShowResult = Static<typeof runShowResultSchema>;
export const RunShowResultSchema = Type.Unsafe<RunShowResult>(runShowResultSchema);
