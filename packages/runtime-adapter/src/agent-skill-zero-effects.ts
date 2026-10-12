import {lstatSync,readdirSync} from 'node:fs';import {join,resolve} from 'node:path';import {isDeepStrictEqual as same} from 'node:util';
import {assertOrdinaryPath,bytesAt,digest,RuntimeAdapterError} from './files.js';import {parseAgentWorkspaceToolScope} from './agent-workspace-authority.js';import {validateFixedMethodContext} from './fixed-method.js';import {readAgentNamedMethodOriginals} from './agent-named-method-host.js';import {readAgentRuntimeModelOriginals} from './agent-runtime-model.js';import {parseGatewayJson} from './gateway-conversation.js';import type {AgentNamedMethodResultInputs} from './agent-named-method-result.js';
const present=(path:string)=>{try{lstatSync(assertOrdinaryPath(path));return true;}catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT')return false;throw error;}};
function fail():never{throw new RuntimeAdapterError('agent_skill_preparation_zero_unproven');}
// Bounded preparation facts only: must be joined with positive immutable Host
// dispatch closure and original cross-account zero-hold proof by the collector.
// No directory absence here establishes NotStarted, custody or zero fees.
export function readAgentSkillPreparationZeroEffects(root:string,rawScope:unknown,inputs:AgentNamedMethodResultInputs){
 const unknown={format:'cimiloop/skill-preparation-zero-effects/1.0.0' as const,status:'Unknown' as 'Observed'|'Unknown',preparation_zero_effects_reverified:false,dispatch_closed:false as const,costs_reconciled:false as const,domain_observation_produced:false as const,method_calls:0,model_calls:0,artifacts:[] as {name:string;path:string;digest:string}[]};
 try{
  const scope=parseAgentWorkspaceToolScope(rawScope);validateFixedMethodContext(inputs.profile,inputs.files,scope.operation_key);assertOrdinaryPath(root);
  const scan=()=>{const files:string[]=[];let entries=0;
   const walk=(path:string,depth:number)=>{if(++entries>256||depth>8)fail();const stat=lstatSync(assertOrdinaryPath(path));if(stat.isSymbolicLink())fail();if(stat.isDirectory()){for(const name of readdirSync(path).sort())walk(join(path,name),depth+1);}else{if(!stat.isFile()||stat.nlink!==1)fail();files.push(resolve(path));}};
   if(present(root)){if(!lstatSync(root).isDirectory())fail();const allowed=['agent-named-method-originals','agent-named-method-starts','agent-runtime-model-originals','agent-runtime-model-starts'];for(const name of readdirSync(root).sort())if(!allowed.includes(name))fail();walk(root,0);}return files.sort();
  };
  const files=scan(),artifacts:typeof unknown.artifacts=[];
  const methodPath=join(root,'agent-named-method-originals',scope.project_id,scope.operation_key),methodSpine=join(root,'agent-named-method-starts',scope.project_id,scope.operation_key);
  if(present(methodPath)||present(methodSpine)){
   const binding={format:'cimiloop/agent-named-method-binding/1.0.0',profile_digest:digest(JSON.stringify(inputs.profile)).value,header_digest:digest(bytesAt(join(methodPath,'header.json'),114688)).value,anchor_digest:digest(bytesAt(join(methodSpine,'header.json'),114688)).value};
   const original=readAgentNamedMethodOriginals(root,scope,inputs.profile,inputs.files,binding);if(original.calls.length)fail();artifacts.push(...original.artifacts.map(a=>({...a,name:'method/'+a.name})));
  }
  const modelPath=join(root,'agent-runtime-model-originals',scope.project_id,scope.run_id),modelSpine=join(root,'agent-runtime-model-starts',scope.project_id,scope.run_id);
  if(present(modelPath)||present(modelSpine)){
   const original=readAgentRuntimeModelOriginals(root,scope),header=structuredClone(parseGatewayJson(bytesAt(join(modelPath,'header.json'),114688).toString('utf8'),114688)) as {permitted?:unknown};
   if(original.calls.length||!original.original_evidence||!same(header.permitted,['cimi_invoke_skill','cimi_read_method_resource']))fail();artifacts.push(...original.artifacts.map(a=>({...a,name:'model/'+a.name})));
  }
  if(!same(files,[...artifacts.map(a=>resolve(a.path))].sort())||new Set(artifacts.map(a=>a.name)).size!==artifacts.length||!same(scan(),files))fail();
  for(const artifact of artifacts)if(digest(bytesAt(artifact.path,114688)).value!==artifact.digest)fail();
  return {...unknown,status:'Observed' as const,preparation_zero_effects_reverified:true,artifacts};
 }catch{return unknown;}
}
