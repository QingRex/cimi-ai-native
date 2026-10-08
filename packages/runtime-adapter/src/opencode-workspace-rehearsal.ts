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

interface SharedOptions {
  root: string; binary: string; scope: AgentWorkspaceToolScope;
  maxElapsedMs?: number; signal?: AbortSignal; runBudget?: Pick<AgentRunBudget, "remaining" | "assertScope" | "watch" | "nativeDeadlineUptimeMs">;
  connect: (supervisor: ChildProcess, originalSupervisor: CreditProcessIdentity, originalPeer: CreditProcessIdentity, nonce: string, signal: AbortSignal) => Promise<Pick<AgentWorkspaceToolIpc, "getEndpoint" | "snapshot" | "close">>;
  prepare?: (original: { phase: string; operation: string; supervisor: CreditProcessIdentity }, signal: AbortSignal) => void | Promise<void>;
}
type Options = SharedOptions & ({ mode?: "files"; path: string; expectedDigest: string; replacement: string; checkCatalog?: WorkspaceCheckCatalog; checkId?: string } |
  { mode: "checks"; checkCatalog: WorkspaceCheckCatalog; checkId: string });
const exact = (raw: unknown, keys: string[]): raw is Record<string, unknown> => !!raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).sort().join(",") === [...keys].sort().join(",");
function fail(reason: string): never { throw new RuntimeAdapterError(reason); }
// No credential, URL, arbitrary provider/plugin, command or model input. This
// entry point tests actual SDK custom tools against constructed model replies;
// it cannot produce production admission, Run observation or Skill evidence.
export async function runOpenCodeWorkspaceToolRehearsal(options: Options) {
  const scope = parseAgentWorkspaceToolScope(options.scope), requestedElapsed = options.maxElapsedMs ?? 45000, checksOnly = options.mode === "checks";
  let elapsed = requestedElapsed;
  if (!Number.isSafeInteger(elapsed) || elapsed < 1000 || elapsed > 180000 || options.mode !== undefined && !["files", "checks"].includes(options.mode)) fail("workspace_rehearsal_input_invalid");
  if (options.mode !== "checks" && (typeof options.path !== "string" || !options.path || options.path.length > 240 || !/^[a-f0-9]{64}$/.test(options.expectedDigest) ||
    typeof options.replacement !== "string" || !options.replacement.isWellFormed() || Buffer.byteLength(options.replacement) > 16384)) fail("workspace_rehearsal_input_invalid");
  // Detach original arguments before the asynchronous compilation/launch.
  const checkCatalog = options.checkCatalog === undefined ? undefined : parseWorkspaceCheckCatalog(options.checkCatalog, scope);
  if (checksOnly && !checkCatalog || (checkCatalog === undefined) !== (options.checkId === undefined) || checkCatalog && !checkCatalog.recipes.some(recipe => recipe.check_id === options.checkId)) fail("workspace_rehearsal_input_invalid");
  const providerOptions = options.mode === "checks" ? { check_id: options.checkId, check_only: true } :
    { path: options.path, expectedDigest: options.expectedDigest, replacement: options.replacement, ...(checkCatalog ? { check_id: options.checkId! } : {}) };
  const binaryPath = options.binary, rootPath = options.root, connect = options.connect, prepare = options.prepare, externalSignal = options.signal;
  const budget = options.runBudget;
  if (budget) { budget.assertScope(scope); elapsed = Math.min(elapsed, await budget.remaining(externalSignal)); }
  if (elapsed < 1000) fail("agent_run_budget_exhausted");
  const lifetime = new ExecutionLifetime(elapsed, externalSignal);
  const stopBudgetWatch = budget?.watch(reason => lifetime.stop(reason));
  let cancellationWatch: ReturnType<typeof setInterval> | undefined;
  try {
  lifetime.check();
  const root = directory(rootPath), sandboxBinary = await buildWindowsAgentWorkspaceSandbox(root, lifetime.signal);
  lifetime.check();
  const identityBinary = await buildWindowsLauncher(root, lifetime.signal);
  lifetime.check();
  const pinned = pinBinary(root, binaryPath); lifetime.check();
  const originalModules = ["agent-workspace-ipc-client.mjs", "opencode-workspace-tools.js", "opencode-workspace-provider-fixture.mjs"].map(name => {
    const bytes = bytesAt(fileURLToPath(new URL(`../transport/${name}`, import.meta.url))); return { name, bytes, digest: digest(bytes) };
  });
  const owner = (await nativeControl(identityBinary, ["--identity", String(process.pid)], lifetime.signal)).value;
  lifetime.check(); if (!validWorkspaceWorkerIdentity(owner)) fail("workspace_rehearsal_owner_unproven");
  budget?.assertScope(scope);
  const claim = claimAgentRuntimeOperation(root, scope, { purpose: "workspace_rehearsal", mode: checksOnly ? "checks" : "files", binary_digest: pinned.digest,
    sandbox_digest: sandboxBinary.digest, modules: originalModules.map(({ name, digest }) => ({ name, digest })), check_catalog_digest: checkCatalog?.catalog_digest ?? null,
    provider_options: providerOptions, requested_elapsed_ms: requestedElapsed, deadline_uptime_ms: budget?.nativeDeadlineUptimeMs ?? null }, owner);
  cancellationWatch = setInterval(() => { try { if (agentRuntimeCancellationRequested(root, scope)) lifetime.stop("workspace_rehearsal_cancel_requested"); }
    catch { lifetime.stop("workspace_rehearsal_claim_unproven"); } }, 100);
  lifetime.check();
  const operation = directory(claim.operation), sandbox = directory(join(operation, "sandbox")), config = directory(join(sandbox, "config"));
  directory(join(sandbox, "workspace")); directory(join(sandbox, "state")); const tools = directory(join(config, "tools"));
  const modules = originalModules.map(({ name, bytes, digest }) => {
    writeFileSync(join(config, name), bytes, { flag: "wx" }); return { name, digest };
  });
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
  const originalConfig = { format: "cimiloop/agent-workspace-sandbox-config/2.0.0", nonce, root: sandbox, binary: pinned.path, owner,
    pipe_nonce: pipeNonce, scope_digest: scopeDigest, elapsed_ms: elapsed, provider_options: providerOptions, deadline_uptime_ms: budget?.nativeDeadlineUptimeMs ?? null };
  atomicJson(join(operation, "original-config.json"), originalConfig);
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
        void lifetime.wait(Promise.resolve().then(() => { lifetime.check(); return prepare?.({ phase, operation, supervisor: { ...originalSupervisor! } }, lifetime.signal); })).then(() => {
          lifetime.check();
          if (native.exitCode !== null || native.signalCode !== null || native.stdin.writableEnded) return;
          native.stdin.write(JSON.stringify({ format: "cimiloop/agent-workspace-prepare-continue/1.0.0", nonce, phase }) + "\n");
        }).catch(error => { rejectReady(error); cancel(); });
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
    native.once("close", (code, signal) => { rejectReady(new RuntimeAdapterError("workspace_rehearsal_ended_before_resume")); done({ code, signal }); if (!resumed) lifetime.stop("workspace_rehearsal_ended_before_resume"); });
  });
  try {
    const identity = (await nativeControl(identityBinary, ["--identity", String(native.pid)], lifetime.signal)).value;
    lifetime.check();
    if (!validWorkspaceWorkerIdentity(identity) || identity.pid !== native.pid || identity.image.toLowerCase() !== sandboxBinary.path.toLowerCase()) fail("workspace_rehearsal_supervisor_unproven");
    originalSupervisor = { ...identity };
    // The native controller cannot mutate resources until this original held-OS
    // identity and binary digest are durable and its config is sent below.
    atomicJson(join(operation, "original-launcher.json"), { format: "cimiloop/agent-workspace-launcher/1.0.0", nonce,
      owner, supervisor: originalSupervisor, launcher_path: sandboxBinary.path, launcher_digest: sandboxBinary.digest.value });
    native.stdin.write(JSON.stringify(originalConfig) + "\n");
    const original = await lifetime.wait(ready);
    if (!isDeepStrictEqual(parseGatewayJson(bytesAt(join(operation, "agent-sandbox-original.json")).toString("utf8"), 32768), original)) fail("workspace_rehearsal_original_unproven");
    const connected = await lifetime.wait<NonNullable<typeof channel>>(Promise.resolve().then(() => { lifetime.check(); return connect(native, { ...original.supervisor as CreditProcessIdentity }, { ...original.peer as CreditProcessIdentity }, pipeNonce, lifetime.signal); }), late => late.close());
    channel = connected;
    lifetime.check();
    const endpoint = channel.getEndpoint();
    if (endpoint.pipe !== `\\\\.\\pipe\\CimiLoop.AgentWorkspace.${pipeNonce}` || endpoint.scope_digest !== scopeDigest || endpoint.check_catalog_digest !== (checkCatalog?.catalog_digest ?? null) || endpoint.appcontainer_sid !== original.appcontainer_sid ||
      !isDeepStrictEqual(endpoint.peer, { ...original.peer as CreditProcessIdentity }) || !isDeepStrictEqual(endpoint.supervisor, { ...original.supervisor as CreditProcessIdentity })) fail("workspace_rehearsal_channel_unproven");
    resumed = true; native.stdin.write(JSON.stringify({ format: "cimiloop/agent-workspace-resume/1.0.0", nonce }) + "\n");
    const exit = await lifetime.wait(ended); await channel.close(); lifetime.check();
    const stdout = Buffer.concat(output), stderr = Buffer.concat(errors);
    writeFileSync(join(operation, "stdout.raw"), stdout, { flag: "wx" }); writeFileSync(join(operation, "stderr.raw"), stderr, { flag: "wx" });
    const events = stdout.toString("utf8").split(/\r?\n/).filter(line => line.trim().startsWith("{")).map(line => parseGatewayJson(line, 2 * 1024 * 1024) as Record<string, unknown>);
    const disposal = parseGatewayJson(bytesAt(join(operation, "agent-sandbox-cleanup.json")).toString("utf8"), 32768) as Record<string, unknown>;
    const unchanged = modules.every(module => digest(bytesAt(join(config, module.name))).value === module.digest.value) && digest(bytesAt(pinned.path, 512 * 1024 * 1024)).value === pinned.digest.value;
    const result = { format: "cimiloop/opencode-workspace-rehearsal/1.0.0", operation, mode: checksOnly ? "checks" : "files", original_scope_digest: scopeDigest, check_catalog_digest: checkCatalog?.catalog_digest ?? null, sandbox: original, modules,
      binary_digest: pinned.digest, stdout_ref: rawReference(root, stdout, "workspace_sdk_original"), stderr_ref: rawReference(root, stderr, "workspace_sdk_stderr"),
      native_exit: exit, disposal, channel: channel.snapshot(), events, source_bytes_unchanged: unchanged, output_limit_exceeded: outputFailure,
      synthetic_model_responses: true, actual_credentials_read: 0, external_model_requests: 0, formal_agent_execution_enabled: false };
    atomicJson(join(operation, "result.json"), result);
    if (exit.code !== 0 || exit.signal || outputFailure || !unchanged || !disposal || disposal.format !== "cimiloop/agent-workspace-sandbox/1.0.0" ||
      disposal.phase !== "ended" || disposal.nonce !== nonce || disposal.reason !== "exited" || disposal.exit_code !== 0 || disposal.resources_disposed !== true ||
      !Array.isArray(disposal.cleanup_errors) || disposal.cleanup_errors.length) fail("workspace_rehearsal_completion_unproven");
    return result;
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
      actual_credentials_read: 0, external_model_requests: 0, formal_agent_execution_enabled: false
    });
  }
  } catch (error) { if (lifetime.interruptionReason && lifetime.interruptionReason !== "workspace_rehearsal_ended_before_resume") lifetime.check(); throw error; }
  finally { if (cancellationWatch) clearInterval(cancellationWatch); stopBudgetWatch?.(); lifetime.dispose(); }
}
