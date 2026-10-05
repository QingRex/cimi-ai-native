import { Type, type Static, type TSchema } from "typebox";
import { CommandDiagnosticSchema } from "./queries.js";
import {
  ActingRoleSchema, DigestSchema, InternalIdSchema, NonEmptyStringSchema, PositiveIntegerSchema, RoleKeySchema, SCHEMA_VERSION,
  UtcTimestampSchema, TypedReferenceSchema, referenceSchema
} from "./common.js";
import { ActorSchema, AssignmentSchema, ChangeSchema, HumanActorSchema, ProjectSchema } from "./objects.js";
import { ResponsibilityRoleSchema, ProjectSettingsVersionSchema, TargetVersionSchema, PriorityOrderSchema } from "./governance.js";
import { ContractProposalSchema, PlanProposalSchema, ContractVersionSchema, PlanVersionSchema, RiskAssessmentSchema,
  DecisionRequestSchema, DecisionSchema, LifecycleTransitionRecordSchema } from "./intent.js";
import { TaskSchema, TaskDefinitionRecordSchema, WorkItemSchema, StandingAuthorizationSchema, StandingAuthorizationVersionSchema,
  AuthorizationRevocationRecordSchema, WorkItemAuthorizationRecordSchema } from "./execution.js";
import { SourceSnapshotSchema, EvidenceSchema, PolicySnapshotSchema, RequirementSetRecordSchema, EvaluationContextSchema,
  EvaluationSchema, TaskSatisfactionRecordSchema, IntegrationReadinessRecordSchema } from "./verification.js";
import { RunSchema, WorkspaceSnapshotSchema, ContextManifestSchema, RunRecordSchema, RunObservationSchema, HandoffRecordSchema, ResumptionRecordSchema } from "./runs.js";
import { ProviderCandidateDescriptorSchema, ApprovedProviderBindingSchema } from "./providers.js";
import { ProviderEvidenceSchema, ProviderEvaluationSchema } from "./provider-assessment.js";

