import { Type, type Static } from "typebox";
import { DigestSchema, ExternalReferenceSchema, NonEmptyStringSchema, UtcTimestampSchema } from "./common.js";
const strict = { additionalProperties: false } as const;
const count = Type.Integer({ minimum: 0, maximum: 4096 });
export const RuntimeGatewayBudgetSnapshotSchema = Type.Object({
  currency: Type.Literal("TEST"), maximum_micro_units: Type.Integer({ minimum: 1, maximum: 1000000000000 }),
  held_micro_units: Type.Integer({ minimum: 0, maximum: 1000000000000 }),
  reserved: count, dispatching: count, completed: count, unknown: count, blocked: Type.Boolean()
}, strict);
export const RuntimeGatewayProbeResultSchema = Type.Object({
  schema_version: Type.Literal("2.0.0"), scope: Type.Literal("synthetic_gateway_probe"), observed_at: UtcTimestampSchema,
  gateway_probe_passed: Type.Boolean(), route: Type.Object({ host: Type.Literal("cimiloop-gateway.test"), path: Type.Literal("/v1/chat/completions"),
    model: Type.Literal("cimiloop-synthetic-text"), tls_peer_verified: Type.Literal(true), redirects: Type.Literal(false), retries: Type.Literal(0),
    certificate_digest: DigestSchema, max_request_bytes: Type.Literal(16384), max_response_bytes: Type.Literal(16384), max_output_tokens: Type.Literal(128) }, strict),
  checks: Type.Array(Type.Object({ name: NonEmptyStringSchema, passed: Type.Boolean(), reason: NonEmptyStringSchema }, strict), { minItems: 1, maxItems: 32 }),
  budgets: Type.Array(Type.Object({ case_name: NonEmptyStringSchema, policy_digest: DigestSchema, snapshot: RuntimeGatewayBudgetSnapshotSchema }, strict), { minItems: 1, maxItems: 32 }),
  synthetic_http_requests: Type.Integer({ minimum: 0, maximum: 64 }), external_model_requests: Type.Literal(0), actual_credentials_read: Type.Literal(0),
  cost_known: Type.Literal(false), ipc_runtime_connected: Type.Literal(false), formal_execution_enabled: Type.Literal(false),
  evidence_refs: Type.Array(ExternalReferenceSchema), gaps: Type.Array(NonEmptyStringSchema)
}, strict);
export type RuntimeGatewayProbeResult = Static<typeof RuntimeGatewayProbeResultSchema>;
