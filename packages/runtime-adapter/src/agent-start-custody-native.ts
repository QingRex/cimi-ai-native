import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { existsSync, renameSync, lstatSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { assertOrdinaryPath, atomicJson, bytesAt, digest, directory, readJson, RuntimeAdapterError } from "./files.js";
import { isolatedEnvironment } from "./native.js";
import {executeWindowsCompiler} from './windows-compiler.js';
import {bindNativeProcessEnvironment,nativeHelperProcessOptions,verifyNativeProcessEnvironment} from './native-process-environment.js';

type Action = "identity" | "protect" | "verify";
type VerifyHit={dev:string;ino:string;birthtimeNs:string;result:string};
let custodyDepth=0;
const custodyResets=new Set<()=>void>(),custodyRechecks=new Set<()=>void>();
// One synchronous observation may ask Windows to re-verify the same protected
// directory many times. Repeats reuse that process result. The outermost
// observation runs the helper again and must see the same digest.
export function withStartCustodyVerifyTurn<T>(run:()=>T):T{
 const outer=custodyDepth===0;if(outer)for(const reset of custodyResets)reset();custodyDepth++;
 try{const value=run();if(outer)for(const recheck of custodyRechecks)recheck();return value;}
 finally{custodyDepth--;}
}
export async function openWindowsAgentStartCustody(toolsRoot: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (process.platform !== "win32" || process.arch !== "x64") throw new RuntimeAdapterError("windows_x64_start_custody_required");
  const source = fileURLToPath(new URL("../native/AgentStartCustody.cs", import.meta.url));
  const build = directory(join(toolsRoot, "tools", "agent-start-custody-" + digest(bytesAt(source)).value));
  const binary = join(build, "AgentStartCustody.exe"), metadata = join(build, "build.json");
  if (!existsSync(binary) || !existsSync(metadata)) {
    const compiler = resolve(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
    if (!existsSync(compiler)) throw new RuntimeAdapterError("native_compiler_unavailable");
    const candidate = join(build, randomUUID() + ".exe"), started = performance.now();
    const stop = signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000);
    try {
      await executeWindowsCompiler(compiler, ["/nologo", "/target:exe", "/out:" + candidate, source],
        { windowsHide: true, maxBuffer: 1048576, signal: stop },toolsRoot);
      if (stop.aborted || performance.now() - started >= 30000) throw Error();
    } catch { throw new RuntimeAdapterError("agent_start_custody_build_failed"); }
    renameSync(candidate, binary); atomicJson(metadata, { digest: digest(bytesAt(binary)) });
  }
  const expected = (readJson(metadata) as { digest?: { value?: string } }).digest?.value;
  if (!expected || digest(bytesAt(binary)).value !== expected) throw new RuntimeAdapterError("agent_start_custody_binary_changed");
  bindNativeProcessEnvironment(toolsRoot,binary);
  // Freeze helper identity; later metadata edits cannot change this live port.
  const seen=new Map<string,VerifyHit>();
  const execute=(action:Action,root:string)=>{
    if (digest(bytesAt(binary)).value !== expected) throw Error();
    const started = performance.now();
    const result = execFileSync(binary, [action, assertOrdinaryPath(root)], {
      windowsHide: true, timeout: 15000, maxBuffer: 16384, encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"], ...nativeHelperProcessOptions(binary,isolatedEnvironment(),true)
    });
    verifyNativeProcessEnvironment(binary,true);
    if (performance.now() - started >= 15000 || !/^[a-f0-9]{64}$/.test(result)) throw Error();
    return result;
  };
  custodyResets.add(()=>seen.clear());
  custodyRechecks.add(()=>{for(const [root,hit] of seen){try{const stat=lstatSync(root,{bigint:true});if(!stat.isDirectory()||String(stat.dev)!==hit.dev||String(stat.ino)!==hit.ino||String(stat.birthtimeNs)!==hit.birthtimeNs||execute("verify",root)!==hit.result)throw new RuntimeAdapterError("agent_start_directory_custody_unproven");}catch(error){if(error instanceof RuntimeAdapterError&&error.reason==="agent_start_directory_custody_unproven")throw error;throw new RuntimeAdapterError("agent_start_directory_custody_unproven");}}});
  return (action: Action, root: string): string => {
    try {
      if(action==="verify"&&custodyDepth>0){
        const stat=lstatSync(assertOrdinaryPath(root),{bigint:true});
        if(!stat.isDirectory())throw Error();
        const hit=seen.get(root);
        if(hit&&hit.dev===String(stat.dev)&&hit.ino===String(stat.ino)&&hit.birthtimeNs===String(stat.birthtimeNs))return hit.result;
        const result=execute(action,root);
        seen.set(root,{dev:String(stat.dev),ino:String(stat.ino),birthtimeNs:String(stat.birthtimeNs),result});
        return result;
      }
      return execute(action,root);
    } catch {
      if (action === "verify") { try { lstatSync(root); } catch (missing) {
        if (missing && typeof missing === "object" && "code" in missing && missing.code === "ENOENT") throw new RuntimeAdapterError("agent_start_original_missing");
      } }
      // Never forward raw errors, args, output or inherited environment.
      throw new RuntimeAdapterError("agent_start_directory_custody_unproven");
    }
  };
}
