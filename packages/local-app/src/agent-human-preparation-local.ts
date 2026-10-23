import { isDeepStrictEqual as same } from 'node:util';
import { CimiLoopKernel, commandDigest, type KernelResult } from '@cimiloop/kernel';
import { parseVersionedCommand } from '@cimiloop/protocol';
import { AgentStartLedger, digest } from '@cimiloop/runtime-adapter';
import type { LocalProject } from './project.js';
import { LocalEvidenceVerifier } from './evidence-local.js';
import { LocalProviderVerifier } from './providers-local.js';
import type { LocalRunVerifier } from './runs-local.js';
import { LocalProjectError } from './errors.js';

const namespace='human_agent_preparation';
const unavailable=()=>new LocalProjectError('准备 Agent 运行需要原 Human 授权及完整 Runtime 准入宿主','CAPABILITY_UNAVAILABLE','conflict');
export function agentPreparationWorkItem(local:Pick<LocalProject,'store'>,kind:string,targetId:unknown,payload:unknown){
 if(kind==='PrepareRunContext'&&typeof targetId==='string')return local.store.getExecutionObject('work_item',targetId);
 if(kind==='ReserveRun'&&payload&&typeof payload==='object'&&'work_item_ref' in payload){const ref=payload.work_item_ref;if(ref&&typeof ref==='object'&&'id' in ref&&typeof ref.id==='string')return local.store.getExecutionObject('work_item',ref.id);}
 return undefined;
}
// Trusted host closure only. The immutable Human request precedes the Agent
// writer transaction; Agent producer/executor relations in DB10 stay intact.
export function humanAgentPreparation(local:LocalProject,verifier:LocalRunVerifier,origin:AgentStartLedger,guard:()=>void){
 const kernel=local.kernel,authorize=kernel.authorizeAgentRunPreparation,execute=kernel.execute;
 return(raw:unknown):KernelResult=>{
  guard();if(local.kernel!==kernel||kernel.authorizeAgentRunPreparation!==authorize||kernel.execute!==execute)throw unavailable();
  const command=parseVersionedCommand(raw);
  if(command.schema_version!=='2.0.0'||(command.command_type!=='PrepareRunContext'&&command.command_type!=='ReserveRun')||command.acting_role!=='technical_owner'||command.actor_id!==local.instance.actor_id||command.project_id!==local.instance.project_id||!['human_cli','human_ui'].includes(command.source.origin))throw unavailable();
  const item=agentPreparationWorkItem(local,command.command_type,'target' in command?command.target?.id:undefined,command.payload);if(!item)throw unavailable();
  const permission=authorize.call(kernel,item.id);if('code' in permission)return permission;
  const actor=local.store.getActor(permission.executor_actor_id);if(actor?.actor_type!=='agent')throw unavailable();
  const asAgent=(request:typeof command)=>({...structuredClone(request),actor_id:actor.id,acting_role:'executor' as const,source:{origin:'agent' as const,producer:'cimiloop-human-preparation-host',repository_path:local.location.repositoryPath}});
  let agentCommand=asAgent(command);
  const id=digest(JSON.stringify({project_id:command.project_id,command_id:command.command_id})).value;
  let basis={format:'cimiloop/human-agent-preparation/1.0.0',human_request:command,agent_command:agentCommand};
  guard();const prior=origin.readExclusive(namespace,id);
  if(prior){
   const saved=prior.basis as typeof basis;
   let original;try{original=parseVersionedCommand(saved?.human_request);}catch{throw unavailable();}
   if(commandDigest(original)!==commandDigest(command))throw new LocalProjectError('同一 command_id 已绑定其他 Human 准备请求','COMMAND_ID_REUSED','conflict');
   if(original.schema_version!=='2.0.0'||(original.command_type!=='PrepareRunContext'&&original.command_type!=='ReserveRun'))throw unavailable();
   agentCommand=asAgent(original);basis={format:'cimiloop/human-agent-preparation/1.0.0',human_request:original,agent_command:agentCommand};
   if(!same(saved,basis))throw unavailable();
  }
  if(!prior&&local.store.transaction(tx=>tx.getCommandReceipt(command.command_id)))throw unavailable();
  origin.issueExclusive(namespace,id,basis);guard();
  const current=authorize.call(kernel,item.id);if('code' in current)return current;
  if(!same(current,permission)||kernel.authorizeAgentRunPreparation!==authorize||kernel.execute!==execute)throw unavailable();
  const agentKernel=new CimiLoopKernel({store:local.store,caller:{kind:'agent',project_id:command.project_id,actor_id:actor.id,provider_identity_ref:structuredClone(actor.provider_identity_ref)},runVerifier:verifier,evidenceVerifier:new LocalEvidenceVerifier(local.location.repositoryPath,local.location.dataDirectory),providerVerifier:new LocalProviderVerifier(local.location.repositoryPath,local.location.dataDirectory),agentPreparationInitiator:{human_actor_id:local.instance.actor_id}});
  const result=agentKernel.execute(agentCommand);guard();
  if(!same(origin.readExclusive(namespace,id)?.basis,basis)||kernel.authorizeAgentRunPreparation!==authorize||kernel.execute!==execute)throw unavailable();
  return result;
 };
}