const eventFields = {
  schema_version: Type.Literal(SCHEMA_VERSION), event_id: InternalIdSchema, project_id: InternalIdSchema,
  aggregate_revision: PositiveIntegerSchema, event_sequence: PositiveIntegerSchema, occurred_at: UtcTimestampSchema,
  actor_id: InternalIdSchema, acting_role: ActingRoleSchema, command_id: InternalIdSchema, correlation_id: InternalIdSchema
};
const changeEventSchema = <const T extends string, P extends TSchema>(eventType: T, payload: P) => Type.Object({
  ...eventFields, event_type: Type.Literal(eventType), aggregate: referenceSchema("change"), payload
}, { additionalProperties: false });
const projectEventSchema = <const T extends string, P extends TSchema>(eventType: T, payload: P) => Type.Object({
  ...eventFields, event_type: Type.Literal(eventType), aggregate: referenceSchema("project"), payload
}, { additionalProperties: false });
const executionEventSchema = <const T extends string, const O extends "task" | "work_item" | "standing_authorization" | "run", P extends TSchema>(eventType: T, objectType: O, payload: P) => Type.Object({
  ...eventFields, event_type: Type.Literal(eventType), aggregate: referenceSchema(objectType), payload
}, { additionalProperties: false });
const eventEnvelopeSchema = Type.Union([
  projectEventSchema("ProviderRegistered", Type.Object({ descriptor: ProviderCandidateDescriptorSchema }, { additionalProperties: false })),
  projectEventSchema("ProviderEvidenceRecorded", Type.Object({ evidence: ProviderEvidenceSchema }, { additionalProperties: false })),
  projectEventSchema("ProviderEvaluated", Type.Object({ evaluation: ProviderEvaluationSchema }, { additionalProperties: false })),
  projectEventSchema("ProviderBindingRegistered", Type.Object({ binding: ApprovedProviderBindingSchema }, { additionalProperties: false })),
  Type.Object({
    ...eventFields, event_type: Type.Literal("ProjectMigrated"), aggregate: referenceSchema("project"),
    payload: Type.Union([
      Type.Object({ from_format: Type.Literal(1), to_format: Type.Union([Type.Literal(2), Type.Literal(3), Type.Literal(4), Type.Literal(5), Type.Literal(6), Type.Literal(7), Type.Literal(8)]),
        migration_id: InternalIdSchema, backup_digest: DigestSchema }, { additionalProperties: false }),
      Type.Object({ from_format: Type.Literal(2), to_format: Type.Union([Type.Literal(3), Type.Literal(4), Type.Literal(5), Type.Literal(6), Type.Literal(7), Type.Literal(8)]),
        migration_id: InternalIdSchema, backup_digest: DigestSchema }, { additionalProperties: false }),
      Type.Object({ from_format: Type.Literal(3), to_format: Type.Union([Type.Literal(4), Type.Literal(5), Type.Literal(6), Type.Literal(7), Type.Literal(8)]),
        migration_id: InternalIdSchema, backup_digest: DigestSchema }, { additionalProperties: false }),
      Type.Object({ from_format: Type.Literal(4), to_format: Type.Union([Type.Literal(5), Type.Literal(6), Type.Literal(7), Type.Literal(8)]),
        migration_id: InternalIdSchema, backup_digest: DigestSchema }, { additionalProperties: false }),
      Type.Object({ from_format: Type.Literal(5), to_format: Type.Union([Type.Literal(6), Type.Literal(7), Type.Literal(8)]),
        migration_id: InternalIdSchema, backup_digest: DigestSchema }, { additionalProperties: false }),
      Type.Object({ from_format: Type.Literal(6), to_format: Type.Union([Type.Literal(7), Type.Literal(8)]),
        migration_id: InternalIdSchema, backup_digest: DigestSchema }, { additionalProperties: false }),
      Type.Object({ from_format: Type.Literal(7), to_format: Type.Literal(8),
        migration_id: InternalIdSchema, backup_digest: DigestSchema }, { additionalProperties: false })
    ])
  }, { additionalProperties: false }),
  Type.Object({
    ...eventFields, event_type: Type.Literal("ProjectInitialized"), aggregate: referenceSchema("project"),
    payload: Type.Object({
      project_name: NonEmptyStringSchema,
      repository_kind: Type.Union([Type.Literal("git"), Type.Literal("directory")])
    }, { additionalProperties: false })
  }, { additionalProperties: false }),
  changeEventSchema("ChangeCreated", Type.Object({
    display_key: Type.String({ pattern: "^CHG-\\d{4,}$" }), lifecycle_state: Type.Literal("Draft"),
    owner_assignment: Type.Optional(AssignmentSchema), requirement_assignment: Type.Optional(AssignmentSchema)
  }, { additionalProperties: false })),
  changeEventSchema("ChangePaused", Type.Object({
    reason: Type.String({ minLength: 1, maxLength: 1000 })
  }, { additionalProperties: false })),
  changeEventSchema("ChangeResumed", Type.Object({ reconciliation_refs: Type.Optional(Type.Array(TypedReferenceSchema, { uniqueItems: true })) }, { additionalProperties: false })),
  projectEventSchema("ActorRegistered", Type.Object({ actor: ActorSchema }, { additionalProperties: false })),
  projectEventSchema("ResponsibilityAssigned", Type.Object({ assignment: AssignmentSchema }, { additionalProperties: false })),
  projectEventSchema("AssignmentEnded", Type.Object({ assignment: AssignmentSchema,
    reason: Type.String({ minLength: 1, maxLength: 1000 })
  }, { additionalProperties: false })),
  changeEventSchema("ChangeResponsibilityTransferred", Type.Object({
    role_key: ResponsibilityRoleSchema, previous_actor_id: Type.Optional(InternalIdSchema), new_actor_id: InternalIdSchema,
    assignment: AssignmentSchema, ended_assignments: Type.Array(AssignmentSchema),
    grant_basis_refs: Type.Array(referenceSchema("assignment"), { minItems: 1, uniqueItems: true }),
    reason: Type.String({ minLength: 1, maxLength: 1000 })
  }, { additionalProperties: false })),
  projectEventSchema("ProjectSettingsUpdated", Type.Object({ settings_version: ProjectSettingsVersionSchema }, { additionalProperties: false })),
  projectEventSchema("TargetVersionCreated", Type.Object({ target_version: TargetVersionSchema }, { additionalProperties: false })),
  projectEventSchema("TargetVersionClosed", Type.Object({ target_version: TargetVersionSchema }, { additionalProperties: false })),
  changeEventSchema("ChangePlanningUpdated", Type.Object({ previous_priority: Type.Integer({ minimum: 0 }), priority: Type.Integer({ minimum: 0 }),
    previous_target_version_id: Type.Optional(InternalIdSchema), target_version_id: Type.Optional(InternalIdSchema),
    arbitration: Type.Boolean(), reason: Type.String({ minLength: 1, maxLength: 1000 })
  }, { additionalProperties: false })),
  changeEventSchema("ContractProposalSubmitted", Type.Object({ proposal: ContractProposalSchema }, { additionalProperties: false })),
  changeEventSchema("PlanProposalSubmitted", Type.Object({ proposal: PlanProposalSchema }, { additionalProperties: false })),
  changeEventSchema("RiskAssessed", Type.Object({ risk_assessment: RiskAssessmentSchema }, { additionalProperties: false })),
  changeEventSchema("DecisionRequested", Type.Object({ request: DecisionRequestSchema }, { additionalProperties: false })),
  changeEventSchema("DecisionRecorded", Type.Object({ decision: DecisionSchema }, { additionalProperties: false })),
  changeEventSchema("ContractConfirmed", Type.Object({ contract_version: ContractVersionSchema,
    lifecycle_transition: Type.Optional(LifecycleTransitionRecordSchema) }, { additionalProperties: false })),
  changeEventSchema("PlanConfirmed", Type.Object({ plan_version: PlanVersionSchema }, { additionalProperties: false })),
  changeEventSchema("ChangeStarted", Type.Object({ lifecycle_transition: LifecycleTransitionRecordSchema }, { additionalProperties: false })),
  changeEventSchema("PlanTasksInitialized", Type.Object({ tasks: Type.Array(TaskSchema), definitions: Type.Array(TaskDefinitionRecordSchema) }, { additionalProperties: false })),
  executionEventSchema("StandingAuthorizationPublished", "standing_authorization", Type.Object({ authorization: StandingAuthorizationSchema, authorization_version: StandingAuthorizationVersionSchema }, { additionalProperties: false })),
  executionEventSchema("StandingAuthorizationRevoked", "standing_authorization", Type.Object({ authorization: StandingAuthorizationSchema, revocation: AuthorizationRevocationRecordSchema }, { additionalProperties: false })),
  executionEventSchema("WorkItemCreated", "task", Type.Object({ task: TaskSchema, work_item: WorkItemSchema, authorization: Type.Optional(WorkItemAuthorizationRecordSchema) }, { additionalProperties: false })),
  executionEventSchema("WorkItemRevoked", "work_item", Type.Object({ task: TaskSchema, work_item: WorkItemSchema }, { additionalProperties: false })),
  changeEventSchema("SourceSnapshotCaptured", Type.Object({ source_snapshot: SourceSnapshotSchema }, { additionalProperties: false })),
  executionEventSchema("EvidenceRecorded", "task", Type.Object({ evidence: EvidenceSchema }, { additionalProperties: false })),
  executionEventSchema("TaskEvaluationPrepared", "task", Type.Object({ policy_snapshot: PolicySnapshotSchema, requirement_set: RequirementSetRecordSchema,
    context: Type.Optional(EvaluationContextSchema), input_digest: DigestSchema }, { additionalProperties: false })),
  executionEventSchema("TaskEvaluated", "task", Type.Object({ evaluation: EvaluationSchema }, { additionalProperties: false })),
  executionEventSchema("TaskSatisfied", "task", Type.Object({ task: TaskSchema, work_item: WorkItemSchema, satisfaction: TaskSatisfactionRecordSchema }, { additionalProperties: false })),
  changeEventSchema("IntegrationEvaluated", Type.Object({ policy_snapshot: PolicySnapshotSchema, evaluation: EvaluationSchema }, { additionalProperties: false })),
  changeEventSchema("ChangeReadyForDelivery", Type.Object({ readiness: IntegrationReadinessRecordSchema, lifecycle_transition: LifecycleTransitionRecordSchema }, { additionalProperties: false })),
  executionEventSchema("RunContextPrepared", "work_item", Type.Object({ workspace: WorkspaceSnapshotSchema, context: ContextManifestSchema }, { additionalProperties: false })),
  executionEventSchema("RunReserved", "task", Type.Object({ task: TaskSchema, work_item: WorkItemSchema, run: RunSchema, record: RunRecordSchema }, { additionalProperties: false })),
  executionEventSchema("RunObserved", "run", Type.Object({ task: TaskSchema, work_item: WorkItemSchema, run: RunSchema, workspace: WorkspaceSnapshotSchema, observation: RunObservationSchema }, { additionalProperties: false })),
  executionEventSchema("RunReconciled", "run", Type.Object({ task: TaskSchema, work_item: WorkItemSchema, run: RunSchema, workspace: WorkspaceSnapshotSchema, observation: RunObservationSchema }, { additionalProperties: false })),
  executionEventSchema("RunCancellationRequested", "run", Type.Object({ task: TaskSchema, run: RunSchema, reason: NonEmptyStringSchema }, { additionalProperties: false })),
  executionEventSchema("HandoffSaved", "work_item", Type.Object({ workspace: WorkspaceSnapshotSchema, handoff: HandoffRecordSchema }, { additionalProperties: false })),
  executionEventSchema("ResumptionChecked", "work_item", Type.Object({ resumption: ResumptionRecordSchema }, { additionalProperties: false }))
]);
// Name the static event union so declarations do not duplicate its full structure
// in every command result. Runtime JSON Schema remains the complete strict union.
export type EventEnvelope = Static<typeof eventEnvelopeSchema>;
export const EventEnvelopeSchema = Type.Unsafe<EventEnvelope>(eventEnvelopeSchema);

