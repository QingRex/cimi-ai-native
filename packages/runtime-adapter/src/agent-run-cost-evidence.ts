import{isDeepStrictEqual}from'node:util';
import{DedicatedAgentAccountLedger}from'./agent-dedicated-account.js';
import{readDedicatedAgentModelOriginals}from'./agent-dedicated-model.js';
import{parseAgentWorkspaceToolScope,type AgentWorkspaceToolScope}from'./agent-workspace-authority.js';
import{RuntimeAdapterError,digest}from'./files.js';
import{join,resolve}from'node:path';
import type{DedicatedAgentSkillScope}from'./agent-skill-account-scope.js';
import type{AgentNamedMethodResultInputs}from'./agent-named-method-result.js';
import{readAgentSkillPreparationZeroEffects}from'./agent-skill-zero-effects.js';
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

// The complete immutable registration set is compared by the original account.
// Roots are trusted code inputs; persisted fee JSON never chooses an original.
export function readOriginalDedicatedAgentRunFamilyCosts(root:string,rawScope:unknown,account:DedicatedAgentAccountLedger,rawChildren:readonly {root:string;scope:AgentWorkspaceToolScope}[]){
 const deny=():never=>{throw new RuntimeAdapterError('agent_run_family_cost_originals_unproven');};
 if(!(account instanceof DedicatedAgentAccountLedger)||!Array.isArray(rawChildren)||rawChildren.length>64)deny();
 const scope=parseAgentWorkspaceToolScope(rawScope),children=rawChildren.map(c=>{if(!c||Object.keys(c).sort().join(',')!=='root,scope'||typeof c.root!=='string')deny();return{root:c.root,scope:parseAgentWorkspaceToolScope(c.scope)};}).sort((a,b)=>a.scope.operation_key.localeCompare(b.scope.operation_key));
 const registrations=account.readOriginalSkillScopes(scope),costs=account.readRunFamilyCosts(scope,children.map(c=>c.scope));
 if(!costs.costs_reconciled||costs.unresolved||costs.unstarted_scopes||!costs.holds||!costs.bill_originals.length||!Number.isSafeInteger(costs.cash_charged_micros)||!Number.isSafeInteger(costs.credit_charged_micro_units))deny();
 const inputs=[{root,scope},...children],originals=inputs.map(input=>readDedicatedAgentModelOriginals(input.root,input.scope));
 const members=inputs.map((input,i)=>{
  const original=originals[i]!,model=original.summary,selected=costs.scopes.filter(c=>isDeepStrictEqual(c.scope,input.scope));
  if(selected.length!==1||selected[0]!.holds!==original.calls.length||model.status!=='Observed'||!model.original_requirement_pinned||!model.budget_identity_pinned||!model.calls||model.unresolved||model.calls!==original.calls.length||model.admission_digest!==account.admission_digest||!isDeepStrictEqual(model.profile,account.profile))deny();
  for(const call of original.calls){const hold=account.readOriginalHold(input.scope,call.call_id);if(call.state!=='reply_recorded'||!call.provider_response_id||!hold||!isDeepStrictEqual(hold,call.hold)||hold.account_digest!==costs.account_digest||hold.connection_digest!==model.connection_digest||hold.admission_digest!==model.admission_digest||hold.request_id!==call.request_id||hold.request_digest!==call.request_digest)deny();}
  return {scope:input.scope,model,calls:original.calls};
 });
 if(members.reduce((n,m)=>n+m.calls.length,0)!==costs.holds||inputs.some((input,i)=>!isDeepStrictEqual(originals[i],readDedicatedAgentModelOriginals(input.root,input.scope)))||!isDeepStrictEqual(costs,account.readRunFamilyCosts(scope,children.map(c=>c.scope)))||!isDeepStrictEqual(registrations,account.readOriginalSkillScopes(scope)))deny();
 return {format:'cimiloop/agent-run-family-cost-evidence/1.0.0' as const,scope,members,registrations:registrations.map(r=>({relation:r.relation,admission_digest:digest(JSON.stringify(r.admission)).value})),costs,starts_run:false as const,kernel_costs_reconciled:false as const};
}

export type ReconciledAgentRunFamilyChild =
 | {state:'executed';root:string;relation:DedicatedAgentSkillScope}
 | {state:'not_started';root:string;relation:DedicatedAgentSkillScope;inputs:AgentNamedMethodResultInputs};
