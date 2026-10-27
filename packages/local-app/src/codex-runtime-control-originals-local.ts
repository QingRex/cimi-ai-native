import {isDeepStrictEqual as same} from 'node:util';
import {requestDigest,type RuntimeControlEvidence,type RuntimeControlEvidencePort,type RuntimeControlKey} from '@cimiloop/kernel';
import {readCodexAgentModelControlOriginals,withRuntimeBinaryProofTurn} from '@cimiloop/runtime-adapter';
import type {LocalProject} from './project.js';
import type {InstalledCodexAgentRuntime} from './agent-codex-installation-local.js';
import {LocalCodexRuntimeSdkOriginals} from './codex-runtime-sdk-originals-local.js';
import {runtimeContractPhaseRoot} from './runtime-contract-local.js';
import {LocalProjectError} from './errors.js';

const hash=(value:unknown)=>({algorithm:'sha256' as const,value:requestDigest(value)});
function fail():never{throw Error('Original installed Runtime control sources unavailable or changed');}
type Check=RuntimeControlEvidence['checks'][RuntimeControlKey];
type NetworkFacts={eligible:boolean;bounded:boolean;hostsCovered:boolean;basis:unknown};
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
 private readonly local;private readonly sdk;private readonly fixed;private readonly guardMethod;
 constructor(local:Pick<LocalProject,'location'|'instance'>,private readonly installed:InstalledCodexAgentRuntime){
  this.local={location:structuredClone(local.location),instance:structuredClone(local.instance)};this.sdk=new LocalCodexRuntimeSdkOriginals(this.local,installed);this.guardMethod=installed.guard;this.fixed=this.basis();this.guard();handlers.set(this,Object.freeze({network_host_limits:({eligible,bounded,hostsCovered,basis}:NetworkFacts):Check=>({result:eligible&&bounded?(hostsCovered?'supports':'refutes'):'inconclusive',basis_digest:hash(basis)})}));
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
  const checks:RuntimeControlEvidence['checks']={
   network_host_limits:handlers.get(this)!.network_host_limits!({eligible,bounded,hostsCovered,basis}),
   // These original observations are useful inputs, but token usage and a
   // recorded confinement do not prove an invoice or current complete quota.
   cost_accounting_and_cap:{result:'inconclusive',basis_digest:hash({installation:this.fixed,usage:originals.flat().map(cut=>({scope:cut.scope,header_digest:cut.header_digest,calls:cut.calls.map(call=>({call_id:call.call_id,usage:call.usage}))}))})},
   disk_limit:{result:'inconclusive',basis_digest:hash({installation:this.fixed,confinement:calls.map(call=>call.control.write_confinement)})},
   // Completed Jobs are not a startup/crash/recovery scenario matrix.
   crash_recovery:{result:'inconclusive',basis_digest:hash({installation:this.fixed,ends:calls.map(call=>call.control.original)})}
  };
  this.guard();if(!same(originals,read())||contexts.some((context,index)=>!same(context,this.sdk.readRuntimeControlContext(project,descriptor,evidence[index]!))))fail();this.guard();
  return{format:'cimiloop/runtime-control-evidence/1.0.0',project_id:project.id,descriptor_digest:hash(descriptor),evidence_digest:hash(evidence.map(e=>({id:e.id,digest:hash(e)}))),checks};
 });}
}
