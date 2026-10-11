import {join,relative,isAbsolute,resolve} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {requestDigest} from '@cimiloop/kernel';
import {compileValidator,RawSkillInvocationObservationSchema,type RawSkillInvocationObservation,type SkillInvocation,type SkillInvocationObservation,type Project} from '@cimiloop/protocol/v2';
import {bytesAt,digest,readAgentRuntimeNamedMethodResult,readDedicatedAgentModelOriginals,readAgentRuntimeModelOriginals} from '@cimiloop/runtime-adapter';
import {readOriginalSkillInvocation,readOriginalSkillInvocationFromReader,type SkillInvocationExecutionContext} from './skill-invocation-execution-local.js';
import {LocalSkillInvocationStartCustody} from './skill-invocation-start-custody-local.js';
import {LocalSkillMethodInputs} from './skill-methods-local.js';
import {LocalProjectError} from './errors.js';
import type {ContentReference} from './evidence-local.js';

interface Options {local:SkillInvocationExecutionContext;custody:LocalSkillInvocationStartCustody;inputs:LocalSkillMethodInputs}
const fail=()=>new LocalProjectError('原 Skill 结果及不可变证据不能独立核验','EVIDENCE_MISSING','conflict');
// Derived from the readers' complete upper bounds:32 materials,128 method
// calls,64 model calls,128 IPC exchanges,10 dedicated artifacts/model call.
export const SKILL_RESULT_CAPTURE_LIMITS=Object.freeze({artifacts:9+(2+32+128*2)+(2+64*3)+(1+128*4)+(3+64*10),proof_bytes:8*1024*1024,
 total_bytes:2*4*1024*1024+5*65536+(2+128*2)*114688+32*50*1024+(2+64*3)*114688+114688+128*(2*114688+2*1024)+(3+64*10)*262144});
