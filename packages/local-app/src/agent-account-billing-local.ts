import {isDeepStrictEqual} from 'node:util';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {DedicatedAgentAccountLedger,readAgentRuntimeModelOriginals,readAgentRuntimeOriginalIdentity} from '@cimiloop/runtime-adapter';
import {readHumanOriginalAgentRunInputs,type AgentRuntimeControlContext} from './agent-runtime-control-local.js';
import {LocalProjectError} from './errors.js';
// Selection comes from the original operation, never the newest installation.
// Residue is a routing hint only: the selected reader must prove its originals.
export function readOriginalAgentCostBackend(local:AgentRuntimeControlContext,runId:string):'codex'|'dedicated'|undefined{
 const {scope}=readHumanOriginalAgentRunInputs(local,runId),root=local.location.dataDirectory;
 const fail=():never=>{throw new LocalProjectError('原运行模型后端尚不可核对','CAPABILITY_UNAVAILABLE','conflict');};
 if(['agent-runtime-model-starts','agent-runtime-model-originals'].some(name=>existsSync(join(root,name,scope.project_id,scope.run_id)))){
  const kind=readAgentRuntimeModelOriginals(root,scope).original_evidence?.kind;
  if(kind==='codex_login/1.0.0')return'codex';if(kind==='dedicated_zhipu/1.0.0')return'dedicated';return fail();
 }
 if(['agent-codex-model-starts','agent-codex-model-originals'].some(name=>existsSync(join(root,name,scope.project_id,scope.run_id))))return'codex';
 if(['agent-dedicated-model-starts','agent-dedicated-model-originals'].some(name=>existsSync(join(root,name,scope.project_id,scope.run_id))))return'dedicated';
 if(existsSync(join(root,'agent-runtime-claims',scope.project_id,'runs',scope.run_id))||existsSync(join(root,'agent-runtime-claims',scope.project_id,'keys',scope.operation_key))){
  const input=readAgentRuntimeOriginalIdentity(root,scope).input as {model_original_binding?:{original_evidence?:{kind?:string}}};
  const kind=input.model_original_binding?.original_evidence?.kind;if(kind==='codex_login/1.0.0')return'codex';if(kind==='dedicated_zhipu/1.0.0')return'dedicated';return fail();
 }
 return undefined;
}
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
