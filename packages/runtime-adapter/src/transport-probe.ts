import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { compileValidator, RuntimeTransportProbeResultSchema, type RuntimeTransportProbeResult } from "@cimiloop/protocol/v2";
import { buildWindowsLauncher, pinBinary } from "./native.js";
import { directory, bytesAt, atomicJson, RuntimeAdapterError } from "./files.js";
import { IsolatedProbeAdapter, ipcProbeModule } from "./operations.js";
import { nativeProbe, waitForOperation } from "./probe.js";
import { defaultExecutionPolicy } from "./execution-policy.js";

export const parseRuntimeTransportProbe = compileValidator<RuntimeTransportProbeResult>(RuntimeTransportProbeResultSchema);
export const runOpenCodeTransportProbe = async (options: { root: string; binary: string; maxElapsedMs?: number }): Promise<RuntimeTransportProbeResult> => {
  const elapsed = options.maxElapsedMs ?? 20000;
  if (!Number.isSafeInteger(elapsed) || elapsed < 1000 || elapsed > 180000) throw new RuntimeAdapterError("invalid_transport_probe_elapsed");
  const root = directory(options.root), launcher = await buildWindowsLauncher(root), pinned = pinBinary(root, options.binary);
  const versionProbe = await nativeProbe(root, launcher, pinned.path, "read", ["--version"]);
  const version = versionProbe.stdout.split(/\r?\n/).map(line => line.trim()).find(line => /^\d+\.\d+\.\d+$/.test(line));
  if (!version || versionProbe.proof.exit_code !== 0) throw new RuntimeAdapterError("opencode_version_probe_failed");
  const module = ipcProbeModule(), adapter = new IsolatedProbeAdapter(root, { launcher, binary: pinned.path, binary_digest: pinned.digest,
    kind: "opencode_ipc_contract_fixture", model: "cimiloop-transport/probe", transport_module: module });
  const key = `ipc_${randomUUID().replaceAll("-", "")}`;
  await adapter.start({ scope: "isolated_provider_probe", operation_key: key, mode: "read", files: [{ path: "input.txt", content: "synthetic transport fixture" }],
    prompt: "Return the synthetic IPC transport marker.", max_elapsed_ms: elapsed, execution_policy: defaultExecutionPolicy() });
  const operation = await waitForOperation(adapter, key, elapsed + 15000);
  const marker = bytesAt(join(adapter.operationPath(key), "stdout.raw")).toString("utf8").split(/\r?\n/).some(line => {
    try { const event = JSON.parse(line) as { type?: string; sessionID?: string; part?: { text?: string } };
      return event.type === "text" && event.sessionID === operation.session_id && event.part?.text === "CIMILOOP_IPC_OK";
    } catch { return false; }
  });
  const result = parseRuntimeTransportProbe({ schema_version: "2.0.0", scope: "synthetic_transport_probe", observed_at: new Date().toISOString(),
    provider: { name: "opencode", version, binary_digest: pinned.digest, module_digest: module.digest }, sandbox: "windows_appcontainer_job", network_mode: "deny_all",
    operation, transport_probe_passed: operation.status === "Succeeded" && marker,
    external_model_requests: 0, actual_credentials_read: 0, formal_execution_enabled: false, evidence_refs: [...versionProbe.refs, ...operation.raw_refs],
    gaps: ["gateway_host_path_model_enforcement", "durable_cost_reservations_and_accounting", "hard_filesystem_quota", "complete_crash_recovery_acceptance", "formal_task_binding_and_agent_entry"] });
  atomicJson(join(root, "transport-probe-result.json"), result); return result;
};
