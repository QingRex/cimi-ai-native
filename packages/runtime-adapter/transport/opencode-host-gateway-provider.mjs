// Fixed no-network AI SDK provider. All model input crosses the original
// OS-authenticated pipe; credentials, endpoints and tariff selection stay host-side.
import { exchangeAgentWorkspaceModelFrame } from "./agent-workspace-ipc-client.mjs";
export function createCimiHostGateway(options) {
 if (!options || !Object.hasOwn(options,"admission_digest") || !/^[a-f0-9]{64}$/.test(options.admission_digest)) throw Error("agent_model_admission_unavailable");
 // OpenCode adds SDK bookkeeping options. Only this Native-pinned field is
 // consumed; SDK endpoint/auth options cannot select any network or credential.
 const admissionDigest=options.admission_digest;let step=0;const originals=new Map();
 return { languageModel(modelId) {
  if(modelId!=="host-approved")throw Error("agent_model_binding_denied");
  return {specificationVersion:"v3",provider:"cimiloop-host-gateway",modelId,supportedUrls:{},async doStream(input){
   const tools=(input.tools??[]).filter(tool=>tool.name!=="invalid"),maximum=Math.min(input.maxOutputTokens??512,512);
   const key=JSON.stringify([input.prompt,tools,maximum]);let callId=originals.get(key);
   if(!callId){if(step>=64)throw Error("agent_model_call_limit");callId="model_"+String(++step).padStart(4,"0");originals.set(key,callId);}
   const reply=await exchangeAgentWorkspaceModelFrame(process.env.CIMILOOP_AGENT_WORKSPACE_PIPE,{format:"cimiloop/agent-runtime-model-request/1.0.0",
    scope_digest:process.env.CIMILOOP_AGENT_WORKSPACE_SCOPE,admission_digest:admissionDigest,call_id:callId,tool:"model_step",prompt:input.prompt,tools,max_output_tokens:maximum},input.abortSignal);
   if(reply.outcome!=="completed")throw Error(reply.reason);
   const response=reply.receipt,events=[{type:"stream-start",warnings:[]}];let textBytes=0,calls=0;const ids=new Set();
   for(const item of response.content){
    if(item.type==="text"&&Object.keys(item).sort().join(",")==="text,type"&&typeof item.text==="string"&&item.text.isWellFormed()){
     textBytes+=Buffer.byteLength(item.text);const id="text_"+events.length;events.push({type:"text-start",id},{type:"text-delta",id,delta:item.text},{type:"text-end",id});
    }else if(item.type==="tool-call"&&Object.keys(item).sort().join(",")==="arguments,tool_call_id,tool_name,type"&&typeof item.arguments==="string"&&Buffer.byteLength(item.arguments)<=16384&&
     typeof item.tool_call_id==="string"&&/^[a-zA-Z0-9_-]{1,128}$/.test(item.tool_call_id)&&!ids.has(item.tool_call_id)&&tools.some(t=>t.name===item.tool_name)){
     ids.add(item.tool_call_id);calls++;JSON.parse(item.arguments);events.push({type:"tool-input-start",id:item.tool_call_id,toolName:item.tool_name},
      {type:"tool-input-delta",id:item.tool_call_id,delta:item.arguments},{type:"tool-input-end",id:item.tool_call_id},
      {type:"tool-call",toolCallId:item.tool_call_id,toolName:item.tool_name,input:item.arguments});
    }else throw Error("agent_model_response_denied");
   }
   if(textBytes>16384||(calls>0)!==(response.finish==="tool_calls"))throw Error("agent_model_response_denied");
   events.push({type:"finish",finishReason:{unified:calls?"tool-calls":"stop",raw:response.finish},usage:{inputTokens:{total:response.usage.input_tokens,noCache:response.usage.input_tokens,cacheRead:0,cacheWrite:0},
    outputTokens:{total:response.usage.output_tokens,text:response.usage.output_tokens,reasoning:0}}});
   return {stream:new ReadableStream({start(controller){for(const event of events)controller.enqueue(event);controller.close();}})};
  }};
 }};
}