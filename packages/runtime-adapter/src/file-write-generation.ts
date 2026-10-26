import { execFileSync } from "node:child_process";
import { existsSync, renameSync, mkdirSync, writeFileSync,lstatSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { assertOrdinaryPath, bytesAt, digest } from "./files.js";
import {privateNativeEnvironment} from './native-process-environment.js';
import {executeWindowsCompilerSync} from './windows-compiler.js';

// NTFS records a write generation on the file. A later proof can read that
// generation again. The same generation means the sealed bytes were not
// written. A changed, missing, or unreadable generation is not a proof: the
// caller hashes. This process does not keep the generation across calls.
const floorBytes = 1024 * 1024;
type Helper={path:string;digest:string;environment:NodeJS.ProcessEnv;cwd:string;verify():void};
const compiled=new Map<string,Helper>(),compileFailed=new Set<string>();
const identity=(path:string)=>{const s=lstatSync(assertOrdinaryPath(path),{bigint:true});if(!s.isFile()||s.nlink!==1n||s.size<1n)throw Error();return{dev:String(s.dev),ino:String(s.ino),birth:String(s.birthtimeNs),bytes:Number(s.size)};};

const helperEnvironment = (scope:ReturnType<typeof privateNativeEnvironment>): NodeJS.ProcessEnv => {
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  return {
    SystemRoot: systemRoot, WINDIR: systemRoot, PATH: join(systemRoot, "System32"),
    ...scope.environment
  };
};

function helper(root:string): Helper | undefined {
  if (compileFailed.has(root) || process.platform !== "win32") return undefined;
  try {
    const cached=compiled.get(root);if(cached){cached.verify();return cached;}
    const source = fileURLToPath(new URL("../native/FileWriteGeneration.cs", import.meta.url)),frozen=bytesAt(source),sourceDigest=digest(frozen).value;
    const tools=assertOrdinaryPath(join(root,'tools'));try{mkdirSync(tools);}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='EEXIST'))throw error;}if(!lstatSync(tools).isDirectory())throw Error();
    const build=join(tools,'file-write-generation-v2-'+sourceDigest);
    let created=false;try{mkdirSync(assertOrdinaryPath(build));created=true;}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='EEXIST'))throw error;}
    const binary = join(build, "FileWriteGeneration.exe"), metadata = join(build, "build.json");
    const scope=privateNativeEnvironment(join(build,'host-environment'),created?{}:{readOnly:true});
    if (created) {
      const compiler = resolve(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
      if (!existsSync(compiler)) throw Error();
      const candidate = join(build, randomUUID() + ".exe"),copied=join(build,'FileWriteGeneration.cs'),compilerDigest=digest(bytesAt(compiler)).value;
      writeFileSync(copied,frozen,{flag:'wx'});
      executeWindowsCompilerSync(compiler, ["/nologo", "/target:exe", "/out:" + candidate, copied], { windowsHide: true, timeout: 30000, maxBuffer: 1048576 },root);
      if(digest(bytesAt(compiler)).value!==compilerDigest||!bytesAt(copied).equals(frozen)||!bytesAt(source).equals(frozen))throw Error();
      renameSync(candidate, binary);
      writeFileSync(metadata,JSON.stringify({format:'cimiloop/file-write-generation-build/2.0.0',digest:digest(bytesAt(binary)).value,binary_identity:identity(binary),source_digest:sourceDigest,environment:scope.basis}),{flag:'wx'});
    }
    const original=bytesAt(metadata),expected=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(original)) as {digest?:unknown};
    const binaryIdentity=identity(binary);
    if(typeof expected.digest!=='string'||!/^[a-f0-9]{64}$/.test(expected.digest)||JSON.stringify(expected)!==JSON.stringify({format:'cimiloop/file-write-generation-build/2.0.0',digest:expected.digest,binary_identity:binaryIdentity,source_digest:sourceDigest,environment:scope.basis}))throw Error();
    const verify=()=>{scope.verify();if(!bytesAt(metadata).equals(original)||JSON.stringify(identity(binary))!==JSON.stringify(binaryIdentity)||['.config','.manifest','.local'].some(suffix=>existsSync(binary+suffix))||digest(bytesAt(binary)).value!==expected.digest)throw Error();};
    verify();const value:Helper={path:binary,digest:expected.digest,environment:helperEnvironment(scope),cwd:scope.basis.root,verify};compiled.set(root,value);return value;
  } catch { compileFailed.add(root); return undefined; }
}

// One synchronous query for the large originals in a proof. Undefined means
// every caller must hash. A generation is never reused as an ALLOW decision.
export function readFileWriteGenerations(paths: readonly string[],ownedRoot?:string): Map<string, string> | undefined {
  if(!ownedRoot)return undefined;
  const wanted = [...new Set(paths.map(path => resolve(path)))].filter(path => path.length > 0);
  if (wanted.length === 0 || wanted.length > 128) return undefined;
  let current:Helper|undefined;try{const root=assertOrdinaryPath(ownedRoot);if(!lstatSync(root).isDirectory())return undefined;current=helper(root);}catch{return undefined;}
  if (!current) return undefined;
  try {
    current.verify();
    const output = execFileSync(current.path, ["query"], {
      input: wanted.join("\n"), encoding: "utf8", windowsHide: true, timeout: 5000,
      maxBuffer: 65536, env: current.environment,cwd:current.cwd, stdio: ["pipe", "pipe", "pipe"]
    });
    current.verify();
    const lines = output.split(/\n/).map(line => line.endsWith("\r") ? line.slice(0, -1) : line).filter((_line, index, all) => index < all.length - 1 || _line.length > 0);
    if (lines.length !== wanted.length) return undefined;
    const generations = new Map<string, string>();
    for (let index = 0; index < wanted.length; index++) {
      const match = /^(\d+)\t(\d+|none)$/.exec(lines[index] ?? "");
      if (!match || Number(match[1]) !== index) return undefined;
      if (match[2] !== "none") generations.set(wanted[index]!, match[2]!);
    }
    return generations;
  } catch { return undefined; }
}

export const retainedBinaryWriteGenerationFloor = floorBytes;
