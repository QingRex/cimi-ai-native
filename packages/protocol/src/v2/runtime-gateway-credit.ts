import { Type, type Static } from "typebox";
import { DigestSchema, ExternalReferenceSchema, NonEmptyStringSchema, UtcTimestampSchema } from "./common.js";
const strict = { additionalProperties: false } as const;
const amount = Type.Integer({ minimum: 0, maximum: 1000000000000 }), cap = Type.Integer({ minimum: 1000000, maximum: 1000000000000, multipleOf: 1000000 });
const count = Type.Integer({ minimum: 0, maximum: 4096 }), hash = Type.String({ pattern: "^[a-f0-9]{64}$" });
export const RuntimeGatewayCreditSnapshotSchema = Type.Object({
  scope: Type.Literal("credit_budget_rehearsal"), unit: Type.Literal("ZHIPU_CODING_PLAN_CREDIT"), account_scope_digest: hash, policy_digest: hash,
  maximum_micro_units: cap, held_micro_units: amount, remaining_micro_units: amount,
  reserved: count, dispatching: count, completed: count, unknown: count, blocked: Type.Boolean(),
  budgets: Type.Array(Type.Object({ budget_key: Type.String({ pattern: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$" }), maximum_micro_units: cap, held_micro_units: amount }, strict), { maxItems: 4096 }),
  actual_cost_known: Type.Literal(false), admission_ready: Type.Literal(false)
}, strict);
export const RuntimeGatewayCreditProbeResultSchema = Type.Object({
  schema_version: Type.Literal("2.0.0"), scope: Type.Literal("credit_budget_rehearsal"), observed_at: UtcTimestampSchema,
  credit_budget_probe_passed: Type.Boolean(), unit: Type.Literal("ZHIPU_CODING_PLAN_CREDIT"),
  rate_observation: Type.Object({ digest: DigestSchema, expires_at: UtcTimestampSchema, reference_time: UtcTimestampSchema,
    historical_rehearsal: Type.Literal(true), account_version_verified: Type.Literal(false), token_bounds_verified: Type.Literal(false) }, strict),
  checks: Type.Array(Type.Object({ name: NonEmptyStringSchema, passed: Type.Boolean(), reason: NonEmptyStringSchema }, strict), { minItems: 1, maxItems: 32 }),
  snapshots: Type.Array(Type.Object({ case_name: NonEmptyStringSchema, snapshot: RuntimeGatewayCreditSnapshotSchema }, strict), { minItems: 1, maxItems: 32 }),
  recoveries: Type.Array(Type.Object({ case_name: NonEmptyStringSchema, reconciled_requests: count, active_owners: count, unknown_owners: count, verified_ended_owners: count }, strict), { maxItems: 32 }),
  independent_host_processes: Type.Integer({ minimum: 0, maximum: 3 }), credit_ledger_format: Type.Literal(1),
  http_requests: Type.Literal(0), external_model_requests: Type.Literal(0), actual_credentials_read: Type.Literal(0), runtime_started: Type.Literal(false),
  actual_cost_known: Type.Literal(false), billing_admission_ready: Type.Literal(false), formal_execution_enabled: Type.Literal(false),
  evidence_refs: Type.Array(ExternalReferenceSchema), gaps: Type.Array(NonEmptyStringSchema)
}, strict);
export type RuntimeGatewayCreditProbeResult = Static<typeof RuntimeGatewayCreditProbeResultSchema>;
