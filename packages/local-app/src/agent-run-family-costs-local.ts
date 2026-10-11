import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { DedicatedAgentAccountLedger, parseAgentWorkspaceToolScope, parseDedicatedAgentSkillAccountScope, readOriginalDedicatedAgentRunCosts, readOriginalDedicatedAgentRunFamilyCosts, type AgentWorkspaceToolScope } from '@cimiloop/runtime-adapter';
import type { LocalProject } from './project.js';
import { readOriginalAgentRunInputs } from './agent-workspace-tools-local.js';
import { readOriginalSkillInvocationFromReader } from './skill-invocation-execution-local.js';
import { readOriginalSkillStartAdmission } from './skill-invocation-start-custody-local.js';

export type LocalAgentRunFamilyReader = Pick<LocalProject['store'], 'getProject'|'getActor'|'getRun'|'getRuntimeRecord'|'getProviderBinding'|'getProviderDescriptor'|'getExecutionObject'|'getVerificationRecord'|'listRuntimeRecords'>;
const fail=():never=>{throw Error('Original Kernel/account Run family unavailable');};
// Metadata only. No Agent execution authority, factory or nested transaction is
// installed here; Kernel supplies the current writer-snapshot reader.
export function readOriginalLocalAgentRunCosts(repositoryPath:string,dataDirectory:string,rawScope:AgentWorkspaceToolScope,account:DedicatedAgentAccountLedger,reader?:LocalAgentRunFamilyReader) {
 const scope=parseAgentWorkspaceToolScope(rawScope);
 if(!(account instanceof DedicatedAgentAccountLedger)||!reader||['getProject','getActor','getRun','getRuntimeRecord','getProviderBinding','getProviderDescriptor','getExecutionObject','getVerificationRecord','listRuntimeRecords'].some(key=>typeof Reflect.get(reader,key)!=='function'))fail();
 const current=reader!;
 const location:LocalProject['location']={repositoryKind:'git',repositoryPath,dataDirectory,databasePath:join(dataDirectory,'project.db'),instancePath:join(dataDirectory,'instance.json'),suggestedName:'Original family metadata'};
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
