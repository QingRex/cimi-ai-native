import {isDeepStrictEqual} from 'node:util';
import {parseAgentWorkspaceToolScope,parseAgentParentSkillSdkCatalog,parseAgentParentSkillIpcRequest,parseAgentParentSkillIpcReceipt,copyToolJson,type AgentWorkspaceToolScope,type AgentParentSkillHistoricalResultReader} from '@cimiloop/runtime-adapter';
import type {ParentSkillOriginalReader} from './agent-parent-skill-calls-local.js';
import {LocalProjectError} from './errors.js';
// Installed by trusted launcher code only. Scope comes from the immutable Run,
// never from a Human/model payload. It supplies no start/capture/effect authority.
export interface LocalAgentParentSkillResultPort {
 forOriginal(scope:AgentWorkspaceToolScope,writer?:ParentSkillOriginalReader):AgentParentSkillHistoricalResultReader|undefined;
}
function fail():never{throw new LocalProjectError('原父Skill只读结果端口不可证明','CAPABILITY_UNAVAILABLE','conflict');}
function synchronous<T>(value:T):T {
 if(value instanceof Promise){void Promise.prototype.then.call(value,undefined,()=>{});fail();}
 if(value!==null&&(typeof value==='object'||typeof value==='function')){let then:unknown;try{then=Reflect.get(value,'then');}catch{void Promise.resolve(value).then(undefined,()=>{});fail();}if(typeof then==='function'){void Promise.resolve(value).then(undefined,()=>{});fail();}}
 return value;
}
// Capture factory identity before an await. Collection uses original read-only
// transactions; Kernel supplies its already active scoped Writer for reverify.
export function captureLocalAgentParentSkillResults(port?:LocalAgentParentSkillResultPort){
 if(port===undefined)return undefined;if(!port||typeof port.forOriginal!=='function')fail();const factory=port.forOriginal.bind(port);
 return (rawScope:AgentWorkspaceToolScope,writer?:ParentSkillOriginalReader):AgentParentSkillHistoricalResultReader|undefined=>{
  const scope=parseAgentWorkspaceToolScope(rawScope),original=synchronous(factory(structuredClone(scope),writer));if(original===undefined)return undefined;
  if(!original||typeof original.readOriginal!=='function')fail();const catalog=parseAgentParentSkillSdkCatalog(synchronous(original.sdkCatalog),scope),readOriginal=original.readOriginal.bind(original);
  const guard=()=>{if(!isDeepStrictEqual(parseAgentParentSkillSdkCatalog(synchronous(original.sdkCatalog),scope),catalog))fail();};
  return Object.freeze({get sdkCatalog(){guard();return structuredClone(catalog);},readOriginal(raw:unknown){guard();const frame=parseAgentParentSkillIpcRequest(raw,catalog),value=copyToolJson(synchronous(readOriginal(structuredClone(frame))));guard();if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!('receipt'in value))fail();return{receipt:parseAgentParentSkillIpcReceipt(value.receipt,frame)};}});
 };
}
