import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {bytesAt,digest,digestRuntimeBinaryFile,parseGatewayJson,readCodexAgentModelOriginals,withRuntimeBinaryProofTurn} from '@cimiloop/runtime-adapter';
import type {InstalledCodexAgentRuntime} from './agent-codex-installation-local.js';
import type {NamedSkillMethodOriginalsPort} from './skill-method-assessment-local.js';
import {LocalNativeNamedMethodSamples} from './native-named-method-samples-local.js';
import {LocalSkillMethodInputs} from './skill-methods-local.js';

const same=(a:unknown,b:unknown)=>isDeepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
const fail=():never=>{throw Error('Original Codex named method model/account/context cannot be verified');};
type Input=Parameters<NamedSkillMethodOriginalsPort['verify']>[1];

// Actual original readers, not imported approval fields. A protected Codex
// installation pins the executable/account. Bills, effective permissions,
// recovery behavior and uninstalled harness capabilities remain independent.
export class LocalCodexNamedMethodOriginals implements NamedSkillMethodOriginalsPort {
 private readonly samples:LocalNativeNamedMethodSamples;
 private readonly inputs:LocalSkillMethodInputs;
 private readonly guardMethod:InstalledCodexAgentRuntime['guard'];
 private readonly basis;
 constructor(repositoryPath:string,dataDirectory:string,private readonly installed:InstalledCodexAgentRuntime,private readonly originalsRoot=dataDirectory){
  this.samples=new LocalNativeNamedMethodSamples(repositoryPath,dataDirectory,originalsRoot);this.inputs=new LocalSkillMethodInputs(repositoryPath,dataDirectory);this.guardMethod=installed.guard;
  this.basis=this.snapshot();this.guard();
 }
 private snapshot(){const value=this.installed;return{installation_digest:value.installation_digest,binary:value.binary,model:value.model,account_digest:value.account_digest,quota_account_digest:value.quota_account_digest,disabled_mcp_servers:[...value.disabled_mcp_servers]};}
 private guard(){
  if(this.installed.guard!==this.guardMethod||!same(this.snapshot(),this.basis))fail();
  const value:unknown=Reflect.apply(this.guardMethod,this.installed,[]);if(value!==undefined){void Promise.resolve(value).catch(()=>{});fail();}
  if(this.installed.guard!==this.guardMethod||!same(this.snapshot(),this.basis))fail();
 }
 verify(...[project,input]:Parameters<NamedSkillMethodOriginalsPort['verify']>):ReturnType<NamedSkillMethodOriginalsPort['verify']>{return withRuntimeBinaryProofTurn(()=>{
  this.guard();const {descriptor,evidence}=input,threads=new Set<string>(),sessions=new Set<string>(),profiles=new Set<string>();
  if(!Array.isArray(evidence.samples)||!evidence.samples.length||evidence.samples.length>4)fail();
  let current:{origin:'external_model'|'public_fixture';native_job_observed:boolean}|undefined;
  const binaryDigest=digestRuntimeBinaryFile(this.basis.binary);
  for(const sample of evidence.samples){
   const plan=this.samplesPlan(project,input,sample),replay=this.samples.read(project,descriptor,evidence,sample,plan),original=readCodexAgentModelOriginals(this.originalsRoot,replay.marker.scope);
   if(sessions.has(replay.effects.session_id)||profiles.has(replay.effects.native_profile))fail();sessions.add(replay.effects.session_id);profiles.add(replay.effects.native_profile);
   if(original.status!=='Observed'||!original.original_requirement_pinned||!['external_model','public_fixture'].includes(original.origin??'')||original.scope_digest!==digest(JSON.stringify(replay.marker.scope)).value||original.output_profile!=='bounded_2048/1.0.0'||original.usage_policy!=='require_ordinary_permission/1.0.0'||original.quota_account_digest!==this.basis.quota_account_digest||!original.calls.length||original.origin==='external_model'&&original.real_model_turns!==original.calls.length)fail();
   const headers=original.artifacts.filter(a=>a.name==='header.json');if(headers.length!==1)fail();
   const bytes=bytesAt(headers[0]!.path,262144);if(digest(bytes).value!==headers[0]!.digest)fail();
   const header=structuredClone(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes),262144)) as {model?:unknown;account_digest?:unknown;quota_account_digest?:unknown;runtime?:{account_digest?:unknown;command?:{file?:string;sha256?:string;args?:unknown};disabled_mcp_servers?:unknown}};
   if(header.model!==this.basis.model||header.account_digest!==this.basis.account_digest||header.quota_account_digest!==this.basis.quota_account_digest||header.runtime?.account_digest!==this.basis.account_digest||typeof header.runtime.command?.file!=='string'||resolve(header.runtime.command.file)!==resolve(this.basis.binary)||header.runtime.command.sha256!==binaryDigest||!same(header.runtime.command.args,[])||!same(header.runtime.disabled_mcp_servers??[],this.basis.disabled_mcp_servers))fail();
   for(const call of original.calls){const source=call.original;
    if(call.state!=='reply_recorded'||!source||source.account_digest!==this.basis.account_digest||source.model!==this.basis.model||!source.thread_id||threads.has(source.thread_id)||source.ordinary_quota?.before.ordinary_usage_allowed!==true||source.ordinary_quota.before.account_id_digest!==this.basis.quota_account_digest||source.ordinary_quota.after.account_id_digest!==this.basis.quota_account_digest)fail();
    threads.add(source!.thread_id);
   }
   if(sample.invocation_key===input.sample.invocation_key){if(!same(plan,input.plan)||!same(sample,input.sample)||!same(replay.effects,{session_id:input.session_id,native_pid:input.native_pid,native_profile:input.native_profile}))fail();current={origin:original.origin!,native_job_observed:replay.native_job_observed};}
  }
  this.guard();if(!current||digestRuntimeBinaryFile(this.basis.binary)!==binaryDigest)fail();
  const harness:ReturnType<NamedSkillMethodOriginalsPort['verify']>['checks']['harness']={};for(const key of input.plan.harness_requirements)harness[key]=['explicit_invocation','invoke_skills'].includes(key)?'passed':'inconclusive';
  const result:ReturnType<NamedSkillMethodOriginalsPort['verify']>={origin:current!.origin,checks:{runtime_custody:current!.native_job_observed?'passed':'inconclusive',independent_context:'passed',provider_dependencies:descriptor.dependencies.length?'inconclusive':'passed',permission_intersection:'inconclusive',cost_accounting_and_cap:'inconclusive',invocation_recovery:'inconclusive',behavior:'inconclusive',harness}};return result;
 });}
 private samplesPlan(project:Parameters<NamedSkillMethodOriginalsPort['verify']>[0],input:Input,sample:Input['sample']){
  // Rebuild every fixed packet; another sample's imported plan is never reused.
  return this.inputs.read(project,input.descriptor,{...sample,method_name:input.evidence.method_name});
 }
}
