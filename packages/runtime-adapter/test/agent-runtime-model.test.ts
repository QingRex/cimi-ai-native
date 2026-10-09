import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { digest } from "../src/files.js";
import { parseAgentWorkspaceToolScope } from "../src/agent-workspace-authority.js";
import { claimAgentRuntimeOperation, readAgentRuntimeOriginalIdentity, requestAgentRuntimeCancellation } from "../src/agent-runtime-operation.js";
import { AgentRuntimeModelHost, parseAgentRuntimeModelRequest, readAgentRuntimeModelOriginals, type AgentRuntimeModelPort, type AgentRuntimeModelResponse } from "../src/agent-runtime-model.js";

describe("original host model dispatch", () => {
 const roots: string[]=[];
 afterEach(()=>{for(const root of roots.splice(0)){if(!resolve(root).startsWith(resolve(tmpdir())+sep+"cimiloop-model-host-"))throw Error("Unsafe cleanup");rmSync(root,{recursive:true,force:true});}});
 function fixture(){
  const root=mkdtempSync(join(tmpdir(),"cimiloop-model-host-")); roots.push(root);
  const scope=parseAgentWorkspaceToolScope({project_id:createInternalId(),run_id:createInternalId(),operation_key:createInternalId(),executor_actor_id:createInternalId(),context_digest:digest("context"),skill_bindings:[],
   runtime_binding:{binding_ref:{object_type:"provider_binding",id:createInternalId()},digest:digest("binding")},host_admission_ref:{provider:"local_content",resource_type:"agent_host_admission",locator:digest("admission").value,digest:digest("admission")}});
  const frame={format:"cimiloop/agent-runtime-model-request/1.0.0",scope_digest:digest(JSON.stringify(scope)).value,admission_digest:digest("constructed qualification only").value,call_id:"model_0001",tool:"model_step",prompt:[{role:"user",content:[{type:"text",text:"Read the admitted file."}]}],tools:[{type:"function",name:"cimi_read",description:"Read admitted file",inputSchema:{type:"object"}}],max_output_tokens:512};
  const response:AgentRuntimeModelResponse={content:[{type:"text",text:"original response"}],usage:{input_tokens:3,output_tokens:2},finish:"stop"};
  let sends=0,allowed=true;
  const port:AgentRuntimeModelPort={admission_digest:digest("constructed qualification only").value,check:async()=>{if(!allowed)throw Error("revoked");},execute:async()=>{sends++;return response;}};
  let initialized=false;
  return {root,scope,frame,response,port,sends:()=>sends,revoke:()=>{allowed=false;},open:async()=>{if(!initialized){initialized=true;return AgentRuntimeModelHost.initialize(root,scope,port,["cimi_read"]);}return AgentRuntimeModelHost.open(root,scope,port,["cimi_read"]);}};
 }
 it("requires the entire original SDK attachment projection before any model send",async()=>{
  const f=fixture(),packet='{"format":"original","last":"complete end"}\nsecond line';
  const host=await AgentRuntimeModelHost.initialize(f.root,f.scope,f.port,["cimi_read"],packet);
  const projection='<content>\n1: {"format":"original","last":"complete end"}\n2: second line\n\n(End of file - total 2 lines)\n</content>';
  const request={...f.frame,prompt:[{role:"user",content:[{type:"text",text:projection}]}]};
  await expect(host.execute({...request,prompt:[{role:"user",content:[{type:"text",text:projection.replace('complete end','truncated end')}]}]})).rejects.toThrow("agent_model_task_packet_incomplete");
  expect(f.sends()).toBe(0);expect((await host.execute(request)).replay).toBe(false);expect(f.sends()).toBe(1);
  await expect(AgentRuntimeModelHost.open(f.root,f.scope,f.port,["cimi_read"],packet+"substituted")).rejects.toThrow("agent_model_original_unproven");
 });
 it("round-trips bounded serialized original launch input and rejects oversize before claim",()=>{
  const f=fixture(),owner={pid:process.pid,creation_ticks:"1",image:process.execPath};
  const input={purpose:"agent_runtime",prompt:'"quoted"\n'.repeat(3500)};expect(Buffer.byteLength(JSON.stringify(input))).toBeGreaterThan(32768);
  claimAgentRuntimeOperation(f.root,f.scope,input,owner);expect(readAgentRuntimeOriginalIdentity(f.root,f.scope).input).toEqual(input);
  expect(requestAgentRuntimeCancellation(f.root,f.scope).requested).toBe(true);
  const other=fixture();expect(()=>claimAgentRuntimeOperation(other.root,other.scope,{prompt:'"'.repeat(65536)},owner)).toThrow("agent_runtime_input_limit");
  expect(()=>readAgentRuntimeOriginalIdentity(other.root,other.scope)).toThrow();
 });
 it("persists original input before send and replays the exact response after host reopening",async()=>{
  const f=fixture(),host=await f.open();const first=await host.execute(f.frame);expect(first).toMatchObject({receipt:f.response,replay:false});expect(f.sends()).toBe(1);
  const reopened=await f.open();expect(await reopened.execute(f.frame)).toMatchObject({receipt:f.response,replay:true});expect(f.sends()).toBe(1);
  await expect(reopened.execute({...f.frame,prompt:[]})).rejects.toThrow();expect(f.sends()).toBe(1);
 });
 it("never resends an original request whose response was lost after dispatch",async()=>{
  const f=fixture();f.port.execute=async()=>{throw Error("response lost after possible charge");};
  const host=await f.open();await expect(host.execute(f.frame)).rejects.toThrow("response lost");
  const reopened=await f.open();await expect(reopened.execute(f.frame)).rejects.toThrow("agent_model_original_unknown");
  await expect(reopened.execute({...f.frame,call_id:"model_0002"})).rejects.toThrow("agent_model_original_unknown");
 });
 it("checks live authority before dispatch and retains prior receipts after revocation",async()=>{
  const f=fixture(),host=await f.open();await host.execute(f.frame);f.revoke();
  expect(await host.execute(f.frame)).toMatchObject({replay:true});await expect(host.execute({...f.frame,call_id:"model_0002"})).rejects.toThrow("revoked");expect(f.sends()).toBe(1);
 });
 it("rejects a substituted admission and corrupt original response",async()=>{
  const f=fixture(),host=await f.open();await host.execute(f.frame);
  await expect(AgentRuntimeModelHost.open(f.root,f.scope,{...f.port,admission_digest:digest("different").value},["cimi_read"])).rejects.toThrow();
  const responsePath=join(host.path,"model_0001","reply.json"),original=readFileSync(responsePath);writeFileSync(responsePath,original.toString().replace("original response","substituted"));
  await expect(host.execute(f.frame)).rejects.toThrow("agent_model_original_unproven");expect(f.sends()).toBe(1);
 });
 it("refuses unapproved tools, endpoints, oversized output and cancellation before send",async()=>{
  const f=fixture();expect(()=>parseAgentRuntimeModelRequest(f.scope,{...f.frame,endpoint:"https://foreign"},["cimi_read"])).toThrow();
  expect(()=>parseAgentRuntimeModelRequest(f.scope,{...f.frame,tools:[{type:"function",name:"bash",inputSchema:{}}]},["cimi_read"])).toThrow();
  const host=await f.open(),cancel=AbortSignal.abort();await expect(host.execute(f.frame,cancel)).rejects.toThrow();expect(f.sends()).toBe(0);
  f.port.execute=async()=>({...f.response,content:[{type:"text",text:"x".repeat(20000)}]});const invalid=await f.open();await expect(invalid.execute(f.frame)).rejects.toThrow("agent_model_response_denied");
  await expect(host.execute(f.frame)).rejects.toThrow("agent_model_original_unknown");
 });
 it("lost original call or entire ledger cannot authorize another send",async()=>{
  const f=fixture(),host=await f.open();await host.execute(f.frame);
  rmSync(join(host.path,f.frame.call_id),{recursive:true});await expect(host.execute(f.frame)).rejects.toThrow("agent_model_original_unknown");expect(f.sends()).toBe(1);
  rmSync(host.path,{recursive:true});await expect(f.open()).rejects.toThrow("agent_model_original_unproven");
  await expect(AgentRuntimeModelHost.initialize(f.root,f.scope,f.port,["cimi_read"])).rejects.toThrow("agent_model_original_unproven");expect(f.sends()).toBe(1);
 });
 it("an original pipe frame cannot substitute a different model admission",async()=>{
  const f=fixture(),host=await f.open();await expect(host.execute({...f.frame,admission_digest:digest("foreign admission").value})).rejects.toThrow("agent_model_admission_mismatch");expect(f.sends()).toBe(0);
 });
 it("rejects corrupt original UTF-8 without replacement-character normalization",async()=>{
  const f=fixture();f.port.execute=async()=>({...f.response,content:[{type:"text",text:"\ufffd"}]});const host=await f.open();await host.execute(f.frame);
  const path=join(host.path,"model_0001","reply.json"),bytes=readFileSync(path),at=bytes.indexOf(Buffer.from("\ufffd"));expect(at).toBeGreaterThan(0);
  writeFileSync(path,Buffer.concat([bytes.subarray(0,at),Buffer.from([255]),bytes.subarray(at+3)]));
  await expect(host.execute(f.frame)).rejects.toThrow("agent_model_original_unproven");expect(()=>readAgentRuntimeModelOriginals(f.root,f.scope)).toThrow();
 });
 it("concurrent identical requests send once and join the original reply",async()=>{
  const f=fixture(),host=await f.open();const [a,b]=await Promise.all([host.execute(f.frame),host.execute(f.frame)]);expect(a.receipt).toEqual(b.receipt);expect(f.sends()).toBe(1);
 });
});