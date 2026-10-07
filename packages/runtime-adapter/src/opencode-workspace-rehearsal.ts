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

interface Options {
  root: string; binary: string; scope: AgentWorkspaceToolScope;
  path: string; expectedDigest: string; replacement: string; maxElapsedMs?: number;
  connect: (supervisor: ChildProcess, originalSupervisor: CreditProcessIdentity, originalPeer: CreditProcessIdentity, nonce: string) => Promise<Pick<AgentWorkspaceToolIpc, "getEndpoint" | "snapshot" | "close">>;
}
const exact = (raw: unknown, keys: string[]): raw is Record<string, unknown> => !!raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).sort().join(",") === [...keys].sort().join(",");
const fail = (reason: string): never => { throw new RuntimeAdapterError(reason); };
// No credential, URL, arbitrary provider/plugin, command or model input. This
// entry point tests actual SDK custom tools against constructed model replies;
// it cannot produce production admission, Run observation or Skill evidence.
export async function runOpenCodeWorkspaceToolRehearsal(options: Options) {
  const scope = parseAgentWorkspaceToolScope(options.scope), elapsed = options.maxElapsedMs ?? 45000;
  if (!Number.isSafeInteger(elapsed) || elapsed < 1000 || elapsed > 180000 || typeof options.path !== "string" || !options.path || options.path.length > 240 ||
    !/^[a-f0-9]{64}$/.test(options.expectedDigest) || typeof options.replacement !== "string" || !options.replacement.isWellFormed() || Buffer.byteLength(options.replacement) > 16384) fail("workspace_rehearsal_input_invalid");
  // Detach original arguments before the asynchronous compilation/launch.
  const providerOptions = { path: options.path, expectedDigest: options.expectedDigest, replacement: options.replacement };
  const binaryPath = options.binary, connect = options.connect;
  const root = directory(options.root), sandboxBinary = await buildWindowsAgentWorkspaceSandbox(root), identityBinary = await buildWindowsLauncher(root), pinned = pinBinary(root, binaryPath);
  const operation = directory(join(root, "workspace-tool-rehearsals", randomUUID())), sandbox = directory(join(operation, "sandbox")), config = directory(join(sandbox, "config"));
  directory(join(sandbox, "workspace")); directory(join(sandbox, "state")); const tools = directory(join(config, "tools"));
  const modules = ["agent-workspace-ipc-client.mjs", "opencode-workspace-tools.js", "opencode-workspace-provider-fixture.mjs"].map(name => {
    const bytes = bytesAt(fileURLToPath(new URL(`../transport/${name}`, import.meta.url))); writeFileSync(join(config, name), bytes, { flag: "wx" }); return { name, digest: digest(bytes) };
  });
  const entry = 'import { createOpenCodeWorkspaceTools } from "../opencode-workspace-tools.js";\nconst tools = createOpenCodeWorkspaceTools({ pipe: process.env.CIMILOOP_AGENT_WORKSPACE_PIPE, scope_digest: process.env.CIMILOOP_AGENT_WORKSPACE_SCOPE });\nexport const read = tools.read;\nexport const replace = tools.replace;\n';
  writeFileSync(join(tools, "cimi.js"), entry, { flag: "wx" }); modules.push({ name: "tools/cimi.js", digest: digest(entry) });
  writeFileSync(join(config, "package.json"), '{"type":"module","private":true}\n', { flag: "wx" });
  writeFileSync(join(config, ".gitignore"), "node_modules\npackage.json\nbun.lock\nbun.lockb\n.gitignore\n", { flag: "wx" });
  const globalConfig = directory(join(config, "global", "opencode")); writeFileSync(join(globalConfig, ".gitignore"), "node_modules\npackage.json\npackage-lock.json\nbun.lock\n.gitignore\n", { flag: "wx" });
  writeFileSync(join(operation, "workspace-private-canary.txt"), "Synthetic private workspace canary\n", { flag: "wx" });
  const owner = (await nativeControl(identityBinary, ["--identity", String(process.pid)])).value;
  if (!validWorkspaceWorkerIdentity(owner)) fail("workspace_rehearsal_owner_unproven");
  const nonce = randomUUID(), pipeNonce = randomUUID(), scopeDigest = agentWorkspaceIpcScopeDigest(scope);
  const originalConfig = { format: "cimiloop/agent-workspace-sandbox-config/1.0.0", nonce, root: sandbox, binary: pinned.path, owner,
    pipe_nonce: pipeNonce, scope_digest: scopeDigest, elapsed_ms: elapsed, provider_options: providerOptions };
  atomicJson(join(operation, "original-config.json"), originalConfig);
  const native = spawn(sandboxBinary.path, [], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: isolatedEnvironment() });
  let channel: Pick<AgentWorkspaceToolIpc, "getEndpoint" | "snapshot" | "close"> | undefined, buffer = Buffer.alloc(0), total = 0, outputFailure = false, suspended: Record<string, unknown> | undefined;
  const output: Buffer[] = [], errors: Buffer[] = [];
  let resolveReady!: (value: Record<string, unknown>) => void, rejectReady!: (error: unknown) => void;
  const ready = new Promise<Record<string, unknown>>((done, reject) => { resolveReady = done; rejectReady = reject; }); void ready.catch(() => {});
  const cancel = () => native.stdin.end();
  const capture = (bytes: Buffer, into: Buffer[]) => { total += bytes.length; if (total > 2 * 1024 * 1024) { outputFailure = true; cancel(); } else into.push(bytes); };
  native.stdout.on("data", (bytes: Buffer) => {
    capture(bytes, output); if (suspended || outputFailure) return; buffer = Buffer.concat([buffer, bytes]);
    if (buffer.length > 32768) { rejectReady(new RuntimeAdapterError("workspace_rehearsal_start_unproven")); cancel(); return; }
    const newline = buffer.indexOf(10); if (newline < 0) return;
    try {
      const value = parseGatewayJson(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, newline)).trim(), 32768);
      if (!exact(value, ["format", "phase", "nonce", "supervisor", "peer", "appcontainer_sid", "network_capability_sids", "active_process_limit"]) ||
        value.format !== "cimiloop/agent-workspace-sandbox/1.0.0" || value.phase !== "suspended" || value.nonce !== nonce ||
        !validWorkspaceWorkerIdentity(value.supervisor) || value.supervisor.pid !== native.pid || !validWorkspaceWorkerIdentity(value.peer) ||
        value.peer.image.toLowerCase() !== pinned.path.toLowerCase() || typeof value.appcontainer_sid !== "string" || !/^S-1-15-2-(?:[0-9]+-)*[0-9]+$/.test(value.appcontainer_sid) ||
        !Array.isArray(value.network_capability_sids) || value.network_capability_sids.length || value.active_process_limit !== 1) fail("workspace_rehearsal_start_unproven");
      suspended = value as Record<string, unknown>; buffer = Buffer.alloc(0); resolveReady(suspended);
    } catch (error) { rejectReady(error); cancel(); }
  });
  native.stderr.on("data", (bytes: Buffer) => capture(bytes, errors));
  native.stdin.on("error", () => { rejectReady(new RuntimeAdapterError("workspace_rehearsal_input_closed")); });
  const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(done => {
    native.once("error", () => { rejectReady(new RuntimeAdapterError("workspace_rehearsal_start_failed")); });
    native.once("close", (code, signal) => { rejectReady(new RuntimeAdapterError("workspace_rehearsal_ended_before_resume")); done({ code, signal }); });
  });
  const timer = setTimeout(() => { rejectReady(new RuntimeAdapterError("workspace_rehearsal_deadline")); cancel(); }, elapsed + 15000);
  native.stdin.write(JSON.stringify(originalConfig) + "\n");
  try {
    const original = await ready;
    if (!isDeepStrictEqual(parseGatewayJson(bytesAt(join(operation, "agent-sandbox-original.json")).toString("utf8"), 32768), original)) fail("workspace_rehearsal_original_unproven");
    channel = await connect(native, { ...original.supervisor as CreditProcessIdentity }, { ...original.peer as CreditProcessIdentity }, pipeNonce);
    const endpoint = channel.getEndpoint();
    if (endpoint.pipe !== `\\\\.\\pipe\\CimiLoop.AgentWorkspace.${pipeNonce}` || endpoint.scope_digest !== scopeDigest || endpoint.appcontainer_sid !== original.appcontainer_sid ||
      !isDeepStrictEqual(endpoint.peer, { ...original.peer as CreditProcessIdentity }) || !isDeepStrictEqual(endpoint.supervisor, { ...original.supervisor as CreditProcessIdentity })) fail("workspace_rehearsal_channel_unproven");
    native.stdin.write(JSON.stringify({ format: "cimiloop/agent-workspace-resume/1.0.0", nonce }) + "\n");
    const exit = await ended; await channel.close();
    const stdout = Buffer.concat(output), stderr = Buffer.concat(errors);
    writeFileSync(join(operation, "stdout.raw"), stdout, { flag: "wx" }); writeFileSync(join(operation, "stderr.raw"), stderr, { flag: "wx" });
    const events = stdout.toString("utf8").split(/\r?\n/).filter(line => line.trim().startsWith("{")).map(line => parseGatewayJson(line, 2 * 1024 * 1024) as Record<string, unknown>);
    const disposal = parseGatewayJson(bytesAt(join(operation, "agent-sandbox-cleanup.json")).toString("utf8"), 32768) as Record<string, unknown>;
    const unchanged = modules.every(module => digest(bytesAt(join(config, module.name))).value === module.digest.value) && digest(bytesAt(pinned.path, 512 * 1024 * 1024)).value === pinned.digest.value;
    const result = { format: "cimiloop/opencode-workspace-rehearsal/1.0.0", operation, original_scope_digest: scopeDigest, sandbox: original, modules,
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
    await Promise.allSettled([channel?.close(), ended]); clearTimeout(stop); clearTimeout(timer);
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
      actual_credentials_read: 0, external_model_requests: 0, formal_agent_execution_enabled: false
    });
  }
}
