import{isDeepStrictEqual}from'node:util';
import{RuntimeAdapterError,readCodexAgentRunUsage,type CodexAgentUsageBudget,type DedicatedAgentAccountLedger}from'@cimiloop/runtime-adapter';
import{LocalAgentAccountBilling,readOriginalAgentCostBackend}from'./agent-account-billing-local.js';
import{readHumanOriginalAgentRunInputs}from'./agent-runtime-control-local.js';
import{LocalProjectError}from'./errors.js';import type{LocalProject}from'./project.js';
import type{LocalAgentRunFamilyVerification}from'./agent-run-family-costs-local.js';
// Trusted code installation. Open an EXISTING account only: no model, new Run,
// bill ingestion, credential export, imported JSON authority or database repair.
export interface AgentAccountBillingLease{account:DedicatedAgentAccountLedger;familySkills?:LocalAgentRunFamilyVerification;release():void|Promise<void>}
export type HumanAgentAccountFactory=(runId:string,local:LocalProject)=>AgentAccountBillingLease|Promise<AgentAccountBillingLease>;
// Query-only composition is separate from bill observation/reconciliation.
// A Codex usage lease cannot be supplied as a Dedicated bill account.
export interface CodexAgentUsageBillingLease{codex_usage:{budget:CodexAgentUsageBudget;guard():void};release():void|Promise<void>}
export type HumanAgentCostsFactory=(runId:string,local:LocalProject)=>AgentAccountBillingLease|CodexAgentUsageBillingLease|Promise<AgentAccountBillingLease|CodexAgentUsageBillingLease>;
const unknown=(runId:string,reason:string)=>({ok:true as const,run_id:runId,outcome:'unknown' as const,reason,starts_run:false as const,domain_observation_produced:false as const,kernel_costs_reconciled:false as const});
type ReadResult=ReturnType<LocalAgentAccountBilling['readRunCosts']>&{outcome:'observed'}|ReturnType<typeof unknown>&{codex_usage:ReturnType<typeof readCodexAgentRunUsage>};
export class LocalHumanAgentAccountBilling{
 constructor(private readonly local:LocalProject,private readonly factory?:HumanAgentCostsFactory){}
 async query(runId:string){
  const original=readHumanOriginalAgentRunInputs(this.local,runId);
  const identity={store:this.local.store,kernel:this.local.kernel,location:structuredClone(this.local.location),instance:structuredClone(this.local.instance)};
  if(!this.factory)throw new LocalProjectError('原账户费用查询尚未接入','CAPABILITY_UNAVAILABLE','conflict');
  let backend:ReturnType<typeof readOriginalAgentCostBackend>;try{backend=readOriginalAgentCostBackend(this.local,runId);}catch{return unknown(runId,'agent_account_original_unavailable');}
  const fresh=()=>{const current=readHumanOriginalAgentRunInputs(this.local,runId);if(this.local.store!==identity.store||this.local.kernel!==identity.kernel||!isDeepStrictEqual(this.local.location,identity.location)||!isDeepStrictEqual(this.local.instance,identity.instance)||readOriginalAgentCostBackend(this.local,runId)!==backend||!isDeepStrictEqual({scope:current.scope,record:current.record,context:current.context},{scope:original.scope,record:original.record,context:original.context}))throw new LocalProjectError('费用读取期间原运行资料已改变','INPUT_CHANGED','conflict');};
  let lease:AgentAccountBillingLease|CodexAgentUsageBillingLease|undefined,result:ReadResult|undefined,failed=false,releaseFailed=false;
  try{
   lease=await this.factory(runId,this.local);fresh();if(!lease||typeof lease.release!=='function')throw new RuntimeAdapterError('agent_account_lease_unproven');
   if('codex_usage'in lease){
    if('account'in lease||!lease.codex_usage||typeof lease.codex_usage.guard!=='function')throw new RuntimeAdapterError('agent_account_lease_unproven');
    const guard=lease.codex_usage.guard.bind(lease.codex_usage);guard();fresh();
    const usage=readCodexAgentRunUsage(this.local.location.dataDirectory,original.scope,lease.codex_usage.budget);guard();fresh();
    result={...unknown(runId,'codex_bill_original_unavailable'),codex_usage:usage};
   }else result={...new LocalAgentAccountBilling(this.local,lease.account).readRunCosts(runId),outcome:'observed'};
  }
  catch{failed=true;}
  try{if(lease&&typeof lease.release==='function')await lease.release();}
  catch{releaseFailed=true;failed=true;}
  // Release can await: permission/fixed-input changes must still suppress data.
  fresh();
  if(failed||!result)return unknown(runId,releaseFailed?'agent_account_release_unproven':'agent_account_original_unavailable');
  return result;
 }
}
