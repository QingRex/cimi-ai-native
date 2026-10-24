import{assertOriginalCurrentParentInput,retainOriginalCurrentParentInput}from'./runs-local.js';
import {isDeepStrictEqual} from 'node:util';
import {parseAgentWorkspaceToolScope,parseAgentParentSkillSdkCatalog,parseAgentParentSkillIpcRequest,parseAgentParentSkillIpcReceipt,parseAgentParentCurrentInput,copyToolJson,type AgentWorkspaceToolScope,type AgentParentSkillHistoricalResultReader} from '@cimiloop/runtime-adapter';
import type {ParentSkillOriginalReader} from './agent-parent-skill-calls-local.js';
import {LocalProjectError} from './errors.js';
import {requestDigest} from '@cimiloop/kernel';
import {LocalAgentParentSkillHost,assertOriginalParentSkillReadSeal,fixedHostHistory as hostHistory,fixedHostHistoryWriter as hostHistoryWriter,fixedHostCurrent as hostCurrent,fixedHostCurrentWriter as hostCurrentWriter,fixedHostCatalog as hostCatalog} from './agent-parent-skill-host-local.js';
import {assertSkillResultRuntimeOriginalSeal} from './skill-result-original-seal.js';
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
const capturedCurrentReaders=new WeakMap<object,{scope:AgentWorkspaceToolScope;capture:()=>()=>void}>();
export function captureOriginalCurrentParentResultSeal(reader:AgentParentSkillHistoricalResultReader|undefined):()=>void{if(!reader)fail();const value=capturedCurrentReaders.get(reader);if(!value)fail();return value.capture();}
export function captureLocalAgentParentSkillResults(port?:LocalAgentParentSkillResultPort){
 if(port===undefined)return undefined;if(!port||typeof port.forOriginal!=='function')fail();const factory=port.forOriginal.bind(port);
 return (rawScope:AgentWorkspaceToolScope,writer?:ParentSkillOriginalReader):AgentParentSkillHistoricalResultReader|undefined=>{
  const scope=parseAgentWorkspaceToolScope(rawScope),original=synchronous(factory(structuredClone(scope),writer));if(original===undefined)return undefined;
  const already=capturedCurrentReaders.get(original);if(already){if(writer!==undefined||!isDeepStrictEqual(scope,already.scope))fail();return original;}
  const host=original instanceof LocalAgentParentSkillHost?original:undefined;let finalCurrent:(()=>void)|undefined;
  // Genuine Hosts use captured class methods without evaluating instance getters.
  if(!host&&(!original||typeof original.readOriginal!=='function'))fail();
  const catalogValue=()=>host?hostCatalog.call(host):synchronous(original.sdkCatalog),catalog=parseAgentParentSkillSdkCatalog(catalogValue(),scope),readOriginal=host?(raw:unknown)=>writer?hostHistoryWriter.call(host,raw,writer):hostHistory.call(host,raw):original.readOriginal.bind(original);
  const guard=()=>{if(!isDeepStrictEqual(parseAgentParentSkillSdkCatalog(catalogValue(),scope),catalog))fail();};
  const result=Object.freeze({get sdkCatalog(){guard();return structuredClone(catalog);},readOriginal(raw:unknown){guard();const frame=parseAgentParentSkillIpcRequest(raw,catalog),value=copyToolJson(synchronous(readOriginal(structuredClone(frame))));guard();if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!('receipt'in value))fail();return{receipt:parseAgentParentSkillIpcReceipt(value.receipt,frame)};},...(host?{readCurrentOriginal(raw:unknown){
   guard();const frame=parseAgentParentSkillIpcRequest(raw,catalog),value=synchronous(writer?hostCurrentWriter.call(host,structuredClone(frame),writer):hostCurrent.call(host,structuredClone(frame))),seal=value.originals;
   assertSkillResultRuntimeOriginalSeal(seal,seal.report,seal.reference);
   const receipt=parseAgentParentSkillIpcReceipt(copyToolJson(value.receipt),frame),current_input=parseAgentParentCurrentInput(copyToolJson(value.current_input),frame);
   if(receipt.report_digest!==requestDigest(seal.report)||receipt.invocation_id!==seal.report.invocation_ref.id||receipt.invocation_key!==seal.report.invocation_key||receipt.status!==seal.report.status||!isDeepStrictEqual(receipt.output,seal.report.status==='succeeded'?seal.report.output:null))fail();
   guard();assertSkillResultRuntimeOriginalSeal(seal,seal.report,seal.reference);
   // No private capability, mutable host, Actor, Writer or effect escapes.
   return{receipt:structuredClone(receipt),current_input:structuredClone(current_input)};
  },readCurrentOriginals(raw:unknown[]){
   guard();if(!Array.isArray(raw)||!raw.length||raw.length>64)fail();const frames=raw.map(value=>parseAgentParentSkillIpcRequest(value,catalog));if(new Set(frames.map(frame=>frame.call_id)).size!==frames.length)fail();
   const held=frames.map(frame=>{const value=synchronous(writer?hostCurrentWriter.call(host,structuredClone(frame),writer):hostCurrent.call(host,structuredClone(frame))),seal=value.originals;assertSkillResultRuntimeOriginalSeal(seal,seal.report,seal.reference);const receipt=parseAgentParentSkillIpcReceipt(copyToolJson(value.receipt),frame),current_input=parseAgentParentCurrentInput(copyToolJson(value.current_input),frame);retainOriginalCurrentParentInput(value.current_input,current_input);if(receipt.status!=='succeeded'||receipt.report_digest!==requestDigest(seal.report)||receipt.invocation_id!==seal.report.invocation_ref.id||receipt.invocation_key!==seal.report.invocation_key||receipt.status!==seal.report.status||!isDeepStrictEqual(receipt.output,seal.report.status==='succeeded'?seal.report.output:null))fail();assertOriginalParentSkillReadSeal(value.parent_originals);return{receipt,current_input,seal,parent_originals:value.parent_originals};});
   guard();
   // Installed historical/current/catalog callbacks have all ended. Independently
   // recheck every child's complete source and original Runtime at one final cut.
   for(const value of held)assertOriginalCurrentParentInput(value.current_input);
   for(const value of held)assertSkillResultRuntimeOriginalSeal(value.seal,value.seal.report,value.seal.reference);for(const value of held)assertOriginalParentSkillReadSeal(value.parent_originals);
   finalCurrent=()=>{for(const value of held)assertOriginalCurrentParentInput(value.current_input);for(const value of held)assertSkillResultRuntimeOriginalSeal(value.seal,value.seal.report,value.seal.reference);for(const value of held)assertOriginalParentSkillReadSeal(value.parent_originals);};
   return held.map(value=>({receipt:structuredClone(value.receipt),current_input:structuredClone(value.current_input)}));
  }}:{})});
  if(host)capturedCurrentReaders.set(result,{scope:structuredClone(scope),capture(){if(!finalCurrent)fail();return finalCurrent;}});return result;
 };
}
