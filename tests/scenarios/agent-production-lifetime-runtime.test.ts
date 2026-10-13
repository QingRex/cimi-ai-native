import { createServer as createHttpsServer } from "node:https";
import { connect as tlsConnect } from "node:tls";
import { fileURLToPath } from "node:url";
import { GatewayNetworkBoundary } from "../../packages/runtime-adapter/dist/gateway-network.js";
import { createDedicatedAgentRuntimeModel,initializeWindowsDedicatedAgentAccountLedger,readAgentRuntimeOriginalIdentity,readOriginalAgentJobObservation,AGENT_JOB_RESOURCE_POLICY } from "../../packages/runtime-adapter/dist/index.js";
import {startWorkbench} from "../../apps/workbench/src/server.js";
import {createInternalId} from "../../packages/protocol/src/v2/index.js";
import { mkdtempSync,mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CimiLoopKernel } from "../../packages/kernel/src/index.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import { LocalAgentRuntimeComposition, LocalAgentDedicatedAccount,LocalAgentAccountBilling,LocalAgentModelAdmission,LocalAgentStartCustody, LocalAgentCheckAdmission, LocalAgentWorkspaceToolService, openLocalAgentRunBudget, writeInstance } from "../../packages/local-app/dist/index.js";
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
 // Fresh current-user persistent roots, not Temp. Repo-local owned roots on
 // this host rejected Windows custody; neither historical location is repaired.
 function originalJob(root:string,scope:unknown,operation:string){
  const identity=readAgentRuntimeOriginalIdentity(root,scope),input=identity.input as Record<string,unknown>,read=(name:string)=>JSON.parse(readFileSync(join(operation,name),'utf8'));
  expect(identity.claim.format).toBe('cimiloop/agent-runtime-operation-claim/2.0.0');expect(input.job_resource_policy).toEqual(AGENT_JOB_RESOURCE_POLICY);
  const observed=readOriginalAgentJobObservation(root,operation,input,read('original-config.json'),read('original-launcher.json'),read('agent-sandbox-resources.json'));
  expect(observed).not.toBeNull();expect(observed!.proof).toMatchObject({limit_flags:8712,active_process_limit:1,job_memory_limit_bytes:2147483648,process_memory_limit_bytes:0,peer_in_job:true});return observed!;
 }
 const fixtureParent=process.env.CIMILOOP_NATIVE_TEST_ROOT??join(process.env.LOCALAPPDATA!,'CimiS1');
 const roots:string[]=[],stores:{close():void}[]=[],closers:(()=>Promise<void>)[]=[];
 afterEach(async context=>{while(closers.length)await closers.pop()!();while(stores.length)stores.pop()!.close();for(const root of roots.splice(0)){
  if(!resolve(root).startsWith(resolve(fixtureParent)+sep+"cimiloop-production-lifetime-runtime-"))throw Error("Unsafe cleanup");
  const operations=join(root,".git/cimiloop/workspace-tool-rehearsals");if(existsSync(operations))for(const name of readdirSync(operations)){
   const proof=join(operations,name,"agent-sandbox-cleanup.json");if(!existsSync(proof)||JSON.parse(readFileSync(proof,"utf8")).resources_disposed!==true)throw Error("Retain original Native resources: "+root);
  }
  // Retain every original fixture in this new integration suite, including
  // assertion/setup failures whose final state is assigned after afterEach.
  console.error("Retain original host-model fixture: "+root);
 }});
 async function setup(editable=false,beforeReserve?:(prepared:{root:string;dataDirectory:string;ledger:Awaited<ReturnType<typeof initializeWindowsAgentStartLedger>>})=>Promise<void>){
  mkdirSync(fixtureParent,{recursive:true});const root=mkdtempSync(join(fixtureParent,"cimiloop-production-lifetime-runtime-"));roots.push(root);
  const f=createAgentRunProject(root,"task_execution",editable?150:100,[{provider:"cimiloop_workspace",resource_type:"repository_path",locator:"src/**",version:"1.0.0"}],["read_files","run_checks",...(editable?["edit_files" as const]:[])],["src/**"],editable?["src/**"]:undefined,600000);stores.push(f.store);
  const dataDirectory=dirname(f.path),harness="import {query} from './query.ts'; if(query()!=="+(editable?2:1)+")throw Error('actual source check');\n";
  writeFileSync(join(root,"src/check.mjs"),harness);f.git("add","src/check.mjs");f.git("commit","--quiet","-m","Actual fixed check input");const source=f.capture();
  const template:WorkspaceCheckTemplate={check_id:"query_test",profile:"node_test",entry:"src/check.mjs",inputs:[{path:"src/check.mjs",expected_digest:digest(harness).value},{path:"src/query.ts"}],...(editable?{source_policy:"original_run_edits/1.0.0" as const}:{}),max_elapsed_ms:4000,max_output_bytes:32768};
  const checks=await LocalAgentCheckAdmission.open({repositoryPath:root,dataDirectory,nodeBinary:process.execPath,projectId:f.project.id,templates:[template],custody:{admit:f.runPort.agent.admitContext,
   verify:(_project,input,original)=>contentDigest({constructed:true,input,original})}});
  const ledger=await initializeWindowsAgentStartLedger(join(dataDirectory,"start-origin"),join(dataDirectory,"start-tools"));closers.push(async()=>ledger.close());
  const custody=new LocalAgentStartCustody(root,dataDirectory,ledger,{admit:checks.admit.bind(checks),verifyLaunch:(_project,input,original)=>contentDigest({constructed:true,input,original}),verifyModel:(_project,input,original)=>contentDigest({constructedModel:true,input,original})});
  const authorityChecks:{input_digest:string;validation:unknown;error:string|null}[]=[];
  const originalCheck=custody.checkRunAuthority.bind(custody);
  custody.checkRunAuthority=(project,input)=>{
   const record={input_digest:contentDigest({project,input}).value,validation:null as unknown,error:null as string|null};
   try{const validation=originalCheck(project,input);record.validation=validation;return validation;}catch(error){record.error=String(error);throw error;}
   finally{authorityChecks.push(record);writeFileSync(join(dataDirectory,"constructed-authority-checks.json"),JSON.stringify(authorityChecks,null,2));}
  };
  f.runPort.agent.admitContext=custody.admit.bind(custody);f.runPort.agent.checkRunAuthority=custody.checkRunAuthority.bind(custody);f.runPort.agent.checkToolAuthority=(project,input)=>{try{return checks.validateTool(project,input,custody);}catch(error){writeFileSync(join(dataDirectory,"constructed-tool-host-failure.json"),JSON.stringify({message:String(error),stack:error instanceof Error?error.stack:null}));throw error;}};
  const modelAdmission=new LocalAgentModelAdmission(root,dataDirectory,custody,checks);f.runPort.agent.checkModelAuthority=modelAdmission.checkModelAuthority.bind(modelAdmission);
  const kernel=new CimiLoopKernel({store:f.store,caller:f.caller,now:()=>new Date().toISOString(),runVerifier:f.runPort});
  const toolAssessments:unknown[]=[],assessTool=kernel.assessAgentRunTool.bind(kernel);
  kernel.assessAgentRunTool=input=>{const result=assessTool(input);toolAssessments.push(result);writeFileSync(join(dataDirectory,"constructed-tool-assessments.json"),JSON.stringify(toolAssessments,null,2));return result;};
  const prepare=f.prepareCommand();const prepared=flowSuccess(kernel.execute({...prepare,payload:{...f.pins,source_snapshot_ref:{object_type:"source_snapshot",id:source.id}}}));if(prepared.command_type!=="PrepareRunContext"||!("runtime_binding" in prepared.data.context))throw Error("Context expected");
  await beforeReserve?.({root,dataDirectory,ledger});
  const result=flowSuccess(kernel.execute(f.reserveCommand({...prepared.data,context:prepared.data.context},editable?150:100)));if(result.command_type!=="ReserveRun"||result.data.record.run_kind!=="agent")throw Error("Agent reserved expected");
  const reserved={...result.data,record:result.data.record},scope=parseAgentWorkspaceToolScope({project_id:f.project.id,run_id:reserved.run.id,operation_key:reserved.record.operation_key,executor_actor_id:f.agent.id,context_digest:reserved.record.input_digest,...f.pins,host_admission_ref:reserved.record.host_admission_ref});
  const local={caller:f.caller,store:f.store,kernel,location:{repositoryKind:"git" as const,repositoryPath:root,dataDirectory,databasePath:f.path,instancePath:join(dataDirectory,"instance.json"),suggestedName:"Actual host model path; constructed account"}};
  const binary=join(process.env.APPDATA!,"npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe");let sends=0;
  const model:AgentRuntimeModelPort={admission_digest:digest("constructed model/account qualification").value,check:async current=>{expect(current).toEqual(scope);const assessment=kernel.assessAgentRunModel(current);if(!("decision" in assessment)||assessment.decision!=="ALLOW")throw Error(JSON.stringify(assessment));},execute:async input=>{
   expect(JSON.stringify(input.prompt)).toContain("cimiloop/agent-runtime-task-packet/2.0.0");expect(JSON.stringify(input.prompt)).not.toContain("line truncated");sends++;const name=sends===1?"cimi_read":editable&&sends===2?"cimi_replace":sends===(editable?3:2)?"cimi_check":null;
   if(name)return {content:[{type:"tool-call",tool_call_id:"model_tool_"+sends,tool_name:name,arguments:JSON.stringify(name==="cimi_check"?{check_id:"query_test"}:{path:name==="cimi_replace"?"src/QUERY.ts":"src/query.ts",expected_digest:digest(readFileSync(join(root,"src/query.ts"))).value,...(name==="cimi_replace"?{replacement_utf8:"export const query = () => 2;\n"}:{})})}],usage:{input_tokens:5,output_tokens:5},finish:"tool_calls"};
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
  return {...f,root,dataDirectory,kernel,reserved,scope,local,binary,custody,checks,ledger,model,sends:()=>sends};
 }
 it("completes actual SDK model/read/check steps within a newly approved ten-minute Task and retains the original Run",async()=>{
  const f=await setup(),sequence=f.store.asOfEventSequence(),usage=f.task().usage;
  let delayed=false;const originalCheck=f.model.check;
  f.model.check=async scope=>{await originalCheck(scope);const path=join(f.dataDirectory,'workspace-tool-rehearsals');if(!delayed&&existsSync(path)&&readdirSync(path).some(name=>existsSync(join(path,name,'agent-sandbox-original.json')))){delayed=true;await new Promise<void>(done=>setTimeout(done,12000));}};
  const runtime=LocalAgentRuntimeComposition.open({local:f.local,binary:f.binary,custody:f.custody,checks:f.checks,model:f.model});
  writeInstance(join(f.dataDirectory,"instance.json"),{schema_version:"1.0.0",instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
  const server=await startWorkbench({projectDir:f.root,agentRuntimeForRun:()=>runtime});closers.push(()=>server.close());
  const login=await fetch(server.origin+"/api/session",{method:"POST",headers:{Origin:server.origin,"Content-Type":"application/json"},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});expect(login.status).toBe(200);
  const cookie=login.headers.get("set-cookie")!.split(";")[0]!,csrf=(await login.json() as {csrf:string}).csrf;
  const startOriginal=async()=>{const response=await fetch(server.origin+"/api/agent-runs/"+f.reserved.run.id+"/start",{method:"POST",headers:{Origin:server.origin,Cookie:cookie,"Content-Type":"application/json","X-CimiLoop-CSRF":csrf,Connection:"close"},body:"{}"});const body=await response.json();expect({status:response.status,body}).toMatchObject({status:200});return body;};
  expect(await startOriginal()).toMatchObject({outcome:"original",completion_proven:false});expect(f.sends()).toBe(3);
  expect(delayed).toBe(true);
  expect(await startOriginal()).toMatchObject({outcome:"original"});expect(f.sends()).toBe(3);
  const collected=await collectAgentRuntimeOperation(f.dataDirectory,f.scope,{project:f.project,record:f.reserved.record});
  expect(collected.model).toMatchObject({status:"Observed",calls:3,unresolved:0,model_account_custody_proven:false,costs_reconciled:false});
  expect(collected.native).toMatchObject({status:"Verified",matched_calls:2,native_effect_reverified:true});expect(collected.ipc).toMatchObject({exchanges:5,correlation:{uncorrelated_exchanges:0,unmatched_sdk_calls:0}});
  const original=readAgentRuntimeModelOriginals(f.dataDirectory,f.scope);expect(original.calls[0]!.request.prompt).toBeDefined();expect(original.calls).toHaveLength(3);
  expect(collected.artifacts.filter(a=>a.name.startsWith("model/")).length).toBe(11);
  const config=JSON.parse(readFileSync(join(collected.status.operation,"original-config.json"),"utf8"));
  expect(collected.artifacts.some(a=>a.name==="agent-job-observation.json")).toBe(true);originalJob(f.dataDirectory,f.scope,collected.status.operation);
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
  const connection={format:"cimiloop/dedicated-model/1.0.0" as const,provider:"zhipuai-coding-plan" as const,model:"zhipuai-coding-plan/glm-fixture",credential_file:join(tmpdir(),"absent-public-dedicated-fixture-"+createInternalId()+".dpapi.json"),credential_digest:digest("fixture only")};
  const accountParent=mkdtempSync(join(tmpdir(),"cimiloop-native-original-account-")),accountRoot=join(accountParent,"account");
  const billProjections=new Map<string,unknown>(),billing={identity_digest:digest("constructed original bill verifier").value,currency:"USD",credit_unit:"coding_request_micro_units",verifyOriginal:(bytes:Uint8Array)=>{const projection=billProjections.get(digest(bytes).value);if(!projection)throw Error("Not a constructed authenticated original bill");return structuredClone(projection);}};
  // Actual external Windows-protected persistent service; policy/full admission
  // remain constructed. This does not approve a real model/package or tariff.
  let ledger!:Awaited<ReturnType<typeof initializeWindowsDedicatedAgentAccountLedger>>;
  // Stage the reusable external account before reserving this NEW Task clock.
  // Existing Run budgets/old failures are never renewed or repaired.
  const f=await setup(true,async prepared=>{
  ledger=await initializeWindowsDedicatedAgentAccountLedger({origin:prepared.ledger,repositoryPath:prepared.root,root:accountRoot,toolsRoot:join(prepared.dataDirectory,"start-tools"),connection,billing,admission:{check:async(scope,fixed,policy)=>{expect(scope).toEqual(f.scope);expect(fixed).toEqual(connection);expect(policy).toMatchObject({admission_digest:digest("constructed model/account qualification").value,profile:{model:"glm-fixture",thinking:"enabled"}});}},policy:{format:"cimiloop/dedicated-agent-account/1.0.0",host_identity_digest:prepared.ledger.identityDigest,account_digest:digest("constructed account").value,approval_digest:digest("constructed approval").value,package_digest:digest("constructed package").value,tariff_digest:digest("constructed tariff").value,admission_digest:digest("constructed model/account qualification").value,connection_digest:digest(JSON.stringify(connection)).value,profile:{model:"glm-fixture",thinking:"enabled"},cash_limit_micros:150,credit_limit_micro_units:0,cash_per_call_upper_micros:30,credit_per_call_upper_micro_units:0,input_token_limit:1000000,output_token_limit:512}});
  closers.push(async()=>ledger.close());console.error("Retain original external account fixture: "+accountParent);
  }),sequence=f.store.asOfEventSequence(),usage=f.task().usage;

  // Only local TLS and constructed account approval/credential. Never real
  // model/account qualification, a paid request or S1 acceptance.
  const certificate=readFileSync(fileURLToPath(new URL("../../packages/runtime-adapter/fixtures/gateway-http-tls/cert.pem",import.meta.url)));
  const fixtureKey="CIMILOOP_NATIVE_DEDICATED_PUBLIC_FIXTURE_KEY",observed:{request_id:string;body:Record<string,unknown>}[]=[];
  let credentials=0;
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
  const account=LocalAgentDedicatedAccount.open(f.local,f.reserved.run.id,ledger);
  expect(LocalAgentRuntimeComposition.openDedicatedPersistent({local:f.local,binary:f.binary,custody:f.custody,checks:f.checks,runId:f.reserved.run.id,connection,account:ledger}).originalScope(f.reserved.run.id)).toEqual(f.scope);
  const dedicated=createDedicatedAgentRuntimeModel({root:f.dataDirectory,repositoryPath:f.root,scope:f.scope,connection,account:account.modelAccountPort()},{boundary,readCredential:async()=>{credentials++;return fixtureKey;}});
  const runtime=LocalAgentRuntimeComposition.open({local:f.local,binary:f.binary,custody:f.custody,checks:f.checks,model:dedicated});
  writeInstance(join(f.dataDirectory,"instance.json"),{schema_version:"1.0.0",instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
  let accountReleases=0; const server=await startWorkbench({projectDir:f.root,agentRuntimeForRun:()=>runtime,agentAccountForRun:()=>({account:ledger,release(){accountReleases++;}})});closers.push(()=>server.close());
  const login=await fetch(server.origin+"/api/session",{method:"POST",headers:{Origin:server.origin,"Content-Type":"application/json"},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});expect(login.status).toBe(200);
  const cookie=login.headers.get("set-cookie")!.split(";")[0]!,csrf=(await login.json() as {csrf:string}).csrf;
  const startOriginal=async()=>{const response=await fetch(server.origin+"/api/agent-runs/"+f.reserved.run.id+"/start",{method:"POST",headers:{Origin:server.origin,Cookie:cookie,"Content-Type":"application/json","X-CimiLoop-CSRF":csrf,Connection:"close"},body:"{}"});const body=await response.json();expect({status:response.status,body}).toMatchObject({status:200});return body;};
  expect(await startOriginal()).toMatchObject({outcome:"original",completion_proven:false});expect(f.sends()).toBe(4);
  expect(await startOriginal()).toMatchObject({outcome:"original"});expect(f.sends()).toBe(4);
  const collected=await collectAgentRuntimeOperation(f.dataDirectory,f.scope,{project:f.project,record:f.reserved.record});
  expect(collected.model).toMatchObject({status:"Observed",calls:4,unresolved:0,model_account_custody_proven:false,costs_reconciled:false});
  expect(collected.native).toMatchObject({status:"Verified",matched_calls:3,native_effect_reverified:true});expect(collected.ipc).toMatchObject({exchanges:7,correlation:{uncorrelated_exchanges:0,unmatched_sdk_calls:0}});
  const original=readAgentRuntimeModelOriginals(f.dataDirectory,f.scope);expect(original.calls[0]!.request.prompt).toBeDefined();expect(original.calls).toHaveLength(4);
  expect(collected.artifacts.filter(a=>a.name.startsWith("model/")).length).toBe(14);
  const config=JSON.parse(readFileSync(join(collected.status.operation,"original-config.json"),"utf8"));
  expect(collected.artifacts.some(a=>a.name==="agent-job-observation.json")).toBe(true);originalJob(f.dataDirectory,f.scope,collected.status.operation);
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
   model_account_custody_proven:false,costs_reconciled:false,task_acceptance_proven:false,current_workspace_applicability_proven:false,required_checks:[{check_id:"query_test"}],sdk:{final_model_call_id:"model_0004"}});
  const modelHeader=JSON.parse(readFileSync(join(f.dataDirectory,"agent-runtime-model-starts",f.project.id,f.reserved.run.id,"header.json"),"utf8"));expect(modelHeader).toMatchObject({format:"cimiloop/agent-runtime-model-originals/2.0.0",original_evidence:{kind:"dedicated_zhipu/1.0.0"}});
  const runtimeInput=JSON.parse(readFileSync(join(f.dataDirectory,"agent-runtime-claims",f.project.id,"runs",f.reserved.run.id,"input.json"),"utf8"));expect(runtimeInput.model_original_binding).toEqual({format:"cimiloop/agent-model-original-binding/1.0.0",header_digest:digest(JSON.stringify(modelHeader)).value,original_evidence:modelHeader.original_evidence});
  expect(collected).toMatchObject({dedicated_model:{status:"Observed",calls:4,unresolved:0,original_requirement_pinned:true,budget_identity_pinned:true,budget:{cash_upper_micros:120,credit_upper_micro_units:0,settled:false},model_account_custody_proven:false,costs_reconciled:false,formal_agent_execution_enabled:false}});
  expect(collected.artifacts.filter(a=>a.name.startsWith("dedicated-model/"))).toHaveLength(43);
  const persistedCollection=JSON.parse(readFileSync(join(f.dataDirectory,"objects",proof.collection_ref.locator),"utf8"));expect(persistedCollection.dedicated_model).toEqual(collected.dedicated_model);
  expect(persistedCollection.artifacts.filter((a:{name:string})=>a.name.startsWith("dedicated-model/"))).toHaveLength(43);
  expect(observed).toHaveLength(4);const holds=ledger.snapshot().holds;expect(holds).toBe(4);expect(credentials).toBe(4);expect(ledger.snapshot()).toMatchObject({cash_held_micros:120,credit_held_micro_units:0,costs_reconciled:false});
  expect(f.ledger.listExclusive("dedicated_account_hold")).toHaveLength(4);
  expect((observed[1]!.body.messages as {role:string;reasoning_content?:string}[]).filter(m=>m.role==="assistant").map(m=>m.reasoning_content)).toEqual(["original constructed reasoning 1"]);
  expect((observed[2]!.body.messages as {role:string;reasoning_content?:string}[]).filter(m=>m.role==="assistant").map(m=>m.reasoning_content)).toEqual(["original constructed reasoning 1","original constructed reasoning 2"]);
  const originalHolds=Array.from({length:4},(_,i)=>ledger.readOriginalHold(f.scope,"model_"+String(i+1).padStart(4,"0"))!);expect(originalHolds.every(Boolean)).toBe(true);
  const billBytes=Buffer.from("PUBLIC CONSTRUCTED final dedicated Native fixture bill"),bill={format:"cimiloop/dedicated-account-bill/1.0.0",bill_id:"public-native-original-1",account_digest:originalHolds[0]!.account_digest,approval_digest:originalHolds[0]!.approval_digest,package_digest:digest("constructed package").value,tariff_digest:originalHolds[0]!.tariff_digest,connection_digest:digest(JSON.stringify(connection)).value,currency:"USD",credit_unit:"coding_request_micro_units",items:originalHolds.map(h=>({request_id:h.request_id,scope_digest:h.scope_digest,call_id:h.call_id,request_digest:h.request_digest,hold_digest:digest(JSON.stringify(h)).value,cash_charged_micros:12,credit_charged_micro_units:0}))};
  billProjections.set(digest(billBytes).value,bill);expect(ledger.observeBill(billBytes)).toMatchObject({replay:false});expect(ledger.snapshot()).toMatchObject({holds:4,billed_holds:4,cash_held_micros:0,cash_charged_micros:48,cash_remaining_micros:102,costs_reconciled:true});
  const billQuery=new LocalAgentAccountBilling({...f.local,kernel:f.humanKernel,instance:{schema_version:"1.0.0",instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at}},ledger),originalCost=billQuery.readRunCosts(f.reserved.run.id);expect(originalCost).toMatchObject({costs:{cash_charged_micros:48,unresolved:0,costs_reconciled:true},kernel_costs_reconciled:false,starts_run:false});expect(ledger.observeBill(billBytes).replay).toBe(true);expect(billQuery.readRunCosts(f.reserved.run.id)).toEqual(originalCost);expect(observed).toHaveLength(4);expect(f.ledger.listExclusive("dedicated_account_bill")).toHaveLength(1);
  writeFileSync(join(f.dataDirectory,"d258-constructed-bill-summary.json"),JSON.stringify({format:"cimiloop/constructed-native-bill-summary/1.0.0",original_account_snapshot:ledger.snapshot(),original_cost_query:originalCost,bill_original_bytes_digest:digest(billBytes).value,constructed_bill_projector:true,real_bill_verification:false,real_bill_requests:0,kernel_costs_reconciled:false},null,2));
  writeFileSync(join(f.dataDirectory,"d257-dedicated-fixture-summary.json"),JSON.stringify({format:"cimiloop/dedicated-native-fixture-summary/1.0.0",account_root:accountRoot,original_account_snapshot:ledger.snapshot(),provider_fixture_requests:observed.length,constructed_budget_holds:holds,constructed_credentials_read:credentials,real_model_requests:0,real_credentials_read:0,costs_reconciled:false,formal_agent_execution_enabled:false,requests:observed},null,2));
  expect(f.store.listRuntimeRecords("run_observation",f.change.id)).toHaveLength(1);expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Unknown");
  expect(f.task().usage).toMatchObject({pending_reconciliation:true,cost_reserved_micros:150});expect(f.store.asOfEventSequence()).toBe(sequence+1);
  const humanCommand=(command_type:string)=>({command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:"technical_owner",command_type,target:{object_type:"run",id:f.reserved.run.id},expected_revision:f.store.getRun(f.reserved.run.id)!.revision,payload:{}});
  const post=async(s:typeof server,session:{cookie:string;csrf:string},route:string,command:unknown)=>{const response=await fetch(s.origin+"/api/agent-runs/"+f.reserved.run.id+"/"+route,{method:"POST",headers:{Origin:s.origin,Cookie:session.cookie,"Content-Type":"application/json","X-CimiLoop-CSRF":session.csrf,Connection:"close"},body:JSON.stringify(command)});return {status:response.status,body:await response.json()};};
  const session={cookie,csrf},costCommand=humanCommand("RecordRunObservation"),known=await post(server,session,"cost-observation",costCommand);
  expect(known).toMatchObject({status:200,body:{command_type:"RecordRunObservation",data:{run:{status:"Unknown",cost_known:false,cost_charged_micros:48},observation:{report:{status:"unknown",usage:{cost_known:true,cost_micros:48,currency:"USD"}}}}}});
  expect(await post(server,session,"cost-observation",costCommand)).toEqual(known);expect(f.task().usage).toMatchObject({cost_consumed_micros:48,cost_reserved_micros:102,pending_reconciliation:true});expect(f.store.asOfEventSequence()).toBe(sequence+2);
  const operation=collected.status.operation,nativePath=join(operation,"agent-sandbox-original.json"),stdoutPath=join(operation,"stdout.raw"),resultPath=join(operation,"result.json"),originalNative=readFileSync(nativePath),originalStdout=readFileSync(stdoutPath),originalResult=readFileSync(resultPath);
  // Only this NEW owned fixture is changed and restored. Recollection of agreeing
  // bytes must not validate unsafe policy or a result from another operation.
  try{for(const kind of ["process_limit","network","result_operation","result_sandbox","missing_cleanup"]){
    const native=JSON.parse(originalNative.toString()),result=JSON.parse(originalResult.toString());
    if(kind==="process_limit")native.active_process_limit=2;if(kind==="network")native.network_capability_sids=["S-1-15-3-1"];
    if(kind==="process_limit"||kind==="network"){writeFileSync(nativePath,JSON.stringify(native));result.sandbox=native;writeFileSync(stdoutPath,originalStdout.toString().split(/\r?\n/).map(line=>{if(!line)return line;const event=JSON.parse(line);return event.format==="cimiloop/agent-workspace-sandbox/1.0.0"&&event.phase==="suspended"?JSON.stringify(native):line;}).join("\n"));}
    if(kind==="result_operation")result.operation="PUBLIC foreign operation";if(kind==="result_sandbox")result.sandbox={...result.sandbox,active_process_limit:2};writeFileSync(resultPath,JSON.stringify(result));
    const cleanupPath=join(operation,"agent-sandbox-cleanup.json"),cleanup=readFileSync(cleanupPath);if(kind==="missing_cleanup")writeFileSync(cleanupPath,"{}");
    try{expect((await post(server,session,"reconcile-original",humanCommand("ReconcileRun"))).status).not.toBe(200);expect(f.store.asOfEventSequence()).toBe(sequence+2);expect(f.task().usage.cost_reserved_micros).toBe(102);expect(observed).toHaveLength(4);}finally{writeFileSync(cleanupPath,cleanup);writeFileSync(nativePath,originalNative);writeFileSync(stdoutPath,originalStdout);writeFileSync(resultPath,originalResult);}
  }}finally{writeFileSync(nativePath,originalNative);writeFileSync(stdoutPath,originalStdout);writeFileSync(resultPath,originalResult);}
  const jobPath=join(operation,'agent-job-observation.json'),jobBytes=readFileSync(jobPath),job=originalJob(f.dataDirectory,f.scope,operation);
  writeFileSync(jobPath,JSON.stringify({...job.proof,job_memory_limit_bytes:4294967296}));
  try{expect((await post(server,session,'reconcile-original',humanCommand('ReconcileRun'))).status).not.toBe(200);expect(f.store.asOfEventSequence()).toBe(sequence+2);expect(f.task().usage.cost_reserved_micros).toBe(102);expect(observed).toHaveLength(4);}finally{writeFileSync(jobPath,jobBytes);}
  const unknowns=f.store.listRuntimeRecords("run_observation",f.change.id).filter(o=>o.run_ref.id===f.reserved.run.id),reconcileCommand=humanCommand("ReconcileRun"),settled=await post(server,session,"reconcile-original",reconcileCommand);
  expect(settled).toMatchObject({status:200,body:{command_type:"ReconcileRun",data:{run:{status:"Succeeded",cost_known:true,cost_charged_micros:48,reservation_released:false},observation:{report:{basis:"reconciliation",status:"succeeded",usage:{cost_known:true,cost_micros:48,currency:"USD"}}}}}});
  expect((settled.body as {data:{observation:{report:{resolves_observation_refs:{id:string}[]}}}}).data.observation.report.resolves_observation_refs.map((r:{id:string})=>r.id).sort()).toEqual(unknowns.map(o=>o.id).sort());
  expect(f.task().usage).toMatchObject({cost_consumed_micros:48,cost_reserved_micros:0,pending_reconciliation:false,attempts_consumed:1,attempts_released:0});expect(f.task().status).not.toBe("Satisfied");expect(f.task().active_run_ref).toBeUndefined();expect(f.store.asOfEventSequence()).toBe(sequence+3);
  // Discard the first success response, close its Workbench and restore exactly
  // that command through a new Human session with no Runtime/account factory.
  await server.close();const recovered=await startWorkbench({projectDir:f.root});closers.push(()=>recovered.close());
  const login2=await fetch(recovered.origin+"/api/session",{method:"POST",headers:{Origin:recovered.origin,"Content-Type":"application/json"},body:JSON.stringify({bootstrap:new URL(recovered.bootstrapUrl).hash.slice(1)})});expect(login2.status).toBe(200);
  const session2={cookie:login2.headers.get("set-cookie")!.split(";")[0]!,csrf:(await login2.json() as {csrf:string}).csrf},cleanupPath=join(operation,"agent-sandbox-cleanup.json"),cleanup=readFileSync(cleanupPath),beforeReplay=accountReleases;
  writeFileSync(cleanupPath,"{}");try{expect(await post(recovered,session2,"reconcile-original",reconcileCommand)).toEqual(settled);}finally{writeFileSync(cleanupPath,cleanup);}
  expect(accountReleases).toBe(beforeReplay);expect(f.store.asOfEventSequence()).toBe(sequence+3);expect(observed).toHaveLength(4);expect(f.sends()).toBe(4);expect(credentials).toBe(4);expect(f.ledger.listExclusive("dedicated_account_bill")).toHaveLength(1);expect(ledger.snapshot()).toMatchObject({cash_charged_micros:48,cash_held_micros:0});
  writeFileSync(join(f.dataDirectory,'d274-job-settlement-summary.json'),JSON.stringify({format:'cimiloop/constructed-job-settlement/1.0.0',run_id:f.reserved.run.id,operation,job_observation:job.proof,job_observation_digest:job.digest,retained_observer:job.observer,job_counterexamples:1,actual_parent_native:true,actual_sdk:true,shared_workbench_original_reconciliation:true,receipt_replayed_after_restart:true,kernel_task_usage:f.task().usage,real_model:false,real_skill:false,real_approval:false,real_bill:false,s1_accepted:false},null,2));
  writeFileSync(join(f.dataDirectory,"d273-parent-settlement-summary.json"),JSON.stringify({format:"cimiloop/constructed-parent-native-settlement/1.0.0",run_id:f.reserved.run.id,operation,source_digest:digest(readFileSync(join(f.root,"src/query.ts"))).value,actual_parent_native:true,actual_sdk:true,actual_fixed_check:true,shared_workbench_fee_observation:true,shared_workbench_original_reconciliation:true,receipt_replayed_after_restart:true,native_counterexamples:5,kernel_event_delta:3,kernel_task_usage:f.task().usage,task_accepted:false,model_requests:4,account_bills:1,real_model:false,real_skill:false,real_approval:false,real_bill:false,s1_accepted:false},null,2));
 // The real Task remains600000ms, independently enforced by its original OS
 // deadline and checked in original-config.json above. Historical rereads,
 // counterexamples, billing and receipt restart run after Native has ended;
 // this test observer needs separate time to finish all of those assertions.
 },1800000);
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
  const response=await start,body=await response.json();expect({status:response.status,body}).toMatchObject({status:403,body:{code:"ROLE_NOT_ASSIGNED"}});expect(f.sends()).toBe(0);
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