export const DOMAIN_ERROR_CODES = [
  "PROTOCOL_VALIDATION_FAILED", "UNSUPPORTED_SCHEMA_VERSION", "UNSUPPORTED_OBJECT_TYPE", "INVALID_COMMAND",
  "PROJECT_NOT_INITIALIZED", "PROJECT_NOT_FOUND", "PROJECT_ALREADY_INITIALIZED", "COMMAND_CONTEXT_REQUIRED",
  "CHANGE_TARGET_REQUIRED", "CHANGE_NOT_FOUND", "CHANGE_OWNER_REQUIRED", "CHANGE_ALREADY_PAUSED", "CHANGE_NOT_PAUSED",
  "COMMAND_ID_REUSED", "REVISION_CONFLICT", "ROLE_NOT_ASSIGNED", "AUTHORIZATION_EXPIRED", "AUTHORIZATION_REVOKED",
  "INPUT_CHANGED", "DECISION_STALE", "WIP_LIMIT_EXCEEDED", "DEPENDENCY_UNSATISFIED", "EVIDENCE_MISSING",
  "INDEPENDENCE_REQUIRED", "BUDGET_EXCEEDED", "BASELINE_MISMATCH", "ENVIRONMENT_BUSY", "OCCUPANCY_EPOCH_MISMATCH",
  "EXTERNAL_RESULT_UNKNOWN", "EXTERNAL_STATE_STALE", "RECOVERY_CONDITIONS_UNMET", "CLOSURE_OBLIGATIONS_PENDING",
  "CAPABILITY_UNAVAILABLE", "CAPABILITY_PERMISSION_DENIED", "PROVIDER_NOT_EVALUATED", "PROVIDER_BINDING_STALE",
  "PROVIDER_OUTPUT_INVALID", "STORE_FAILURE", "MIGRATION_REQUIRED", "MIGRATION_UNSAFE", "DATABASE_TOO_NEW",
  "INTERNAL_ERROR", "CLI_ARGUMENT_INVALID", "CLI_EXECUTION_FAILED", "OBJECT_NOT_FOUND",
  "CALLER_REQUIRED", "CALLER_IDENTITY_MISMATCH", "ACTOR_NOT_FOUND", "HUMAN_RESPONSIBILITY_REQUIRED",
  "ASSIGNMENT_NOT_FOUND", "ASSIGNMENT_ALREADY_ENDED", "ASSIGNMENT_CONFLICT", "ASSIGNMENT_INTERVAL_INVALID",
  "SCOPE_INVALID", "RESPONSIBILITY_HANDOFF_REQUIRED", "GRANT_BASIS_INVALID", "PROJECT_SETTINGS_REQUIRED", "SETTINGS_BASE_CONFLICT",
  "FLOW_OWNER_REQUIRED", "PRIORITY_ARBITER_REQUIRED", "TARGET_VERSION_NOT_FOUND", "TARGET_VERSION_CLOSED", "TARGET_VERSION_NAME_CONFLICT",
  "CHANGE_STATE_INVALID", "PLANNING_UNCHANGED", "PROPOSAL_NOT_FOUND", "PROPOSAL_REVISION_CONFLICT", "PROPOSAL_INVALID",
  "CONTRACT_NOT_FOUND", "PLAN_NOT_FOUND", "PLAN_INVALID", "DECISION_NOT_FOUND", "DECISION_ALREADY_RECORDED", "DECISION_NOT_APPROVED",
  "RISK_ASSESSMENT_REQUIRED", "RISK_DOWNGRADE_FORBIDDEN", "TASK_NOT_FOUND", "TASK_STATE_INVALID", "TASKS_UNCHANGED",
  "WORK_ITEM_NOT_FOUND", "WORK_ITEM_ALREADY_OPEN", "WORK_ITEM_STATE_INVALID", "AUTHORIZATION_NOT_FOUND", "AUTHORIZATION_BASE_CONFLICT",
  "RESOURCE_SCOPE_INVALID", "USAGE_ACKNOWLEDGEMENT_REQUIRED", "EXECUTOR_NOT_ALLOWED", "PROVIDER_VERSION_CONFLICT"
] as const;
export const DomainErrorCodeSchema = Type.Enum(DOMAIN_ERROR_CODES);
export const DomainErrorSchema = Type.Object({
  schema_version: Type.Literal(SCHEMA_VERSION), code: DomainErrorCodeSchema, message: NonEmptyStringSchema,
  category: Type.Union([
    Type.Literal("validation"), Type.Literal("not_found"), Type.Literal("conflict"),
    Type.Literal("forbidden"), Type.Literal("storage"), Type.Literal("internal")
  ]),
  retryable: Type.Boolean(), details: Type.Unsafe<Record<string, unknown>>({ type: "object",
    properties: { diagnostic: CommandDiagnosticSchema }, additionalProperties: true }), correlation_id: InternalIdSchema
}, { additionalProperties: false });

