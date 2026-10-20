import { expect, it } from "vitest";
import { digest } from "@cimiloop/runtime-adapter";
import { productionModelFeeAuthorized } from "../src/agent-production-admission-local.js";

const connection = { format: "cimiloop/dedicated-model/1.0.0" as const, provider: "openai-compatible" as const, model: "openai-compatible/deepseek-v4.1-flash", endpoint: "https://opencode.ai/inference/go/openai/v1/chat/completions", credential_file: "C:\\CimiS1\\outside-credential.dpapi.json", credential_digest: digest("public fixture identity") };
const policy = { profile: { model: "deepseek-v4.1-flash", thinking: "disabled" as const }, cash_limit_micros: 5_000_000, cash_per_call_upper_micros: 5_000_000, credit_limit_micro_units: 0, credit_per_call_upper_micro_units: 0 };

it("authorizes only deepseek-v4.1-flash on the documented OpenCode Go endpoint within five dollars", () => {
  expect(productionModelFeeAuthorized()).toBe(false);
  expect(productionModelFeeAuthorized(connection)).toBe(true);
  expect(productionModelFeeAuthorized(connection, policy)).toBe(true);
  expect(productionModelFeeAuthorized(connection, { ...policy, cash_limit_micros: 5_000_001 })).toBe(false);
  expect(productionModelFeeAuthorized(connection, { ...policy, cash_per_call_upper_micros: 5_000_001 })).toBe(false);
  expect(productionModelFeeAuthorized(connection, { ...policy, credit_limit_micro_units: 1 })).toBe(false);
  expect(productionModelFeeAuthorized({ ...connection, model: "openai-compatible/grok-4", endpoint: "https://api.x.ai/v1/chat/completions" }, { ...policy, profile: { model: "grok-4", thinking: "disabled" } })).toBe(false);
  expect(productionModelFeeAuthorized({ ...connection, endpoint: "https://opencode.ai/zen/go/v1/chat/completions" })).toBe(false);
});
