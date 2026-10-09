import { existsSync, realpathSync, lstatSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, readdirSync } from "node:fs";
import { join, resolve, relative, isAbsolute, sep, dirname, basename } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { assertOrdinaryPath, bytesAt, directory, digest, RuntimeAdapterError } from "./files.js";
import { validateModelConnection, readDedicatedApiKey, type DedicatedModelConnection } from "./connection.js";
import { GatewayNetworkBoundary, type DedicatedGatewayPath } from "./gateway-network.js";
import { GatewayHttpTransport } from "./gateway-http.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import { parseDedicatedAgentProfile, parseDedicatedAgentResponse, type DedicatedAgentProfile, type DedicatedAgentReply } from "./agent-dedicated-codec.js";
import { parseAgentRuntimeModelRequest, type AgentRuntimeModelPort } from "./agent-runtime-model.js";
import { parseAgentWorkspaceToolScope, type AgentWorkspaceToolScope } from "./agent-workspace-authority.js";

export interface DedicatedAgentBudgetRequest {scope_digest:string;admission_digest:string;connection_digest:string;call_id:string;request_id:string;request_digest:string;input_bytes:number;max_output_tokens:number}
export interface DedicatedAgentBudgetHold extends DedicatedAgentBudgetRequest {format:"cimiloop/agent-model-budget-hold/1.0.0";account_digest:string;approval_digest:string;tariff_digest:string;cash_upper_micros:number;credit_upper_micro_units:number;input_token_limit:number;output_token_limit:number}
// Trusted account service, never HTTP/CLI/model/imported JSON. Must verify live
// approval for exact connection, plan/tariff and BOTH cash/credit limits, current
// qualification/physical quota/recovery custody; reserve against ONE durable
// shared account store before send. No default account service is installed.
// Usage/HTTP success never releases a hold. Provider bill reconciliation owns it.
export interface DedicatedAgentAccountPort {
 admission_digest:string;profile:DedicatedAgentProfile;
 check(scope:AgentWorkspaceToolScope,connection:DedicatedModelConnection):Promise<void>;
 reserve(scope:AgentWorkspaceToolScope,request:DedicatedAgentBudgetRequest,originalBody:Uint8Array):Promise<DedicatedAgentBudgetHold>;
 verifyHold(scope:AgentWorkspaceToolScope,hold:DedicatedAgentBudgetHold):Promise<void>;
}
interface Options {root:string;repositoryPath:string;scope:AgentWorkspaceToolScope;connection:DedicatedModelConnection;account:DedicatedAgentAccountPort}
// Code-only test/trusted composition seams; not exported as wire configuration.
interface Dependencies {boundary?:GatewayNetworkBoundary;readCredential?:(connection:DedicatedModelConnection)=>Promise<string>}
const sha=(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
function fail(reason="agent_dedicated_original_unproven"):never{throw new RuntimeAdapterError(reason);}
const read=(p:string)=>JSON.parse(JSON.stringify(parseGatewayJson(new TextDecoder("utf-8",{fatal:true}).decode(bytesAt(p,262144)),262144))) as unknown;
const save=(p:string,v:unknown)=>{assertOrdinaryPath(p);const bytes=Buffer.isBuffer(v)?v:Buffer.from(JSON.stringify(v));if(bytes.length>262144)fail();const fd=openSync(p,"wx");try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}};
function verifyHold(hold:unknown,request:DedicatedAgentBudgetRequest):asserts hold is DedicatedAgentBudgetHold{
 const keys=[...Object.keys(request),"format","account_digest","approval_digest","tariff_digest","cash_upper_micros","credit_upper_micro_units","input_token_limit","output_token_limit"].sort();
 if(!hold||typeof hold!=="object"||Array.isArray(hold)||Object.keys(hold).sort().join(",")!==keys.join(","))fail("agent_dedicated_budget_unproven");const h=hold as DedicatedAgentBudgetHold;
 if(h.format!=="cimiloop/agent-model-budget-hold/1.0.0"||Object.entries(request).some(([k,v])=>!isDeepStrictEqual(h[k as keyof DedicatedAgentBudgetHold],v))||![h.account_digest,h.approval_digest,h.tariff_digest].every(sha)||![h.cash_upper_micros,h.credit_upper_micro_units,h.input_token_limit,h.output_token_limit].every(n=>Number.isSafeInteger(n)&&n>=0)||h.input_token_limit<1||h.input_token_limit>1000000||h.output_token_limit!==request.max_output_tokens)fail("agent_dedicated_budget_unproven");
}

