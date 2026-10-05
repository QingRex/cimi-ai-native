import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { compileValidator, RuntimeRecoveryResultSchema, type RuntimeRecoveryResult } from "@cimiloop/protocol/v2";
import { openProbeOperation, validateOperationRequest, type OperationRequest } from "./operations.js";
import { atomicJson, bytesAt, digest, readJson, rawReference, RuntimeAdapterError } from "./files.js";
import { buildWindowsLauncher, nativeControl } from "./native.js";
import { removePrivateDirectory } from "./private-cleanup.js";
import { isGatewayProbeDriver, reconcileGatewayBudget } from "./gateway-bridge.js";

export const parseRuntimeRecovery = compileValidator<RuntimeRecoveryResult>(RuntimeRecoveryResultSchema);
export const recoverProbeOperation = async (root: string, key: string): Promise<RuntimeRecoveryResult> => {
  const adapter = openProbeOperation(root, key), path = adapter.operationPath(key), request = readJson(join(path, "request.json")) as OperationRequest;
  validateOperationRequest(request);
  if (request.input.operation_key !== key) throw new RuntimeAdapterError("operation_record_corrupt");
  const cleanup = { resources_disposed: false, state_removed: false, workspace_discarded: false };
  const result: RuntimeRecoveryResult = { schema_version: "2.0.0", scope: "isolated_provider_probe", operation_key: key,
    observed_at: new Date().toISOString(), outcome: "unknown", reason: "durable_ownership_missing", operation: adapter.query(key), cleanup, raw_refs: [] };
  if (!request.control_version || !existsSync(join(path, "native-ownership.json")) || !existsSync(join(path, "supervisor.json"))) return parseRuntimeRecovery(result);
  const launcher = await buildWindowsLauncher(adapter.root);
  if (digest(bytesAt(request.driver.launcher)).value !== request.launcher_digest?.value) {
    result.reason = "native_launcher_digest_changed"; return parseRuntimeRecovery(result);
  }
  try {
    const response = await nativeControl(launcher, ["--recover", join(path, "sandbox"), join(path, "native-ownership.json"), request.nonce, request.driver.binary, request.input.mode, resolve(request.driver.launcher)]);
    const native = response.value as { outcome?: string; reason?: string; resources_disposed?: boolean };
    result.raw_refs.push(rawReference(adapter.root, response.bytes, "probe_recovery", "native-recovery.json"));
    if (!["active", "recovered", "unknown"].includes(native.outcome ?? "") || typeof native.reason !== "string" || typeof native.resources_disposed !== "boolean") throw new RuntimeAdapterError("native_recovery_output_invalid");
    result.outcome = native.outcome as RuntimeRecoveryResult["outcome"]; result.reason = native.reason;
    if (result.outcome === "recovered" && native.resources_disposed) {
      cleanup.resources_disposed = true;
      if (isGatewayProbeDriver(request.driver)) reconcileGatewayBudget(path, request);
      // Native verifies exact image + process creation identity and requires all
      // original owners to be absent before any resource disposal.
      removePrivateDirectory(path, "state"); cleanup.state_removed = true;
      const captureLost = !existsSync(join(path, "result.json"));
      const proof = existsSync(join(path, "native-proof.json")) ? readJson(join(path, "native-proof.json")) as { phase?: string } : undefined;
      if (captureLost && request.driver.connection) { removePrivateDirectory(path, "workspace"); cleanup.workspace_discarded = true; }
      const previous = existsSync(join(path, "recovery.json")) ? readJson(join(path, "recovery.json")) as { capture_lost?: boolean; completion_unproven?: boolean; workspace_discarded?: boolean } : undefined;
      cleanup.workspace_discarded ||= previous?.workspace_discarded === true;
      atomicJson(join(path, "recovery.json"), { nonce: request.nonce, resources_disposed: true, state_removed: true,
        workspace_discarded: cleanup.workspace_discarded, capture_lost: captureLost || previous?.capture_lost === true,
        completion_unproven: proof?.phase !== "ended" || previous?.completion_unproven === true });
      result.operation = adapter.query(key);
    }
  } catch (error) {
    result.outcome = "unknown"; result.reason = error instanceof RuntimeAdapterError ? error.reason : "private_state_cleanup_unproven";
  }
  result.observed_at = new Date().toISOString();
  return parseRuntimeRecovery(result);
};
