import {isDeepStrictEqual as same} from 'node:util';
import {requestDigest,type RuntimeControlEvidence,type RuntimeControlEvidencePort,type RuntimeControlKey} from '@cimiloop/kernel';
import {readCodexAgentModelControlOriginals,withRuntimeBinaryProofTurn} from '@cimiloop/runtime-adapter';
import type {LocalProject} from './project.js';
import type {InstalledCodexAgentRuntime} from './agent-codex-installation-local.js';
import {LocalCodexRuntimeSdkOriginals} from './codex-runtime-sdk-originals-local.js';
import {runtimeContractPhaseRoot} from './runtime-contract-local.js';
import {LocalProjectError} from './errors.js';
import {LocalCodexRuntimeDiskOriginals,type CodexRuntimeDiskSources} from './codex-runtime-disk-originals-local.js';
import {openInstalledCodexUsageBudget} from './agent-codex-usage-budget-local.js';
import {openCodexRuntimeStorage} from './agent-codex-storage-local.js';
import {openCodexRuntimeLoginHome} from './agent-codex-login-home-local.js';

const hash=(value:unknown)=>({algorithm:'sha256' as const,value:requestDigest(value)});
function fail():never{throw Error('Original installed Runtime control sources unavailable or changed');}
type Check=RuntimeControlEvidence['checks'][RuntimeControlKey];
type NetworkFacts={eligible:boolean;bounded:boolean;hostsCovered:boolean;basis:unknown;contexts:ReturnType<LocalCodexRuntimeSdkOriginals['readRuntimeControlContext']>[];originals:ReturnType<typeof readCodexAgentModelControlOriginals>[][]};
const handlers=new WeakMap<object,Partial<Record<RuntimeControlKey,(facts:NetworkFacts)=>Check>>>();
const required:RuntimeControlKey[]=['network_host_limits','cost_accounting_and_cap','disk_limit','crash_recovery'];
// The production host needs four actual code-installed readers. This is not a
// JSON readiness flag. Evaluation may inspect the partial source separately.
export function assertCodexRuntimeControlSourcesComplete(source:LocalCodexRuntimeControlOriginals){
 const installed=handlers.get(source);if(!installed)fail();const missing=required.filter(key=>typeof installed[key]!=='function');
 if(missing.length)throw new LocalProjectError('正式 Codex 宿主缺少完整 Runtime 控制来源；保留原请求，不安装执行适配器','CAPABILITY_UNAVAILABLE','conflict',{production_admission:'unapproved',missing});
}
// The installed host selects original requests and roots. Imported reports
// select no executable, process, account, quota reader or recovery factory.
export class LocalCodexRuntimeControlOriginals implements RuntimeControlEvidencePort{
 private readonly local;private readonly sdk;private readonly fixed;private readonly guardMethod;private readonly disk?:LocalCodexRuntimeDiskOriginals;
 constructor(local:Pick<LocalProject,'location'|'instance'>,private readonly installed:InstalledCodexAgentRuntime,diskSources?:CodexRuntimeDiskSources){
  this.local={location:structuredClone(local.location),instance:structuredClone(local.instance)};this.sdk=new LocalCodexRuntimeSdkOriginals(this.local,installed);this.guardMethod=installed.guard;this.fixed=this.basis();this.guard();
  if(diskSources){if(diskSources.account.installation!==installed||!('store'in local)||!('kernel'in local))fail();this.disk=new LocalCodexRuntimeDiskOriginals(local as LocalProject,diskSources);}
  handlers.set(this,Object.freeze({network_host_limits:({eligible,bounded,hostsCovered,basis}:NetworkFacts):Check=>({result:eligible&&bounded?(hostsCovered?'supports':'refutes'):'inconclusive',basis_digest:hash(basis)}),...(this.disk?{disk_limit:({eligible,contexts,originals}:NetworkFacts)=>this.disk!.read(eligible,contexts,originals)}:{})}));
 }
 private basis(){const i=this.installed;return{installation_digest:i.installation_digest,binary:i.binary,native_binary:i.native_binary,model:i.model,account_digest:i.account_digest,quota_account_digest:i.quota_account_digest,disabled_mcp_servers:[...i.disabled_mcp_servers]};}
 private guard(){if(this.installed.guard!==this.guardMethod||!same(this.basis(),this.fixed))fail();const value:unknown=this.guardMethod.call(this.installed);if(value!==undefined){if(value instanceof Promise)void Promise.prototype.then.call(value,undefined,()=>{});fail();}if(!same(this.basis(),this.fixed))fail();}
 readRuntimeControlEvidence(...[project,descriptor,evidence]:Parameters<RuntimeControlEvidencePort['readRuntimeControlEvidence']>):RuntimeControlEvidence{return withRuntimeBinaryProofTurn(()=>{
  this.guard();if(project.id!==this.local.instance.project_id||descriptor.provider_kind!=='runtime'||!evidence.length||evidence.length>64||new Set(evidence.map(e=>e.id)).size!==evidence.length)fail();
  const contexts=evidence.map(e=>this.sdk.readRuntimeControlContext(project,descriptor,e));
  const read=()=>contexts.map(context=>context.phases.map(({phase})=>readCodexAgentModelControlOriginals(runtimeContractPhaseRoot(this.local,phase),phase.scope)));
  const originals=read(),calls=originals.flat().flatMap(cut=>cut.calls),eligible=contexts.every(context=>Object.values(context.sdk.checks).every(check=>check.result==='supports'))&&originals.flat().every(cut=>cut.origin==='external_model');
  const bounded=calls.length>0&&calls.every(({control:c})=>c.job_policy==='codex_memory_process/1.0.0'&&c.network_policy==='codex_chatgpt_tunnel/1.0.0'&&same(c.job_limits,{policy:'codex_memory_process/1.0.0',flags:0x2208,job_memory_bytes:2147483648,active_process_limit:8})&&!!c.program_bundle&&c.write_confinement?.scope.project_id===project.id&&!!c.network&&c.network.stopped===true&&c.network.boundary_failed===false&&c.network.limit_exceeded===false);
  const hostsCovered=['chatgpt.com','auth.openai.com'].every(host=>descriptor.required_permissions.network_hosts.includes(host));
  const basis={installation:this.fixed,permissions:descriptor.required_permissions,contracts:contexts.map(context=>({sdk:context.sdk,request:hash(context.original),phases:context.phases,boundary_digest:context.boundary_digest})),originals};
  const facts={eligible,bounded,hostsCovered,basis,contexts,originals},installed=handlers.get(this)!;
  const checks:RuntimeControlEvidence['checks']={
   network_host_limits:installed.network_host_limits!(facts),
   // These original observations are useful inputs, but token usage and a
   // recorded confinement do not prove an invoice or current complete quota.
   cost_accounting_and_cap:{result:'inconclusive',basis_digest:hash({installation:this.fixed,usage:originals.flat().map(cut=>({scope:cut.scope,header_digest:cut.header_digest,calls:cut.calls.map(call=>({call_id:call.call_id,usage:call.usage}))}))})},
   disk_limit:installed.disk_limit?installed.disk_limit(facts):{result:'inconclusive',basis_digest:hash({installation:this.fixed,confinement:calls.map(call=>call.control.write_confinement)})},
   // Completed Jobs are not a startup/crash/recovery scenario matrix.
   crash_recovery:{result:'inconclusive',basis_digest:hash({installation:this.fixed,ends:calls.map(call=>call.control.original)})}
  };
  this.guard();if(installed.disk_limit&&!same(checks.disk_limit,installed.disk_limit(facts)))fail();if(!same(originals,read())||contexts.some((context,index)=>!same(context,this.sdk.readRuntimeControlContext(project,descriptor,evidence[index]!))))fail();this.guard();
  return{format:'cimiloop/runtime-control-evidence/1.0.0',project_id:project.id,descriptor_digest:hash(descriptor),evidence_digest:hash(evidence.map(e=>({id:e.id,digest:hash(e)}))),checks};
 });}
}

