import {isDeepStrictEqual} from 'node:util';
import {compileValidator,SkillMethodOutputSchema,type SkillMethodOutput} from '@cimiloop/protocol/v2';
import {parseAgentWorkspaceToolScope,type AgentWorkspaceToolScope} from './agent-workspace-authority.js';
import {copyToolJson} from './tool-journal.js';
import {digest,RuntimeAdapterError} from './files.js';

export interface AgentParentSkillSdkCatalog {
 scope_digest:string;catalog_digest:string;
 entries:{skill_alias:string;method_name:string;input_alias:string}[];
}
export interface AgentParentSkillIpcReceipt {
 format:'cimiloop/agent-parent-skill-receipt/1.0.0';scope_digest:string;catalog_digest:string;
 call_id:string;request_digest:string;invocation_id:string;invocation_key:string;observation_id:string;
 report_digest:string;status:'succeeded'|'failed';output:SkillMethodOutput|null;output_digest:string;
 formal_agent_execution_enabled:false;
}
// Installed shared application service only. A wire request carries aliases,
// never authority, roots, qualification, account approval or raw input refs.
export interface AgentParentSkillIpcPort {
 readonly sdkCatalog:AgentParentSkillSdkCatalog;
 invoke(raw:unknown,signal?:AbortSignal):Promise<{receipt:AgentParentSkillIpcReceipt;replay:boolean}>;
}
const exact=(raw:unknown,keys:string[]):raw is Record<string,unknown>=>!!raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).sort().join(',')===[...keys].sort().join(',');
const sha=(raw:unknown):raw is string=>typeof raw==='string'&&/^[a-f0-9]{64}$/.test(raw);
const alias=(raw:unknown):raw is string=>typeof raw==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(raw);
const uuid=(raw:unknown):raw is string=>typeof raw==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(raw);
const output=compileValidator<SkillMethodOutput>(SkillMethodOutputSchema);
function waitOriginal<T>(original:Promise<T>,signal?:AbortSignal):Promise<T>{
 if(!signal)return original;
 return new Promise<T>((resolve,reject)=>{
  let settled=false;
  const finish=(error:unknown,value?:T)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(value!);};
  const abort=()=>finish(new RuntimeAdapterError('agent_parent_skill_ipc_aborted'));
  // Consume both outcomes of the same original promise even after cancellation.
  // The child service keeps its original Kernel/dispatch guards and identity.
  void Promise.resolve(original).then(value=>finish(undefined,value),error=>finish(error));
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 });
}
function fail():never{throw new RuntimeAdapterError('agent_parent_skill_ipc_unproven');}

export function parseAgentParentSkillSdkCatalog(raw:unknown,scope:AgentWorkspaceToolScope):AgentParentSkillSdkCatalog {
 try {
  // Own rejected promises even when a mistakenly async trusted getter is refused.
  if(raw instanceof Promise){void Promise.prototype.then.call(raw,undefined,()=>{});fail();}
  const value=copyToolJson(raw),original=parseAgentWorkspaceToolScope(scope);
  if(!exact(value,['scope_digest','catalog_digest','entries'])||value.scope_digest!==digest(JSON.stringify(original)).value||!sha(value.catalog_digest)||!Array.isArray(value.entries)||!value.entries.length||value.entries.length>64)fail();
  const seen=new Set<string>();
  for(const entry of value.entries){if(!exact(entry,['skill_alias','method_name','input_alias'])||![entry.skill_alias,entry.method_name,entry.input_alias].every(alias))fail();const key=JSON.stringify([entry.skill_alias,entry.method_name,entry.input_alias]);if(seen.has(key))fail();seen.add(key);}
  return value as unknown as AgentParentSkillSdkCatalog;
 }catch{return fail();}
}

export function parseAgentParentSkillIpcRequest(raw:unknown,catalog:AgentParentSkillSdkCatalog) {
 try {
  const frame=copyToolJson(raw);
  if(!exact(frame,['format','scope_digest','catalog_digest','call_id','tool','skill_alias','method_name','input_alias'])||frame.format!=='cimiloop/agent-parent-skill-request/1.0.0'||frame.scope_digest!==catalog.scope_digest||frame.catalog_digest!==catalog.catalog_digest||frame.tool!=='run_skill'||![frame.skill_alias,frame.method_name,frame.input_alias].every(alias)||typeof frame.call_id!=='string'||!/^sdk_[a-f0-9]{64}$/.test(frame.call_id)||!catalog.entries.some(entry=>entry.skill_alias===frame.skill_alias&&entry.method_name===frame.method_name&&entry.input_alias===frame.input_alias))fail();
  return frame;
 }catch{return fail();}
}

export function parseAgentParentSkillIpcReceipt(raw:unknown,frame:ReturnType<typeof parseAgentParentSkillIpcRequest>):AgentParentSkillIpcReceipt {
 try {
  const value=copyToolJson(raw);
  if(!exact(value,['format','scope_digest','catalog_digest','call_id','request_digest','invocation_id','invocation_key','observation_id','report_digest','status','output','output_digest','formal_agent_execution_enabled'])||value.format!=='cimiloop/agent-parent-skill-receipt/1.0.0'||value.scope_digest!==frame.scope_digest||value.catalog_digest!==frame.catalog_digest||value.call_id!==frame.call_id||value.request_digest!==digest(JSON.stringify(frame)).value||![value.invocation_id,value.invocation_key,value.observation_id].every(uuid)||!sha(value.report_digest)||!sha(value.output_digest)||value.output_digest!==digest(JSON.stringify(value.output)).value||value.formal_agent_execution_enabled!==false)fail();
  if(value.status==='succeeded')output(value.output);else if(value.status!=='failed'||value.output!==null)fail();
  return value as unknown as AgentParentSkillIpcReceipt;
 }catch{return fail();}
}

// Capture before Native preparation awaits. The service remains the original
// Kernel writer; this adapter verifies bounded wire shape and immutable pins.
// Every call reaches the installed service once. It never allocates another ID,
// retries an unknown operation or turns a report into a business Decision.
export function captureAgentParentSkillIpcPort(rawScope:unknown,port:AgentParentSkillIpcPort) {
 const scope=parseAgentWorkspaceToolScope(rawScope);
 if(!port||typeof port!=='object'||typeof port.invoke!=='function')fail();
 const readCatalog=()=>parseAgentParentSkillSdkCatalog(port.sdkCatalog,scope),catalog=readCatalog(),invoke=port.invoke.bind(port);
 const assertOriginal=()=>{if(!isDeepStrictEqual(readCatalog(),catalog))fail();};
 return Object.freeze({get catalog(){return structuredClone(catalog);},assertScope(raw:unknown){if(!isDeepStrictEqual(parseAgentWorkspaceToolScope(raw),scope))fail();assertOriginal();},async invoke(raw:unknown,signal?:AbortSignal){
  signal?.throwIfAborted();assertOriginal();const frame=parseAgentParentSkillIpcRequest(raw,catalog);
  const rawResult=await waitOriginal(invoke(structuredClone(frame),signal),signal);
  signal?.throwIfAborted();assertOriginal();const result=copyToolJson(rawResult);
  if(!exact(result,['receipt','replay'])||typeof result.replay!=='boolean')fail();
  return{receipt:parseAgentParentSkillIpcReceipt(result.receipt,frame),replay:result.replay};
 }});
}
