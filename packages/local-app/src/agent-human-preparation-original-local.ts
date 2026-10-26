import {isDeepStrictEqual as same} from 'node:util';
import {commandDigest,type KernelResult} from '@cimiloop/kernel';
import {parseVersionedCommand} from '@cimiloop/protocol';
import {AgentStartLedger,digest} from '@cimiloop/runtime-adapter';
import type {LocalProject} from './project.js';
import {readInstance} from './instance.js';
import {openInstalledCodexAgentRuntime} from './agent-codex-installation-local.js';
import {LocalProjectError} from './errors.js';

const unavailable=()=>new LocalProjectError('原 Human 准备映射或回执不可核对；保留原命令，不重新提交','CAPABILITY_UNAVAILABLE','conflict');
// Read-only recovery. No account/full-admission factory, no command execution,
// no inferred success from absence on a new computer, no replacement request.
export async function readHumanAgentPreparationReceipt(local:LocalProject,raw:unknown,beforeRead:()=>void=()=>{},borrowed?:{origin:AgentStartLedger;guard():void}):Promise<KernelResult|undefined>{
 const command=structuredClone(parseVersionedCommand(raw));if(command.schema_version!=='2.0.0'||(command.command_type!=='PrepareRunContext'&&command.command_type!=='ReserveRun'))throw unavailable();
 const original={store:local.store,kernel:local.kernel,execute:local.kernel.execute,location:structuredClone(local.location),instance:structuredClone(local.instance)};
 const unchanged=()=>{if(local.store!==original.store||local.kernel!==original.kernel||local.kernel.execute!==original.execute||!same(local.location,original.location)||!same(local.instance,original.instance)||!same(readInstance(local.location.instancePath),original.instance)||command.project_id!==original.instance.project_id||command.actor_id!==original.instance.actor_id||command.acting_role!=='technical_owner'||!['human_cli','human_ui'].includes(command.source.origin))throw unavailable();};
 const guard=()=>{unchanged();const result:unknown=beforeRead();if(result!==undefined){if(result instanceof Promise)void Promise.prototype.then.call(result,undefined,()=>{});throw unavailable();}unchanged();};
 guard();const receipt=local.store.transaction(tx=>tx.getCommandReceipt(command.command_id));if(!receipt)return undefined;
 let installed:Awaited<ReturnType<typeof openInstalledCodexAgentRuntime>>;
 try{const source=borrowed??(installed=await openInstalledCodexAgentRuntime(local));guard();if(!source||!(source.origin instanceof AgentStartLedger))throw unavailable();source.guard();
  const id=digest(JSON.stringify({project_id:command.project_id,command_id:command.command_id})).value,row=source.origin.readExclusive('human_agent_preparation',id),saved=row?.basis as {format?:string;human_request?:unknown;agent_command?:unknown}|undefined;
  if(!saved||Object.keys(saved).sort().join(',')!=='agent_command,format,human_request'||saved.format!=='cimiloop/human-agent-preparation/1.0.0')throw unavailable();
  const human=parseVersionedCommand(saved.human_request),agent=parseVersionedCommand(saved.agent_command);
  if(commandDigest(human)!==commandDigest(command))throw new LocalProjectError('同一 command_id 已绑定其他原 Human 请求','COMMAND_ID_REUSED','conflict');
  if(human.schema_version!=='2.0.0'||agent.schema_version!=='2.0.0'||(human.command_type!=='PrepareRunContext'&&human.command_type!=='ReserveRun')||(agent.command_type!=='PrepareRunContext'&&agent.command_type!=='ReserveRun')||agent.actor_id===human.actor_id||local.store.getActor(agent.actor_id)?.actor_type!=='agent'||!same(agent,{...human,actor_id:agent.actor_id,acting_role:'executor',source:{origin:'agent',producer:'cimiloop-human-preparation-host',repository_path:local.location.repositoryPath}})||receipt.request_digest!==commandDigest(agent)||!('command_type'in receipt.result)||receipt.result.command_type!==command.command_type)throw unavailable();
  source.guard();guard();if(!same(source.origin.readExclusive('human_agent_preparation',id),row)||!same(local.store.transaction(tx=>tx.getCommandReceipt(command.command_id)),receipt))throw unavailable();return structuredClone(receipt.result);
 }catch(error){guard();throw error;}finally{installed?.release();guard();}
}
