import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, readdirSync, lstatSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compileValidator, RuntimeOperationResultSchema, RuntimeDiskLimitsSchema, SkillRuntimeProfileSchema, type SkillRuntimeProfile, type RuntimeDiskLimits, type RuntimeExecutionPolicy, type RuntimeOperationResult, type ExternalReference, type Digest } from "@cimiloop/protocol/v2";
import { digest, directory, atomicJson, readJson, bytesAt, rawReference, RuntimeAdapterError, assertOrdinaryPath } from "./files.js";
import { isolatedEnvironment } from "./native.js";
import { validateFixedMethodContext } from "./fixed-method.js";
import type { FixedMethodProfile } from "@cimiloop/protocol/v2";
import { validateModelConnection, type DedicatedModelConnection } from "./connection.js";
import { defaultExecutionPolicy, requireSupportedExecutionPolicy, parseExecutionPolicyObservation } from "./execution-policy.js";
import { parseIpcTransportObservation } from "./ipc-observation.js";
import { isGatewayProbeDriver, validateGatewayDriver, readGatewayOwner, parseGatewayTransportObservation, parseGatewayBridgeObservation, type GatewayFixturePolicy } from "./gateway-bridge.js";

export interface ProbeOperationInput {
  scope: "isolated_provider_probe";
  operation_key: string;
  mode: "write" | "read";
  files: { path: string; content: string }[];
  prompt: string;
  max_elapsed_ms: number;
  disk_limits?: RuntimeDiskLimits;
  execution_policy?: RuntimeExecutionPolicy;
  skill_profile?: SkillRuntimeProfile;
  fixed_method_profile?: FixedMethodProfile;
}
export interface ProbeDriver {
  launcher: string; binary: string; binary_digest: Digest;
  kind: "opencode" | "native_contract_fixture" | "opencode_ipc_contract_fixture" | "native_ipc_contract_fixture" | "opencode_gateway_contract_fixture" | "native_gateway_contract_fixture"; model: string;
  connection?: DedicatedModelConnection;
  transport_module?: { path: string; digest: Digest };
  gateway_fixture?: GatewayFixturePolicy;
}
export const isIpcProbeDriver = (driver: ProbeDriver): boolean => ["opencode_ipc_contract_fixture", "native_ipc_contract_fixture"].includes(driver.kind);
export const ipcProbeModule = (): { path: string; digest: Digest } => {
  const path = fileURLToPath(new URL("../transport/opencode-ipc-probe.mjs", import.meta.url)); return { path, digest: digest(bytesAt(path, 65536)) };
};
export const validateIpcProbeDriver = (driver: ProbeDriver, policy: RuntimeExecutionPolicy, currentModule = false): void => {
  if (isGatewayProbeDriver(driver)) { validateGatewayDriver(driver, policy, currentModule); return; }
  if (driver.gateway_fixture) throw new RuntimeAdapterError("invalid_gateway_probe_driver");
  if (!isIpcProbeDriver(driver)) { if (driver.transport_module) throw new RuntimeAdapterError("invalid_ipc_probe_driver"); return; }
  if (driver.connection || policy.network.mode !== "deny_all" || driver.model !== "cimiloop-transport/probe") throw new RuntimeAdapterError("invalid_ipc_probe_driver");
  if (driver.kind === "opencode_ipc_contract_fixture" || driver.transport_module) {
    if (!driver.transport_module || driver.transport_module.digest.algorithm !== "sha256" || !/^[a-f0-9]{64}$/.test(driver.transport_module.digest.value)) throw new RuntimeAdapterError("invalid_ipc_probe_driver");
    if (currentModule) { const expected = ipcProbeModule();
      if (resolve(driver.transport_module.path) !== expected.path || driver.transport_module.digest.value !== expected.digest.value) throw new RuntimeAdapterError("ipc_probe_module_changed"); }
  }
};
export interface OperationRequest { input: ProbeOperationInput; input_digest: Digest; driver: ProbeDriver; nonce: string; control_version?: "managed/1.0.0" | "managed/1.1.0" | "managed/1.2.0";
  launcher_digest?: Digest; effective_disk_limits?: RuntimeDiskLimits; effective_execution_policy?: RuntimeExecutionPolicy; control_digest?: Digest; }
