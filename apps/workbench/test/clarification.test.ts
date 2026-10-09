import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { writeInstance, openLocalProject, LocalPrePlanClarification } from "@cimiloop/local-app";
import { createRunProject } from "../../../tests/fixtures/run-project.js";
import { contractBody } from "../../../tests/fixtures/intent-project.js";
import { flowSuccess } from "../../../tests/fixtures/flow-project.js";
import { startWorkbench, type WorkbenchServer } from "../src/server.js";

describe("pre-Plan Human clarification uses original requests", () => {
 let root: string, f: ReturnType<typeof createRunProject>, server: WorkbenchServer, cookie: string, csrf: string;
 const request = async (path: string, body?: unknown) => {
  const response=await fetch(server.origin+path,{headers:{Cookie:cookie,Connection:"close",...(body===undefined?{}:{Origin:server.origin,"Content-Type":"application/json","X-CimiLoop-CSRF":csrf})},...(body===undefined?{}:{method:"POST",body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json() as Record<string,any>};
 };
 const login = async () => {
  const response=await fetch(server.origin+"/api/session",{method:"POST",headers:{Origin:server.origin,"Content-Type":"application/json"},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});
  cookie=response.headers.get("set-cookie")!.split(";")[0]!;csrf=(await response.json() as {csrf:string}).csrf;
 };
 const draft = () => {
  const result=flowSuccess(f.kernel.execute({...f.context(),command_type:"CreateChange",payload:{title:"Clarify before plan",requirement_owner_actor_id:f.actor.id}}));
  if(result.command_type!=="CreateChange")throw Error("Change expected");return result.data.change;
 };
 const begin = (id:string) => request(`/api/changes/${id}/clarifications`,{request_id:createInternalId(),requirement:"返回一致查询",background:"当前输出需要解释",constraints:["兼容旧接口"]});
 beforeAll(async()=>{root=mkdtempSync(join(tmpdir(),"cimiloop-clarification-http-"));f=createRunProject(root);writeInstance(join(dirname(f.path),"instance.json"),{schema_version:"1.0.0",instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});server=await startWorkbench({projectDir:root});await login();},60000);
 afterAll(async()=>{await server?.close();f?.store.close();if(root){if(dirname(root)!==resolve(tmpdir())||!basename(root).startsWith("cimiloop-clarification-http-"))throw Error("Unsafe cleanup");rmSync(root,{recursive:true,force:true});}});
 it("keeps Human questions and answers before any Plan or Task, then submits one native candidate across restart",async()=>{
  const change=draft(),sequence=f.store.asOfEventSequence(),start=await begin(change.id);
  expect(start).toMatchObject({status:200,body:{ok:true,session:{change_id:change.id,head:0}}});
  const session=start.body.session.id,path=`/api/changes/${change.id}/clarifications/${session}`;
  const question={request_id:createInternalId(),expected_head:0,kind:"question",text:"哪些字段必须保留？"};
  expect(await request(path,question)).toMatchObject({status:200,body:{session:{head:1}}});
  const answer={request_id:createInternalId(),expected_head:1,kind:"answer",question_id:question.request_id,text:"保留原字段并增加序号"};
  const answered=await request(path,answer);expect(answered).toMatchObject({status:200,body:{session:{head:2,unanswered:[]}}});
  expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.store.listExecutionObjects("task",change.id)).toHaveLength(0);expect(f.store.listIntentRecords("plan_proposal",change.id)).toHaveLength(0);
  const candidate={request_id:createInternalId(),expected_head:2,kind:"candidate",requested_at:new Date().toISOString(),body:contractBody()};
  const submitted=await request(path,candidate);expect(submitted).toMatchObject({status:200,body:{command_result:{command_type:"SubmitContractProposal"},session:{head:3}}});
  await server.close();server=await startWorkbench({projectDir:root});await login();
  expect(await request(path,candidate)).toEqual(submitted);expect(f.store.asOfEventSequence()).toBe(sequence+1);
  expect(f.store.listIntentRecords("contract_proposal",change.id)).toHaveLength(1);expect(f.store.listIntentRecords("plan_version",change.id)).toHaveLength(0);expect(f.store.listExecutionObjects("task",change.id)).toHaveLength(0);
  expect(await request(path)).toMatchObject({status:200,body:{session:{head:3,submitted:true}}});
 });
 it("rejects retrospective pre-Plan sessions, caller/path overrides and unresolved questions",async()=>{
  expect((await begin(f.change.id)).status).toBe(409);
  const change=draft(),bad={request_id:createInternalId(),requirement:"R",background:"B",constraints:[],actor_id:f.reviewer.id};
  expect((await request(`/api/changes/${change.id}/clarifications`,bad)).status).toBe(400);
  const start=await begin(change.id),path=`/api/changes/${change.id}/clarifications/${start.body.session.id}`,question={request_id:createInternalId(),expected_head:0,kind:"question",text:"谁验收？"};
  expect((await request(path,question)).status).toBe(200);
  expect(await request(path,{request_id:createInternalId(),expected_head:1,kind:"candidate",requested_at:new Date().toISOString(),body:contractBody()})).toMatchObject({status:409,body:{code:"RECOVERY_CONDITIONS_UNMET"}});
  expect(f.store.listIntentRecords("contract_proposal",change.id)).toHaveLength(0);
 });
 it("compares the original head across concurrent answers and refuses changed request identity",async()=>{
  const change=draft(),start=await begin(change.id),path=`/api/changes/${change.id}/clarifications/${start.body.session.id}`,question={request_id:createInternalId(),expected_head:0,kind:"question",text:"预期是什么？"};await request(path,question);
  const answer={request_id:createInternalId(),expected_head:1,kind:"answer",question_id:question.request_id,text:"同一快照"};
  const both=await Promise.all([request(path,answer),request(path,answer)]);expect(both.map(r=>r.status)).toEqual([200,200]);expect(both[0]).toEqual(both[1]);
  expect((await request(path,{...answer,text:"改输入"})).body.code).toBe("COMMAND_ID_REUSED");
  expect((await request(path,{...question,request_id:createInternalId(),expected_head:1})).body.code).toBe("REVISION_CONFLICT");
 });
 it("refuses an uninstalled real Matt host without dispatching or inventing method proof",async()=>{
  const change=draft(),start=await begin(change.id),path=`/api/changes/${change.id}/clarifications/${start.body.session.id}`,sequence=f.store.asOfEventSequence();
  expect(await request(path,{request_id:createInternalId(),expected_head:0,kind:"matt"})).toMatchObject({status:409,body:{code:"CAPABILITY_UNAVAILABLE"}});
  expect(await request(path)).toMatchObject({status:200,body:{session:{head:0,real_method_invocations:0}}});expect(f.store.asOfEventSequence()).toBe(sequence);
 });
 it("recovers the original candidate after Kernel commits but the application receipt is lost",async()=>{
  const change=draft(),start=await begin(change.id),path='/api/changes/'+change.id+'/clarifications/'+start.body.session.id;
  const question={request_id:createInternalId(),expected_head:0,kind:"question",text:"如何验收？"};
  await request(path,question);await request(path,{request_id:createInternalId(),expected_head:1,kind:"answer",question_id:question.request_id,text:"同一结果只有一个候选"});
  const candidate={request_id:createInternalId(),expected_head:2,kind:"candidate",requested_at:new Date().toISOString(),body:contractBody()};
  const local=openLocalProject({projectDir:root}),execute=local.kernel.execute.bind(local.kernel),sequence=f.store.asOfEventSequence();
  local.kernel.execute=((command)=>{const result=execute(command);if((command as {command_type?:string}).command_type==="SubmitContractProposal"&&!("code" in result))throw Error("Constructed crash after real Kernel commit");return result;}) as typeof local.kernel.execute;
  try{expect(()=>new LocalPrePlanClarification(local).advance(change.id,start.body.session.id,candidate)).toThrow("Constructed crash after real Kernel commit");}finally{local.store.close();}
  expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(f.store.listIntentRecords("contract_proposal",change.id)).toHaveLength(1);
  expect(await request(path)).toMatchObject({status:200,body:{session:{head:3,pending:true,submitted:false}}});
  const recovered=await request(path,candidate);expect(recovered).toMatchObject({status:200,body:{session:{head:3,pending:false,submitted:true},command_result:{command_type:"SubmitContractProposal"}}});
  expect(await request(path,candidate)).toEqual(recovered);expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(f.store.listExecutionObjects("task",change.id)).toHaveLength(0);
 });
 it("replays historical Human replies without replacing them with later rounds",async()=>{
  const change=draft(),beginBody={request_id:createInternalId(),requirement:"记录原需求",background:"历史回放",constraints:[]};
  const route='/api/changes/'+change.id+'/clarifications',started=await request(route,beginBody),path=route+'/'+started.body.session.id;
  const question={request_id:createInternalId(),expected_head:0,kind:"question",text:"保留什么？"},first=await request(path,question);
  await request(path,{request_id:createInternalId(),expected_head:1,kind:"answer",question_id:question.request_id,text:"完整原请求"});
  expect(await request(path,question)).toEqual(first);expect(await request(route,beginBody)).toEqual(started);
  expect(await request(route,{...beginBody,background:"改背景"})).toMatchObject({status:409,body:{code:"COMMAND_ID_REUSED"}});
  expect(await request(path)).toMatchObject({status:200,body:{session:{head:2}}});
 });
 it("retains the original begin reply when another process advances the newly created session before the second registration locks",async()=>{
  const change=draft(),beginBody={request_id:createInternalId(),requirement:"原开始回执",background:"跨进程并发",constraints:[]};
  const barrier=join(dirname(f.path),"begin-barrier.json");
  const script=[
   'import {openLocalProject,LocalPrePlanClarification} from '+JSON.stringify(new URL("../../../packages/local-app/dist/index.js",import.meta.url).href)+';',
   'import {existsSync} from "node:fs";',
   'const local=openLocalProject({projectDir:process.argv[1]}),[change,request,barrier]=JSON.parse(process.argv[2]);',
   'const snapshot=local.store.readSnapshot.bind(local.store);let paused=false;',
   'local.store.readSnapshot=(work)=>{const result=snapshot(work);if(!paused){paused=true;process.stdout.write("ready\\n");const start=Date.now();while(!existsSync(barrier)){if(Date.now()-start>15000)throw Error("Barrier deadline");Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}}return result;};',
   'try{process.stdout.write(JSON.stringify(new LocalPrePlanClarification(local).begin(change,request)));}catch(error){process.stdout.write(JSON.stringify({error:error.code??error.message}));process.exitCode=1;}finally{local.store.close();}'
  ].join("\n");
  const child=spawn(process.execPath,["--input-type=module","--eval",script,root,JSON.stringify([change.id,beginBody,barrier])],{stdio:["ignore","pipe","pipe"],windowsHide:true});child.stderr.resume();
  let stdout="";const ready=new Promise<void>((done,reject)=>{child.once("error",reject);child.stdout.on("data",chunk=>{stdout+=String(chunk);if(stdout.startsWith("ready\n"))done();});child.once("exit",()=>{if(!stdout.startsWith("ready\n"))reject(Error("Registration never reached barrier"));});});
  const completed=new Promise<unknown>((done,reject)=>{child.once("error",reject);child.once("close",code=>{try{const value=JSON.parse(stdout.slice("ready\n".length));if(code!==0)reject(Error(JSON.stringify(value)));else done(value);}catch(error){reject(error);}});});
  try{await ready;const started=await request('/api/changes/'+change.id+'/clarifications',beginBody);
   expect(started.status).toBe(200);await request('/api/changes/'+change.id+'/clarifications/'+beginBody.request_id,{request_id:createInternalId(),expected_head:0,kind:"question",text:"后续轮次"});
   writeFileSync(barrier,"{}");expect(await completed).toEqual(started.body);
  }finally{if(child.exitCode===null)child.kill();}
 },60000);
 it("rechecks one identical Human request inside the durable lock across actual processes",async()=>{
  const change=draft(),start=await begin(change.id),requestBody={request_id:createInternalId(),expected_head:0,kind:"question",text:"只记录一次？"};
  const script=[
   'import {openLocalProject,LocalPrePlanClarification} from '+JSON.stringify(new URL("../../../packages/local-app/dist/index.js",import.meta.url).href)+';',
   'const local=openLocalProject({projectDir:process.argv[1]});process.stdout.write("ready\\n");',
   'let input="";for await(const chunk of process.stdin)input+=chunk;',
   'try{const [change,session,request]=JSON.parse(input);process.stdout.write(JSON.stringify(new LocalPrePlanClarification(local).advance(change,session,request)));}',
   'catch(error){process.stdout.write(JSON.stringify({error:error.code??error.message}));process.exitCode=1;}finally{local.store.close();}'
  ].join('\n');
  const launch=()=>{
   const child=spawn(process.execPath,["--input-type=module","--eval",script,root],{stdio:["pipe","pipe","pipe"],windowsHide:true});
   let stdout="";const ready=new Promise<void>((done,reject)=>{child.once("error",reject);child.stdout.on("data",chunk=>{stdout+=String(chunk);if(stdout.startsWith("ready\n"))done();});child.once("exit",()=>{if(!stdout.startsWith("ready\n"))reject(Error("Child failed before ready"));});});
   const result=new Promise<unknown>((done,reject)=>{child.once("error",reject);child.once("close",code=>{try{const value=JSON.parse(stdout.slice("ready\n".length));if(code!==0)reject(Error(JSON.stringify(value)));else done(value);}catch(error){reject(error);}});});
   child.stderr.resume();return {child,ready,result};
  };
  const children=[launch(),launch()];
  try{await Promise.all(children.map(child=>child.ready));for(const child of children)child.child.stdin.end(JSON.stringify([change.id,start.body.session.id,requestBody]));const results=await Promise.all(children.map(child=>child.result));expect(results[0]).toEqual(results[1]);expect(results[0]).toMatchObject({session:{head:1}});}
  finally{for(const child of children)if(child.child.exitCode===null)child.child.kill();}
  expect(await request('/api/changes/'+change.id+'/clarifications/'+start.body.session.id)).toMatchObject({body:{session:{head:1,questions:[{id:requestBody.request_id}]}}});
 },60000);
 it("leaves a temporary storage response pending and subsequently reads the actual Kernel receipt",async()=>{
  const change=draft(),start=await begin(change.id),path='/api/changes/'+change.id+'/clarifications/'+start.body.session.id;
  const question={request_id:createInternalId(),expected_head:0,kind:"question",text:"实际领域结果？"};
  await request(path,question);await request(path,{request_id:createInternalId(),expected_head:1,kind:"answer",question_id:question.request_id,text:"Kernel原收据"});
  const candidate={request_id:createInternalId(),expected_head:2,kind:"candidate",requested_at:new Date().toISOString(),body:contractBody()};
  const local=openLocalProject({projectDir:root}),execute=local.kernel.execute.bind(local.kernel),sequence=f.store.asOfEventSequence();
  local.kernel.execute=((command)=>{const result=execute(command);if((command as {command_type?:string}).command_type==="SubmitContractProposal"&&!("code" in result))return {
    schema_version:"2.0.0",code:"STORE_FAILURE",message:"Constructed temporary response after actual commit",category:"storage",retryable:true,correlation_id:(command as {correlation_id:string}).correlation_id,details:{}
  };return result;}) as typeof local.kernel.execute;
  try{expect(new LocalPrePlanClarification(local).advance(change.id,start.body.session.id,candidate)).toMatchObject({session:{head:3,pending:true,submitted:false},command_result:{code:"STORE_FAILURE"}});}finally{local.store.close();}
  expect(f.store.asOfEventSequence()).toBe(sequence+1);
  expect(await request(path,candidate)).toMatchObject({status:200,body:{session:{head:3,pending:false,submitted:true},command_result:{command_type:"SubmitContractProposal"}}});
  expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(f.store.listIntentRecords("contract_proposal",change.id)).toHaveLength(1);
 });
 it("shares original Human requests between the executable CLI and Workbench without domain duplication",async()=>{
  const change=draft(),beginBody={request_id:createInternalId(),requirement:"CLI与工作台接续",background:"同一共享服务",constraints:[]};
  const file=join(dirname(f.path),"clarification-request.json");
  const cli=(args:string[])=>{
   const result=spawnSync(process.execPath,[new URL("../../../apps/cli/dist/bin.js",import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,"$1"),"--json","--project-dir",root,"clarification",...args],{encoding:"utf8",windowsHide:true,maxBuffer:4*1024*1024});
   expect(result.status).toBe(0);return JSON.parse(result.stdout);
  };
  writeFileSync(file,JSON.stringify(beginBody));const started=cli(["begin",change.id,"--file",file]),path='/api/changes/'+change.id+'/clarifications/'+started.session.id;
  expect((await request('/api/changes/'+change.id+'/clarifications',beginBody)).body).toEqual(started);
  const question={request_id:createInternalId(),expected_head:0,kind:"question",text:"是否同一会话？"};writeFileSync(file,JSON.stringify(question));
  const original=cli(["advance",change.id,started.session.id,"--file",file]);expect((await request(path,question)).body).toEqual(original);
  expect(cli(["show",change.id,started.session.id])).toEqual((await request(path)).body);expect(cli(["list",change.id]).sessions).toHaveLength(1);
  expect(f.store.listIntentRecords("plan_proposal",change.id)).toHaveLength(0);expect(f.store.listExecutionObjects("task",change.id)).toHaveLength(0);
 },60000);
 it("bounds domain-detail history while retaining separately readable complete conversation originals",async()=>{
  const change=draft();let earliest:string|undefined;
  for(let index=0;index<3;index++){
   const start=await begin(change.id),session=start.body.session.id;earliest??=session;
   for(let head=0;head<64;head++){
    const response=await request('/api/changes/'+change.id+'/clarifications/'+session,{request_id:createInternalId(),expected_head:head,kind:"question",text:"界".repeat(4000)});
    expect(response.status).toBe(200);
   }
  }
  const list=await request('/api/changes/'+change.id+'/clarifications'),detail=await request('/api/changes/'+change.id);
  expect(list.status).toBe(200);expect(list.body.sessions).toHaveLength(3);expect(list.body.sessions[0]).not.toHaveProperty("steps");
  expect(detail.status).toBe(200);expect(detail.body.clarifications).toHaveLength(1);expect(detail.body.clarification_history).toHaveLength(3);
  expect(Buffer.byteLength(JSON.stringify(detail.body))).toBeLessThan(4*1024*1024);
  expect(await request('/api/changes/'+change.id+'/clarifications/'+earliest)).toMatchObject({status:200,body:{session:{head:64,questions:Array.from({length:64},()=>({text:"界".repeat(4000)}))}}});
 },120000);
 it("retains a corrupt ledger and rejects all writes without repairing originals",async()=>{
  const change=draft(),start=await begin(change.id),path=join(dirname(f.path),"pre-plan-clarifications","originals.sqlite");
  const db=new DatabaseSync(path);db.exec("DROP TRIGGER sessions_update");db.close();
  const before=readFileSync(path),sequence=f.store.asOfEventSequence();
  expect(await request('/api/changes/'+change.id+'/clarifications/'+start.body.session.id)).toMatchObject({status:503,body:{code:"EVIDENCE_MISSING"}});
  expect((await begin(change.id)).status).toBe(503);expect(await request("/api/changes/"+change.id)).toMatchObject({status:200,body:{intent:{change:{id:change.id}},clarification_error:{code:"EVIDENCE_MISSING"}}});expect(readFileSync(path)).toEqual(before);expect(f.store.asOfEventSequence()).toBe(sequence);
 });
});