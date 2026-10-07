import { compileValidator, compileDiscriminatedValidator } from "../validation.js";
import * as common from "./common.js";
import * as objects from "./objects.js";
import * as commands from "./commands.js";
import * as providers from "./providers.js";
import * as results from "./results.js";
import * as storage from "./storage.js";
import * as governance from "./governance.js";
import * as intent from "./intent.js";
import * as execution from "./execution.js";
import * as verification from "./verification.js";
import * as runs from "./runs.js";
import * as queries from "./queries.js";
import * as runtimeProbe from "./runtime-probe.js";
import * as runtimeGateway from "./runtime-gateway.js";
import * as gatewayBridge from "./runtime-gateway-bridge.js";
import * as gatewayNetwork from "./runtime-gateway-network.js";
import * as gatewayCredit from "./runtime-gateway-credit.js";
import * as providerAssessment from "./provider-assessment.js";
import * as toolAuthority from "./tool-authority.js";
import * as skills from "./skills.js";
import * as skillProbe from "./skill-probe.js";
import * as fixedMethod from "./fixed-method.js";
import { Type, type TSchema } from "typebox";

export * from "../ids.js";
export { compileValidator, ProtocolValidationError, formatValidationErrors } from "../validation.js";
export type { InternalId } from "../schemas.js";
export * from "./common.js";
export * from "./objects.js";
export * from "./commands.js";
export * from "./providers.js";
export * from "./results.js";
export * from "./storage.js";
export * from "./governance.js";
export * from "./intent.js";
export * from "./execution.js";
export * from "./verification.js";
export * from "./runs.js";
export * from "./queries.js";
export * from "./runtime-probe.js";
export * from "./runtime-gateway.js";
export * from "./runtime-gateway-bridge.js";
export * from "./runtime-gateway-network.js";
export * from "./runtime-gateway-credit.js";
export * from "./provider-assessment.js";
export * from "./tool-authority.js";
export * from "./skills.js";
export * from "./skill-probe.js";
export * from "./fixed-method.js";

