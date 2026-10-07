import { Type, type Static, type TSchema } from "typebox";
import {
  ChangeKindSchema, DigestSchema, InternalIdSchema, NonEmptyStringSchema, PositiveIntegerSchema,
  RoleKeySchema, SCHEMA_VERSION, ScopeSchema, SourceDescriptorSchema, TypedReferenceSchema, UtcTimestampSchema, referenceSchema, versionedReferenceSchema
} from "./common.js";
import { ActorRegistrationSchema, ResponsibilityRoleSchema, ProjectSettingsSchema, PlannedWindowSchema } from "./governance.js";
import { ContractBodySchema, PlanBodySchema, DecisionActionSchema, ProposalReferenceSchema, ProfessionalSubjectReferenceSchema, ProfessionalRawReferenceSchema } from "./intent.js";
import { StandingAuthorizationBodySchema, ExecutionActionSchema, ExecutionBudgetSchema } from "./execution.js";
import { RawResultReferenceSchema, DeferredVerificationSchema } from "./verification.js";
import { AnyRunRawReferenceSchema, AgentRunBindingsSchema, SkillMethodInputReferenceSchema, SkillInvocationRawReferenceSchema } from "./runs.js";
import { ProviderRegistrationSchema } from "./providers.js";
import { RecordProviderEvidencePayloadSchema, EvaluateProviderPayloadSchema, RegisterProviderBindingPayloadSchema } from "./provider-assessment.js";

const envelopeFields = {
  schema_version: Type.Literal(SCHEMA_VERSION), command_id: InternalIdSchema, correlation_id: InternalIdSchema,
  requested_at: UtcTimestampSchema, source: SourceDescriptorSchema,
  expected_input_digest: Type.Optional(DigestSchema)
};
const actorFields = { project_id: InternalIdSchema, actor_id: InternalIdSchema, acting_role: RoleKeySchema };
const commandSchema = <const T extends string, P extends TSchema>(commandType: T, payload: P) => Type.Object({
  ...envelopeFields, ...actorFields, command_type: Type.Literal(commandType), payload
}, { additionalProperties: false });
const updateChangeCommandSchema = <const T extends string, P extends TSchema>(commandType: T, payload: P) => Type.Object({
  ...envelopeFields, ...actorFields, command_type: Type.Literal(commandType),
  target: referenceSchema("change"), expected_revision: PositiveIntegerSchema, payload
}, { additionalProperties: false });

export const InitializeProjectCommandSchema = Type.Object({
  ...envelopeFields, command_type: Type.Literal("InitializeProject"),
  payload: Type.Object({
    name: Type.String({ minLength: 1, maxLength: 200 }),
    repository_kind: Type.Union([Type.Literal("git"), Type.Literal("directory")]),
    repository_path: NonEmptyStringSchema, owner_name: Type.String({ minLength: 1, maxLength: 200 }),
    owner_email: Type.Optional(Type.String({ minLength: 3, maxLength: 320 }))
  }, { additionalProperties: false })
}, { additionalProperties: false });
export const CreateChangeCommandSchema = commandSchema("CreateChange", Type.Object({
  title: Type.String({ minLength: 1, maxLength: 300 }), kind: Type.Optional(ChangeKindSchema),
  requirement_owner_actor_id: Type.Optional(InternalIdSchema), target_version_id: Type.Optional(InternalIdSchema)
}, { additionalProperties: false }));
export const PauseChangeCommandSchema = updateChangeCommandSchema("PauseChange", Type.Object({
  reason: Type.String({ minLength: 1, maxLength: 1000 })
}, { additionalProperties: false }));
export const ResumeChangeCommandSchema = updateChangeCommandSchema("ResumeChange", Type.Object({
  reconciliation_refs: Type.Optional(Type.Array(TypedReferenceSchema, { uniqueItems: true }))
}, { additionalProperties: false }));

