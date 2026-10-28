import {isDeepStrictEqual as same} from 'node:util';
import {openOriginalCodexRuntimeCustody} from './agent-codex-installation-local.js';
import {openOriginalDedicatedRuntimeCustody} from './agent-dedicated-installation-local.js';
import {readHumanOriginalAgentRunInputs} from './agent-runtime-control-local.js';
import {readOriginalSkillInvocationMetadataFromReader} from './skill-invocation-execution-local.js';
import {LocalSkillInvocationStartCustody} from './skill-invocation-start-custody-local.js';
import {LocalSkillMethodInputs} from './skill-methods-local.js';
import type {HumanSkillRuntimeFactory} from './skill-invocation-control-local.js';
import {LocalProjectError} from './errors.js';

const unavailable=()=>new LocalProjectError('原 Skill 启动账本或原宿主不可核对','CAPABILITY_UNAVAILABLE','conflict');
// Original-source lease only. Opening an existing Host never installs model,
// credential, dispatch, budget or qualification factories.
export const productionSkillRuntimeOriginals:HumanSkillRuntimeFactory=async(id,local)=>{
 const store=local.store,kernel=local.kernel,authorize=kernel.authorizeAgentRunControl,location=structuredClone(local.location),instance=structuredClone(local.instance);
 const read=()=>{
  if(local.store!==store||local.kernel!==kernel||kernel.authorizeAgentRunControl!==authorize||!same(local.location,location)||!same(local.instance,instance))throw unavailable();
  const original=store.readSnapshot(reader=>readOriginalSkillInvocationMetadataFromReader(local,reader,id)).value;
  if(!same(readHumanOriginalAgentRunInputs(local,original.invocation.run_ref.id).scope,original.request.parent))throw unavailable();
  return original;
 };
 const original=read(),unchanged=()=>{if(!same(read(),original))throw unavailable();};
 // Read existing sources only. The full original admission ticket and its
 // independent file anchor choose the Host; current provider selection does
 // not move a historical child to a different account or create a registration.
 for(const open of [openOriginalDedicatedRuntimeCustody,openOriginalCodexRuntimeCustody]){
  unchanged();let installed:Awaited<ReturnType<typeof open>>;
  try{installed=await open(local);}catch{unchanged();continue;}
  try{unchanged();}catch{installed?.release();throw unavailable();}
  if(!installed)continue;const source=installed;
  try{
   const guard=()=>{source.guard();unchanged();};guard();
   const custody=new LocalSkillInvocationStartCustody(location.repositoryPath,location.dataDirectory,source.origin);
   custody.accountScope(original.project,original.invocation,original.request.parent,original.record_id);guard();
   return{custody,inputs:new LocalSkillMethodInputs(location.repositoryPath,location.dataDirectory),guard,release:()=>source.release()};
  }catch{
   // Failure of an unrelated historical source is not proof of cleanup. Close
   // this borrowed handle; only another exact original ticket can match.
   try{source.release();}catch{throw unavailable();}unchanged();
  }
 }
 throw unavailable();
};
