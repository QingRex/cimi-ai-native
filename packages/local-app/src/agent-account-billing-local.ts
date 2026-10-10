import {isDeepStrictEqual} from 'node:util';
import {DedicatedAgentAccountLedger} from '@cimiloop/runtime-adapter';
import {readHumanOriginalAgentRunInputs,type AgentRuntimeControlContext} from './agent-runtime-control-local.js';
import {LocalProjectError} from './errors.js';
// Shared read service for CLI/workbench composition. Historical fees require
// Human access to this original Run, not a new Agent/model admission or launch.
// Trusted installation only; request JSON cannot select an account or verifier.
export class LocalAgentAccountBilling {
 constructor(private readonly local:AgentRuntimeControlContext,private readonly account:DedicatedAgentAccountLedger){
  if(!(account instanceof DedicatedAgentAccountLedger))throw new LocalProjectError('原账户账单服务尚未安装','CAPABILITY_UNAVAILABLE','conflict');
 }
 readRunCosts(runId:string){
  const original=readHumanOriginalAgentRunInputs(this.local,runId),costs=this.account.readRunCosts(original.scope),fresh=readHumanOriginalAgentRunInputs(this.local,runId);
  if(!isDeepStrictEqual({scope:original.scope,record:original.record,context:original.context},{scope:fresh.scope,record:fresh.record,context:fresh.context}))throw new LocalProjectError('原运行资料已改变','INPUT_CHANGED','conflict');
  return{ok:true as const,run_id:runId,costs,starts_run:false as const,domain_observation_produced:false as const,kernel_costs_reconciled:false as const};
 }
}
