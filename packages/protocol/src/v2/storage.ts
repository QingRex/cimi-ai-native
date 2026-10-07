import { Type, type Static } from "typebox";
import { DigestSchema, InternalIdSchema, NonEmptyStringSchema, SCHEMA_VERSION, TypedReferenceSchema, UtcTimestampSchema } from "./common.js";

export const OutboxMessageSchema = Type.Object({
  schema_version: Type.Literal(SCHEMA_VERSION),
  id: InternalIdSchema, project_id: InternalIdSchema, event_id: InternalIdSchema,
  effect_key: NonEmptyStringSchema,
  kind: Type.Union([Type.Literal("legacy_event_delivery"), Type.Literal("event_delivery")]),
  target_ref: TypedReferenceSchema,
  status: Type.Union([Type.Literal("pending"), Type.Literal("processing"), Type.Literal("delivered")]),
  attempt_count: Type.Integer({ minimum: 0 }), available_at: UtcTimestampSchema,
  lease_until: Type.Optional(UtcTimestampSchema), created_at: UtcTimestampSchema,
  delivered_at: Type.Optional(UtcTimestampSchema)
}, { additionalProperties: false });

export const MigrationReportSchema = Type.Object({
  schema_version: Type.Literal(SCHEMA_VERSION), ok: Type.Literal(true),
  mode: Type.Union([Type.Literal("check"), Type.Literal("apply")]),
  from_format: Type.Integer({ minimum: 1 }), to_format: Type.Union([Type.Literal(2), Type.Literal(3), Type.Literal(4), Type.Literal(5), Type.Literal(6), Type.Literal(7), Type.Literal(8), Type.Literal(9), Type.Literal(10)]),
  migration_required: Type.Boolean(),
  counts: Type.Record(Type.String(), Type.Integer({ minimum: 0 })),
  backup_path: Type.Optional(NonEmptyStringSchema), backup_digest: Type.Optional(DigestSchema),
  migration_id: Type.Optional(InternalIdSchema)
}, { additionalProperties: false });
export type OutboxMessage = Static<typeof OutboxMessageSchema>;
export type MigrationReport = Static<typeof MigrationReportSchema>;
