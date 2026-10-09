import {isDeepStrictEqual} from "node:util";
import {bytesAt,digest,parseGatewayJson,type collectAgentRuntimeOperation,type readAgentRuntimeOriginalIdentity} from "@cimiloop/runtime-adapter";
type Identity=ReturnType<typeof readAgentRuntimeOriginalIdentity>;
type Collection=Awaited<ReturnType<typeof collectAgentRuntimeOperation>>;
export type OriginalAgentExecutionFailure="agent_original_task_deadline"|"agent_original_runtime_exit_failed";
// Qualify only negative execution facts from a stopped original collection.
// Success, account custody, domain outputs and billing are separate proofs.
// No process/tool/model is launched, no current deadline or budget is renewed.
export function classifyOriginalAgentExecutionFailure(identity:Identity,collection:Collection):OriginalAgentExecutionFailure|null {
 try {
  if(collection.status.status!=="Stopped"||collection.status.resources_disposed!==true||collection.status.cancellation_requested===true)return null;
  const names=new Set<string>();for(const artifact of collection.artifacts){if(names.has(artifact.name))return null;names.add(artifact.name);}
  const read=(name:string):Record<string,unknown>=>{
   const artifact=collection.artifacts.find(a=>a.name===name);if(!artifact)throw Error("Original missing");
   const bytes=bytesAt(artifact.reference.locator,65536);if(digest(bytes).value!==artifact.reference.digest?.value)throw Error("Original digest mismatch");
   const value=parseGatewayJson(new TextDecoder("utf-8",{fatal:true}).decode(bytes),65536);if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Original object required");return structuredClone(value) as Record<string,unknown>;
  };
  const config=read("original-config.json"),launcher=read("original-launcher.json"),resources=read("agent-sandbox-resources.json"),native=read("agent-sandbox-original.json"),cleanup=read("agent-sandbox-cleanup.json"),incomplete=read("incomplete.json");
  const same=isDeepStrictEqual,nonce=config.nonce,deadline=config.deadline_uptime_ms,input=identity.input as Record<string,unknown>;
  // Native serializes DWORD via int; Node may expose the same bits unsigned.
  // Preserve both original numbers and compare only valid signed/unsigned32.
  const exitBits=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=-2147483648&&v<=4294967295?v>>>0:null;
  const nativeExit=incomplete.native_exit,exit=exitBits(cleanup.exit_code);
  const worker=(v:unknown)=>!!v&&typeof v==="object"&&!Array.isArray(v)&&"pid" in v&&Number.isSafeInteger(v.pid)&&(v.pid as number)>0&&"creation_ticks" in v&&typeof v.creation_ticks==="string"&&/^[0-9]+$/.test(v.creation_ticks)&&"image" in v&&typeof v.image==="string"&&!!v.image;
  if(!["cimiloop/agent-workspace-sandbox-config/2.0.0","cimiloop/agent-workspace-sandbox-config/3.0.0","cimiloop/agent-workspace-sandbox-config/4.0.0","cimiloop/agent-workspace-sandbox-config/5.0.0"].includes(String(config.format))||
   config.format==="cimiloop/agent-workspace-sandbox-config/5.0.0"&&(!same(config.binary_original,input.binary_original)||!config.binary_original||
    !(typeof config.prompt==="string"&&config.lifetime_policy==="agent_task/1.0.0"&&input.lifetime_policy===config.lifetime_policy||config.prompt===null&&config.lifetime_policy===null))||
   config.format==="cimiloop/agent-workspace-sandbox-config/4.0.0"&&(config.lifetime_policy!=="agent_task/1.0.0"||input.lifetime_policy!==config.lifetime_policy)||
   typeof nonce!=="string"||!/^([a-f0-9]{8}-)(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(nonce)||config.scope_digest!==collection.scope_digest||
   !same(config.owner,identity.claim.owner)||!Number.isSafeInteger(deadline)||(deadline as number)<=0||deadline!==input.deadline_uptime_ms||
   launcher.format!=="cimiloop/agent-workspace-launcher/1.0.0"||launcher.nonce!==nonce||!same(launcher.owner,identity.claim.owner)||!worker(launcher.supervisor)||
   resources.format!=="cimiloop/agent-workspace-resources/1.0.0"||resources.nonce!==nonce||resources.scope_digest!==collection.scope_digest||
   resources.config_digest!==collection.artifacts.find(a=>a.name==="original-config.json")!.reference.digest?.value||resources.phase!=="ended"||resources.resources_disposed!==true||
   !same(resources.owner,identity.claim.owner)||!same(resources.supervisor,launcher.supervisor)||!worker(resources.runtime)||
   native.format!=="cimiloop/agent-workspace-sandbox/1.0.0"||native.phase!=="suspended"||native.nonce!==nonce||!same(native.supervisor,launcher.supervisor)||!same(native.peer,resources.runtime)||
   cleanup.format!=="cimiloop/agent-workspace-sandbox/1.0.0"||cleanup.phase!=="ended"||cleanup.nonce!==nonce||cleanup.resources_disposed!==true||cleanup.formal_agent_execution_enabled!==false||
   !Array.isArray(cleanup.cleanup_errors)||cleanup.cleanup_errors.length||!Number.isSafeInteger(cleanup.runtime_stopped_uptime_ms)||(cleanup.runtime_stopped_uptime_ms as number)<0||
   exit===null||
   incomplete.format!=="cimiloop/opencode-workspace-incomplete/1.0.0"||incomplete.nonce!==nonce||incomplete.original_scope_digest!==collection.scope_digest||incomplete.completion_proven!==false||
   !nativeExit||typeof nativeExit!=="object"||Array.isArray(nativeExit)||Object.keys(nativeExit).sort().join(",")!=="code,signal"||!("code" in nativeExit)||!("signal" in nativeExit)||nativeExit.signal!==null||exitBits(nativeExit.code)!==exit||!["agent_run_budget_exhausted","workspace_rehearsal_deadline","workspace_rehearsal_runtime_failed"].includes(String(incomplete.interruption_reason)))return null;
  if(cleanup.reason==="agent_sandbox_task_deadline"&&(cleanup.runtime_stopped_uptime_ms as number)>=(deadline as number))return "agent_original_task_deadline";
  if(cleanup.reason==="exited"&&exit>0)return "agent_original_runtime_exit_failed";
 }catch{/* Missing/corrupt/mixed or merely disposed originals stay Unknown. */}
 return null;
}