// New explicit proof: all executed members retain their complete provider
// originals and authenticated final bills. Zero-call children need a positive
// immutable dispatch closure, cross-account audit and independent zero effects.
// Kernel metadata/qualification and parent Native terminal are separate gates.
export function readOriginalReconciledAgentRunFamilyCosts(root:string,rawScope:unknown,account:DedicatedAgentAccountLedger,rawChildren:readonly ReconciledAgentRunFamilyChild[]){
 const deny=():never=>{throw new RuntimeAdapterError('agent_run_family_cost_originals_unproven');};
 if(!(account instanceof DedicatedAgentAccountLedger)||!Array.isArray(rawChildren)||rawChildren.length>64)deny();
 const scope=parseAgentWorkspaceToolScope(rawScope);
 const children=rawChildren.map(child=>{
  if(!child||!['executed','not_started'].includes(child.state)||typeof child.root!=='string'||Object.keys(child).sort().join(',')!==(child.state==='not_started'?'inputs,relation,root,state':'relation,root,state'))deny();
  const childScope=parseAgentWorkspaceToolScope(child.relation?.child);
  // New composition roots are derived from the original parent. An empty
  // caller-selected directory cannot conceal effects at the original root.
  if(resolve(child.root)!==resolve(join(root,'skill-runtime-originals',scope.project_id,childScope.operation_key)))deny();
  return child;
 }).sort((a,b)=>a.relation.child.operation_key.localeCompare(b.relation.child.operation_key));
 const descriptors=children.map(c=>({state:c.state,relation:c.relation}));
 const registrations=account.readOriginalSkillScopes(scope),costs=account.readReconciledRunFamilyCosts(scope,descriptors);
 if(!costs.holds||!costs.bill_originals.length||!costs.costs_reconciled||costs.unresolved)deny();
 const inputs=[{state:'executed' as const,root,scope},...children.map(c=>({...c,scope:c.relation.child}))];
 const read=()=>inputs.map(input=>{
  if(input.state==='not_started'){
   const zero_costs=account.readOriginalSkillZeroCosts(input.relation),preparation=readAgentSkillPreparationZeroEffects(input.root,input.scope,input.inputs);
   if(preparation.status!=='Observed'||!preparation.preparation_zero_effects_reverified||preparation.method_calls||preparation.model_calls||!isDeepStrictEqual(costs.zero_costs.find(z=>isDeepStrictEqual(z.scope,input.scope)),zero_costs))deny();
   return{state:'not_started' as const,scope:input.scope,preparation,zero_costs};
  }
  const original=readDedicatedAgentModelOriginals(input.root,input.scope),model=original.summary,selected=costs.scopes.filter(c=>isDeepStrictEqual(c.scope,input.scope));
  if(selected.length!==1||selected[0]!.state!=='executed'||selected[0]!.holds!==original.calls.length||model.status!=='Observed'||!model.original_requirement_pinned||!model.budget_identity_pinned||!model.calls||model.unresolved||model.calls!==original.calls.length||model.admission_digest!==account.admission_digest||!isDeepStrictEqual(model.profile,account.profile))deny();
  for(const call of original.calls){const hold=account.readOriginalHold(input.scope,call.call_id);if(call.state!=='reply_recorded'||!call.provider_response_id||!hold||!isDeepStrictEqual(hold,call.hold)||hold.account_digest!==costs.account_digest||hold.connection_digest!==model.connection_digest||hold.admission_digest!==model.admission_digest||hold.request_id!==call.request_id||hold.request_digest!==call.request_digest)deny();}
  return{state:'executed' as const,scope:input.scope,model,calls:original.calls};
 });
 const members=read();
 if(members.reduce((n,m)=>n+(m.state==='executed'?m.calls.length:0),0)!==costs.holds||!isDeepStrictEqual(members,read())||!isDeepStrictEqual(costs,account.readReconciledRunFamilyCosts(scope,descriptors))||!isDeepStrictEqual(registrations,account.readOriginalSkillScopes(scope)))deny();
 return{format:'cimiloop/agent-run-family-cost-evidence/2.0.0' as const,scope,members,registrations:registrations.map(r=>({relation:r.relation,admission_digest:digest(JSON.stringify(r.admission)).value})),costs,starts_run:false as const,kernel_costs_reconciled:false as const};
}
