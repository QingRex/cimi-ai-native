import {startWorkbench} from "../../apps/workbench/src/server.js";
import {createInternalId} from "../../packages/protocol/src/v2/index.js";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CimiLoopKernel } from "../../packages/kernel/src/index.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import { LocalAgentRuntimeComposition, LocalAgentStartCustody, LocalAgentCheckAdmission, LocalAgentWorkspaceToolService, openLocalAgentRunBudget, writeInstance } from "../../packages/local-app/src/index.js";
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
describe.runIf(process.platform==="win32"&&process.arch==="x64")("original Agent edit followed by fixed check and Kernel observation",()=>{
 const roots:string[]=[],stores:{close():void}[]=[],closers:(()=>Promise<void>)[]=[];
 afterEach(async context=>{while(closers.length)await closers.pop()!();while(stores.length)stores.pop()!.close();for(const root of roots.splice(0)){
  if(!resolve(root).startsWith(resolve(tmpdir())+sep+"cimiloop-original-edit-check-runtime-"))throw Error("Unsafe cleanup");
  const operations=join(root,".git/cimiloop/workspace-tool-rehearsals");if(existsSync(operations))for(const name of readdirSync(operations)){
   const proof=join(operations,name,"agent-sandbox-cleanup.json");if(!existsSync(proof)||JSON.parse(readFileSync(proof,"utf8")).resources_disposed!==true)throw Error("Retain original Native resources: "+root);
  }
  // Retain every original fixture in this new integration suite, including
  // assertion/setup failures whose final state is assigned after afterEach.
  console.error("Retain original host-model fixture: "+root);
 }});
 async function setup(){
  const root=mkdtempSync(join(tmpdir(),"cimiloop-original-edit-check-runtime-"));roots.push(root);
  const f=createAgentRunProject(root,"task_execution",100,[{provider:"cimiloop_workspace",resource_type:"repository_path",locator:"src/**",version:"1.0.0"}],["read_files","edit_files","run_checks"],["src/**"],["src/**"],600000);stores.push(f.store);
  const dataDirectory=dirname(f.path),harness="import {query} from './query.ts'; if(query()!==2)throw Error('actual source check');\n";
  writeFileSync(join(root,"src/check.mjs"),harness);f.git("add","src/check.mjs");f.git("commit","--quiet","-m","Actual fixed check input");const source=f.capture();
  const template:WorkspaceCheckTemplate={source_policy:"original_run_edits/1.0.0",check_id:"query_test",profile:"node_test",entry:"src/check.mjs",inputs:[{path:"src/check.mjs",expected_digest:digest(harness).value},{path:"src/query.ts"}],max_elapsed_ms:4000,max_output_bytes:32768};
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
  // Constructed account port checks current original Run authority, not a
  // fresh first-launch workspace after its own legitimate Native modification.
  // LocalAgentRuntimeStart independently enforces the original launch rules.
  const model:AgentRuntimeModelPort={admission_digest:digest("constructed model/account qualification").value,check:async current=>{expect(current).toEqual(scope);const assessment=kernel.assessAgentRunTool({...current,action:"read_files",resource:"src/query.ts"});if(!("decision" in assessment)||assessment.decision!=="ALLOW")throw Error(JSON.stringify(assessment));},execute:async input=>{
   expect(JSON.stringify(input.prompt)).toContain("cimiloop/agent-runtime-task-packet/2.0.0");expect(JSON.stringify(input.prompt)).not.toContain("line truncated");sends++;const name=sends===1?"cimi_read":sends===2?"cimi_replace":sends===3?"cimi_check":null;
   if(name)return {content:[{type:"tool-call",tool_call_id:"model_tool_"+sends,tool_name:name,arguments:JSON.stringify(name==="cimi_check"?{check_id:"query_test"}:{path:"src/query.ts",expected_digest:digest(readFileSync(join(root,"src/query.ts"))).value,...(name==="cimi_replace"?{replacement_utf8:"export const query = () => 2;\n"}:{})})}],usage:{input_tokens:5,output_tokens:5},finish:"tool_calls"};
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
    outputs:definition.body.outputs.map((_,output_index)=>({output_index,evidence_call_ids:[outputs[0]!.call_id]})),summary:"Constructed model result referencing actual edited-source SDK fixed-check output"};
   return {content:[{type:"text",text:JSON.stringify(terminal)}],usage:{input_tokens:5,output_tokens:5},finish:"stop"};
  }};
  return {...f,root,dataDirectory,kernel,reserved,scope,local,binary,custody,checks,model,sends:()=>sends};
 }
 it("executes actual SDK read/edit/check against original Native edited bytes and replays one Run observation",async()=>{
  const f=await setup(),sequence=f.store.asOfEventSequence(),usage=f.task().usage;
  const runtime=LocalAgentRuntimeComposition.open({local:f.local,binary:f.binary,custody:f.custody,checks:f.checks,model:f.model});
  expect(await runtime.start(f.reserved.run.id)).toMatchObject({outcome:"original",completion_proven:false});expect(f.sends()).toBe(4);
  expect(await runtime.start(f.reserved.run.id)).toMatchObject({outcome:"original"});expect(f.sends()).toBe(4);
  const collected=await collectAgentRuntimeOperation(f.dataDirectory,f.scope,{project:f.project,record:f.reserved.record});
  expect(collected.model).toMatchObject({status:"Observed",calls:4,unresolved:0,model_account_custody_proven:false,costs_reconciled:false});
  expect(collected.native).toMatchObject({status:"Verified",matched_calls:3,native_effect_reverified:true});expect(collected.ipc).toMatchObject({exchanges:7,correlation:{uncorrelated_exchanges:0,unmatched_sdk_calls:0}});
  expect(f.kernel.assessAgentRunLaunch(f.scope)).toMatchObject({decision:"DENY",reasons:["LAUNCH_SOURCE_OR_WORKSPACE_CHANGED"]});
  expect(readFileSync(join(f.root,"src/query.ts"),"utf8")).toBe("export const query = () => 2;\n");
  const original=readAgentRuntimeModelOriginals(f.dataDirectory,f.scope);expect(original.calls[0]!.request.prompt).toBeDefined();expect(original.calls).toHaveLength(4);
  expect(collected.artifacts.filter(a=>a.name.startsWith("model/")).length).toBe(14);
  const config=JSON.parse(readFileSync(join(collected.status.operation,"original-config.json"),"utf8"));
  expect(config.elapsed_ms).toBeGreaterThan(180000);expect(config.elapsed_ms).toBeLessThanOrEqual(600000);
  expect(config).toMatchObject({format:"cimiloop/agent-workspace-sandbox-config/5.0.0",lifetime_policy:"agent_task/1.0.0",provider_options:{admission_digest:f.model.admission_digest},binary_original:{format:"cimiloop/runtime-binary-original-proof/1.0.0",physical_quota_enforced:false,prior_custody_proven:false}});
  expect(readRuntimeBinaryOriginal(f.dataDirectory,config.binary,config.binary_original.sha)).toEqual(config.binary_original);
  expect(JSON.parse(readFileSync(join(collected.status.operation,"result.json"),"utf8"))).toMatchObject({format:"cimiloop/opencode-workspace-runtime/1.0.0",synthetic_model_responses:null,external_model_requests:null,actual_credentials_read:null,formal_agent_execution_enabled:false});
  expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.task().usage).toEqual(usage);expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved");
  writeInstance(join(f.dataDirectory,"instance.json"),{schema_version:"1.0.0",instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
  const server=await startWorkbench({projectDir:f.root});closers.push(()=>server.close());
  const login=await fetch(server.origin+"/api/session",{method:"POST",headers:{Origin:server.origin,"Content-Type":"application/json"},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});expect(login.status).toBe(200);
  const cookie=login.headers.get("set-cookie")!.split(";")[0]!,csrf=(await login.json() as {csrf:string}).csrf;
  const observe={command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:"technical_owner",command_type:"RecordRunObservation",target:{object_type:"run",id:f.reserved.run.id},expected_revision:f.store.getRun(f.reserved.run.id)!.revision,payload:{}};
  const record=async()=>{const response=await fetch(server.origin+"/api/agent-runs/"+f.reserved.run.id+"/observe",{method:"POST",headers:{Origin:server.origin,Cookie:cookie,"Content-Type":"application/json","X-CimiLoop-CSRF":csrf,Connection:"close"},body:JSON.stringify(observe)});const body=await response.json();expect({status:response.status,body}).toMatchObject({status:200});return body;};
  const observation=await record();expect(observation).toMatchObject({command_type:"RecordRunObservation",data:{observation:{report:{status:"unknown",usage:{cost_known:false}}}}});expect(await record()).toEqual(observation);
  const observationDir=join(f.dataDirectory,"agent-runtime-observations",f.project.id,f.reserved.run.id,observe.command_id),preparedObservation=JSON.parse(readFileSync(join(observationDir,"prepared.json"),"utf8"));
  const proof=JSON.parse(readFileSync(join(f.dataDirectory,"objects",preparedObservation.proof_ref.locator),"utf8"));expect(proof.execution_result_ref).toBeDefined();
  const executionResult=JSON.parse(readFileSync(join(f.dataDirectory,"objects",proof.execution_result_ref.locator),"utf8"));
  expect(executionResult).toMatchObject({format:"cimiloop/original-task-execution-result/1.0.0",run_id:f.reserved.run.id,operation_key:f.scope.operation_key,native_effect_reverified:true,
   model_account_custody_proven:false,costs_reconciled:false,task_acceptance_proven:false,current_workspace_applicability_proven:false,required_checks:[{check_id:"query_test"}],sdk:{final_model_call_id:"model_0004"}});
  expect(f.store.listRuntimeRecords("run_observation",f.change.id)).toHaveLength(1);expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Unknown");
  expect(f.task().usage).toMatchObject({pending_reconciliation:true,cost_reserved_micros:100});expect(f.store.asOfEventSequence()).toBe(sequence+1);
 });

});