function verifyCredentialLocation(repository:string,root:string,secret:string){
 // Reject device/extended namespaces; normalize ordinary drive aliases and 8.3
 // through the existing physical ancestor without reading credential contents.
 const physical=(input:string)=>{if(process.platform==="win32"&&!/^[A-Za-z]:[\\/]/.test(input))fail("dedicated_credential_path_unproven");assertOrdinaryPath(input);let current=resolve(input);const suffix:string[]=[];
  for(;;){try{lstatSync(current);let canonical=realpathSync.native(current);const prefix=String.fromCharCode(92,92,63,92);if(process.platform==="win32"&&canonical.startsWith(prefix))canonical=canonical.slice(4);
    if(process.platform==="win32"&&!/^[A-Za-z]:[\\/]/.test(canonical))fail("dedicated_credential_path_unproven");return join(canonical,...suffix.reverse());
   }catch(error){if(!(error&&typeof error==="object"&&"code" in error&&error.code==="ENOENT"))fail("dedicated_credential_path_unproven");if(dirname(current)===current)fail("dedicated_credential_path_unproven");suffix.push(basename(current));current=dirname(current);}}
 };
 const target=physical(secret),outside=(base:string)=>{const path=relative(physical(base),target);return path===".."||path.startsWith(".."+sep)||isAbsolute(path);};
 if(!outside(repository)||!outside(root))fail("dedicated_credential_inside_repository_denied");
 try{const stat=lstatSync(secret);if(!stat.isFile()||stat.nlink!==1)fail("dedicated_credential_path_unproven");}catch(error){if(!(error&&typeof error==="object"&&"code" in error&&error.code==="ENOENT"))fail("dedicated_credential_path_unproven");}
}

