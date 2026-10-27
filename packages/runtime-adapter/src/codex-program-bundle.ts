import {existsSync,lstatSync} from 'node:fs';
import {basename,dirname,isAbsolute,join,resolve} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {assertOrdinaryPath,bytesAt,digest,RuntimeAdapterError} from './files.js';

type Command={file:string;sha256:string;args:string[]};
export interface CodexProgramMaterial {path:string;sha256:string;identity:{dev:string;ino:string;birth:string}}
export interface CodexProgramBundleSnapshot {format:'cimiloop/codex-program-bundle/1.0.0';programs:[CodexProgramMaterial,CodexProgramMaterial]}
export interface CodexProgramBundle {readonly kind:'codex_program_bundle/1.0.0'}
const capabilities=new WeakMap<object,{snapshot:CodexProgramBundleSnapshot;guard:()=>void}>();
function fail():never{throw new RuntimeAdapterError('codex_program_bundle_unproven');}
function material(path:string):CodexProgramMaterial{
 const before=lstatSync(assertOrdinaryPath(path),{bigint:true});if(!before.isFile()||before.nlink!==1n||before.ino<=0n||before.size<1n||before.size>512n*1024n**2n)fail();
 const sha256=digest(bytesAt(path,512*1024**2)).value,after=lstatSync(assertOrdinaryPath(path),{bigint:true});
 if(before.dev!==after.dev||before.ino!==after.ino||before.birthtimeNs!==after.birthtimeNs||before.size!==after.size||before.mtimeNs!==after.mtimeNs||['.local','.config','.manifest'].some(suffix=>existsSync(path+suffix)))fail();
 return{path,sha256,identity:{dev:String(before.dev),ino:String(before.ino),birth:String(before.birthtimeNs)}};
}
function syncGuard(guard:()=>void){const result:unknown=guard();if(result!==undefined){if(result instanceof Promise)void Promise.prototype.then.call(result,undefined,()=>{});fail();}}
// The trusted installation supplies its live original guard. Paths are derived
// from the pinned main program, never a model/JSON list of extra permissions.
export function captureCodexProgramBundle(command:Command,guard:()=>void):CodexProgramBundle{
 if(typeof guard!=='function'||basename(command.file).toLowerCase()!=='codex.exe'||command.args.length!==0)fail();
 syncGuard(guard);const snapshot:CodexProgramBundleSnapshot={format:'cimiloop/codex-program-bundle/1.0.0',programs:[material(resolve(command.file)),material(join(dirname(resolve(command.file)),'codex-code-mode-host.exe'))]};
 readCodexProgramBundle(snapshot,command);syncGuard(guard);
 const capability=Object.freeze({kind:'codex_program_bundle/1.0.0' as const});capabilities.set(capability,{snapshot,guard});return capability;
}
// Retained data is read-only: reconstructing this snapshot cannot mint a live
// launch capability. Both byte hashes and original physical identities remain.
export function readCodexProgramBundle(raw:unknown,command:Command):CodexProgramBundleSnapshot{
 const value=raw as CodexProgramBundleSnapshot;
 if(!value||Object.keys(value).sort().join(',')!=='format,programs'||value.format!=='cimiloop/codex-program-bundle/1.0.0'||!Array.isArray(value.programs)||value.programs.length!==2||command.args.length!==0)fail();
 const expected=[resolve(command.file),join(dirname(resolve(command.file)),'codex-code-mode-host.exe')];
 if(basename(expected[0]!).toLowerCase()!=='codex.exe'||value.programs.some((row,index)=>!row||typeof row.path!=='string'||!isAbsolute(row.path)||row.path!==expected[index]||!same(row,material(row.path)))||value.programs[0].sha256!==command.sha256)fail();
 return structuredClone(value);
}
export function assertCodexProgramBundle(capability:CodexProgramBundle|undefined,command:Command):CodexProgramBundleSnapshot{
 const held=capability&&capabilities.get(capability);if(!held)fail();syncGuard(held.guard);const result=readCodexProgramBundle(held.snapshot,command);syncGuard(held.guard);return result;
}
