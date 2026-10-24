import {join,relative,isAbsolute,resolve} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {requestDigest} from '@cimiloop/kernel';
import {compileValidator,RawSkillInvocationObservationSchema,type RawSkillInvocationObservation,type SkillInvocation,type SkillInvocationObservation,type Project} from '@cimiloop/protocol/v2';
import {bytesAt,digest,readAgentSkillPreparationZeroEffects,collectAgentRuntimeOperation,readAgentRuntimeNamedMethodCancellation,readAgentRuntimeNamedMethodResult,readDedicatedAgentModelOriginals,readCodexAgentModelOriginals,codexAgentModelSummary,readAgentRuntimeModelOriginals,DedicatedAgentAccountLedger,readOriginalDedicatedAgentRunCosts,withOriginalDedicatedAgentRunCostRead,rememberOriginalIdentity,rememberOriginalObservation,withStartCustodyVerifyTurn,type OriginalDedicatedAgentRunCostReader} from '@cimiloop/runtime-adapter';
import {readOriginalSkillInvocation,readOriginalSkillInvocationFromReader,type SkillInvocationExecutionContext} from './skill-invocation-execution-local.js';
import {LocalSkillInvocationStartCustody,assertSkillInvocationStartOriginalSeal} from './skill-invocation-start-custody-local.js';
import {LocalSkillMethodInputs} from './skill-methods-local.js';
import {LocalProjectError} from './errors.js';
import {captureSkillResultOriginalSeal,captureSkillResultRuntimeOriginalBoundary,assertSkillResultRuntimeOriginalBoundary,assertSkillResultOriginalSeal,type SkillResultOriginalSeal} from './skill-result-original-seal.js';
import {LocalNamedSkillMethodAssessment,type NamedSkillMethodOriginalsPort} from './skill-method-assessment-local.js';
import {LocalEvidenceVerifier,type ContentReference} from './evidence-local.js';

interface Options {local:SkillInvocationExecutionContext;custody:LocalSkillInvocationStartCustody;inputs:LocalSkillMethodInputs;account?:DedicatedAgentAccountLedger;qualificationOriginals?:NamedSkillMethodOriginalsPort}
const fail=()=>new LocalProjectError('原 Skill 结果及不可变证据不能独立核验','EVIDENCE_MISSING','conflict');
// Derived from the readers' complete upper bounds:32 materials,128 method
// calls,64 model calls,128 IPC exchanges,10 dedicated artifacts/model call.
export const SKILL_RESULT_CAPTURE_LIMITS=Object.freeze({artifacts:9+(2+32+128*2)+(2+64*3)+(1+128*4)+(3+64*10),proof_bytes:8*1024*1024,
 total_bytes:2*4*1024*1024+5*65536+(2+128*2)*114688+32*50*1024+(2+64*3)*114688+114688+128*(2*114688+2*1024)+(3+64*10)*262144});
