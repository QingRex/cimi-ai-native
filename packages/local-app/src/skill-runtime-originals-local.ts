import {isDeepStrictEqual as same} from 'node:util';
import {openInstalledCodexAgentRuntime} from './agent-codex-installation-local.js';
import {readHumanOriginalAgentRunInputs} from './agent-runtime-control-local.js';
import {readOriginalSkillInvocationMetadataFromReader} from './skill-invocation-execution-local.js';
import {LocalSkillInvocationStartCustody} from './skill-invocation-start-custody-local.js';
import type {HumanSkillRuntimeFactory} from './skill-invocation-control-local.js';
import {LocalProjectError} from './errors.js';

const unavailable=()=>new LocalProjectError('原 Skill 启动账本或 Codex 安装不可核对','CAPABILITY_UNAVAILABLE','conflict');
// Original-source lease only. Opening an existing Host never installs model,
// credential, dispatch, budget or qualification factories.
export const productionSkillRuntimeOriginals:HumanSkillRuntimeFactory=async(id,local)=>{
 const store=local.store,kernel=local.kernel,location=structuredClone(local.location),instance=structuredClone(local.instance);
 const read=()=>{
  if(local.store!==store||local.kernel!==kernel||!same(local.location,location)||!same(local.instance,instance))throw unavailable();
  const original=store.readSnapshot(reader=>readOriginalSkillInvocationMetadataFromReader(local,reader,id)).value;
  if(!same(readHumanOriginalAgentRunInputs(local,original.invocation.run_ref.id).scope,original.request.parent))throw unavailable();
  return original;
 };
 const original=read(),installed=await openInstalledCodexAgentRuntime(local);
 try{
  if(!installed)throw unavailable();
  const guard=()=>{installed.guard();if(!same(read(),original))throw unavailable();};guard();
  const custody=new LocalSkillInvocationStartCustody(location.repositoryPath,location.dataDirectory,installed.origin);
  custody.accountScope(original.project,original.invocation,original.request.parent,original.record_id);guard();
  return{custody,guard,release:()=>installed.release()};
 }catch{installed?.release();throw unavailable();}
};
