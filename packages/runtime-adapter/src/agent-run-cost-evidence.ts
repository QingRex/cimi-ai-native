import{isDeepStrictEqual}from'node:util';
import{DedicatedAgentAccountLedger}from'./agent-dedicated-account.js';
import{readDedicatedAgentModelOriginals}from'./agent-dedicated-model.js';
import{parseAgentWorkspaceToolScope}from'./agent-workspace-authority.js';
import{RuntimeAdapterError}from'./files.js';
// Historical read only. Code-installed bill authentication, not JSON/usage.
export function readOriginalDedicatedAgentRunCosts(root:string,rawScope:unknown,account:DedicatedAgentAccountLedger){
 const deny=():never=>{throw new RuntimeAdapterError('agent_run_cost_originals_unproven');};
 if(!(account instanceof DedicatedAgentAccountLedger))deny();
 const scope=parseAgentWorkspaceToolScope(rawScope),original=readDedicatedAgentModelOriginals(root,scope),s=original.summary,costs=account.readRunCosts(scope);
 if(s.status!=='Observed'||!s.original_requirement_pinned||!s.budget_identity_pinned||!s.calls||s.unresolved||s.admission_digest!==account.admission_digest||!isDeepStrictEqual(s.profile,account.profile)||
  !costs.costs_reconciled||costs.unresolved||costs.holds!==original.calls.length||costs.holds!==s.calls||!costs.bill_originals.length)deny();
 for(const call of original.calls){const hold=account.readOriginalHold(scope,call.call_id);
  if(call.state!=='reply_recorded'||!call.provider_response_id||!hold||!isDeepStrictEqual(hold,call.hold)||hold.account_digest!==costs.account_digest||hold.connection_digest!==s.connection_digest||hold.admission_digest!==s.admission_digest||hold.request_id!==call.request_id||hold.request_digest!==call.request_digest)deny();
 }
 // Independent snapshots cannot splice a newer account into an older spine.
 if(!isDeepStrictEqual(original,readDedicatedAgentModelOriginals(root,scope))||!isDeepStrictEqual(costs,account.readRunCosts(scope)))deny();
 return{format:'cimiloop/agent-run-cost-evidence/1.0.0' as const,scope,model:original.summary,calls:original.calls,costs,starts_run:false as const,kernel_costs_reconciled:false as const};
}
