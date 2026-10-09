import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { existsSync, copyFileSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { bytesAt, digest, directory, atomicJson, readJson, RuntimeAdapterError } from "./files.js";

export interface NativeControlFailure {
  format: "cimiloop/native-control-failure/1.0.0";
  kind: "deadline" | "exit" | "terminated" | "aborted" | "spawn" | "invalid_output";
  operation: "clock_anchor" | "clock_continuous" | "identity" | "inspect_identity" | "recover" | "other";
  exit_code: number | null; signal: string | null; duration_ms: number;
  stdout_bytes: number | null; stderr_bytes: number | null;
}
export class NativeControlError extends RuntimeAdapterError {
  constructor(readonly controlFailure: NativeControlFailure) { super("native_control_unavailable"); }
}
const execute = promisify(execFile);
export const isolatedEnvironment = (systemRoot = process.env.SystemRoot ?? "C:\\Windows"): NodeJS.ProcessEnv => ({
  SystemRoot: systemRoot, WINDIR: systemRoot, PATH: join(systemRoot, "System32"),
  USERPROFILE: process.env.USERPROFILE, LOCALAPPDATA: process.env.LOCALAPPDATA, APPDATA: process.env.APPDATA,
  TEMP: process.env.TEMP, TMP: process.env.TMP,
  OPENCODE_DISABLE_AUTOUPDATE: "true", OPENCODE_DISABLE_CLAUDE_CODE: "true", OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
  OPENCODE_DISABLE_PROJECT_CONFIG: "true", OPENCODE_DISABLE_EXTERNAL_SKILLS: "true", OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: "true",
  BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0", DO_NOT_TRACK: "1"
});
export const nativeControl = async (launcher: string, args: string[], signal?: AbortSignal): Promise<{ value: unknown; bytes: Buffer }> => {
  const started = performance.now(), maximumMs = 15_000, controller = new AbortController();
  let stopped: "deadline" | "aborted" | undefined, successful: {stdout: Buffer; stderr: Buffer} | undefined;
  const stop = (reason: "deadline" | "aborted") => { if (!stopped) { stopped = reason; controller.abort(); } };
  const externalStop = () => stop("aborted"), timer = setTimeout(() => stop("deadline"), maximumMs);
  signal?.addEventListener("abort", externalStop, {once:true}); if (signal?.aborted) externalStop();
  const failureFor = (error: unknown): NativeControlError => {
    const failure = error as { code?: unknown; signal?: unknown; killed?: unknown; name?: unknown; stdout?: unknown; stderr?: unknown } | null;
    const code = successful ? 0 : typeof failure?.code === "number" && Number.isSafeInteger(failure.code) ? failure.code : null;
    const endedSignal = typeof failure?.signal === "string" && /^SIG[A-Z0-9]{1,12}$/.test(failure.signal) ? failure.signal : null;
    // No raw Error/cause: Node embeds argv, environment and helper output there.
    return new NativeControlError({format:"cimiloop/native-control-failure/1.0.0",
      kind:stopped ?? (failure?.name === "AbortError" ? "aborted" : failure?.killed === true ? "terminated" : successful || failure?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ? "invalid_output" : code !== null ? "exit" : typeof failure?.code === "string" ? "spawn" : "invalid_output"),
      operation: args[0] === "--anchor" ? "clock_anchor" : args[0] === "--continuous" ? "clock_continuous" : args[0] === "--identity" ? "identity" : args[0] === "--inspect-identity" ? "inspect_identity" : args[0] === "--recover" ? "recover" : "other",
      exit_code:code,signal:endedSignal,duration_ms:Math.max(0,Math.ceil(performance.now()-started)),
      stdout_bytes: Buffer.isBuffer(successful?.stdout) ? successful.stdout.length : Buffer.isBuffer(failure?.stdout) ? failure.stdout.length : null,
      stderr_bytes: Buffer.isBuffer(successful?.stderr) ? successful.stderr.length : Buffer.isBuffer(failure?.stderr) ? failure.stderr.length : null});
  };
  const expire = () => { if (performance.now()-started >= maximumMs) stop("deadline"); };
  try {
    // execFile's built-in timeout can report success after Windows termination
    // returns code 0. Own the first stop signal and inspect it before any JSON.
    if (stopped) throw failureFor(null);
    const result = await execute(launcher, [...args], { windowsHide:true, maxBuffer:64*1024, env:isolatedEnvironment(), encoding:"buffer", signal:controller.signal });
    successful = result; expire(); if (stopped) throw failureFor(null);
    return {value:JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(result.stdout)),bytes:result.stdout};
  } catch (error) {
    expire();
    const failure = error as {killed?:unknown;signal?:unknown;code?:unknown;stdout?:unknown} | null;
    // Preserve legacy nonzero structured Native denials. Truncated output after
    // cancellation, timeout, signal or output-limit termination is never proof.
    if (!stopped && failure?.killed !== true && !failure?.signal && failure?.code !== "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" && Buffer.isBuffer(failure?.stdout)) {
      try { return {value:JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(failure.stdout)),bytes:failure.stdout}; } catch { /* fail closed */ }
    }
    throw error instanceof NativeControlError ? error : failureFor(error);
  } finally { clearTimeout(timer); signal?.removeEventListener("abort",externalStop); }
};
export const buildWindowsLauncher = async (root: string, signal?: AbortSignal): Promise<string> => {
  signal?.throwIfAborted();
  if (process.platform !== "win32" || process.arch !== "x64") throw new RuntimeAdapterError("windows_x64_appcontainer_required");
  const source = fileURLToPath(new URL("../native/AppContainer.cs", import.meta.url));
  const transport = fileURLToPath(new URL("../native/IpcTransport.cs", import.meta.url));
  const gateway = fileURLToPath(new URL("../native/GatewayTransport.cs", import.meta.url));
  const conversation = fileURLToPath(new URL("../native/ConversationTransport.cs", import.meta.url));
  const build = directory(join(root, "tools", digest(Buffer.concat([bytesAt(source), bytesAt(transport), bytesAt(gateway), bytesAt(conversation)])).value));
  const output = join(build, "AppContainer.exe"), metadata = join(build, "build.json");
  if (!existsSync(output) || !existsSync(metadata)) {
    const compiler = resolve(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
    if (!existsSync(compiler)) throw new RuntimeAdapterError("native_compiler_unavailable");
    const candidate = join(build, `${randomUUID()}.exe`);
    try { await execute(compiler, ["/nologo", "/target:exe", "/reference:System.Web.Extensions.dll", `/out:${candidate}`, source, transport, gateway, conversation], { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024, env: isolatedEnvironment(), signal }); }
    catch { throw new RuntimeAdapterError("native_launcher_build_failed"); }
    renameSync(candidate, output); atomicJson(metadata, { digest: digest(bytesAt(output)) });
  }
  const expected = readJson(metadata) as { digest?: { value?: string } };
  if (expected.digest?.value !== digest(bytesAt(output)).value) throw new RuntimeAdapterError("native_launcher_digest_changed");
  return output;
};
export const pinBinary = (root: string, binary: string): { path: string; digest: ReturnType<typeof digest> } => {
  // Never grant an AppContainer ACE to the installed global executable.
  const binaryDigest = digest(bytesAt(binary, 512 * 1024 * 1024));
  const target = join(directory(join(root, "tools", binaryDigest.value)), "runtime.exe");
  if (!existsSync(target)) {
    const temp = `${target}.${randomUUID()}.tmp`; copyFileSync(binary, temp); renameSync(temp, target);
  }
  if (digest(bytesAt(target, 512 * 1024 * 1024)).value !== binaryDigest.value) throw new RuntimeAdapterError("runtime_binary_digest_changed");
  return { path: target, digest: binaryDigest };
};
// Separate broker binary: it does not change the pinned AppContainer controller
// or grant the Runtime access to a host filesystem effect executable.
export const buildWindowsWorkspaceBroker = async (root: string): Promise<{ path: string; digest: ReturnType<typeof digest> }> => {
  if (process.platform !== "win32" || process.arch !== "x64") throw new RuntimeAdapterError("windows_x64_workspace_broker_required");
  const source = fileURLToPath(new URL("../native/WorkspaceFiles.cs", import.meta.url));
  const build = directory(join(root, "tools", "workspace-" + digest(bytesAt(source)).value));
  const output = join(build, "WorkspaceFiles.exe"), metadata = join(build, "build.json");
  if (!existsSync(output) || !existsSync(metadata)) {
    const compiler = resolve(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"), candidate = join(build, `${randomUUID()}.exe`);
    if (!existsSync(compiler)) throw new RuntimeAdapterError("native_compiler_unavailable");
    try { await execute(compiler, ["/nologo", "/target:exe", "/reference:System.Web.Extensions.dll", `/out:${candidate}`, source], { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024, env: isolatedEnvironment() }); }
    catch { throw new RuntimeAdapterError("workspace_broker_build_failed"); }
    renameSync(candidate, output); atomicJson(metadata, { digest: digest(bytesAt(output)) });
  }
  const expected = readJson(metadata) as { digest?: { value?: string } }, actual = digest(bytesAt(output));
  if (actual.value !== expected.digest?.value) throw new RuntimeAdapterError("workspace_broker_digest_changed"); return { path: output, digest: actual };
};

// Independent original-Agent file IPC; the frozen public probe controller and
// its installation ACLs do not gain a path to workspace effects.
export const buildWindowsAgentWorkspaceTransport = async (root: string, signal?: AbortSignal): Promise<{ path: string; digest: ReturnType<typeof digest> }> => {
  signal?.throwIfAborted();
  if (process.platform !== "win32" || process.arch !== "x64") throw new RuntimeAdapterError("windows_x64_agent_ipc_required");
  const source = fileURLToPath(new URL("../native/AgentWorkspaceTransport.cs", import.meta.url));
  const build = directory(join(root, "tools", "agent-workspace-ipc-" + digest(bytesAt(source)).value)), output = join(build, "AgentWorkspaceTransport.exe"), metadata = join(build, "build.json");
  if (!existsSync(output) || !existsSync(metadata)) {
    const compiler = resolve(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"), candidate = join(build, `${randomUUID()}.exe`);
    if (!existsSync(compiler)) throw new RuntimeAdapterError("native_compiler_unavailable");
    try { await execute(compiler, ["/nologo", "/target:exe", "/reference:System.Web.Extensions.dll", `/out:${candidate}`, source], { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024, env: isolatedEnvironment(), signal }); }
    catch { throw new RuntimeAdapterError("agent_ipc_build_failed"); }
    renameSync(candidate, output); atomicJson(metadata, { digest: digest(bytesAt(output)) });
  }
  const expected = readJson(metadata) as { digest?: { value?: string } };
  if (expected.digest?.value !== digest(bytesAt(output)).value) throw new RuntimeAdapterError("agent_ipc_binary_changed");
  return { path: output, digest: digest(bytesAt(output)) };
};

// Distinct suspended-start rehearsal entry point; public Main and persisted
// recovery formats remain separate from this private composition.
export const buildWindowsAgentWorkspaceSandbox = async (root: string, signal?: AbortSignal): Promise<{ path: string; digest: ReturnType<typeof digest> }> => {
  signal?.throwIfAborted();
  if (process.platform !== "win32" || process.arch !== "x64") throw new RuntimeAdapterError("windows_x64_agent_sandbox_required");
  const sources = ["AppContainer.cs", "IpcTransport.cs", "GatewayTransport.cs", "ConversationTransport.cs", "AgentWorkspaceSandbox.cs"].map(name => fileURLToPath(new URL(`../native/${name}`, import.meta.url)));
  const build = directory(join(root, "tools", "agent-workspace-sandbox-" + digest(Buffer.concat(sources.map(path => bytesAt(path)))).value));
  const output = join(build, "AgentWorkspaceSandbox.exe"), metadata = join(build, "build.json");
  if (!existsSync(output) || !existsSync(metadata)) {
    const compiler = resolve(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"), candidate = join(build, `${randomUUID()}.exe`);
    if (!existsSync(compiler)) throw new RuntimeAdapterError("native_compiler_unavailable");
    try { await execute(compiler, ["/nologo", "/target:exe", "/main:AgentWorkspaceSandbox", "/reference:System.Web.Extensions.dll", `/out:${candidate}`, ...sources], { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024, env: isolatedEnvironment(), signal }); }
    catch { throw new RuntimeAdapterError("agent_sandbox_build_failed"); }
    renameSync(candidate, output); atomicJson(metadata, { digest: digest(bytesAt(output)) });
  }
  const expected = readJson(metadata) as { digest?: { value?: string } }, actual = digest(bytesAt(output));
  if (expected.digest?.value !== actual.value) throw new RuntimeAdapterError("agent_sandbox_binary_changed"); return { path: output, digest: actual };
};
