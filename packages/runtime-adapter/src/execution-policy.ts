import { compileValidator, RuntimeExecutionPolicySchema, RuntimeExecutionPolicyObservationSchema,
  type RuntimeExecutionPolicy, type RuntimeExecutionPolicyObservation } from "@cimiloop/protocol/v2";
import { RuntimeAdapterError } from "./files.js";

export const parseExecutionPolicy = compileValidator<RuntimeExecutionPolicy>(RuntimeExecutionPolicySchema);
export const parseExecutionPolicyObservation = compileValidator<RuntimeExecutionPolicyObservation>(RuntimeExecutionPolicyObservationSchema);
export const defaultExecutionPolicy = (): RuntimeExecutionPolicy => ({ network: { mode: "deny_all" }, cost: { mode: "unmetered_probe_only" } });
export const requireSupportedExecutionPolicy = (value: unknown, modelOperation = false): RuntimeExecutionPolicy => {
  let policy: RuntimeExecutionPolicy;
  try { policy = parseExecutionPolicy(value); } catch { throw new RuntimeAdapterError("invalid_execution_policy"); }
  if (policy.network.mode === "host_allowlist") throw new RuntimeAdapterError("network_host_enforcement_unavailable");
  if (policy.cost.mode === "required_cap") throw new RuntimeAdapterError("cost_enforcement_unavailable");
  if (modelOperation && policy.network.mode === "deny_all") throw new RuntimeAdapterError("model_network_access_denied");
  return policy;
};