export const protocolSchemas: Readonly<Record<string, TSchema>> = {
  SkillMethodInputReference: runs.SkillMethodInputReferenceSchema, SkillMethodQualificationReference: runs.SkillMethodQualificationReferenceSchema,
  SkillInvocationRawReference: runs.SkillInvocationRawReferenceSchema, SkillInvocationProofReference: runs.SkillInvocationProofReferenceSchema,
  SkillInvocationPreparation: runs.SkillInvocationPreparationSchema, SkillInvocation: runs.SkillInvocationSchema,
  RawSkillInvocationObservation: runs.RawSkillInvocationObservationSchema, SkillInvocationObservation: runs.SkillInvocationObservationSchema,
  ReserveSkillInvocationCommand: commands.ReserveSkillInvocationCommandSchema,
  RecordSkillInvocationObservationCommand: commands.RecordSkillInvocationObservationCommandSchema,
  ReconcileSkillInvocationCommand: commands.ReconcileSkillInvocationCommandSchema,
  RunBindingPin: runs.RunBindingPinSchema, AgentRunBindings: runs.AgentRunBindingsSchema,
  HumanContextManifest: runs.HumanContextManifestSchema, AgentContextManifest: runs.AgentContextManifestSchema,
  HumanRunRecord: runs.HumanRunRecordSchema, AgentRunRecord: runs.AgentRunRecordSchema,
  RawHumanRunObservation: runs.RawHumanRunObservationSchema, RawAgentRunObservation: runs.RawAgentRunObservationSchema,
  HumanRunObservation: runs.HumanRunObservationSchema, AgentRunObservation: runs.AgentRunObservationSchema,
  AgentRunRawReference: runs.AgentRunRawReferenceSchema, AgentHostAdmissionReference: runs.AgentHostAdmissionReferenceSchema,
  AgentRunProofReference: runs.AgentRunProofReferenceSchema,
  SkillImportSpec: skills.SkillImportSpecSchema, SkillPackage: skills.SkillPackageSchema,
  SkillPackageReference: skills.SkillPackageReferenceSchema,
  SkillPackageInspectionResult: skills.SkillPackageInspectionResultSchema,
  SkillMethodInput: skills.SkillMethodInputSchema, SkillMethodOutput: skills.SkillMethodOutputSchema,
  NamedSkillMethodRequest: fixedMethod.NamedSkillMethodRequestSchema, FixedMethodProfile: fixedMethod.FixedMethodProfileSchema,
  FixedMethodObservation: fixedMethod.FixedMethodObservationSchema,
  FixedMethodProjection: fixedMethod.FixedMethodProjectionSchema,
  ToolAuthorityRequest: toolAuthority.ToolAuthorityRequestSchema,
  ToolAuthorityAssessment: toolAuthority.ToolAuthorityAssessmentSchema,
  RuntimeGatewayNetworkProbeResult: gatewayNetwork.RuntimeGatewayNetworkProbeResultSchema,
  RuntimeGatewayCreditSnapshot: gatewayCredit.RuntimeGatewayCreditSnapshotSchema,
  RuntimeGatewayCreditProbeResult: gatewayCredit.RuntimeGatewayCreditProbeResultSchema,
  RuntimeGatewayTransportObservation: gatewayBridge.RuntimeGatewayTransportObservationSchema,
  RuntimeGatewayBridgeObservation: gatewayBridge.RuntimeGatewayBridgeObservationSchema,
  RuntimeGatewayBridgeProbeResult: gatewayBridge.RuntimeGatewayBridgeProbeResultSchema,
  RuntimeGatewayBudgetSnapshot: runtimeGateway.RuntimeGatewayBudgetSnapshotSchema,
  RuntimeGatewayProbeResult: runtimeGateway.RuntimeGatewayProbeResultSchema,
  InternalId: common.InternalIdSchema, UtcTimestamp: common.UtcTimestampSchema,
  SemanticVersion: common.SemanticVersionSchema, ObjectType: common.ObjectTypeSchema,
  TypedReference: common.TypedReferenceSchema, Digest: common.DigestSchema,
  ExternalReference: common.ExternalReferenceSchema, Scope: common.ScopeSchema, RoleKey: common.RoleKeySchema,
  ChangeLifecycleState: common.ChangeLifecycleStateSchema, SourceDescriptor: common.SourceDescriptorSchema,
  Project: objects.ProjectSchema, Actor: objects.ActorSchema, Role: objects.RoleSchema,
  Assignment: objects.AssignmentSchema, Change: objects.ChangeSchema, TransitionRecord: objects.TransitionRecordSchema,
  CapabilityReference: providers.CapabilityReferenceSchema, SchemaReference: providers.SchemaReferenceSchema,
  PermissionSet: providers.PermissionSetSchema, ProviderDependency: providers.ProviderDependencySchema,
  ProviderDescriptor: providers.ProviderDescriptorSchema, ProviderBinding: providers.ProviderBindingSchema,
  ProviderRegistration: providers.ProviderRegistrationSchema, ProviderCatalogResult: providers.ProviderCatalogResultSchema,
  ProviderCandidateDescriptor: providers.ProviderCandidateDescriptorSchema,
  RegisterProviderCommand: commands.RegisterProviderCommandSchema,
  RecordProviderEvidenceCommand: commands.RecordProviderEvidenceCommandSchema, EvaluateProviderCommand: commands.EvaluateProviderCommandSchema,
  RegisterProviderBindingCommand: commands.RegisterProviderBindingCommandSchema,
  ApprovedProviderBinding: providers.ApprovedProviderBindingSchema,
  ProviderEvidence: providerAssessment.ProviderEvidenceSchema, ProviderEvaluation: providerAssessment.ProviderEvaluationSchema,
  RuntimeProviderEvidence: providerAssessment.RuntimeProviderEvidenceSchema, SkillProviderEvidence: providerAssessment.SkillProviderEvidenceSchema,
  RuntimeProviderEvaluation: providerAssessment.RuntimeProviderEvaluationSchema, SkillProviderEvaluation: providerAssessment.SkillProviderEvaluationSchema,
  SkillRuntimeProfile: skillProbe.SkillRuntimeProfileSchema, SkillInvocationSample: skillProbe.SkillInvocationSampleSchema, SkillProbeResult: skillProbe.SkillProbeResultSchema,
  ProviderProbeReference: providerAssessment.ProviderProbeReferenceSchema, ProviderArtifactReference: providerAssessment.ProviderArtifactReferenceSchema,
  InitializeProjectCommand: commands.InitializeProjectCommandSchema, CreateChangeCommand: commands.CreateChangeCommandSchema,
  PauseChangeCommand: commands.PauseChangeCommandSchema, ResumeChangeCommand: commands.ResumeChangeCommandSchema,
  AnyCommand: commands.AnyCommandSchema, EventEnvelope: results.EventEnvelopeSchema,
  DomainErrorCode: results.DomainErrorCodeSchema, DomainError: results.DomainErrorSchema,
  CommandSuccess: results.CommandSuccessSchema, CommandResult: results.CommandResultSchema,
  ErrorResult: results.ErrorResultSchema, ChangeListResult: results.ChangeListResultSchema,
  ChangeShowResult: results.ChangeShowResultSchema,
  OutboxMessage: storage.OutboxMessageSchema, MigrationReport: storage.MigrationReportSchema,
  DoctorResult: results.DoctorResultSchema,
  ActorRegistration: governance.ActorRegistrationSchema,
  ResponsibilityRole: governance.ResponsibilityRoleSchema,
  RegisterActorCommand: commands.RegisterActorCommandSchema,
  AssignResponsibilityCommand: commands.AssignResponsibilityCommandSchema,
  EndAssignmentCommand: commands.EndAssignmentCommandSchema,
  TransferChangeResponsibilityCommand: commands.TransferChangeResponsibilityCommandSchema,
  GovernanceListResult: results.GovernanceListResultSchema,
  ProjectSettings: governance.ProjectSettingsSchema, ProjectSettingsVersion: governance.ProjectSettingsVersionSchema,
  TargetVersion: governance.TargetVersionSchema, PlannedWindow: governance.PlannedWindowSchema, PriorityOrder: governance.PriorityOrderSchema,
  UpdateProjectSettingsCommand: commands.UpdateProjectSettingsCommandSchema, CreateTargetVersionCommand: commands.CreateTargetVersionCommandSchema,
  CloseTargetVersionCommand: commands.CloseTargetVersionCommandSchema, ChangePlanningCommand: commands.ChangePlanningCommandSchema,
  StartChangeCommand: commands.StartChangeCommandSchema, FlowStatusResult: results.FlowStatusResultSchema,
  ContractBody: intent.ContractBodySchema, PlanBody: intent.PlanBodySchema, AcceptanceCriterion: intent.AcceptanceCriterionSchema,
  RiskDeclaration: intent.RiskDeclarationSchema, TaskDefinition: intent.TaskDefinitionSchema, ChangeDependency: intent.ChangeDependencySchema,
  ClosureRequirement: intent.ClosureRequirementSchema, ContractProposal: intent.ContractProposalSchema, PlanProposal: intent.PlanProposalSchema,
  ContractVersion: intent.ContractVersionSchema, PlanVersion: intent.PlanVersionSchema, RiskAssessment: intent.RiskAssessmentSchema,
  DecisionAction: intent.DecisionActionSchema, ProposalReference: intent.ProposalReferenceSchema,
  ProfessionalSubjectReference: intent.ProfessionalSubjectReferenceSchema, ProfessionalRawReference: intent.ProfessionalRawReferenceSchema,
  ProfessionalFinding: intent.ProfessionalFindingSchema, RawProfessionalReview: intent.RawProfessionalReviewSchema,
  DecisionRequest: intent.DecisionRequestSchema, Decision: intent.DecisionSchema, LifecycleTransitionRecord: intent.LifecycleTransitionRecordSchema,
  SubmitContractProposalCommand: commands.SubmitContractProposalCommandSchema, SubmitPlanProposalCommand: commands.SubmitPlanProposalCommandSchema,
  RecordRiskAssessmentCommand: commands.RecordRiskAssessmentCommandSchema, RequestDecisionCommand: commands.RequestDecisionCommandSchema,
  RecordDecisionCommand: commands.RecordDecisionCommandSchema, ConfirmContractCommand: commands.ConfirmContractCommandSchema,
  ConfirmPlanCommand: commands.ConfirmPlanCommandSchema, IntentShowResult: results.IntentShowResultSchema,
  ActingRole: common.ActingRoleSchema,
  ExecutionAction: execution.ExecutionActionSchema, ExecutionBudget: execution.ExecutionBudgetSchema, TaskUsage: execution.TaskUsageSchema,
  TaskDefinitionRecord: execution.TaskDefinitionRecordSchema, Task: execution.TaskSchema, WorkItem: execution.WorkItemSchema,
  StandingAuthorizationBody: execution.StandingAuthorizationBodySchema, StandingAuthorization: execution.StandingAuthorizationSchema,
  StandingAuthorizationVersion: execution.StandingAuthorizationVersionSchema, AuthorizationRevocationRecord: execution.AuthorizationRevocationRecordSchema,
  WorkItemAuthorizationRecord: execution.WorkItemAuthorizationRecordSchema, ExecutionShowResult: execution.ExecutionShowResultSchema,
  InitializePlanTasksCommand: commands.InitializePlanTasksCommandSchema, PublishStandingAuthorizationCommand: commands.PublishStandingAuthorizationCommandSchema,
  RevokeStandingAuthorizationCommand: commands.RevokeStandingAuthorizationCommandSchema, CreateWorkItemCommand: commands.CreateWorkItemCommandSchema,
  RevokeWorkItemCommand: commands.RevokeWorkItemCommandSchema,
  SourceSnapshot: verification.SourceSnapshotSchema, RawEvidenceResult: verification.RawEvidenceResultSchema,
  Evidence: Type.Union([verification.EvidenceSchema, providerAssessment.ProviderEvidenceSchema]), PolicySnapshot: verification.PolicySnapshotSchema, RequirementSetRecord: verification.RequirementSetRecordSchema,
  EvaluationContext: verification.EvaluationContextSchema, Evaluation: Type.Union([verification.EvaluationSchema, providerAssessment.ProviderEvaluationSchema]), GateOutcome: verification.GateOutcomeSchema,
  TaskSatisfactionRecord: verification.TaskSatisfactionRecordSchema, IntegrationReadinessRecord: verification.IntegrationReadinessRecordSchema,
  VerificationShowResult: verification.VerificationShowResultSchema,
  CaptureSourceSnapshotCommand: commands.CaptureSourceSnapshotCommandSchema, RecordEvidenceCommand: commands.RecordEvidenceCommandSchema,
  PrepareTaskEvaluationCommand: commands.PrepareTaskEvaluationCommandSchema, EvaluateTaskCommand: commands.EvaluateTaskCommandSchema,
  SatisfyTaskCommand: commands.SatisfyTaskCommandSchema, EvaluateIntegrationCommand: commands.EvaluateIntegrationCommandSchema,
  MarkReadyForIntegrationCommand: commands.MarkReadyForIntegrationCommandSchema,
  Run: runs.RunSchema, WorkspaceManifest: runs.WorkspaceManifestSchema, WorkspaceSnapshot: runs.WorkspaceSnapshotSchema,
  ContextManifest: runs.ContextManifestSchema, RunRecord: runs.RunRecordSchema, RawRunObservation: runs.RawRunObservationSchema,
  RunObservation: runs.RunObservationSchema, HandoffRecord: runs.HandoffRecordSchema, ResumptionRecord: runs.ResumptionRecordSchema, RunShowResult: runs.RunShowResultSchema,
  InspectableObjectType: queries.InspectableObjectTypeSchema, ObjectShowResult: queries.ObjectShowResultSchema,
  TaskReadiness: execution.TaskReadinessSchema, CommandDiagnostic: queries.CommandDiagnosticSchema,
  RuntimeOperationResult: runtimeProbe.RuntimeOperationResultSchema, RuntimeBoundaryProbe: runtimeProbe.RuntimeBoundaryProbeSchema,
  RuntimeProbeResult: runtimeProbe.RuntimeProbeResultSchema,
  RuntimeDiskLimits: runtimeProbe.RuntimeDiskLimitsSchema, RuntimeResourceObservation: runtimeProbe.RuntimeResourceObservationSchema,
  RuntimeRecoveryResult: runtimeProbe.RuntimeRecoveryResultSchema,
  RuntimeExecutionPolicy: runtimeProbe.RuntimeExecutionPolicySchema, RuntimeExecutionPolicyObservation: runtimeProbe.RuntimeExecutionPolicyObservationSchema,
  RuntimeIpcTransportObservation: runtimeProbe.RuntimeIpcTransportObservationSchema, RuntimeTransportProbeResult: runtimeProbe.RuntimeTransportProbeResultSchema,
  PrepareRunContextCommand: commands.PrepareRunContextCommandSchema, ReserveRunCommand: commands.ReserveRunCommandSchema,
  RecordRunObservationCommand: commands.RecordRunObservationCommandSchema, ReconcileRunCommand: commands.ReconcileRunCommandSchema,
  CancelRunCommand: commands.CancelRunCommandSchema, SaveHandoffCommand: commands.SaveHandoffCommandSchema, CheckResumptionCommand: commands.CheckResumptionCommandSchema
} as const;

