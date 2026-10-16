import { isDeepStrictEqual } from "node:util";
import { digest, RuntimeAdapterError } from "./files.js";
import { parseGatewayJson, validateGatewayToolSchema, parseGatewayFunctionCalls, type GatewayFunctionTool } from "./gateway-conversation.js";
import { isAgentParentSkillToolSet,parseAgentRuntimeModelResponse, type AgentRuntimeModelResponse, type parseAgentRuntimeModelRequest } from "./agent-runtime-model.js";

type Request=ReturnType<typeof parseAgentRuntimeModelRequest>;
export interface DedicatedAgentProfile {model:string;thinking:"enabled"|"disabled"}
export interface DedicatedAgentReply {receipt:AgentRuntimeModelResponse;reasoning_content:string;provider_response_id:string}
export interface PreparedDedicatedAgentRequest {body:Buffer;request_id:string;input_digest:string;request:Request;profile:DedicatedAgentProfile;tools:GatewayFunctionTool[];prior_call_ids:string[];input_token_limit:number}
const fields=(v:unknown,required:string[],optional:string[]=[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const text=(v:unknown,max=65536):v is string=>typeof v==="string"&&v.isWellFormed()&&Buffer.byteLength(v)<=max;
const id=(v:unknown):v is string=>typeof v==="string"&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
function fail():never{throw new RuntimeAdapterError("agent_dedicated_contract_unproven");}
export function parseDedicatedAgentProfile(raw:unknown):DedicatedAgentProfile{
 if(!fields(raw,["model","thinking"])||typeof raw.model!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(raw.model)||!["enabled","disabled"].includes(String(raw.thinking))||raw.thinking==="disabled"&&/^glm-5\.3(?:-flash)?$/.test(raw.model))fail();
 return structuredClone(raw) as unknown as DedicatedAgentProfile;
}
// Preserved/interleaved reasoning is restored from the host's corresponding
// original provider replies. The SDK cannot inject or substitute those bytes.
export function prepareDedicatedAgentRequest(request:Request,rawProfile:DedicatedAgentProfile,prior:DedicatedAgentReply[]):PreparedDedicatedAgentRequest{
 const requested=request.tools.map(raw=>(raw as {name?:unknown}).name),named=requested.some(n=>n==='cimi_invoke_skill'||n==='cimi_read_method_resource');
 if(named&&(requested.length!==2||!requested.includes('cimi_invoke_skill')||!requested.includes('cimi_read_method_resource')))fail();
 const parent=request.format==='cimiloop/agent-runtime-model-request/2.0.0';if(parent?named||!isAgentParentSkillToolSet(requested):requested.includes('cimi_run_skill'))fail();
 const allowed=parent?['cimi_read','cimi_replace','cimi_check','cimi_run_skill']:named?['cimi_invoke_skill','cimi_read_method_resource']:['cimi_read','cimi_replace','cimi_check'];
 const profile=parseDedicatedAgentProfile(rawProfile),tools:GatewayFunctionTool[]=[],names=new Set<string>();
 for(const raw of request.tools){if(!fields(raw,["type","name","description","inputSchema"])||raw.type!=="function"||!id(raw.name)||!allowed.includes(raw.name)||names.has(raw.name)||!text(raw.description,4096))fail();
  validateGatewayToolSchema(raw.inputSchema,{nodes:0});if(raw.inputSchema.type!=="object")fail();names.add(raw.name);tools.push({type:"function",function:{name:raw.name,description:raw.description,parameters:structuredClone(raw.inputSchema)}});}
 const messages:Record<string,unknown>[]=[],pending=new Map<string,string>(),used=new Set<string>();let assistant=0;
 const contentText=(parts:unknown[])=>{let result="";for(const part of parts){if(!fields(part,["type","text"])||part.type!=="text"||!text(part.text))fail();result+=part.text;}return result;};
 for(const raw of request.prompt){if(!fields(raw,["role","content"]))fail();
  if(raw.role==="system"||raw.role==="user"){if(pending.size)fail();const content=typeof raw.content==="string"?raw.content:Array.isArray(raw.content)?contentText(raw.content):fail();if(!text(content))fail();messages.push({role:raw.role,content});}
  else if(raw.role==="assistant"){
   if(pending.size||!Array.isArray(raw.content)||!raw.content.length||assistant>=prior.length)fail();
   let content="";const calls:{id:string;type:"function";function:{name:string;arguments:string}}[]=[];
   for(const part of raw.content){if(fields(part,["type","text"])&&part.type==="text"&&text(part.text))content+=part.text;
    else if(fields(part,["type","toolCallId","toolName","input"])&&part.type==="tool-call"&&id(part.toolCallId)&&id(part.toolName)&&!used.has(part.toolCallId)){
     const args=JSON.stringify(part.input);parseGatewayJson(args,16384);calls.push({id:part.toolCallId,type:"function",function:{name:part.toolName,arguments:args}});used.add(part.toolCallId);pending.set(part.toolCallId,part.toolName);
    }else fail();}
   if(calls.length)parseGatewayFunctionCalls(calls,tools);
   const original=prior[assistant++]!;if(!text(original.reasoning_content,16384)||profile.model.startsWith("glm-")&&profile.thinking==="disabled"&&original.reasoning_content)fail();
   const visible=original.receipt.content.filter(p=>p.type==="text").map(p=>p.text).join(""),originalCalls=original.receipt.content.filter(p=>p.type==="tool-call");
   if(visible!==content||calls.length!==originalCalls.length||calls.some((call,i)=>{const p=originalCalls[i]!;return call.id!==p.tool_call_id||call.function.name!==p.tool_name||!isDeepStrictEqual(parseGatewayJson(call.function.arguments,16384),parseGatewayJson(p.arguments,16384));}))fail();
   messages.push({role:"assistant",content:content||null,...(calls.length?{tool_calls:calls}:{}),...(profile.model.startsWith("glm-")&&profile.thinking==="enabled"?{reasoning_content:original.reasoning_content}:{})});
  }else if(raw.role==="tool"){
   if(!Array.isArray(raw.content)||!raw.content.length)fail();for(const part of raw.content){if(!fields(part,["type","toolCallId","toolName","output"])||part.type!=="tool-result"||!id(part.toolCallId)||pending.get(part.toolCallId)!==part.toolName||!fields(part.output,["type","value"]))fail();
    const output=part.output,content=(output.type==="text"||output.type==="error-text")&&text(output.value)?output.value:output.type==="json"?JSON.stringify(output.value):fail();if(!text(content))fail();parseGatewayJson(JSON.stringify(output.value),65536);
    pending.delete(part.toolCallId);messages.push({role:"tool",tool_call_id:part.toolCallId,content});}
  }else fail();
 }
 if(pending.size||assistant!==prior.length||!messages.length||messages.length>128||!["user","tool"].includes(String(messages.at(-1)!.role)))fail();
 const request_id=digest(JSON.stringify([request.scope_digest,request.admission_digest,request.call_id])).value;
 const openai=!profile.model.startsWith("glm-");
 const body=Buffer.from(JSON.stringify({model:profile.model,request_id,messages,max_tokens:request.max_output_tokens,stream:false,n:1,...(openai?{}:{thinking:{type:profile.thinking,...(profile.thinking==="enabled"?{clear_thinking:false}:{})}}),...(tools.length?{tools,tool_choice:"auto"}:{})}));
 if(body.length>65536)fail();return {body,request_id,input_digest:digest(body).value,request:structuredClone(request),profile,tools,prior_call_ids:[...used],input_token_limit:1000000};
}
export function parseDedicatedAgentResponse(bytes:Buffer,p:PreparedDedicatedAgentRequest,key:string):DedicatedAgentReply{
 if(bytes.length>262144)fail();let source:string;try{source=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{fail();}
 if(source.includes(key))throw new RuntimeAdapterError("gateway_credential_disclosure_blocked");const v=parseGatewayJson(source,262144);
 if(JSON.stringify(v).includes(key))throw new RuntimeAdapterError("gateway_credential_disclosure_blocked");
 if(!fields(v,["id","model","request_id","choices","usage"],["object","created"])||!id(v.id)||v.model!==p.profile.model||v.request_id!==p.request_id||(v.object!==undefined&&v.object!=="chat.completion")||(v.created!==undefined&&(!Number.isSafeInteger(v.created)||Number(v.created)<0))||!Array.isArray(v.choices)||v.choices.length!==1)fail();
 const c=v.choices[0];if(!fields(c,["index","message","finish_reason"])||c.index!==0||!["stop","tool_calls"].includes(String(c.finish_reason))||!fields(c.message,["role","content"],["tool_calls","reasoning_content"])||c.message.role!=="assistant"||(c.message.content!==null&&!text(c.message.content,16384)))fail();
 const reasoning=c.message.reasoning_content??"";if(!text(reasoning,16384)||p.profile.model.startsWith("glm-")&&p.profile.thinking==="disabled"&&reasoning)fail();
 const u=v.usage;if(!fields(u,["prompt_tokens","completion_tokens","total_tokens"],["prompt_tokens_details"])||![u.prompt_tokens,u.completion_tokens,u.total_tokens].every(n=>Number.isSafeInteger(n)&&Number(n)>=0)||Number(u.prompt_tokens)>p.input_token_limit||Number(u.completion_tokens)>p.request.max_output_tokens||u.total_tokens!==Number(u.prompt_tokens)+Number(u.completion_tokens)||u.prompt_tokens_details!==undefined&&(!fields(u.prompt_tokens_details,["cached_tokens"])||!Number.isSafeInteger(u.prompt_tokens_details.cached_tokens)||Number(u.prompt_tokens_details.cached_tokens)<0||Number(u.prompt_tokens_details.cached_tokens)>Number(u.prompt_tokens)))fail();
 const content:AgentRuntimeModelResponse["content"]=[];if(typeof c.message.content==="string"&&c.message.content.length)content.push({type:"text",text:c.message.content});
 if(c.finish_reason==="tool_calls"){const calls=parseGatewayFunctionCalls(c.message.tool_calls,p.tools);for(const call of calls){if(p.prior_call_ids.includes(call.id))fail();content.push({type:"tool-call",tool_call_id:call.id,tool_name:call.function.name,arguments:call.function.arguments});}}
 else if(c.message.tool_calls!==undefined)fail();
 // Inspect nested arguments after JSON decoding as well as original response.
 if(JSON.stringify(content.map(part=>part.type==="tool-call"?parseGatewayJson(part.arguments,16384):part)).includes(key))throw new RuntimeAdapterError("gateway_credential_disclosure_blocked");
 return {receipt:parseAgentRuntimeModelResponse({content,usage:{input_tokens:u.prompt_tokens,output_tokens:u.completion_tokens},finish:c.finish_reason},p.request),reasoning_content:reasoning,provider_response_id:v.id};
}
