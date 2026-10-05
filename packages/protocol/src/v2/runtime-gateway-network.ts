import { Type, type Static } from "typebox";
import { DigestSchema, ExternalReferenceSchema, NonEmptyStringSchema, UtcTimestampSchema } from "./common.js";
const strict = { additionalProperties: false } as const;
const address = Type.Object({ address: Type.String({ minLength: 1, maxLength: 64 }), family: Type.Union([Type.Literal(4), Type.Literal(6)]),
  ttl_seconds: Type.Integer({ minimum: 1, maximum: 604800 }) }, strict);
export const RuntimeGatewayNetworkProbeResultSchema = Type.Object({
  schema_version: Type.Literal("2.0.0"), scope: Type.Literal("public_gateway_network_probe"), observed_at: UtcTimestampSchema,
  route: Type.Object({ provider: Type.Literal("zhipuai-coding-plan"), model: Type.Literal("glm-5.3"), host: Type.Literal("open.bigmodel.cn"),
    port: Type.Literal(443), path: Type.Literal("/api/coding/paas/v4/chat/completions"), policy_digest: DigestSchema,
    proxy: Type.Literal(false), redirects: Type.Literal(false), retries: Type.Literal(0) }, strict),
  dns: Type.Union([Type.Null(), Type.Object({ resolved_at: UtcTimestampSchema, expires_at: UtcTimestampSchema,
    addresses: Type.Array(address, { minItems: 1, maxItems: 32 }), selected: address, pin_digest: DigestSchema }, strict)]),
  tls: Type.Union([Type.Null(), Type.Object({ verified: Type.Literal(true), peer_address: Type.String({ minLength: 1, maxLength: 64 }),
    protocol: Type.Union([Type.Literal("TLSv1.2"), Type.Literal("TLSv1.3")]), certificate_digest: DigestSchema }, strict)]),
  network_probe_passed: Type.Boolean(), failure_reason: Type.Union([Type.Null(), Type.String({ pattern: "^gateway_[a-z_]{1,80}$" })]),
  billing: Type.Object({ admission_ready: Type.Literal(false), cost_known: Type.Literal(false), reason: Type.Literal("gateway_reliable_billing_profile_unavailable"),
    credit_rate_digest: DigestSchema, account_plan_version_verified: Type.Literal(false), token_bounds_verified: Type.Literal(false) }, strict),
  http_requests: Type.Literal(0), external_model_requests: Type.Literal(0), actual_credentials_read: Type.Literal(0),
  runtime_started: Type.Literal(false), formal_execution_enabled: Type.Literal(false), evidence_refs: Type.Array(ExternalReferenceSchema), gaps: Type.Array(NonEmptyStringSchema)
}, strict);
export type RuntimeGatewayNetworkProbeResult = Static<typeof RuntimeGatewayNetworkProbeResultSchema>;
