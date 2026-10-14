import { LocalAgentRuntimeComposition } from "../src/agent-runtime-composition-local.js";
import { LocalAgentStartCustody } from "../src/agent-start-custody-local.js";
import { LocalAgentCheckAdmission } from "../src/agent-check-admission-local.js";
import { createDedicatedAgentRuntimeModel, readDedicatedAgentModelOriginals } from "../../runtime-adapter/src/agent-dedicated-model.js";
import { AgentRuntimeModelHost, parseAgentRuntimeModelRequest } from "../../runtime-adapter/src/agent-runtime-model.js";
import { httpFixture, HTTP_FIXTURE_KEY } from "../../runtime-adapter/test/gateway-http-fixture.js";
import { digest } from "../../runtime-adapter/src/files.js";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { CimiLoopKernel } from "@cimiloop/kernel";
import { collectAgentRuntimeOperation } from "@cimiloop/runtime-adapter";
import {AGENT_JOB_RESOURCE_POLICY,readRuntimeBinaryOriginal} from '@cimiloop/runtime-adapter';
import {pinBinary} from '../../runtime-adapter/src/native.js';
import { rawReference } from "../../runtime-adapter/src/files.js";
import { claimAgentRuntimeOperation } from "../../runtime-adapter/src/agent-runtime-operation.js";
import { createAgentRunProject } from "../../../tests/fixtures/agent-run-project.js";
import { LocalRunVerifier } from "../src/runs-local.js";
import { LocalAgentRuntimeObservation } from "../src/agent-runtime-observation-local.js";
import { originalAgentWorkspaceScope } from "../src/agent-workspace-tools-local.js";
import { executeLocalCommand } from "../src/project.js";
import type { AgentRuntimeControlContext } from "../src/agent-runtime-control-local.js";
// Real Kernel/SQLite and original-claim/collection code. Agent qualification,
// owner identity and incomplete Native claim are explicitly constructed; no OS
// process, actual model or formal admission is established by these contracts.
describe("original Agent Unknown observation joins the Kernel receipt",()=>{
 let root:string,f:ReturnType<typeof createAgentRunProject>,local:AgentRuntimeControlContext,runId:string,claim:ReturnType<typeof claimAgentRuntimeOperation>;
 const collect=vi.fn<typeof collectAgentRuntimeOperation>();let service:LocalAgentRuntimeObservation;
 const command=()=>({command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:"technical_owner",command_type:"RecordRunObservation",
 target:{object_type:"run",id:runId},expected_revision:f.store.getRun(runId)!.revision,payload:{}});
 const seed=()=>{const scope=originalAgentWorkspaceScope({...local,store:f.store,caller:f.caller,kernel:f.kernel},runId);
 claim=claimAgentRuntimeOperation(local.location.dataDirectory,scope,{purpose:"constructed-incomplete-original"},{pid:1234,creation_ticks:"123456",image:process.execPath});};
 beforeEach(()=>{vi.resetAllMocks();root=mkdtempSync(join(tmpdir(),"cimiloop-agent-observation-contract-"));f=createAgentRunProject(root);
 runId=f.reserveAgent(f.prepareAgent()).run.id;local={store:f.store,instance:{schema_version:"1.0.0",instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at},
 location:{repositoryKind:"git",repositoryPath:root,dataDirectory:dirname(f.path),databasePath:f.path,instancePath:join(dirname(f.path),"instance.json"),suggestedName:"Constructed observation contract"},
 kernel:new CimiLoopKernel({store:f.store,caller:{kind:"local_operator",project_id:f.project.id,actor_id:f.actor.id},runVerifier:new LocalRunVerifier(root,dirname(f.path))})};
 collect.mockImplementation(collectAgentRuntimeOperation);service=new LocalAgentRuntimeObservation(local,{collect});},60000);
 afterEach(()=>{f?.store.close();if(root){if(dirname(root)!==resolve(tmpdir())||!basename(root).startsWith("cimiloop-agent-observation-contract-"))throw Error("Unsafe cleanup");rmSync(root,{recursive:true,force:true});}});
 it("refuses to manufacture an observation for a Run with no original claim",async()=>{const sequence=f.store.asOfEventSequence();
 await expect(service.record(command())).rejects.toMatchObject({code:"CAPABILITY_UNAVAILABLE"});expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.task().usage.cost_reserved_micros).toBe(100);});
 it("records only Unknown with unknown cost from the original incomplete operation and replays one receipt across a new service",async()=>{
 seed();const input=command(),sequence=f.store.asOfEventSequence(),first=await service.record(input);
 expect(first).toMatchObject({command_type:"RecordRunObservation",data:{observation:{report:{run_id:runId,status:"unknown",usage:{cost_known:false},producer_actor_id:f.actor.id}}}});
 expect(await new LocalAgentRuntimeObservation(local,{collect}).record(input)).toEqual(first);expect(collect).toHaveBeenCalledTimes(1);
 expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(f.store.listRuns(f.change.id)).toHaveLength(1);
 expect(f.task().usage).toMatchObject({pending_reconciliation:true,cost_reserved_micros:100,attempts_released:0});
 expect(f.store.getRun(runId)!.status).toBe("Unknown");
 });
 it("uses common dedicated originals in the Kernel observation and refuses stale provider custody without resending",async()=>{
  const scope=originalAgentWorkspaceScope({...local,store:f.store,caller:f.caller,kernel:f.kernel},runId),admission=digest("constructed dedicated admission").value;
  const tls=await httpFixture({reply:body=>({content_type:"application/json",chunks:[Buffer.from(JSON.stringify({id:"provider_d256_1",model:"glm-fixture",request_id:(body as {request_id:string}).request_id,choices:[{index:0,message:{role:"assistant",content:"constructed result",reasoning_content:"original reasoning"},finish_reason:"stop"}],usage:{prompt_tokens:5,completion_tokens:5,total_tokens:10}}))]})});let holds=0,credentials=0;
  try{const model=createDedicatedAgentRuntimeModel({root:local.location.dataDirectory,repositoryPath:root,scope,connection:{format:"cimiloop/dedicated-model/1.0.0",provider:"zhipuai-coding-plan",model:"zhipuai-coding-plan/glm-fixture",credential_file:join(tmpdir(),"d256-absent-public-fixture-"+runId+".dpapi.json"),credential_digest:digest("constructed encrypted identity")},account:{admission_digest:admission,profile:{model:"glm-fixture",thinking:"enabled"},check:async()=>{},reserve:async(_scope,request)=>{holds++;return {format:"cimiloop/agent-model-budget-hold/1.0.0",...request,account_digest:digest("constructed account").value,approval_digest:digest("constructed approval").value,tariff_digest:digest("constructed tariff").value,cash_upper_micros:30,credit_upper_micro_units:10,input_token_limit:100,output_token_limit:request.max_output_tokens};},verifyHold:async()=>{}}},{boundary:tls.boundary,readCredential:async()=>{credentials++;return HTTP_FIXTURE_KEY;}}),host=await AgentRuntimeModelHost.initialize(local.location.dataDirectory,scope,model,["cimi_read"]);
   const request=parseAgentRuntimeModelRequest(scope,{format:"cimiloop/agent-runtime-model-request/1.0.0",scope_digest:digest(JSON.stringify(scope)).value,admission_digest:admission,call_id:"model_0001",tool:"model_step",prompt:[{role:"user",content:"public constructed Task"}],tools:[],max_output_tokens:512},["cimi_read"]);await host.execute(request);
   claim=claimAgentRuntimeOperation(local.location.dataDirectory,scope,{purpose:"agent_runtime",model_original_binding:host.originalBinding},{pid:1234,creation_ticks:"123456",image:process.execPath});const input=command(),sequence=f.store.asOfEventSequence(),first=await service.record(input);if(!("command_type" in first)||first.command_type!=="RecordRunObservation")throw Error("Expected observation");
   expect(first).toMatchObject({data:{observation:{report:{status:"unknown",usage:{cost_known:false}}}}});expect(readDedicatedAgentModelOriginals(local.location.dataDirectory,scope).summary).toMatchObject({status:"Observed",calls:1,original_requirement_pinned:true,budget_identity_pinned:true,budget:{cash_upper_micros:30,credit_upper_micro_units:10,settled:false}});expect(f.task().usage).toMatchObject({pending_reconciliation:true,cost_reserved_micros:100});
   const p=join(local.location.dataDirectory,"agent-dedicated-model-originals",f.project.id,runId,"model_0001/provider-response.json"),original=readFileSync(p);writeFileSync(p,"{}");
   expect(executeLocalCommand(local,{...command(),expected_revision:f.store.getRun(runId)!.revision,payload:{raw_result_ref:first.data.observation.raw_result_ref}})).toMatchObject({code:"EVIDENCE_MISSING"});expect(f.store.asOfEventSequence()).toBe(sequence+1);
   expect(await service.record(input)).toEqual(first);expect(holds).toBe(1);expect(credentials).toBe(1);expect(tls.observations).toHaveLength(1);expect(readFileSync(p,"utf8")).toBe("{}");
   // Restore only this constructed mutation fixture after the failure assertion;
   // no actual Native/original Run evidence is repaired by a runtime API.
   writeFileSync(p,original);
  }finally{await tls.close();}
 });
 it("rejects malformed installed model evidence before shared composition can erase it or create effects",()=>{
  // Public factory boundary only; constructed prototype objects confer no
  // physical custody, installed checks or production qualification.
  const sequence=f.store.asOfEventSequence();expect(()=>LocalAgentRuntimeComposition.open({local:{...local,caller:f.caller,store:f.store,kernel:f.kernel},binary:"unused public fixture",custody:Object.create(LocalAgentStartCustody.prototype) as LocalAgentStartCustody,checks:Object.create(LocalAgentCheckAdmission.prototype) as LocalAgentCheckAdmission,model:{admission_digest:digest("constructed admission").value,original_evidence:{kind:"invalid",header_digest:"bad"},check:async()=>{},execute:async()=>({content:[{type:"text",text:"unused"}],usage:{input_tokens:0,output_tokens:0},finish:"stop"})} as never})).toThrow();expect(f.store.asOfEventSequence()).toBe(sequence);
 });
 it("rejects changes to a reused request, foreign identity, roles and unsupported payloads",async()=>{
 seed();const input=command();await service.record(input);const sequence=f.store.asOfEventSequence();
 await expect(service.record({...input,requested_at:new Date(Date.now()+1).toISOString()})).rejects.toMatchObject({code:"COMMAND_ID_REUSED"});
 await expect(service.record({...command(),actor_id:f.agent.id})).rejects.toMatchObject({code:"INVALID_COMMAND"});
 await expect(service.record({...command(),payload:{status:"succeeded"}})).rejects.toMatchObject({code:"INVALID_COMMAND"});
 expect(await service.record({...command(),acting_role:"executor"})).toMatchObject({code:"ROLE_NOT_ASSIGNED"});expect(f.store.asOfEventSequence()).toBe(sequence);
 });
 it("rejects imported success, costs, changed proof pins and raw content corruption without releasing the original budget",async()=>{
 seed();const first=await service.record(command());if(!("command_type" in first)||first.command_type!=="RecordRunObservation")throw Error("Expected observation");
 const report=first.data.observation.report;if(report.format!=="cimiloop/agent-run/1.0.0")throw Error("Expected Agent report");
 const content=new LocalRunVerifier(root,local.location.dataDirectory).content,sequence=f.store.asOfEventSequence();
 for(const changed of [{status:"succeeded"},{usage:{cost_known:true,cost_micros:0,currency:"USD"}},{producer_actor_id:f.agent.id}]) {
 const forged=content.storeContent(Buffer.from(JSON.stringify({...report,...changed})),"agent_run");
 expect(executeLocalCommand(local,{...command(),payload:{raw_result_ref:forged}})).toMatchObject({code:"EVIDENCE_MISSING"});}
 const file=join(local.location.dataDirectory,"objects",report.result_proof_ref.locator),bytes=readFileSync(file);try{writeFileSync(file,'{}');
 expect(executeLocalCommand(local,{...command(),payload:{raw_result_ref:first.data.observation.raw_result_ref}})).toMatchObject({code:"EVIDENCE_MISSING"});}finally{writeFileSync(file,bytes);}
 expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.task().usage.cost_reserved_micros).toBe(100);
 });
 it("recovers a committed response loss without recollecting or depending on later missing original Native files",async()=>{
 seed();const input=command(),execute=local.kernel.execute.bind(local.kernel),sequence=f.store.asOfEventSequence();let lost=true;
 local.kernel={getObject:local.kernel.getObject.bind(local.kernel),authorizeAgentRunControl:local.kernel.authorizeAgentRunControl.bind(local.kernel),execute:raw=>{const result=execute(raw);if(lost&&!("code" in result)){lost=false;throw Error("Constructed committed response loss");}return result;}};
 await expect(new LocalAgentRuntimeObservation(local,{collect}).record(input)).rejects.toThrow("Constructed committed response loss");
 writeFileSync(join(claim.claimDirectory,"input.json"),'{}');collect.mockRejectedValue(Error("Must not recollect"));
 expect(await new LocalAgentRuntimeObservation(local,{collect}).record(input)).toMatchObject({command_type:"RecordRunObservation"});
 expect(collect).toHaveBeenCalledTimes(1);expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(f.task().usage.pending_reconciliation).toBe(true);
 });
 it("retains incomplete preparation after a lost collector response, resumes the same request and does not overwrite the first persisted report",async()=>{
 seed();const input=command(),sequence=f.store.asOfEventSequence();collect.mockRejectedValueOnce(Error("Constructed collection response loss"));
 await expect(service.record(input)).rejects.toMatchObject({code:"CAPABILITY_UNAVAILABLE"});expect(f.store.asOfEventSequence()).toBe(sequence);
 expect(await new LocalAgentRuntimeObservation(local,{collect}).record(input)).toMatchObject({command_type:"RecordRunObservation"});
 expect(collect).toHaveBeenCalledTimes(2);expect(f.store.asOfEventSequence()).toBe(sequence+1);
 });
 it("does not enable default Agent admission or tool execution when installing the original-result reader",()=>{
 const verifier=new LocalRunVerifier(root,local.location.dataDirectory);expect(()=>verifier.agent!.admitContext(f.project,{} as never)).toThrow();
 expect(verifier.agent!.checkToolAuthority).toBeUndefined();
 });
 it("retains one prepared report and one Kernel effect for simultaneous identical requests",async()=>{
 seed();const input=command(),sequence=f.store.asOfEventSequence();let release!:()=>void,arrived!:()=>void;
 const gate=new Promise<void>(done=>{release=done;}),both=new Promise<void>(done=>{arrived=done;});let calls=0;
 collect.mockImplementation(async(...args)=>{if(++calls===2)arrived();await gate;return collectAgentRuntimeOperation(...args);});
 const resultsPending=Promise.all([service.record(input),new LocalAgentRuntimeObservation(local,{collect}).record(input)]);
 // Attach immediately so an early rejection remains an asserted test failure.
 resultsPending.catch(()=>{});await Promise.race([both,resultsPending]);release();
 const results=await resultsPending;expect(results[1]).toEqual(results[0]);expect(f.store.asOfEventSequence()).toBe(sequence+1);
 expect(f.store.listRuntimeRecords("run_observation",f.change.id)).toHaveLength(1);expect(f.task().usage.cost_reserved_micros).toBe(100);
 });
 it.each(["request","prepared"])("fails closed on a damaged persisted %s without rewriting it or producing an observation",async name=>{
 seed();const input=command(),sequence=f.store.asOfEventSequence(),execute=local.kernel.execute.bind(local.kernel);
 if(name==="request")collect.mockRejectedValueOnce(Error("Constructed collector interruption"));
 else local.kernel={getObject:local.kernel.getObject.bind(local.kernel),authorizeAgentRunControl:local.kernel.authorizeAgentRunControl.bind(local.kernel),execute:()=>{throw Error("Constructed precommit interruption");}};
 await expect(service.record(input)).rejects.toThrow();local.kernel={getObject:local.kernel.getObject.bind(local.kernel),authorizeAgentRunControl:local.kernel.authorizeAgentRunControl.bind(local.kernel),execute};
 const file=join(local.location.dataDirectory,"agent-runtime-observations",f.project.id,runId,input.command_id,name+".json");writeFileSync(file,"broken");
 await expect(new LocalAgentRuntimeObservation(local,{collect}).record(input)).rejects.toMatchObject({code:"EVIDENCE_MISSING",category:"storage"});
 expect(readFileSync(file,"utf8")).toBe("broken");expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.task().usage.cost_reserved_micros).toBe(100);
 });
 it("accepts the bounded maximum IPC history plus original Runtime artifacts without claiming completion",async()=>{
 seed();collect.mockImplementation(async(...args)=>{const collected=await collectAgentRuntimeOperation(...args);
 // Constructed raw references exercise capacity, not real IPC/Native evidence.
 collected.artifacts=Array.from({length:523},(_,index)=>{const name="constructed-history-"+index;
 return {name,reference:rawReference(local.location.dataDirectory,Buffer.from("constructed-history"),"agent_runtime_original_bytes",name)};});return collected;});
 expect(await service.record(command())).toMatchObject({command_type:"RecordRunObservation",data:{observation:{report:{status:"unknown",usage:{cost_known:false}}}}});
 expect(f.task().usage.cost_reserved_micros).toBe(100);
 });
 it.each([525,526])('claim3 retains its original Job artifact slot and refuses one more: %s artifacts',async count=>{
  // Actual original claim/key and shared Kernel write; constructed executable
  // bytes/references only. This is capacity coverage, not Native/Job evidence.
  const source=join(local.location.dataDirectory,'PUBLIC-observer.exe');writeFileSync(source,'PUBLIC constructed observer bytes, never executed');
  const binary=pinBinary(local.location.dataDirectory,source),observer=readRuntimeBinaryOriginal(local.location.dataDirectory,binary.path,binary.digest.value);
  const scope=originalAgentWorkspaceScope({...local,store:f.store,caller:f.caller,kernel:f.kernel},runId);
  claim=claimAgentRuntimeOperation(local.location.dataDirectory,scope,{purpose:'constructed-incomplete-original',startup_profile:'bun_interpreter/1.0.0',job_resource_policy:AGENT_JOB_RESOURCE_POLICY,job_observer_original:observer},{pid:1234,creation_ticks:'123456',image:process.execPath});
  collect.mockImplementation(async(...args)=>{const collected=await collectAgentRuntimeOperation(...args);
   collected.artifacts=Array.from({length:count},(_,index)=>{const name='constructed-claim3-history-'+index;return{name,reference:rawReference(local.location.dataDirectory,Buffer.from('PUBLIC constructed history'),'agent_runtime_original_bytes',name)};});return collected;});
  const sequence=f.store.asOfEventSequence();
  if(count===525)expect(await service.record(command())).toMatchObject({command_type:'RecordRunObservation',data:{observation:{report:{status:'unknown',usage:{cost_known:false}}}}});
  else {await expect(service.record(command())).rejects.toThrow();expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.store.listRuntimeRecords('run_observation',f.change.id)).toHaveLength(0);}
  expect(collect).toHaveBeenCalledTimes(1);expect(f.task().usage.cost_reserved_micros).toBe(100);expect(f.store.listRuns(f.change.id)).toHaveLength(1);
 });
 it("records independently pinned Native deadline failure through Kernel and retains unknown cost and the original budget",async()=>{
  seed();const config={format:"cimiloop/agent-workspace-sandbox-config/2.0.0",nonce:claim.operationId,owner:{},scope_digest:"constructed",deadline_uptime_ms:60000};
  const original=await collectAgentRuntimeOperation(local.location.dataDirectory,originalAgentWorkspaceScope({...local,store:f.store,caller:f.caller,kernel:f.kernel},runId));
  const scope=originalAgentWorkspaceScope({...local,store:f.store,caller:f.caller,kernel:f.kernel},runId);
  const identity=(await import("@cimiloop/runtime-adapter")).readAgentRuntimeOriginalIdentity(local.location.dataDirectory,scope);
  // Constructed Native bytes exercise negative-result qualification only. This
  // contract does not establish actual Windows process or production account.
  const supervisor={pid:4321,creation_ticks:"4321",image:process.execPath},peer={...supervisor,pid:4322};
  const actualConfig={...config,owner:identity.claim.owner,scope_digest:original.scope_digest,deadline_uptime_ms:60000};
  const bytes={"original-config.json":actualConfig,"original-launcher.json":{format:"cimiloop/agent-workspace-launcher/1.0.0",nonce:claim.operationId,owner:identity.claim.owner,supervisor},
   "agent-sandbox-original.json":{format:"cimiloop/agent-workspace-sandbox/1.0.0",phase:"suspended",nonce:claim.operationId,supervisor,peer},
   "agent-sandbox-resources.json":{format:"cimiloop/agent-workspace-resources/1.0.0",nonce:claim.operationId,scope_digest:original.scope_digest,config_digest:rawReference(local.location.dataDirectory,Buffer.from(JSON.stringify(actualConfig)),"agent_runtime_original_bytes","original-config.json").digest!.value,owner:identity.claim.owner,supervisor,runtime:peer,phase:"ended",resources_disposed:true},
   "agent-sandbox-cleanup.json":{format:"cimiloop/agent-workspace-sandbox/1.0.0",phase:"ended",nonce:claim.operationId,reason:"agent_sandbox_task_deadline",exit_code:12,runtime_stopped_uptime_ms:60001,resources_disposed:true,cleanup_errors:[],formal_agent_execution_enabled:false},
   "incomplete.json":{format:"cimiloop/opencode-workspace-incomplete/1.0.0",nonce:claim.operationId,original_scope_digest:original.scope_digest,native_exit:{code:12,signal:null},interruption_reason:"agent_run_budget_exhausted",completion_proven:false}};
  // The immutable original input must independently pin the same deadline.
  const {digest}=await import("../../runtime-adapter/src/files.js");
  const inputFile=join(claim.claimDirectory,"input.json"),claimFile=join(claim.claimDirectory,"claim.json"),keyFile=join(local.location.dataDirectory,"agent-runtime-claims",f.project.id,"keys",f.store.getRuntimeRecord("run_record",f.store.getRun(runId)!.record_ref.id)!.operation_key,"original.json");
  const input=JSON.stringify({purpose:"constructed-incomplete-original",deadline_uptime_ms:60000});writeFileSync(inputFile,input);
  const claimBody=JSON.parse(readFileSync(claimFile,"utf8"));claimBody.input_digest=digest(input).value;writeFileSync(claimFile,JSON.stringify(claimBody));
  const keyBody=JSON.parse(readFileSync(keyFile,"utf8"));keyBody.input_digest=claimBody.input_digest;writeFileSync(keyFile,JSON.stringify(keyBody));
  collect.mockResolvedValue({...original,status:{...original.status,status:"Stopped",resources_disposed:true},artifacts:Object.entries(bytes).map(([name,value])=>({name,reference:rawReference(local.location.dataDirectory,Buffer.from(JSON.stringify(value)),"agent_runtime_original_bytes",name)}))});
  const request=command(),sequence=f.store.asOfEventSequence(),first=await service.record(request);
  expect(first).toMatchObject({command_type:"RecordRunObservation",data:{observation:{report:{status:"failed",usage:{cost_known:false}}}}});
  expect(await new LocalAgentRuntimeObservation(local,{collect}).record(request)).toEqual(first);expect(collect).toHaveBeenCalledTimes(1);
  expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(f.store.getRun(runId)!.status).toBe("Failed");
  expect(f.task().usage).toMatchObject({pending_reconciliation:true,cost_known:false,cost_reserved_micros:100,attempts_consumed:1,attempts_released:0});expect(f.task().status).not.toBe("Satisfied");
  expect(f.task().active_run_ref?.id).toBe(runId);expect(f.store.listRuns(f.change.id)).toHaveLength(1);
  if(!("command_type" in first)||first.command_type!=="RecordRunObservation")throw Error("Expected original failure observation");
  const report=first.data.observation.report,content=new LocalRunVerifier(root,local.location.dataDirectory).content;
  for(const changed of [{status:"succeeded"},{usage:{cost_known:true,cost_micros:0,currency:"USD"}}]){
   const forged=content.storeContent(Buffer.from(JSON.stringify({...report,...changed})),"agent_run");
   expect(executeLocalCommand(local,{...command(),payload:{raw_result_ref:forged}})).toMatchObject({code:"EVIDENCE_MISSING"});
  }
  expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(f.task().usage.cost_reserved_micros).toBe(100);
 });
});
