import { Type, type Static } from "typebox";
import { DigestSchema, ExternalReferenceSchema, NonEmptyStringSchema, UtcTimestampSchema } from "./common.js";
import { RuntimeGatewayBudgetSnapshotSchema } from "./runtime-gateway.js";
import { RuntimeOperationResultSchema, RuntimeIpcTransportObservationSchema } from "./runtime-probe.js";
const strict = { additionalProperties: false } as const;
const key = Type.String({ pattern: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$" });
const id = Type.String({ pattern: "^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$" });
export const RuntimeGatewayTransportObservationSchema = Type.Object({
  schema_version: Type.Literal("2.0.0"), scope: Type.Literal("isolated_provider_probe"), operation_key: key,
  phase: Type.Union([Type.Literal("running"), Type.Literal("ended")]), transport: Type.Literal("windows_named_pipe"),
  runtime_pid: Type.Integer({ minimum: 1 }), client_identity_enforcement: Type.Literal("pid_creation_image"), remote_clients_rejected: Type.Literal(true),
  gateway_policy_digest: DigestSchema, frame_limit_bytes: Type.Literal(16384), accepted_requests: Type.Integer({ minimum: 0, maximum: 8 }),
  attempts: RuntimeIpcTransportObservationSchema.properties.attempts,
  failure_reason: Type.Union([NonEmptyStringSchema, Type.Null()]), external_model_requests: Type.Literal(0), formal_execution_enabled: Type.Literal(false)
}, strict);
export type RuntimeGatewayTransportObservation = Static<typeof RuntimeGatewayTransportObservationSchema>;
export const RuntimeGatewayBridgeObservationSchema = Type.Object({
  schema_version: Type.Literal("2.0.0"), scope: Type.Literal("isolated_provider_probe"), operation_key: key,
  phase: Type.Union([Type.Literal("running"), Type.Literal("ended")]),
  native_pid: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]), runtime_pid: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  gateway_policy_digest: DigestSchema, fixture_config_digest: DigestSchema, network_mode: Type.Literal("deny_all"),
  synthetic_http_requests: Type.Integer({ minimum: 0, maximum: 8 }), budget: RuntimeGatewayBudgetSnapshotSchema,
  attempts: Type.Array(Type.Object({ request_id: id, wire_digest: DigestSchema,
    outcome: Type.Union([Type.Literal("completed"), Type.Literal("denied")]), reason: Type.Union([NonEmptyStringSchema, Type.Null()]), replay: Type.Boolean() }, strict), { maxItems: 8 }),
  failure_reason: Type.Union([NonEmptyStringSchema, Type.Null()]), actual_credentials_read: Type.Literal(0), external_model_requests: Type.Literal(0), formal_execution_enabled: Type.Literal(false)
}, strict);
export type RuntimeGatewayBridgeObservation = Static<typeof RuntimeGatewayBridgeObservationSchema>;
export const RuntimeGatewayBridgeProbeResultSchema = Type.Object({
  schema_version: Type.Literal("2.0.0"), scope: Type.Literal("synthetic_gateway_bridge_probe"), observed_at: UtcTimestampSchema,
  provider: Type.Object({ name: Type.Literal("opencode"), version: NonEmptyStringSchema, binary_digest: DigestSchema, module_digest: DigestSchema }, strict),
  sandbox: Type.Literal("windows_appcontainer_job"), network_mode: Type.Literal("deny_all"), operation: RuntimeOperationResultSchema,
  bridge: RuntimeGatewayBridgeObservationSchema, transport: RuntimeGatewayTransportObservationSchema,
  bridge_probe_passed: Type.Boolean(), ipc_runtime_connected: Type.Literal(true), cost_known: Type.Literal(false),
  external_model_requests: Type.Literal(0), actual_credentials_read: Type.Literal(0), formal_execution_enabled: Type.Literal(false),
  evidence_refs: Type.Array(ExternalReferenceSchema), gaps: Type.Array(NonEmptyStringSchema)
}, strict);
export type RuntimeGatewayBridgeProbeResult = Static<typeof RuntimeGatewayBridgeProbeResultSchema>;