export function createDedicatedAgentRuntimeModel(options:Options,dependencies:Dependencies={}):AgentRuntimeModelPort{
 if(typeof options.repositoryPath!=="string"||!isAbsolute(options.repositoryPath))fail("agent_dedicated_repository_unproven");
 const scope=parseAgentWorkspaceToolScope(options.scope),connection=structuredClone(validateModelConnection(options.connection)),port=options.account,profile=parseDedicatedAgentProfile(port?.profile);
 if(!sha(port?.admission_digest)||typeof port.check!=="function"||typeof port.reserve!=="function"||typeof port.verifyHold!=="function"||connection.model!==connection.provider+"/"+profile.model)fail("agent_dedicated_account_unavailable");
 verifyCredentialLocation(options.repositoryPath,options.root,connection.credential_file);
 const account={admission_digest:port.admission_digest,check:port.check.bind(port),reserve:port.reserve.bind(port),verifyHold:port.verifyHold.bind(port)},scopeDigest=digest(JSON.stringify(scope)).value,connectionDigest=digest(JSON.stringify(connection)).value;
 const path=connection.provider==="zhipuai"?"/api/paas/v4/chat/completions":"/api/coding/paas/v4/chat/completions";
 const boundary=dependencies.boundary??new GatewayNetworkBoundary({},path as DedicatedGatewayPath);if(!(boundary instanceof GatewayNetworkBoundary)||boundary.path!==path)fail("agent_dedicated_connection_mismatch");
 const transport=new GatewayHttpTransport(boundary),credential=dependencies.readCredential??readDedicatedApiKey;
 const root=assertOrdinaryPath(options.root),spine=join(root,"agent-dedicated-model-starts",scope.project_id,scope.run_id),originals=join(root,"agent-dedicated-model-originals",scope.project_id,scope.run_id);
 const header={format:"cimiloop/agent-dedicated-model-originals/1.0.0",scope,admission_digest:account.admission_digest,connection_digest:connectionDigest,profile};
 const check=async(raw:AgentWorkspaceToolScope)=>{if(!isDeepStrictEqual(parseAgentWorkspaceToolScope(raw),scope))fail("agent_model_scope_mismatch");try{await account.check(structuredClone(scope),structuredClone(connection));}catch{fail("agent_dedicated_account_unavailable");}};
 const initialize=(request:ReturnType<typeof parseAgentRuntimeModelRequest>)=>{
  const hostSpine=join(root,"agent-runtime-model-starts",scope.project_id,scope.run_id),hostBody=join(root,"agent-runtime-model-originals",scope.project_id,scope.run_id);
  const hostHeader=read(join(hostSpine,"header.json")) as Record<string,unknown>;if(!isDeepStrictEqual(hostHeader.scope,scope)||hostHeader.admission_digest!==account.admission_digest||!isDeepStrictEqual(hostHeader,read(join(hostBody,"header.json")))||!isDeepStrictEqual(read(join(hostSpine,request.call_id,"request.json")),request)||!isDeepStrictEqual(read(join(hostBody,request.call_id,"request.json")),request))fail();
  const anchor=join(hostSpine,"model_0001","dedicated-registration.json"),registration={format:"cimiloop/agent-dedicated-registration/1.0.0",header_digest:digest(JSON.stringify(header)).value};
  if(existsSync(anchor)){if(!isDeepStrictEqual(read(anchor),registration)||!existsSync(spine)||!existsSync(originals))fail();}
  else {if(request.call_id!=="model_0001"||existsSync(spine)||existsSync(originals))fail();save(anchor,registration);}
  directory(join(spine,".."));let fresh=false;try{mkdirSync(spine);fresh=true;}catch(e){if(!(e&&typeof e==="object"&&"code" in e&&e.code==="EEXIST"))throw e;}
  if(fresh){save(join(spine,"header.json"),header);directory(join(originals,".."));mkdirSync(originals);save(join(originals,"header.json"),header);}
  if(!isDeepStrictEqual(read(join(spine,"header.json")),header)||!isDeepStrictEqual(read(join(originals,"header.json")),header))fail();};
 const inflight=new Map<string,{request:unknown;promise:Promise<DedicatedAgentReply["receipt"]>}>();
 const holdCheck=async(hold:DedicatedAgentBudgetHold)=>{try{await account.verifyHold(structuredClone(scope),structuredClone(hold));}catch{fail("agent_dedicated_budget_unproven");}};
 const dispatch=async(request:ReturnType<typeof parseAgentRuntimeModelRequest>,signal?:AbortSignal)=>{
  initialize(request);const names=readdirSync(spine).filter(n=>n!=="header.json").sort();if(names.length>64||names.some((n,i)=>n!=="model_"+String(i+1).padStart(4,"0"))||!isDeepStrictEqual(readdirSync(originals).filter(n=>n!=="header.json").sort(),names))fail();
  const prior:DedicatedAgentReply[]=[];
  for(const name of names){const claim=join(spine,name),body=join(originals,name),old=read(join(claim,"request.json"));if(!isDeepStrictEqual(read(join(body,"request.json")),old))fail();
   const parsed=parseAgentRuntimeModelRequest(scope,old,["cimi_read","cimi_replace","cimi_check"]);if(parsed.call_id!==name||parsed.admission_digest!==account.admission_digest)fail();
   if(!existsSync(join(body,"provider-response.json"))||!existsSync(join(body,"receipt.json")))fail("agent_dedicated_original_unknown");
   const prepared=transport.prepareAgent(parsed,profile,prior),budget={scope_digest:scopeDigest,admission_digest:account.admission_digest,connection_digest:connectionDigest,call_id:name,request_id:prepared.request_id,request_digest:prepared.input_digest,input_bytes:prepared.body.length,max_output_tokens:parsed.max_output_tokens};
   const sendIntent={format:"cimiloop/agent-dedicated-send-intent/1.0.0",header_digest:digest(JSON.stringify(header)).value,request_digest:prepared.input_digest,model_request_digest:digest(JSON.stringify(parsed)).value};
   if(!isDeepStrictEqual(read(join(root,"agent-runtime-model-starts",scope.project_id,scope.run_id,name,"dedicated-send-intent.json")),sendIntent))fail();
   const hold=read(join(body,"budget-hold.json"));verifyHold(hold,budget);prepared.input_token_limit=hold.input_token_limit;
   if(!bytesAt(join(body,"provider-request.json"),65536).equals(prepared.body)||!isDeepStrictEqual(read(join(claim,"dispatch.json")),{request_digest:prepared.input_digest,hold_digest:digest(JSON.stringify(hold)).value}))fail();
   // Only accepted credential-safe original bytes can enter this reader. No
   // current key read is needed to recover a historical response.
   const raw=bytesAt(join(body,"provider-response.json"),262144),reply=parseDedicatedAgentResponse(raw,prepared,"__CIMILOOP_HISTORICAL_NO_CREDENTIAL__"),saved=read(join(body,"receipt.json"));
   if(!isDeepStrictEqual(saved,{response_digest:digest(raw).value,reply})||!isDeepStrictEqual(read(join(root,"agent-runtime-model-starts",scope.project_id,scope.run_id,name,"dedicated-response.json")),{format:"cimiloop/agent-dedicated-response/1.0.0",response_digest:digest(raw).value,reply_digest:digest(JSON.stringify(reply)).value}))fail();
   const hostReply=join(root,"agent-runtime-model-originals",scope.project_id,scope.run_id,name,"reply.json");if(existsSync(hostReply)){const savedHost=read(hostReply) as Record<string,unknown>;if(!isDeepStrictEqual(savedHost.response,reply.receipt)||savedHost.request_digest!==digest(JSON.stringify(parsed)).value||savedHost.response_digest!==digest(JSON.stringify(reply.receipt)).value)fail();}
   if(name===request.call_id){if(!isDeepStrictEqual(parsed,request))fail("agent_model_input_conflict");return reply.receipt;}
   if(reply.receipt.finish==="stop")fail("agent_dedicated_original_finished");prior.push(reply);
  }
  if(request.call_id!=="model_"+String(names.length+1).padStart(4,"0")||names.length>=64)fail("agent_model_original_sequence_denied");
  const prepared=transport.prepareAgent(request,profile,prior),budget:DedicatedAgentBudgetRequest={scope_digest:scopeDigest,admission_digest:account.admission_digest,connection_digest:connectionDigest,call_id:request.call_id,request_id:prepared.request_id,request_digest:prepared.input_digest,input_bytes:prepared.body.length,max_output_tokens:request.max_output_tokens};
  const sendAnchor=join(root,"agent-runtime-model-starts",scope.project_id,scope.run_id,request.call_id,"dedicated-send-intent.json");if(existsSync(sendAnchor))fail("agent_dedicated_original_unknown");
  signal?.throwIfAborted();await check(scope);signal?.throwIfAborted();
  save(sendAnchor,{format:"cimiloop/agent-dedicated-send-intent/1.0.0",header_digest:digest(JSON.stringify(header)).value,request_digest:prepared.input_digest,model_request_digest:digest(JSON.stringify(request)).value});
  const claim=join(spine,request.call_id),body=join(originals,request.call_id);try{mkdirSync(claim);}catch{fail("agent_dedicated_original_unknown");}save(join(claim,"request.json"),request);mkdirSync(body);save(join(body,"request.json"),request);
  let held:DedicatedAgentBudgetHold;try{held=structuredClone(await account.reserve(structuredClone(scope),structuredClone(budget),Buffer.from(prepared.body)));}catch{fail("agent_dedicated_budget_unproven");}const hold=held;verifyHold(hold,budget);save(join(body,"budget-hold.json"),hold);prepared.input_token_limit=hold.input_token_limit;
  signal?.throwIfAborted();await check(scope);await holdCheck(hold);signal?.throwIfAborted();
  verifyCredentialLocation(options.repositoryPath,options.root,connection.credential_file);
  let key:string;try{key=await credential(connection);}catch{fail("dedicated_credential_unavailable");}
  if(!/^[a-zA-Z0-9._-]{8,512}$/.test(key))fail("invalid_gateway_http_credential");if(prepared.body.includes(Buffer.from(key))||JSON.stringify(parseGatewayJson(prepared.body.toString(),65536)).includes(key))fail("gateway_credential_in_request");
  save(join(body,"provider-request.json"),prepared.body);signal?.throwIfAborted();await check(scope);await holdCheck(hold);signal?.throwIfAborted();
  const pin=await boundary.resolve(8000,signal),tls=await boundary.connect(pin,8000,signal);
  try{await check(scope);await holdCheck(hold);signal?.throwIfAborted();
   save(join(claim,"dispatch.json"),{request_digest:prepared.input_digest,hold_digest:digest(JSON.stringify(hold)).value});
   const response=await transport.sendAgentOriginal(prepared,tls,key,8000,signal);save(join(root,"agent-runtime-model-starts",scope.project_id,scope.run_id,request.call_id,"dedicated-response.json"),{format:"cimiloop/agent-dedicated-response/1.0.0",response_digest:digest(response.bytes).value,reply_digest:digest(JSON.stringify(response.parsed)).value});save(join(body,"provider-response.json"),response.bytes);save(join(body,"receipt.json"),{response_digest:digest(response.bytes).value,reply:response.parsed});return response.parsed.receipt;
  }finally{key="";tls.socket.destroy();}
 };
 return {admission_digest:account.admission_digest,check,execute:async(raw,signal)=>{const request=parseAgentRuntimeModelRequest(scope,raw,["cimi_read","cimi_replace","cimi_check"]);if(request.admission_digest!==account.admission_digest)fail("agent_model_admission_mismatch");const running=inflight.get(request.call_id);if(running){if(!isDeepStrictEqual(running.request,request))fail("agent_model_input_conflict");return running.promise;}
  const promise=dispatch(request,signal);inflight.set(request.call_id,{request,promise});try{return await promise;}finally{inflight.delete(request.call_id);}}};
}
