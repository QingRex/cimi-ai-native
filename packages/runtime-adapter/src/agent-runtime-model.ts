import { mkdirSync, writeFileSync, openSync, fsyncSync, closeSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { bytesAt, digest, directory, assertOrdinaryPath, RuntimeAdapterError } from "./files.js";
import { copyToolJson, TOOL_RECORD_BYTES } from "./tool-journal.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import { parseAgentWorkspaceToolScope, type AgentWorkspaceToolScope } from "./agent-workspace-authority.js";

export interface AgentRuntimeModelResponse {
 content: ({type:"text";text:string}|{type:"tool-call";tool_call_id:string;tool_name:string;arguments:string})[];
 usage:{input_tokens:number;output_tokens:number}; finish:"stop"|"tool_calls";
}
// Trusted code only. check must verify the complete original model/account,
// tariff, held budget and live qualification. No HTTP/CLI can install this port.
// Token usage is not a bill. Default factories stay closed; dedicated code
// composition requires a separately installed, approved account service.
export interface AgentModelOriginalEvidence {kind:"dedicated_zhipu/1.0.0";header_digest:string}
export interface AgentRuntimeModelPort {
 original_evidence?:AgentModelOriginalEvidence;
 admission_digest:string;
 check(scope:AgentWorkspaceToolScope):Promise<void>;
 execute(input:ReturnType<typeof parseAgentRuntimeModelRequest>,signal?:AbortSignal):Promise<AgentRuntimeModelResponse>;
}
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).sort().join(",")===keys.sort().join(",");
const id=(v:unknown):v is string=>typeof v==="string"&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
const sha=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const permittedTools=(names:string[])=>names.every(name=>["cimi_read","cimi_replace","cimi_check"].includes(name))||names.length===2&&names.includes("cimi_invoke_skill")&&names.includes("cimi_read_method_resource");
function fail(reason:string):never {throw new RuntimeAdapterError(reason);}
const bounded=(v:unknown)=>copyToolJson(parseGatewayJson(JSON.stringify(v),TOOL_RECORD_BYTES));
const read=(path:string)=>bounded(parseGatewayJson(new TextDecoder("utf-8",{fatal:true}).decode(bytesAt(path,TOOL_RECORD_BYTES)),TOOL_RECORD_BYTES));
const save=(path:string,value:unknown)=>{assertOrdinaryPath(path);const bytes=Buffer.from(JSON.stringify(bounded(value)));const fd=openSync(path,"wx");try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}};
export function parseAgentModelOriginalEvidence(raw:unknown):AgentModelOriginalEvidence|undefined {if(raw===undefined)return undefined;if(!exact(raw,["kind","header_digest"])||raw.kind!=="dedicated_zhipu/1.0.0"||!sha(raw.header_digest))fail("agent_model_original_evidence_unproven");return structuredClone(raw) as unknown as AgentModelOriginalEvidence;}
function waitOriginal<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T> {
 if(!signal)return promise;
 return new Promise<T>((done,reject)=>{
  let settled=false;
  const finish=(error:unknown,value?:T)=>{if(settled)return;settled=true;signal.removeEventListener("abort",abort);if(error)reject(error);else done(value!);};
  const abort=()=>finish(new RuntimeAdapterError("agent_model_original_aborted"));
  signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();
  promise.then(value=>finish(null,value),error=>finish(error));
 });
}
export function parseAgentRuntimeModelRequest(rawScope:unknown,raw:unknown,permitted:string[]) {
 const scope=parseAgentWorkspaceToolScope(rawScope),v=bounded(raw);
 if(!exact(v,["format","scope_digest","admission_digest","call_id","tool","prompt","tools","max_output_tokens"])||v.format!=="cimiloop/agent-runtime-model-request/1.0.0"||
 v.scope_digest!==digest(JSON.stringify(scope)).value||!sha(v.admission_digest)||!id(v.call_id)||v.tool!=="model_step"||!Array.isArray(v.prompt)||!v.prompt.length||v.prompt.length>128||
 !Array.isArray(v.tools)||v.tools.length>3||!Number.isSafeInteger(v.max_output_tokens)||(v.max_output_tokens as number)<1||(v.max_output_tokens as number)>512)fail("agent_model_request_denied");
 const names=new Set<string>();for(const tool of v.tools){if(!tool||typeof tool!=="object"||Array.isArray(tool)||!("name" in tool)||!id(tool.name)||!permitted.includes(tool.name)||names.has(tool.name))fail("agent_model_tools_denied");names.add(tool.name);}
 return {format:v.format,scope_digest:v.scope_digest,admission_digest:v.admission_digest,call_id:v.call_id,tool:v.tool,prompt:v.prompt,tools:v.tools,max_output_tokens:v.max_output_tokens as number};
}
export function parseAgentRuntimeModelResponse(raw:unknown,request:ReturnType<typeof parseAgentRuntimeModelRequest>):AgentRuntimeModelResponse {
 const v=bounded(raw);if(!exact(v,["content","usage","finish"])||!Array.isArray(v.content)||!v.content.length||v.content.length>8||!exact(v.usage,["input_tokens","output_tokens"])||
 ![v.usage.input_tokens,v.usage.output_tokens].every(n=>Number.isSafeInteger(n)&&(n as number)>=0&&(n as number)<=1000000)||(v.usage.output_tokens as number)>request.max_output_tokens||!["stop","tool_calls"].includes(String(v.finish)))fail("agent_model_response_denied");
 const calls=new Set<string>();let textBytes=0;
 for(const item of v.content){if(exact(item,["type","text"])&&item.type==="text"&&typeof item.text==="string"&&item.text.isWellFormed())textBytes+=Buffer.byteLength(item.text);
 else if(exact(item,["type","tool_call_id","tool_name","arguments"])&&item.type==="tool-call"&&id(item.tool_call_id)&&!calls.has(item.tool_call_id)&&typeof item.arguments==="string"&&
 item.arguments.isWellFormed()&&Buffer.byteLength(item.arguments)<=16384&&request.tools.some(t=>t&&typeof t==="object"&&"name" in t&&t.name===item.tool_name)){
  parseGatewayJson(item.arguments,16384);calls.add(item.tool_call_id);
 }else fail("agent_model_response_denied");}
 if(textBytes>16384||(calls.size>0)!==(v.finish==="tool_calls"))fail("agent_model_response_denied");return v as unknown as AgentRuntimeModelResponse;
}
// Durable one-send boundary for original SDK model steps. A partially recorded
// send/reply is Unknown forever here; only provider original-operation billing
// reconciliation may resolve it. No timeout or lost IPC acknowledgement resends.
export class AgentRuntimeModelHost {
 private readonly inflight=new Map<string,{input:unknown;promise:Promise<{receipt:AgentRuntimeModelResponse;replay:boolean}>}>();
 private constructor(readonly path:string,private readonly scope:AgentWorkspaceToolScope,private readonly port:AgentRuntimeModelPort,private readonly permitted:string[],private readonly header:unknown,private readonly spine:string,private readonly taskPacket:string|null){}
 static async open(root:string,rawScope:unknown,port:AgentRuntimeModelPort,permitted:string[],taskPacket:string|null=null,signal?:AbortSignal) {
  const scope=parseAgentWorkspaceToolScope(rawScope);
  const originalEvidence=parseAgentModelOriginalEvidence(port?.original_evidence);
  port={admission_digest:port?.admission_digest,check:port?.check?.bind(port),execute:port?.execute?.bind(port),...(originalEvidence?{original_evidence:originalEvidence}:{})}; permitted=[...permitted];
  if(!port||!sha(port.admission_digest)||typeof port.check!=="function"||typeof port.execute!=="function"||!permitted.length||permitted.length>3||new Set(permitted).size!==permitted.length||!permittedTools(permitted))fail("agent_model_admission_unavailable");
  if(taskPacket!==null&&(typeof taskPacket!=="string"||!taskPacket.isWellFormed()||Buffer.byteLength(taskPacket)>32768||taskPacket.split(/\r?\n/).length>1000||taskPacket.split(/\r?\n/).some(line=>Buffer.byteLength(line)>1800)))fail("agent_model_task_packet_invalid");
  signal?.throwIfAborted();await waitOriginal(port.check(structuredClone(scope)),signal);signal?.throwIfAborted();
  const parent=directory(join(root,"agent-runtime-model-originals",scope.project_id)),path=assertOrdinaryPath(join(parent,scope.run_id));
  const header={format:originalEvidence?"cimiloop/agent-runtime-model-originals/2.0.0":"cimiloop/agent-runtime-model-originals/1.0.0",...(originalEvidence?{original_evidence:originalEvidence}:{}),scope,admission_digest:port.admission_digest,permitted:[...permitted],maximum_calls:64,task_packet_digest:taskPacket===null?null:digest(taskPacket).value};
  const spine=assertOrdinaryPath(join(root,"agent-runtime-model-starts",scope.project_id,scope.run_id));
  try{if(!isDeepStrictEqual(read(join(path,"header.json")),header)||!isDeepStrictEqual(read(join(spine,"header.json")),header))fail("agent_model_original_unproven");}catch{fail("agent_model_original_unproven");}
  return new AgentRuntimeModelHost(path,scope,{admission_digest:port.admission_digest,check:port.check.bind(port),execute:port.execute.bind(port)},[...permitted],header,spine,taskPacket);
 }
 // Staging only, before the independent original Run custody is claimed. This
 // immutable separate start/spine refuses recreation of lost ledger/call files.
 static async initialize(root:string,rawScope:unknown,port:AgentRuntimeModelPort,permitted:string[],taskPacket:string|null=null,signal?:AbortSignal) {
  const scope=parseAgentWorkspaceToolScope(rawScope);
  const originalEvidence=parseAgentModelOriginalEvidence(port?.original_evidence);
  port={admission_digest:port?.admission_digest,check:port?.check?.bind(port),execute:port?.execute?.bind(port),...(originalEvidence?{original_evidence:originalEvidence}:{})}; permitted=[...permitted];
  if(!port||!sha(port.admission_digest)||!permitted.length||permitted.length>3||new Set(permitted).size!==permitted.length||!permittedTools(permitted))fail("agent_model_admission_unavailable");
  if(taskPacket!==null&&(typeof taskPacket!=="string"||!taskPacket.isWellFormed()||Buffer.byteLength(taskPacket)>32768||taskPacket.split(/\r?\n/).length>1000||taskPacket.split(/\r?\n/).some(line=>Buffer.byteLength(line)>1800)))fail("agent_model_task_packet_invalid");
  signal?.throwIfAborted();await waitOriginal(port.check(structuredClone(scope)),signal);signal?.throwIfAborted();
  const header={format:originalEvidence?"cimiloop/agent-runtime-model-originals/2.0.0":"cimiloop/agent-runtime-model-originals/1.0.0",...(originalEvidence?{original_evidence:originalEvidence}:{}),scope,admission_digest:port.admission_digest,permitted:[...permitted],maximum_calls:64,task_packet_digest:taskPacket===null?null:digest(taskPacket).value};
  const parent=directory(join(root,"agent-runtime-model-starts",scope.project_id)),spine=assertOrdinaryPath(join(parent,scope.run_id));
  let created=false;try{mkdirSync(spine);created=true;}catch(error){if(!(error&&typeof error==="object"&&"code" in error&&error.code==="EEXIST"))throw error;}
  if(created){
   save(join(spine,"header.json"),header);
   const originals=directory(join(root,"agent-runtime-model-originals",scope.project_id)),path=assertOrdinaryPath(join(originals,scope.run_id));
   mkdirSync(path);save(join(path,"header.json"),header);
  }
  return this.open(root,scope,port,permitted,taskPacket,signal);
 }
 get toolNames(){return [...this.permitted];}
 get taskPacketDigest(){return this.taskPacket===null?null:digest(this.taskPacket).value;}
 get originalBinding(){const header=this.header as {original_evidence?:AgentModelOriginalEvidence};return header.original_evidence?{format:"cimiloop/agent-model-original-binding/1.0.0" as const,header_digest:digest(JSON.stringify(this.header)).value,original_evidence:structuredClone(header.original_evidence)}:undefined;}
 get admissionDigest(){return this.port.admission_digest;}
 async check(rawScope:unknown,signal?:AbortSignal){if(!isDeepStrictEqual(parseAgentWorkspaceToolScope(rawScope),this.scope))fail("agent_model_scope_mismatch");signal?.throwIfAborted();await waitOriginal(this.port.check(structuredClone(this.scope)),signal);signal?.throwIfAborted();}
 async execute(raw:unknown,signal?:AbortSignal):Promise<{receipt:AgentRuntimeModelResponse;replay:boolean}> {
  const input=parseAgentRuntimeModelRequest(this.scope,raw,this.permitted);if(input.admission_digest!==this.port.admission_digest)fail("agent_model_admission_mismatch");const prior=this.inflight.get(input.call_id);
  if(prior){if(!isDeepStrictEqual(prior.input,input))fail("agent_model_input_conflict");return prior.promise;}
  if(this.taskPacket!==null){
   const lines=this.taskPacket.split(/\r?\n/),projection=lines.map((line,i)=>String(i+1)+": "+line).join("\n");
   const expected="<content>\n"+projection+"\n\n(End of file - total "+lines.length+" lines)\n</content>";
   const texts=input.prompt.flatMap(message=>message&&typeof message==="object"&&"content" in message&&Array.isArray(message.content)?message.content:[]);
   if(!texts.some(part=>part&&typeof part==="object"&&"type" in part&&part.type==="text"&&"text" in part&&typeof part.text==="string"&&part.text.includes(expected)))fail("agent_model_task_packet_incomplete");
  }
  const promise=this.dispatch(input,signal);this.inflight.set(input.call_id,{input,promise});try{return await promise;}finally{this.inflight.delete(input.call_id);}
 }
 private async dispatch(input:ReturnType<typeof parseAgentRuntimeModelRequest>,signal?:AbortSignal){
  if(!isDeepStrictEqual(read(join(this.path,"header.json")),this.header)||!isDeepStrictEqual(read(join(this.spine,"header.json")),this.header))fail("agent_model_original_unproven");
  const claim=assertOrdinaryPath(join(this.spine,input.call_id)),path=assertOrdinaryPath(join(this.path,input.call_id)),requestPath=join(path,"request.json"),replyPath=join(path,"reply.json");
  if(existsSync(path)){
   try{if(!isDeepStrictEqual(read(join(claim,"request.json")),input))fail("agent_model_original_unproven");}catch{fail("agent_model_original_unproven");}
   let prior:unknown;try{prior=read(requestPath);}catch{fail("agent_model_original_unproven");}
   if(!isDeepStrictEqual(prior,input))fail("agent_model_input_conflict");if(!existsSync(replyPath))fail("agent_model_original_unknown");
   try{const saved=read(replyPath);if(!exact(saved,["request_digest","response_digest","response"])||saved.request_digest!==digest(JSON.stringify(input)).value||saved.response_digest!==digest(JSON.stringify(saved.response)).value)fail("agent_model_original_unproven");
    return {receipt:parseAgentRuntimeModelResponse(saved.response,input),replay:true};}catch{fail("agent_model_original_unproven");}
  }
  if(existsSync(claim))fail("agent_model_original_unknown");
  const previous=readdirSync(this.spine).filter(name=>name!=="header.json").sort();
  if(previous.some((name,i)=>name!=="model_"+String(i+1).padStart(4,"0"))||previous.length>=64)fail("agent_model_original_unproven");
  for(const name of previous){
   const original=read(join(this.spine,name,"request.json")),body=join(this.path,name,"request.json"),reply=join(this.path,name,"reply.json");
   if(!existsSync(body)||!existsSync(reply))fail("agent_model_original_unknown");
   if(!isDeepStrictEqual(read(body),original))fail("agent_model_original_unproven");
   const request=parseAgentRuntimeModelRequest(this.scope,original,this.permitted),saved=read(reply);
   if(request.call_id!==name||request.admission_digest!==this.port.admission_digest)fail("agent_model_original_unproven");
   if(!exact(saved,["request_digest","response_digest","response"])||saved.request_digest!==digest(JSON.stringify(request)).value||saved.response_digest!==digest(JSON.stringify(saved.response)).value)fail("agent_model_original_unproven");
   parseAgentRuntimeModelResponse(saved.response,request);
  }
  if(input.call_id!=="model_"+String(previous.length+1).padStart(4,"0"))fail("agent_model_original_sequence_denied");
  signal?.throwIfAborted();await waitOriginal(this.port.check(structuredClone(this.scope)),signal);signal?.throwIfAborted();
  // Bounded original IDs, no caller-controlled filesystem names beyond this set.
  if(!/^model_00(?:0[1-9]|[1-5][0-9]|6[0-4])$/.test(input.call_id))fail("agent_model_call_limit");
  try{mkdirSync(claim);}catch(error){if(error&&typeof error==="object"&&"code" in error&&error.code==="EEXIST")fail("agent_model_original_unknown");throw error;}
  save(join(claim,"request.json"),input);
  try{mkdirSync(path);}catch(error){if(error&&typeof error==="object"&&"code" in error&&error.code==="EEXIST")fail("agent_model_original_unknown");throw error;}
  save(requestPath,input);signal?.throwIfAborted();
  const response=parseAgentRuntimeModelResponse(await waitOriginal(this.port.execute(structuredClone(input),signal),signal),input);
  save(replyPath,{request_digest:digest(JSON.stringify(input)).value,response_digest:digest(JSON.stringify(response)).value,response});
  return {receipt:response,replay:false};
 }
}
// Read-only original model evidence. Token usage and completed IPC delivery do
// not prove provider bill settlement, real-account approval or method execution.
export function readAgentRuntimeModelOriginals(root:string,rawScope:unknown) {
 const scope=parseAgentWorkspaceToolScope(rawScope),path=assertOrdinaryPath(join(root,"agent-runtime-model-originals",scope.project_id,scope.run_id)),spine=assertOrdinaryPath(join(root,"agent-runtime-model-starts",scope.project_id,scope.run_id));
 const header=read(join(path,"header.json"));
 if(!exact(header,["format","scope","admission_digest","permitted","maximum_calls","task_packet_digest",...(header&&typeof header==="object"&&"original_evidence" in header?["original_evidence"]:[])])||(header.original_evidence===undefined?header.format!=="cimiloop/agent-runtime-model-originals/1.0.0":header.format!=="cimiloop/agent-runtime-model-originals/2.0.0")||!isDeepStrictEqual(header.scope,scope)||!sha(header.admission_digest)||header.maximum_calls!==64||(header.task_packet_digest!==null&&!sha(header.task_packet_digest))||!Array.isArray(header.permitted)||!isDeepStrictEqual(read(join(spine,"header.json")),header))fail("agent_model_original_unproven");
 const originalEvidence=parseAgentModelOriginalEvidence(header.original_evidence);
 const names=[...new Set([...readdirSync(path),...readdirSync(spine)].filter(n=>n!=="header.json"))].sort();
 if(names.length>64||names.some((name,i)=>name!=="model_"+String(i+1).padStart(4,"0")))fail("agent_model_original_unproven");
 const artifacts:{name:string;path:string;digest:string}[]=[];
 const capture=(name:string,path:string)=>{const bytes=bytesAt(path,TOOL_RECORD_BYTES);artifacts.push({name,path,digest:digest(bytes).value});return read(path);};
 capture("header.json",join(path,"header.json"));capture("start/header.json",join(spine,"header.json"));
 const calls:{call_id:string;state:"reply_recorded"|"unknown";request:ReturnType<typeof parseAgentRuntimeModelRequest>;response:AgentRuntimeModelResponse|null}[]=[];
 for(const name of names){
  const original=parseAgentRuntimeModelRequest(scope,capture("start/"+name+"/request.json",join(spine,name,"request.json")),header.permitted as string[]);
  if(original.call_id!==name||original.admission_digest!==header.admission_digest)fail("agent_model_original_unproven");
  const bodyPath=join(path,name,"request.json"),replyPath=join(path,name,"reply.json");let response:AgentRuntimeModelResponse|null=null;
  if(existsSync(bodyPath)){
   if(!isDeepStrictEqual(capture(name+"/request.json",bodyPath),original))fail("agent_model_original_unproven");
   if(existsSync(replyPath)){const reply=capture(name+"/reply.json",replyPath);if(!exact(reply,["request_digest","response_digest","response"])||reply.request_digest!==digest(JSON.stringify(original)).value||reply.response_digest!==digest(JSON.stringify(reply.response)).value)fail("agent_model_original_unproven");response=parseAgentRuntimeModelResponse(reply.response,original);}
  }
  calls.push({call_id:name,state:response?"reply_recorded":"unknown",request:original,response});
 }
 for(const artifact of artifacts)if(digest(bytesAt(artifact.path,TOOL_RECORD_BYTES)).value!==artifact.digest)fail("agent_model_original_unproven");
 if(!isDeepStrictEqual([...new Set([...readdirSync(path),...readdirSync(spine)].filter(n=>n!=="header.json"))].sort(),names))fail("agent_model_original_unproven");
 return {...(originalEvidence?{original_evidence:originalEvidence}:{}),status:calls.length&&calls.every(c=>c.state==="reply_recorded")?"Observed":"Unknown",admission_digest:header.admission_digest,task_packet_digest:header.task_packet_digest,calls,artifacts,
  model_account_custody_proven:false as const,costs_reconciled:false as const,formal_agent_execution_enabled:false as const};
}