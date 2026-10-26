import {isDeepStrictEqual as same} from 'node:util';
import {compileValidator,InternalIdSchema,NamedSkillMethodEvidenceSchema,type NamedSkillMethodEvidence} from '@cimiloop/protocol/v2';
import {requestDigest} from '@cimiloop/kernel';
import type {LocalProject} from './project.js';
import {LocalProjectError} from './errors.js';
import {readHumanOriginalAgentRunInputs} from './agent-runtime-control-local.js';
import {readOriginalSkillInvocationMetadataFromReader} from './skill-invocation-execution-local.js';
import {assertSkillInvocationStartOriginalSeal,LocalSkillInvocationStartCustody} from './skill-invocation-start-custody-local.js';
import {LocalNativeNamedMethodSamples} from './native-named-method-samples-local.js';
import {LocalEvidenceVerifier} from './evidence-local.js';
import type {HumanSkillRuntimeFactory,SkillRuntimeControlLease} from './skill-invocation-control-local.js';
import {productionSkillRuntimeOriginals} from './skill-runtime-originals-local.js';

const unavailable=()=>new LocalProjectError('原命名 Skill 证据或当前 Human 范围不可核对','CAPABILITY_UNAVAILABLE','conflict');
function synchronous(guard:()=>void){const value:unknown=guard();if(value!==undefined){if(value instanceof Promise)void value.catch(()=>{});throw unavailable();}}
// Collection creates immutable content only. The Provider commands/Kernel must
// independently reread and assess it; no imported outcome grants execution.
export class LocalHumanNamedSkillCapture {
 constructor(private readonly local:LocalProject,private readonly factory:HumanSkillRuntimeFactory=productionSkillRuntimeOriginals){}
 async capture(rawIds:unknown,beforeRead:()=>void=()=>{}){
  let ids:string[];
  try{if(!Array.isArray(rawIds)||!rawIds.length||rawIds.length>4)throw Error();ids=rawIds.map(id=>compileValidator<string>(InternalIdSchema)(id));if(new Set(ids).size!==ids.length)throw Error();}
  catch{throw new LocalProjectError('须指定一至四个不同的原 Skill 调用 ID','INVALID_COMMAND');}
  const {local}=this,store=local.store,kernel=local.kernel,location=structuredClone(local.location),instance=structuredClone(local.instance);
  const original=(id:string)=>{
   const value=store.readSnapshot(reader=>readOriginalSkillInvocationMetadataFromReader(local,reader,id)).value;
   if(!same(readHumanOriginalAgentRunInputs(local,value.invocation.run_ref.id).scope,value.request.parent))throw unavailable();return value;
  };
  const guard=()=>{synchronous(beforeRead);if(local.store!==store||local.kernel!==kernel||!same(local.location,location)||!same(local.instance,instance))throw unavailable();};
  guard();const originals=ids.map(original),first=originals[0]!;
  for(const value of originals)if(!same(value.descriptor,first.descriptor)||!same(value.invocation.runtime_binding,first.invocation.runtime_binding)||value.invocation.request.method_name!==first.invocation.request.method_name||value.invocation.request.input.purpose!==first.invocation.request.input.purpose)throw unavailable();
  const fresh=()=>{guard();if(!same(ids.map(original),originals))throw unavailable();};
  const leases:SkillRuntimeControlLease[]=[],seals:{seal:ReturnType<LocalSkillInvocationStartCustody['captureOriginalSeal']>;original:typeof first}[]=[];
  try{
   const reader=new LocalNativeNamedMethodSamples(location.repositoryPath,location.dataDirectory),samples:NamedSkillMethodEvidence['samples']=[];
   for(const value of originals){
    fresh();const lease=await this.factory(value.invocation.id,local);if(typeof lease?.release!=='function')throw unavailable();leases.push(lease);fresh();
    if(!(lease.custody instanceof LocalSkillInvocationStartCustody))throw unavailable();if(lease.guard)synchronous(lease.guard.bind(lease));fresh();
    const seal=lease.custody.captureOriginalSeal(value.project,value.invocation,value.request.parent,value.record_id);seals.push({seal,original:value});
    const sample=reader.captureChild(value.project,value.descriptor,{invocation_key:value.invocation.invocation_key,input_ref:value.invocation.input_ref,method_name:value.invocation.request.method_name},seal.child);
    if(!same(sample.input_ref,value.invocation.input_ref)||sample.invocation_key!==value.invocation.invocation_key)throw unavailable();samples.push(sample);fresh();
   }
   const evidence=compileValidator<NamedSkillMethodEvidence>(NamedSkillMethodEvidenceSchema)({format:'cimiloop/named-skill-method-evidence/1.0.0',project_id:first.project.id,descriptor_ref:{object_type:'provider_descriptor',id:first.descriptor.id},descriptor_digest:{algorithm:'sha256',value:requestDigest(first.descriptor)},runtime_binding:first.invocation.runtime_binding,method_name:first.invocation.request.method_name,purpose:first.invocation.request.input.purpose,observed_at:originals.map(value=>value.invocation.created_at).sort().at(-1),samples});
   const content=new LocalEvidenceVerifier(location.repositoryPath,location.dataDirectory),reference=content.storeContent(Buffer.from(JSON.stringify(evidence)),'named_skill_method_evidence');
   for(const lease of leases)if(lease.guard)synchronous(lease.guard.bind(lease));fresh();
   for(const {seal,original:value} of seals)assertSkillInvocationStartOriginalSeal(seal,value.project,value.invocation,value.request.parent,value.record_id);
   return {ok:true as const,evidence,reference,raw_result_ref:{...reference,resource_type:'provider_probe_snapshot' as const},starts_run:false as const,provider_qualification_proven:false as const};
  }catch(error){fresh();if(error instanceof LocalProjectError)throw error;throw unavailable();}
  finally{
   let failed=false;for(const lease of leases.reverse())try{await lease.release();}catch{failed=true;}fresh();if(failed)throw unavailable();
  }
 }
}
