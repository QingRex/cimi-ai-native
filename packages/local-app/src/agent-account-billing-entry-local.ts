import{isDeepStrictEqual}from'node:util';
import{RuntimeAdapterError,type DedicatedAgentAccountLedger}from'@cimiloop/runtime-adapter';
import{LocalAgentAccountBilling}from'./agent-account-billing-local.js';
import{readHumanOriginalAgentRunInputs}from'./agent-runtime-control-local.js';
import{LocalProjectError}from'./errors.js';import type{LocalProject}from'./project.js';
import type{LocalAgentRunFamilyVerification}from'./agent-run-family-costs-local.js';
// Trusted code installation. Open an EXISTING account only: no model, new Run,
// bill ingestion, credential export, imported JSON authority or database repair.
export interface AgentAccountBillingLease{account:DedicatedAgentAccountLedger;familySkills?:LocalAgentRunFamilyVerification;release():void|Promise<void>}
export type HumanAgentAccountFactory=(runId:string,local:LocalProject)=>AgentAccountBillingLease|Promise<AgentAccountBillingLease>;
export class LocalHumanAgentAccountBilling{
 constructor(private readonly local:LocalProject,private readonly factory?:HumanAgentAccountFactory){}
 async query(runId:string){
  const original=readHumanOriginalAgentRunInputs(this.local,runId);
  if(!this.factory)throw new LocalProjectError('原账户费用查询尚未接入','CAPABILITY_UNAVAILABLE','conflict');
  const fresh=()=>{const current=readHumanOriginalAgentRunInputs(this.local,runId);if(!isDeepStrictEqual({scope:current.scope,record:current.record,context:current.context},{scope:original.scope,record:original.record,context:original.context}))throw new LocalProjectError('费用读取期间原运行资料已改变','INPUT_CHANGED','conflict');};
  let lease:AgentAccountBillingLease|undefined,result:ReturnType<LocalAgentAccountBilling['readRunCosts']>|undefined,failed=false,releaseFailed=false;
  try{lease=await this.factory(runId,this.local);fresh();if(!lease||typeof lease.release!=='function')throw new RuntimeAdapterError('agent_account_lease_unproven');result=new LocalAgentAccountBilling(this.local,lease.account).readRunCosts(runId);}
  catch{failed=true;}
  try{if(lease&&typeof lease.release==='function')await lease.release();}
  catch{releaseFailed=true;failed=true;}
  // Release can await: permission/fixed-input changes must still suppress data.
  fresh();
  if(failed||!result)return{ok:true as const,run_id:runId,outcome:'unknown' as const,reason:releaseFailed?'agent_account_release_unproven':'agent_account_original_unavailable',starts_run:false as const,domain_observation_produced:false as const,kernel_costs_reconciled:false as const};
  return{...result,outcome:'observed' as const};
 }
}
