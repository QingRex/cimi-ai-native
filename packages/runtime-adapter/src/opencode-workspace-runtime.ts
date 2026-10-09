import {selectAgentRuntimeLifetime} from "./agent-runtime-lifetime.js";
import {readRuntimeBinaryOriginal} from "./runtime-binary-originals.js";
import { AgentRuntimeModelHost } from "./agent-runtime-model.js";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { agentWorkspaceIpcScopeDigest, type AgentWorkspaceToolIpc } from "./agent-workspace-ipc.js";
import { parseAgentWorkspaceToolScope, type AgentWorkspaceToolScope } from "./agent-workspace-authority.js";
import { validWorkspaceWorkerIdentity } from "./workspace-files.js";
import { buildWindowsAgentWorkspaceSandbox, buildWindowsLauncher, nativeControl, pinBinary, isolatedEnvironment } from "./native.js";
import { bytesAt, digest, directory, atomicJson, rawReference, RuntimeAdapterError } from "./files.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import type { CreditProcessIdentity } from "./gateway-credit.js";
import { parseWorkspaceCheckCatalog, type WorkspaceCheckCatalog } from "./workspace-checks.js";
import { ExecutionLifetime } from "./execution-lifetime.js";
import type { AgentRunBudget } from "./agent-run-budget.js";
import { claimAgentRuntimeOperation, agentRuntimeCancellationRequested } from "./agent-runtime-operation.js";

export interface SharedOptions {
  root: string; binary: string; scope: AgentWorkspaceToolScope;
  maxElapsedMs?: number; signal?: AbortSignal; runBudget?: Pick<AgentRunBudget, "remaining" | "assertScope" | "watch" | "nativeDeadlineUptimeMs">;
  connect: (supervisor: ChildProcess, originalSupervisor: CreditProcessIdentity, originalPeer: CreditProcessIdentity, nonce: string, signal: AbortSignal) => Promise<Pick<AgentWorkspaceToolIpc, "getEndpoint" | "snapshot" | "close">>;
  prepare?: (original: { phase: string; operation: string; supervisor: CreditProcessIdentity }, signal: AbortSignal) => void | Promise<void>;
}
export type RehearsalOptions = SharedOptions & ({ mode?: "files"; path: string; expectedDigest: string; replacement: string; checkCatalog?: WorkspaceCheckCatalog; checkId?: string } |
  { mode: "checks"; checkCatalog: WorkspaceCheckCatalog; checkId: string });
