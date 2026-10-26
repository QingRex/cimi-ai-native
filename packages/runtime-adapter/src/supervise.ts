import { spawn } from "node:child_process";
import { openSync, writeSync, closeSync, writeFileSync, existsSync, readdirSync, lstatSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bytesAt, readJson, directory, digest, atomicJson, RuntimeAdapterError, assertOrdinaryPath } from "./files.js";
import { isolatedEnvironment, nativeControl } from "./native.js";
import {nativeHelperProcessOptions} from './native-process-environment.js';
import { validateOperationRequest, diskLimitsFor, isIpcProbeDriver, skillLoaderConfiguration, type OperationRequest } from "./operations.js";
import { readDedicatedApiKey, modelEndpoint, CredentialOutputGuard, validateModelConnection } from "./connection.js";
import { removePrivateDirectory } from "./private-cleanup.js";
import { HostGatewayBridge, isGatewayProbeDriver } from "./gateway-bridge.js";
const workspaceContainsCredential = (path: string, secret: string): boolean => {
  let count = 0;
  const inspect = (current: string, depth: number): boolean => {
    if (++count > 64 || depth > 16) throw new RuntimeAdapterError("runtime_output_limit_exceeded");
    for (const entry of readdirSync(current)) {
      if (entry.includes(secret)) return true;
      const file = assertOrdinaryPath(join(current, entry)), stat = lstatSync(file);
      if (stat.isDirectory() ? inspect(file, depth + 1) : bytesAt(file, 256 * 1024).includes(Buffer.from(secret))) return true;
    }
    return false;
  };
  return inspect(path, 0);
};