const updateProjectCommandSchema = <const T extends string, P extends TSchema>(commandType: T, payload: P) => Type.Object({
  ...envelopeFields, ...actorFields, command_type: Type.Literal(commandType),
  target: referenceSchema("project"), expected_revision: PositiveIntegerSchema, payload
}, { additionalProperties: false });
export const RegisterActorCommandSchema = updateProjectCommandSchema("RegisterActor", ActorRegistrationSchema);
export const RegisterProviderCommandSchema = updateProjectCommandSchema("RegisterProvider", ProviderRegistrationSchema);
export const RecordProviderEvidenceCommandSchema = updateProjectCommandSchema("RecordProviderEvidence", RecordProviderEvidencePayloadSchema);
export const EvaluateProviderCommandSchema = updateProjectCommandSchema("EvaluateProvider", EvaluateProviderPayloadSchema);
export const RegisterProviderBindingCommandSchema = updateProjectCommandSchema("RegisterProviderBinding", RegisterProviderBindingPayloadSchema);
export const AssignResponsibilityCommandSchema = updateProjectCommandSchema("AssignResponsibility", Type.Object({
  actor_id: InternalIdSchema, role_key: RoleKeySchema, scope: ScopeSchema,
  effective_at: Type.Optional(UtcTimestampSchema), expires_at: Type.Optional(UtcTimestampSchema)
}, { additionalProperties: false }));
export const EndAssignmentCommandSchema = updateProjectCommandSchema("EndAssignment", Type.Object({
  assignment_id: InternalIdSchema, expected_assignment_revision: PositiveIntegerSchema,
  reason: Type.String({ minLength: 1, maxLength: 1000 })
}, { additionalProperties: false }));
export const TransferChangeResponsibilityCommandSchema = updateChangeCommandSchema("TransferChangeResponsibility", Type.Object({
  role_key: ResponsibilityRoleSchema, new_actor_id: InternalIdSchema,
  grant_basis_refs: Type.Array(referenceSchema("assignment"), { minItems: 1, uniqueItems: true }),
  reason: Type.String({ minLength: 1, maxLength: 1000 })
}, { additionalProperties: false }));
export const UpdateProjectSettingsCommandSchema = updateProjectCommandSchema("UpdateProjectSettings", Type.Object({
  base_settings_ref: Type.Union([versionedReferenceSchema("project_settings_version"), Type.Null()]), settings: ProjectSettingsSchema
}, { additionalProperties: false }));
export const CreateTargetVersionCommandSchema = updateProjectCommandSchema("CreateTargetVersion", Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }), planned_window: Type.Optional(PlannedWindowSchema)
}, { additionalProperties: false }));
export const CloseTargetVersionCommandSchema = updateProjectCommandSchema("CloseTargetVersion", Type.Object({
  target_version_id: InternalIdSchema, expected_target_revision: PositiveIntegerSchema, reason: Type.String({ minLength: 1, maxLength: 1000 })
}, { additionalProperties: false }));
const planningFields = { arbitration: Type.Optional(Type.Boolean()), reason: Type.String({ minLength: 1, maxLength: 1000 }) };
export const ChangePlanningCommandSchema = updateChangeCommandSchema("ChangePlanning", Type.Union([
  Type.Object({ ...planningFields, priority: Type.Integer({ minimum: 0 }),
    target_version_id: Type.Optional(Type.Union([InternalIdSchema, Type.Null()])) }, { additionalProperties: false }),
  Type.Object({ ...planningFields, priority: Type.Optional(Type.Integer({ minimum: 0 })),
    target_version_id: Type.Union([InternalIdSchema, Type.Null()]) }, { additionalProperties: false })
]));
export const StartChangeCommandSchema = updateChangeCommandSchema("StartChange", Type.Object({
  plan_ref: versionedReferenceSchema("plan_version"), opening_reason: Type.String({ minLength: 1, maxLength: 1000 }),
  emergency_capacity_override: Type.Optional(Type.Object({ decision_ref: referenceSchema("decision"),
    coordinator_actor_id: InternalIdSchema, affected_change_refs: Type.Array(referenceSchema("change"), { minItems: 1, uniqueItems: true }),
    reason: Type.String({ minLength: 1, maxLength: 1000 }), recovery_arrangement: Type.String({ minLength: 1, maxLength: 2000 })
  }, { additionalProperties: false }))
}, { additionalProperties: false }));

const proposalInput = { proposal_id: Type.Optional(InternalIdSchema), expected_proposal_revision: Type.Optional(Type.Integer({ minimum: 0 })) };
export const SubmitContractProposalCommandSchema = updateChangeCommandSchema("SubmitContractProposal", Type.Object({ ...proposalInput,
  base_version_ref: Type.Union([versionedReferenceSchema("contract_version"), Type.Null()]), body: ContractBodySchema }, { additionalProperties: false }));
