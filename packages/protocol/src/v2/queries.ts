import { Type, type Static, type TSchema } from "typebox";
import { SCHEMA_VERSION, TypedReferenceSchema, UtcTimestampSchema } from "./common.js";
import { ProjectSchema, ActorSchema, AssignmentSchema, ChangeSchema, type Project, type Actor, type Assignment, type Change } from "./objects.js";
import { ProjectSettingsVersionSchema, TargetVersionSchema, type ProjectSettingsVersion, type TargetVersion } from "./governance.js";
import { intentRecordSchemas, type IntentRecords } from "./intent.js";
import { executionObjectSchemas, executionRecordSchemas, TaskReadinessSchema, type ExecutionObjects, type ExecutionRecords, type ExecutionShowResult } from "./execution.js";
import { verificationRecordSchemas, type VerificationRecords } from "./verification.js";
import { RunSchema, runtimeRecordSchemas, type Run, type RuntimeRecords } from "./runs.js";
import { ProviderDescriptorSchema, ProviderBindingSchema, type ProviderDescriptor, type ProviderBinding } from "./providers.js";
import { ProviderEvidenceSchema, ProviderEvaluationSchema, type ProviderEvidence, type ProviderEvaluation } from "./provider-assessment.js";

// The query registry includes persisted S1 objects only. Reserved future object
// types do not become queryable merely by appearing in ObjectTypeSchema.
export type InspectableRecords = { project: Project; actor: Actor; assignment: Assignment; change: Change;
  project_settings_version: ProjectSettingsVersion; target_version: TargetVersion; provider_descriptor: ProviderDescriptor; provider_binding: ProviderBinding } & IntentRecords & ExecutionObjects & ExecutionRecords & Omit<VerificationRecords, "evidence" | "evaluation"> &
  { evidence: VerificationRecords["evidence"] | ProviderEvidence; evaluation: VerificationRecords["evaluation"] | ProviderEvaluation; run: Run } & RuntimeRecords;
export type InspectableObjectType = keyof InspectableRecords;
export const inspectableSchemas: Readonly<Record<InspectableObjectType, TSchema>> = {
  project: ProjectSchema, actor: ActorSchema, assignment: AssignmentSchema, change: ChangeSchema,
  project_settings_version: ProjectSettingsVersionSchema, target_version: TargetVersionSchema,
  provider_descriptor: ProviderDescriptorSchema, provider_binding: ProviderBindingSchema,
  ...intentRecordSchemas, ...executionObjectSchemas, ...executionRecordSchemas, ...verificationRecordSchemas, run: RunSchema, ...runtimeRecordSchemas,
  evidence: Type.Union([verificationRecordSchemas.evidence, ProviderEvidenceSchema]),
  evaluation: Type.Union([verificationRecordSchemas.evaluation, ProviderEvaluationSchema])
};
export const InspectableObjectTypeSchema = Type.Enum(Object.keys(inspectableSchemas) as InspectableObjectType[]);
export type ObjectShowResult = { [K in InspectableObjectType]: { schema_version: typeof SCHEMA_VERSION; ok: true;
  object_type: K; object: InspectableRecords[K]; as_of_event_sequence: number; readiness?: ExecutionShowResult["readiness"][number] } }[InspectableObjectType];
export const ObjectShowResultSchema = Type.Unsafe<ObjectShowResult>(Type.Union(Object.entries(inspectableSchemas).map(([kind, schema]) => Type.Object({
  schema_version: Type.Literal(SCHEMA_VERSION), ok: Type.Literal(true), object_type: Type.Literal(kind), object: schema,
  as_of_event_sequence: Type.Integer({ minimum: 0 }), ...(["task", "work_item", "run"].includes(kind) ? { readiness: Type.Optional(TaskReadinessSchema) } : {})
}, { additionalProperties: false }))));

const currentFactSchema = Type.Object({ reference: TypedReferenceSchema,
  revision: Type.Optional(Type.Integer({ minimum: 1 })), status: Type.Optional(Type.String()),
  lifecycle_state: Type.Optional(Type.String()), operating_status: Type.Optional(Type.String()),
  contract_ref: Type.Optional(TypedReferenceSchema), plan_ref: Type.Optional(TypedReferenceSchema),
  settings_ref: Type.Optional(TypedReferenceSchema), current_version_ref: Type.Optional(TypedReferenceSchema),
  definition_ref: Type.Optional(TypedReferenceSchema), record_ref: Type.Optional(TypedReferenceSchema),
  active_work_item_ref: Type.Optional(TypedReferenceSchema), active_run_ref: Type.Optional(TypedReferenceSchema)
}, { additionalProperties: false });
export const CommandDiagnosticSchema = Type.Object({ schema_version: Type.Literal(SCHEMA_VERSION),
  observed_at: UtcTimestampSchema, as_of_event_sequence: Type.Integer({ minimum: 0 }),
  command_type: Type.String({ minLength: 1 }), target: TypedReferenceSchema,
  expected_revision: Type.Optional(Type.Integer({ minimum: 1 })), current: Type.Union([currentFactSchema, Type.Null()]),
  related: Type.Array(currentFactSchema), missing_conditions: Type.Array(Type.String()),
  readiness: Type.Optional(TaskReadinessSchema)
}, { additionalProperties: false });
export type CommandDiagnostic = Static<typeof CommandDiagnosticSchema>;
