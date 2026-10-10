import {assertAgentNamedMethodConfig} from './agent-named-method-config.js';
import {isDeepStrictEqual} from "node:util";
import {join} from "node:path";
import {bytesAt,digest,RuntimeAdapterError} from "./files.js";
import {parseGatewayJson} from "./gateway-conversation.js";
import {copyToolJson} from "./tool-journal.js";
import {validWorkspaceWorkerIdentity} from "./workspace-files.js";
const fail=():never=>{throw new RuntimeAdapterError("agent_runtime_interruption_unproven");};
const phases=["registered","profile_intent","grants_intent","granted","mapped","process_create_intent","runtime_created","suspended","running"];
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).sort().join(",")===[...keys].sort().join(",");
// Historical immutable bytes only. This never proves current OS state. The
// asynchronous collector separately inspects the original retained OS identities;
// Kernel verifies these bytes synchronously without invoking Native inside SQL.
export function verifyAgentRuntimeInterruption(basis:{scope_digest:string;owner:unknown},read:(name:string)=>Buffer|undefined){
 const raw=read("agent-sandbox-interruption.json");if(raw===undefined)return undefined;
 const parse=(bytes:Buffer|undefined):Record<string,unknown>=>{if(!bytes||bytes.length>65536)fail();const value=copyToolJson(parseGatewayJson(new TextDecoder("utf-8",{fatal:true}).decode(bytes!),65536));if(!value||typeof value!=="object"||Array.isArray(value))fail();return value as Record<string,unknown>;};
 const record=parse(raw),configBytes=read("original-config.json"),config=parse(configBytes),launch=parse(read("original-launcher.json")),resources=parse(read("agent-sandbox-resources.json")),cleanup=parse(read("agent-sandbox-cleanup.json"));
 if(!exact(record,["format","nonce","scope_digest","config_digest","owner","supervisor","runtime","phase","runtime_resumed","reason"])||record.format!=="cimiloop/agent-workspace-interruption/1.0.0"||record.reason!=="agent_sandbox_parent_ended"||
 typeof record.phase!=="string"||!phases.includes(record.phase)||record.runtime_resumed!==(record.phase==="running")||record.scope_digest!==basis.scope_digest||config.scope_digest!==basis.scope_digest||!isDeepStrictEqual(record.owner,basis.owner)||
 !validWorkspaceWorkerIdentity(record.owner)||!validWorkspaceWorkerIdentity(record.supervisor)||!isDeepStrictEqual(config.owner,record.owner)||!isDeepStrictEqual(launch.owner,record.owner)||!isDeepStrictEqual(resources.owner,record.owner)||
 !isDeepStrictEqual(launch.supervisor,record.supervisor)||!isDeepStrictEqual(resources.supervisor,record.supervisor)||record.config_digest!==digest(configBytes!).value||resources.config_digest!==record.config_digest||resources.scope_digest!==record.scope_digest||
 typeof record.nonce!=="string"||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(record.nonce)||[config,launch,resources,cleanup].some(value=>value.nonce!==record.nonce)||
 !/^cimiloop\/agent-workspace-sandbox-config\/[1-6]\.0\.0$/.test(String(config.format))||!["cimiloop/agent-workspace-launcher/1.0.0","cimiloop/agent-workspace-launcher/2.0.0"].includes(String(launch.format))||
 resources.format!=="cimiloop/agent-workspace-resources/1.0.0"||resources.phase!=="ended"||resources.resources_disposed!==true||!isDeepStrictEqual(resources.runtime,record.runtime)||
 cleanup.format!=="cimiloop/agent-workspace-sandbox/1.0.0"||cleanup.phase!=="ended"||cleanup.reason!==record.reason||cleanup.exit_code!==125||cleanup.resources_disposed!==true||cleanup.formal_agent_execution_enabled!==false||!Array.isArray(cleanup.cleanup_errors)||cleanup.cleanup_errors.length!==0)fail();
 try{assertAgentNamedMethodConfig(config);}catch{fail();}
 const created=["runtime_created","suspended","running"].includes(String(record.phase));
 if(created?!validWorkspaceWorkerIdentity(record.runtime):record.runtime!==null)fail();
 if(record.phase==="suspended"||record.phase==="running"){
  const original=parse(read("agent-sandbox-original.json"));
  if(original.format!=="cimiloop/agent-workspace-sandbox/1.0.0"||original.phase!=="suspended"||original.nonce!==record.nonce||!isDeepStrictEqual(original.supervisor,record.supervisor)||!isDeepStrictEqual(original.peer,record.runtime))fail();
 }
 return {status:"Observed" as const,phase:String(record.phase),runtime_resumed:record.phase==="running",reason:"agent_sandbox_parent_ended" as const,completion_proven:false as const,costs_reconciled:false as const};
}
// Use this only for already validated local_content references. Hash and unique
// names are enforced here too so a duplicate or changed optional proof cannot be
// treated as a legacy missing field.
export function verifyCollectedAgentRuntimeInterruption(basis:{scope_digest:string;owner:unknown;operation:string;input:unknown},collection:{artifacts:{name:string;reference:{locator:string;digest:{value:string}}}[];interruption?:unknown}){
 const names=new Set<string>();for(const artifact of collection.artifacts){if(names.has(artifact.name))fail();names.add(artifact.name);}
 const value=verifyAgentRuntimeInterruption(basis,name=>{const artifact=collection.artifacts.find(value=>value.name===name);if(!artifact)return undefined;const raw=bytesAt(artifact.reference.locator,65536);if(digest(raw).value!==artifact.reference.digest.value)fail();return raw;});
 if(value===undefined?"interruption" in collection:!isDeepStrictEqual(value,collection.interruption))fail();
 if(value){
  // Bind the immutable snapshot to the actual original operation, not merely a
  // self-consistent foreign set carrying the same scope and Human/Agent owner.
  for(const name of ["original-config.json","original-launcher.json","agent-sandbox-interruption.json",...(["suspended","running"].includes(value.phase)?["agent-sandbox-original.json"]:[])]){
   const artifact=collection.artifacts.find(value=>value.name===name);if(!artifact||digest(bytesAt(join(basis.operation,name),65536)).value!==artifact.reference.digest.value)fail();
  }
  const config=copyToolJson(parseGatewayJson(bytesAt(join(basis.operation,"original-config.json"),65536).toString("utf8"),65536)) as Record<string,unknown>;
  const launch=copyToolJson(parseGatewayJson(bytesAt(join(basis.operation,"original-launcher.json"),65536).toString("utf8"),65536)) as Record<string,unknown>;
  const input=basis.input as Record<string,unknown>;
  try{assertAgentNamedMethodConfig(config,input);}catch{fail();}
  if(!input||!input.binary_original||!input.sandbox_original||!["cimiloop/agent-workspace-sandbox-config/5.0.0","cimiloop/agent-workspace-sandbox-config/6.0.0"].includes(String(config.format))||launch.format!=="cimiloop/agent-workspace-launcher/2.0.0"||!isDeepStrictEqual(config.binary_original,input.binary_original)||!isDeepStrictEqual(launch.launcher_original,input.sandbox_original))fail();
 }
 return value;
}
