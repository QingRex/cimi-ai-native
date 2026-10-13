import {compileValidator,DigestSchema,type Digest} from '@cimiloop/protocol/v2';
import type {ProjectReader} from '@cimiloop/store';import type {CallerContext} from './authorization.js';
import {contentDigest} from './intent.js';import {originalAgentRunAuthority} from './agent-run-authority.js';
import type {AgentRunLaunchRequest,RunVerifierPort,AgentRunOriginalResultReader} from './runs.js';
import type {AgentRunLaunchAssessment} from './agent-run-launch.js';
export type AgentRunModelAssessment=Omit<AgentRunLaunchAssessment,'scope'> & {scope:'agent_run_model_assessment'};
// Distinct from first launch and tool permissions. No public Schema or user DB
// upgrade. The required independent host proves current original workspace,
// complete model/account qualification and allowed original Native edit history.
export function assessAgentRunModel(reader:ProjectReader,request:AgentRunLaunchRequest,caller:CallerContext|undefined,now:string,host?:RunVerifierPort):Omit<AgentRunModelAssessment,'as_of_event_sequence'>{
 const base={schema_version:'2.0.0' as const,scope:'agent_run_model_assessment' as const,request,assessed_at:now},deny=(...reasons:string[])=>({...base,decision:'DENY' as const,authority:null,reasons:[...new Set(reasons)].slice(0,32)});
 const original=originalAgentRunAuthority(reader,request,caller,now);if(!original.facts)return deny(...original.reasons);
 const {project,record,context,task,item,source,workspace,runtime,skills}=original.facts;if(!host?.agent?.checkModelAuthority)return deny('AGENT_MODEL_HOST_UNAVAILABLE');
 let active=true;
 const take=<T>(read:()=>T):T=>{if(!active)throw Error('Original model snapshot reader expired');return structuredClone(read());};
 const scoped:AgentRunOriginalResultReader=Object.freeze({
  getCurrentProject:()=>take(()=>reader.getProject()),getActor:id=>take(()=>reader.getActor(id)),getRun:id=>take(()=>reader.getRun(id)),
  getRuntimeRecord:(kind,id)=>take(()=>reader.getRuntimeRecord(kind,id)),listRuntimeRecords:(kind,changeId)=>take(()=>reader.listRuntimeRecords(kind,changeId)),
  getCommandReceipt:id=>take(()=>{if(!reader.getCommandReceipt)throw Error('Original receipt snapshot reader unavailable');return reader.getCommandReceipt(id);}),
  getExecutionObject:(kind,id)=>take(()=>reader.getExecutionObject(kind,id)),getVerificationRecord:(kind,id)=>take(()=>reader.getVerificationRecord(kind,id))
 });
 let validation:Digest;try{
  const value:unknown=host.agent.checkModelAuthority(structuredClone(project),structuredClone({request,record,context,task,work_item:item,source,workspace,runtime_binding:request.runtime_binding,skill_bindings:request.skill_bindings,runtime,skills}),scoped);
  if(value instanceof Promise){void Promise.prototype.then.call(value,undefined,()=>{});throw Error('Asynchronous model authority unavailable');}
  if(value!==null&&(typeof value==='object'||typeof value==='function')){let then:unknown;try{then=Reflect.get(value,'then');}catch{void Promise.resolve(value).then(undefined,()=>{});throw Error('Asynchronous model authority unavailable');}if(typeof then==='function'){void Promise.resolve(value).then(undefined,()=>{});throw Error('Asynchronous model authority unavailable');}}
  validation=structuredClone(compileValidator<Digest>(DigestSchema)(value));
 }catch{return deny('AGENT_MODEL_HOST_PROOF_UNPROVEN');}finally{active=false;}
 return {...base,decision:'ALLOW',reasons:[],authority:{change_id:task.change_id,task_id:task.id,work_item_id:item.id,run_record_id:record.id,context_id:context.id,host_admission_ref:structuredClone(record.host_admission_ref),host_validation_digest:validation,basis_digest:contentDigest({request,record,context,task,work_item:item,source,workspace,runtime,skills,host_validation_digest:validation})}};
}