// Provider evaluation borrows existing sources only. Missing attachments keep
// the partial reader; unreadable existing originals fail rather than rebuild.
export async function openCodexRuntimeControlOriginals(local:LocalProject,installed:InstalledCodexAgentRuntime,beforeRead:()=>void){
 const guard=()=>{const result:unknown=beforeRead();if(result!==undefined){void Promise.resolve(result).catch(()=>{});fail();}installed.guard();};
 guard();const account=await openInstalledCodexUsageBudget(local);let released=false;
 const release=()=>{if(!released){released=true;account?.release();}};
 const partial=()=>{const source=new LocalCodexRuntimeControlOriginals(local,installed);let closed=false;return{source,guard(){if(closed)fail();guard();},release(){if(!closed){closed=true;release();}}};};
 try{
  guard();if(!account)return partial();
  account.guard();if(account.installation.installation_digest!==installed.installation_digest)fail();
  const storage=await openCodexRuntimeStorage(local,account.installation);guard();account.guard();
  const home=storage&&await openCodexRuntimeLoginHome(local,account.installation,storage);guard();account.guard();
  if(!storage||!home){release();return partial();}
  const source=new LocalCodexRuntimeControlOriginals(local,account.installation,{account,storage,home});
  return{source,guard(){if(released)fail();guard();account.guard();},release};
 }catch(error){release();throw error;}
}
