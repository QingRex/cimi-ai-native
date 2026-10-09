import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {afterEach,describe,expect,it} from "vitest";
import {rawReference,digest} from "../../runtime-adapter/src/files.js";
import {classifyOriginalAgentExecutionFailure} from "../src/agent-runtime-failure-local.js";
// Constructed immutable Native bytes test refusal boundaries. They are not
// independent evidence of a real process, account, model or S1 execution.
describe("original negative execution result",()=>{
 const roots:string[]=[];
 afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
 function fixture(){
  const root=mkdtempSync(join(tmpdir(),"cimiloop-negative-result-contract-"));roots.push(root);
  const nonce="11111111-1111-4111-8111-111111111111",scope_digest=digest("scope").value,owner={pid:12,creation_ticks:"12",image:process.execPath},supervisor={...owner,pid:13},peer={...owner,pid:14};
  const config={format:"cimiloop/agent-workspace-sandbox-config/2.0.0",nonce,owner,scope_digest,deadline_uptime_ms:60000};
  const records:Record<string,Record<string,unknown>>={"original-config.json":config,"original-launcher.json":{format:"cimiloop/agent-workspace-launcher/1.0.0",nonce,owner,supervisor},
   "agent-sandbox-original.json":{format:"cimiloop/agent-workspace-sandbox/1.0.0",nonce,phase:"suspended",supervisor,peer},
   "agent-sandbox-resources.json":{format:"cimiloop/agent-workspace-resources/1.0.0",nonce,phase:"ended",scope_digest,config_digest:digest(JSON.stringify(config)).value,owner,supervisor,runtime:peer,resources_disposed:true},
   "agent-sandbox-cleanup.json":{format:"cimiloop/agent-workspace-sandbox/1.0.0",phase:"ended",nonce,reason:"agent_sandbox_task_deadline",exit_code:12,runtime_stopped_uptime_ms:60001,resources_disposed:true,cleanup_errors:[],formal_agent_execution_enabled:false},
   "incomplete.json":{format:"cimiloop/opencode-workspace-incomplete/1.0.0",nonce,original_scope_digest:scope_digest,native_exit:{code:12,signal:null},interruption_reason:"agent_run_budget_exhausted",completion_proven:false}};
  const identity={claim:{owner},input:{deadline_uptime_ms:60000} as Record<string,unknown>};
  const collection={scope_digest,status:{status:"Stopped",resources_disposed:true},artifacts:[] as {name:string;reference:ReturnType<typeof rawReference>}[]};
  const materialize=()=>{collection.artifacts=Object.entries(records).map(([name,value])=>({name,reference:rawReference(root,Buffer.from(JSON.stringify(value)),"agent_runtime_original_bytes",name)}));};
  const classify=()=>classifyOriginalAgentExecutionFailure(identity as never,collection as never);
  materialize();return {records,identity,collection,materialize,classify};
 }
 it("qualifies the exact original Task deadline and an actual nonzero Runtime exit without claiming billing or success",()=>{
  const f=fixture();expect(f.classify()).toBe("agent_original_task_deadline");
  f.records["agent-sandbox-cleanup.json"]!.reason="exited";f.records["agent-sandbox-cleanup.json"]!.exit_code=3;f.records["incomplete.json"]!.native_exit={code:3,signal:null};f.records["incomplete.json"]!.interruption_reason="workspace_rehearsal_runtime_failed";f.materialize();expect(f.classify()).toBe("agent_original_runtime_exit_failed");
  f.records["agent-sandbox-cleanup.json"]!.exit_code=-1073741819;f.records["incomplete.json"]!.native_exit={code:3221225477,signal:null};f.materialize();expect(f.classify()).toBe("agent_original_runtime_exit_failed");
  f.records["agent-sandbox-cleanup.json"]!.exit_code=0;f.records["incomplete.json"]!.native_exit={code:0,signal:null};f.materialize();expect(f.classify()).toBeNull();
 });
 it.each(["wrong_nonce","wrong_scope","wrong_owner","wrong_peer","wrong_config","before_deadline","missing_deadline","cancelled","live","cleanup_error","wrong_exit","missing_original","duplicate_artifact","out_of_range_exit","signaled_exit"])("keeps %s unproven",kind=>{
  const f=fixture(),cleanup=f.records["agent-sandbox-cleanup.json"]!,resources=f.records["agent-sandbox-resources.json"]!,incomplete=f.records["incomplete.json"]!;
  if(kind==="wrong_nonce")cleanup.nonce="foreign";
  if(kind==="wrong_scope")resources.scope_digest=digest("foreign").value;
  if(kind==="wrong_owner")resources.owner={pid:99};
  if(kind==="wrong_peer")resources.runtime={pid:99};
  if(kind==="wrong_config")resources.config_digest=digest("foreign").value;
  if(kind==="before_deadline")cleanup.runtime_stopped_uptime_ms=59999;
  if(kind==="missing_deadline")delete f.identity.input.deadline_uptime_ms;
  if(kind==="cancelled")incomplete.interruption_reason="workspace_rehearsal_cancel_requested";
  if(kind==="live")f.collection.status.status="Running";
  if(kind==="cleanup_error")cleanup.cleanup_errors=["process"];
  if(kind==="out_of_range_exit")cleanup.exit_code=-4294967296;
  if(kind==="signaled_exit")incomplete.native_exit={code:12,signal:"SIGTERM"};
  if(kind==="wrong_exit")incomplete.native_exit={code:3,signal:null};
  if(kind==="missing_original")delete f.records["agent-sandbox-original.json"];
  f.materialize();if(kind==="duplicate_artifact")f.collection.artifacts.push(f.collection.artifacts[0]!);
  expect(f.classify()).toBeNull();
 });
 it("explicitly reads private production config4 only with the original matching lifetime policy",()=>{
  const f=fixture(),config=f.records["original-config.json"]!;
  config.format="cimiloop/agent-workspace-sandbox-config/4.0.0";config.lifetime_policy="agent_task/1.0.0";config.elapsed_ms=600000;config.prompt="Frozen task";
  f.identity.input.lifetime_policy="agent_task/1.0.0";f.records["agent-sandbox-resources.json"]!.config_digest=digest(JSON.stringify(config)).value;
  f.materialize();expect(f.classify()).toBe("agent_original_task_deadline");
  f.identity.input.lifetime_policy="foreign";expect(f.classify()).toBeNull();
 });
 it("keeps private config5 negative execution qualification bound to its frozen binary proof",()=>{
  const f=fixture(),config=f.records["original-config.json"]!;
  config.format="cimiloop/agent-workspace-sandbox-config/5.0.0";config.lifetime_policy="agent_task/1.0.0";config.prompt="Frozen task";
  config.binary_original={format:"cimiloop/runtime-binary-original-proof/1.0.0",path:process.execPath,sha:digest("constructed executable").value};
  f.identity.input.binary_original=structuredClone(config.binary_original);f.identity.input.lifetime_policy=config.lifetime_policy;
  f.records["agent-sandbox-resources.json"]!.config_digest=digest(JSON.stringify(config)).value;f.materialize();expect(f.classify()).toBe("agent_original_task_deadline");
  f.identity.input.binary_original={foreign:true};expect(f.classify()).toBeNull();
 });});