export type ProductionOptions = Omit<SharedOptions,"connect"> & {
 connect: (supervisor: ChildProcess, originalSupervisor: CreditProcessIdentity, originalPeer: CreditProcessIdentity, nonce: string, signal: AbortSignal, model: AgentRuntimeModelHost) => Promise<Pick<AgentWorkspaceToolIpc,"getEndpoint"|"snapshot"|"close">>;
 // Trusted installed application guard only; never serialized into a Native config.
 beforeNativeEffect?: () => void;
 mode: "host_gateway"; prompt: string; model: AgentRuntimeModelHost; checkCatalog: WorkspaceCheckCatalog;
 runBudget: NonNullable<SharedOptions["runBudget"]>;
};
// Executable SDK/Native composition, not default production activation. The
// required trusted model host checks full account/budget admission before Native
// start and each original model send. No fixture replies are selected here.
export function runOpenCodeWorkspaceRuntime(options: Omit<ProductionOptions,"mode">) {
 return runOpenCodeWorkspaceEngine({...options,mode:"host_gateway"});
}
const exact = (raw: unknown, keys: string[]): raw is Record<string, unknown> => !!raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).sort().join(",") === [...keys].sort().join(",");
function fail(reason: string): never { throw new RuntimeAdapterError(reason); }
// No credential, URL, arbitrary provider/plugin, command or model input. This
// entry point tests actual SDK custom tools against constructed model replies;
// it cannot produce production admission, Run observation or Skill evidence.
export async function runOpenCodeWorkspaceEngine(rawOptions: RehearsalOptions | ProductionOptions) {
  const options: RehearsalOptions | ProductionOptions = {...rawOptions, scope:parseAgentWorkspaceToolScope(rawOptions.scope), ...(rawOptions.checkCatalog === undefined ? {} : {checkCatalog:parseWorkspaceCheckCatalog(rawOptions.checkCatalog, rawOptions.scope)})};
  const scope = parseAgentWorkspaceToolScope(options.scope), requestedElapsed = options.maxElapsedMs, checksOnly = options.mode === "checks";
  const production = options.mode === "host_gateway";
  const model = production ? options.model : undefined;
  const beforeNativeEffect = production ? options.beforeNativeEffect : undefined;
  if(beforeNativeEffect !== undefined && typeof beforeNativeEffect !== "function") fail("agent_runtime_start_guard_unavailable");
  if (production && (!(model instanceof AgentRuntimeModelHost) || !options.runBudget || !options.checkCatalog || typeof options.prompt !== "string" || !options.prompt.isWellFormed() || !options.prompt.trim() || Buffer.byteLength(options.prompt) > 32768 || Buffer.byteLength(JSON.stringify({prompt:options.prompt})) > 48000 || options.prompt.split(/\r?\n/).length > 1000 || options.prompt.split(/\r?\n/).some(line => Buffer.byteLength(line) > 1800))) fail("agent_runtime_production_admission_unavailable");
  if (model && production && model.taskPacketDigest !== digest(options.prompt).value) fail("agent_model_task_packet_mismatch");
  if (options.mode !== undefined && !["files", "checks", "host_gateway"].includes(options.mode)) fail("workspace_rehearsal_input_invalid");

  if (options.mode !== "checks" && options.mode !== "host_gateway" && (typeof options.path !== "string" || !options.path || options.path.length > 240 || !/^[a-f0-9]{64}$/.test(options.expectedDigest) ||
    typeof options.replacement !== "string" || !options.replacement.isWellFormed() || Buffer.byteLength(options.replacement) > 16384)) fail("workspace_rehearsal_input_invalid");
  // Detach original arguments before the asynchronous compilation/launch.
  const checkCatalog = options.checkCatalog === undefined ? undefined : parseWorkspaceCheckCatalog(options.checkCatalog, scope);
  if (checksOnly && !checkCatalog || !production && ((checkCatalog === undefined) !== (options.checkId === undefined) || checkCatalog && !checkCatalog.recipes.some(recipe => recipe.check_id === options.checkId))) fail("workspace_rehearsal_input_invalid");
  const providerOptions = options.mode === "host_gateway" ? { admission_digest: options.model.admissionDigest } : options.mode === "checks" ? { check_id: options.checkId, check_only: true } :
    { path: options.path, expectedDigest: options.expectedDigest, replacement: options.replacement, ...(checkCatalog ? { check_id: options.checkId! } : {}) };
  const binaryPath = options.binary, rootPath = options.root, prepare = options.prepare, externalSignal = options.signal;
  const budget = options.runBudget;
  budget?.assertScope(scope);
  const policy=selectAgentRuntimeLifetime(production?"production":"rehearsal",requestedElapsed,budget?await budget.remaining(externalSignal):undefined);
  const elapsed=policy.elapsed_ms;
  const lifetime = new ExecutionLifetime(elapsed, externalSignal,production?"agent_task":"workspace_rehearsal");
  const stopBudgetWatch = budget?.watch((reason, error) => lifetime.stop(reason, error));
  let cancellationWatch: ReturnType<typeof setInterval> | undefined;
  try {
  lifetime.check(); beforeNativeEffect?.();
  if (model) await lifetime.wait(model.check(scope,lifetime.signal));
  beforeNativeEffect?.();
  const root = directory(rootPath), sandboxBinary = await buildWindowsAgentWorkspaceSandbox(root, lifetime.signal);
  lifetime.check();
  const identityBinary = await buildWindowsLauncher(root, lifetime.signal);
  lifetime.check();
  const pinned = pinBinary(root, binaryPath), binaryOriginal=readRuntimeBinaryOriginal(root,pinned.path,pinned.digest.value); lifetime.check();
  const originalModules = ["agent-workspace-ipc-client.mjs", "opencode-workspace-tools.js", production ? "opencode-host-gateway-provider.mjs" : "opencode-workspace-provider-fixture.mjs"].map(name => {
    const bytes = bytesAt(fileURLToPath(new URL(`../transport/${name}`, import.meta.url))); return { name, bytes, digest: digest(bytes) };
  });
  const owner = (await nativeControl(identityBinary, ["--identity", String(process.pid)], lifetime.signal)).value;
  lifetime.check(); if (!validWorkspaceWorkerIdentity(owner)) fail("workspace_rehearsal_owner_unproven");
  budget?.assertScope(scope);
  const claim = claimAgentRuntimeOperation(root, scope, { purpose: production ? "agent_runtime" : "workspace_rehearsal", mode: production ? "host_gateway" : checksOnly ? "checks" : "files", binary_digest: pinned.digest,binary_original:binaryOriginal,
    sandbox_digest: sandboxBinary.digest, sandbox_original:sandboxBinary.original, modules: originalModules.map(({ name, digest }) => ({ name, digest })), check_catalog_digest: checkCatalog?.catalog_digest ?? null,
    provider_options: providerOptions, ...(production ? { prompt: options.prompt } : {}), requested_elapsed_ms: policy.requested_ms, ...(production?{lifetime_policy:policy.policy}:{}), deadline_uptime_ms: budget?.nativeDeadlineUptimeMs ?? null }, owner);
  cancellationWatch = setInterval(() => { try { if (agentRuntimeCancellationRequested(root, scope)) lifetime.stop("workspace_rehearsal_cancel_requested"); }
    catch { lifetime.stop("workspace_rehearsal_claim_unproven"); } }, 100);
  lifetime.check();
  const operation = directory(claim.operation), sandbox = directory(join(operation, "sandbox")), config = directory(join(sandbox, "config"));
  directory(join(sandbox, "workspace")); directory(join(sandbox, "state")); const tools = directory(join(config, "tools"));
  const modules = originalModules.map(({ name, bytes, digest }) => {
    writeFileSync(join(config, name), bytes, { flag: "wx" }); return { name, digest };
  });
  if (production) {
    writeFileSync(join(config, "task-packet.txt"), options.prompt, {flag:"wx"}); modules.push({name:"task-packet.txt",digest:digest(options.prompt)});
  }
  if (checkCatalog) {
    const bytes = JSON.stringify(checkCatalog); writeFileSync(join(config, "check-catalog.json"), bytes, { flag: "wx" }); modules.push({ name: "check-catalog.json", digest: digest(bytes) });
  }
  const entry = 'import { createOpenCodeWorkspaceTools } from "../opencode-workspace-tools.js";\n' +
    (checkCatalog ? 'import { readFileSync } from "node:fs";\nconst catalog = JSON.parse(readFileSync(new URL("../check-catalog.json", import.meta.url), "utf8"));\n' : '') +
    'const tools = createOpenCodeWorkspaceTools({ pipe: process.env.CIMILOOP_AGENT_WORKSPACE_PIPE, scope_digest: process.env.CIMILOOP_AGENT_WORKSPACE_SCOPE }' + (checkCatalog ? ', catalog' : '') + ');\n' +
    (checksOnly ? '' : 'export const read = tools.read;\nexport const replace = tools.replace;\n') + (checkCatalog ? 'export const check = tools.check;\n' : '');
  writeFileSync(join(tools, "cimi.js"), entry, { flag: "wx" }); modules.push({ name: "tools/cimi.js", digest: digest(entry) });
  writeFileSync(join(config, "package.json"), '{"type":"module","private":true}\n', { flag: "wx" });
  writeFileSync(join(config, ".gitignore"), "node_modules\npackage.json\nbun.lock\nbun.lockb\n.gitignore\n", { flag: "wx" });
  const globalConfig = directory(join(config, "global", "opencode")); writeFileSync(join(globalConfig, ".gitignore"), "node_modules\npackage.json\npackage-lock.json\nbun.lock\n.gitignore\n", { flag: "wx" });
  writeFileSync(join(operation, "workspace-private-canary.txt"), "Synthetic private workspace canary\n", { flag: "wx" });
  const nonce = randomUUID(), pipeNonce = randomUUID(), scopeDigest = agentWorkspaceIpcScopeDigest(scope);
  const originalConfig = { format:"cimiloop/agent-workspace-sandbox-config/5.0.0", binary_original:binaryOriginal, nonce, root: sandbox, binary: pinned.path, owner,
    pipe_nonce: pipeNonce, scope_digest: scopeDigest, elapsed_ms: elapsed, provider_options: providerOptions, deadline_uptime_ms: budget?.nativeDeadlineUptimeMs ?? null, prompt:production?options.prompt:null, lifetime_policy:production?policy.policy:null };
  atomicJson(join(operation, "original-config.json"), originalConfig);
  if(!isDeepStrictEqual(readRuntimeBinaryOriginal(root,pinned.path,pinned.digest.value),binaryOriginal))fail("agent_runtime_binary_original_changed");
  if(!isDeepStrictEqual(readRuntimeBinaryOriginal(root,sandboxBinary.path,sandboxBinary.digest.value),sandboxBinary.original))fail("agent_runtime_controller_original_changed");
  const native = spawn(sandboxBinary.path, [], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: isolatedEnvironment() });
  let channel: Pick<AgentWorkspaceToolIpc, "getEndpoint" | "snapshot" | "close"> | undefined, buffer = Buffer.alloc(0), total = 0, outputFailure = false, suspended: Record<string, unknown> | undefined;
  const output: Buffer[] = [], errors: Buffer[] = [];
  const phases = ["registered", "profile_intent", "grants_intent", "granted", "mapped", "process_create_intent", "runtime_created"];
  let preparationCount = 0, originalSupervisor: CreditProcessIdentity | undefined;
  let resumed = false;
  let resolveReady!: (value: Record<string, unknown>) => void, rejectReady!: (error: unknown) => void;
  const ready = new Promise<Record<string, unknown>>((done, reject) => { resolveReady = done; rejectReady = reject; }); void ready.catch(() => {});
  const cancel = () => native.stdin.end();
  lifetime.signal.addEventListener("abort", cancel, { once: true });
  const capture = (bytes: Buffer, into: Buffer[]) => { total += bytes.length; if (total > 2 * 1024 * 1024) { outputFailure = true; cancel(); } else into.push(bytes); };
  native.stdout.on("data", (bytes: Buffer) => {
    capture(bytes, output); if (suspended || outputFailure) return; buffer = Buffer.concat([buffer, bytes]);
    if (buffer.length > 32768) { rejectReady(new RuntimeAdapterError("workspace_rehearsal_start_unproven")); cancel(); return; }
    const newline = buffer.indexOf(10); if (newline < 0) return;
    try {
      const value = parseGatewayJson(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, newline)).trim(), 32768);
      buffer = buffer.subarray(newline + 1);
      if (exact(value, ["format", "nonce", "phase", "supervisor"]) && value.format === "cimiloop/agent-workspace-preparation/1.0.0") {
        if (!exact(value, ["format", "nonce", "phase", "supervisor"]) || value.nonce !== nonce || value.phase !== phases[preparationCount] ||
          !validWorkspaceWorkerIdentity(value.supervisor) || !originalSupervisor || !isDeepStrictEqual({ ...value.supervisor }, { ...originalSupervisor }) || buffer.length) fail("workspace_rehearsal_preparation_unproven");
        const phase = phases[preparationCount++]!;
        void lifetime.wait(Promise.resolve().then(() => { lifetime.check(); return Promise.resolve(model?.check(scope,lifetime.signal)).then(() => prepare?.({ phase, operation, supervisor: { ...originalSupervisor! } }, lifetime.signal)); })).then(() => {
          lifetime.check(); beforeNativeEffect?.();
          if (native.exitCode !== null || native.signalCode !== null || native.stdin.writableEnded) return;
          native.stdin.write(JSON.stringify({ format: "cimiloop/agent-workspace-prepare-continue/1.0.0", nonce, phase }) + "\n");
        }).catch(error => { lifetime.stop(error instanceof RuntimeAdapterError ? error.reason : "workspace_rehearsal_preparation_failed", error); rejectReady(error); cancel(); });
        return;
      }
      if (!exact(value, ["format", "phase", "nonce", "supervisor", "peer", "appcontainer_sid", "network_capability_sids", "active_process_limit"]) ||
        value.format !== "cimiloop/agent-workspace-sandbox/1.0.0" || value.phase !== "suspended" || value.nonce !== nonce ||
        preparationCount !== phases.length || !validWorkspaceWorkerIdentity(value.supervisor) || value.supervisor.pid !== native.pid ||
        !originalSupervisor || !isDeepStrictEqual({ ...value.supervisor }, { ...originalSupervisor }) || !validWorkspaceWorkerIdentity(value.peer) ||
        value.peer.image.toLowerCase() !== pinned.path.toLowerCase() || typeof value.appcontainer_sid !== "string" || !/^S-1-15-2-(?:[0-9]+-)*[0-9]+$/.test(value.appcontainer_sid) ||
        !Array.isArray(value.network_capability_sids) || value.network_capability_sids.length || value.active_process_limit !== 1) fail("workspace_rehearsal_start_unproven");
      suspended = value as Record<string, unknown>; buffer = Buffer.alloc(0); resolveReady(suspended);
    } catch (error) { rejectReady(error); cancel(); }
  });
  native.stderr.on("data", (bytes: Buffer) => capture(bytes, errors));
  native.stdin.on("error", () => { rejectReady(new RuntimeAdapterError("workspace_rehearsal_input_closed")); });
  const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(done => {
    native.once("error", () => { rejectReady(new RuntimeAdapterError("workspace_rehearsal_start_failed")); });
    native.once("close", (code, signal) => {
      rejectReady(new RuntimeAdapterError("workspace_rehearsal_ended_before_resume"));
      // A failed original controller cannot finish its pending SDK callbacks.
      // Abort the same lifetime before channel closure waits on those callbacks;
      // retain the first cancellation cause and the original claim/raw bytes.
      if (!resumed) lifetime.stop("workspace_rehearsal_ended_before_resume");
      else if (code !== 0 || signal !== null) {
        let reason="workspace_rehearsal_runtime_failed";
        // The original Native deadline may stop the Job while JS timers are
        // stalled. Retain its pinned deadline classification; no domain result
        // or resource proof follows merely from selecting this stop reason.
        if(budget)try{
          const proof=parseGatewayJson(bytesAt(join(operation,"agent-sandbox-cleanup.json"),32768).toString("utf8"),32768) as Record<string,unknown>;
          if(proof.format==="cimiloop/agent-workspace-sandbox/1.0.0"&&proof.phase==="ended"&&proof.nonce===nonce&&proof.reason==="agent_sandbox_task_deadline"&&
            Number.isSafeInteger(proof.runtime_stopped_uptime_ms)&&Number(proof.runtime_stopped_uptime_ms)>=budget.nativeDeadlineUptimeMs)reason="agent_run_budget_exhausted";
        }catch{/* Missing/corrupt original deadline proof keeps generic failure. */}
        lifetime.stop(reason);
      }
      done({ code, signal });
    });
  });
  try {
    const identity = (await nativeControl(identityBinary, ["--identity", String(native.pid)], lifetime.signal)).value;
    lifetime.check();
    if (!validWorkspaceWorkerIdentity(identity) || identity.pid !== native.pid || identity.image.toLowerCase() !== sandboxBinary.path.toLowerCase()) fail("workspace_rehearsal_supervisor_unproven");
    originalSupervisor = { ...identity };
    // The native controller cannot mutate resources until this original held-OS
    // identity and binary digest are durable and its config is sent below.
    atomicJson(join(operation, "original-launcher.json"), { format: "cimiloop/agent-workspace-launcher/2.0.0", nonce,
      owner, supervisor: originalSupervisor, launcher_path: sandboxBinary.path, launcher_digest: sandboxBinary.digest.value,launcher_original:sandboxBinary.original });
    if(!isDeepStrictEqual(readRuntimeBinaryOriginal(root,pinned.path,pinned.digest.value),binaryOriginal))fail("agent_runtime_binary_original_changed");
    if(!isDeepStrictEqual(readRuntimeBinaryOriginal(root,sandboxBinary.path,sandboxBinary.digest.value),sandboxBinary.original))fail("agent_runtime_controller_original_changed");
    beforeNativeEffect?.();
    native.stdin.write(JSON.stringify(originalConfig) + "\n");
    const original = await lifetime.wait(ready);
    if (!isDeepStrictEqual(parseGatewayJson(bytesAt(join(operation, "agent-sandbox-original.json")).toString("utf8"), 32768), original)) fail("workspace_rehearsal_original_unproven");
    const connected = await lifetime.wait<NonNullable<typeof channel>>(Promise.resolve().then(() => { lifetime.check(); return options.mode === "host_gateway" ? options.connect(native, { ...original.supervisor as CreditProcessIdentity }, { ...original.peer as CreditProcessIdentity }, pipeNonce, lifetime.signal, options.model) : options.connect(native, { ...original.supervisor as CreditProcessIdentity }, { ...original.peer as CreditProcessIdentity }, pipeNonce, lifetime.signal); }), late => late.close());
    channel = connected;
    lifetime.check();
    const endpoint = channel.getEndpoint();
    if (production && endpoint.model_admission_digest !== model?.admissionDigest) fail("agent_model_admission_mismatch");
    if (endpoint.pipe !== `\\\\.\\pipe\\CimiLoop.AgentWorkspace.${pipeNonce}` || endpoint.scope_digest !== scopeDigest || endpoint.check_catalog_digest !== (checkCatalog?.catalog_digest ?? null) || endpoint.appcontainer_sid !== original.appcontainer_sid ||
      !isDeepStrictEqual(endpoint.peer, { ...original.peer as CreditProcessIdentity }) || !isDeepStrictEqual(endpoint.supervisor, { ...original.supervisor as CreditProcessIdentity })) fail("workspace_rehearsal_channel_unproven");
    if (model) await lifetime.wait(model.check(scope,lifetime.signal));
    beforeNativeEffect?.();
    resumed = true; native.stdin.write(JSON.stringify({ format: "cimiloop/agent-workspace-resume/1.0.0", nonce }) + "\n");
    const exit = await lifetime.wait(ended); await channel.close(); lifetime.check();
    const stdout = Buffer.concat(output), stderr = Buffer.concat(errors);
    writeFileSync(join(operation, "stdout.raw"), stdout, { flag: "wx" }); writeFileSync(join(operation, "stderr.raw"), stderr, { flag: "wx" });
    const events = stdout.toString("utf8").split(/\r?\n/).filter(line => line.trim().startsWith("{")).map(line => parseGatewayJson(line, 2 * 1024 * 1024) as Record<string, unknown>);
    const disposal = parseGatewayJson(bytesAt(join(operation, "agent-sandbox-cleanup.json")).toString("utf8"), 32768) as Record<string, unknown>;
    const unchanged = modules.every(module => digest(bytesAt(join(config, module.name))).value === module.digest.value) && digest(bytesAt(pinned.path, 512 * 1024 * 1024)).value === pinned.digest.value;
    const result = { format: production ? "cimiloop/opencode-workspace-runtime/1.0.0" : "cimiloop/opencode-workspace-rehearsal/1.0.0", operation, mode: production ? "host_gateway" : checksOnly ? "checks" : "files", original_scope_digest: scopeDigest, check_catalog_digest: checkCatalog?.catalog_digest ?? null, sandbox: original, modules,
      binary_digest: pinned.digest, stdout_ref: rawReference(root, stdout, "workspace_sdk_original"), stderr_ref: rawReference(root, stderr, "workspace_sdk_stderr"),
      native_exit: exit, disposal, channel: channel.snapshot(), events, source_bytes_unchanged: unchanged, output_limit_exceeded: outputFailure,
      synthetic_model_responses: production ? null : true, actual_credentials_read: production ? null : 0, external_model_requests: production ? null : 0, model_admission_digest: model?.admissionDigest ?? null, formal_agent_execution_enabled: false };
    atomicJson(join(operation, "result.json"), result);
    if (exit.code !== 0 || exit.signal || outputFailure || !unchanged || !disposal || disposal.format !== "cimiloop/agent-workspace-sandbox/1.0.0" ||
      disposal.phase !== "ended" || disposal.nonce !== nonce || disposal.reason !== "exited" || disposal.exit_code !== 0 || disposal.resources_disposed !== true ||
      !Array.isArray(disposal.cleanup_errors) || disposal.cleanup_errors.length) fail("workspace_rehearsal_completion_unproven");
    return result;
  } catch (error) {
    lifetime.stop(error instanceof RuntimeAdapterError ? error.reason : "workspace_rehearsal_execution_failed", error); throw error;
  } finally {
    cancel(); const stop = setTimeout(() => { if (native.exitCode === null && native.signalCode === null) native.kill(); }, 5000);
    await Promise.allSettled([channel?.close(), ended]); clearTimeout(stop); lifetime.signal.removeEventListener("abort", cancel);
    // Startup/channel failure must retain the original bounded bytes too. These
    // diagnostics are not completion or resource-disposal proof; missing native
    // records remain unproven and the owner must retain the original directory.
    if (!existsSync(join(operation, "stdout.raw"))) writeFileSync(join(operation, "stdout.raw"), Buffer.concat(output), { flag: "wx" });
    if (!existsSync(join(operation, "stderr.raw"))) writeFileSync(join(operation, "stderr.raw"), Buffer.concat(errors), { flag: "wx" });
    if (!existsSync(join(operation, "result.json"))) atomicJson(join(operation, "incomplete.json"), {
      format: "cimiloop/opencode-workspace-incomplete/1.0.0", nonce, original_scope_digest: scopeDigest,
      native_exit: { code: native.exitCode, signal: native.signalCode }, suspended_observed: !!suspended,
      original_record_present: existsSync(join(operation, "agent-sandbox-original.json")),
      cleanup_record_present: existsSync(join(operation, "agent-sandbox-cleanup.json")),
      total_output_bytes: total, captured_output_bytes: Buffer.concat(output).length + Buffer.concat(errors).length,
      output_limit_exceeded: outputFailure, completion_proven: false, resource_disposal_proven: false,
      interruption_reason: lifetime.interruptionReason,
      ...(lifetime.interruptionFailure ? {control_failure: lifetime.interruptionFailure} : {}),
      actual_credentials_read: production ? null : 0, external_model_requests: production ? null : 0, formal_agent_execution_enabled: false
    });
  }
  } catch (error) { if (lifetime.interruptionReason && lifetime.interruptionReason !== "workspace_rehearsal_ended_before_resume") lifetime.check(); throw error; }
  finally { if (cancellationWatch) clearInterval(cancellationWatch); stopBudgetWatch?.(); lifetime.dispose(); }
}