export const SubmitPlanProposalCommandSchema = updateChangeCommandSchema("SubmitPlanProposal", Type.Object({ ...proposalInput,
  base_version_ref: Type.Union([versionedReferenceSchema("plan_version"), Type.Null()]), body: PlanBodySchema }, { additionalProperties: false }));
export const RecordRiskAssessmentCommandSchema = updateChangeCommandSchema("RecordRiskAssessment", Type.Object({ proposal_ref: versionedReferenceSchema("contract_proposal"),
  level: Type.Union([Type.Literal("ordinary"), Type.Literal("high")]), rationale: NonEmptyStringSchema }, { additionalProperties: false }));
export const RequestDecisionCommandSchema = updateChangeCommandSchema("RequestDecision", Type.Object({ action: DecisionActionSchema, proposal_ref: ProposalReferenceSchema,
  risk_ref: Type.Optional(referenceSchema("risk_assessment")), expires_at: Type.Optional(UtcTimestampSchema), professional_subject_ref: Type.Optional(ProfessionalSubjectReferenceSchema) }, { additionalProperties: false }));
export const RecordDecisionCommandSchema = updateChangeCommandSchema("RecordDecision", Type.Object({ request_id: InternalIdSchema, input_digest: DigestSchema,
  choice: Type.Union([Type.Literal("approve"), Type.Literal("request_changes"), Type.Literal("reject")]), reason: NonEmptyStringSchema,
  conditions: Type.Array(NonEmptyStringSchema, { uniqueItems: true }), raw_review_ref: Type.Optional(ProfessionalRawReferenceSchema) }, { additionalProperties: false }));
const confirmationInput = Type.Object({ proposal_ref: ProposalReferenceSchema, decision_request_ref: referenceSchema("decision_request"),
  decision_ref: referenceSchema("decision"), input_digest: DigestSchema }, { additionalProperties: false });
export const ConfirmContractCommandSchema = updateChangeCommandSchema("ConfirmContract", confirmationInput);
export const ConfirmPlanCommandSchema = updateChangeCommandSchema("ConfirmPlan", confirmationInput);
export const InitializePlanTasksCommandSchema = updateChangeCommandSchema("InitializePlanTasks", Type.Object({ plan_ref: versionedReferenceSchema("plan_version") }, { additionalProperties: false }));
export const PublishStandingAuthorizationCommandSchema = Type.Object({ ...envelopeFields, ...actorFields, command_type: Type.Literal("PublishStandingAuthorization"),
  target: Type.Union([referenceSchema("project"), referenceSchema("standing_authorization")]), expected_revision: PositiveIntegerSchema,
  payload: Type.Object({ base_version_ref: Type.Union([versionedReferenceSchema("standing_authorization_version"), Type.Null()]), body: StandingAuthorizationBodySchema }, { additionalProperties: false }) }, { additionalProperties: false });
export const RevokeStandingAuthorizationCommandSchema = Type.Object({ ...envelopeFields, ...actorFields, command_type: Type.Literal("RevokeStandingAuthorization"),
  target: referenceSchema("standing_authorization"), expected_revision: PositiveIntegerSchema,
  payload: Type.Object({ reason: Type.String({ minLength: 1, maxLength: 2000 }) }, { additionalProperties: false }) }, { additionalProperties: false });
export const CreateWorkItemCommandSchema = Type.Object({ ...envelopeFields, ...actorFields, acting_role: Type.Union([Type.Literal("technical_owner"), Type.Literal("executor")]), command_type: Type.Literal("CreateWorkItem"),
  target: referenceSchema("task"), expected_revision: PositiveIntegerSchema,
  payload: Type.Object({ definition_ref: versionedReferenceSchema("task_definition"), executor_ref: referenceSchema("actor"),
    standing_authorization_ref: Type.Optional(versionedReferenceSchema("standing_authorization_version")), acknowledged_usage_digest: Type.Optional(DigestSchema),
    allowed_actions: Type.Array(ExecutionActionSchema, { minItems: 1, uniqueItems: true }), allowed_resources: Type.Array(Type.String({ minLength: 1, maxLength: 400 }), { minItems: 1, uniqueItems: true }),
    budget: ExecutionBudgetSchema, stop_conditions: Type.Array(Type.String({ minLength: 1, maxLength: 2000 }), { minItems: 1, uniqueItems: true }), reason: Type.String({ minLength: 1, maxLength: 2000 }) }, { additionalProperties: false }) }, { additionalProperties: false });