export interface NativeProof { pid: number; profile: string; phase: "running" | "ended"; reason: string; exit_code: number; }
export const parseRuntimeOperation = compileValidator<RuntimeOperationResult>(RuntimeOperationResultSchema);
const parseLimits = compileValidator<RuntimeDiskLimits>(RuntimeDiskLimitsSchema);
export const diskLimitsFor = (input: ProbeOperationInput): RuntimeDiskLimits => input.disk_limits ?? {
  max_sandbox_bytes: 64 * 1024 * 1024, max_sandbox_entries: 256, max_file_bytes: 8 * 1024 * 1024, max_output_bytes: 8 * 1024 * 1024
};
const ordinaryRelativePath = /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*)*$/;
export const validateOperationInput = (input: ProbeOperationInput, frozenLimits?: RuntimeDiskLimits): void => {
  if (Object.keys(input).filter(key => !["disk_limits", "execution_policy", "skill_profile", "fixed_method_profile"].includes(key)).sort().join(",") !== "files,max_elapsed_ms,mode,operation_key,prompt,scope" ||
    input.scope !== "isolated_provider_probe" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(input.operation_key) || !["write", "read"].includes(input.mode) ||
    !Number.isSafeInteger(input.max_elapsed_ms) || input.max_elapsed_ms < 100 || input.max_elapsed_ms > 180_000 || typeof input.prompt !== "string" || !input.prompt || input.prompt.length > 16_000 ||
    !Array.isArray(input.files) || input.files.length < 1 || input.files.length > 32 || new Set(input.files.map(file => file.path.toLowerCase())).size !== input.files.length) throw new RuntimeAdapterError("invalid_probe_input");
  for (const file of input.files) if (Object.keys(file).sort().join(",") !== "content,path" || !ordinaryRelativePath.test(file.path) || file.path.length > 240 ||
    file.path.split("/").some(part => /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part) || part.endsWith(".")) ||
    typeof file.content !== "string" || Buffer.byteLength(file.content) > 256 * 1024) throw new RuntimeAdapterError("invalid_probe_file");
  if (input.execution_policy !== undefined) requireSupportedExecutionPolicy(input.execution_policy);
  if (input.skill_profile !== undefined) {
    const profile = compileValidator<SkillRuntimeProfile>(SkillRuntimeProfileSchema)(input.skill_profile);
    if (input.mode !== "read" || profile.skill_names.some(name => !input.files.some(file => file.path === `skill-source/${name}/SKILL.md`)) ||
      input.files.some(file => file.path.startsWith("skill-source/") && !profile.skill_names.includes(file.path.split("/")[1]!))) throw new RuntimeAdapterError("invalid_skill_probe_profile");
  } else if (input.fixed_method_profile) {
    if (input.mode !== "read") throw new RuntimeAdapterError("invalid_fixed_method_profile");
    validateFixedMethodContext(input.fixed_method_profile, input.files, input.operation_key);
  } else if (input.files.some(file => file.path.startsWith("skill-source/"))) throw new RuntimeAdapterError("skill_probe_profile_required");
  if (input.skill_profile && input.fixed_method_profile) throw new RuntimeAdapterError("ambiguous_method_profile");
  let limits: RuntimeDiskLimits;
  try { limits = parseLimits(frozenLimits ?? diskLimitsFor(input)); } catch { throw new RuntimeAdapterError("invalid_disk_limits"); }
  const entries = new Set(input.files.flatMap(file => file.path.split("/").map((_, i, parts) => parts.slice(0, i + 1).join("/"))));
  if (limits.max_file_bytes > limits.max_sandbox_bytes || entries.size + 2 > limits.max_sandbox_entries ||
    input.files.some(file => Buffer.byteLength(file.content) > limits.max_file_bytes) ||
    input.files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0) > limits.max_sandbox_bytes) throw new RuntimeAdapterError("probe_input_disk_limit_exceeded");
};
export const skillLoaderConfiguration = (input: ProbeOperationInput, workspace: string) => {
  validateOperationInput(input);
  const permission = { "*": "deny", read: "allow", ...(input.mode === "write" ? { edit: "allow" } : {}),
    ...(input.fixed_method_profile ? { skill: { "*": "deny" } } : {}),
    ...(input.skill_profile ? { skill: { "*": "deny", ...Object.fromEntries(input.skill_profile.skill_names.map(name => [name, "allow"])) } } : {}) };
  return { permission, ...(input.skill_profile ? { skills: { paths: [join(workspace, "skill-source")], urls: [] } } : {}) };
};
export const validateOperationRequest = (request: OperationRequest): void => {
  validateOperationInput(request.input, request.effective_disk_limits);
  // Named projection currently has a synthetic-only host. The ordinary probe
  // supervisor cannot silently run this prompt against a credentialed driver.
  if (request.input.fixed_method_profile) throw new RuntimeAdapterError("named_method_host_not_admitted");
  if (request.input_digest.value !== digest(JSON.stringify({ input: request.input, driver: request.driver })).value) throw new RuntimeAdapterError("operation_record_corrupt");
  if (request.control_version && !["managed/1.0.0", "managed/1.1.0", "managed/1.2.0"].includes(request.control_version)) throw new RuntimeAdapterError("operation_record_corrupt");
  if (["managed/1.1.0", "managed/1.2.0"].includes(request.control_version ?? "") && (!request.effective_disk_limits || !request.launcher_digest ||
    request.control_digest?.value !== digest(JSON.stringify({ control_version: request.control_version, effective_disk_limits: request.effective_disk_limits, launcher_digest: request.launcher_digest,
      ...(request.control_version === "managed/1.2.0" ? { effective_execution_policy: request.effective_execution_policy } : {}) })).value ||
    request.input.disk_limits && digest(JSON.stringify(request.input.disk_limits)).value !== digest(JSON.stringify(request.effective_disk_limits)).value)) throw new RuntimeAdapterError("operation_record_corrupt");
  if (request.control_version === "managed/1.2.0") {
    if (!request.effective_execution_policy || request.input.execution_policy && digest(JSON.stringify(request.input.execution_policy)).value !== digest(JSON.stringify(request.effective_execution_policy)).value)
      throw new RuntimeAdapterError("operation_record_corrupt");
    requireSupportedExecutionPolicy(request.effective_execution_policy, request.driver.kind === "opencode");
    validateIpcProbeDriver(request.driver, request.effective_execution_policy);
  }
};
export const normalizeOpenCode = (raw: string, proof: NativeProof): { status: RuntimeOperationResult["status"]; reason: string; session_id?: string } => {
  if (proof.phase !== "ended") return { status: "Running", reason: "native_process_running" };
  if (proof.reason === "cancelled") return { status: "Cancelled", reason: "native_job_terminated" };
  if (proof.reason === "timeout") return { status: "Failed", reason: "elapsed_budget_exhausted" };
  if (proof.reason === "disk_limit") return { status: "Failed", reason: "disk_budget_exhausted" };
  if (proof.reason === "output_limit") return { status: "Failed", reason: "output_budget_exhausted" };
  if (proof.reason !== "exited") return { status: "Unknown", reason: proof.reason };
  let session: string | undefined, finish = false, providerError = false, malformed = false;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim().startsWith("{")) continue;
    let event: Record<string, unknown>;
    try { event = JSON.parse(line) as Record<string, unknown>; } catch { malformed = true; continue; }
    if (event.event === "sandbox.started") continue;
    if (typeof event.sessionID === "string" && /^ses_[a-zA-Z0-9]+$/.test(event.sessionID)) {
      if (session && session !== event.sessionID) malformed = true;
      session = event.sessionID;
    }
    if (event.type === "error") providerError = true;
    if (event.type === "step_finish" && typeof event.part === "object" && event.part !== null && "reason" in event.part) finish = ["stop", "end_turn"].includes(String(event.part.reason));
  }
  const optionalSession = session ? { session_id: session } : {};
  if (providerError || proof.exit_code !== 0) return { status: "Failed", reason: providerError ? "provider_error" : "native_exit_nonzero", ...optionalSession };
  if (!session || !finish || malformed) return { status: "Unknown", reason: "provider_completion_unproven", ...optionalSession };
  return { status: "Succeeded", reason: "provider_completed_probe", ...optionalSession };
};
const workspaceOutputs = (root: string, workspace: string, prefix = ""): ExternalReference[] => {
  const refs: ExternalReference[] = [];
  for (const name of readdirSync(workspace)) {
    const path = join(workspace, name), relative = prefix + name, stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new RuntimeAdapterError("runtime_output_link_denied");
    if (stat.isDirectory()) refs.push(...workspaceOutputs(root, path, `${relative}/`));
    else refs.push(rawReference(root, bytesAt(path, 256 * 1024), "probe_workspace_file", relative));
    if (refs.length > 64) throw new RuntimeAdapterError("runtime_output_limit_exceeded");
  }
  return refs;
};
export class IsolatedProbeAdapter {
  readonly root: string;
  constructor(root: string, readonly driver: ProbeDriver) { this.root = directory(root); }
  operationPath(key: string): string {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(key)) throw new RuntimeAdapterError("invalid_operation_key");
    return assertOrdinaryPath(join(this.root, "operations", key));
  }
  async start(input: ProbeOperationInput): Promise<RuntimeOperationResult> {
    validateOperationInput(input);
    if (input.fixed_method_profile) throw new RuntimeAdapterError("named_method_host_not_admitted");
    if (this.driver.connection && (this.driver.kind !== "opencode" || validateModelConnection(this.driver.connection).model !== this.driver.model)) throw new RuntimeAdapterError("invalid_driver_connection");
    const path = this.operationPath(input.operation_key), inputDigest = digest(JSON.stringify({ input, driver: this.driver }));
    // Existing claims retain their original policy and never launch again.
    if (!existsSync(path)) {
      const policy = requireSupportedExecutionPolicy(input.execution_policy ?? defaultExecutionPolicy(), this.driver.kind === "opencode"); validateIpcProbeDriver(this.driver, policy, true);
    }
    directory(dirname(path));
    try { mkdirSync(path); } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
      if (!existsSync(join(path, "request.json"))) throw new RuntimeAdapterError("operation_claim_incomplete");
      const request = readJson(join(path, "request.json")) as OperationRequest;
      if (request.input_digest.value !== inputDigest.value) throw new RuntimeAdapterError("operation_key_input_conflict");
      return this.query(input.operation_key);
    }
    // The durable claim precedes every external start. Lost acknowledgements
    // never trigger a second launch; incomplete claims require reconciliation.
    const control = { control_version: "managed/1.2.0" as const, effective_disk_limits: diskLimitsFor(input), launcher_digest: digest(bytesAt(this.driver.launcher)),
      effective_execution_policy: requireSupportedExecutionPolicy(input.execution_policy ?? defaultExecutionPolicy(), this.driver.kind === "opencode") };
    const request: OperationRequest = { input, input_digest: inputDigest, driver: this.driver, nonce: randomUUID(),
      ...control, control_digest: digest(JSON.stringify(control)) };
    atomicJson(join(path, "request.json"), request);
    const worker = spawn(process.execPath, [fileURLToPath(new URL("../dist/supervise.js", import.meta.url)), path], {
      detached: true, windowsHide: true, stdio: "ignore", env: isolatedEnvironment()
    });
    await new Promise<void>((done) => { worker.once("spawn", done); worker.once("error", () => done()); });
    worker.unref();
    return this.query(input.operation_key);
  }
  query(key: string): RuntimeOperationResult {
    const path = this.operationPath(key), request = readJson(join(path, "request.json")) as OperationRequest;
    validateOperationRequest(request);
    if (request.input.operation_key !== key) throw new RuntimeAdapterError("operation_record_corrupt");
    const proofPath = join(path, "native-proof.json"), heartbeatPath = join(path, "heartbeat.json"), resultPath = join(path, "result.json");
    let state: Pick<RuntimeOperationResult, "status" | "reason" | "session_id" | "exit_code"> = { status: "Unknown", reason: "start_not_yet_proven" };
    let proof: NativeProof | undefined;
    let observationUnavailable = false;
    const observe = (file: string): unknown => {
      try { return readJson(file); }
      catch (error) {
        if (!(error instanceof SyntaxError) && !(error && typeof error === "object" && "code" in error && ["EBUSY", "EACCES", "EPERM", "ENOENT"].includes(String(error.code)))) throw error;
        observationUnavailable = true; return undefined;
      }
    };
    if (existsSync(proofPath)) {
      proof = observe(proofPath) as NativeProof | undefined;
      if (proof) {
        const raw = existsSync(join(path, "stdout.raw")) ? bytesAt(join(path, "stdout.raw")).toString("utf8") : "";
        state = ["native_contract_fixture", "native_ipc_contract_fixture", "native_gateway_contract_fixture"].includes(request.driver.kind) && proof.phase === "ended" && proof.reason === "exited" ? { status: proof.exit_code === 0 ? "Succeeded" : "Failed", reason: "native_fixture_exited" } : normalizeOpenCode(raw, proof);
        if (request.driver.kind === "opencode_ipc_contract_fixture" && state.status === "Succeeded") state.reason = "synthetic_transport_completed";
        if (request.driver.kind === "opencode_gateway_contract_fixture" && state.status === "Succeeded") state.reason = "synthetic_gateway_bridge_completed";
        if (proof.phase === "ended") state.exit_code = proof.exit_code;
      }
    }
    if (existsSync(resultPath)) {
      const result = (observe(resultPath) ?? {}) as { output_truncated?: boolean; startup_failed?: boolean; credential_redacted?: boolean; state_cleanup_failed?: boolean; capture_failed?: boolean; startup_failure_reason?: string };
      if (result.output_truncated) state = proof?.phase === "ended" && ["exited", "cancelled", "output_limit"].includes(proof.reason)
        ? { status: "Failed", reason: "output_budget_exhausted", exit_code: proof.exit_code } : { status: "Unknown", reason: "provider_output_truncated" };
      if (result.capture_failed) state = { status: "Unknown", reason: "provider_capture_failed" };
      if (result.credential_redacted) state = { status: "Unknown", reason: "runtime_credential_disclosure_blocked" };
      if (result.state_cleanup_failed) state = { status: "Unknown", reason: "runtime_state_cleanup_failed" };
      if (result.startup_failed && !proof) state = { status: "NotStarted", reason: result.startup_failure_reason ?? "supervisor_startup_failed" };
    }
    if (state.status === "Running") {
      const heartbeat = existsSync(heartbeatPath) ? observe(heartbeatPath) as { observed_at: string } | undefined : undefined;
      if (!heartbeat || Date.now() - Date.parse(heartbeat.observed_at) > 10_000) state = { status: "Unknown", reason: "supervisor_observation_lost" };
    }
    if (request.control_version && proof?.phase === "ended" && !existsSync(resultPath)) state = { status: "Unknown", reason: "supervisor_completion_unproven" };
    if (request.control_version === "managed/1.2.0" && proof && state.status !== "NotStarted") {
      try {
        const policyProof = parseExecutionPolicyObservation(observe(join(path, "execution-policy-proof.json")));
        if (policyProof.operation_key !== key || policyProof.pid !== proof.pid || policyProof.network_mode !== request.effective_execution_policy!.network.mode)
          throw new RuntimeAdapterError("execution_policy_proof_mismatch");
      } catch { state = { status: "Unknown", reason: "execution_policy_unproven" }; }
    }
    if (existsSync(join(path, "recovery.json"))) {
      const recovery = observe(join(path, "recovery.json")) as { capture_lost?: boolean; completion_unproven?: boolean } | undefined;
      if (recovery?.capture_lost || recovery?.completion_unproven) state = { status: "Unknown", reason: "crash_recovered_completion_unproven" };
    }
    if (isIpcProbeDriver(request.driver) && proof) {
      try {
        const ipc = parseIpcTransportObservation(observe(join(path, "ipc-transport-proof.json")));
        if (ipc.operation_key !== key || ipc.runtime_pid !== proof.pid || ipc.failure_reason !== null ||
          state.status === "Succeeded" && (ipc.phase !== "ended" || request.driver.kind === "opencode_ipc_contract_fixture" && ipc.accepted_requests < 1))
          throw new RuntimeAdapterError("ipc_transport_proof_mismatch");
      } catch { state = { status: "Unknown", reason: "ipc_transport_unproven" }; }
    }
    if (isGatewayProbeDriver(request.driver) && proof) {
      try {
        const owner = readGatewayOwner(path, request), transport = parseGatewayTransportObservation(observe(join(path, "gateway-transport-proof.json"))),
          host = parseGatewayBridgeObservation(observe(join(path, "gateway-host-proof.json")));
        const nativeOwner = observe(join(path, "native-ownership.json")) as { nonce?: string; native_identity?: { pid?: number }; runtime_identity?: { pid?: number } };
        if (transport.operation_key !== key || host.operation_key !== key || transport.runtime_pid !== proof.pid ||
          transport.gateway_policy_digest.value !== owner.gateway_policy_digest.value || host.gateway_policy_digest.value !== owner.gateway_policy_digest.value ||
          host.fixture_config_digest.value !== owner.fixture_config_digest.value || host.budget.maximum_micro_units !== owner.maximum_micro_units || transport.failure_reason || host.failure_reason ||
          nativeOwner.nonce !== request.nonce || nativeOwner.runtime_identity?.pid !== proof.pid ||
          host.native_pid !== null && host.native_pid !== nativeOwner.native_identity?.pid || host.runtime_pid !== null && host.runtime_pid !== proof.pid ||
          proof.phase === "ended" && (host.phase !== "ended" || transport.phase !== "ended" || host.native_pid === null)) throw new RuntimeAdapterError("gateway_bridge_proof_mismatch");
        if (state.status === "Succeeded" && request.driver.kind === "opencode_gateway_contract_fixture" &&
          (host.synthetic_http_requests < 1 || host.attempts.every(a => a.outcome !== "completed") || host.attempts.some(a => a.outcome === "denied") ||
            host.attempts.length !== transport.accepted_requests || host.attempts.some(h => !transport.attempts.some(a => a.outcome === "accepted" && a.request_digest === h.wire_digest.value)))) throw new RuntimeAdapterError("gateway_bridge_completion_unproven");
        if (host.phase === "ended" && proof.phase !== "ended") state = { status: "Unknown", reason: "gateway_native_completion_unproven" };
      } catch { state = { status: "Unknown", reason: "gateway_bridge_unproven" }; }
    }
    if (observationUnavailable) state = { status: "Unknown", reason: "runtime_observation_read_unavailable" };
    return parseRuntimeOperation({ schema_version: "2.0.0", scope: "isolated_provider_probe", operation_key: key, input_digest: request.input_digest,
      ...state, cancel_requested: existsSync(join(path, "cancel")), observed_at: new Date().toISOString(), raw_refs: [], outputs: [], usage: { cost_known: false } });
  }
  cancel(key: string): RuntimeOperationResult {
    const current = this.query(key);
    if (!["Succeeded", "Failed", "Cancelled", "NotStarted"].includes(current.status)) {
      try { writeFileSync(join(this.operationPath(key), "cancel"), "cancel requested", { flag: "wx" }); }
      catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error; }
    }
    return this.query(key);
  }
  collect(key: string): RuntimeOperationResult {
    const current = this.query(key), path = this.operationPath(key);
    for (const name of ["stdout.raw", "stderr.raw", "native-proof.json", "resource-proof.json", "execution-policy-proof.json", "ipc-transport-proof.json", "gateway-transport-proof.json", "gateway-host-proof.json", "gateway-upstream-proof.json", "gateway-recovery.json"]) if (existsSync(join(path, name))) {
      try { current.raw_refs.push(rawReference(this.root, bytesAt(join(path, name)), "probe_raw", name)); }
      catch { current.status = "Unknown"; current.reason = "runtime_raw_collection_unavailable"; }
    }
    const resourceStopped = current.status === "Failed" && ["disk_budget_exhausted", "output_budget_exhausted"].includes(current.reason);
    if (!resourceStopped && existsSync(join(path, "sandbox", "workspace")) && ["Succeeded", "Failed", "Cancelled"].includes(current.status)) {
      try { current.outputs = workspaceOutputs(this.root, join(path, "sandbox", "workspace")); }
      catch { current.status = "Unknown"; current.reason = "workspace_collection_failed"; }
    }
    return parseRuntimeOperation(current);
  }
}
export const openProbeOperation = (root: string, key: string): IsolatedProbeAdapter => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(key)) throw new RuntimeAdapterError("invalid_operation_key");
  const request = readJson(join(assertOrdinaryPath(root), "operations", key, "request.json")) as OperationRequest;
  return new IsolatedProbeAdapter(root, request.driver);
};
