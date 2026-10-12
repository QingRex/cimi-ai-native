import{mkdtempSync,mkdirSync,readFileSync,writeFileSync}from'node:fs';import{tmpdir}from'node:os';import{join,dirname}from'node:path';import{expect}from'vitest';
import{CimiLoopKernel}from'../../packages/kernel/src/index.js';import{contentDigest}from'../../packages/kernel/src/intent.js';
import{LocalAgentModelAdmission,LocalAgentStartCustody,LocalAgentCheckAdmission}from'../../packages/local-app/dist/index.js';
import{initializeWindowsAgentStartLedger,parseAgentWorkspaceToolScope,type AgentRuntimeModelPort,type WorkspaceCheckTemplate}from'../../packages/runtime-adapter/dist/index.js';
import{digest}from'../../packages/runtime-adapter/src/files.js';import{createAgentRunProject}from'./agent-run-project.js';import{flowSuccess}from'./flow-project.js';
export interface OriginalNativeParentPreparation{f:ReturnType<typeof createAgentRunProject>;dataDirectory:string;ledger:Awaited<ReturnType<typeof initializeWindowsAgentStartLedger>>;custody:LocalAgentStartCustody;checks:LocalAgentCheckAdmission;kernel:CimiLoopKernel}
// Actual protected Windows Host/check/clock/Native composition. All model,
// provider/Skill qualifications and approvals remain explicitly constructed.
export async function createOriginalNativeParent(options:{beforePrepare?:(input:OriginalNativeParentPreparation)=>Promise<void>}={}){
 const fixtureParent=process.cwd(),roots:string[]=[],stores:{close():void}[]=[],closers:(()=>Promise<void>)[]=[];
 async function setup(editable=false,beforeReserve?:(prepared:{root:string;dataDirectory:string;ledger:Awaited<ReturnType<typeof initializeWindowsAgentStartLedger>>})=>Promise<void>){
  mkdirSync(fixtureParent,{recursive:true});const root=mkdtempSync(join(fixtureParent,"_"));roots.push(root);
  const f=createAgentRunProject(root,"task_execution",500,[{provider:"cimiloop_workspace",resource_type:"repository_path",locator:"src/**",version:"1.0.0"}],["read_files","run_checks",...(editable?["edit_files" as const]:[])],["src/**"],editable?["src/**"]:undefined,1800000);stores.push(f.store);
  const dataDirectory=dirname(f.path),harness="import {query} from './query.ts'; if(query()!=="+(editable?2:1)+")throw Error('actual source check');\n";
  writeFileSync(join(root,"src/check.mjs"),harness);f.git("add","src/check.mjs");f.git("commit","--quiet","-m","Actual fixed check input");const source=f.capture();
  const template:WorkspaceCheckTemplate={check_id:"query_test",profile:"node_test",entry:"src/check.mjs",inputs:[{path:"src/check.mjs",expected_digest:digest(harness).value},{path:"src/query.ts"}],...(editable?{source_policy:"original_run_edits/1.0.0" as const}:{}),max_elapsed_ms:4000,max_output_bytes:32768};
  const checks=await LocalAgentCheckAdmission.open({repositoryPath:root,dataDirectory,nodeBinary:process.execPath,projectId:f.project.id,templates:[template],custody:{admit:f.runPort.agent.admitContext,
   verify:(_project,input,original)=>contentDigest({constructed:true,input,original})}});
  const hostRoot=mkdtempSync(join(tmpdir(),"cimiloop-family-host-")),ledger=await initializeWindowsAgentStartLedger(join(hostRoot,"start-origin"),join(hostRoot,"start-tools"));closers.push(async()=>ledger.close());
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
  await options.beforePrepare?.({f,dataDirectory,ledger,custody,checks,kernel});
  const prepare=f.prepareCommand();const prepared=flowSuccess(kernel.execute({...prepare,payload:{...f.pins,source_snapshot_ref:{object_type:"source_snapshot",id:source.id}}}));if(prepared.command_type!=="PrepareRunContext"||!("runtime_binding" in prepared.data.context))throw Error("Context expected");
  await beforeReserve?.({root,dataDirectory,ledger});
  const result=flowSuccess(kernel.execute(f.reserveCommand({...prepared.data,context:prepared.data.context},500)));if(result.command_type!=="ReserveRun"||result.data.record.run_kind!=="agent")throw Error("Agent reserved expected");
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
 const result=await setup();
 return{...result,async closeAll(){while(closers.length)await closers.pop()!();while(stores.length)stores.pop()!.close();for(const root of roots)console.error('Retain original actual parent Native family fixture: '+root);}};
}
