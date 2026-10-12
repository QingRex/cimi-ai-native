import {join,resolve,relative,isAbsolute} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {bytesAt,digest,RuntimeAdapterError} from './files.js';
import {parseGatewayJson} from './gateway-conversation.js';
import {readAgentRuntimeOriginalIdentity,readAgentRuntimeCancellationOriginal,type collectAgentRuntimeOperation} from './agent-runtime-operation.js';
import {readOriginalAgentWorkspaceOperation} from './agent-workspace-sandbox-recovery.js';
import {verifyCollectedAgentRuntimeCancellation} from './agent-runtime-cancellation.js';
import {readOriginalAgentJobObservation} from './agent-job-policy.js';
import {readAgentNamedMethodOriginals} from './agent-named-method-host.js';
import {readAgentRuntimeModelOriginals} from './agent-runtime-model.js';
import {readAgentWorkspaceIpcOriginals,correlateAgentWorkspaceSdkOriginals} from './agent-workspace-ipc-journal.js';
import type {AgentNamedMethodResultInputs} from './agent-named-method-result.js';
type Collection=Awaited<ReturnType<typeof collectAgentRuntimeOperation>>;
export interface OriginalNamedCancellation {
 format:'cimiloop/original-named-cancellation/1.0.0';status:'Observed'|'Unknown';reason:string;cancellation_reverified:boolean;
 matched_calls:number;method_result_reverified:false;costs_reconciled:false;domain_observation_produced:false;formal_agent_execution_enabled:false;
 output?:never;output_digest?:never;method_failure_reverified?:never;failure?:never;
 cancellation?:NonNullable<ReturnType<typeof verifyCollectedAgentRuntimeCancellation>>;
 artifacts:{name:string;path:string;digest:string}[];
}
function fail():never{throw new RuntimeAdapterError('agent_named_cancellation_unproven');}
const parse=(bytes:Buffer,limit=65536)=>structuredClone(parseGatewayJson(new TextDecoder('utf8',{fatal:true}).decode(bytes),limit));
const object=(bytes:Buffer,limit=65536):Record<string,unknown>=>{const v=parse(bytes,limit);if(!v||typeof v!=='object'||Array.isArray(v))fail();return v as Record<string,unknown>;};
// A cancelled invocation has no successful method output. Verify its original
// complete call prefix and Native cancellation independently, never initialize,
// resume, cancel, repair, bill or grant a domain/qualification conclusion here.
export function readAgentRuntimeNamedMethodCancellation(root:string,rawScope:unknown,inputs:AgentNamedMethodResultInputs,collection:Collection):OriginalNamedCancellation {
 const unknown:OriginalNamedCancellation={format:'cimiloop/original-named-cancellation/1.0.0',status:'Unknown',reason:'agent_named_cancellation_unproven',cancellation_reverified:false,matched_calls:0,method_result_reverified:false,costs_reconciled:false,domain_observation_produced:false,formal_agent_execution_enabled:false,artifacts:[]};
 try {
  const identity=readAgentRuntimeOriginalIdentity(root,rawScope),scope=identity.scope,scopeDigest=digest(JSON.stringify(scope)).value,input=identity.input as Record<string,unknown>;
  if(!inputs||collection.format!=='cimiloop/agent-runtime-originals/1.0.0'||collection.scope_digest!==scopeDigest||collection.synthetic_model_responses!==null||identity.claim.synthetic_model_responses!==null||collection.status.status!=='Stopped'||collection.status.operation!==identity.operation||collection.status.resources_disposed!==true||collection.status.cancellation_requested!==true)fail();
  const names=new Set<string>();
  for(const a of collection.artifacts){
   if(!a||typeof a.name!=='string'||names.has(a.name)||a.reference.provider!=='cimiloop-runtime-probe'||a.reference.resource_type!=='agent_runtime_original_bytes'||a.reference.version!==a.name||a.reference.digest?.algorithm!=='sha256'||a.reference.locator!==join(resolve(root),'blobs',a.reference.digest.value)||digest(bytesAt(a.reference.locator,4*1024*1024)).value!==a.reference.digest.value)fail();names.add(a.name);
  }
  const original=readOriginalAgentWorkspaceOperation({root,scope,operation:identity.operation}),config=original.config,launch=original.launch,resources=original.resources,marker=readAgentRuntimeCancellationOriginal(root,scope);
  if(config.format!=='cimiloop/agent-workspace-sandbox-config/6.0.0'||!launch||!resources||!marker||config.prompt!==input.prompt||!same(config.owner,identity.claim.owner)||!same(config.binary_original,input.binary_original)||!same(launch.launcher_original,input.sandbox_original))fail();
  const cancellation=verifyCollectedAgentRuntimeCancellation({scope_digest:scopeDigest,owner:identity.claim.owner,operation_id:identity.claim.operation_id,cancellation_digest:marker!.digest.value,operation:identity.operation,input,...{markerBytes:marker!.bytes}},collection);
  if(!cancellation||!cancellation.runtime_resumed||cancellation.phase!=='running')fail();
  const artifacts:OriginalNamedCancellation['artifacts']=[];
  const capture=(name:string,path:string,maximum=65536)=>{const b=bytesAt(path,maximum);artifacts.push({name,path,digest:digest(b).value});return b;};
  for(const name of ['original-config.json','original-launcher.json','agent-sandbox-resources.json','agent-sandbox-original.json','agent-sandbox-cleanup.json','agent-sandbox-cancellation.json','incomplete.json']){
   const b=capture(name,join(identity.operation,name)),a=collection.artifacts.find(a=>a.name===name);if(!a||a.reference.digest?.value!==digest(b).value)fail();
  }
  const native=object(bytesAt(join(identity.operation,'agent-sandbox-original.json'))),cleanup=object(bytesAt(join(identity.operation,'agent-sandbox-cleanup.json'))),incomplete=object(bytesAt(join(identity.operation,'incomplete.json')));
  if(incomplete.format!=='cimiloop/opencode-workspace-incomplete/1.0.0'||incomplete.nonce!==config.nonce||incomplete.original_scope_digest!==scopeDigest||!same(incomplete.native_exit,{code:130,signal:null})||incomplete.interruption_reason!=='workspace_rehearsal_cancel_requested'||incomplete.completion_proven!==false)fail();
  const job=readOriginalAgentJobObservation(root,identity.operation,input,config,launch!,resources!);if(job)capture('agent-job-observation.json',join(identity.operation,'agent-job-observation.json'));
  const method=readAgentNamedMethodOriginals(root,scope,inputs.profile,inputs.files,config.method_original_binding),model=readAgentRuntimeModelOriginals(root,scope),ipc=readAgentWorkspaceIpcOriginals(root,scope,String(config.pipe_nonce));
  const admitted=(input.provider_options as Record<string,unknown>)?.admission_digest,endpoint=ipc.header?.endpoint;
  if(ipc.status!=='Observed'||ipc.unresolved||!endpoint||model.status!=='Observed'||!model.calls.length||model.calls.some(c=>c.state!=='reply_recorded'||!c.response)||model.task_packet_digest!==digest(String(input.prompt)).value||model.admission_digest!==admitted||(config.provider_options as Record<string,unknown>)?.admission_digest!==admitted||endpoint.model_admission_digest!==admitted)fail();
  if(Object.keys(native).sort().join(',')!=='active_process_limit,appcontainer_sid,format,network_capability_sids,nonce,peer,phase,supervisor'||native.format!=='cimiloop/agent-workspace-sandbox/1.0.0'||native.phase!=='suspended'||native.nonce!==config.nonce||native.active_process_limit!==1||!same(native.network_capability_sids,[])||native.appcontainer_sid!==endpoint!.appcontainer_sid||!same(native.peer,endpoint!.peer)||!same(native.supervisor,endpoint!.supervisor)||!same(launch!.supervisor,endpoint!.supervisor)||!same(resources!.runtime,native.peer))fail();
  const header=model.artifacts.find(a=>a.name==='header.json');if(!header)fail();
  if(!same(input.model_original_binding,model.original_evidence?{format:'cimiloop/agent-model-original-binding/1.0.0',header_digest:header!.digest,original_evidence:model.original_evidence}:undefined))fail();
  const stdout=capture('stdout.raw',join(identity.operation,'stdout.raw'),4*1024*1024);capture('stderr.raw',join(identity.operation,'stderr.raw'),4*1024*1024);
  const correlation=correlateAgentWorkspaceSdkOriginals(ipc,stdout);
  if(correlation.uncorrelated_exchanges||correlation.unmatched_sdk_calls||correlation.links.some(l=>!l.correlated))fail();
  const seen=new Set<string>(),models=new Set<string>();
  for(const e of ipc.exchanges){const request=e.request as Record<string,unknown>,reply=e.reply as Record<string,unknown>;if(e.state!=='reply_recorded'||reply.outcome!=='completed')fail();
   if(request.tool==='model_step'){const call=model.calls.find(c=>c.call_id===request.call_id);if(!call||!same(call.request,request)||!same(call.response,reply.receipt)||reply.replay!==models.has(call.call_id))fail();models.add(call.call_id);}
   else{const call=method.calls.find(c=>c.receipt.call_id===request.call_id);if(!call||!same(call.request,request)||!same(call.receipt,reply.receipt)||reply.replay!==seen.has(call.receipt.call_id)||!seen.size&&(call.receipt.function_name!=='invoke_skill'||call.receipt.argument!==method.context.profile.entry_name))fail();seen.add(call.receipt.call_id);}
  }
  if(seen.size!==method.calls.length||models.size!==model.calls.length)fail();
  // A valid interrupted SDK prefix can end with an unfinished final step; it
  // cannot contradict any original model reply or invent a completed output.
  type Step={id:string;text:string;tools:Record<string,unknown>[];finish:string|null};
  const steps:Step[]=[];let current:Step|undefined,session:string|undefined,suspended=false,ended=false;
  for(const line of new TextDecoder('utf8',{fatal:true}).decode(stdout).split(/\r?\n/)){
   if(!line.trim())continue;const event=object(Buffer.from(line),4*1024*1024);
   if(event.format==='cimiloop/agent-workspace-preparation/1.0.0'){if(suspended||event.nonce!==config.nonce||!same(event.supervisor,launch!.supervisor))fail();continue;}
   if(event.format==='cimiloop/agent-workspace-sandbox/1.0.0'&&event.phase==='suspended'){if(suspended||!same(event,native))fail();suspended=true;continue;}
   if(event.format==='cimiloop/agent-workspace-sandbox/1.0.0'){if(!suspended||ended||!same(event,cleanup))fail();ended=true;continue;}
   if(!suspended||ended||!['step_start','tool_use','text','step_finish'].includes(String(event.type))||typeof event.sessionID!=='string')fail();session??=String(event.sessionID);const part=event.part as Record<string,unknown>;
   if(event.sessionID!==session||!part||typeof part.messageID!=='string'||part.sessionID!==undefined&&part.sessionID!==session||event.type!=='step_finish'&&part.sessionID!==session)fail();
   if(event.type==='step_start'){if(current||part.type!=='step-start'||steps.some(s=>s.id===part.messageID)||steps.length>=64)fail();current={id:String(part.messageID),text:'',tools:[],finish:null};steps.push(current);continue;}
   if(!current||current.id!==part.messageID)fail();
   if(event.type==='text'){if(part.type!=='text'||typeof part.text!=='string'||Buffer.byteLength(current!.text+part.text)>32768)fail();current!.text+=part.text;}
   else if(event.type==='tool_use'){if(part.type!=='tool'||typeof part.callID!=='string'||current!.tools.some(t=>t.callID===part.callID))fail();current!.tools.push(part);}
   else{if(part.type!=='step-finish'||!['stop','tool-calls'].includes(String(part.reason)))fail();current!.finish=String(part.reason);current=undefined;}
  }
  const exchanges=ipc.exchanges.filter(e=>(e.request as Record<string,unknown>).tool==='model_step');
  if(!ended||exchanges.length!==model.calls.length)fail();
  // A durably recorded final stop reply can lose the race against the original
  // Native cancellation before the SDK emits its next step. Verify exactly one
  // such trailing reply; this proves neither SDK delivery nor method success.
  const unobservedFinal=steps.length+1===model.calls.length;
  if(steps.length!==model.calls.length&&!unobservedFinal)fail();
  if(unobservedFinal){
   const last=model.calls.at(-1)!,response=last.response!,exchange=exchanges.at(-1)!;
   if(response.finish!=='stop'||response.content.some(part=>part.type!=='text')||steps.at(-1)?.finish!=='tool-calls'||
    (exchange.request as Record<string,unknown>).call_id!==last.call_id||ipc.exchanges.at(-1)!==exchange)fail();
  }
  for(const [i,step] of steps.entries()){
   const response=model.calls[i]!.response!,tools=response.content.filter(c=>c.type==='tool-call'),text=response.content.filter(c=>c.type==='text').map(c=>c.text).join(''),next=exchanges[i+1];
   if(i!==model.calls.length-1&&(response.finish==='stop'||step.finish!=='tool-calls'))fail();
   if((exchanges[i]!.request as Record<string,unknown>).call_id!==model.calls[i]!.call_id||step.finish!==null&&(step.finish!==(response.finish==='stop'?'stop':'tool-calls')||step.text!==text||step.tools.length!==tools.length)||step.finish===null&&(i!==steps.length-1||!text.startsWith(step.text)||step.tools.length>tools.length))fail();
   const effects=correlation.links.filter(l=>l.sdk?.message_id===step.id);if(effects.length!==step.tools.length||effects.some(e=>e.sdk?.session_id!==session||Number(e.ordinal)<=Number(exchanges[i]!.ordinal)||next&&Number(e.ordinal)>=Number(next.ordinal)))fail();
   for(const [n,part] of step.tools.entries()){const tool=tools[n]!,state=part.state as Record<string,unknown>;if(part.callID!==tool.tool_call_id||part.tool!==tool.tool_name||state?.status!=='completed'||!same(state.input,parse(Buffer.from(tool.arguments),16384)))fail();}
  }
  const markerArtifact=collection.artifacts.find(a=>a.name==='agent-runtime-cancel.json');if(!markerArtifact)fail();artifacts.push({name:'agent-runtime-cancel.json',path:markerArtifact!.reference.locator,digest:marker!.digest.value});
  artifacts.push(...method.artifacts.map(a=>({...a,name:'method/'+a.name})),...model.artifacts.map(a=>({...a,name:'model/'+a.name})),...ipc.artifacts.map(a=>({...a,name:'ipc/'+a.name})));
  if(new Set(artifacts.map(a=>a.name)).size!==artifacts.length)fail();
  for(const a of artifacts){const rel=relative(resolve(root),resolve(a.path));if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||digest(bytesAt(a.path,['stdout.raw','stderr.raw'].includes(a.name)?4*1024*1024:114688)).value!==a.digest)fail();}
  if(!same(identity,readAgentRuntimeOriginalIdentity(root,scope))||!same(original,readOriginalAgentWorkspaceOperation({root,scope,operation:identity.operation}))||!same(marker,readAgentRuntimeCancellationOriginal(root,scope))||!same(method,readAgentNamedMethodOriginals(root,scope,inputs.profile,inputs.files,config.method_original_binding))||!same(model,readAgentRuntimeModelOriginals(root,scope))||!same(ipc,readAgentWorkspaceIpcOriginals(root,scope,String(config.pipe_nonce))))fail();
  return {...unknown,status:'Observed',reason:'agent_named_cancellation_reverified',cancellation_reverified:true,matched_calls:seen.size,cancellation,artifacts};
 }catch{return unknown;}
}
