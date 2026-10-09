import {mkdtempSync,readFileSync,writeFileSync,readdirSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,resolve,sep} from "node:path";
import {afterEach,describe,it,expect,vi} from "vitest";
import {CimiLoopKernel} from "../../packages/kernel/src/index.js";
import {contentDigest} from "../../packages/kernel/src/intent.js";
import {AgentWorkspaceCheckHost,parseWorkspaceCheckRecipe} from "../../packages/runtime-adapter/src/workspace-checks.js";
import {parseAgentWorkspaceToolScope} from "../../packages/runtime-adapter/src/agent-workspace-authority.js";
import {digest} from "../../packages/runtime-adapter/src/files.js";
import {LocalAgentWorkspaceToolService} from "../../packages/local-app/src/index.js";
import {createAgentRunProject} from "../fixtures/agent-run-project.js";
import {flowTime} from "../fixtures/flow-project.js";
vi.setConfig({testTimeout:240000});
// Actual Native edits, Native checks, original snapshots and independent readers.
// Provider/Skill/account qualification is constructed. No paid/model request.
describe.runIf(process.platform==="win32"&&process.arch==="x64")("fixed checks accept only original Native Run edits",()=>{
 const roots:string[]=[],stores:{close():void}[]=[],closers:(()=>Promise<void>)[]=[];
 afterEach(async()=>{
  while(closers.length)await closers.pop()!();while(stores.length)stores.pop()!.close();
  for(const root of roots.splice(0)){
   if(!resolve(root).startsWith(resolve(tmpdir())+sep+"cimiloop-check-original-edits-"))throw Error("Unsafe fixture root");
   const checks=join(root,".git/cimiloop/workspace-checks");
   if(existsSync(checks))for(const project of readdirSync(checks))for(const operation of readdirSync(join(checks,project))){
    if(!/^[a-f0-9]{64}$/.test(operation))continue;
    const proof=join(checks,project,operation,"native-ownership.json");
    if(existsSync(proof)&&JSON.parse(readFileSync(proof,"utf8")).resources_disposed!==true)throw Error("Retain unresolved own Native resources");
   }
   console.error("Retain original edited-check fixture: "+root);
  }
 });
 it("preserves old fixed policy, verifies edited-source snapshots, replays historical checks and rejects unproven source or harness changes",async()=>{
  const root=mkdtempSync(join(tmpdir(),"cimiloop-check-original-edits-"));roots.push(root);
  const f=createAgentRunProject(root,"task_execution",100,[{provider:"cimiloop_workspace",resource_type:"repository_path",locator:"src/**",version:"1.0.0"}],
   ["read_files","edit_files","run_checks"],["src/**"],["src/**"]);stores.push(f.store);
  const harness="import {query} from './query.ts'; if(query()!==2)throw Error('edited-source check');\n",before=readFileSync(join(root,"src/query.ts"),"utf8");
  writeFileSync(join(root,"src/check.mjs"),harness);
  f.runPort.agent.checkToolAuthority=(project,input)=>contentDigest({constructed:true,project_id:project.id,request:input.request});
  const kernel=new CimiLoopKernel({store:f.store,caller:f.caller,now:()=>flowTime,runVerifier:f.runPort}),prepared=f.prepareAgent(),reserved=f.reserveAgent(prepared);
  const scope=parseAgentWorkspaceToolScope({project_id:f.project.id,run_id:reserved.run.id,operation_key:reserved.record.operation_key,executor_actor_id:f.agent.id,
   context_digest:prepared.context.input_digest,...f.pins,host_admission_ref:prepared.context.host_admission_ref});
  const dataDirectory=dirname(f.path),local={caller:f.caller,store:f.store,kernel,location:{repositoryKind:"git" as const,repositoryPath:root,dataDirectory,databasePath:f.path,
   instancePath:join(dataDirectory,"instance.json"),suggestedName:"Actual edited checks; constructed provider"}};
  const service=await LocalAgentWorkspaceToolService.open(local,reserved.run.id);closers.push(()=>service.close());
  const edit=async(call_id:string,text:string,path="src/query.ts")=>service.execute({format:"cimiloop/workspace-tool-invocation/1.0.0",project_id:scope.project_id,run_id:scope.run_id,operation_key:scope.operation_key,
   executor_actor_id:scope.executor_actor_id,context_digest:scope.context_digest,call_id,tool:"replace_file",path,expected_digest:digest(readFileSync(join(root,"src/query.ts"))).value,replacement_utf8:text});
  const fixed={check_id:"edited",profile:"node_test",entry:"src/check.mjs",inputs:[{path:"src/check.mjs",expected_digest:digest(harness).value},{path:"src/query.ts",expected_digest:digest(before).value}],max_elapsed_ms:4000,max_output_bytes:32768};
  const options={repositoryPath:root,dataDirectory,nodeBinary:process.execPath,scope,assess:kernel.assessAgentRunTool.bind(kernel)};
  const old=await AgentWorkspaceCheckHost.open({...options,recipes:[parseWorkspaceCheckRecipe(fixed,scope)]});closers.push(()=>old.close());
  const after="export const query = () => 2;\n";await edit("actual_edit_1",after,"src/QUERY.ts");
  const call={format:"cimiloop/workspace-check-call/1.0.0" as const,call_id:"fixed_before_edit",check_id:"edited"};
  await expect(old.execute(call)).rejects.toThrow();
  const recipe=parseWorkspaceCheckRecipe({...fixed,source_policy:"original_run_edits/1.0.0",editable_inputs:["src/query.ts"]},scope);
  const host=await AgentWorkspaceCheckHost.open({...options,recipes:[recipe]});closers.push(()=>host.close());
  expect(host.getCatalog().format).toBe("cimiloop/workspace-check-catalog/2.0.0");
  const firstCall={...call,call_id:"edited_check_1"},first=await host.execute(firstCall);
  expect(first.receipt).toMatchObject({outcome:"passed",exit_code:0});
  const sourcesPath=join(first.operation,"sources.json"),sources=JSON.parse(readFileSync(sourcesPath,"utf8"));
  expect(sources).toMatchObject({format:"cimiloop/workspace-check-sources/2.0.0",sources:[{path:"src/check.mjs",digest:digest(harness).value},{path:"src/query.ts",digest:digest(after).value}],original_file_calls:[{call_id:"actual_edit_1"}]});
  expect(first.receipt).toMatchObject({format:"cimiloop/workspace-check-receipt/2.0.0",source_basis_digest:digest(JSON.stringify({sources:sources.sources,original_file_calls:sources.original_file_calls})).value});
  expect(first.receipt.source_digest).toBe(digest(JSON.stringify(sources.sources)).value);
  expect(readFileSync(join(first.operation,"sandbox/workspace/src/query.ts"),"utf8")).toBe(after);
  const later="export const query = () => 3;\n";await edit("actual_edit_2",later);
  const originalNative=readFileSync(join(first.operation,"native-ownership.json"));
  expect((await host.execute(firstCall)).receipt).toEqual(first.receipt);
  expect(readFileSync(join(first.operation,"native-ownership.json"))).toEqual(originalNative);
  const second=await host.execute({...call,call_id:"edited_check_2"});
  expect(second.receipt).toMatchObject({outcome:"failed",exit_code:1,reason:"exited"});
  const originals=AgentWorkspaceCheckHost.readRunOriginals(dataDirectory,f.project,reserved.record);
  expect(originals.facts).toMatchObject({invocations:3,unresolved:0,has_effect:true});
  expect(originals.calls.find(c=>c.call.call_id===firstCall.call_id)!.receipt).toEqual(first.receipt);
  const originalSources=readFileSync(sourcesPath);try{
   sources.original_file_calls[0].receipt_digest=digest("foreign").value;writeFileSync(sourcesPath,JSON.stringify(sources));
   expect(()=>AgentWorkspaceCheckHost.readRunOriginals(dataDirectory,f.project,reserved.record)).toThrow();
  }finally{writeFileSync(sourcesPath,originalSources);}
  // An external write is not an original Agent tool receipt.
  writeFileSync(join(root,"src/query.ts"),"export const query = () => 99;\n");
  await expect(host.execute({...call,call_id:"external_source"})).rejects.toThrow();
  writeFileSync(join(root,"src/query.ts"),later);
  // The fixed harness stays fixed even though WorkItem allows src/** edits.
  writeFileSync(join(root,"src/check.mjs"),"process.exit(0);\n");
  await expect(host.execute({...call,call_id:"changed_harness"})).rejects.toThrow();
  writeFileSync(join(root,"src/check.mjs"),harness);
  await edit("actual_edit_3",before);
  const future=await edit("actual_edit_4",after);
  const savedBasis=readFileSync(sourcesPath),replacementBasis=JSON.parse(savedBasis.toString());
  replacementBasis.original_file_calls=[{call_id:"actual_edit_4",receipt_digest:digest(JSON.stringify(future.receipt)).value}];
  try {writeFileSync(sourcesPath,JSON.stringify(replacementBasis));
   // Same before/after source bytes and a real correct future receipt digest
   // still cannot replace the capture-time proof bound by original IPC receipt.
   expect(()=>AgentWorkspaceCheckHost.readRunOriginals(dataDirectory,f.project,reserved.record)).toThrow();
  }finally{writeFileSync(sourcesPath,savedBasis);}
  expect(f.store.getRun(reserved.run.id)!.status).toBe("Reserved");expect(f.task().usage.cost_reserved_micros).toBe(100);
 });
});