export function parseSkillResultCaptureBytes(bytes:Buffer):unknown {
 if(!bytes.length||bytes.length>SKILL_RESULT_CAPTURE_LIMITS.proof_bytes)throw fail();
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),value:unknown=JSON.parse(text);
 // Only this capture format's canonical serialization is accepted. Duplicate
 // keys, number aliases and escape/whitespace substitutions fail roundtrip.
 if(JSON.stringify(value)!==text)throw fail();
 const stack:{value:unknown;depth:number}[]=[{value,depth:0}];let nodes=0;
 while(stack.length){const next=stack.pop()!;if(++nodes>100000||next.depth>64)throw fail();if(next.value&&typeof next.value==='object')for(const child of Object.values(next.value))stack.push({value:child,depth:next.depth+1});}
 return structuredClone(value);
}
const decode=parseSkillResultCaptureBytes;
type Artifact={name:string;path:string;digest:string};
// Code-only shared capture and Kernel verifier. Complete Native/method/model
// candidates are saved with original bytes, but qualification/account custody
// and bills remain independent. This conservative port produces ONLY Unknown;
// it cannot satisfy a Task, adopt output, settle money or permit another effect.
export class LocalSkillInvocationResultCollection {
 private readonly times=new Map<string,string>();
 constructor(private readonly options:Options){if(!(options.custody instanceof LocalSkillInvocationStartCustody)||!(options.inputs instanceof LocalSkillMethodInputs))throw fail();}
 private original(id:string,existingReader=false){const local=this.options.local;return existingReader?readOriginalSkillInvocationFromReader(local,local.store,id):readOriginalSkillInvocation(local,id);}
 private facts(id:string,existingReader=false){
  const {local,custody,inputs}=this.options,original=this.original(id,existingReader),plan=inputs.readInvocation(original.project,original.descriptor,original.invocation);
  const state=custody.inspect(original.project,original.invocation,original.request.parent,original.record_id);
  if(state.state==='unclaimed'||!('material_digest' in state)||state.material_digest!==requestDigest(plan))throw fail();
  // A late returned ACK is a new observation of this same dispatch. Bind only
  // its immutable ticket/material; never invalidate earlier proof on that ACK.
  const dispatch={ticket:state.ticket,material_digest:state.material_digest};
  const relation=custody.accountScope(original.project,original.invocation,original.request.parent,original.record_id),root=join(local.location.dataDirectory,'skill-runtime-originals',original.project.id,original.invocation.invocation_key);
  const result=readAgentRuntimeNamedMethodResult(root,relation.child,plan),provider=readDedicatedAgentModelOriginals(root,relation.child),model=readAgentRuntimeModelOriginals(root,relation.child);
  if(result.status!=='Observed'||!result.method_result_reverified||!result.output||provider.summary.status!=='Observed'||!provider.summary.original_requirement_pinned||!provider.summary.budget_identity_pinned||provider.summary.unresolved||!provider.calls.length||model.status!=='Observed'||!same(provider.calls.map(c=>c.call_id),model.calls.map(c=>c.call_id)))throw fail();
  const artifacts:Artifact[]=[...result.artifacts.map(a=>({...a,name:'method/'+a.name})),...provider.artifacts.map(a=>({...a,name:'provider/'+a.name}))];
  if(artifacts.length>SKILL_RESULT_CAPTURE_LIMITS.artifacts||new Set(artifacts.map(a=>a.name)).size!==artifacts.length)throw fail();
  for(const a of artifacts){const rel=relative(resolve(root),resolve(a.path));if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||digest(bytesAt(a.path,4*1024*1024)).value!==a.digest)throw fail();}
  const {artifacts:_,...method}=result;
  return {format:'cimiloop/original-skill-result-candidate/1.0.0',invocation:original.invocation,parent:relation.parent,scope:relation.child,dispatch,plan_digest:requestDigest(plan),method,provider:{summary:provider.summary,calls:provider.calls},artifacts,qualification_reverified:false,model_account_custody_proven:false,costs_reconciled:false,formal_agent_execution_enabled:false};
 }
 capture(invocationId:string):{report:RawSkillInvocationObservation;reference:SkillInvocationObservation['raw_result_ref']}{
  try{
   const facts=this.facts(invocationId),content=this.options.inputs.packages.content;let bytes=0;
   const copies=facts.artifacts.map(a=>{const body=bytesAt(a.path,4*1024*1024);bytes+=body.length;if(bytes>SKILL_RESULT_CAPTURE_LIMITS.total_bytes||digest(body).value!==a.digest)throw fail();return {...a,reference:content.storeContent(body,'provider_probe_artifact')};});
   if(!same(this.facts(invocationId),facts))throw fail();
   const observed_at=this.times.get(invocationId)??new Date().toISOString();this.times.set(invocationId,observed_at);
   const proof={...facts,observed_at,artifacts:copies},result_proof_ref=content.storeContent(Buffer.from(JSON.stringify(proof)),'skill_invocation_proof'),invocation=facts.invocation;
   const report=compileValidator<RawSkillInvocationObservation>(RawSkillInvocationObservationSchema)({format:'cimiloop/skill-invocation/1.0.0',invocation_ref:{object_type:'skill_invocation',id:invocation.id},invocation_key:invocation.invocation_key,run_ref:invocation.run_ref,run_operation_key:invocation.run_operation_key,producer_actor_id:invocation.executor_ref.id,input_digest:invocation.input_digest,observed_at,basis:'direct_observation',status:'unknown',usage:{cost_known:false},result_proof_ref,resolves_observation_refs:[]});
   const reference=content.storeContent(Buffer.from(JSON.stringify(report)),'skill_invocation_report');this.readResult(readOriginalSkillInvocation(this.options.local,invocationId).project,invocation,reference);return {report,reference};
  }catch{throw fail();}
 }
 // Read-only history is deliberately independent of current execution authority.
 // A cancelled/Unknown parent can collect its original; it cannot launch again.
 readResult(project:Project,invocation:SkillInvocation,reference:SkillInvocationObservation['raw_result_ref']):RawSkillInvocationObservation{
  try{
   if(reference.resource_type!=='skill_invocation_report')throw fail();const content=this.options.inputs.packages.content;
   const raw=compileValidator<RawSkillInvocationObservation>(RawSkillInvocationObservationSchema)(decode(content.readContent(reference)));
   if(raw.status!=='unknown'||raw.usage.cost_known||raw.basis!=='direct_observation'||raw.resolves_observation_refs.length)throw fail();
   const facts=this.facts(invocation.id,true),original=this.original(invocation.id,true);
   if(!same(invocation,facts.invocation)||project.id!==original.project.id||resolve(project.repository_path)!==resolve(original.project.repository_path))throw fail();
   const proof=decode(content.readContent(raw.result_proof_ref)) as {observed_at?:unknown;artifacts?:Array<Artifact&{reference:ContentReference}>};
   if(!proof||typeof proof!=='object'||!Array.isArray(proof.artifacts)||proof.artifacts.length!==facts.artifacts.length)throw fail();
   let total=0;for(const [i,a] of proof.artifacts.entries()){
    const expected=facts.artifacts[i]!,body=bytesAt(expected.path,4*1024*1024);total+=body.length;
    if(total>SKILL_RESULT_CAPTURE_LIMITS.total_bytes||a.reference.resource_type!=='provider_probe_artifact'||!same(a,{...expected,reference:a.reference})||digest(body).value!==expected.digest||!content.readContent(a.reference).equals(body))throw fail();
   }
   if(!same(proof,{...facts,observed_at:raw.observed_at,artifacts:proof.artifacts})||!same(this.facts(invocation.id,true),facts))throw fail();
   const expected={format:'cimiloop/skill-invocation/1.0.0',invocation_ref:{object_type:'skill_invocation',id:invocation.id},invocation_key:invocation.invocation_key,run_ref:invocation.run_ref,run_operation_key:invocation.run_operation_key,producer_actor_id:invocation.executor_ref.id,input_digest:invocation.input_digest,observed_at:raw.observed_at,basis:'direct_observation',status:'unknown',usage:{cost_known:false},result_proof_ref:raw.result_proof_ref,resolves_observation_refs:[]};
   if(!same(raw,expected))throw fail();return raw;
  }catch{throw fail();}
 }
}
