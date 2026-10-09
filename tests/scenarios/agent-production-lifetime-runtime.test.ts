import { createServer as createHttpsServer } from "node:https";
import { connect as tlsConnect } from "node:tls";
import { fileURLToPath } from "node:url";
import { GatewayNetworkBoundary } from "../../packages/runtime-adapter/dist/gateway-network.js";
import { createDedicatedAgentRuntimeModel, type DedicatedAgentAccountPort } from "../../packages/runtime-adapter/dist/index.js";
import {startWorkbench} from "../../apps/workbench/src/server.js";
import {createInternalId} from "../../packages/protocol/src/v2/index.js";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CimiLoopKernel } from "../../packages/kernel/src/index.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import { LocalAgentRuntimeComposition, LocalAgentStartCustody, LocalAgentCheckAdmission, LocalAgentWorkspaceToolService, openLocalAgentRunBudget, writeInstance } from "../../packages/local-app/dist/index.js";
import { initializeWindowsAgentStartLedger, AgentRuntimeModelHost, runOpenCodeWorkspaceRuntime, collectAgentRuntimeOperation, requestAgentRuntimeCancellation, parseAgentWorkspaceToolScope,
 readAgentRuntimeModelOriginals, type AgentRuntimeModelPort, type WorkspaceCheckTemplate } from "../../packages/runtime-adapter/dist/index.js";
