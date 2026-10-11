import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { compileValidator, SkillInvocationSchema, type SkillInvocation, type ProviderDescriptor } from '@cimiloop/protocol/v2';
import { requestDigest, type SkillInvocationExecutionAssessment, type SkillInvocationExecutionRequest, type CallerContext } from '@cimiloop/kernel';
import {LocalSkillInvocationStartCustody} from './skill-invocation-start-custody-local.js';
import { originalAgentWorkspaceScope } from './agent-workspace-tools-local.js';
import { LocalProjectError } from './errors.js';
import type { LocalProject } from './project.js';
import type { LocalSkillMethodInputs, LocalSkillMethodPlan } from './skill-methods-local.js';
export type SkillInvocationExecutionContext = Pick<LocalProject,'location'> & {
 caller: Extract<CallerContext,{kind:'agent'}>;
 store:LocalProject['store']; kernel:Pick<LocalProject['kernel'],'assessSkillInvocationExecution'>;
};
export interface SkillInvocationExecutionInputs {
 request:SkillInvocationExecutionRequest; invocation:SkillInvocation; descriptor:ProviderDescriptor;
 plan:LocalSkillMethodPlan; authority:NonNullable<SkillInvocationExecutionAssessment['authority']>;
}
export interface SkillInvocationExecutionPort {
 custody:LocalSkillInvocationStartCustody;
 inputs?:Pick<LocalSkillMethodInputs,'readInvocation'>;
 // Trusted code installation only. Staging must not launch Native, call a
 // model/tool or charge. launch must use the same original child identity and
 // invoke beforeEffect before EVERY Native/SDK/model/tool effect, including
 // deferred callbacks. It must mount the complete qualified account/budget,
 // physical enforcement and original runtime custody; no default is installed.
 // Failed staging owns its resources; a returned lease is disposed once here.
 prepare?: (input:SkillInvocationExecutionInputs,beforeEffect:()=>void)=>Promise<{launch():Promise<void>;dispose():Promise<void>|void}>;
}
export interface SkillInvocationExecutionResult {
 ok:true; run_id:string; invocation_id:string; invocation_key:string;
 outcome:'original'|'unknown'; completion_proven:false; ticket_id:string;
}
const fail=()=>new LocalProjectError('原 Skill 调用执行范围、宿主或当前准入不可证明','CAPABILITY_UNAVAILABLE','conflict');
// Shared application service: only Kernel reserves/observes/settles business
// state. A dispatch or successful launch acknowledgement is not a domain result
// or a bill. No parent Run id/context is manufactured for the child operation.
export function readOriginalSkillInvocation(local:SkillInvocationExecutionContext,invocationId:string) {
  try {return local.store.readSnapshot(reader=>readOriginalSkillInvocationFromReader(local,reader,invocationId)).value;}catch{throw fail();}
}
type OriginalReader=Pick<SkillInvocationExecutionContext['store'],'getProject'|'getActor'|'getRun'|'getRuntimeRecord'|'getProviderBinding'|'getProviderDescriptor'|'getExecutionObject'|'getVerificationRecord'>;
// Kernel's result verifier already runs inside its writer snapshot. Reuse that
// reader instead of opening/committing/rolling back a nested SQLite transaction.
export function readOriginalSkillInvocationFromReader(local:Pick<SkillInvocationExecutionContext,'caller'|'location'>,reader:OriginalReader,invocationId:string){
  try {
   const invocation=structuredClone(compileValidator<SkillInvocation>(SkillInvocationSchema)(reader.getRuntimeRecord('skill_invocation',invocationId)));
   if(requestDigest((({input_digest:_,...body})=>body)(invocation))!==invocation.input_digest.value)throw fail();
   const parent=originalAgentWorkspaceScope({location:local.location,caller:local.caller,store:reader},invocation.run_ref.id);
   const project=reader.getProject(), binding=reader.getProviderBinding(invocation.skill_binding.binding_ref.id), descriptor=binding&&reader.getProviderDescriptor(binding.descriptor_ref.id);
   if(!project||resolve(project.repository_path)!==resolve(local.location.repositoryPath)||invocation.project_id!==project.id||!descriptor||descriptor.project_id!==project.id||
    invocation.run_operation_key!==parent.operation_key||invocation.executor_ref.id!==parent.executor_actor_id||
    !isDeepStrictEqual(invocation.runtime_binding,parent.runtime_binding)||!isDeepStrictEqual(invocation.host_admission_ref,parent.host_admission_ref)||!parent.skill_bindings.some(pin=>isDeepStrictEqual(pin,invocation.skill_binding)))throw fail();
   const record_id=reader.getRun(invocation.run_ref.id)!.record_ref.id;
   return {project,invocation,descriptor,record_id,request:{parent,invocation_ref:{object_type:'skill_invocation' as const,id:invocation.id},input_digest:invocation.input_digest},id:requestDigest({project_id:project.id,invocation_key:invocation.invocation_key})};
  } catch { throw fail(); }
 }

