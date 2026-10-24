import { isDeepStrictEqual as same } from 'node:util';
import { AgentStartLedger, CodexAgentUsageBudget, assertAgentStartOriginalTicketSeal, readCodexAgentRunFamilyUsage, readCodexAgentRunUsage } from '@cimiloop/runtime-adapter';
import type { LocalProject } from './project.js';
import { readHumanOriginalAgentRunInputs } from './agent-runtime-control-local.js';
import { readOriginalAgentRunInputs } from './agent-workspace-tools-local.js';
import { readOriginalSkillInvocationMetadataFromReader } from './skill-invocation-execution-local.js';
import { LocalSkillInvocationStartCustody } from './skill-invocation-start-custody-local.js';

const fail=():never=>{throw Error('Original Codex Run family unavailable');};
// Query only. Enumerate every actual Kernel invocation in one reader snapshot,
// prove its original protected birth, then join its exact account/model bytes.
// No current Skill admission, model factory, bill or domain result is invented.
export function readOriginalLocalCodexRunUsage(local:LocalProject,runId:string,budget:CodexAgentUsageBudget,origin:AgentStartLedger){
 if(!(budget instanceof CodexAgentUsageBudget)||!(origin instanceof AgentStartLedger))fail();
 const original=readHumanOriginalAgentRunInputs(local,runId),custody=new LocalSkillInvocationStartCustody(local.location.repositoryPath,local.location.dataDirectory,origin);
 return local.store.readSnapshot(reader=>{
  const read=()=>{
   const current=readOriginalAgentRunInputs({location:local.location,store:reader},runId);if(!same(current.scope,original.scope))fail();
   const invocations=reader.listRuntimeRecords('skill_invocation',original.run.change_id).filter(invocation=>invocation.run_ref.id===runId).sort((a,b)=>a.invocation_key.localeCompare(b.invocation_key));
   if(invocations.length>64||new Set(invocations.map(invocation=>invocation.invocation_key)).size!==invocations.length||new Set(invocations.map(invocation=>invocation.id)).size!==invocations.length)fail();
   const relations=invocations.map(invocation=>{const metadata=readOriginalSkillInvocationMetadataFromReader({location:local.location},reader,invocation.id);if(!same(metadata.invocation,invocation)||!same(metadata.request.parent,original.scope)||metadata.record_id!==original.record.id)fail();return custody.accountScope(metadata.project,invocation,original.scope,metadata.record_id);});
   return{invocations,relations};
  };
  const before=read(),tickets=before.relations.map(relation=>relation.admission_ticket),seal=tickets.length?origin.captureOriginalTickets(tickets):undefined;
  const usage=before.relations.length?readCodexAgentRunFamilyUsage(local.location.dataDirectory,original.scope,budget,before.relations.map(relation=>relation.child)):readCodexAgentRunUsage(local.location.dataDirectory,original.scope,budget);
  if(!same(before,read()))fail();if(seal)assertAgentStartOriginalTicketSeal(seal,tickets);
  return usage;
 }).value;
}