import { digest } from "../../packages/runtime-adapter/src/files.js";
import {readRuntimeBinaryOriginal} from "../../packages/runtime-adapter/src/runtime-binary-originals.js";
import { createAgentRunProject } from "../fixtures/agent-run-project.js";
import { flowSuccess } from "../fixtures/flow-project.js";
// Overall test includes setup, a NEW constructed approved ten-minute Task and
// collection/HTTP observation. No old Run, Task, cap failure or evidence is changed.
vi.setConfig({testTimeout:780000});
// Actual current-source Windows/AppContainer, host model IPC, SDK, Node checks,
// original host custody and Task clock. Replies/full account qualification are
// constructed. This is executable-path coverage, never real model or S1 evidence.
describe.runIf(process.platform==="win32"&&process.arch==="x64")("production lifetime joins the original approved Task",()=>{
 const roots:string[]=[],stores:{close():void}[]=[],closers:(()=>Promise<void>)[]=[];
 afterEach(async context=>{while(closers.length)await closers.pop()!();while(stores.length)stores.pop()!.close();for(const root of roots.splice(0)){
  if(!resolve(root).startsWith(resolve(tmpdir())+sep+"cimiloop-production-lifetime-runtime-"))throw Error("Unsafe cleanup");
  const operations=join(root,".git/cimiloop/workspace-tool-rehearsals");if(existsSync(operations))for(const name of readdirSync(operations)){
   const proof=join(operations,name,"agent-sandbox-cleanup.json");if(!existsSync(proof)||JSON.parse(readFileSync(proof,"utf8")).resources_disposed!==true)throw Error("Retain original Native resources: "+root);
  }
  // Retain every original fixture in this new integration suite, including
  // assertion/setup failures whose final state is assigned after afterEach.
  console.error("Retain original host-model fixture: "+root);
 }});
 async function setup(){
  const root=mkdtempSync(join(tmpdir(),"cimiloop-production-lifetime-runtime-"));roots.push(root);
  const f=createAgentRunProject(root,"task_execution",100,[{provider:"cimiloop_workspace",resource_type:"repository_path",locator:"src/**",version:"1.0.0"}],["read_files","run_checks"],["src/**"],undefined,600000);stores.push(f.store);
  const dataDirectory=dirname(f.path),harness="import {query} from './query.ts'; if(query()!==1)throw Error('actual source check');\n";
  writeFileSync(join(root,"src/check.mjs"),harness);f.git("add","src/check.mjs");f.git("commit","--quiet","-m","Actual fixed check input");const source=f.capture();
  const template:WorkspaceCheckTemplate={check_id:"query_test",profile:"node_test",entry:"src/check.mjs",inputs:[{path:"src/check.mjs",expected_digest:digest(harness).value},{path:"src/query.ts"}],max_elapsed_ms:4000,max_output_bytes:32768};
  const checks=await LocalAgentCheckAdmission.open({repositoryPath:root,dataDirectory,nodeBinary:process.execPath,projectId:f.project.id,templates:[template],custody:{admit:f.runPort.agent.admitContext,
   verify:(_project,input,original)=>contentDigest({constructed:true,input,original})}});
  const ledger=await initializeWindowsAgentStartLedger(join(dataDirectory,"start-origin"),join(dataDirectory,"start-tools"));closers.push(async()=>ledger.close());
  const custody=new LocalAgentStartCustody(root,dataDirectory,ledger,{admit:checks.admit.bind(checks),verifyLaunch:(_project,input,original)=>contentDigest({constructed:true,input,original})});
  const authorityChecks:{input_digest:string;validation:unknown;error:string|null}[]=[];
  const originalCheck=custody.checkRunAuthority.bind(custody);
  custody.checkRunAuthority=(project,input)=>{
   const record={input_digest:contentDigest({project,input}).value,validation:null as unknown,error:null as string|null};
   try{const validation=originalCheck(project,input);record.validation=validation;return validation;}catch(error){record.error=String(error);throw error;}
   finally{authorityChecks.push(record);writeFileSync(join(dataDirectory,"constructed-authority-checks.json"),JSON.stringify(authorityChecks,null,2));}
  };
  f.runPort.agent.admitContext=custody.admit.bind(custody);f.runPort.agent.checkRunAuthority=custody.checkRunAuthority.bind(custody);f.runPort.agent.checkToolAuthority=(project,input)=>{try{return checks.validateTool(project,input,custody);}catch(error){writeFileSync(join(dataDirectory,"constructed-tool-host-failure.json"),JSON.stringify({message:String(error),stack:error instanceof Error?error.stack:null}));throw error;}};
  const kernel=new CimiLoopKernel({store:f.store,caller:f.caller,now:()=>new Date().toISOString(),runVerifier:f.runPort});
  const toolAssessments:unknown[]=[],assessTool=kernel.assessAgentRunTool.bind(kernel);
  kernel.assessAgentRunTool=input=>{const result=assessTool(input);toolAssessments.push(result);writeFileSync(join(dataDirectory,"constructed-tool-assessments.json"),JSON.stringify(toolAssessments,null,2));return result;};
  const prepare=f.prepareCommand();const prepared=flowSuccess(kernel.execute({...prepare,payload:{...f.pins,source_snapshot_ref:{object_type:"source_snapshot",id:source.id}}}));if(prepared.command_type!=="PrepareRunContext"||!("runtime_binding" in prepared.data.context))throw Error("Context expected");
  const result=flowSuccess(kernel.execute(f.reserveCommand({...prepared.data,context:prepared.data.context})));if(result.command_type!=="ReserveRun"||result.data.record.run_kind!=="agent")throw Error("Agent reserved expected");
  const reserved={...result.data,record:result.data.record},scope=parseAgentWorkspaceToolScope({project_id:f.project.id,run_id:reserved.run.id,operation_key:reserved.record.operation_key,executor_actor_id:f.agent.id,context_digest:reserved.record.input_digest,...f.pins,host_admission_ref:reserved.record.host_admission_ref});
  const local={caller:f.caller,store:f.store,kernel,location:{repositoryKind:"git" as const,repositoryPath:root,dataDirectory,databasePath:f.path,instancePath:join(dataDirectory,"instance.json"),suggestedName:"Actual host model path; constructed account"}};
  const binary=join(process.env.APPDATA!,"npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe");let sends=0;
  const model:AgentRuntimeModelPort={admission_digest:digest("constructed model/account qualification").value,check:async current=>{expect(current).toEqual(scope);const assessment=kernel.assessAgentRunLaunch(current);if(!("decision" in assessment)||assessment.decision!=="ALLOW")throw Error(JSON.stringify(assessment));},execute:async input=>{
   expect(JSON.stringify(input.prompt)).toContain("cimiloop/agent-runtime-task-packet/2.0.0");expect(JSON.stringify(input.prompt)).not.toContain("line truncated");sends++;const name=sends===1?"cimi_read":sends===2?"cimi_check":null;
   if(name)return {content:[{type:"tool-call",tool_call_id:"model_tool_"+sends,tool_name:name,arguments:JSON.stringify(name==="cimi_read"?{path:"src/query.ts",expected_digest:digest(readFileSync(join(root,"src/query.ts"))).value}:{check_id:"query_test"})}],usage:{input_tokens:5,output_tokens:5},finish:"tool_calls"};
   const outputs:{call_id:string}[]=[];
   const visit=(value:unknown):void=>{
    if(typeof value==="string"){if(value.trim().startsWith("{"))try{visit(JSON.parse(value));}catch{}return;}
    if(!value||typeof value!=="object")return;
    if("format" in value&&value.format==="cimiloop/opencode-check-output/2.0.0"||"format" in value&&value.format==="cimiloop/opencode-check-output/1.0.0"){
     if("call_id" in value&&typeof value.call_id==="string")outputs.push({call_id:value.call_id});return;
    }
    for(const child of Object.values(value))visit(child);
   };
   visit(input.prompt);expect(outputs).toHaveLength(1);
   const definition=f.store.getExecutionRecord("task_definition",reserved.record.definition_ref.id)!;
   const terminal={format:"cimiloop/task-execution-result/1.0.0",run_id:scope.run_id,operation_key:scope.operation_key,input_digest:scope.context_digest,definition_ref:reserved.record.definition_ref,
    outputs:definition.body.outputs.map((_,output_index)=>({output_index,evidence_call_ids:[outputs[0]!.call_id]})),summary:"Constructed model result referencing actual original SDK fixed-check output"};
   return {content:[{type:"text",text:JSON.stringify(terminal)}],usage:{input_tokens:5,output_tokens:5},finish:"stop"};
  }};
  return {...f,root,dataDirectory,kernel,reserved,scope,local,binary,custody,checks,model,sends:()=>sends};
 }
 it("completes actual SDK model/read/check steps within a newly approved ten-minute Task and retains the original Run",async()=>{
  const f=await setup(),sequence=f.store.asOfEventSequence(),usage=f.task().usage;
  const runtime=LocalAgentRuntimeComposition.open({local:f.local,binary:f.binary,custody:f.custody,checks:f.checks,model:f.model});
  writeInstance(join(f.dataDirectory,"instance.json"),{schema_version:"1.0.0",instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
  const server=await startWorkbench({projectDir:f.root,agentRuntimeForRun:()=>runtime});closers.push(()=>server.close());
  const login=await fetch(server.origin+"/api/session",{method:"POST",headers:{Origin:server.origin,"Content-Type":"application/json"},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});expect(login.status).toBe(200);
  const cookie=login.headers.get("set-cookie")!.split(";")[0]!,csrf=(await login.json() as {csrf:string}).csrf;
  const startOriginal=async()=>{const response=await fetch(server.origin+"/api/agent-runs/"+f.reserved.run.id+"/start",{method:"POST",headers:{Origin:server.origin,Cookie:cookie,"Content-Type":"application/json","X-CimiLoop-CSRF":csrf,Connection:"close"},body:"{}"});const body=await response.json();expect({status:response.status,body}).toMatchObject({status:200});return body;};
  expect(await startOriginal()).toMatchObject({outcome:"original",completion_proven:false});expect(f.sends()).toBe(3);
  expect(await startOriginal()).toMatchObject({outcome:"original"});expect(f.sends()).toBe(3);
  const collected=await collectAgentRuntimeOperation(f.dataDirectory,f.scope,{project:f.project,record:f.reserved.record});
  expect(collected.model).toMatchObject({status:"Observed",calls:3,unresolved:0,model_account_custody_proven:false,costs_reconciled:false});
  expect(collected.native).toMatchObject({status:"Verified",matched_calls:2,native_effect_reverified:true});expect(collected.ipc).toMatchObject({exchanges:5,correlation:{uncorrelated_exchanges:0,unmatched_sdk_calls:0}});
  const original=readAgentRuntimeModelOriginals(f.dataDirectory,f.scope);expect(original.calls[0]!.request.prompt).toBeDefined();expect(original.calls).toHaveLength(3);
  expect(collected.artifacts.filter(a=>a.name.startsWith("model/")).length).toBe(11);
  const config=JSON.parse(readFileSync(join(collected.status.operation,"original-config.json"),"utf8"));
  expect(config.elapsed_ms).toBeGreaterThan(180000);expect(config.elapsed_ms).toBeLessThanOrEqual(600000);
  expect(config).toMatchObject({format:"cimiloop/agent-workspace-sandbox-config/5.0.0",lifetime_policy:"agent_task/1.0.0",provider_options:{admission_digest:f.model.admission_digest},binary_original:{format:"cimiloop/runtime-binary-original-proof/1.0.0",physical_quota_enforced:false,prior_custody_proven:false}});
  expect(readRuntimeBinaryOriginal(f.dataDirectory,config.binary,config.binary_original.sha)).toEqual(config.binary_original);
  expect(JSON.parse(readFileSync(join(collected.status.operation,"result.json"),"utf8"))).toMatchObject({format:"cimiloop/opencode-workspace-runtime/1.0.0",synthetic_model_responses:null,external_model_requests:null,actual_credentials_read:null,formal_agent_execution_enabled:false});
  expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.task().usage).toEqual(usage);expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved");
  const observe={command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:"technical_owner",command_type:"RecordRunObservation",target:{object_type:"run",id:f.reserved.run.id},expected_revision:f.store.getRun(f.reserved.run.id)!.revision,payload:{}};
  const record=async()=>{const response=await fetch(server.origin+"/api/agent-runs/"+f.reserved.run.id+"/observe",{method:"POST",headers:{Origin:server.origin,Cookie:cookie,"Content-Type":"application/json","X-CimiLoop-CSRF":csrf,Connection:"close"},body:JSON.stringify(observe)});const body=await response.json();expect({status:response.status,body}).toMatchObject({status:200});return body;};
  const observation=await record();expect(observation).toMatchObject({command_type:"RecordRunObservation",data:{observation:{report:{status:"unknown",usage:{cost_known:false}}}}});expect(await record()).toEqual(observation);
  const observationDir=join(f.dataDirectory,"agent-runtime-observations",f.project.id,f.reserved.run.id,observe.command_id),preparedObservation=JSON.parse(readFileSync(join(observationDir,"prepared.json"),"utf8"));
  const proof=JSON.parse(readFileSync(join(f.dataDirectory,"objects",preparedObservation.proof_ref.locator),"utf8"));expect(proof.execution_result_ref).toBeDefined();
  const executionResult=JSON.parse(readFileSync(join(f.dataDirectory,"objects",proof.execution_result_ref.locator),"utf8"));
  expect(executionResult).toMatchObject({format:"cimiloop/original-task-execution-result/1.0.0",run_id:f.reserved.run.id,operation_key:f.scope.operation_key,native_effect_reverified:true,
   model_account_custody_proven:false,costs_reconciled:false,task_acceptance_proven:false,current_workspace_applicability_proven:false,required_checks:[{check_id:"query_test"}],sdk:{final_model_call_id:"model_0003"}});
  expect(f.store.listRuntimeRecords("run_observation",f.change.id)).toHaveLength(1);expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Unknown");
  expect(f.task().usage).toMatchObject({pending_reconciliation:true,cost_reserved_micros:100});expect(f.store.asOfEventSequence()).toBe(sequence+1);
 });
 it("joins dedicated HTTPS, original SDK reasoning/tool rounds, Native checks and the Workbench original receipt",async()=>{
  const f=await setup(),sequence=f.store.asOfEventSequence(),usage=f.task().usage;
  // Only local TLS and constructed account approval/credential. Never real
  // model/account qualification, a paid request or S1 acceptance.
  const certificate=readFileSync(fileURLToPath(new URL("../../packages/runtime-adapter/fixtures/gateway-http-tls/cert.pem",import.meta.url)));
  const fixtureKey="CIMILOOP_NATIVE_DEDICATED_PUBLIC_FIXTURE_KEY",observed:{request_id:string;body:Record<string,unknown>}[]=[];
  let credentials=0,holds=0;
  const upstream=createHttpsServer({cert:certificate,key:readFileSync(fileURLToPath(new URL("../../packages/runtime-adapter/fixtures/gateway-http-tls/key.pem",import.meta.url)))},(request,response)=>{
   const chunks:Buffer[]=[];request.on("data",chunk=>chunks.push(chunk));request.on("end",()=>{void(async()=>{try{
    expect(request.headers.authorization).toBe("Bearer "+fixtureKey);expect(request.url).toBe("/api/coding/paas/v4/chat/completions");
    const body=JSON.parse(Buffer.concat(chunks).toString()) as Record<string,unknown>;observed.push({request_id:String(body.request_id),body});
    const original=readAgentRuntimeModelOriginals(f.dataDirectory,f.scope).calls.at(-1)!;const receipt=await f.model.execute(original.request),text=receipt.content.filter(p=>p.type==="text").map(p=>p.text).join(""),calls=receipt.content.filter(p=>p.type==="tool-call");
    response.setHeader("content-type","application/json");response.end(JSON.stringify({id:"native_provider_"+observed.length,model:"glm-fixture",request_id:body.request_id,object:"chat.completion",choices:[{index:0,message:{role:"assistant",content:text||null,reasoning_content:"original constructed reasoning "+observed.length,...(calls.length?{tool_calls:calls.map(p=>({id:p.tool_call_id,type:"function",function:{name:p.tool_name,arguments:p.arguments}}))}:{})},finish_reason:receipt.finish}],usage:{prompt_tokens:receipt.usage.input_tokens,completion_tokens:receipt.usage.output_tokens,total_tokens:receipt.usage.input_tokens+receipt.usage.output_tokens}}));
   }catch(error){console.error("Constructed local provider reply failed",error);response.destroy();}})();});
  });
  await new Promise<void>((done,reject)=>{upstream.once("error",reject);upstream.listen(0,"127.0.0.1",done);});closers.push(async()=>{upstream.closeAllConnections();await new Promise<void>(done=>upstream.close(()=>done()));});const address=upstream.address();if(!address||typeof address==="string")throw Error("Fixture HTTPS missing");
  const boundary=new GatewayNetworkBoundary({resolve:async()=>[{address:"8.8.8.8",family:4,ttl_seconds:60}],connect:options=>{const socket=tlsConnect({...options,host:"127.0.0.1",port:address.port,ca:certificate});Object.defineProperty(socket,"remoteAddress",{get:()=>"8.8.8.8"});return socket;}});
  const connection={format:"cimiloop/dedicated-model/1.0.0" as const,provider:"zhipuai-coding-plan" as const,model:"zhipuai-coding-plan/glm-fixture",credential_file:join(tmpdir(),"absent-public-dedicated-fixture-"+f.scope.run_id+".dpapi.json"),credential_digest:digest("fixture only")};
  const account:DedicatedAgentAccountPort={admission_digest:f.model.admission_digest,profile:{model:"glm-fixture",thinking:"enabled"},check:async scope=>f.model.check(scope),reserve:async(_scope,request,bytes)=>{expect(digest(bytes).value).toBe(request.request_digest);holds++;return {format:"cimiloop/agent-model-budget-hold/1.0.0",...request,account_digest:digest("constructed account").value,approval_digest:digest("constructed approval").value,tariff_digest:digest("constructed tariff").value,cash_upper_micros:30,credit_upper_micro_units:0,input_token_limit:100000,output_token_limit:request.max_output_tokens};},verifyHold:async scope=>f.model.check(scope)};
  expect(LocalAgentRuntimeComposition.openDedicated({local:f.local,binary:f.binary,custody:f.custody,checks:f.checks,runId:f.reserved.run.id,connection,account}).originalScope(f.reserved.run.id)).toEqual(f.scope);
  const dedicated=createDedicatedAgentRuntimeModel({root:f.dataDirectory,repositoryPath:f.root,scope:f.scope,connection,account},{boundary,readCredential:async()=>{credentials++;return fixtureKey;}});
  const runtime=LocalAgentRuntimeComposition.open({local:f.local,binary:f.binary,custody:f.custody,checks:f.checks,model:dedicated});
  writeInstance(join(f.dataDirectory,"instance.json"),{schema_version:"1.0.0",instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
  const server=await startWorkbench({projectDir:f.root,agentRuntimeForRun:()=>runtime});closers.push(()=>server.close());
  const login=await fetch(server.origin+"/api/session",{method:"POST",headers:{Origin:server.origin,"Content-Type":"application/json"},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});expect(login.status).toBe(200);
  const cookie=login.headers.get("set-cookie")!.split(";")[0]!,csrf=(await login.json() as {csrf:string}).csrf;
  const startOriginal=async()=>{const response=await fetch(server.origin+"/api/agent-runs/"+f.reserved.run.id+"/start",{method:"POST",headers:{Origin:server.origin,Cookie:cookie,"Content-Type":"application/json","X-CimiLoop-CSRF":csrf,Connection:"close"},body:"{}"});const body=await response.json();expect({status:response.status,body}).toMatchObject({status:200});return body;};
  expect(await startOriginal()).toMatchObject({outcome:"original",completion_proven:false});expect(f.sends()).toBe(3);
  expect(await startOriginal()).toMatchObject({outcome:"original"});expect(f.sends()).toBe(3);
  const collected=await collectAgentRuntimeOperation(f.dataDirectory,f.scope,{project:f.project,record:f.reserved.record});
  expect(collected.model).toMatchObject({status:"Observed",calls:3,unresolved:0,model_account_custody_proven:false,costs_reconciled:false});
  expect(collected.native).toMatchObject({status:"Verified",matched_calls:2,native_effect_reverified:true});expect(collected.ipc).toMatchObject({exchanges:5,correlation:{uncorrelated_exchanges:0,unmatched_sdk_calls:0}});
  const original=readAgentRuntimeModelOriginals(f.dataDirectory,f.scope);expect(original.calls[0]!.request.prompt).toBeDefined();expect(original.calls).toHaveLength(3);
  expect(collected.artifacts.filter(a=>a.name.startsWith("model/")).length).toBe(11);
  const config=JSON.parse(readFileSync(join(collected.status.operation,"original-config.json"),"utf8"));
  expect(config.elapsed_ms).toBeGreaterThan(180000);expect(config.elapsed_ms).toBeLessThanOrEqual(600000);
  expect(config).toMatchObject({format:"cimiloop/agent-workspace-sandbox-config/5.0.0",lifetime_policy:"agent_task/1.0.0",provider_options:{admission_digest:f.model.admission_digest},binary_original:{format:"cimiloop/runtime-binary-original-proof/1.0.0",physical_quota_enforced:false,prior_custody_proven:false}});
  expect(readRuntimeBinaryOriginal(f.dataDirectory,config.binary,config.binary_original.sha)).toEqual(config.binary_original);
  expect(JSON.parse(readFileSync(join(collected.status.operation,"result.json"),"utf8"))).toMatchObject({format:"cimiloop/opencode-workspace-runtime/1.0.0",synthetic_model_responses:null,external_model_requests:null,actual_credentials_read:null,formal_agent_execution_enabled:false});
  expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.task().usage).toEqual(usage);expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved");
  const observe={command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:"technical_owner",command_type:"RecordRunObservation",target:{object_type:"run",id:f.reserved.run.id},expected_revision:f.store.getRun(f.reserved.run.id)!.revision,payload:{}};
  const record=async()=>{const response=await fetch(server.origin+"/api/agent-runs/"+f.reserved.run.id+"/observe",{method:"POST",headers:{Origin:server.origin,Cookie:cookie,"Content-Type":"application/json","X-CimiLoop-CSRF":csrf,Connection:"close"},body:JSON.stringify(observe)});const body=await response.json();expect({status:response.status,body}).toMatchObject({status:200});return body;};
  const observation=await record();expect(observation).toMatchObject({command_type:"RecordRunObservation",data:{observation:{report:{status:"unknown",usage:{cost_known:false}}}}});expect(await record()).toEqual(observation);
  const observationDir=join(f.dataDirectory,"agent-runtime-observations",f.project.id,f.reserved.run.id,observe.command_id),preparedObservation=JSON.parse(readFileSync(join(observationDir,"prepared.json"),"utf8"));
  const proof=JSON.parse(readFileSync(join(f.dataDirectory,"objects",preparedObservation.proof_ref.locator),"utf8"));expect(proof.execution_result_ref).toBeDefined();
  const executionResult=JSON.parse(readFileSync(join(f.dataDirectory,"objects",proof.execution_result_ref.locator),"utf8"));
  expect(executionResult).toMatchObject({format:"cimiloop/original-task-execution-result/1.0.0",run_id:f.reserved.run.id,operation_key:f.scope.operation_key,native_effect_reverified:true,
   model_account_custody_proven:false,costs_reconciled:false,task_acceptance_proven:false,current_workspace_applicability_proven:false,required_checks:[{check_id:"query_test"}],sdk:{final_model_call_id:"model_0003"}});
  expect(observed).toHaveLength(3);expect(holds).toBe(3);expect(credentials).toBe(3);
  expect((observed[1]!.body.messages as {role:string;reasoning_content?:string}[]).filter(m=>m.role==="assistant").map(m=>m.reasoning_content)).toEqual(["original constructed reasoning 1"]);
  expect((observed[2]!.body.messages as {role:string;reasoning_content?:string}[]).filter(m=>m.role==="assistant").map(m=>m.reasoning_content)).toEqual(["original constructed reasoning 1","original constructed reasoning 2"]);
  writeFileSync(join(f.dataDirectory,"d255-dedicated-fixture-summary.json"),JSON.stringify({format:"cimiloop/dedicated-native-fixture-summary/1.0.0",provider_fixture_requests:observed.length,constructed_budget_holds:holds,constructed_credentials_read:credentials,real_model_requests:0,real_credentials_read:0,costs_reconciled:false,formal_agent_execution_enabled:false,requests:observed},null,2));
  expect(f.store.listRuntimeRecords("run_observation",f.change.id)).toHaveLength(1);expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Unknown");
  expect(f.task().usage).toMatchObject({pending_reconciliation:true,cost_reserved_micros:100});expect(f.store.asOfEventSequence()).toBe(sequence+1);
 });
 it("rechecks Human permission after the final awaited model admission and never resumes the original SDK",async()=>{
  const f=await setup();let entered!:()=>void,release!:()=>void,paused=false;
  const waiting=new Promise<void>(done=>{entered=done;}),gate=new Promise<void>(done=>{release=done;});
  const originalCheck=f.model.check;
  f.model.check=async scope=>{await originalCheck(scope);const operations=join(f.dataDirectory,"workspace-tool-rehearsals");
   if(!paused&&existsSync(operations)&&readdirSync(operations).some(name=>existsSync(join(operations,name,"agent-sandbox-original.json")))){paused=true;entered();await gate;}};
  const runtime=LocalAgentRuntimeComposition.open({local:f.local,binary:f.binary,custody:f.custody,checks:f.checks,model:f.model});
  writeInstance(join(f.dataDirectory,"instance.json"),{schema_version:"1.0.0",instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
  const server=await startWorkbench({projectDir:f.root,agentRuntimeForRun:()=>runtime});closers.push(()=>server.close());
  const login=await fetch(server.origin+"/api/session",{method:"POST",headers:{Origin:server.origin,"Content-Type":"application/json"},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});expect(login.status).toBe(200);
  const cookie=login.headers.get("set-cookie")!.split(";")[0]!,csrf=(await login.json() as {csrf:string}).csrf;
  const start=fetch(server.origin+"/api/agent-runs/"+f.reserved.run.id+"/start",{method:"POST",headers:{Origin:server.origin,Cookie:cookie,"Content-Type":"application/json","X-CimiLoop-CSRF":csrf,Connection:"close"},body:"{}"});
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([waiting,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("Actual final admission was not reached")),180000);})]);
   for(const assignment of f.store.listAssignments(f.actor.id).filter(a=>a.role_key==="technical_owner"&&!a.ended_at))flowSuccess(f.humanKernel.execute(f.projectCommand("EndAssignment",{assignment_id:assignment.id,expected_assignment_revision:assignment.revision,reason:"Revoke during final original SDK admission wait"})));
  }finally{clearTimeout(timer);release();}
  const response=await start,body=await response.json();expect({status:response.status,body}).toMatchObject({status:200,body:{completion_proven:false}});expect(f.sends()).toBe(0);
  const operations=join(f.dataDirectory,"workspace-tool-rehearsals"),names=readdirSync(operations);expect(names).toHaveLength(1);const operation=join(operations,names[0]!);
  expect(existsSync(join(operation,"result.json"))).toBe(false);expect(JSON.parse(readFileSync(join(operation,"incomplete.json"),"utf8"))).toMatchObject({suspended_observed:true,original_record_present:true});
  // Zero model sends alone could also be a resumed SDK crash. Independently
  // require the original controlled EOF before ResumeThread and its held identity.
  expect(readFileSync(join(operation,"stderr.raw")).length).toBe(0);
  expect(JSON.parse(readFileSync(join(operation,"agent-sandbox-cleanup.json"),"utf8"))).toMatchObject({reason:"agent_sandbox_parent_ended",exit_code:125});
  const config=JSON.parse(readFileSync(join(operation,"original-config.json"),"utf8"));
  expect(JSON.parse(readFileSync(join(operation,"agent-sandbox-interruption.json"),"utf8"))).toMatchObject({format:"cimiloop/agent-workspace-interruption/1.0.0",nonce:config.nonce,scope_digest:config.scope_digest,phase:"suspended",runtime_resumed:false,reason:"agent_sandbox_parent_ended",owner:config.owner});
  expect(JSON.parse(readFileSync(join(operation,"agent-sandbox-cleanup.json"),"utf8"))).toMatchObject({resources_disposed:true,cleanup_errors:[]});
  expect(readAgentRuntimeModelOriginals(f.dataDirectory,f.scope).calls).toHaveLength(0);expect(f.store.listRuns(f.change.id)).toHaveLength(1);expect(f.task().usage.pending_reconciliation).toBe(true);
  expect(existsSync(join(f.dataDirectory,"agent-runtime-starts",f.project.id,f.reserved.run.id,"dispatch.json"))).toBe(true);
  expect(await runtime.start(f.reserved.run.id)).toMatchObject({completion_proven:false});expect(f.sends()).toBe(0);expect(readdirSync(operations)).toEqual(names);
  const collect=await fetch(server.origin+"/api/agent-runs/"+f.reserved.run.id+"/collect",{method:"POST",headers:{Origin:server.origin,Cookie:cookie,"Content-Type":"application/json","X-CimiLoop-CSRF":csrf,Connection:"close"},body:"{}"});expect(collect.status).toBe(200);
  expect(await collect.json()).toMatchObject({operation:{result:{interruption:{status:"Observed",phase:"suspended",runtime_resumed:false,completion_proven:false,costs_reconciled:false}}}});
  f.grant("technical_owner");const command={command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:"technical_owner",command_type:"RecordRunObservation",target:{object_type:"run",id:f.reserved.run.id},expected_revision:f.store.getRun(f.reserved.run.id)!.revision,payload:{}};
  const observe=async()=>{const response=await fetch(server.origin+"/api/agent-runs/"+f.reserved.run.id+"/observe",{method:"POST",headers:{Origin:server.origin,Cookie:cookie,"Content-Type":"application/json","X-CimiLoop-CSRF":csrf,Connection:"close"},body:JSON.stringify(command)});expect(response.status).toBe(200);return response.json();};
  const observation=await observe();expect(observation).toMatchObject({data:{observation:{report:{status:"unknown",usage:{cost_known:false}}}}});expect(await observe()).toEqual(observation);
  expect(f.store.listRuntimeRecords("run_observation",f.change.id)).toHaveLength(1);expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Unknown");expect(f.task().usage).toMatchObject({pending_reconciliation:true,cost_reserved_micros:100});expect(f.sends()).toBe(0);

 });

});
