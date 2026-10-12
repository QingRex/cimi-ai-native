import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { DedicatedAgentAccountLedger, parseAgentWorkspaceToolScope, parseDedicatedAgentSkillAccountScope, readOriginalDedicatedAgentRunCosts, readOriginalDedicatedAgentRunFamilyCosts, readOriginalReconciledAgentRunFamilyCosts, type ReconciledAgentRunFamilyChild, type DedicatedAgentSkillScope, type AgentWorkspaceToolScope } from '@cimiloop/runtime-adapter';
import{skillInvocationState,type SkillInvocationVerifierPort,requestDigest}from'@cimiloop/kernel';
import{compileValidator,RawSkillInvocationObservationSchema,type RawSkillInvocationObservation,type Project,type SkillInvocation}from'@cimiloop/protocol/v2';
import type{LocalSkillMethodInputs}from'./skill-methods-local.js';
import type { LocalProject } from './project.js';
import { readOriginalAgentRunInputs } from './agent-workspace-tools-local.js';
import { readOriginalSkillInvocationFromReader } from './skill-invocation-execution-local.js';
import { readOriginalSkillStartAdmission } from './skill-invocation-start-custody-local.js';

export type LocalAgentRunFamilyReader = Pick<LocalProject['store'], 'getProject'|'getActor'|'getRun'|'getRuntimeRecord'|'getProviderBinding'|'getProviderDescriptor'|'getExecutionObject'|'getVerificationRecord'|'listRuntimeRecords'>;
export interface LocalAgentRunFamilyVerification extends Pick<SkillInvocationVerifierPort,'readResult'>{
 readPreparation(project:Project,invocation:SkillInvocation):{relation:DedicatedAgentSkillScope;inputs:ReturnType<LocalSkillMethodInputs['readInvocation']>};
}
const fail=():never=>{throw Error('Original Kernel/account Run family unavailable');};
// Metadata only. No Agent execution authority, factory or nested transaction is
// installed here; Kernel supplies the current writer-snapshot reader.
export function readOriginalLocalAgentRunCosts(repositoryPath:string,dataDirectory:string,rawScope:AgentWorkspaceToolScope,account:DedicatedAgentAccountLedger,reader?:LocalAgentRunFamilyReader,familySkills?:LocalAgentRunFamilyVerification) {
 const scope=parseAgentWorkspaceToolScope(rawScope);
 if(!(account instanceof DedicatedAgentAccountLedger)||!reader||['getProject','getActor','getRun','getRuntimeRecord','getProviderBinding','getProviderDescriptor','getExecutionObject','getVerificationRecord','listRuntimeRecords'].some(key=>typeof Reflect.get(reader,key)!=='function'))fail();
 const current=reader!;
 const location:LocalProject['location']={repositoryKind:'git',repositoryPath,dataDirectory,databasePath:join(dataDirectory,'project.db'),instancePath:join(dataDirectory,'instance.json'),suggestedName:'Original family metadata'};
 if(familySkills){
  if(typeof familySkills.readResult!=='function'||typeof familySkills.readPreparation!=='function')fail();
  const synchronous=<T>(value:T):T=>{if(value&&typeof value==='object'&&'then'in value){void Promise.resolve(value).catch(()=>undefined);fail();}return value;};
  const read=()=>{
   const original=readOriginalAgentRunInputs({location,store:current},scope.run_id);if(!isDeepStrictEqual(original.scope,scope))fail();
   const invocations=current.listRuntimeRecords('skill_invocation',original.run.change_id).filter(i=>i.run_ref.id===scope.run_id).sort((a,b)=>a.invocation_key.localeCompare(b.invocation_key)),observations=current.listRuntimeRecords('skill_invocation_observation',original.run.change_id);
   if(invocations.length>64||new Set(invocations.map(i=>i.id)).size!==invocations.length||new Set(invocations.map(i=>i.invocation_key)).size!==invocations.length)fail();
   const caller={kind:'agent' as const,project_id:original.project.id,actor_id:original.actor.id,provider_identity_ref:original.actor.provider_identity_ref};
   const child_results:{invocation_id:string;observation_id:string;raw_result_ref:import('@cimiloop/protocol/v2').SkillInvocationObservation['raw_result_ref'];report_digest:string;status:RawSkillInvocationObservation['status'];usage:RawSkillInvocationObservation['usage']}[]=[],children:ReconciledAgentRunFamilyChild[]=invocations.map(invocation=>{
    const input=readOriginalSkillInvocationFromReader({location,caller},current,invocation.id),state=skillInvocationState(observations.filter(o=>o.invocation_ref.id===invocation.id));
    if(!isDeepStrictEqual(invocation,input.invocation)||!isDeepStrictEqual(input.request.parent,scope)||input.record_id!==original.record.id||!state.settled||!state.latest)fail();
    const latest=state.latest!,report=compileValidator<RawSkillInvocationObservation>(RawSkillInvocationObservationSchema)(synchronous(familySkills.readResult(original.project,invocation,latest.raw_result_ref)));
    if(!isDeepStrictEqual(report,latest.report)||!report.usage.cost_known||state.costMicros!==report.usage.cost_micros||report.usage.currency!==original.record.cost_currency||report.invocation_ref.id!==invocation.id||report.invocation_key!==invocation.invocation_key||report.run_ref.id!==scope.run_id||report.run_operation_key!==scope.operation_key||!isDeepStrictEqual(report.input_digest,invocation.input_digest)||!['succeeded','failed','cancelled','not_started'].includes(report.status))fail();
    const preparation=synchronous(familySkills.readPreparation(original.project,invocation)),child=parseDedicatedAgentSkillAccountScope({...scope,operation_key:invocation.invocation_key,context_digest:invocation.input_digest});
    if(!isDeepStrictEqual(preparation.relation.parent,scope)||!isDeepStrictEqual(preparation.relation.child,child)||preparation.relation.invocation_id!==invocation.id||!isDeepStrictEqual(preparation.inputs.request,invocation.request)||!isDeepStrictEqual(preparation.inputs.input_ref,invocation.input_ref))fail();
    const admission=readOriginalSkillStartAdmission(repositoryPath,dataDirectory,original.project,invocation,scope,original.record.id,account.readOriginalSkillBirth(preparation.relation));if(!isDeepStrictEqual(admission.ticket,preparation.relation.admission_ticket))fail();
    child_results.push({invocation_id:invocation.id,observation_id:latest.id,raw_result_ref:latest.raw_result_ref,report_digest:requestDigest(report),status:report.status,usage:report.usage});
    const root=join(dataDirectory,'skill-runtime-originals',original.project.id,invocation.invocation_key);
    if(report.status==='not_started'){
     if(original.run.cancel_requested!==true||report.basis!=='reconciliation'||!report.usage.cost_known||report.usage.cost_micros!==0||'output'in report)fail();
     return{state:'not_started',root,relation:preparation.relation,inputs:preparation.inputs};
    }
    return{state:'executed',root,relation:preparation.relation};
   });
   return{original,invocations,children,child_results};
  };
  const before=read(),costs=readOriginalReconciledAgentRunFamilyCosts(dataDirectory,scope,account,before.children);
  for(const child of before.children){
   const selected=costs.costs.scopes.filter(s=>isDeepStrictEqual(s.scope,child.relation.child)),reports=before.child_results.filter(r=>r.invocation_id===child.relation.invocation_id);
   if(selected.length!==1||reports.length!==1)fail();const usage=reports[0]!.usage;
   if(!usage.cost_known||usage.currency!==costs.costs.currency||usage.cost_micros!==selected[0]!.cash_charged_micros)fail();
  }
  if(!isDeepStrictEqual(before,read()))fail();return{...costs,child_results:before.child_results};
 }
 const read=()=>{
  const original=readOriginalAgentRunInputs({location,store:current},scope.run_id);
  if(!isDeepStrictEqual(original.scope,scope))fail();
  const invocations=current.listRuntimeRecords('skill_invocation',original.run.change_id).filter(value=>value.run_ref.id===scope.run_id).sort((a,b)=>a.invocation_key.localeCompare(b.invocation_key));
  if(invocations.length>64||new Set(invocations.map(value=>value.id)).size!==invocations.length||new Set(invocations.map(value=>value.invocation_key)).size!==invocations.length)fail();
  const registrations=account.readOriginalSkillScopes(scope);
  if(registrations.length!==invocations.length)fail();
  const caller={kind:'agent' as const,project_id:original.project.id,actor_id:original.actor.id,provider_identity_ref:original.actor.provider_identity_ref};
  const children=invocations.map(value=>{
   const input=readOriginalSkillInvocationFromReader({location,caller},current,value.id),invocation=input.invocation;
   if(!isDeepStrictEqual(invocation,value)||!isDeepStrictEqual(input.request.parent,scope)||input.record_id!==original.record.id)fail();
   const child=parseDedicatedAgentSkillAccountScope({...scope,operation_key:invocation.invocation_key,context_digest:invocation.input_digest});
   const registered=registrations.find(entry=>entry.relation.invocation_id===invocation.id);
   if(!registered)throw Error('Original child account registration missing');
   if(!isDeepStrictEqual(registered.relation.parent,scope)||!isDeepStrictEqual(registered.relation.child,child))fail();
   const admission=readOriginalSkillStartAdmission(repositoryPath,dataDirectory,input.project,invocation,scope,input.record_id,registered.admission);
   if(!isDeepStrictEqual(admission.ticket,registered.relation.admission_ticket))fail();
   return {root:join(dataDirectory,'skill-runtime-originals',original.project.id,invocation.invocation_key),scope:child};
  });
  return {original,invocations,registrations,children};
 };
 const before=read();
 const costs=before.children.length===0?readOriginalDedicatedAgentRunCosts(dataDirectory,scope,account):readOriginalDedicatedAgentRunFamilyCosts(dataDirectory,scope,account,before.children);
 if(!isDeepStrictEqual(before,read()))fail();
 return costs;
}
