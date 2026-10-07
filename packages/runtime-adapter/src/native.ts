import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { existsSync, copyFileSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { bytesAt, digest, directory, atomicJson, readJson, RuntimeAdapterError } from "./files.js";

const execute = promisify(execFile);
export const isolatedEnvironment = (systemRoot = process.env.SystemRoot ?? "C:\\Windows"): NodeJS.ProcessEnv => ({
  SystemRoot: systemRoot, WINDIR: systemRoot, PATH: join(systemRoot, "System32"),
  USERPROFILE: process.env.USERPROFILE, LOCALAPPDATA: process.env.LOCALAPPDATA, APPDATA: process.env.APPDATA,
  TEMP: process.env.TEMP, TMP: process.env.TMP,
  OPENCODE_DISABLE_AUTOUPDATE: "true", OPENCODE_DISABLE_CLAUDE_CODE: "true", OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
  OPENCODE_DISABLE_PROJECT_CONFIG: "true", OPENCODE_DISABLE_EXTERNAL_SKILLS: "true", OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: "true",
  BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0", DO_NOT_TRACK: "1"
});
export const nativeControl = async (launcher: string, args: string[]): Promise<{ value: unknown; bytes: Buffer }> => {
  try {
    const result = await execute(launcher, args, { windowsHide: true, timeout: 15_000, maxBuffer: 64 * 1024, env: isolatedEnvironment(), encoding: "buffer" });
    return { value: JSON.parse(result.stdout.toString("utf8")), bytes: result.stdout };
  } catch (error) {
    if (error && typeof error === "object" && "stdout" in error && Buffer.isBuffer(error.stdout)) {
      try { return { value: JSON.parse(error.stdout.toString("utf8")), bytes: error.stdout }; } catch { /* fail closed */ }
    }
    throw new RuntimeAdapterError("native_control_unavailable");
  }
};
export const buildWindowsLauncher = async (root: string): Promise<string> => {
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
    try { await execute(compiler, ["/nologo", "/target:exe", "/reference:System.Web.Extensions.dll", `/out:${candidate}`, source, transport, gateway, conversation], { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024, env: isolatedEnvironment() }); }
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
