import { Type, type Static } from "typebox";
import { DigestSchema, ExternalReferenceSchema, NonEmptyStringSchema, UtcTimestampSchema } from "./common.js";

const strict = { additionalProperties: false } as const;
export const RuntimeOperationStatusSchema = Type.Union([
  Type.Literal("Reserved"), Type.Literal("Running"), Type.Literal("Succeeded"), Type.Literal("Failed"),
  Type.Literal("Cancelled"), Type.Literal("Unknown"), Type.Literal("NotStarted")
]);
export const RuntimeOperationResultSchema = Type.Object({
  schema_version: Type.Literal("2.0.0"), scope: Type.Literal("isolated_provider_probe"),
  operation_key: Type.String({ pattern: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$" }),
  input_digest: DigestSchema, status: RuntimeOperationStatusSchema,
  cancel_requested: Type.Boolean(), observed_at: UtcTimestampSchema,
  session_id: Type.Optional(Type.String({ pattern: "^ses_[a-zA-Z0-9]+$" })),
  exit_code: Type.Optional(Type.Integer()), reason: NonEmptyStringSchema,
  raw_refs: Type.Array(ExternalReferenceSchema), outputs: Type.Array(ExternalReferenceSchema),
  usage: Type.Object({ cost_known: Type.Literal(false) }, strict)
}, strict);
export type RuntimeOperationResult = Static<typeof RuntimeOperationResultSchema>;

export const RuntimeBoundaryProbeSchema = Type.Object({
  mode: Type.Union([Type.Literal("write"), Type.Literal("read")]), passed: Type.Boolean(),
  outside_read_denied: Type.Boolean(), outside_write_denied: Type.Boolean(), subprocess_denied: Type.Boolean(),
  inside_readable: Type.Boolean(), inside_writable: Type.Boolean(), loopback_denied: Type.Boolean(),
  raw_refs: Type.Array(ExternalReferenceSchema)
}, strict);
export type RuntimeBoundaryProbe = Static<typeof RuntimeBoundaryProbeSchema>;
export const RuntimeProbeResultSchema = Type.Object({
  schema_version: Type.Literal("2.0.0"), scope: Type.Literal("isolated_provider_probe"),
  observed_at: UtcTimestampSchema,
  provider: Type.Object({ name: Type.Literal("opencode"), version: NonEmptyStringSchema,
    binary_digest: DigestSchema, model: NonEmptyStringSchema }, strict),
  sandbox: Type.Literal("windows_appcontainer_job"),
  boundaries: Type.Array(RuntimeBoundaryProbeSchema, { minItems: 2, maxItems: 2 }),
  model_operations: Type.Array(RuntimeOperationResultSchema, { maxItems: 2 }),
  contract_probe_passed: Type.Boolean(), formal_execution_enabled: Type.Literal(false),
  gaps: Type.Array(NonEmptyStringSchema), evidence_refs: Type.Array(ExternalReferenceSchema)
}, strict);
export type RuntimeProbeResult = Static<typeof RuntimeProbeResultSchema>;

// Sampled sandbox thresholds stop the job after observation; they are not an
// NTFS hard allocation quota. Output bytes are bounded before host writes.
export const RuntimeDiskLimitsSchema = Type.Object({
  max_sandbox_bytes: Type.Integer({ minimum: 65536, maximum: 268435456 }),
  max_sandbox_entries: Type.Integer({ minimum: 4, maximum: 1024 }),
  max_file_bytes: Type.Integer({ minimum: 65536, maximum: 16777216 }),
  max_output_bytes: Type.Integer({ minimum: 1024, maximum: 16777216 })
}, strict);
export type RuntimeDiskLimits = Static<typeof RuntimeDiskLimitsSchema>;
export const RuntimeResourceObservationSchema = Type.Object({
  schema_version: Type.Literal("2.0.0"), scope: Type.Literal("isolated_provider_probe"),
  operation_key: Type.String({ pattern: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$" }),
  enforcement: Type.Literal("sampled_job_termination"), sample_interval_ms: Type.Literal(100),
  limits: RuntimeDiskLimitsSchema,
  sandbox_bytes: Type.Integer({ minimum: 0 }), sandbox_entries: Type.Integer({ minimum: 0 }),
  largest_file_bytes: Type.Integer({ minimum: 0 }),
  reason: Type.Union([Type.Literal("within_limits"), Type.Literal("sandbox_bytes"), Type.Literal("sandbox_entries"),
    Type.Literal("file_bytes"), Type.Literal("observation_unavailable")])
}, strict);
export type RuntimeResourceObservation = Static<typeof RuntimeResourceObservationSchema>;
export const RuntimeRecoveryResultSchema = Type.Object({
  schema_version: Type.Literal("2.0.0"), scope: Type.Literal("isolated_provider_probe"),
  operation_key: Type.String({ pattern: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$" }), observed_at: UtcTimestampSchema,
  outcome: Type.Union([Type.Literal("active"), Type.Literal("recovered"), Type.Literal("unknown")]),
  reason: NonEmptyStringSchema, operation: RuntimeOperationResultSchema,
  cleanup: Type.Object({ resources_disposed: Type.Boolean(), state_removed: Type.Boolean(), workspace_discarded: Type.Boolean() }, strict),
  raw_refs: Type.Array(ExternalReferenceSchema)
}, strict);
export type RuntimeRecoveryResult = Static<typeof RuntimeRecoveryResultSchema>;

// A declared limit is not an enforcement mechanism. Unsupported constraints
// are rejected before any probe starts; unrestricted access is probe-only.
export const RuntimeExecutionPolicySchema = Type.Object({
  network: Type.Union([
    Type.Object({ mode: Type.Literal("deny_all") }, strict),
    Type.Object({ mode: Type.Literal("unrestricted_probe_only") }, strict),
    Type.Object({ mode: Type.Literal("host_allowlist"), hosts: Type.Array(Type.String({ pattern: "^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$" }), { minItems: 1, maxItems: 16, uniqueItems: true }) }, strict)
  ]),
  cost: Type.Union([
    Type.Object({ mode: Type.Literal("unmetered_probe_only") }, strict),
    Type.Object({ mode: Type.Literal("required_cap"), max_cost_microusd: Type.Integer({ minimum: 1, maximum: 1000000000 }) }, strict)
  ])
}, strict);
export type RuntimeExecutionPolicy = Static<typeof RuntimeExecutionPolicySchema>;
export const RuntimeExecutionPolicyObservationSchema = Type.Union([
  Type.Object({
    schema_version: Type.Literal("2.0.0"), scope: Type.Literal("isolated_provider_probe"),
    operation_key: Type.String({ pattern: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$" }), pid: Type.Integer({ minimum: 1 }),
    network_mode: Type.Literal("deny_all"), enforcement: Type.Literal("appcontainer_no_network_capabilities"),
    capability_sids: Type.Array(Type.String(), { maxItems: 0 }), cost_mode: Type.Literal("unmetered_probe_only"),
    formal_execution_enabled: Type.Literal(false)
  }, strict),
  Type.Object({
    schema_version: Type.Literal("2.0.0"), scope: Type.Literal("isolated_provider_probe"),
    operation_key: Type.String({ pattern: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$" }), pid: Type.Integer({ minimum: 1 }),
    network_mode: Type.Literal("unrestricted_probe_only"), enforcement: Type.Literal("appcontainer_internet_client"),
    capability_sids: Type.Array(Type.Literal("S-1-15-3-1"), { minItems: 1, maxItems: 1 }), cost_mode: Type.Literal("unmetered_probe_only"),
    formal_execution_enabled: Type.Literal(false)
  }, strict)
]);
export type RuntimeExecutionPolicyObservation = Static<typeof RuntimeExecutionPolicyObservationSchema>;

export const RuntimeIpcTransportObservationSchema = Type.Object({
  schema_version: Type.Literal("2.0.0"), scope: Type.Literal("isolated_provider_probe"),
  operation_key: Type.String({ pattern: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$" }),
  phase: Type.Union([Type.Literal("running"), Type.Literal("ended")]), transport: Type.Literal("windows_named_pipe"),
  runtime_pid: Type.Integer({ minimum: 1 }), client_identity_enforcement: Type.Literal("pid_creation_image"),
  synthetic_response_only: Type.Literal(true), remote_clients_rejected: Type.Literal(true), frame_limit_bytes: Type.Literal(262144),
  accepted_requests: Type.Integer({ minimum: 0, maximum: 8 }),
  attempts: Type.Array(Type.Object({ pid: Type.Integer({ minimum: 1 }),
    outcome: Type.Union([Type.Literal("accepted"), Type.Literal("rejected")]),
    reason: Type.Union([Type.Literal("runtime_identity_verified"), Type.Literal("client_identity_mismatch"), Type.Literal("ipc_frame_limit"),
      Type.Literal("ipc_request_invalid"), Type.Literal("request_id_conflict"), Type.Literal("ipc_request_limit")]),
    request_bytes: Type.Integer({ minimum: 0, maximum: 262144 }),
    request_digest: Type.Union([Type.String({ pattern: "^[a-f0-9]{64}$" }), Type.Null()]), replay: Type.Boolean()
  }, strict), { maxItems: 32 }), failure_reason: Type.Union([NonEmptyStringSchema, Type.Null()]),
  external_model_requests: Type.Literal(0), formal_execution_enabled: Type.Literal(false)
}, strict);
export type RuntimeIpcTransportObservation = Static<typeof RuntimeIpcTransportObservationSchema>;
export const RuntimeTransportProbeResultSchema = Type.Object({
  schema_version: Type.Literal("2.0.0"), scope: Type.Literal("synthetic_transport_probe"), observed_at: UtcTimestampSchema,
  provider: Type.Object({ name: Type.Literal("opencode"), version: NonEmptyStringSchema, binary_digest: DigestSchema, module_digest: DigestSchema }, strict),
  sandbox: Type.Literal("windows_appcontainer_job"), network_mode: Type.Literal("deny_all"),
  operation: RuntimeOperationResultSchema, transport_probe_passed: Type.Boolean(),
  external_model_requests: Type.Literal(0), actual_credentials_read: Type.Literal(0), formal_execution_enabled: Type.Literal(false),
  evidence_refs: Type.Array(ExternalReferenceSchema), gaps: Type.Array(NonEmptyStringSchema)
}, strict);
export type RuntimeTransportProbeResult = Static<typeof RuntimeTransportProbeResultSchema>;