export const supervise = async (path: string): Promise<void> => {
  let heartbeat: ReturnType<typeof setInterval> | undefined, stdout: number | undefined, stderr: number | undefined;
  let startupFailed = true, truncated = false, credentialRedacted = false, stateCleanupFailed = false, captureFailed = false;
  let startupFailureReason: string | undefined, apiKey: string | undefined;
  let gatewayBridge: HostGatewayBridge | undefined;
  try {
    const request = readJson(join(path, "request.json")) as OperationRequest;
    validateOperationRequest(request);
    if (request.control_version && digest(bytesAt(request.driver.launcher)).value !== request.launcher_digest?.value) throw new RuntimeAdapterError("native_launcher_digest_changed");
    if (request.control_version) {
      const owner = await nativeControl(request.driver.launcher, ["--identity", String(process.pid)]);
      atomicJson(join(path, "supervisor.json"), { nonce: request.nonce, identity: owner.value });
    }
    const limits = request.effective_disk_limits ?? diskLimitsFor(request.input);
    const connection = request.driver.connection;
    if (connection && (request.driver.kind !== "opencode" || validateModelConnection(connection).model !== request.driver.model)) throw new RuntimeAdapterError("invalid_driver_connection");
    if (connection) apiKey = await readDedicatedApiKey(connection);
    if (digest(bytesAt(request.driver.binary, 512 * 1024 * 1024)).value !== request.driver.binary_digest.value) throw new RuntimeAdapterError("runtime_binary_digest_changed");
    const sandbox = directory(join(path, "sandbox"));
    directory(join(sandbox, "state")); const workspace = directory(join(sandbox, "workspace"));
    for (const file of request.input.files) { const target = join(workspace, file.path); directory(dirname(target)); writeFileSync(target, file.content, { flag: "wx" }); }
    if (request.driver.transport_module) {
      const target = join(directory(join(sandbox, "transport")), "provider.mjs"); copyFileSync(request.driver.transport_module.path, target);
      if (digest(bytesAt(target)).value !== request.driver.transport_module.digest.value) throw new RuntimeAdapterError("ipc_probe_module_changed");
    }
    const loader = skillLoaderConfiguration(request.input, workspace), permission = loader.permission;
    const gateway = isGatewayProbeDriver(request.driver), ipc = isIpcProbeDriver(request.driver), provider = gateway ? "cimiloop-gateway" : "cimiloop-transport";
    if (gateway) gatewayBridge = await HostGatewayBridge.create(path, request);
    const config = { autoupdate: false, share: "disabled", snapshot: false, enabled_providers: [gateway ? provider : ipc ? "cimiloop-transport" : connection?.provider ?? "opencode"], ...loader,
      ...(gateway ? { model: request.driver.model, small_model: request.driver.model,
        provider: { [provider]: { npm: "file:///CIMILOOP_TRANSPORT/provider.mjs", options: { operationKey: request.input.operation_key },
          models: { "cimiloop-synthetic-text": { name: "Synthetic host HTTPS gateway", limit: { context: 16384, output: 128 }, tool_call: false } } } } } : {}),
      ...(ipc ? { model: "cimiloop-transport/probe", small_model: "cimiloop-transport/probe",
        provider: { "cimiloop-transport": { npm: "file:///CIMILOOP_TRANSPORT/provider.mjs", options: { operationKey: request.input.operation_key },
          models: { probe: { name: "Synthetic IPC transport probe", limit: { context: 32768, output: 512 }, tool_call: false } } } } } : {}),
      ...(connection ? { model: connection.model, small_model: connection.model,
        provider: { [connection.provider]: { options: { baseURL: modelEndpoint(connection), apiKey: "{env:CIMILOOP_RUNTIME_API_KEY}", timeout: request.input.max_elapsed_ms } } } } : {}),
      agent: { cimi: { description: "CimiLoop isolated fixture probe", mode: "primary", steps: 5, permission } }, default_agent: "cimi" };
    const args = ["opencode", "opencode_ipc_contract_fixture", "opencode_gateway_contract_fixture"].includes(request.driver.kind) ? ["run", "--pure", "--format", "json", "--model", request.driver.model, "--agent", "cimi", request.input.prompt]
      : request.driver.kind === "native_gateway_contract_fixture" ? ["--gateway-client", request.input.operation_key, request.input.prompt.replace(/^fixture:gateway:/, ""), String(request.input.max_elapsed_ms * 2)]
      : request.driver.kind === "native_ipc_contract_fixture" ? ["--ipc-client", request.input.operation_key, request.input.prompt.replace(/^fixture:ipc:/, ""), String(request.input.max_elapsed_ms * 2)]
      : request.input.prompt.startsWith("fixture:pipe:") ? ["--pipe-attempt", request.input.prompt.slice(13)]
      : request.input.prompt.startsWith("fixture:network:") ? ["--network-canary", request.input.prompt.slice(16)]
      : /^fixture:(disk|total|entries|output)$/.test(request.input.prompt) ? ["--fixture", request.input.prompt.slice(8), String(request.input.max_elapsed_ms * 2)]
      : ["--hold", request.input.prompt, String(Math.min(60_000, request.input.max_elapsed_ms * 2))];
    stdout = openSync(join(path, "stdout.raw"), "wx"); stderr = openSync(join(path, "stderr.raw"), "wx");
    let outputBytes = 0, errorBytes = 0, writtenBytes = 0;
    const pulse = () => atomicJson(join(path, "heartbeat.json"), { nonce: request.nonce, observed_at: new Date().toISOString() });
    pulse(); heartbeat = setInterval(pulse, 500);
    const native = spawn(request.driver.launcher, [sandbox, request.input.mode, String(request.input.max_elapsed_ms), request.driver.binary,
      join(path, "native-proof.json"), join(path, "cancel"), ...(request.control_version ? ["--managed", request.nonce, JSON.stringify(limits)] : []),
      ...(request.control_version === "managed/1.2.0" ? ["--policy", JSON.stringify(request.effective_execution_policy)] : []),
      ...(gatewayBridge ? ["--ipc-gateway", request.input.operation_key, gatewayBridge.gateway.policyDigest] : ipc ? ["--ipc-probe", request.input.operation_key] : []), ...args], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      ...nativeHelperProcessOptions(request.driver.launcher,{ ...isolatedEnvironment(), OPENCODE_CONFIG_CONTENT: JSON.stringify(config), ...(apiKey ? { CIMILOOP_RUNTIME_API_KEY: apiKey } : {}) }) });
    if (gatewayBridge) gatewayBridge.start(native);
    const append = (fd: number, data: Buffer, used: number): number => {
      const remaining = limits.max_output_bytes - writtenBytes;
      if (data.length > remaining && !truncated) {
        truncated = true;
        try { writeFileSync(join(path, "cancel"), "output budget exhausted", { flag: "wx" }); }
        catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) captureFailed = true; }
      }
      if (remaining > 0) { const bytes = data.subarray(0, remaining); writeSync(fd, bytes); writtenBytes += bytes.length; }
      return used + data.length;
    };
    const outGuard = apiKey ? new CredentialOutputGuard(apiKey) : undefined, errGuard = apiKey ? new CredentialOutputGuard(apiKey) : undefined;
    native.stdout.on("data", (data: Buffer) => { outputBytes = append(stdout!, outGuard?.push(data) ?? data, outputBytes); });
    native.stderr.on("data", (data: Buffer) => { errorBytes = append(stderr!, errGuard?.push(data) ?? data, errorBytes); });
    await new Promise<void>((done) => { native.once("spawn", () => { startupFailed = false; }); native.once("error", () => done()); native.once("close", () => done()); });
    if (request.driver.transport_module && digest(bytesAt(join(sandbox, "transport", "provider.mjs"))).value !== request.driver.transport_module.digest.value) captureFailed = true;
    if (outGuard) outputBytes = append(stdout, outGuard.push(Buffer.alloc(0), true), outputBytes);
    if (errGuard) errorBytes = append(stderr, errGuard.push(Buffer.alloc(0), true), errorBytes);
    credentialRedacted = !!outGuard?.redacted || !!errGuard?.redacted;
    if (apiKey) {
      try {
        if (workspaceContainsCredential(workspace, apiKey)) { credentialRedacted = true; removePrivateDirectory(path, "workspace"); directory(workspace); }
      } catch { captureFailed = true; removePrivateDirectory(path, "workspace"); directory(workspace); }
    }
  } catch (error) {
    if (startupFailed) startupFailureReason = error instanceof RuntimeAdapterError ? error.reason : "supervisor_startup_failed";
    else captureFailed = true;
  }
  finally {
    if (gatewayBridge) { try { await gatewayBridge.finish(); } catch { captureFailed = true; } }
    if (heartbeat) clearInterval(heartbeat);
    if (stdout !== undefined) closeSync(stdout); if (stderr !== undefined) closeSync(stderr);
    // Each probe has a new session. Its private runtime state is not a handoff
    // artifact and may contain resolved provider configuration; never collect it.
    try { if (existsSync(join(path, "sandbox"))) removePrivateDirectory(path, "state"); }
    catch { stateCleanupFailed = true; }
    atomicJson(join(path, "result.json"), { startup_failed: startupFailed, output_truncated: truncated, credential_redacted: credentialRedacted,
      state_cleanup_failed: stateCleanupFailed, capture_failed: captureFailed, ...(startupFailureReason ? { startup_failure_reason: startupFailureReason } : {}) });
  }
};
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv[2]) await supervise(process.argv[2]);
