import {agentWorkspaceConfigBaseFormat} from './agent-runtime-startup.js';
import {readOriginalAgentJobObservation} from './agent-job-policy.js';
import {join} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import type {SkillMethodOutput,Digest} from '@cimiloop/protocol/v2';
import {bytesAt,digest,RuntimeAdapterError} from './files.js';
import {parseGatewayJson} from './gateway-conversation.js';
import {readAgentRuntimeOriginalIdentity} from './agent-runtime-operation.js';
import {readOriginalAgentWorkspaceOperation} from './agent-workspace-sandbox-recovery.js';
import {readAgentNamedMethodOriginals} from './agent-named-method-host.js';
import {readAgentRuntimeModelOriginals} from './agent-runtime-model.js';
import {readAgentWorkspaceIpcOriginals,correlateAgentWorkspaceSdkOriginals} from './agent-workspace-ipc-journal.js';
import {validateFixedMethodOutput} from './fixed-method.js';
export interface AgentNamedMethodResultInputs {profile:unknown;files:{path:string;content:string}[]}
export interface AgentNamedMethodResult {
 status:'Observed'|'Unknown';reason:string;matched_calls:number;method_result_reverified:boolean;
 output?:SkillMethodOutput;output_digest?:Digest;
 // Present only for a closed original whose final text fails the fixed contract.
 method_failure_reverified?:true;failure?:{code:'agent_named_method_output_invalid';returned_text_digest:Digest};
 artifacts:{name:string;path:string;digest:string}[];
 model_account_custody_proven:false;costs_reconciled:false;domain_observation_produced:false;formal_agent_execution_enabled:false;
}
function fail():never {throw new RuntimeAdapterError('agent_method_result_unproven');}
const json=(bytes:Buffer,limit=4*1024*1024)=>structuredClone(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes),limit));
const object=(bytes:Buffer,limit=65536):Record<string,unknown>=>{const raw=json(bytes,limit);if(!raw||typeof raw!=='object'||Array.isArray(raw))fail();return raw as Record<string,unknown>;};
// Read-only, independent material and semantic result verification. Expected
// inputs must come from the original immutable method plan, not SDK output.
// A successful result still requires qualification/account/billing and Kernel
// SkillInvocationObservation; this function grants no execution permission.
export function readAgentRuntimeNamedMethodResult(root:string,rawScope:unknown,inputs?:AgentNamedMethodResultInputs):AgentNamedMethodResult {
 const summary:AgentNamedMethodResult={status:'Unknown',reason:inputs?'agent_method_result_unproven':'agent_method_original_inputs_missing',matched_calls:0,method_result_reverified:false,artifacts:[],model_account_custody_proven:false,costs_reconciled:false,domain_observation_produced:false,formal_agent_execution_enabled:false};
 if(!inputs)return summary;
 try {
  const identity=readAgentRuntimeOriginalIdentity(root,rawScope),scope=identity.scope;
  const critical=['original-config.json','original-launcher.json','agent-sandbox-resources.json','agent-sandbox-original.json','result.json'].map(name=>{const path=join(identity.operation,name),bytes=bytesAt(path,name==='result.json'?4*1024*1024:65536);return {name,path,digest:digest(bytes).value,bytes};});
  const original=readOriginalAgentWorkspaceOperation({root,scope,operation:identity.operation}),config=original.config,input=identity.input as Record<string,unknown>;
  if(agentWorkspaceConfigBaseFormat(config)!=='cimiloop/agent-workspace-sandbox-config/6.0.0'||!original.launch||!original.resources)fail();
  const job=readOriginalAgentJobObservation(root,identity.operation,input,config,original.launch,original.resources);
  if(job)critical.push({name:'agent-job-observation.json',path:join(identity.operation,'agent-job-observation.json'),digest:job.digest.value,bytes:job.bytes});
  const method=readAgentNamedMethodOriginals(root,scope,inputs.profile,inputs.files,config.method_original_binding);
  const model=readAgentRuntimeModelOriginals(root,scope),ipc=readAgentWorkspaceIpcOriginals(root,scope,String(config.pipe_nonce));
  if(ipc.status!=='Observed'||ipc.unresolved||!ipc.header||model.status!=='Observed'||model.calls.some(c=>!c.response)||input.prompt!==config.prompt||model.task_packet_digest!==digest(String(input.prompt)).value)fail();
  const endpoint=ipc.header.endpoint,native=object(bytesAt(join(identity.operation,'agent-sandbox-original.json'),65536));
  const admitted=(input.provider_options as Record<string,unknown>)?.admission_digest;
  if(Object.keys(native).sort().join(',')!=='active_process_limit,appcontainer_sid,format,network_capability_sids,nonce,peer,phase,supervisor'||native.format!=='cimiloop/agent-workspace-sandbox/1.0.0'||!same(native.network_capability_sids,[])||native.active_process_limit!==1)fail();
  if(model.admission_digest!==admitted||(config.provider_options as Record<string,unknown>)?.admission_digest!==admitted||endpoint.model_admission_digest!==admitted||native.phase!=='suspended'||native.nonce!==config.nonce||native.appcontainer_sid!==endpoint.appcontainer_sid||!same(native.peer,endpoint.peer)||!same(native.supervisor,endpoint.supervisor)||!same(original.launch.supervisor,endpoint.supervisor)||!same(original.resources.runtime,native.peer)||original.resources.phase!=='ended'||original.resources.resources_disposed!==true)fail();
  const stdoutPath=join(identity.operation,'stdout.raw'),stdout=bytesAt(stdoutPath,4*1024*1024),correlation=correlateAgentWorkspaceSdkOriginals(ipc,stdout);
  if(correlation.uncorrelated_exchanges||correlation.unmatched_sdk_calls||correlation.links.some(l=>!l.correlated))fail();
  const modelHeader=model.artifacts.find(a=>a.name==='header.json');if(!modelHeader)fail();
  const modelBinding=model.original_evidence?{format:'cimiloop/agent-model-original-binding/1.0.0',header_digest:modelHeader.digest,original_evidence:model.original_evidence}:undefined;
  if(!same(input.model_original_binding,modelBinding))fail();
  const seen=new Set<string>(),modelSeen=new Set<string>();let firstMethod=true;
  for(const exchange of ipc.exchanges){const request=exchange.request as Record<string,unknown>,reply=exchange.reply as Record<string,unknown>;if(exchange.state!=='reply_recorded'||reply.outcome!=='completed')fail();
   if(request.tool==='model_step'){const call=model.calls.find(c=>c.call_id===request.call_id);if(!call||!same(call.request,request)||!same(call.response,reply.receipt)||reply.replay!==modelSeen.has(call.call_id))fail();modelSeen.add(call.call_id);continue;}
   const call=method.calls.find(c=>c.receipt.call_id===request.call_id);if(!call||!same(call.request,request)||!same(call.receipt,reply.receipt)||reply.replay!==seen.has(call.receipt.call_id))fail();
   if(firstMethod&&(call.receipt.function_name!=='invoke_skill'||call.receipt.argument!==method.context.profile.entry_name))fail();firstMethod=false;seen.add(call.receipt.call_id);
  }
  if(modelSeen.size!==model.calls.length||seen.size!==method.calls.length||method.context.profile.resources.some(r=>!method.calls.some(c=>seen.has(c.receipt.call_id)&&c.receipt.resource_path===r.path)))fail();
  const steps:{id:string;text:string;tools:Record<string,unknown>[];finish:string|null}[]=[];let suspended=false;let session:string|undefined,current:typeof steps[number]|undefined,footer:Record<string,unknown>|undefined;
  for(const line of new TextDecoder('utf-8',{fatal:true}).decode(stdout).split(/\r?\n/)){if(!line.trim())continue;const event=object(Buffer.from(line),4*1024*1024);
   if(event.format==='cimiloop/agent-workspace-preparation/1.0.0'){if(current||steps.length||event.nonce!==config.nonce||!same(event.supervisor,original.launch.supervisor))fail();continue;}
   if(event.format==='cimiloop/agent-workspace-sandbox/1.0.0'&&event.phase==='suspended'){if(suspended||current||steps.length||!same(event,native))fail();suspended=true;continue;}
   if(event.format==='cimiloop/agent-workspace-sandbox/1.0.0'){if(!suspended||footer||current||event.phase!=='ended'||event.nonce!==config.nonce||event.reason!=='exited'||event.exit_code!==0||event.resources_disposed!==true||!same(event.cleanup_errors,[])||event.formal_agent_execution_enabled!==false)fail();footer=event;continue;}
   if(!suspended||footer||!['step_start','tool_use','text','step_finish'].includes(String(event.type))||typeof event.sessionID!=='string')fail();session??=event.sessionID as string;const part=event.part as Record<string,unknown>;
   if(event.sessionID!==session||!part||(part.sessionID!==undefined&&part.sessionID!==session)||(event.type!=='step_finish'&&part.sessionID!==session)||typeof part.messageID!=='string')fail();
   if(event.type==='step_start'){if(part.type!=='step-start'||current||steps.some(s=>s.id===part.messageID)||steps.length>=64)fail();current={id:part.messageID,text:'',tools:[],finish:null};steps.push(current);continue;}
   if(!current||current.id!==part.messageID)fail();
   if(event.type==='text'){if(part.type!=='text'||typeof part.text!=='string'||Buffer.byteLength(current.text+part.text)>32768)fail();current.text+=part.text;}
   else if(event.type==='tool_use'){if(part.type!=='tool'||typeof part.callID!=='string'||current.tools.some(t=>t.callID===part.callID))fail();current.tools.push(part);}
   else {if(part.type!=='step-finish'||!['stop','tool-calls'].includes(String(part.reason)))fail();current.finish=String(part.reason);current=undefined;}
  }
  const cleanupPath=join(identity.operation,'agent-sandbox-cleanup.json'),cleanupBytes=bytesAt(cleanupPath,65536);if(current||!footer||!same(json(cleanupBytes),footer)||steps.length!==model.calls.length)fail();
  const runtimeResult=object(critical.find(a=>a.name==='result.json')!.bytes,4*1024*1024),exit=runtimeResult.native_exit as Record<string,unknown>;
  if(runtimeResult.format!=='cimiloop/opencode-workspace-runtime/1.0.0'||runtimeResult.original_scope_digest!==config.scope_digest||runtimeResult.operation!==identity.operation||!same(runtimeResult.sandbox,native)||!same(runtimeResult.method_original_binding,config.method_original_binding)||!exit||exit.code!==0||exit.signal!==null||!same(runtimeResult.disposal,footer)||runtimeResult.source_bytes_unchanged!==true||runtimeResult.output_limit_exceeded!==false)fail();
  const modelExchanges=ipc.exchanges.filter(e=>(e.request as Record<string,unknown>).tool==='model_step');if(modelExchanges.length!==model.calls.length||correlation.links.some(l=>!l.sdk||l.sdk.session_id!==session||!steps.some(s=>s.id===l.sdk!.message_id)))fail();
  for(const [i,step] of steps.entries()){const modelExchange=modelExchanges[i]!,next=modelExchanges[i+1],effects=correlation.links.filter(l=>l.sdk?.message_id===step.id);
   if((modelExchange.request as Record<string,unknown>).call_id!==model.calls[i]!.call_id||step.finish!==(next?'tool-calls':'stop')||next&&Number(modelExchange.ordinal)>=Number(next.ordinal)||effects.length!==step.tools.length||effects.some(e=>Number(e.ordinal)<=Number(modelExchange.ordinal)||next&&Number(e.ordinal)>=Number(next.ordinal)))fail();
   const response=model.calls[i]!.response!,tools=response.content.filter(c=>c.type==='tool-call');if(step.finish!==(response.finish==='stop'?'stop':'tool-calls')||step.text!==response.content.filter(c=>c.type==='text').map(c=>c.text).join('')||step.tools.length!==tools.length||response.finish==='stop'&&i!==steps.length-1)fail();
   for(const [n,tool] of tools.entries()){const part=step.tools[n]!,state=part.state as Record<string,unknown>;if(part.callID!==tool.tool_call_id||part.tool!==tool.tool_name||!state||state.status!=='completed'||!same(state.input,json(Buffer.from(tool.arguments))))fail();}
  }
  const last=steps.at(-1);if(!last||last.finish!=='stop'||last.tools.length)fail();
  let output:SkillMethodOutput|undefined,failure:AgentNamedMethodResult['failure'];
  // Only the original final text contract is negative evidence. Every custody,
  // Native/SDK/IPC/model/Job and reread failure remains Unknown outside this catch.
  try{output=validateFixedMethodOutput(json(Buffer.from(last.text),32768),method.context.request.input);}catch{failure={code:'agent_named_method_output_invalid',returned_text_digest:digest(last.text)};}
  const artifacts=[...critical.map(({bytes:_,...a})=>a),...method.artifacts.map(a=>({...a,name:'method/'+a.name})),...model.artifacts.map(a=>({...a,name:'model/'+a.name})),...ipc.artifacts.map(a=>({...a,name:'ipc/'+a.name})),{name:'stdout.raw',path:stdoutPath,digest:digest(stdout).value},{name:'agent-sandbox-cleanup.json',path:cleanupPath,digest:digest(cleanupBytes).value}];
  for(const a of artifacts)if(digest(bytesAt(a.path,['stdout.raw','result.json'].includes(a.name)?4*1024*1024:114688)).value!==a.digest)fail();
  if(!same(readAgentRuntimeOriginalIdentity(root,scope),identity)||
    !same(readAgentNamedMethodOriginals(root,scope,inputs.profile,inputs.files,config.method_original_binding),method)||
    !same(readAgentRuntimeModelOriginals(root,scope),model)||!same(readAgentWorkspaceIpcOriginals(root,scope,String(config.pipe_nonce)),ipc)||
    !same(readOriginalAgentWorkspaceOperation({root,scope,operation:identity.operation}),original))fail();
  if(failure)return {...summary,status:'Observed',reason:'agent_named_method_output_invalid',matched_calls:seen.size,method_failure_reverified:true,failure,artifacts};
  if(!output)fail();return {...summary,status:'Observed',reason:'agent_named_method_result_reverified',matched_calls:seen.size,method_result_reverified:true,output,output_digest:digest(JSON.stringify(output)),artifacts};
 }catch{return summary;}
}
