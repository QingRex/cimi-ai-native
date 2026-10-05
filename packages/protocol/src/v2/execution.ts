import { Type, type Static } from "typebox";
import { DigestSchema, InternalIdSchema, ProjectMutableMetadata, RecordMetadata, ScopeSchema, UtcTimestampSchema, referenceSchema, versionedReferenceSchema } from "./common.js";
import { TaskDefinitionSchema } from "./intent.js";

const safeCount = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const positiveCount = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
export const ExecutionActionSchema = Type.Union([Type.Literal("read_files"), Type.Literal("edit_files"), Type.Literal("run_checks")]);
export const ExecutionBudgetSchema = Type.Object({ max_attempts: positiveCount, max_elapsed_ms: positiveCount,
  max_cost: Type.Optional(Type.Object({ currency: Type.String({ pattern: "^[A-Z]{3}$" }), amount_micros: positiveCount }, { additionalProperties: false })) }, { additionalProperties: false });
export const TaskUsageSchema = Type.Object({ attempts_consumed: safeCount, attempts_released: Type.Optional(safeCount), attempt_releases_reversed: Type.Optional(safeCount), first_started_at: Type.Optional(UtcTimestampSchema), cost_known: Type.Boolean(),
  cost_consumed_micros: Type.Optional(safeCount), cost_reserved_micros: Type.Optional(safeCount), cost_currency: Type.Optional(Type.String({ pattern: "^[A-Z]{3}$" })), pending_reconciliation: Type.Boolean() }, { additionalProperties: false });
const taskDefinitionRecordSchema = Type.Object({ ...RecordMetadata, task_id: InternalIdSchema, version: positiveCount, change_id: InternalIdSchema,
  plan_ref: versionedReferenceSchema("plan_version"), content_digest: DigestSchema, body: TaskDefinitionSchema }, { additionalProperties: false });
export type TaskDefinitionRecord = Static<typeof taskDefinitionRecordSchema>;
export const TaskDefinitionRecordSchema = Type.Unsafe<TaskDefinitionRecord>(taskDefinitionRecordSchema);
const taskSchema = Type.Object({ ...ProjectMutableMetadata, change_id: InternalIdSchema, scope: ScopeSchema,
  definition_ref: versionedReferenceSchema("task_definition"), contract_ref: versionedReferenceSchema("contract_version"), plan_ref: versionedReferenceSchema("plan_version"),
  status: Type.Union([Type.Literal("Pending"), Type.Literal("InProgress"), Type.Literal("Satisfied"), Type.Literal("Cancelled")]),
  active_work_item_ref: Type.Optional(referenceSchema("work_item")), active_run_ref: Type.Optional(referenceSchema("run")), result_evaluation_ref: Type.Optional(referenceSchema("evaluation")),
  usage: TaskUsageSchema }, { additionalProperties: false });
export type Task = Static<typeof taskSchema>;
export const TaskSchema = Type.Unsafe<Task>(taskSchema);
export const StandingAuthorizationBodySchema = Type.Object({ scope: ScopeSchema, executor_actor_ids: Type.Array(InternalIdSchema, { minItems: 1, uniqueItems: true }),
  allowed_actions: Type.Array(ExecutionActionSchema, { minItems: 1, uniqueItems: true }), allowed_resources: Type.Array(Type.String({ minLength: 1, maxLength: 400 }), { minItems: 1, uniqueItems: true }),
  environment_ids: Type.Array(InternalIdSchema, { maxItems: 0 }), risk_conditions: Type.Object({ allowed_levels: Type.Array(Type.Literal("ordinary"), { minItems: 1, maxItems: 1 }),
    allowed_purposes: Type.Array(Type.Union([Type.Literal("implementation"), Type.Literal("verification"), Type.Literal("knowledge"), Type.Literal("synchronization"), Type.Literal("learning")]), { minItems: 1, uniqueItems: true }) }, { additionalProperties: false }),
  valid_from: UtcTimestampSchema, expires_at: UtcTimestampSchema, limits: ExecutionBudgetSchema }, { additionalProperties: false });
const standingAuthorizationVersionSchema = Type.Object({ ...RecordMetadata, authorization_id: InternalIdSchema, version: positiveCount,
  source_project_revision: positiveCount,
  predecessor_ref: Type.Optional(versionedReferenceSchema("standing_authorization_version")), body: StandingAuthorizationBodySchema,
  grantor_actor_id: InternalIdSchema, policy_assignment_ref: referenceSchema("assignment"), technical_assignment_ref: referenceSchema("assignment") }, { additionalProperties: false });
export type StandingAuthorizationVersion = Static<typeof standingAuthorizationVersionSchema>;
export const StandingAuthorizationVersionSchema = Type.Unsafe<StandingAuthorizationVersion>(standingAuthorizationVersionSchema);
const standingAuthorizationSchema = Type.Object({ ...ProjectMutableMetadata, scope: ScopeSchema, current_version_ref: versionedReferenceSchema("standing_authorization_version"),
  status: Type.Union([Type.Literal("Active"), Type.Literal("Revoked")]) }, { additionalProperties: false });
export type StandingAuthorization = Static<typeof standingAuthorizationSchema>;
export const StandingAuthorizationSchema = Type.Unsafe<StandingAuthorization>(standingAuthorizationSchema);
const authorizationRevocationRecordSchema = Type.Object({ ...RecordMetadata, authorization_ref: versionedReferenceSchema("standing_authorization_version"),
  affected_scope: ScopeSchema, revoked_by: InternalIdSchema, revoked_at: UtcTimestampSchema, reason: Type.String({ minLength: 1, maxLength: 2000 }), assignment_ref: referenceSchema("assignment") }, { additionalProperties: false });