export const recordSchemas = {
  project: objects.ProjectSchema, actor: objects.ActorSchema, role: objects.RoleSchema,
  assignment: objects.AssignmentSchema, change: objects.ChangeSchema, transition_record: objects.TransitionRecordSchema,
  event: results.EventEnvelopeSchema, provider_descriptor: providers.ProviderDescriptorSchema,
  provider_binding: providers.ProviderBindingSchema, outbox_message: storage.OutboxMessageSchema,
  project_settings_version: governance.ProjectSettingsVersionSchema, target_version: governance.TargetVersionSchema,
  ...intent.intentRecordSchemas, ...execution.executionObjectSchemas, ...execution.executionRecordSchemas, ...verification.verificationRecordSchemas,
  run: runs.RunSchema, ...runs.runtimeRecordSchemas,
  evidence: Type.Union([verification.EvidenceSchema, providerAssessment.ProviderEvidenceSchema]),
  evaluation: Type.Union([verification.EvaluationSchema, providerAssessment.ProviderEvaluationSchema])
} as const;

export const parseCommand = compileDiscriminatedValidator<commands.AnyCommand>(commands.AnyCommandSchema, "command_type");
export const parseEvent = compileDiscriminatedValidator<results.EventEnvelope>(results.EventEnvelopeSchema, "event_type");
const successParsers = new Map<string, (input: unknown) => results.CommandSuccess>();
for (const branch of (results.CommandSuccessSchema as unknown as { anyOf: (TSchema & { properties: Record<string, TSchema & { const?: string }> })[] }).anyOf) {
  // Validate the complete envelope/data first, then every event through its complete
  // strict branch. Avoid recompiling the same large event union for each command.
  const schema = { ...branch, properties: { ...branch.properties, events: { type: "array", items: {} } } } as TSchema;
  successParsers.set(branch.properties.command_type!.const!, compileValidator<results.CommandSuccess>(schema));
}
const fullSuccessParser = compileValidator<results.CommandSuccess>(results.CommandSuccessSchema);
export const parseCommandSuccess = (input: unknown): results.CommandSuccess => {
  const discriminator = input && typeof input === "object" && "command_type" in input ? input.command_type : undefined;
  const parser = typeof discriminator === "string" ? successParsers.get(discriminator) : undefined;
  if (!parser) return fullSuccessParser(input);
  const result = parser(input); result.events.forEach(parseEvent); return result;
};
const parseDomainError = compileValidator<results.DomainError>(results.DomainErrorSchema);
const parseFullCommandResult = compileValidator<results.CommandResult>(results.CommandResultSchema);
export const parseCommandResult = (value: unknown): results.CommandResult => {
  if (value && typeof value === "object") {
    if ("ok" in value && value.ok === true) return parseCommandSuccess(value);
    if ("code" in value) return parseDomainError(value);
  }
  return parseFullCommandResult(value);
};
export const parseErrorResult = compileValidator<results.ErrorResult>(results.ErrorResultSchema);
export const parseChangeListResult = compileValidator<results.ChangeListResult>(results.ChangeListResultSchema);
export const parseChangeShowResult = compileValidator<results.ChangeShowResult>(results.ChangeShowResultSchema);
export const parseObjectShowResult = compileDiscriminatedValidator<queries.ObjectShowResult>(queries.ObjectShowResultSchema, "object_type");
export const parseProviderDescriptor = compileValidator<providers.ProviderDescriptor>(providers.ProviderDescriptorSchema);
export const parseProviderBinding = compileValidator<providers.ProviderBinding>(providers.ProviderBindingSchema);
export const parseMigrationReport = compileValidator<storage.MigrationReport>(storage.MigrationReportSchema);
export const parseDoctorResult = compileValidator<results.DoctorResult>(results.DoctorResultSchema);
