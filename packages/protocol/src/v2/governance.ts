import { Type, type Static } from "typebox";
import { ExternalReferenceSchema, InternalIdSchema, PositiveIntegerSchema, ProjectMutableMetadata,
  RecordMetadata, UtcTimestampSchema, versionedReferenceSchema } from "./common.js";

const displayName = Type.String({ minLength: 1, maxLength: 200 });
// Provenance is metadata. The trusted ingress separately authenticates the caller.
export const ActorRegistrationSchema = Type.Union([
  Type.Object({ actor_type: Type.Literal("human"), identity_source: Type.Literal("local_operator"),
    display_name: displayName, email: Type.Optional(Type.String({ minLength: 3, maxLength: 320 }))
  }, { additionalProperties: false }),
  Type.Object({ actor_type: Type.Literal("agent"), identity_source: Type.Literal("runtime_binding"),
    display_name: displayName, provider_identity_ref: ExternalReferenceSchema
  }, { additionalProperties: false }),
  Type.Object({ actor_type: Type.Literal("system"), identity_source: Type.Literal("local_service"),
    display_name: displayName
  }, { additionalProperties: false })
]);
export const ResponsibilityRoleSchema = Type.Union([Type.Literal("change_owner"), Type.Literal("requirement_owner")]);
export type ActorRegistration = Static<typeof ActorRegistrationSchema>;

export const PriorityOrderSchema = Type.Union([Type.Literal("higher_first"), Type.Literal("lower_first")]);
export const ProjectSettingsSchema = Type.Object({
  wip_limit: PositiveIntegerSchema, flow_owner_actor_id: InternalIdSchema, priority_arbiter_actor_id: InternalIdSchema,
  check_interval_ms: PositiveIntegerSchema, priority_order: PriorityOrderSchema,
  policy_ref: Type.Optional(versionedReferenceSchema("policy_version"))
}, { additionalProperties: false });
export const ProjectSettingsVersionSchema = Type.Object({
  ...RecordMetadata, settings: ProjectSettingsSchema, version: PositiveIntegerSchema,
  predecessor_ref: Type.Optional(versionedReferenceSchema("project_settings_version"))
}, { additionalProperties: false });
export const PlannedWindowSchema = Type.Object({ starts_at: UtcTimestampSchema, ends_at: UtcTimestampSchema }, { additionalProperties: false });
const targetFields = { ...ProjectMutableMetadata, name: displayName, planned_window: Type.Optional(PlannedWindowSchema) };
export const TargetVersionSchema = Type.Union([
  Type.Object({ ...targetFields, status: Type.Literal("open") }, { additionalProperties: false }),
  Type.Object({ ...targetFields, status: Type.Literal("closed"), closed_reason: Type.String({ minLength: 1, maxLength: 1000 }) }, { additionalProperties: false })
]);
export type ProjectSettings = Static<typeof ProjectSettingsSchema>;
export type ProjectSettingsVersion = Static<typeof ProjectSettingsVersionSchema>;
export type TargetVersion = Static<typeof TargetVersionSchema>;
