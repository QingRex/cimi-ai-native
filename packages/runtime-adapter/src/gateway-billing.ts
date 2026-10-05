import { validateModelConnection } from "./connection.js";
import { digest, RuntimeAdapterError } from "./files.js";
// This is a dated public-document observation, not an approved account tariff.
// It cannot unlock a real request, credential read, invoice or cash budget.
export const CODING_PLAN_RATE_OBSERVATION = Object.freeze({
  format: "cimiloop/coding-plan-credit-observation/1.0.0", observed_on: "2026-10-05", expires_at: "2026-10-12T00:00:00.000Z",
  source_url: "https://docs.bigmodel.cn/cn/coding-plan/overview",
  source_digest: "b061718a0ba097bd5c0d8256a4e8a50f3d1a93c6f84c7ea1e60c410cc8d66a07",
  provider: "zhipuai-coding-plan", model: "glm-5.3", required_account_version: "credit_based_personal_plan",
  unit: "ZHIPU_CODING_PLAN_CREDIT", micro_units_per_input_token: 690, micro_units_per_output_token: 2400,
  cache_discount_applied: false, off_peak_discount_applied: false, reservation_quantum_micro_units: 1000000
} as const);
export const CODING_PLAN_RATE_DIGEST = digest(JSON.stringify(CODING_PLAN_RATE_OBSERVATION)).value;
export const estimateCodingPlanCredits = (bounds: { input_tokens: number; output_tokens: number }, now = Date.now()) => {
  if (!bounds || Object.keys(bounds).sort().join(",") !== "input_tokens,output_tokens" ||
    !Number.isSafeInteger(bounds.input_tokens) || bounds.input_tokens < 0 || bounds.input_tokens > 1048576 ||
    !Number.isSafeInteger(bounds.output_tokens) || bounds.output_tokens < 0 || bounds.output_tokens > 131072)
    throw new RuntimeAdapterError("invalid_coding_plan_token_bounds");
  if (!Number.isFinite(now) || now < Date.parse("2026-10-04T16:00:00.000Z") || now >= Date.parse(CODING_PLAN_RATE_OBSERVATION.expires_at))
    throw new RuntimeAdapterError("coding_plan_rate_observation_expired");
  // Worst published input rate for every input token, including any cache hits;
  // reasoning must be included in output_tokens by a separately verified bound.
  // Round upward to whole credits; no binary floating point, discount or refund.
  const raw = BigInt(bounds.input_tokens) * 690n + BigInt(bounds.output_tokens) * 2400n;
  const rounded = ((raw + 999999n) / 1000000n) * 1000000n;
  return { model: "glm-5.3" as const, unit: CODING_PLAN_RATE_OBSERVATION.unit, input_tokens: bounds.input_tokens, output_tokens: bounds.output_tokens,
    estimated_upper_micro_units: Number(rounded), rate_digest: { algorithm: "sha256" as const, value: CODING_PLAN_RATE_DIGEST },
    token_bounds_verified: false as const, account_version_verified: false as const, admission_ready: false as const, actual_cost_known: false as const };
};
export const assessDedicatedGatewayBilling = (input: unknown) => {
  const connection = validateModelConnection(input);
  return { provider: connection.provider, model: connection.model, outcome: "NEED_MORE_EVIDENCE" as const, admission_ready: false as const,
    actual_cost_known: false as const, credential_read_allowed: false as const,
    gaps: connection.provider === "zhipuai-coding-plan" ? ["account_plan_version_and_credit_entitlement", "gateway_supported_tool_environment",
      "server_enforced_input_and_reasoning_output_bounds", "approved_credit_budget_and_durable_ledger", "provider_billing_reconciliation"]
      : ["explicit_pay_as_you_go_connection_and_budget", "verified_monetary_tariff", "server_enforced_input_and_reasoning_output_bounds", "provider_billing_reconciliation"] };
};
