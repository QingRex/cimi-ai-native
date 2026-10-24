import { isDeepStrictEqual as same } from 'node:util';
import { join } from 'node:path';
import { parseAgentWorkspaceToolScope, type AgentWorkspaceToolScope } from './agent-workspace-authority.js';
import { CodexAgentUsageBudget } from './codex-agent-usage-budget.js';
import { readCodexAgentScopeUsage } from './agent-codex-model.js';
import { digest, RuntimeAdapterError } from './files.js';

const fail=():never=>{throw new RuntimeAdapterError('codex_run_family_usage_unproven');};
// Trusted read composition. Children come from the original Kernel + protected
// start ledger, never a request parameter. This helper authenticates accounting
// bytes, not the child's permission, domain result, invoice or execution grant.
export function readCodexAgentRunFamilyUsage(root:string,rawParent:unknown,budget:CodexAgentUsageBudget,rawChildren:AgentWorkspaceToolScope[]){
 const parent=parseAgentWorkspaceToolScope(rawParent);
 if(!(budget instanceof CodexAgentUsageBudget)||!Array.isArray(rawChildren)||rawChildren.length>64)fail();
 const children=rawChildren.map(parseAgentWorkspaceToolScope).sort((a,b)=>a.operation_key.localeCompare(b.operation_key));
 if(new Set(children.map(child=>child.operation_key)).size!==children.length||children.some(child=>child.operation_key===parent.operation_key||!same({...child,operation_key:parent.operation_key,context_digest:parent.context_digest},parent)))fail();
 const family=[parent,...children],before=budget.snapshot();
 const read=()=>family.map((scope,index)=>({operation_key:scope.operation_key,scope_digest:digest(JSON.stringify(scope)).value,usage:readCodexAgentScopeUsage(index?join(root,'skill-runtime-originals',parent.project_id,scope.operation_key):root,scope,budget,family,true)}));
 const scopes=read();
 // Re-read every original after the last retained-model/account callback. No
 // preceding parent slice may silently omit a later child or account hold.
 if(!same(before,budget.snapshot())||!same(scopes,read())||!same(before,budget.snapshot()))fail();
 const observed=scopes.flatMap(scope=>scope.usage.observed_tokens?[scope.usage.observed_tokens]:[]);
 const observed_tokens=observed.length?observed.reduce((sum,usage)=>{for(const name of Object.keys(sum) as (keyof typeof sum)[]){sum[name]+=usage[name];if(!Number.isSafeInteger(sum[name]))fail();}return sum;},{inputTokens:0,cachedInputTokens:0,outputTokens:0,totalTokens:0,reasoningOutputTokens:0,cacheWriteInputTokens:0}):null;
 const usage_complete=scopes.every(scope=>scope.usage.usage_complete);
 return{format:'cimiloop/codex-run-family-usage/1.0.0' as const,coverage:'original_run_family' as const,scope_digest:digest(JSON.stringify(parent)).value,policy_digest:before.policy_digest,state:usage_complete?'observed' as const:'unknown' as const,scopes,holds:scopes.reduce((n,scope)=>n+scope.usage.holds,0),held_output_tokens:scopes.reduce((n,scope)=>n+scope.usage.held_output_tokens,0),unresolved:scopes.reduce((n,scope)=>n+scope.usage.unresolved,0),observed_tokens,usage_complete,cost_known:false as const,cash_charged_micros:null,credit_charged_micro_units:null,costs_reconciled:false as const,run_family_costs_reconciled:false as const,provider_quota_reserved:false as const};
}
