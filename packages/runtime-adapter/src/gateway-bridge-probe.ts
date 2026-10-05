import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { compileValidator, RuntimeGatewayBridgeProbeResultSchema, type RuntimeGatewayBridgeProbeResult } from "@cimiloop/protocol/v2";
import { buildWindowsLauncher, pinBinary } from "./native.js";
import { IsolatedProbeAdapter } from "./operations.js";
import { gatewayProbeModule, gatewayFixturePolicy, parseGatewayBridgeObservation, parseGatewayTransportObservation } from "./gateway-bridge.js";
import { nativeProbe, waitForOperation } from "./probe.js";
import { directory, bytesAt, readJson, atomicJson, RuntimeAdapterError } from "./files.js";
import { defaultExecutionPolicy } from "./execution-policy.js";
const validate = compileValidator<RuntimeGatewayBridgeProbeResult>(RuntimeGatewayBridgeProbeResultSchema);
export const parseRuntimeGatewayBridgeProbe = (value: unknown): RuntimeGatewayBridgeProbeResult => {
  const result = validate(value); parseGatewayBridgeObservation(result.bridge); parseGatewayTransportObservation(result.transport);
  if (result.bridge.operation_key !== result.operation.operation_key || result.transport.operation_key !== result.operation.operation_key ||
    result.bridge.gateway_policy_digest.value !== result.transport.gateway_policy_digest.value || result.bridge.runtime_pid !== result.transport.runtime_pid ||
    result.bridge_probe_passed && (result.operation.status !== "Succeeded" || result.bridge.phase !== "ended" || result.transport.phase !== "ended" ||
      result.bridge.failure_reason || result.transport.failure_reason || result.bridge.synthetic_http_requests < 1 || result.bridge.attempts.some(a => a.outcome !== "completed")))
    throw new RuntimeAdapterError("gateway_bridge_probe_observation_invalid"); return result;
};
export const runOpenCodeGatewayBridgeProbe = async (options: { root: string; binary: string; maxElapsedMs?: number }): Promise<RuntimeGatewayBridgeProbeResult> => {
  const elapsed = options.maxElapsedMs ?? 30000;
  if (!Number.isSafeInteger(elapsed) || elapsed < 1000 || elapsed > 180000) throw new RuntimeAdapterError("invalid_gateway_bridge_elapsed");
  const root = directory(options.root), launcher = await buildWindowsLauncher(root), pinned = pinBinary(root, options.binary);
  const versionProbe = await nativeProbe(root, launcher, pinned.path, "read", ["--version"]);
  const version = versionProbe.stdout.split(/\r?\n/).map(s => s.trim()).find(s => /^\d+\.\d+\.\d+$/.test(s));
  if (!version || versionProbe.proof.exit_code !== 0) throw new RuntimeAdapterError("opencode_version_probe_failed");
  const module = gatewayProbeModule(), adapter = new IsolatedProbeAdapter(root, { launcher, binary: pinned.path, binary_digest: pinned.digest,
    kind: "opencode_gateway_contract_fixture", model: "cimiloop-gateway/cimiloop-synthetic-text", transport_module: module, gateway_fixture: gatewayFixturePolicy() });
  const key = `gateway_${randomUUID().replaceAll("-", "")}`;
  await adapter.start({ scope: "isolated_provider_probe", operation_key: key, mode: "read", files: [{ path: "input.txt", content: "Synthetic gateway fixture" }],
    prompt: "Return the synthetic host gateway response.", max_elapsed_ms: elapsed, execution_policy: defaultExecutionPolicy() });
  const operation = await waitForOperation(adapter, key, elapsed + 15000), path = adapter.operationPath(key);
  const bridge = parseGatewayBridgeObservation(readJson(join(path, "gateway-host-proof.json"))), transport = parseGatewayTransportObservation(readJson(join(path, "gateway-transport-proof.json")));
  const marker = bytesAt(join(path, "stdout.raw")).toString().split(/\r?\n/).some(line => {
    try { const event = JSON.parse(line) as { type?: string; sessionID?: string; part?: { text?: string } }; return event.type === "text" && event.sessionID === operation.session_id && event.part?.text === "CIMILOOP_GATEWAY_OK"; } catch { return false; }
  });
  const result = parseRuntimeGatewayBridgeProbe({ schema_version: "2.0.0", scope: "synthetic_gateway_bridge_probe", observed_at: new Date().toISOString(),
    provider: { name: "opencode", version, binary_digest: pinned.digest, module_digest: module.digest }, sandbox: "windows_appcontainer_job", network_mode: "deny_all",
    operation, bridge, transport, bridge_probe_passed: operation.status === "Succeeded" && marker, ipc_runtime_connected: true, cost_known: false,
    external_model_requests: 0, actual_credentials_read: 0, formal_execution_enabled: false, evidence_refs: [...versionProbe.refs, ...operation.raw_refs],
    gaps: ["verified_real_provider_billing_upper_bound", "real_provider_gateway_acceptance", "tool_and_multimodal_gateway_contracts", "hard_filesystem_quota", "complete_crash_recovery_acceptance", "formal_task_binding_and_agent_entry"] });
  atomicJson(join(root, "gateway-bridge-probe-result.json"), result); return result;
};
