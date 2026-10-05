import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { estimateCodingPlanCredits, assessDedicatedGatewayBilling, CODING_PLAN_RATE_OBSERVATION } from "../src/gateway-billing.js";
import { requireDedicatedGatewayBilling } from "../src/model-gateway.js";
const time = Date.parse("2026-10-05T00:00:00.000Z");
describe("dated Coding Plan credit estimate without admission", () => {
  it("rounds the high input rate upward with no cache, off-peak or cash conversion", () => {
    expect(estimateCodingPlanCredits({ input_tokens: 1449, output_tokens: 0 }, time)).toMatchObject({ estimated_upper_micro_units: 1000000, unit: "ZHIPU_CODING_PLAN_CREDIT", actual_cost_known: false, admission_ready: false });
    expect(estimateCodingPlanCredits({ input_tokens: 1450, output_tokens: 0 }, time).estimated_upper_micro_units).toBe(2000000);
    expect(CODING_PLAN_RATE_OBSERVATION).toMatchObject({ cache_discount_applied: false, off_peak_discount_applied: false });
  });
  it("counts all supplied reasoning/output tokens and makes the estimate conditional on unverified token bounds", () => {
    expect(estimateCodingPlanCredits({ input_tokens: 1048576, output_tokens: 131072 }, time)).toMatchObject({ estimated_upper_micro_units: 1039000000,
      token_bounds_verified: false, account_version_verified: false, admission_ready: false });
    expect(estimateCodingPlanCredits({ input_tokens: 0, output_tokens: 1 }, time).estimated_upper_micro_units).toBe(1000000);
  });
  it("rejects negative, fractional, excess or caller-supplied tariff fields", () => {
    for (const bounds of [{ input_tokens: -1, output_tokens: 1 }, { input_tokens: 1.5, output_tokens: 1 }, { input_tokens: 1048577, output_tokens: 1 },
      { input_tokens: 1, output_tokens: 131073 }, { input_tokens: 1, output_tokens: 1, rate: 0 }]) expect(() => estimateCodingPlanCredits(bounds, time)).toThrow("invalid_coding_plan_token_bounds");
  });
  it("never uses the observed rates outside the explicit freshness window", () => {
    for (const now of [NaN, Date.parse("2026-10-01T00:00:00Z"), Date.parse(CODING_PLAN_RATE_OBSERVATION.expires_at)])
      expect(() => estimateCodingPlanCredits({ input_tokens: 1, output_tokens: 1 }, now)).toThrow("coding_plan_rate_observation_expired");
  });
  it("keeps an unknown account and custom gateway eligibility closed before reading even an absent credential", () => {
    const connection = { format: "cimiloop/dedicated-model/1.0.0", provider: "zhipuai-coding-plan", model: "zhipuai-coding-plan/glm-5.3",
      credential_file: join(tmpdir(), "absent-billing-credential.dpapi.json"), credential_digest: { algorithm: "sha256", value: "a".repeat(64) } };
    expect(assessDedicatedGatewayBilling(connection)).toMatchObject({ outcome: "NEED_MORE_EVIDENCE", credential_read_allowed: false, admission_ready: false,
      gaps: expect.arrayContaining(["account_plan_version_and_credit_entitlement", "gateway_supported_tool_environment", "server_enforced_input_and_reasoning_output_bounds"]) });
    expect(() => requireDedicatedGatewayBilling(connection)).toThrow("gateway_reliable_billing_profile_unavailable");
    expect(assessDedicatedGatewayBilling({ ...connection, provider: "zhipuai", model: "zhipuai/glm-5.3" }).gaps).toContain("explicit_pay_as_you_go_connection_and_budget");
  });
});