export class LocalSkillInvocationExecution {
 constructor(private readonly local:SkillInvocationExecutionContext,private readonly port?:SkillInvocationExecutionPort|null) {}
 private original(invocationId:string) {return readOriginalSkillInvocation(this.local,invocationId);}
 private installed():SkillInvocationExecutionPort {
  if(!this.port||!(this.port.custody instanceof LocalSkillInvocationStartCustody))throw fail();
  return this.port;
 }
 private read(original:ReturnType<LocalSkillInvocationExecution['original']>,port:SkillInvocationExecutionPort):SkillInvocationExecutionResult|undefined {
  const state=port.custody.inspect(original.project,original.invocation,original.request.parent,original.record_id);
  if(state.state==='unclaimed')return undefined;
  return {ok:true,run_id:original.invocation.run_ref.id,invocation_id:original.invocation.id,invocation_key:original.invocation.invocation_key,
   outcome:state.state==='returned'?'original':'unknown',completion_proven:false,ticket_id:state.ticket.ticket_id};
 }
 // Read-only recovery of an already dispatched original. It never reopens the
 // factory or restores effect permission after cancellation/settlement.
 query(invocationId:string):SkillInvocationExecutionResult|undefined {
  try { const original=this.original(invocationId);return this.read(original,this.installed()); } catch { throw fail(); }
 }
 async start(invocationId:string):Promise<SkillInvocationExecutionResult> {
  try { return await this.startOriginal(invocationId); } catch { throw fail(); }
 }
 private async startOriginal(invocationId:string):Promise<SkillInvocationExecutionResult> {
  const original=this.original(invocationId),port=this.installed();
  let prior:SkillInvocationExecutionResult|undefined;try { prior=this.read(original,port); } catch { throw fail(); }
  if(prior)return prior;
  const readInvocation=port.inputs?.readInvocation?.bind(port.inputs),prepare=port.prepare?.bind(port);
  if(!readInvocation||!prepare)throw fail();
  const guard=()=>{
   const current=this.original(invocationId);if(!isDeepStrictEqual(current,original))throw fail();
   const assessment=this.local.kernel.assessSkillInvocationExecution(structuredClone(original.request));
   if(!('scope' in assessment)||assessment.scope!=='skill_invocation_execution_assessment'||assessment.decision!=='ALLOW'||!assessment.authority||
    !isDeepStrictEqual(assessment.request,original.request)||assessment.authority.invocation_id!==original.invocation.id||assessment.authority.invocation_key!==original.invocation.invocation_key||
    !isDeepStrictEqual(assessment.authority.input_digest,original.invocation.input_digest))throw fail();
   return structuredClone(assessment.authority);
  };
  const authority=guard();let plan:LocalSkillMethodPlan;
  try { plan=structuredClone(readInvocation(structuredClone(original.project),structuredClone(original.descriptor),structuredClone(original.invocation))); }
  catch { throw fail(); }
  const planDigest=requestDigest(plan);guard();
  let lease:Awaited<ReturnType<NonNullable<SkillInvocationExecutionPort['prepare']>>>;
  try { lease=await prepare({request:structuredClone(original.request),invocation:structuredClone(original.invocation),descriptor:structuredClone(original.descriptor),plan:structuredClone(plan),authority},()=>{guard();}); }
  catch { try { guard(); } catch { throw fail(); } throw fail(); }
  let release:(()=>Promise<void>|void)|undefined;
  try {
   if(!lease||typeof lease.dispose!=='function')throw fail();release=lease.dispose.bind(lease);
   if(typeof lease.launch!=='function')throw fail();const dispatch=lease.launch.bind(lease);
   guard();
   const fresh=readInvocation(structuredClone(original.project),structuredClone(original.descriptor),structuredClone(original.invocation));
   if(requestDigest(fresh)!==planDigest)throw fail();guard();
   // The protected format1 writer transaction elects one winner. Losing
   // dispatchers dispose their staged resources and only read the old claim.
   const claim=port.custody.claim(original.project,original.invocation,original.request.parent,original.record_id,planDigest,()=>{guard();});
   if(!claim.created)return this.read(original,port)!;
   try {
    guard();await dispatch();
    port.custody.markReturned(original.project,original.invocation,original.request.parent,original.record_id);
   } catch { return {ok:true,run_id:original.invocation.run_ref.id,invocation_id:original.invocation.id,invocation_key:original.invocation.invocation_key,outcome:'unknown',completion_proven:false,ticket_id:claim.ticket.ticket_id}; }
   return this.read(original,port)!;
  } catch { throw fail(); }
  finally { if(release) { try { await release(); } catch { throw fail(); } } }
 }
}
