import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { isIP } from "node:net";
import { performance } from "node:perf_hooks";
import { compileValidator, RuntimeGatewayNetworkProbeResultSchema, type RuntimeGatewayNetworkProbeResult } from "@cimiloop/protocol/v2";
import { GatewayNetworkBoundary, DEDICATED_GATEWAY_HOST, DEDICATED_GATEWAY_PATH, DEDICATED_GATEWAY_POLICY_DIGEST, type GatewayAddressPin } from "./gateway-network.js";
import { isPublicGatewayAddress, gatewayPeerMatchesPin } from "./gateway-address.js";
import { CODING_PLAN_RATE_DIGEST } from "./gateway-billing.js";
import { atomicJson, directory, digest, rawReference, RuntimeAdapterError } from "./files.js";
const validate = compileValidator<RuntimeGatewayNetworkProbeResult>(RuntimeGatewayNetworkProbeResultSchema);
export const parseRuntimeGatewayNetworkProbe = (value: unknown): RuntimeGatewayNetworkProbeResult => {
  const result = validate(value), dns = result.dns;
  // A dated rate digest is provenance, never billing approval. Historical
  // observations remain readable when the current public rate snapshot changes.
  if (result.route.policy_digest.value !== DEDICATED_GATEWAY_POLICY_DIGEST ||
    result.network_probe_passed !== (dns !== null && result.tls !== null && result.failure_reason === null) || (!result.network_probe_passed && result.failure_reason === null) || result.tls !== null && !dns)
    throw new RuntimeAdapterError("gateway_network_observation_invalid");
  if (dns) {
    const lifetime = Date.parse(dns.expires_at) - Date.parse(dns.resolved_at);
    const keys = dns.addresses.map(a => `${a.family}:${a.address}`);
    if (new Set(keys).size !== keys.length || dns.addresses.some(a => !isPublicGatewayAddress(a.address) || isIP(a.address) !== a.family) ||
      !dns.addresses.some(a => JSON.stringify(a) === JSON.stringify(dns.selected)) || lifetime <= 0 || lifetime !== Math.min(30000, ...dns.addresses.map(a => a.ttl_seconds * 1000)))
      throw new RuntimeAdapterError("gateway_network_observation_invalid");
    const observed = { host: DEDICATED_GATEWAY_HOST, port: 443, path: DEDICATED_GATEWAY_PATH, resolved_at: dns.resolved_at, expires_at: dns.expires_at,
      addresses: dns.addresses, selected: dns.selected };
    if (digest(JSON.stringify(observed)).value !== dns.pin_digest.value || result.tls && !gatewayPeerMatchesPin(dns.selected.address, result.tls.peer_address))
      throw new RuntimeAdapterError("gateway_network_observation_invalid");
  }
  return result;
};
export const runPublicGatewayNetworkProbe = async (options: { root: string; maxElapsedMs?: number }, boundary = new GatewayNetworkBoundary()): Promise<RuntimeGatewayNetworkProbeResult> => {
  const deadline = options.maxElapsedMs ?? 8000;
  if (!Number.isSafeInteger(deadline) || deadline < 1000 || deadline > 30000) throw new RuntimeAdapterError("invalid_gateway_network_deadline");
  const root = directory(options.root), run = directory(join(root, "runs", randomUUID())), start = performance.now();
  let pin: GatewayAddressPin | undefined, tls: RuntimeGatewayNetworkProbeResult["tls"] = null, failure: string | null = null;
  try {
    pin = await boundary.resolve(deadline);
    const remaining = Math.floor(deadline - (performance.now() - start));
    if (remaining < 25) throw new RuntimeAdapterError("gateway_network_deadline_exhausted");
    const connected = await boundary.connect(pin, remaining);
    tls = { verified: true, peer_address: connected.observation.peer_address, protocol: connected.observation.protocol as "TLSv1.2" | "TLSv1.3",
      certificate_digest: { algorithm: "sha256", value: connected.observation.certificate_digest } };
    // Release our exact socket before recording success; no HTTP is written.
    await new Promise<void>(resolve => { if (connected.socket.closed) resolve(); else { connected.socket.once("close", resolve); connected.socket.destroy(); } });
  } catch (error) { failure = error instanceof RuntimeAdapterError ? error.reason : "gateway_network_unproven"; }
  const observation = { dns: pin ? { resolved_at: pin.resolved_at, expires_at: pin.expires_at, addresses: pin.addresses, selected: pin.selected,
    pin_digest: { algorithm: "sha256" as const, value: pin.digest } } : null, tls, failure_reason: failure, http_requests: 0, actual_credentials_read: 0 };
  atomicJson(join(run, "network-observation.json"), observation);
  const result = parseRuntimeGatewayNetworkProbe({ schema_version: "2.0.0", scope: "public_gateway_network_probe", observed_at: new Date().toISOString(),
    route: { provider: "zhipuai-coding-plan", model: "glm-5.3", host: DEDICATED_GATEWAY_HOST, port: 443, path: DEDICATED_GATEWAY_PATH,
      policy_digest: { algorithm: "sha256", value: DEDICATED_GATEWAY_POLICY_DIGEST }, proxy: false, redirects: false, retries: 0 },
    ...observation, network_probe_passed: failure === null && pin !== undefined && tls !== null,
    billing: { admission_ready: false, cost_known: false, reason: "gateway_reliable_billing_profile_unavailable", credit_rate_digest: { algorithm: "sha256", value: CODING_PLAN_RATE_DIGEST },
      account_plan_version_verified: false, token_bounds_verified: false }, external_model_requests: 0, runtime_started: false, formal_execution_enabled: false,
    evidence_refs: [rawReference(root, Buffer.from(JSON.stringify(observation)), "gateway_network_observation", "network-observation.json")],
    gaps: ["confirmed_account_credit_plan_and_gateway_eligibility", "verified_input_and_reasoning_output_bounds", "approved_persistent_credit_budget",
      "authenticated_real_provider_https_contract", "hard_filesystem_quota", "complete_controlled_execution_recovery", "formal_task_binding_and_agent_entry"] });
  atomicJson(join(run, "gateway-network-probe-result.json"), result); atomicJson(join(root, "gateway-network-probe-result.json"), result); return result;
};