const successFields = {
  schema_version: Type.Literal(SCHEMA_VERSION), ok: Type.Literal(true), command_id: InternalIdSchema,
  correlation_id: InternalIdSchema, revision: PositiveIntegerSchema,
  events: Type.Array(Type.Unsafe<EventEnvelope>({ $ref: "#/$defs/EventEnvelope" }))
};
const changeSuccessSchema = <const T extends string>(commandType: T) => Type.Object({
  ...successFields, command_type: Type.Literal(commandType), aggregate: referenceSchema("change"),
  data: Type.Object({ change: ChangeSchema }, { additionalProperties: false })
}, { additionalProperties: false });
const projectSuccessSchema = <const T extends string, P extends TSchema>(commandType: T, data: P) => Type.Object({
  ...successFields, command_type: Type.Literal(commandType), aggregate: referenceSchema("project"), data
}, { additionalProperties: false });
const intentSuccessSchema = <const T extends string, P extends TSchema>(commandType: T, data: P) => Type.Object({
  ...successFields, command_type: Type.Literal(commandType), aggregate: referenceSchema("change"),
  data
}, { additionalProperties: false });
const executionSuccessSchema = <const T extends string, const O extends "task" | "work_item" | "standing_authorization" | "run", P extends TSchema>(commandType: T, objectType: O, data: P) => Type.Object({
  ...successFields, command_type: Type.Literal(commandType), aggregate: referenceSchema(objectType), data
}, { additionalProperties: false });
const baseSuccessUnionSchema = Type.Union([
  Type.Object({
    ...successFields, command_type: Type.Literal("InitializeProject"), aggregate: referenceSchema("project"),
    data: Type.Object({ project: ProjectSchema, actor: HumanActorSchema, assignment: AssignmentSchema }, { additionalProperties: false })
  }, { additionalProperties: false }),
  changeSuccessSchema("CreateChange"), changeSuccessSchema("PauseChange"), changeSuccessSchema("ResumeChange"),
]);
const governanceSuccessUnionSchema = Type.Union([
  projectSuccessSchema("RegisterProvider", Type.Object({ project: ProjectSchema, descriptor: ProviderCandidateDescriptorSchema }, { additionalProperties: false })),
  projectSuccessSchema("RecordProviderEvidence", Type.Object({ project: ProjectSchema, evidence: ProviderEvidenceSchema }, { additionalProperties: false })),
  projectSuccessSchema("EvaluateProvider", Type.Object({ project: ProjectSchema, evaluation: ProviderEvaluationSchema }, { additionalProperties: false })),
  projectSuccessSchema("RegisterProviderBinding", Type.Object({ project: ProjectSchema, binding: ApprovedProviderBindingSchema }, { additionalProperties: false })),
  projectSuccessSchema("RegisterActor", Type.Object({ project: ProjectSchema, actor: ActorSchema }, { additionalProperties: false })),
  projectSuccessSchema("AssignResponsibility", Type.Object({ project: ProjectSchema, assignment: AssignmentSchema }, { additionalProperties: false })),
  projectSuccessSchema("EndAssignment", Type.Object({ project: ProjectSchema, assignment: AssignmentSchema }, { additionalProperties: false })),
  Type.Object({ ...successFields, command_type: Type.Literal("TransferChangeResponsibility"), aggregate: referenceSchema("change"),
    data: Type.Object({ change: ChangeSchema, assignment: AssignmentSchema, ended_assignments: Type.Array(AssignmentSchema) }, { additionalProperties: false })
  }, { additionalProperties: false }),
]);
const flowSuccessUnionSchema = Type.Union([
  projectSuccessSchema("UpdateProjectSettings", Type.Object({ project: ProjectSchema, settings_version: ProjectSettingsVersionSchema }, { additionalProperties: false })),
  projectSuccessSchema("CreateTargetVersion", Type.Object({ project: ProjectSchema, target_version: TargetVersionSchema }, { additionalProperties: false })),
  projectSuccessSchema("CloseTargetVersion", Type.Object({ project: ProjectSchema, target_version: TargetVersionSchema }, { additionalProperties: false })),
  changeSuccessSchema("ChangePlanning"), changeSuccessSchema("StartChange")
]);
const intentSuccessUnionSchema = Type.Union([
  intentSuccessSchema("SubmitContractProposal", Type.Object({ change: ChangeSchema, proposal: ContractProposalSchema }, { additionalProperties: false })),
  intentSuccessSchema("SubmitPlanProposal", Type.Object({ change: ChangeSchema, proposal: PlanProposalSchema }, { additionalProperties: false })),
  intentSuccessSchema("RecordRiskAssessment", Type.Object({ change: ChangeSchema, risk_assessment: RiskAssessmentSchema }, { additionalProperties: false })),
  intentSuccessSchema("RequestDecision", Type.Object({ change: ChangeSchema, request: DecisionRequestSchema }, { additionalProperties: false })),
  intentSuccessSchema("RecordDecision", Type.Object({ change: ChangeSchema, decision: DecisionSchema }, { additionalProperties: false })),
  intentSuccessSchema("ConfirmContract", Type.Object({ change: ChangeSchema, contract_version: ContractVersionSchema }, { additionalProperties: false })),
  intentSuccessSchema("ConfirmPlan", Type.Object({ change: ChangeSchema, plan_version: PlanVersionSchema }, { additionalProperties: false }))
]);
const executionSuccessUnionSchema = Type.Union([
  intentSuccessSchema("InitializePlanTasks", Type.Object({ change: ChangeSchema, tasks: Type.Array(TaskSchema), definitions: Type.Array(TaskDefinitionRecordSchema) }, { additionalProperties: false })),
  executionSuccessSchema("PublishStandingAuthorization", "standing_authorization", Type.Object({ authorization: StandingAuthorizationSchema, authorization_version: StandingAuthorizationVersionSchema }, { additionalProperties: false })),
  executionSuccessSchema("RevokeStandingAuthorization", "standing_authorization", Type.Object({ authorization: StandingAuthorizationSchema, revocation: AuthorizationRevocationRecordSchema }, { additionalProperties: false })),
  executionSuccessSchema("CreateWorkItem", "task", Type.Object({ task: TaskSchema, work_item: WorkItemSchema }, { additionalProperties: false })),
  executionSuccessSchema("RevokeWorkItem", "work_item", Type.Object({ task: TaskSchema, work_item: WorkItemSchema }, { additionalProperties: false }))
]);
const verificationSuccessUnionSchema = Type.Union([
  intentSuccessSchema("CaptureSourceSnapshot", Type.Object({ source_snapshot: SourceSnapshotSchema }, { additionalProperties: false })),
  executionSuccessSchema("RecordEvidence", "task", Type.Object({ evidence: EvidenceSchema }, { additionalProperties: false })),
  executionSuccessSchema("PrepareTaskEvaluation", "task", Type.Object({ policy_snapshot: PolicySnapshotSchema, requirement_set: RequirementSetRecordSchema,
    context: Type.Optional(EvaluationContextSchema), input_digest: DigestSchema }, { additionalProperties: false })),
  executionSuccessSchema("EvaluateTask", "task", Type.Object({ evaluation: EvaluationSchema }, { additionalProperties: false })),
  executionSuccessSchema("SatisfyTask", "task", Type.Object({ task: TaskSchema, work_item: WorkItemSchema, satisfaction: TaskSatisfactionRecordSchema }, { additionalProperties: false })),
  intentSuccessSchema("EvaluateIntegration", Type.Object({ policy_snapshot: PolicySnapshotSchema, evaluation: EvaluationSchema }, { additionalProperties: false })),
  intentSuccessSchema("MarkReadyForIntegration", Type.Object({ change: ChangeSchema, readiness: IntegrationReadinessRecordSchema }, { additionalProperties: false }))
]);
const runtimeSuccessUnionSchema = Type.Union([
  executionSuccessSchema("PrepareRunContext", "work_item", Type.Object({ workspace: WorkspaceSnapshotSchema, context: ContextManifestSchema }, { additionalProperties: false })),
  executionSuccessSchema("ReserveRun", "task", Type.Object({ task: TaskSchema, work_item: WorkItemSchema, run: RunSchema, record: RunRecordSchema }, { additionalProperties: false })),
  executionSuccessSchema("RecordRunObservation", "run", Type.Object({ task: TaskSchema, work_item: WorkItemSchema, run: RunSchema, workspace: WorkspaceSnapshotSchema, observation: RunObservationSchema }, { additionalProperties: false })),
  executionSuccessSchema("ReconcileRun", "run", Type.Object({ task: TaskSchema, work_item: WorkItemSchema, run: RunSchema, workspace: WorkspaceSnapshotSchema, observation: RunObservationSchema }, { additionalProperties: false })),
  executionSuccessSchema("CancelRun", "run", Type.Object({ task: TaskSchema, run: RunSchema, reason: NonEmptyStringSchema }, { additionalProperties: false })),
  executionSuccessSchema("SaveHandoff", "work_item", Type.Object({ workspace: WorkspaceSnapshotSchema, handoff: HandoffRecordSchema }, { additionalProperties: false })),
  executionSuccessSchema("CheckResumption", "work_item", Type.Object({ resumption: ResumptionRecordSchema }, { additionalProperties: false }))
]);
type BaseCommandSuccess = Static<typeof baseSuccessUnionSchema>;
export type CommandSuccess = BaseCommandSuccess | Static<typeof governanceSuccessUnionSchema> | Static<typeof flowSuccessUnionSchema> | Static<typeof intentSuccessUnionSchema> | Static<typeof executionSuccessUnionSchema> | Static<typeof verificationSuccessUnionSchema> | Static<typeof runtimeSuccessUnionSchema>;
// Naming the three static unions bounds declarations without duplicating protocol types.
export const CommandSuccessSchema = Type.Unsafe<CommandSuccess>({ ...Type.Union([...baseSuccessUnionSchema.anyOf, ...governanceSuccessUnionSchema.anyOf, ...flowSuccessUnionSchema.anyOf, ...intentSuccessUnionSchema.anyOf, ...executionSuccessUnionSchema.anyOf, ...verificationSuccessUnionSchema.anyOf, ...runtimeSuccessUnionSchema.anyOf]), $defs: { EventEnvelope: EventEnvelopeSchema } });
export const CommandResultSchema = Type.Unsafe<CommandResult>({ ...Type.Union([CommandSuccessSchema, DomainErrorSchema]), $defs: { EventEnvelope: EventEnvelopeSchema } });
export const ErrorResultSchema = Type.Object({
  schema_version: Type.Literal(SCHEMA_VERSION), ok: Type.Literal(false), error: DomainErrorSchema
}, { additionalProperties: false });
export const ChangeListResultSchema = Type.Object({
  schema_version: Type.Literal(SCHEMA_VERSION), ok: Type.Literal(true), changes: Type.Array(ChangeSchema),
  as_of_event_sequence: Type.Integer({ minimum: 0 })
}, { additionalProperties: false });
export const ChangeShowResultSchema = Type.Object({
  schema_version: Type.Literal(SCHEMA_VERSION), ok: Type.Literal(true), change: ChangeSchema,
  as_of_event_sequence: Type.Integer({ minimum: 0 })
}, { additionalProperties: false });
export const DoctorResultSchema = Type.Object({
  schema_version: Type.Literal(SCHEMA_VERSION), ok: Type.Literal(true), project_id: InternalIdSchema,
  repository_path: NonEmptyStringSchema, database_path: NonEmptyStringSchema,
  changes: Type.Integer({ minimum: 0 }), events: Type.Integer({ minimum: 0 }),
  pending_outbox: Type.Integer({ minimum: 0 }), as_of_event_sequence: Type.Integer({ minimum: 0 })
}, { additionalProperties: false });
export const GovernanceListResultSchema = Type.Object({
  schema_version: Type.Literal(SCHEMA_VERSION), ok: Type.Literal(true),
  actors: Type.Array(ActorSchema), assignments: Type.Array(AssignmentSchema),
  as_of_event_sequence: Type.Integer({ minimum: 0 })
}, { additionalProperties: false });
export const FlowStatusResultSchema = Type.Object({
  schema_version: Type.Literal(SCHEMA_VERSION), ok: Type.Literal(true),
  settings_version: Type.Union([ProjectSettingsVersionSchema, Type.Null()]), target_versions: Type.Array(TargetVersionSchema),
  changes: Type.Array(ChangeSchema), wip_changes: Type.Array(ChangeSchema), paused_changes: Type.Array(ChangeSchema),
  priority_order: Type.Union([PriorityOrderSchema, Type.Null()]),
  wip: Type.Object({ used: Type.Integer({ minimum: 0 }), limit: Type.Union([PositiveIntegerSchema, Type.Null()]),
    available: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]) }, { additionalProperties: false }),
  as_of_event_sequence: Type.Integer({ minimum: 0 })
}, { additionalProperties: false });
export type FlowStatusResult = Static<typeof FlowStatusResultSchema>;