export type AuthorizationRevocationRecord = Static<typeof authorizationRevocationRecordSchema>;
export const AuthorizationRevocationRecordSchema = Type.Unsafe<AuthorizationRevocationRecord>(authorizationRevocationRecordSchema);
const workItemFields = { ...ProjectMutableMetadata, task_id: InternalIdSchema, change_id: InternalIdSchema, scope: ScopeSchema,
  definition_ref: versionedReferenceSchema("task_definition"), contract_ref: versionedReferenceSchema("contract_version"), plan_ref: versionedReferenceSchema("plan_version"), executor_ref: referenceSchema("actor"),
  authorization_basis_refs: Type.Array(Type.Union([versionedReferenceSchema("standing_authorization_version"), referenceSchema("work_item_authorization_record")]), { minItems: 1, maxItems: 1 }),
  policy_version: Type.Literal("work-item/1.0.0"), allowed_actions: Type.Array(ExecutionActionSchema, { minItems: 1, uniqueItems: true }),
  allowed_resources: Type.Array(Type.String({ minLength: 1, maxLength: 400 }), { minItems: 1, uniqueItems: true }), budget: ExecutionBudgetSchema,
  inherited_usage: TaskUsageSchema, stop_conditions: Type.Array(Type.String({ minLength: 1, maxLength: 2000 }), { minItems: 1, uniqueItems: true }), independence_required: Type.Boolean() };
const workItemSchema = Type.Union([
  Type.Object({ ...workItemFields, status: Type.Union([Type.Literal("Ready"), Type.Literal("Active"), Type.Literal("Closed")]) }, { additionalProperties: false }),
  Type.Object({ ...workItemFields, status: Type.Literal("Revoked"), revoked_at: UtcTimestampSchema, revocation_reason: Type.String({ minLength: 1, maxLength: 2000 }) }, { additionalProperties: false })
]);
export type WorkItem = Static<typeof workItemSchema>;
export const WorkItemSchema = Type.Unsafe<WorkItem>(workItemSchema);
const workItemAuthorizationRecordSchema = Type.Object({ ...RecordMetadata, work_item_id: InternalIdSchema, task_id: InternalIdSchema, change_id: InternalIdSchema,
  grantor_actor_id: InternalIdSchema, assignment_ref: referenceSchema("assignment"), acknowledged_usage_digest: DigestSchema,
  definition_ref: versionedReferenceSchema("task_definition"), contract_ref: versionedReferenceSchema("contract_version"), plan_ref: versionedReferenceSchema("plan_version"),
  executor_ref: referenceSchema("actor"), allowed_actions: workItemFields.allowed_actions, allowed_resources: workItemFields.allowed_resources,
  budget: ExecutionBudgetSchema, stop_conditions: workItemFields.stop_conditions, reason: Type.String({ minLength: 1, maxLength: 2000 }) }, { additionalProperties: false });
export type WorkItemAuthorizationRecord = Static<typeof workItemAuthorizationRecordSchema>;
export const WorkItemAuthorizationRecordSchema = Type.Unsafe<WorkItemAuthorizationRecord>(workItemAuthorizationRecordSchema);
export const TaskReadinessSchema = Type.Object({ task_id: InternalIdSchema, ready: Type.Boolean(), reasons: Type.Array(Type.String()), usage_digest: DigestSchema,
    budget_remaining: Type.Union([Type.Object({ attempts: safeCount, elapsed_ms: safeCount, cost_micros: Type.Union([safeCount, Type.Null()]) }, { additionalProperties: false }), Type.Null()]) }, { additionalProperties: false });
const executionShowResultSchema = Type.Object({ schema_version: Type.Literal("2.0.0"), ok: Type.Literal(true),
  tasks: Type.Array(TaskSchema), definitions: Type.Array(TaskDefinitionRecordSchema), work_items: Type.Array(WorkItemSchema),
  authorizations: Type.Array(StandingAuthorizationSchema), authorization_versions: Type.Array(StandingAuthorizationVersionSchema),
  authorization_revocations: Type.Array(AuthorizationRevocationRecordSchema), work_item_authorizations: Type.Array(WorkItemAuthorizationRecordSchema),
  readiness: Type.Array(TaskReadinessSchema),
  as_of_event_sequence: safeCount }, { additionalProperties: false });
export type ExecutionShowResult = Static<typeof executionShowResultSchema>;
export const ExecutionShowResultSchema = Type.Unsafe<ExecutionShowResult>(executionShowResultSchema);
export const executionObjectSchemas = { task: TaskSchema, work_item: WorkItemSchema, standing_authorization: StandingAuthorizationSchema };
export const executionRecordSchemas = { task_definition: TaskDefinitionRecordSchema, standing_authorization_version: StandingAuthorizationVersionSchema,
  authorization_revocation_record: AuthorizationRevocationRecordSchema, work_item_authorization_record: WorkItemAuthorizationRecordSchema };
export type ExecutionObjectType = keyof typeof executionObjectSchemas;
export type ExecutionRecordType = keyof typeof executionRecordSchemas;

export type StandingAuthorizationBody = Static<typeof StandingAuthorizationBodySchema>;

export type ExecutionBudget = Static<typeof ExecutionBudgetSchema>;
export type TaskUsage = Static<typeof TaskUsageSchema>;

export type ExecutionObjects = { task: Task; work_item: WorkItem; standing_authorization: StandingAuthorization };
export type ExecutionRecords = { task_definition: TaskDefinitionRecord; standing_authorization_version: StandingAuthorizationVersion;
  authorization_revocation_record: AuthorizationRevocationRecord; work_item_authorization_record: WorkItemAuthorizationRecord };
