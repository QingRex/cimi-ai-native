import { Type, type Static } from "typebox";
import {
  ChangeKindSchema, ChangeLifecycleStateSchema, ExternalReferenceSchema, InternalIdSchema,
  MutableMetadata, NonEmptyStringSchema, OperatingStatusSchema, ProjectMutableMetadata,
  RoleKeySchema, ScopeSchema, SourceDescriptorSchema, TerminationReasonSchema, UtcTimestampSchema,
  versionedReferenceSchema
} from "./common.js";

export const ProjectSchema = Type.Object({
  ...MutableMetadata,
  name: Type.String({ minLength: 1, maxLength: 200 }),
  repository_kind: Type.Union([Type.Literal("git"), Type.Literal("directory")]),
  repository_path: NonEmptyStringSchema, instance_id: InternalIdSchema,
  settings_ref: Type.Optional(versionedReferenceSchema("project_settings_version"))
}, { additionalProperties: false });

const actorFields = {
  ...ProjectMutableMetadata,
  display_name: Type.String({ minLength: 1, maxLength: 200 })
};
export const HumanActorSchema = Type.Object({
  ...actorFields, actor_type: Type.Literal("human"),
  identity_source: Type.Union([Type.Literal("git_config"), Type.Literal("local_operator")]),
  email: Type.Optional(Type.String({ minLength: 3, maxLength: 320 }))
}, { additionalProperties: false });
export const AgentActorSchema = Type.Object({
  ...actorFields, actor_type: Type.Literal("agent"), identity_source: Type.Literal("runtime_binding"),
  provider_identity_ref: ExternalReferenceSchema
}, { additionalProperties: false });
export const SystemActorSchema = Type.Object({
  ...actorFields, actor_type: Type.Literal("system"), identity_source: Type.Literal("local_service")
}, { additionalProperties: false });
export const ActorSchema = Type.Union([HumanActorSchema, AgentActorSchema, SystemActorSchema]);

export const RoleSchema = Type.Object({
  ...ProjectMutableMetadata, role_key: RoleKeySchema,
  display_name: Type.String({ minLength: 1, maxLength: 200 })
}, { additionalProperties: false });
export const AssignmentSchema = Type.Object({
  ...ProjectMutableMetadata, actor_id: InternalIdSchema, role_key: RoleKeySchema,
  role_id: Type.Optional(InternalIdSchema), scope: ScopeSchema, effective_at: UtcTimestampSchema,
  expires_at: Type.Optional(UtcTimestampSchema), ended_at: Type.Optional(UtcTimestampSchema), granted_by: InternalIdSchema
}, { additionalProperties: false });

const changeFields = {
  ...ProjectMutableMetadata,
  display_key: Type.String({ pattern: "^CHG-\\d{4,}$" }),
  title: Type.String({ minLength: 1, maxLength: 300 }), kind: ChangeKindSchema,
  owner_actor_id: InternalIdSchema, requirement_owner_actor_id: Type.Optional(InternalIdSchema),
  target_version_id: Type.Optional(InternalIdSchema),
  contract_ref: Type.Optional(versionedReferenceSchema("contract_version")),
  plan_ref: Type.Optional(versionedReferenceSchema("plan_version")),
  priority: Type.Integer({ minimum: 0 }), source: SourceDescriptorSchema
};
const activeFields = { ...changeFields, operating_status: Type.Literal("Active") };
const pausedFields = {
  ...changeFields, operating_status: Type.Literal("Paused"),
  pause_reason: Type.String({ minLength: 1, maxLength: 1000 })
};
const nonTerminalStateSchema = Type.Union([
  Type.Literal("Draft"), Type.Literal("IntentReady"), Type.Literal("Executing"),
  Type.Literal("ReadyForDelivery"), Type.Literal("Completed")
]);
// Preserve the tuple: dynamically mapped unions lose Static inference in TypeBox.
export const ChangeSchema = Type.Union([
  Type.Object({ ...activeFields, lifecycle_state: nonTerminalStateSchema }, { additionalProperties: false }),
  Type.Object({ ...pausedFields, lifecycle_state: nonTerminalStateSchema }, { additionalProperties: false }),
  Type.Object({ ...activeFields, lifecycle_state: Type.Literal("Terminated"),
    termination_reason: TerminationReasonSchema
  }, { additionalProperties: false }),
  Type.Object({ ...pausedFields, lifecycle_state: Type.Literal("Terminated"),
    termination_reason: TerminationReasonSchema
  }, { additionalProperties: false })
]);

// This is the schema for operating-status records; lifecycle records are added with their commands.
export const TransitionRecordSchema = Type.Object({
  schema_version: Type.Literal("2.0.0"), id: InternalIdSchema, project_id: InternalIdSchema,
  change_id: InternalIdSchema, command_id: InternalIdSchema,
  transition_type: Type.Union([Type.Literal("change_paused"), Type.Literal("change_resumed")]),
  lifecycle_state: ChangeLifecycleStateSchema,
  from_status: OperatingStatusSchema, to_status: OperatingStatusSchema,
  reason: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
  actor_id: InternalIdSchema, acting_role: RoleKeySchema, occurred_at: UtcTimestampSchema
}, { additionalProperties: false });

export type Project = Static<typeof ProjectSchema>;
export type Actor = Static<typeof ActorSchema>;
export type Role = Static<typeof RoleSchema>;
export type Assignment = Static<typeof AssignmentSchema>;
export type Change = Static<typeof ChangeSchema>;
export type TransitionRecord = Static<typeof TransitionRecordSchema>;
