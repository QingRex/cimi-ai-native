import { execFileSync } from 'node:child_process';
import { existsSync,mkdirSync,lstatSync } from 'node:fs';
import { isDeepStrictEqual as same } from 'node:util';
import { resolve, parse } from 'node:path';
import { assertOrdinaryPath, digest, RuntimeAdapterError } from './files.js';
import { parseGatewayJson } from './gateway-conversation.js';
import { isolatedEnvironment, buildWindowsFixedVolumeReader } from './native.js';
import {nativeHelperProcessOptions,verifyNativeProcessEnvironment} from './native-process-environment.js';
import { readRuntimeBinaryOriginal } from './runtime-binary-originals.js';
import { AgentStartLedger, type AgentStartTicket } from './agent-start-ledger.js';

function fail():never{throw new RuntimeAdapterError('fixed_volume_original_unproven');}
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const bounded=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=9*1024**3;
function argumentsChecked(image:string,root:string,maximum:number){if(!/^[A-Za-z]:[\\/]/.test(image)||!/^([D-Z]):\\$/i.test(root)||!bounded(maximum)||maximum<64*1024**2||maximum>8*1024**3||maximum%(1024**2)!==0)fail();return{image:resolve(image),root:root.toUpperCase(),maximum};}
export interface FixedVolumeObservation {format:'cimiloop/fixed-volume-os-observation/1.0.0';image_path:string;volume_root:string;image_identity:{volume:string;index:string;created:string};virtual_disk_id:string;volume_id:string;volume_serial:string;virtual_bytes:number;volume_bytes:number;physical_bytes:number;provider_subtype:2;filesystem:'NTFS';physical_device:string;extent_bytes:number}
export function parseFixedVolumeObservation(raw:unknown,image:string,root:string,maximum:number):FixedVolumeObservation{
 const args=argumentsChecked(image,root,maximum),v=raw;
 if(!exact(v,['format','image_path','volume_root','image_identity','virtual_disk_id','volume_id','volume_serial','virtual_bytes','volume_bytes','physical_bytes','provider_subtype','filesystem','physical_device','extent_bytes'])||v.format!=='cimiloop/fixed-volume-os-observation/1.0.0'||v.image_path!==args.image||v.volume_root!==args.root||v.virtual_bytes!==maximum||v.provider_subtype!==2||v.filesystem!=='NTFS'||!exact(v.image_identity,['volume','index','created'])||Object.values(v.image_identity).some(n=>typeof n!=='string'||!/^\d{1,20}$/.test(n))||BigInt(String(v.image_identity.index))===0n||BigInt(String(v.image_identity.created))===0n||typeof v.virtual_disk_id!=='string'||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v.virtual_disk_id)||v.virtual_disk_id==='00000000-0000-0000-0000-000000000000'||typeof v.volume_id!=='string'||!/^\\\\\?\\Volume\{[a-f0-9-]{36}\}\\$/i.test(v.volume_id)||typeof v.volume_serial!=='string'||!/^\d{1,10}$/.test(v.volume_serial)||typeof v.physical_device!=='string'||!/^\\\\\.\\PhysicalDrive\d+$/.test(v.physical_device)||![v.volume_bytes,v.physical_bytes,v.extent_bytes].every(bounded)||Number(v.volume_bytes)>Number(v.extent_bytes)||Number(v.extent_bytes)>maximum||Number(v.physical_bytes)<maximum||Number(v.physical_bytes)>maximum+64*1024**2)fail();
 return structuredClone(v) as unknown as FixedVolumeObservation;
}
type Reader=(image:string,root:string,maximum:number)=>FixedVolumeObservation;
const readers=new WeakSet<Reader>();
const readerOriginals=new WeakMap<Reader,unknown>();
export async function openWindowsFixedVolumeReader(toolsRoot:string,options:{readOnly?:true}={}):Promise<Reader>{
 const retained=await buildWindowsFixedVolumeReader(toolsRoot,options),original=structuredClone(retained.original);
 const verify=()=>{verifyNativeProcessEnvironment(retained.path);if(['.config','.local','.manifest'].some(suffix=>existsSync(retained.path+suffix))||!same(readRuntimeBinaryOriginal(toolsRoot,retained.path,retained.digest.value),original))fail();};
 const reader:Reader=(image,root,maximum)=>{try{const args=argumentsChecked(image,root,maximum);verify();const output=execFileSync(retained.path,[args.image,args.root,String(maximum)],{windowsHide:true,timeout:15000,maxBuffer:16384,encoding:'utf8',...nativeHelperProcessOptions(retained.path,isolatedEnvironment()),stdio:['ignore','pipe','pipe']});verify();return parseFixedVolumeObservation(parseGatewayJson(output,16384),args.image,args.root,maximum);}catch{fail();}};
 readers.add(reader);readerOriginals.set(reader,{root:assertOrdinaryPath(toolsRoot),original});return Object.freeze(reader);
}
function readerDirectory(path:string){const stat=lstatSync(assertOrdinaryPath(path),{bigint:true});if(!stat.isDirectory()||stat.ino<=0n)fail();return{dev:String(stat.dev),ino:String(stat.ino),birth:String(stat.birthtimeNs)};}
// Original helper custody is registered BEFORE compiling. A partial install
// gets only its retained reader on retry, never a replacement helper root.
export async function openHostFixedVolumeReader(origin:AgentStartLedger,toolsRoot:string,id:string,rawBasis:unknown,options:{readOnly?:true}={}):Promise<Reader>{
 if(!(origin instanceof AgentStartLedger)||!/^[a-f0-9]{64}$/.test(id))fail();
 const root=assertOrdinaryPath(toolsRoot),basis=structuredClone(rawBasis),namespace='fixed_volume_reader';
 let row=origin.readExclusive(namespace,id),created=false;
 if(!row){
  if(options.readOnly||origin.readExclusive('fixed_volume_reader_ready',id)||existsSync(root))fail();mkdirSync(root);
  const claim=origin.claimExclusiveOnce(namespace,id,{format:'cimiloop/fixed-volume-reader-custody/1.0.0',root,identity:readerDirectory(root),basis});
  if(!claim.created)fail();created=true;row=origin.readExclusive(namespace,id);
 }
 const original=structuredClone(row);let ready:ReturnType<AgentStartLedger['readExclusive']>|undefined;
 const guard=()=>{if(!original||!same(origin.readExclusive(namespace,id),original)||!same(original.basis,{format:'cimiloop/fixed-volume-reader-custody/1.0.0',root,identity:readerDirectory(root),basis})||ready!==undefined&&!same(origin.readExclusive('fixed_volume_reader_ready',id),ready))fail();};
 guard();const retained=await openWindowsFixedVolumeReader(root,created?{}:{readOnly:true});guard();
 const completed={format:'cimiloop/fixed-volume-reader-ready/1.0.0',intent_ticket:original!.ticket,retained:readerOriginals.get(retained)};
 if(created)origin.issueExclusive('fixed_volume_reader_ready',id,completed);
 ready=origin.readExclusive('fixed_volume_reader_ready',id);if(!ready||!same(ready.basis,completed))fail();guard();
 const reader:Reader=(image,volume,maximum)=>{guard();const result=retained(image,volume,maximum);guard();return result;};
 readers.add(reader);return Object.freeze(reader);
}
const core=({physical_device:_,...value}:FixedVolumeObservation)=>value;
const policyKey=(root:string)=>digest(root.toUpperCase()).value;
const quotas=new WeakSet<FixedVolumeQuota>(),storageToken=Symbol('fixed volume runtime storage');
export interface FixedVolumeRuntimeScope {project_id:string;repository_path:string;data_directory:string}
function runtimeScope(raw:FixedVolumeRuntimeScope):FixedVolumeRuntimeScope{
 if(!exact(raw,['project_id','repository_path','data_directory'])||typeof raw.project_id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(raw.project_id)||[raw.repository_path,raw.data_directory].some(path=>typeof path!=='string'||!/^([D-Z]):[\\/]/i.test(path)))fail();
 return{project_id:raw.project_id,repository_path:assertOrdinaryPath(raw.repository_path as string),data_directory:assertOrdinaryPath(raw.data_directory as string)};
}
type StorageBasis={format:'cimiloop/fixed-volume-runtime/1.0.0';scope:FixedVolumeRuntimeScope;quota_ticket:AgentStartTicket};
const storageStates=new WeakMap<FixedVolumeRuntimeStorage,{quota:FixedVolumeQuota;origin:AgentStartLedger;ticket:AgentStartTicket;basis:StorageBasis}>();
function storageState(value:unknown){const state=value&&typeof value==='object'?storageStates.get(value as FixedVolumeRuntimeStorage):undefined;if(!state)fail();return state;}
function readStorage(state:ReturnType<typeof storageState>){
 const before=state.origin.readTicket(state.ticket);
 if(!same(before,{format:'cimiloop/host-exclusive-ticket/1.0.0',namespace:'fixed_volume_runtime',id:digest(state.basis.scope.project_id).value,basis:state.basis}))fail();
 const proof=assertOriginalQuotaPath.call(state.quota,state.basis.scope.repository_path);assertOriginalQuotaPath.call(state.quota,state.basis.scope.data_directory);
 if(!same(proof.policy_ticket,state.basis.quota_ticket)||!same(state.origin.readTicket(state.ticket),before))fail();
 return{...proof,scope:structuredClone(state.basis.scope),runtime_ticket:structuredClone(state.ticket)};
}
export function assertFixedVolumeRuntimeStorage(value:unknown,expected:FixedVolumeRuntimeScope){
 const state=storageState(value);if(!same(runtimeScope(expected),state.basis.scope))fail();return readStorage(state);
}
export function assertFixedVolumeRuntimePath(value:unknown,expected:FixedVolumeRuntimeScope,path:string){
 const state=storageState(value),proof=assertFixedVolumeRuntimeStorage(value,expected),extra=assertOriginalQuotaPath.call(state.quota,path);
 if(!same(proof.policy_ticket,extra.policy_ticket))fail();return assertFixedVolumeRuntimeStorage(value,expected);
}
// One bounded original-volume cut for the complete writable set. Recheck the
// same quota and every ordinary path after the last OS observation; never cache
// this result across effects or accept a caller-supplied volume proof.
export function assertFixedVolumeRuntimePaths(value:unknown,expected:FixedVolumeRuntimeScope,rawPaths:readonly string[]){
 if(!Array.isArray(rawPaths)||!rawPaths.length||rawPaths.length>32||rawPaths.some(path=>typeof path!=='string'))fail();
 const paths=[...rawPaths],before=assertFixedVolumeRuntimeStorage(value,expected),canonical=paths.map(path=>assertOrdinaryPath(path));
 if(canonical.some(path=>parse(path).root.toUpperCase()!==before.observation.volume_root))fail();
 const after=assertFixedVolumeRuntimeStorage(value,expected);
 if(!same(before,after)||!same(canonical,paths.map(path=>assertOrdinaryPath(path))))fail();return after;
}
// A capability created from the real quota and its independent original Host
// ticket. A copied JSON proof or JavaScript constructor is never sufficient.
export class FixedVolumeRuntimeStorage {
 private constructor(token:symbol,quota:FixedVolumeQuota,origin:AgentStartLedger,ticket:AgentStartTicket,basis:StorageBasis){
  if(token!==storageToken||!quotas.has(quota))fail();storageStates.set(this,{quota,origin,ticket:structuredClone(ticket),basis:structuredClone(basis)});Object.freeze(this);
 }
 read(){return readStorage(storageState(this));}
 assertRuntime(projectId:string,repositoryPath:string,dataDirectory:string){
  return assertFixedVolumeRuntimeStorage(this,{project_id:projectId,repository_path:repositoryPath,data_directory:dataDirectory});
 }
}
// Volume evidence does not prove placement of every Runtime writable path.
export class FixedVolumeQuota {
 private constructor(private readonly origin:AgentStartLedger,private readonly reader:Reader,private readonly ticket:AgentStartTicket,private readonly original:ReturnType<typeof core>){if(!(origin instanceof AgentStartLedger)||!readers.has(reader)||!same(origin.readExclusive('fixed_volume_quota',policyKey(original.volume_root)),{ticket,basis:{format:'cimiloop/fixed-volume-policy/1.0.0',original}}))fail();Object.freeze(ticket);Object.freeze(original.image_identity);Object.freeze(original);quotas.add(this);Object.freeze(this);}
 static initialize(origin:AgentStartLedger,reader:Reader,input:{image:string;volume_root:string;maximum_bytes:number}){
  if(!(origin instanceof AgentStartLedger)||!readers.has(reader))fail();const args=argumentsChecked(input.image,input.volume_root,input.maximum_bytes),observed=reader(args.image,args.root,args.maximum);
  origin.issueExclusive('fixed_volume_quota',policyKey(args.root),{format:'cimiloop/fixed-volume-policy/1.0.0',original:core(observed)});return this.open(origin,reader,args.root);
 }
 static open(origin:AgentStartLedger,reader:Reader,root:string){
  if(!(origin instanceof AgentStartLedger)||!readers.has(reader)||!/^[D-Z]:\\$/i.test(root))fail();const row=origin.readExclusive('fixed_volume_quota',policyKey(root)),body=row?.basis;
  if(!row||!exact(body,['format','original'])||body.format!=='cimiloop/fixed-volume-policy/1.0.0'||!body.original||typeof body.original!=='object')fail();
  const original=body.original as ReturnType<typeof core>;if(original.volume_root!==root.toUpperCase())fail();const current=reader(original.image_path,original.volume_root,original.virtual_bytes);if(!same(core(current),original)||!same(origin.readExclusive('fixed_volume_quota',policyKey(root)),row))fail();
  return new FixedVolumeQuota(origin,reader,row.ticket,structuredClone(original));
 }
 #proof(){const row=this.origin.readTicket(this.ticket),observed=this.reader(this.original.image_path,this.original.volume_root,this.original.virtual_bytes);if(!same(core(observed),this.original)||!same(this.origin.readTicket(this.ticket),row))fail();return{format:'cimiloop/fixed-volume-proof/1.0.0' as const,status:'Verified' as const,maximum_bytes:this.original.virtual_bytes,observation:observed,policy_ticket:structuredClone(this.ticket),runtime_scope_proven:false as const};}
 read(){return this.#proof();}
 assertPath(path:string){const canonical=assertOrdinaryPath(path);if(parse(canonical).root.toUpperCase()!==this.original.volume_root)fail();const proof=this.#proof();if(assertOrdinaryPath(path)!==canonical)fail();return proof;}
 bindRuntime(raw:FixedVolumeRuntimeScope){
  if(!quotas.has(this))fail();const scope=runtimeScope(raw);this.assertPath(scope.repository_path);this.assertPath(scope.data_directory);
  const basis:StorageBasis={format:'cimiloop/fixed-volume-runtime/1.0.0',scope,quota_ticket:structuredClone(this.ticket)};
  this.origin.issueExclusive('fixed_volume_runtime',digest(scope.project_id).value,basis);return this.openRuntime(scope);
 }
 openRuntime(raw:FixedVolumeRuntimeScope){
  if(!quotas.has(this))fail();const scope=runtimeScope(raw),row=this.origin.readExclusive('fixed_volume_runtime',digest(scope.project_id).value),basis:StorageBasis={format:'cimiloop/fixed-volume-runtime/1.0.0',scope,quota_ticket:structuredClone(this.ticket)};
  if(!row||!same(row.basis,basis))fail();
  const storage=Reflect.construct(FixedVolumeRuntimeStorage,[storageToken,this,this.origin,row.ticket,basis]) as FixedVolumeRuntimeStorage;
  storage.read();return storage;
 }
}
const assertOriginalQuotaPath=FixedVolumeQuota.prototype.assertPath;
