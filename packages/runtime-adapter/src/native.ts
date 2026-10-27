import { retainRuntimeBinary } from "./runtime-binary-originals.js";
import { retainAgentSandboxBuild,readRetainedAgentSandboxBuild } from "./agent-sandbox-build-originals.js";
import { executeWindowsCompiler as executeCompiler } from "./windows-compiler.js";
import {bindNativeProcessEnvironment,restoreNativeProcessEnvironment,nativeHelperProcessOptions,verifyNativeProcessEnvironment} from './native-process-environment.js';
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { existsSync, renameSync, writeFileSync } from "node:fs";
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
// The installed .NET Framework CLR cannot load an executable past MAX_PATH,
// (including the .config suffix), even when CreateProcess accepts its extended spelling. Refuse that physical
// layout; never copy/alias the controller or replace an original operation.
const assertNativeExecutable = (path:string):void => {if(process.platform==='win32'&&resolve(path).length+7>=260)throw new RuntimeAdapterError('native_executable_path_unsupported');};
export function assertAgentRuntimeNativeRoot(root:string):void {
  const hash='a'.repeat(64);
  const legacy=join(root,'tools','agent-workspace-ipc-'+digest(bytesAt(fileURLToPath(new URL('../native/AgentWorkspaceTransport.cs',import.meta.url)))).value);
  const ipc=existsSync(legacy)?join(legacy,'AgentWorkspaceTransport.exe'):join(root,'tools','agent-workspace-ipc-v2-'+hash,'ipc.exe');
  for(const path of [join(root,'runtime-binary-originals',hash,'runtime.exe'),join(root,'tools',hash,'AppContainer.exe'),ipc])assertNativeExecutable(path);
}
export const isolatedEnvironment = (systemRoot = process.env.SystemRoot ?? "C:\\Windows"): NodeJS.ProcessEnv => ({
  SystemRoot: systemRoot, WINDIR: systemRoot, PATH: join(systemRoot, "System32"),
  USERPROFILE: process.env.USERPROFILE, LOCALAPPDATA: process.env.LOCALAPPDATA, APPDATA: process.env.APPDATA,
  TEMP: process.env.TEMP, TMP: process.env.TMP,
  OPENCODE_DISABLE_AUTOUPDATE: "true", OPENCODE_DISABLE_CLAUDE_CODE: "true", OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
  OPENCODE_DISABLE_PROJECT_CONFIG: "true", OPENCODE_DISABLE_EXTERNAL_SKILLS: "true", OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: "true",
  BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0", DO_NOT_TRACK: "1"
});
async function bindNativeBuild<T extends {path:string}>(root:string,build:Promise<T>,options:{readOnly?:true}={}){const result=await build;bindNativeProcessEnvironment(root,result.path,options);return result;}
export const nativeControl = async (launcher: string, args: string[], signal?: AbortSignal,ownerRoot?:string): Promise<{ value: unknown; bytes: Buffer }> => {
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
    if(ownerRoot)restoreNativeProcessEnvironment(ownerRoot,launcher);
    const result = await execute(launcher, [...args], { windowsHide:true, maxBuffer:64*1024, ...nativeHelperProcessOptions(launcher,isolatedEnvironment()), encoding:"buffer", signal:controller.signal });
    verifyNativeProcessEnvironment(launcher);
    successful = result; expire(); if (stopped) throw failureFor(null);
    return {value:JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(result.stdout)),bytes:result.stdout};
  } catch (error) {
    expire();
    try{verifyNativeProcessEnvironment(launcher);}catch{throw failureFor(null);}
    const failure = error as {killed?:unknown;signal?:unknown;code?:unknown;stdout?:unknown} | null;
    // Preserve legacy nonzero structured Native denials. Truncated output after
    // cancellation, timeout, signal or output-limit termination is never proof.
    if (!stopped && failure?.killed !== true && !failure?.signal && failure?.code !== "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" && Buffer.isBuffer(failure?.stdout)) {
      try { return {value:JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(failure.stdout)),bytes:failure.stdout}; } catch { /* fail closed */ }
    }
    throw error instanceof NativeControlError ? error : failureFor(error);
  } finally { clearTimeout(timer); signal?.removeEventListener("abort",externalStop); }
};
export const buildWindowsLauncher = async (root: string, signal?: AbortSignal,options:{readOnly?:true}={}): Promise<string> => {
  signal?.throwIfAborted();
  if (process.platform !== "win32" || process.arch !== "x64") throw new RuntimeAdapterError("windows_x64_appcontainer_required");
  const source = fileURLToPath(new URL("../native/AppContainer.cs", import.meta.url));
  const transport = fileURLToPath(new URL("../native/IpcTransport.cs", import.meta.url));
  const gateway = fileURLToPath(new URL("../native/GatewayTransport.cs", import.meta.url));
  const conversation = fileURLToPath(new URL("../native/ConversationTransport.cs", import.meta.url));
  assertNativeExecutable(join(root,'tools','a'.repeat(64),'AppContainer.exe'));
  const selected=join(root, "tools", digest(Buffer.concat([bytesAt(source), bytesAt(transport), bytesAt(gateway), bytesAt(conversation)])).value);
  if(options.readOnly&&(!existsSync(join(selected,'AppContainer.exe'))||!existsSync(join(selected,'build.json'))))throw new RuntimeAdapterError('native_launcher_original_unavailable');
  const build = options.readOnly?selected:directory(selected);
  const output = join(build, "AppContainer.exe"), metadata = join(build, "build.json");
  if (!existsSync(output) || !existsSync(metadata)) {
    const compiler = resolve(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
    if (!existsSync(compiler)) throw new RuntimeAdapterError("native_compiler_unavailable");
    const candidate = join(build, `${randomUUID()}.exe`);
    try { await executeCompiler(compiler, ["/nologo", "/target:exe", "/reference:System.Web.Extensions.dll", `/out:${candidate}`, source, transport, gateway, conversation], { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024, signal },root); }
    catch { throw new RuntimeAdapterError("native_launcher_build_failed"); }
    renameSync(candidate, output); atomicJson(metadata, { digest: digest(bytesAt(output)) });
  }
  const expected = readJson(metadata) as { digest?: { value?: string } };
  if (expected.digest?.value !== digest(bytesAt(output)).value) throw new RuntimeAdapterError("native_launcher_digest_changed");
  if(options.readOnly)restoreNativeProcessEnvironment(root,output);else bindNativeProcessEnvironment(root,output);return output;
};
export const pinBinary = retainRuntimeBinary;
// Separate broker binary: it does not change the pinned AppContainer controller
// or grant the Runtime access to a host filesystem effect executable.
export const buildWindowsWorkspaceBroker = async (root: string): Promise<{ path: string; digest: ReturnType<typeof digest> }> => {
  if (process.platform !== "win32" || process.arch !== "x64") throw new RuntimeAdapterError("windows_x64_workspace_broker_required");
  assertNativeExecutable(join(root,'tools','workspace-'+'a'.repeat(64),'WorkspaceFiles.exe'));
  const source = fileURLToPath(new URL("../native/WorkspaceFiles.cs", import.meta.url));
  const build = directory(join(root, "tools", "workspace-" + digest(bytesAt(source)).value));
  const output = join(build, "WorkspaceFiles.exe"), metadata = join(build, "build.json");
  if (!existsSync(output) || !existsSync(metadata)) {
    const compiler = resolve(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"), candidate = join(build, `${randomUUID()}.exe`);
    if (!existsSync(compiler)) throw new RuntimeAdapterError("native_compiler_unavailable");
    try { await executeCompiler(compiler, ["/nologo", "/target:exe", "/reference:System.Web.Extensions.dll", `/out:${candidate}`, source], { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 },root); }
    catch { throw new RuntimeAdapterError("workspace_broker_build_failed"); }
    renameSync(candidate, output); atomicJson(metadata, { digest: digest(bytesAt(output)) });
  }
  const expected = readJson(metadata) as { digest?: { value?: string } }, actual = digest(bytesAt(output));
  if (actual.value !== expected.digest?.value) throw new RuntimeAdapterError("workspace_broker_digest_changed");bindNativeProcessEnvironment(root,output);return { path: output, digest: actual };
};

// Independent original-Agent file IPC; the frozen public probe controller and
// its installation ACLs do not gain a path to workspace effects.
export const buildWindowsAgentWorkspaceTransport = async (root: string, signal?: AbortSignal): Promise<{ path: string; digest: ReturnType<typeof digest> }> => {
  signal?.throwIfAborted();
  if (process.platform !== "win32" || process.arch !== "x64") throw new RuntimeAdapterError("windows_x64_agent_ipc_required");
  const source = fileURLToPath(new URL("../native/AgentWorkspaceTransport.cs", import.meta.url));
  const sourceDigest=digest(bytesAt(source)),legacy=join(root,'tools','agent-workspace-ipc-'+sourceDigest.value),old=existsSync(legacy);
  const selected=old?legacy:join(root,'tools','agent-workspace-ipc-v2-'+sourceDigest.value),output=join(selected,old?'AgentWorkspaceTransport.exe':'ipc.exe'),metadata=join(selected,'build.json');
  assertNativeExecutable(output);
  // Explicit host-cache layout2 for new builds only. An old/partial cache is
  // never relocated, repaired or recompiled; its original ambiguity remains.
  if(existsSync(selected)&&(!existsSync(output)||!existsSync(metadata)))throw new RuntimeAdapterError('agent_ipc_build_original_unproven');
  const build=directory(selected);
  if (!existsSync(output) || !existsSync(metadata)) {
    const compiler = resolve(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"), candidate = join(build, `${randomUUID()}.exe`);
    if (!existsSync(compiler)) throw new RuntimeAdapterError("native_compiler_unavailable");
    try { await executeCompiler(compiler, ["/nologo", "/target:exe", "/reference:System.Web.Extensions.dll", `/out:${candidate}`, source], { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024, signal },root); }
    catch { throw new RuntimeAdapterError("agent_ipc_build_failed"); }
    renameSync(candidate, output); atomicJson(metadata, {format:'cimiloop/agent-ipc-build/2.0.0',source_digest:sourceDigest,digest: digest(bytesAt(output)) });
  }
  const expected = readJson(metadata) as { digest?: { value?: string } };
  if (expected.digest?.value !== digest(bytesAt(output)).value) throw new RuntimeAdapterError("agent_ipc_binary_changed");
  if(!old&&JSON.stringify(expected)!==JSON.stringify({format:'cimiloop/agent-ipc-build/2.0.0',source_digest:sourceDigest,digest:digest(bytesAt(output))}))throw new RuntimeAdapterError('agent_ipc_build_original_unproven');
  bindNativeProcessEnvironment(root,output);return { path: output, digest: digest(bytesAt(output)) };
};

// Distinct suspended-start rehearsal entry point; public Main and persisted
// recovery formats remain separate from this private composition.
export async function compileOriginalAgentSandbox(compiler:string,args:string[],signal?:AbortSignal,ownedRoot?:string):Promise<void>{
  const started=performance.now(),maximumMs=30000,controller=new AbortController();let stopped=false;
  const stop=()=>{stopped=true;controller.abort();},timer=setTimeout(stop,maximumMs);
  signal?.addEventListener("abort",stop,{once:true});if(signal?.aborted)stop();
  try{
    if(stopped)throw new RuntimeAdapterError("agent_sandbox_build_failed");
    await executeCompiler(compiler,args,{windowsHide:true,maxBuffer:1024*1024,signal:controller.signal},ownedRoot);
    // Windows can report code0 after termination. A candidate file and a
    // successful callback cannot override the first stop or elapsed deadline.
    if(stopped||signal?.aborted||performance.now()-started>=maximumMs)throw new RuntimeAdapterError("agent_sandbox_build_failed");
  }catch{throw new RuntimeAdapterError("agent_sandbox_build_failed");}
  finally{clearTimeout(timer);signal?.removeEventListener("abort",stop);}
}
export const buildWindowsAgentWorkspaceSandbox = async (root: string, signal?: AbortSignal) => {
  signal?.throwIfAborted();
  if (process.platform !== "win32" || process.arch !== "x64") throw new RuntimeAdapterError("windows_x64_agent_sandbox_required");
  assertAgentRuntimeNativeRoot(root);
  const sources = ["AppContainer.cs", "IpcTransport.cs", "GatewayTransport.cs", "ConversationTransport.cs", "AgentWorkspaceSandbox.cs", "AgentProfileStorage.cs"].map(name => fileURLToPath(new URL(`../native/${name}`, import.meta.url)));
  const frozen=sources.map(path=>bytesAt(path,1024*1024)),compiler=resolve(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  if(!existsSync(compiler))throw new RuntimeAdapterError("native_compiler_unavailable");
  const compilerDigest=digest(bytesAt(compiler)),options=["/nologo","/target:exe","/main:AgentWorkspaceSandbox","/reference:System.Web.Extensions.dll"];
  const recipe={format:"cimiloop/agent-sandbox-build-recipe/1.0.0",platform:"windows_x64",compiler:{path:compiler,digest:compilerDigest},options,sources:sources.map((path,i)=>({name:path.split(/[\\/]/).at(-1)!,digest:digest(frozen[i]!)}))};
  return bindNativeBuild(root,retainAgentSandboxBuild(root,recipe,async build=>{
    signal?.throwIfAborted();
    const legacy=join(root,"tools","agent-workspace-sandbox-"+digest(Buffer.concat(frozen)).value),output=join(legacy,"AgentWorkspaceSandbox.exe"),metadata=join(legacy,"build.json");
    // An available legacy build can be retained prospectively. Partial old
    // caches are evidence of an unresolved original, never a rebuild request.
    if(existsSync(legacy)){
      if(!existsSync(output)||!existsSync(metadata))throw new RuntimeAdapterError("agent_sandbox_legacy_build_unproven");
      const expected=readJson(metadata) as {digest?:unknown},actual=digest(bytesAt(output));
      if(JSON.stringify(expected)!==JSON.stringify({digest:actual}))throw new RuntimeAdapterError("agent_sandbox_binary_changed");return output;
    }
    const copied=recipe.sources.map((source,i)=>{const path=join(build,source.name);writeFileSync(path,frozen[i]!,{flag:"wx"});return path;}),candidate=join(build,"AgentWorkspaceSandbox.exe");
    if(digest(bytesAt(compiler)).value!==compilerDigest.value)throw new RuntimeAdapterError("native_compiler_changed");
    await compileOriginalAgentSandbox(compiler,[...options,`/out:${candidate}`,...copied],signal,root);
    if(digest(bytesAt(compiler)).value!==compilerDigest.value||copied.some((path,i)=>digest(bytesAt(path)).value!==recipe.sources[i]!.digest.value))throw new RuntimeAdapterError("agent_sandbox_build_recipe_changed");
    return candidate;
  }));
};

// Independent read-only Job query, retained by the same immutable recipe/store.
export async function buildWindowsAgentJobObserver(root:string,signal?:AbortSignal){
 signal?.throwIfAborted();if(process.platform!=='win32'||process.arch!=='x64')throw new RuntimeAdapterError('windows_x64_agent_sandbox_required');assertAgentRuntimeNativeRoot(root);
 const source=fileURLToPath(new URL('../native/AgentJobObserver.cs',import.meta.url)),frozen=bytesAt(source,1024*1024),compiler=resolve(process.env.SystemRoot??'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');if(!existsSync(compiler))throw new RuntimeAdapterError('native_compiler_unavailable');
 const compilerDigest=digest(bytesAt(compiler)),options=['/nologo','/target:exe','/main:AgentJobObserver','/reference:System.Web.Extensions.dll'];
 const recipe={format:'cimiloop/agent-job-observer-build-recipe/1.0.0',platform:'windows_x64',compiler:{path:compiler,digest:compilerDigest},options,sources:[{name:'AgentJobObserver.cs',digest:digest(frozen)}]};
 return bindNativeBuild(root,retainAgentSandboxBuild(root,recipe,async build=>{signal?.throwIfAborted();const copied=join(build,'AgentJobObserver.cs'),candidate=join(build,'observer.exe');writeFileSync(copied,frozen,{flag:'wx'});if(digest(bytesAt(compiler)).value!==compilerDigest.value)throw new RuntimeAdapterError('native_compiler_changed');await compileOriginalAgentSandbox(compiler,[...options,'/out:'+candidate,copied],signal,root);if(digest(bytesAt(compiler)).value!==compilerDigest.value||digest(bytesAt(copied)).value!==digest(frozen).value)throw new RuntimeAdapterError('agent_sandbox_build_recipe_changed');return candidate;}));
}

export async function buildWindowsFixedVolumeReader(root:string,readOptions:{readOnly?:true}={}){
 if(process.platform!=='win32'||process.arch!=='x64')throw new RuntimeAdapterError('windows_x64_fixed_volume_required');
 const source=fileURLToPath(new URL('../native/FixedVolumeQuota.cs',import.meta.url)),frozen=bytesAt(source,1048576),compiler=resolve(process.env.SystemRoot??'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe'),compilerDigest=digest(bytesAt(compiler)),options=['/nologo','/target:exe','/reference:System.Web.Extensions.dll'];
 const recipe={format:'cimiloop/fixed-volume-reader-build-recipe/1.0.0',platform:'windows_x64',compiler:{path:compiler,digest:compilerDigest},options,sources:[{name:'FixedVolumeQuota.cs',digest:digest(frozen)}]};
 if(readOptions.readOnly===true){const retained=readRetainedAgentSandboxBuild(root,recipe);restoreNativeProcessEnvironment(root,retained.path);return retained;}
 return bindNativeBuild(root,retainAgentSandboxBuild(root,recipe,async build=>{const copied=join(build,'FixedVolumeQuota.cs'),output=join(build,'quota.exe');writeFileSync(copied,frozen,{flag:'wx'});if(digest(bytesAt(compiler)).value!==compilerDigest.value)throw new RuntimeAdapterError('native_compiler_changed');await compileOriginalAgentSandbox(compiler,[...options,'/out:'+output,copied],undefined,root);if(digest(bytesAt(compiler)).value!==compilerDigest.value||digest(bytesAt(copied)).value!==digest(frozen).value)throw new RuntimeAdapterError('agent_sandbox_build_recipe_changed');return output;}));
}

export async function buildWindowsCodexProcessJob(root:string){
 if(process.platform!=='win32'||process.arch!=='x64')throw new RuntimeAdapterError('windows_x64_codex_process_job_required');
 assertNativeExecutable(join(root,'runtime-binary-originals','a'.repeat(64),'runtime.exe'));
 const sources=['CodexProcessJob.cs','CodexWriteScope.cs','AgentProfileStorage.cs','CodexProxy.cs','CodexProxyJob.cs'].map(name=>({name,bytes:bytesAt(fileURLToPath(new URL('../native/'+name,import.meta.url)),1048576)})),compiler=resolve(process.env.SystemRoot??'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe'),compilerDigest=digest(bytesAt(compiler)),options=['/nologo','/target:exe','/reference:System.Web.Extensions.dll'];
 const recipe={format:'cimiloop/codex-process-job-build-recipe/3.0.0',platform:'windows_x64',compiler:{path:compiler,digest:compilerDigest},options,sources:sources.map(({name,bytes})=>({name,digest:digest(bytes)}))};
 return bindNativeBuild(root,retainAgentSandboxBuild(root,recipe,async build=>{const copied=sources.map(source=>{const path=join(build,source.name);writeFileSync(path,source.bytes,{flag:'wx'});return path;}),output=join(build,'job.exe');if(digest(bytesAt(compiler)).value!==compilerDigest.value)throw new RuntimeAdapterError('native_compiler_changed');await compileOriginalAgentSandbox(compiler,[...options,'/out:'+output,...copied],undefined,root);if(digest(bytesAt(compiler)).value!==compilerDigest.value||copied.some((path,index)=>!bytesAt(path).equals(sources[index]!.bytes)))throw new RuntimeAdapterError('agent_sandbox_build_recipe_changed');return output;}));
}