// Only an independently verified new Job artifact earns the additional capacity.
export function skillResultCaptureLimits(originalJobPolicy:boolean,originalCancellation=false,originalCodex=false){
 const extra=Number(originalJobPolicy)+3*Number(originalCancellation);
 // Codex has at most64 SDK steps: two headers, five bounded model records
 // and three8MiB transport originals per step. The existing artifact count
 // already covers its smaller count; historical Dedicated capacity stays fixed.
 const codexBytes=originalCodex?2*262144+64*(5*262144+3*8*1024*1024):0;
 return extra||originalCodex?Object.freeze({...SKILL_RESULT_CAPTURE_LIMITS,artifacts:SKILL_RESULT_CAPTURE_LIMITS.artifacts+extra,total_bytes:SKILL_RESULT_CAPTURE_LIMITS.total_bytes+extra*65536+codexBytes}):SKILL_RESULT_CAPTURE_LIMITS;
}
const isCodexTransport=(name:string)=>/^provider\/[a-zA-Z0-9_-]{1,128}\/codex\/(?:start\.json|stdio\.jsonl|seal\.json)$/.test(name);
const artifactMaximum=(a:Artifact)=>isCodexTransport(a.name)?8*1024*1024:4*1024*1024;
const limitsFor=(artifacts:Artifact[])=>skillResultCaptureLimits(artifacts.some(a=>a.name==='method/agent-job-observation.json'),artifacts.some(a=>a.name==='method/agent-sandbox-cancellation.json'),artifacts.some(a=>isCodexTransport(a.name)));
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
const readOriginalContent=LocalEvidenceVerifier.prototype.readContent;
const captureStartOriginal=LocalSkillInvocationStartCustody.prototype.captureOriginalSeal;
type CancellationCollection=Awaited<ReturnType<typeof collectAgentRuntimeOperation>>;
type Artifact={name:string;path:string;digest:string};
// Code-only shared capture and Kernel verifier. Complete Native/method/model
// candidates are saved with original bytes, but qualification/account custody
// remain independent. Authenticated bills may prove original cash/credit usage,
// default candidates remain Unknown. Explicit Human reconciliation also needs
// the pinned original qualification and bills; only Kernel settles the child.
// Neither path satisfies a Task or grants another execution effect.
export class LocalSkillInvocationResultCollection {
 private readonly times=new Map<string,string>();
 constructor(private readonly options:Options){if(!(options.custody instanceof LocalSkillInvocationStartCustody)||!(options.inputs instanceof LocalSkillMethodInputs))throw fail();}
 // Trusted historical family composition only. No preparation, registration,
 // execution or model effect; both inputs and birth come from the original.
 readFamilyPreparation(project:Project,invocation:SkillInvocation){
  const original=this.original(invocation.id,true),{custody,inputs}=this.options;
  if(!same(original.invocation,invocation)||project.id!==original.project.id||resolve(project.repository_path)!==resolve(original.project.repository_path))throw fail();
  return{relation:custody.accountScope(original.project,invocation,original.request.parent,original.record_id),inputs:inputs.readInvocation(original.project,original.descriptor,invocation)};
 }
 private original(id:string,existingReader=false){const local=this.options.local;return existingReader?readOriginalSkillInvocationFromReader(local,local.store,id):readOriginalSkillInvocation(local,id);}
 private facts(id:string,existingReader=false,billed=false,reconciling=false,collection?:CancellationCollection,verified=false,readCosts:OriginalDedicatedAgentRunCostReader=readOriginalDedicatedAgentRunCosts){
  const {local,custody,inputs}=this.options,original=this.original(id,existingReader),plan=inputs.readInvocation(original.project,original.descriptor,original.invocation);
  const state=custody.inspect(original.project,original.invocation,original.request.parent,original.record_id);
  if(state.state==='unclaimed'||!('material_digest' in state)||state.material_digest!==requestDigest(plan))throw fail();
  // A late returned ACK is a new observation of this same dispatch. Bind only
  // its immutable ticket/material; never invalidate earlier proof on that ACK.
  const dispatch={ticket:state.ticket,material_digest:state.material_digest};
  const relation=custody.accountScope(original.project,original.invocation,original.request.parent,original.record_id),root=join(local.location.dataDirectory,'skill-runtime-originals',original.project.id,original.invocation.invocation_key);
  if(collection&&local.store.getRun(original.invocation.run_ref.id)?.cancel_requested!==true)throw fail();
  // Repeated reads inside one synchronous proof share the first closed original.
  // Account costs stay outside that memory and still run on every facts call.
  const observed=rememberOriginalObservation(['skill-original-facts',resolve(root),id,String(existingReader),String(billed),String(reconciling),String(verified),collection?requestDigest(collection):''].join('\0'),()=>{
   const result=collection?readAgentRuntimeNamedMethodCancellation(root,relation.child,plan,collection):readAgentRuntimeNamedMethodResult(root,relation.child,plan),model=readAgentRuntimeModelOriginals(root,relation.child);
   const codex=model.original_evidence?.kind==='codex_login/1.0.0';
   const provider=codex?(()=>{
    const original=readCodexAgentModelOriginals(root,relation.child);
    if(original.status!=='Observed'||!original.original_requirement_pinned||original.header_digest!==model.original_evidence?.header_digest||original.scope_digest!==digest(JSON.stringify(relation.child)).value||!original.calls.length||original.calls.length!==model.calls.length||original.calls.some((call,i)=>call.state!=='reply_recorded'||!call.original||!same(call.response,model.calls[i]?.response)))throw fail();
    return {summary:{...codexAgentModelSummary(original),provider_kind:'codex_login/1.0.0' as const},calls:original.calls,artifacts:original.artifacts};
   })():readDedicatedAgentModelOriginals(root,relation.child);
   const succeeded=result.method_result_reverified===true&&!!result.output&&result.method_failure_reverified===undefined&&result.failure===undefined;
   const failed=result.method_result_reverified===false&&result.method_failure_reverified===true&&result.output===undefined&&result.output_digest===undefined&&result.failure?.code==='agent_named_method_output_invalid'&&
    Object.keys(result.failure).sort().join(',')==='code,returned_text_digest'&&result.failure.returned_text_digest?.algorithm==='sha256'&&/^[a-f0-9]{64}$/.test(result.failure.returned_text_digest.value);
   const cancelled=!!collection&&'cancellation_reverified' in result&&result.cancellation_reverified===true&&result.method_result_reverified===false&&result.output===undefined&&result.output_digest===undefined&&result.method_failure_reverified===undefined&&result.failure===undefined;
   if(result.status!=='Observed'||!(collection?cancelled:succeeded||failed)||provider.summary.status!=='Observed'||!provider.summary.original_requirement_pinned||!codex&&(!('budget_identity_pinned'in provider.summary)||!provider.summary.budget_identity_pinned)||provider.summary.unresolved||!provider.calls.length||model.status!=='Observed'||!same(provider.calls.map(c=>c.call_id),model.calls.map(c=>c.call_id)))throw fail();
   const artifacts:Artifact[]=[...result.artifacts.map(a=>({...a,name:'method/'+a.name})),...provider.artifacts.map(a=>({...a,name:'provider/'+a.name}))];
   if(artifacts.length>limitsFor(artifacts).artifacts||new Set(artifacts.map(a=>a.name)).size!==artifacts.length)throw fail();
   for(const a of artifacts){const rel=relative(resolve(root),resolve(a.path));if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||digest(bytesAt(a.path,artifactMaximum(a))).value!==a.digest)throw fail();}
   const {artifacts:_,...method}=result;return {method,provider:{summary:provider.summary,calls:provider.calls},artifacts};
  });
  let cost_evidence:ReturnType<typeof readOriginalDedicatedAgentRunCosts>|undefined;
  if(billed){
   if('provider_kind'in observed.provider.summary)throw fail();
   if(!(this.options.account instanceof DedicatedAgentAccountLedger))throw fail();
   cost_evidence=readCosts(root,relation.child,this.options.account);
   const record=local.store.getRuntimeRecord('run_record',original.record_id);
   if(!record||typeof cost_evidence.costs.currency!=='string'||cost_evidence.costs.currency!==record.cost_currency||!same(cost_evidence.calls,observed.provider.calls))throw fail();
  }
  if((reconciling||verified)&&(!this.options.qualificationOriginals||typeof this.options.qualificationOriginals.verify!=='function'))throw fail();
  const qualification=(reconciling||verified)?new LocalNamedSkillMethodAssessment(local.location.repositoryPath,local.location.dataDirectory).verifyHistoricalQualification(original.project,original.descriptor,{method_qualification_ref:custody.originalQualification(original.project,original.invocation,original.request.parent,original.record_id),runtime_binding:original.invocation.runtime_binding,request:original.invocation.request},this.options.qualificationOriginals):undefined;
  const failed=observed.method.method_failure_reverified===true,cancelled=!!collection;
  return {format:verified?(failed?'cimiloop/original-skill-result-failed-verified/1.0.0':'cimiloop/original-skill-result-verified/1.0.0'):cancelled?'cimiloop/original-skill-cancelled-reconciliation/1.0.0':failed?(reconciling?'cimiloop/original-skill-result-failed-reconciliation/1.0.0':billed?'cimiloop/original-skill-result-failed-billed-candidate/1.0.0':'cimiloop/original-skill-result-failed-candidate/1.0.0'):(reconciling?'cimiloop/original-skill-result-reconciliation/1.0.0':billed?'cimiloop/original-skill-result-billed-candidate/1.0.0':'cimiloop/original-skill-result-candidate/1.0.0'),invocation:original.invocation,parent:relation.parent,scope:relation.child,dispatch,plan_digest:requestDigest(plan),method:observed.method,provider:observed.provider,artifacts:observed.artifacts,qualification_reverified:false,model_account_custody_proven:false,costs_reconciled:false,formal_agent_execution_enabled:false,...(cost_evidence?{bills_reverified:true,cost_evidence}:{}),...(qualification?{qualification_reverified_original:qualification}:{}),...(collection?{collection,cancellation_reverified:true,completion_proven:false}:{})};
 }
 capture(invocationId:string):{report:RawSkillInvocationObservation;reference:SkillInvocationObservation['raw_result_ref']}{
  return this.captureOriginal(invocationId,false);
 }
 // Installed historical account only; never reopens admission, sends a model
 // request, records a bill, releases funds or infers execution success.
 captureCosts(invocationId:string):ReturnType<LocalSkillInvocationResultCollection['capture']>{
  return this.captureOriginal(invocationId,true);
 }
 // Trusted direct observation only: exact original method/qualification and final
 // authenticated bills. Earlier Unknown stays Human-owned; no reconciliation
 // identity, execution permission or model send is manufactured here. Saved
 // candidate and Human proof formats retain their independent historical meaning.
 captureVerified(invocationId:string):ReturnType<LocalSkillInvocationResultCollection['capture']>{
  try{const location=structuredClone(this.options.local.location),caller=structuredClone(this.options.local.caller);if(this.unresolved(invocationId).length)throw fail();const result=this.captureOriginal(invocationId,true,undefined,undefined,true);if(!same(location,this.options.local.location)||!same(caller,this.options.local.caller)||this.unresolved(invocationId).length)throw fail();return result;}catch{throw fail();}
 }
 // Human reconciliation is historical; it cannot reopen execution authority.
 captureReconciliation(invocationId:string,producer:string):ReturnType<LocalSkillInvocationResultCollection['capture']>{
  this.human(producer);return this.captureOriginal(invocationId,true,producer);
 }
 // Existing synchronous success/failure capture stays compatible. Cancelled
 // originals need an independent asynchronous OS read of this exact operation.
 async captureHumanReconciliation(invocationId:string,producer:string):Promise<ReturnType<LocalSkillInvocationResultCollection['capture']>>{
  try{return this.captureReconciliation(invocationId,producer);}catch{
   const original=this.original(invocationId),state=this.options.custody.inspect(original.project,original.invocation,original.request.parent,original.record_id);
   if(state.state==='closed')return this.captureNotStartedReconciliation(invocationId,producer);
   return this.captureCancellationReconciliation(invocationId,producer);
  }
 }
 async captureCancellationReconciliation(invocationId:string,producer:string):Promise<ReturnType<LocalSkillInvocationResultCollection['capture']>>{
  try{
   this.human(producer);const local=this.options.local,original=this.original(invocationId),location=structuredClone(local.location),caller=structuredClone(local.caller);
   if(local.store.getRun(original.invocation.run_ref.id)?.cancel_requested!==true)throw fail();
   const relation=this.options.custody.accountScope(original.project,original.invocation,original.request.parent,original.record_id),root=join(local.location.dataDirectory,'skill-runtime-originals',original.project.id,original.invocation.invocation_key);
   const collection=await collectAgentRuntimeOperation(root,relation.child);
   if(!same(location,local.location)||!same(caller,local.caller)||!same(original,this.original(invocationId))||local.store.getRun(original.invocation.run_ref.id)?.cancel_requested!==true)throw fail();this.human(producer);
   return this.captureOriginal(invocationId,true,producer,collection);
  }catch{throw fail();}
 }
 private notStartedFacts(id:string,existingReader=false){
  const {local,custody,inputs,account}=this.options,original=this.original(id,existingReader);
  if(local.store.getRun(original.invocation.run_ref.id)?.cancel_requested!==true||!(account instanceof DedicatedAgentAccountLedger)||!this.options.qualificationOriginals||typeof this.options.qualificationOriginals.verify!=='function')throw fail();
  const plan=inputs.readInvocation(original.project,original.descriptor,original.invocation),state=custody.inspect(original.project,original.invocation,original.request.parent,original.record_id);
  if(state.state!=='closed')throw fail();const relation=custody.accountScope(original.project,original.invocation,original.request.parent,original.record_id),root=join(local.location.dataDirectory,'skill-runtime-originals',original.project.id,original.invocation.invocation_key);
  const zero_costs=account.readOriginalSkillZeroCosts(relation),preparation=readAgentSkillPreparationZeroEffects(root,relation.child,plan),record=local.store.getRuntimeRecord('run_record',original.record_id);
  if(!same(zero_costs.closure,state.closure)||!zero_costs.zero_costs_proven||zero_costs.holds!==0||zero_costs.cash_charged_micros!==0||zero_costs.credit_charged_micro_units!==0||!record||zero_costs.currency!==record.cost_currency||preparation.status!=='Observed'||!preparation.preparation_zero_effects_reverified||preparation.method_calls||preparation.model_calls)throw fail();
  const qualification=new LocalNamedSkillMethodAssessment(local.location.repositoryPath,local.location.dataDirectory).verifyHistoricalQualification(original.project,original.descriptor,{method_qualification_ref:custody.originalQualification(original.project,original.invocation,original.request.parent,original.record_id),runtime_binding:original.invocation.runtime_binding,request:original.invocation.request},this.options.qualificationOriginals);
  const artifacts:Artifact[]=[{name:'dispatch/dispatch.json',path:state.closure.anchor.path,digest:state.closure.anchor.digest.value},...preparation.artifacts.map(a=>({...a,name:'preparation/'+a.name}))];
  if(artifacts.length>40||new Set(artifacts.map(a=>a.name)).size!==artifacts.length)throw fail();
  for(const [i,a]of artifacts.entries()){const rel=relative(resolve(root),resolve(a.path));if(i>0&&(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../'))||digest(bytesAt(a.path,114688)).value!==a.digest)throw fail();}
  const {artifacts:_,...facts}=preparation;
  return {format:'cimiloop/original-skill-not-started-reconciliation/1.0.0',invocation:original.invocation,parent:relation.parent,scope:relation.child,dispatch:state.closure,plan_digest:requestDigest(plan),preparation:facts,zero_costs,qualification_reverified_original:qualification,completion_proven:false,formal_agent_execution_enabled:false,artifacts};
 }
 captureNotStartedReconciliation(invocationId:string,producer:string):ReturnType<LocalSkillInvocationResultCollection['capture']>{
  try{
   this.human(producer);const facts=this.notStartedFacts(invocationId),content=this.options.inputs.packages.content;
   let total=0;const artifacts=facts.artifacts.map(a=>{const bytes=bytesAt(a.path,114688);total+=bytes.length;if(total>3*1024*1024||digest(bytes).value!==a.digest)throw fail();return {...a,reference:content.storeContent(bytes,'provider_probe_artifact')};});
   if(!same(this.notStartedFacts(invocationId),facts))throw fail();const resolves=this.unresolved(invocationId),timeKey=invocationId+':not_started:'+producer+':'+requestDigest(resolves),observed_at=this.times.get(timeKey)??new Date().toISOString();this.times.set(timeKey,observed_at);
   const proof={...facts,observed_at,producer_actor_id:producer,resolves_observation_refs:resolves,artifacts},proofBytes=Buffer.from(JSON.stringify(proof));decode(proofBytes);
   const result_proof_ref=content.storeContent(proofBytes,'skill_invocation_proof'),invocation=facts.invocation;
   const report=compileValidator<RawSkillInvocationObservation>(RawSkillInvocationObservationSchema)({format:'cimiloop/skill-invocation/1.0.0',invocation_ref:{object_type:'skill_invocation',id:invocation.id},invocation_key:invocation.invocation_key,run_ref:invocation.run_ref,run_operation_key:invocation.run_operation_key,producer_actor_id:producer,input_digest:invocation.input_digest,observed_at,basis:'reconciliation',status:'not_started',usage:{cost_known:true,cost_micros:0,currency:facts.zero_costs.currency},result_proof_ref,resolves_observation_refs:resolves});
   const reference=content.storeContent(Buffer.from(JSON.stringify(report)),'skill_invocation_report');this.readNotStartedResult(this.original(invocationId).project,invocation,reference);return {report,reference};
  }catch{throw fail();}
 }
 private readNotStartedResult(project:Project,invocation:SkillInvocation,reference:SkillInvocationObservation['raw_result_ref']):RawSkillInvocationObservation{
  try{
   if(reference.resource_type!=='skill_invocation_report')throw fail();const content=this.options.inputs.packages.content,raw=compileValidator<RawSkillInvocationObservation>(RawSkillInvocationObservationSchema)(decode(content.readContent(reference)));
   this.human(raw.producer_actor_id);if(raw.basis!=='reconciliation'||raw.status!=='not_started'||!raw.usage.cost_known)throw fail();
   const proof=decode(content.readContent(raw.result_proof_ref)) as {artifacts?:Array<Artifact&{reference:ContentReference}>},facts=this.notStartedFacts(invocation.id,true),original=this.original(invocation.id,true);
   if(!same(invocation,facts.invocation)||project.id!==original.project.id||resolve(project.repository_path)!==resolve(original.project.repository_path)||!proof||!Array.isArray(proof.artifacts)||proof.artifacts.length!==facts.artifacts.length)throw fail();
   let total=0;for(const [i,a]of proof.artifacts.entries()){const expected=facts.artifacts[i]!,bytes=bytesAt(expected.path,114688);total+=bytes.length;if(total>3*1024*1024||a.reference.resource_type!=='provider_probe_artifact'||!same(a,{...expected,reference:a.reference})||digest(bytes).value!==expected.digest||!content.readContent(a.reference).equals(bytes))throw fail();}
   const resolves=this.unresolved(invocation.id);
   if(!same(proof,{...facts,observed_at:raw.observed_at,producer_actor_id:raw.producer_actor_id,resolves_observation_refs:resolves,artifacts:proof.artifacts})||!same(this.notStartedFacts(invocation.id,true),facts))throw fail();
   const expected={format:'cimiloop/skill-invocation/1.0.0',invocation_ref:{object_type:'skill_invocation',id:invocation.id},invocation_key:invocation.invocation_key,run_ref:invocation.run_ref,run_operation_key:invocation.run_operation_key,producer_actor_id:raw.producer_actor_id,input_digest:invocation.input_digest,observed_at:raw.observed_at,basis:'reconciliation',status:'not_started',usage:{cost_known:true,cost_micros:0,currency:facts.zero_costs.currency},result_proof_ref:raw.result_proof_ref,resolves_observation_refs:resolves};
   if(!same(raw,expected))throw fail();return raw;
  }catch{throw fail();}
 }
 private human(id:string){const actor=this.options.local.store.getActor(id),project=this.options.local.store.getProject();if(!actor||actor.actor_type!=='human'||actor.project_id!==project?.id)throw fail();}
 private unresolved(id:string){const original=this.original(id,true);return this.options.local.store.listRuntimeRecords('skill_invocation_observation',original.invocation.change_id).filter(o=>o.invocation_ref.id===id&&(o.report.status==='unknown'||!o.report.usage.cost_known||o.applicability==='conflicting')).map(o=>({object_type:'skill_invocation_observation' as const,id:o.id}));}
 private usage(facts:ReturnType<LocalSkillInvocationResultCollection['facts']>):RawSkillInvocationObservation['usage']{
  return facts.cost_evidence?{cost_known:true,cost_micros:facts.cost_evidence.costs.cash_charged_micros,currency:facts.cost_evidence.costs.currency!}:{cost_known:false};
 }
 private captureOriginal(invocationId:string,billed:boolean,producer?:string,collection?:CancellationCollection,verified=false):ReturnType<LocalSkillInvocationResultCollection['capture']>{
  try{
   const reconciling=producer!==undefined,facts=this.facts(invocationId,false,billed,reconciling,collection,verified),content=this.options.inputs.packages.content;let bytes=0;
   const copies=facts.artifacts.map(a=>{const body=bytesAt(a.path,artifactMaximum(a));bytes+=body.length;if(bytes>limitsFor(facts.artifacts).total_bytes||digest(body).value!==a.digest)throw fail();return {...a,reference:content.storeContent(body,'provider_probe_artifact')};});
   if(!same(this.facts(invocationId,false,billed,reconciling,collection,verified),facts))throw fail();
   // Final bills observed later cannot inherit an earlier unknown-fee time.
   const resolves=reconciling?this.unresolved(invocationId):[],timeKey=invocationId+':'+(reconciling?'reconcile:'+producer+':'+requestDigest(resolves):verified?'verified':billed?'billed':'unbilled')+(collection?':cancelled':''),observed_at=this.times.get(timeKey)??new Date().toISOString();this.times.set(timeKey,observed_at);
   const proof={...facts,observed_at,artifacts:copies,...(reconciling?{producer_actor_id:producer,resolves_observation_refs:resolves}:{})},result_proof_ref=content.storeContent(Buffer.from(JSON.stringify(proof)),'skill_invocation_proof'),invocation=facts.invocation;
   const report=compileValidator<RawSkillInvocationObservation>(RawSkillInvocationObservationSchema)({format:'cimiloop/skill-invocation/1.0.0',invocation_ref:{object_type:'skill_invocation',id:invocation.id},invocation_key:invocation.invocation_key,run_ref:invocation.run_ref,run_operation_key:invocation.run_operation_key,producer_actor_id:producer??invocation.executor_ref.id,input_digest:invocation.input_digest,observed_at,basis:reconciling?'reconciliation':'direct_observation',status:(reconciling||verified)?(collection?'cancelled':facts.method.method_failure_reverified?'failed':'succeeded'):'unknown',usage:this.usage(facts),result_proof_ref,resolves_observation_refs:resolves,...((reconciling||verified)&&!collection&&!facts.method.method_failure_reverified?{output:facts.method.output}:{})});
   const reference=content.storeContent(Buffer.from(JSON.stringify(report)),'skill_invocation_report');this.readResult(readOriginalSkillInvocation(this.options.local,invocationId).project,invocation,reference);return {report,reference};
  }catch{throw fail();}
 }
 // No effect or new capture: semantic verification still belongs to readResult.
 // Select fixed originals before callbacks; finish semantic verification before
 // the final pure dependency guard. No installed callback follows that guard.
 readResultOriginalSeal(project:Project,invocation:SkillInvocation,reference:SkillInvocationObservation['raw_result_ref']):SkillResultOriginalSeal{
  const original=this.original(invocation.id,true),root=join(this.options.local.location.dataDirectory,'skill-runtime-originals',project.id,invocation.invocation_key),content=this.options.inputs.packages.content;
  if(!same(original.invocation,invocation)||original.project.id!==project.id||resolve(original.project.repository_path)!==resolve(project.repository_path))throw fail();
  const raw=compileValidator<RawSkillInvocationObservation>(RawSkillInvocationObservationSchema)(decode(LocalEvidenceVerifier.prototype.readContent.call(content,reference))),limits={max_artifacts:SKILL_RESULT_CAPTURE_LIMITS.artifacts+4,max_total_bytes:SKILL_RESULT_CAPTURE_LIMITS.total_bytes+4*65536};
  const before=captureSkillResultOriginalSeal({content,originalRoot:root,reportReference:reference,report:raw,...limits}),boundary=captureSkillResultRuntimeOriginalBoundary({content,originalRoot:root,project,invocation,parent:original.request.parent,recordId:original.record_id});
  const start=this.options.custody.captureOriginalSeal(project,invocation,original.request.parent,original.record_id);
  const report=this.readResult(project,invocation,reference);
  return captureSkillResultOriginalSeal({content,originalRoot:root,reportReference:reference,report,...limits,execution:{boundary,before,start,project,invocation,parent:original.request.parent,recordId:original.record_id}});
 }
 // Read-only history is deliberately independent of current execution authority.
 // A cancelled/Unknown parent can collect its original; it cannot launch again.
 readResult(project:Project,invocation:SkillInvocation,reference:SkillInvocationObservation['raw_result_ref']):RawSkillInvocationObservation{
  try{return withStartCustodyVerifyTurn(()=>{
   if(reference.resource_type!=='skill_invocation_report')throw fail();const content=this.options.inputs.packages.content;
   const raw=compileValidator<RawSkillInvocationObservation>(RawSkillInvocationObservationSchema)(decode(content.readContent(reference)));
   if(raw.status==='not_started')return this.readNotStartedResult(project,invocation,reference);
   const proof=decode(content.readContent(raw.result_proof_ref)) as {format?:unknown;observed_at?:unknown;artifacts?:Array<Artifact&{reference:ContentReference}>;collection?:CancellationCollection};
   const verified=!!proof&&['cimiloop/original-skill-result-verified/1.0.0','cimiloop/original-skill-result-failed-verified/1.0.0'].includes(String(proof.format)),reconciling=raw.basis==='reconciliation';if(reconciling){if(verified||!['succeeded','failed','cancelled'].includes(raw.status)||!raw.usage.cost_known)throw fail();this.human(raw.producer_actor_id);}else if(raw.basis!=='direct_observation'||raw.resolves_observation_refs.length||(verified?!['succeeded','failed'].includes(raw.status)||!raw.usage.cost_known:raw.status!=='unknown'))throw fail();
   const collection=raw.status==='cancelled'?proof.collection:undefined;if(raw.status==='cancelled'&&!collection)throw fail();
   const billed=raw.usage.cost_known,local=this.options.local,identity={caller:structuredClone(local.caller),location:structuredClone(local.location),store:local.store,kernel:local.kernel,custody:this.options.custody,inputs:this.options.inputs,account:this.options.account,qualification:this.options.qualificationOriginals};
   const fixedContent=new LocalEvidenceVerifier(content.repositoryPath,content.dataDirectory);
   Object.freeze(fixedContent);let closeOriginals:()=>void=()=>{throw fail();};
   const originalRoot=join(identity.location.dataDirectory,'skill-runtime-originals',project.id,invocation.invocation_key);
   // Byte retention is not qualification or Runtime approval. Direct verified
   // history also retains namespace membership and physical originals before
   // callbacks; semantic verification and final account cuts remain mandatory.
   const retained=verified&&!reconciling?rememberOriginalIdentity(['skill-result-seal',resolve(originalRoot),reference.locator,raw.result_proof_ref.locator].join('\0'),()=>captureSkillResultOriginalSeal({content:fixedContent,originalRoot,reportReference:reference,report:raw,max_artifacts:SKILL_RESULT_CAPTURE_LIMITS.artifacts+4,max_total_bytes:SKILL_RESULT_CAPTURE_LIMITS.total_bytes+4*65536})):undefined;
   // Both Known direct and Human terminal results bind execution originals
   // before any installed callbacks, including the account scope callback.
   // Existing Unknown candidates gain no qualification. NotStarted is separate.
   const runtimeOriginal=verified||reconciling?this.original(invocation.id,true):undefined;
   const runtimeOptions=runtimeOriginal?{content:fixedContent,originalRoot,project,invocation,parent:runtimeOriginal.request.parent,recordId:runtimeOriginal.record_id}:undefined;
   const runtimeBoundary=runtimeOptions?rememberOriginalIdentity(['skill-result-boundary',resolve(originalRoot),invocation.id,runtimeOptions.recordId].join('\0'),()=>captureSkillResultRuntimeOriginalBoundary(runtimeOptions)):undefined;
   // Host callbacks during capture precede the fresh cost window; the retained
   // byte/Runtime boundary prevents them from selecting changed originals.
   const startOriginal=runtimeOptions?captureStartOriginal.call(identity.custody,project,invocation,runtimeOptions.parent,runtimeOptions.recordId):undefined;
   const read=(readCosts:OriginalDedicatedAgentRunCostReader=readOriginalDedicatedAgentRunCosts)=>{
   const facts=this.facts(invocation.id,true,billed,reconciling,collection,verified,readCosts),original=this.original(invocation.id,true);
   if(!same(invocation,facts.invocation)||project.id!==original.project.id||resolve(project.repository_path)!==resolve(original.project.repository_path))throw fail();
   if(!proof||typeof proof!=='object'||!Array.isArray(proof.artifacts)||proof.artifacts.length!==facts.artifacts.length)throw fail();
   let total=0;for(const [i,a] of proof.artifacts.entries()){
    const expected=facts.artifacts[i]!,body=bytesAt(expected.path,artifactMaximum(expected));total+=body.length;
    if(total>limitsFor(facts.artifacts).total_bytes||a.reference.resource_type!=='provider_probe_artifact'||!same(a,{...expected,reference:a.reference})||digest(body).value!==expected.digest||!content.readContent(a.reference).equals(body))throw fail();
   }
   const resolves=reconciling?this.unresolved(invocation.id):[];
   if(!same(proof,{...facts,observed_at:raw.observed_at,artifacts:proof.artifacts,...(reconciling?{producer_actor_id:raw.producer_actor_id,resolves_observation_refs:resolves}:{})})||!same(this.facts(invocation.id,true,billed,reconciling,collection,verified,readCosts),facts))throw fail();
   const expected={format:'cimiloop/skill-invocation/1.0.0',invocation_ref:{object_type:'skill_invocation',id:invocation.id},invocation_key:invocation.invocation_key,run_ref:invocation.run_ref,run_operation_key:invocation.run_operation_key,producer_actor_id:reconciling?raw.producer_actor_id:invocation.executor_ref.id,input_digest:invocation.input_digest,observed_at:raw.observed_at,basis:reconciling?'reconciliation':'direct_observation',status:(reconciling||verified)?(collection?'cancelled':facts.method.method_failure_reverified?'failed':'succeeded'):'unknown',usage:this.usage(facts),result_proof_ref:raw.result_proof_ref,resolves_observation_refs:resolves,...((reconciling||verified)&&!collection&&!facts.method.method_failure_reverified?{output:facts.method.output}:{})};
   if(!same(raw,expected))throw fail();
   const captured=structuredClone(proof.artifacts),root=resolve(join(identity.location.dataDirectory,'skill-runtime-originals',project.id,invocation.invocation_key)),reportBytes=readOriginalContent.call(fixedContent,reference),proofBytes=readOriginalContent.call(fixedContent,raw.result_proof_ref);
   closeOriginals=()=>{
    // Fixed data readers only: all installed callbacks have already completed.
    if(this.options.local!==local||local.store!==identity.store||local.kernel!==identity.kernel||!same(local.caller,identity.caller)||!same(local.location,identity.location)||this.options.custody!==identity.custody||this.options.inputs!==identity.inputs||this.options.account!==identity.account||this.options.qualificationOriginals!==identity.qualification)throw fail();
    if(retained)assertSkillResultOriginalSeal(retained,raw,reference);
    if(!readOriginalContent.call(fixedContent,reference).equals(reportBytes)||!readOriginalContent.call(fixedContent,raw.result_proof_ref).equals(proofBytes))throw fail();
    for(const a of captured){const path=resolve(a.path),rel=relative(root,path);if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../'))throw fail();const body=bytesAt(path,artifactMaximum(a));if(digest(body).value!==a.digest||!readOriginalContent.call(fixedContent,a.reference).equals(body))throw fail();}
    if(startOriginal&&runtimeOptions)assertSkillInvocationStartOriginalSeal(startOriginal,project,invocation,runtimeOptions.parent,runtimeOptions.recordId);
    if(runtimeBoundary&&runtimeOptions)assertSkillResultRuntimeOriginalBoundary(runtimeBoundary,runtimeOptions);
   };
   return raw;
   };
   if(!billed){const value=read();closeOriginals();return value;}
   const original=this.original(invocation.id,true),account=this.options.account;if(!(account instanceof DedicatedAgentAccountLedger))throw fail();
   const relation=this.options.custody.accountScope(original.project,original.invocation,original.request.parent,original.record_id),root=join(identity.location.dataDirectory,'skill-runtime-originals',original.project.id,original.invocation.invocation_key);
   return withOriginalDedicatedAgentRunCostRead(root,relation.child,account,read,()=>closeOriginals());
  });}catch{throw fail();}
 }
}
