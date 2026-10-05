import { Type, type Static } from "typebox";
import { InternalIdSchema, UtcTimestampSchema } from "../schemas.js";

export { InternalIdSchema, UtcTimestampSchema } from "../schemas.js";
export const SCHEMA_VERSION = "2.0.0" as const;
export const NonEmptyStringSchema = Type.String({ minLength: 1 });
export const PositiveIntegerSchema = Type.Integer({ minimum: 1 });
export const SemanticVersionSchema = Type.String({
  pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$"
});

export const ObjectTypeSchema = Type.Union([
  Type.Literal("project"), Type.Literal("actor"), Type.Literal("role"), Type.Literal("assignment"),
  Type.Literal("change"), Type.Literal("target_version"), Type.Literal("project_settings_version"),
  Type.Literal("contract_proposal"), Type.Literal("plan_proposal"), Type.Literal("contract_version"), Type.Literal("plan_version"), Type.Literal("task_definition"),
  Type.Literal("lifecycle_transition_record"),
  Type.Literal("task"), Type.Literal("standing_authorization"), Type.Literal("standing_authorization_version"),
  Type.Literal("authorization_revocation_record"), Type.Literal("work_item_authorization_record"), Type.Literal("work_item"), Type.Literal("run_record"),
  Type.Literal("run"), Type.Literal("run_observation"), Type.Literal("context_manifest"), Type.Literal("handoff_record"), Type.Literal("resumption_record"), Type.Literal("workspace_snapshot"),
  Type.Literal("evidence"), Type.Literal("evaluation"), Type.Literal("requirement_set_record"),
  Type.Literal("evaluation_context"), Type.Literal("task_satisfaction_record"), Type.Literal("integration_readiness_record"),
  Type.Literal("risk_assessment"), Type.Literal("policy_version"), Type.Literal("policy_snapshot"),
  Type.Literal("decision_request"), Type.Literal("decision"), Type.Literal("blocker"),
  Type.Literal("source_snapshot"), Type.Literal("artifact"), Type.Literal("release_batch"),
  Type.Literal("release_candidate"), Type.Literal("release"), Type.Literal("deployment_record"),
  Type.Literal("deployment_observation"), Type.Literal("environment"), Type.Literal("environment_conditions"),
  Type.Literal("environment_coordination"), Type.Literal("production_observation_plan"),
  Type.Literal("change_delivery_assessment"), Type.Literal("provider_descriptor"), Type.Literal("provider_binding"),
  Type.Literal("transition_record"), Type.Literal("event"), Type.Literal("outbox_message")
]);
export type ObjectType = Static<typeof ObjectTypeSchema>;

export const TypedReferenceSchema = Type.Object({
  object_type: ObjectTypeSchema,
  id: InternalIdSchema,
  domain_version: Type.Optional(PositiveIntegerSchema)
}, { additionalProperties: false });

export const referenceSchema = <const T extends ObjectType>(objectType: T) => Type.Object({
  object_type: Type.Literal(objectType),
  id: InternalIdSchema
}, { additionalProperties: false });

export const versionedReferenceSchema = <const T extends ObjectType>(objectType: T) => Type.Object({
  object_type: Type.Literal(objectType),
  id: InternalIdSchema,
  domain_version: PositiveIntegerSchema
}, { additionalProperties: false });

export const DigestSchema = Type.Object({
  algorithm: Type.Literal("sha256"),
  value: Type.String({ pattern: "^[0-9a-f]{64}$" })
}, { additionalProperties: false });

export const ExternalReferenceSchema = Type.Object({
  provider: NonEmptyStringSchema,
  resource_type: NonEmptyStringSchema,
  locator: NonEmptyStringSchema,
  version: Type.Optional(NonEmptyStringSchema),
  digest: Type.Optional(DigestSchema)
}, { additionalProperties: false });

export const ScopeTypeSchema = Type.Union([
  Type.Literal("project"), Type.Literal("change"), Type.Literal("release_batch"), Type.Literal("environment")
]);
export const ScopeSchema = Type.Object({ kind: ScopeTypeSchema, id: InternalIdSchema }, { additionalProperties: false });

export const RoleKeySchema = Type.Union([
  Type.Literal("project_owner"), Type.Literal("change_owner"), Type.Literal("requirement_owner"),
  Type.Literal("technical_owner"), Type.Literal("quality_owner"), Type.Literal("release_owner"),
  Type.Literal("flow_owner"), Type.Literal("policy_owner"), Type.Literal("exception_owner")
]);
// Executor is a command capacity backed by a standing grant, not a Human responsibility Assignment.
export const ActingRoleSchema = Type.Union([RoleKeySchema, Type.Literal("executor")]);
export type ActingRole = Static<typeof ActingRoleSchema>;

export const ChangeLifecycleStateSchema = Type.Union([
  Type.Literal("Draft"), Type.Literal("IntentReady"), Type.Literal("Executing"),
  Type.Literal("ReadyForDelivery"), Type.Literal("Completed"), Type.Literal("Terminated")
]);
export const OperatingStatusSchema = Type.Union([Type.Literal("Active"), Type.Literal("Paused")]);
export const ChangeKindSchema = Type.Union([Type.Literal("requirement"), Type.Literal("bug")]);
export const TerminationReasonSchema = Type.Union([
  Type.Literal("cancelled"), Type.Literal("split"), Type.Literal("superseded")
]);

export const SourceDescriptorSchema = Type.Object({
  origin: Type.Union([
    Type.Literal("human_cli"), Type.Literal("human_ui"), Type.Literal("agent"),
    Type.Literal("system"), Type.Literal("adapter")
  ]),
  producer: NonEmptyStringSchema,
  repository_path: Type.Optional(NonEmptyStringSchema)
}, { additionalProperties: false });

export const MutableMetadata = {
  schema_version: Type.Literal(SCHEMA_VERSION), id: InternalIdSchema,
  revision: PositiveIntegerSchema, created_at: UtcTimestampSchema, updated_at: UtcTimestampSchema
};
export const ProjectMutableMetadata = { ...MutableMetadata, project_id: InternalIdSchema };
export const RecordMetadata = {
  schema_version: Type.Literal(SCHEMA_VERSION), id: InternalIdSchema, project_id: InternalIdSchema,
  created_at: UtcTimestampSchema, producer_actor_id: InternalIdSchema,
  source_ref: Type.Optional(ExternalReferenceSchema)
};

export type TypedReference = Static<typeof TypedReferenceSchema>;
export type Digest = Static<typeof DigestSchema>;
export type ExternalReference = Static<typeof ExternalReferenceSchema>;
export type Scope = Static<typeof ScopeSchema>;
export type RoleKey = Static<typeof RoleKeySchema>;
export type ChangeLifecycleState = Static<typeof ChangeLifecycleStateSchema>;
export type SourceDescriptor = Static<typeof SourceDescriptorSchema>;
