import {isDeepStrictEqual as same} from 'node:util';
import {bytesAt,digest,RuntimeAdapterError} from './files.js';
import {parseGatewayJson} from './gateway-conversation.js';
import {assertAgentRuntimeModelOriginalMode,type readAgentRuntimeModelOriginals} from './agent-runtime-model.js';
import {readCodexAgentModelOriginals,verifyCollectedCodexAgentModelOriginals} from './agent-codex-model.js';
import {readDedicatedAgentModelOriginals,verifyCollectedDedicatedAgentModelOriginals} from './agent-dedicated-model.js';

type Model=ReturnType<typeof readAgentRuntimeModelOriginals>;
type Collection=Parameters<typeof verifyCollectedCodexAgentModelOriginals>[2]&Parameters<typeof verifyCollectedDedicatedAgentModelOriginals>[2]&{format:string};
const fail=():never=>{throw new RuntimeAdapterError('agent_named_model_originals_unproven');};

// The outer SDK receipt alone cannot authenticate the model that produced it.
// No constructors, login, dispatch, repair or bill settlement enter this reader.
export function readNamedMethodModelOriginals(root:string,scope:unknown,model:Model,input:Record<string,unknown>,config:Record<string,unknown>,collection?:Collection){
 const kind=model.original_evidence?.kind;
 if(kind===undefined){
  if(collection&&(collection.format!=='cimiloop/agent-runtime-originals/1.0.0'||collection.codex_model!==undefined||collection.dedicated_model!==undefined||collection.artifacts.some(a=>a.name.startsWith('codex-model/')||a.name.startsWith('dedicated-model/'))))fail();
  return undefined;
 }
 const header=model.artifacts.find(a=>a.name==='header.json');if(!header)fail();
 const bytes=bytesAt(header!.path,114688);if(digest(bytes).value!==header!.digest)fail();
 const raw=structuredClone(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes),114688));
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!same((raw as Record<string,unknown>).original_evidence,model.original_evidence))fail();
 assertAgentRuntimeModelOriginalMode(raw as Record<string,unknown>,false,config.provider_options as Record<string,unknown>);
 assertAgentRuntimeModelOriginalMode(raw as Record<string,unknown>,false,input.provider_options as Record<string,unknown>);
 if(!same(input.model_original_binding,{format:'cimiloop/agent-model-original-binding/1.0.0',header_digest:header!.digest,original_evidence:model.original_evidence}))fail();
 if(kind==='dedicated_zhipu/1.0.0'){
  const dedicated=readDedicatedAgentModelOriginals(root,scope),s=dedicated.summary;
  if(s.status!=='Observed'||!s.original_requirement_pinned||!s.budget_identity_pinned||s.scope_digest!==digest(JSON.stringify(scope)).value||s.header_digest!==model.original_evidence!.header_digest||s.admission_digest!==model.admission_digest||!dedicated.calls.length||dedicated.calls.length!==model.calls.length||dedicated.calls.some((call,index)=>call.state!=='reply_recorded'||model.calls[index]?.state!=='reply_recorded'||call.call_id!==model.calls[index]?.call_id))fail();
  if(collection){if(collection.format!=='cimiloop/agent-runtime-originals/1.0.0')fail();verifyCollectedDedicatedAgentModelOriginals(root,scope,collection);}
  return{dedicated};
 }
 if(kind!=='codex_login/1.0.0')fail();
 const codex=readCodexAgentModelOriginals(root,scope);
 if(codex.status!=='Observed'||!codex.original_requirement_pinned||codex.scope_digest!==digest(JSON.stringify(scope)).value||codex.header_digest!==model.original_evidence!.header_digest||!codex.calls.length||codex.calls.length!==model.calls.length||
  codex.calls.some((call,index)=>!call.original||call.state!=='reply_recorded'||model.calls[index]?.state!=='reply_recorded'||call.call_id!==model.calls[index]?.call_id||!same(call.response,model.calls[index]?.response)))fail();
 if(collection){if(collection.format!=='cimiloop/agent-runtime-originals/2.0.0')fail();verifyCollectedCodexAgentModelOriginals(root,scope,collection);}
 return{codex};
}

// Historical Codex-only consumers retain their original result shape. A local
// provider is independently verified, but never re-labelled as a Codex account.
export function readNamedMethodCodexOriginals(...args:Parameters<typeof readNamedMethodModelOriginals>){return readNamedMethodModelOriginals(...args)?.codex;}