export const IntentShowResultSchema = Type.Object({ schema_version: Type.Literal(SCHEMA_VERSION), ok: Type.Literal(true), change: ChangeSchema,
  contract_proposals: Type.Array(ContractProposalSchema), plan_proposals: Type.Array(PlanProposalSchema),
  contract_versions: Type.Array(ContractVersionSchema), plan_versions: Type.Array(PlanVersionSchema), risk_assessments: Type.Array(RiskAssessmentSchema),
  decisions: Type.Array(DecisionSchema), lifecycle_transitions: Type.Array(LifecycleTransitionRecordSchema),
  decision_requests: Type.Array(Type.Object({ request: DecisionRequestSchema, status: Type.Union([Type.Literal("pending"), Type.Literal("stale"),
    Type.Literal("approve"), Type.Literal("request_changes"), Type.Literal("reject"), Type.Literal("applied")]),
    decision_ref: Type.Optional(referenceSchema("decision")) }, { additionalProperties: false })), as_of_event_sequence: Type.Integer({ minimum: 0 }) }, { additionalProperties: false });
export type IntentShowResult = Static<typeof IntentShowResultSchema>;

export type DomainError = Static<typeof DomainErrorSchema>;
export type CommandResult = CommandSuccess | DomainError;
export type ErrorResult = Static<typeof ErrorResultSchema>;
export type ChangeListResult = Static<typeof ChangeListResultSchema>;
export type ChangeShowResult = Static<typeof ChangeShowResultSchema>;
export type DoctorResult = Static<typeof DoctorResultSchema>;
export type GovernanceListResult = Static<typeof GovernanceListResultSchema>;