export const RevokeWorkItemCommandSchema = Type.Object({ ...envelopeFields, ...actorFields, command_type: Type.Literal("RevokeWorkItem"),
  target: referenceSchema("work_item"), expected_revision: PositiveIntegerSchema,
  payload: Type.Object({ reason: Type.String({ minLength: 1, maxLength: 2000 }) }, { additionalProperties: false }) }, { additionalProperties: false });

const verificationTaskCommand = <const T extends string, P extends TSchema>(commandType: T, payload: P) => Type.Object({ ...envelopeFields, ...actorFields,
  acting_role: Type.Union([Type.Literal("technical_owner"), Type.Literal("executor")]), command_type: Type.Literal(commandType),
  target: referenceSchema("task"), expected_revision: PositiveIntegerSchema, payload }, { additionalProperties: false });
export const CaptureSourceSnapshotCommandSchema = updateChangeCommandSchema("CaptureSourceSnapshot", Type.Object({ commit_id: Type.String({ pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" }) }, { additionalProperties: false }));
export const RecordEvidenceCommandSchema = verificationTaskCommand("RecordEvidence", Type.Object({ source_snapshot_ref: referenceSchema("source_snapshot"),
  raw_result_ref: RawResultReferenceSchema }, { additionalProperties: false }));
export const PrepareTaskEvaluationCommandSchema = verificationTaskCommand("PrepareTaskEvaluation", Type.Object({ source_snapshot_ref: referenceSchema("source_snapshot") }, { additionalProperties: false }));
export const EvaluateTaskCommandSchema = verificationTaskCommand("EvaluateTask", Type.Object({ requirement_set_ref: referenceSchema("requirement_set_record"),
  context_ref: Type.Optional(referenceSchema("evaluation_context")), input_digest: DigestSchema }, { additionalProperties: false }));
export const SatisfyTaskCommandSchema = verificationTaskCommand("SatisfyTask", Type.Object({ evaluation_ref: referenceSchema("evaluation") }, { additionalProperties: false }));
export const EvaluateIntegrationCommandSchema = updateChangeCommandSchema("EvaluateIntegration", Type.Object({ source_snapshot_ref: referenceSchema("source_snapshot"),
  deferred_checks: Type.Array(DeferredVerificationSchema) }, { additionalProperties: false }));
export const MarkReadyForIntegrationCommandSchema = updateChangeCommandSchema("MarkReadyForIntegration", Type.Object({ evaluation_ref: referenceSchema("evaluation"),
  input_digest: DigestSchema, reason: NonEmptyStringSchema }, { additionalProperties: false }));

const runCommand = <const T extends string, const O extends "task" | "work_item" | "run", P extends TSchema>(commandType: T, objectType: O, payload: P) => Type.Object({
  ...envelopeFields, ...actorFields, acting_role: Type.Union([Type.Literal("executor"), Type.Literal("technical_owner")]), command_type: Type.Literal(commandType),
  target: referenceSchema(objectType), expected_revision: PositiveIntegerSchema, payload }, { additionalProperties: false });
export const PrepareRunContextCommandSchema = runCommand("PrepareRunContext", "work_item", Type.Union([
  Type.Object({ source_snapshot_ref: referenceSchema("source_snapshot") }, { additionalProperties: false }),
  Type.Object({ source_snapshot_ref: referenceSchema("source_snapshot"), ...AgentRunBindingsSchema.properties }, { additionalProperties: false })
]));
export const ReserveRunCommandSchema = runCommand("ReserveRun", "task", Type.Object({ work_item_ref: referenceSchema("work_item"), context_ref: referenceSchema("context_manifest"),
  input_digest: DigestSchema, reserved_cost_micros: Type.Optional(Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })), resumption_ref: Type.Optional(referenceSchema("resumption_record")) }, { additionalProperties: false }));
export const RecordRunObservationCommandSchema = runCommand("RecordRunObservation", "run", Type.Object({ raw_result_ref: AnyRunRawReferenceSchema }, { additionalProperties: false }));
export const ReconcileRunCommandSchema = runCommand("ReconcileRun", "run", Type.Object({ raw_result_ref: AnyRunRawReferenceSchema }, { additionalProperties: false }));
export const CancelRunCommandSchema = runCommand("CancelRun", "run", Type.Object({ reason: NonEmptyStringSchema }, { additionalProperties: false }));
export const SaveHandoffCommandSchema = runCommand("SaveHandoff", "work_item", Type.Object({ source_snapshot_ref: referenceSchema("source_snapshot"), run_ref: Type.Optional(referenceSchema("run")),
  next_actor_ref: referenceSchema("actor"), completed: Type.Array(NonEmptyStringSchema), unresolved: Type.Array(NonEmptyStringSchema), next_action: NonEmptyStringSchema,
  evidence_refs: Type.Array(referenceSchema("evidence"), { uniqueItems: true }) }, { additionalProperties: false }));
export const CheckResumptionCommandSchema = runCommand("CheckResumption", "work_item", Type.Object({ handoff_ref: referenceSchema("handoff_record"),
  context_ref: referenceSchema("context_manifest"), input_digest: DigestSchema }, { additionalProperties: false }));
export const ReserveSkillInvocationCommandSchema = runCommand("ReserveSkillInvocation", "run", Type.Object({
  skill_binding_ref: referenceSchema("provider_binding"), method_name: Type.String({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 64 }),
  input_ref: SkillMethodInputReferenceSchema }, { additionalProperties: false }));
const skillObservationPayload = Type.Object({ invocation_ref: referenceSchema("skill_invocation"), raw_result_ref: SkillInvocationRawReferenceSchema }, { additionalProperties: false });
export const RecordSkillInvocationObservationCommandSchema = runCommand("RecordSkillInvocationObservation", "run", skillObservationPayload);
export const ReconcileSkillInvocationCommandSchema = runCommand("ReconcileSkillInvocation", "run", skillObservationPayload);

export const AnyCommandSchema = Type.Union([
  InitializeProjectCommandSchema, CreateChangeCommandSchema, PauseChangeCommandSchema, ResumeChangeCommandSchema,
  RegisterActorCommandSchema, RegisterProviderCommandSchema, RecordProviderEvidenceCommandSchema, EvaluateProviderCommandSchema, RegisterProviderBindingCommandSchema,
  AssignResponsibilityCommandSchema, EndAssignmentCommandSchema, TransferChangeResponsibilityCommandSchema,
  UpdateProjectSettingsCommandSchema, CreateTargetVersionCommandSchema, CloseTargetVersionCommandSchema, ChangePlanningCommandSchema, StartChangeCommandSchema,
  SubmitContractProposalCommandSchema, SubmitPlanProposalCommandSchema, RecordRiskAssessmentCommandSchema, RequestDecisionCommandSchema,
  RecordDecisionCommandSchema, ConfirmContractCommandSchema, ConfirmPlanCommandSchema, InitializePlanTasksCommandSchema,
  PublishStandingAuthorizationCommandSchema, RevokeStandingAuthorizationCommandSchema, CreateWorkItemCommandSchema, RevokeWorkItemCommandSchema,
  CaptureSourceSnapshotCommandSchema, RecordEvidenceCommandSchema, PrepareTaskEvaluationCommandSchema, EvaluateTaskCommandSchema, SatisfyTaskCommandSchema,
  EvaluateIntegrationCommandSchema, MarkReadyForIntegrationCommandSchema,
  PrepareRunContextCommandSchema, ReserveRunCommandSchema, RecordRunObservationCommandSchema, ReconcileRunCommandSchema, CancelRunCommandSchema, SaveHandoffCommandSchema, CheckResumptionCommandSchema,
  ReserveSkillInvocationCommandSchema, RecordSkillInvocationObservationCommandSchema, ReconcileSkillInvocationCommandSchema
]);
export type InitializeProjectCommand = Static<typeof InitializeProjectCommandSchema>;
export type CreateChangeCommand = Static<typeof CreateChangeCommandSchema>;
export type PauseChangeCommand = Static<typeof PauseChangeCommandSchema>;
export type ResumeChangeCommand = Static<typeof ResumeChangeCommandSchema>;
export type RegisterActorCommand = Static<typeof RegisterActorCommandSchema>;
export type RegisterProviderCommand = Static<typeof RegisterProviderCommandSchema>;
export type AssignResponsibilityCommand = Static<typeof AssignResponsibilityCommandSchema>;
export type EndAssignmentCommand = Static<typeof EndAssignmentCommandSchema>;
export type TransferChangeResponsibilityCommand = Static<typeof TransferChangeResponsibilityCommandSchema>;
export type UpdateProjectSettingsCommand = Static<typeof UpdateProjectSettingsCommandSchema>;
export type StartChangeCommand = Static<typeof StartChangeCommandSchema>;
export type AnyCommand = Static<typeof AnyCommandSchema>;
