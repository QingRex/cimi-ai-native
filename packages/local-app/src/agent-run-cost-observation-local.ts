import{isDeepStrictEqual}from'node:util';
import{LocalAgentRuntimeObservation,parseLocalAgentObservationRequest}from'./agent-runtime-observation-local.js';
import{readHumanOriginalAgentRunInputs}from'./agent-runtime-control-local.js';
import{openLocalProject,type LocalProject}from'./project.js';import{LocalProjectError}from'./errors.js';
import type{HumanAgentAccountFactory,AgentAccountBillingLease}from'./agent-account-billing-entry-local.js';
// Kernel records fees; this service grants no execution/bill-write authority.
export class LocalHumanAgentRunCostObservation{
 constructor(private readonly local:LocalProject,private readonly factory?:HumanAgentAccountFactory){}
 async record(raw:unknown){
  const request=parseLocalAgentObservationRequest(raw,this.local),original=readHumanOriginalAgentRunInputs(this.local,request.target.id);
  // The Kernel still compares the exact original request and caller. An
  // immutable receipt replay requires no new account or original collection.
  if(this.local.store.transaction(tx=>!!tx.getCommandReceipt(request.command_id)))return new LocalAgentRuntimeObservation(this.local).recordCosts(request);
  if(!this.factory)throw new LocalProjectError('原账单费用观测尚未接入','CAPABILITY_UNAVAILABLE','conflict');
  const human=structuredClone(this.local.instance);
  let lease:AgentAccountBillingLease|undefined,inner:LocalProject|undefined,release:(()=>void|Promise<void>)|undefined;
  try{
   lease=await this.factory(original.run.id,this.local);
   const releaseMethod=lease?.release;
   if(typeof releaseMethod!=='function')throw Error('Account release unavailable');
   release=releaseMethod.bind(lease);
   const fresh=readHumanOriginalAgentRunInputs(this.local,original.run.id);
   if(!isDeepStrictEqual(human,this.local.instance)||!isDeepStrictEqual({scope:original.scope,record:original.record,context:original.context},{scope:fresh.scope,record:fresh.record,context:fresh.context})||!lease)throw Error('Original fee input changed');
   inner=openLocalProject({projectDir:this.local.location.repositoryPath,agentRunCostAccount:id=>{if(id!==original.run.id)throw Error('Foreign fee scope');return lease!.account;}});
   if(!isDeepStrictEqual(inner.instance,this.local.instance))throw Error('Original Human entry changed');
   return await new LocalAgentRuntimeObservation(inner).recordCosts(request,lease.account);
  }catch{throw new LocalProjectError('原账单费用与模型请求尚不可核对；保留原请求与预算','CAPABILITY_UNAVAILABLE','conflict');}
  finally{
   inner?.store.close();
   if(release){
    try{await release();}catch{throw new LocalProjectError('原费用账户释放尚待核对；保留原命令回执','CAPABILITY_UNAVAILABLE','conflict');}
    try{
     const fresh=readHumanOriginalAgentRunInputs(this.local,original.run.id);
     if(!isDeepStrictEqual(human,this.local.instance)||!isDeepStrictEqual({scope:original.scope,record:original.record,context:original.context},{scope:fresh.scope,record:fresh.record,context:fresh.context}))throw Error('Original input changed');
    }catch{throw new LocalProjectError('原 Human 或运行资料已改变；保留原命令回执','INPUT_CHANGED','conflict');}
   }
  }
 }
}
