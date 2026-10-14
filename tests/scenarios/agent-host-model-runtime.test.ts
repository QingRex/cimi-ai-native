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
import {readAgentRuntimeOriginalIdentity} from '../../packages/runtime-adapter/dist/index.js';
import { digest } from "../../packages/runtime-adapter/src/files.js";
import { createAgentRunProject } from "../fixtures/agent-run-project.js";
import { flowSuccess } from "../fixtures/flow-project.js";
// Overall test includes fixture setup, the original <=180s Runtime/Task and
// collection/HTTP observation. This does not extend any business/Native budget.
vi.setConfig({testTimeout:360000});
const nativeFixtureRoot=process.env.CIMILOOP_NATIVE_TEST_ROOT??tmpdir();
// Actual current-source Windows/AppContainer, host model IPC, SDK, Node checks,
// original host custody and Task clock. Replies/full account qualification are
// constructed. This is executable-path coverage, never real model or S1 evidence.
describe.runIf(process.platform==="win32"&&process.arch==="x64")("host model joins the original Agent Runtime",()=>{
 const roots:string[]=[],stores:{close():void}[]=[],closers:(()=>Promise<void>)[]=[];
 afterEach(async context=>{while(closers.length)await closers.pop()!();while(stores.length)stores.pop()!.close();for(const root of roots.splice(0)){
  if(!resolve(root).startsWith(resolve(nativeFixtureRoot)+sep+"cimiloop-host-model-runtime-"))throw Error("Unsafe cleanup");
  const operations=join(root,".git/cimiloop/workspace-tool-rehearsals");if(existsSync(operations))for(const name of readdirSync(operations)){
   const proof=join(operations,name,"agent-sandbox-cleanup.json");if(!existsSync(proof)||JSON.parse(readFileSync(proof,"utf8")).resources_disposed!==true)throw Error("Retain original Native resources: "+root);
  }
  // Retain every original fixture in this new integration suite, including
  // assertion/setup failures whose final state is assigned after afterEach.
  console.error("Retain original host-model fixture: "+root);
 }});
 async function setup(){
  const root=mkdtempSync(join(nativeFixtureRoot,"cimiloop-host-model-runtime-"));roots.push(root);
  const f=createAgentRunProject(root,"task_execution",100,[{provider:"cimiloop_workspace",resource_type:"repository_path",locator:"src/**",version:"1.0.0"}],["read_files","run_checks"],["src/**"],undefined,180000);stores.push(f.store);
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
  f.runPort.agent.admitContext=custody.admit.bind(custody);f.runPort.agent.checkRunAuthority=custody.checkRunAuthority.bind(custody);f.runPort.agent.checkToolAuthority=(project,input)=>checks.validateTool(project,input,custody);
  const kernel=new CimiLoopKernel({store:f.store,caller:f.caller,now:()=>new Date().toISOString(),runVerifier:f.runPort});
  const prepare=f.prepareCommand();const prepared=flowSuccess(kernel.execute({...prepare,payload:{...f.pins,source_snapshot_ref:{object_type:"source_snapshot",id:source.id}}}));if(prepared.command_type!=="PrepareRunContext"||!("runtime_binding" in prepared.data.context))throw Error("Context expected");
  const result=flowSuccess(kernel.execute(f.reserveCommand({...prepared.data,context:prepared.data.context})));if(result.command_type!=="ReserveRun"||result.data.record.run_kind!=="agent")throw Error("Agent reserved expected");
  const reserved={...result.data,record:result.data.record},scope=parseAgentWorkspaceToolScope({project_id:f.project.id,run_id:reserved.run.id,operation_key:reserved.record.operation_key,executor_actor_id:f.agent.id,context_digest:reserved.record.input_digest,...f.pins,host_admission_ref:reserved.record.host_admission_ref});
  const local={caller:f.caller,store:f.store,kernel,location:{repositoryKind:"git" as const,repositoryPath:root,dataDirectory,databasePath:f.path,instancePath:join(dataDirectory,"instance.json"),suggestedName:"Actual host model path; constructed account"}};
  const binary=join(process.env.APPDATA!,"npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe");let sends=0;
  const model:AgentRuntimeModelPort={admission_digest:digest("constructed model/account qualification").value,check:async current=>{expect(current).toEqual(scope);const assessment=kernel.assessAgentRunLaunch(current);if(!("decision" in assessment)||assessment.decision!=="ALLOW")throw Error(JSON.stringify(assessment));},execute:async input=>{
   expect(JSON.stringify(input.prompt)).toContain("cimiloop/agent-runtime-task-packet/2.0.0");expect(JSON.stringify(input.prompt)).not.toContain("line truncated");sends++;const name=sends===1?"cimi_read":sends===2?"cimi_check":null;
   if(name)return {content:[{type:"tool-call",tool_call_id:"model_tool_"+sends,tool_name:name,arguments:JSON.stringify(name==="cimi_read"?{path:"src/query.ts",expected_digest:digest(readFileSync(join(root,"src/query.ts"))).value}:{check_id:"query_test"})}],usage:{input_tokens:5,output_tokens:5},finish:"tool_calls"};
   return {content:[{type:"text",text:"Constructed final model response after actual checks"}],usage:{input_tokens:5,output_tokens:5},finish:"stop"};
  }};
  return {...f,root,dataDirectory,kernel,reserved,scope,local,binary,custody,checks,model,sends:()=>sends};
 }
 it("executes shared start through real SDK model/read/check steps and retains the one original Run",async()=>{
  const f=await setup(),sequence=f.store.asOfEventSequence(),usage=f.task().usage;
  const runtime=LocalAgentRuntimeComposition.open({local:f.local,binary:f.binary,custody:f.custody,checks:f.checks,model:f.model});
  expect(await runtime.start(f.reserved.run.id)).toMatchObject({outcome:"original",completion_proven:false});expect(f.sends()).toBe(3);
  expect(await runtime.start(f.reserved.run.id)).toMatchObject({outcome:"original"});expect(f.sends()).toBe(3);
  const collected=await collectAgentRuntimeOperation(f.dataDirectory,f.scope,{project:f.project,record:f.reserved.record});
  expect(collected.model).toMatchObject({status:"Observed",calls:3,unresolved:0,model_account_custody_proven:false,costs_reconciled:false});
  expect(collected.native).toMatchObject({status:"Verified",matched_calls:2,native_effect_reverified:true});expect(collected.ipc).toMatchObject({exchanges:5,correlation:{uncorrelated_exchanges:0,unmatched_sdk_calls:0}});
  const original=readAgentRuntimeModelOriginals(f.dataDirectory,f.scope);expect(original.calls[0]!.request.prompt).toBeDefined();expect(original.calls).toHaveLength(3);
  expect(collected.artifacts.filter(a=>a.name.startsWith("model/")).length).toBe(11);
  expect(JSON.parse(readFileSync(join(collected.status.operation,"original-config.json"),"utf8"))).toMatchObject({format:"cimiloop/agent-workspace-sandbox-config/8.0.0",startup_profile:'bun_interpreter/1.0.0',lifetime_policy:"agent_task/1.0.0",provider_options:{admission_digest:f.model.admission_digest}});
  expect(readAgentRuntimeOriginalIdentity(f.dataDirectory,f.scope)).toMatchObject({claim:{format:'cimiloop/agent-runtime-operation-claim/3.0.0'},input:{startup_profile:'bun_interpreter/1.0.0'}});
  expect(JSON.parse(readFileSync(join(collected.status.operation,"result.json"),"utf8"))).toMatchObject({format:"cimiloop/opencode-workspace-runtime/1.0.0",synthetic_model_responses:null,external_model_requests:null,actual_credentials_read:null,formal_agent_execution_enabled:false});
  expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.task().usage).toEqual(usage);expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved");
  writeInstance(join(f.dataDirectory,"instance.json"),{schema_version:"1.0.0",instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
  const server=await startWorkbench({projectDir:f.root});closers.push(()=>server.close());
  const login=await fetch(server.origin+"/api/session",{method:"POST",headers:{Origin:server.origin,"Content-Type":"application/json"},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});expect(login.status).toBe(200);
  const cookie=login.headers.get("set-cookie")!.split(";")[0]!,csrf=(await login.json() as {csrf:string}).csrf;
  const observe={command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:"technical_owner",command_type:"RecordRunObservation",target:{object_type:"run",id:f.reserved.run.id},expected_revision:f.store.getRun(f.reserved.run.id)!.revision,payload:{}};
  const record=async()=>{const response=await fetch(server.origin+"/api/agent-runs/"+f.reserved.run.id+"/observe",{method:"POST",headers:{Origin:server.origin,Cookie:cookie,"Content-Type":"application/json","X-CimiLoop-CSRF":csrf,Connection:"close"},body:JSON.stringify(observe)});const body=await response.json();expect({status:response.status,body}).toMatchObject({status:200});return body;};
  const observation=await record();expect(observation).toMatchObject({command_type:"RecordRunObservation",data:{observation:{report:{status:"unknown",usage:{cost_known:false}}}}});expect(await record()).toEqual(observation);
  expect(f.store.listRuntimeRecords("run_observation",f.change.id)).toHaveLength(1);expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Unknown");
  expect(f.task().usage).toMatchObject({pending_reconciliation:true,cost_reserved_micros:100});expect(f.store.asOfEventSequence()).toBe(sequence+1);
 });
 it("cancels the original host model wait without resend and freezes input before asynchronous admission",async()=>{
  const f=await setup();let waiting=false;
  f.model.execute=async()=>{waiting=true;requestAgentRuntimeCancellation(f.dataDirectory,f.scope);return new Promise(()=>{});};
  const model=await AgentRuntimeModelHost.initialize(f.dataDirectory,f.scope,f.model,["cimi_read","cimi_replace","cimi_check"],"Frozen original task packet"),budget=await openLocalAgentRunBudget(f.local,f.reserved.run.id),service=await LocalAgentWorkspaceToolService.open(f.local,f.reserved.run.id);closers.push(()=>budget.close(),()=>service.close());
  await service.installAdmittedChecks(f.checks,f.custody);const checkCatalog=await service.getCheckCatalog();
  const options={maxElapsedMs:180000,root:f.dataDirectory,binary:f.binary,scope:f.scope,prompt:"Frozen original task packet",model,runBudget:budget,checkCatalog,
   connect:(supervisor:Parameters<typeof service.openIpc>[0],owner:Parameters<typeof service.openIpc>[1],peer:Parameters<typeof service.openIpc>[2],nonce:string,signal:AbortSignal,originalModel:AgentRuntimeModelHost)=>service.openIpc(supervisor,owner,peer,{nonce,signal,model:originalModel})};
  const execution=runOpenCodeWorkspaceRuntime(options);options.prompt="Substituted after original async admission";
  await expect(execution).rejects.toThrow("workspace_rehearsal_cancel_requested");expect(waiting).toBe(true);
  const original=readAgentRuntimeModelOriginals(f.dataDirectory,f.scope);expect(original.calls).toHaveLength(1);expect(original.calls[0]!.state).toBe("unknown");
  await expect(model.execute(original.calls[0]!.request)).rejects.toThrow("agent_model_original_unknown");
  const collected=await collectAgentRuntimeOperation(f.dataDirectory,f.scope);expect(collected.model).toMatchObject({status:"Unknown",unresolved:1});expect(collected.status).toMatchObject({status:"Stopped",resources_disposed:true});
  expect(JSON.parse(readFileSync(join(collected.status.operation,"original-config.json"),"utf8")).prompt).toBe("Frozen original task packet");
  expect(JSON.parse(readFileSync(join(collected.status.operation,"incomplete.json"),"utf8"))).toMatchObject({actual_credentials_read:null,external_model_requests:null,completion_proven:false});
 });
 it("refuses a missing model/account port before Native or Run dispatch",async()=>{
  const f=await setup();expect(()=>LocalAgentRuntimeComposition.open({...f,local:f.local,checks:f.checks,model:undefined as never})).toThrow("完整原 Runtime");
  await expect(runOpenCodeWorkspaceRuntime({root:f.dataDirectory,binary:f.binary,scope:f.scope,prompt:"original",model:undefined as never,runBudget:undefined as never,checkCatalog:undefined as never,connect:async()=>{throw Error("must not connect");}})).rejects.toThrow("agent_runtime_production_admission_unavailable");
  expect(existsSync(join(f.dataDirectory,"agent-runtime-claims"))).toBe(false);expect(f.sends()).toBe(0);
 });
});
