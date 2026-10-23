import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { LocalAgentRuntimeAdmission, writeInstance, type LocalProject } from '@cimiloop/local-app';
import { AgentStartLedger, digest } from '../../../packages/runtime-adapter/dist/index.js';
import { createAgentRunProject } from '../../../tests/fixtures/agent-run-project.js';
import { startWorkbench, type WorkbenchServer } from '../src/server.js';

const {JSDOM}=createRequire(import.meta.url)('jsdom');
// Use the ESM runtime loaded by the compiled local-app entry. Host handles are
// branded; neither a second source class nor a Node require realm can replace it.
const script=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const until=async(check:()=>boolean)=>{const end=performance.now()+30000;while(!check()){if(performance.now()>end)throw Error('Agent preparation UI state missing');await new Promise(done=>setTimeout(done,10));}};
let f:ReturnType<typeof createAgentRunProject>,server:WorkbenchServer,origin:Parameters<typeof LocalAgentRuntimeAdmission.open>[1]['origin'];const windows:any[]=[];
afterEach(async()=>{for(const w of windows.splice(0)){await until(()=>w.__pending===0);w.close();}await server?.close();origin?.close();f?.store.close();});

// Actual DOM/HTTP/Kernel/SQLite/Host1. Full Provider and independent host are
// PUBLIC fixtures; no model, Native launch or S1 qualification is claimed.
it('prepares and reserves through shared Human authorization, retaining exact requests across browser response loss',async()=>{
 const root=mkdtempSync(join(tmpdir(),'cimiloop-agent-preparation-ui-'));
 f=createAgentRunProject(root,'task_execution',100,[{provider:'cimiloop_workspace',resource_type:'repository_path',locator:'src/**',version:'1.0.0'}],['read_files','run_checks'],['src/**']);
 const harness="import{query}from'./query.ts';if(query()!==1)throw Error('PUBLIC check');\n";
 writeFileSync(join(root,'src/check.mjs'),harness);f.git('add','src/check.mjs');f.git('commit','--quiet','-m','PUBLIC original checks');const source=f.capture(),dataDirectory=dirname(f.path);
 writeInstance(join(dataDirectory,'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
 origin=AgentStartLedger.initialize(join(dataDirectory,'PUBLIC-origin'),{machine_digest:digest('PUBLIC machine').value,principal_digest:digest('PUBLIC user').value});
 let admissions=0;const full={admit:(...args:Parameters<typeof f.runPort.agent.admitContext>)=>{admissions++;return f.runPort.agent.admitContext(...args);},verifyLaunch:()=>digest('PUBLIC launch'),verifyTool:()=>digest('PUBLIC tool'),verifyModel:()=>digest('PUBLIC model')};
 const admissionOptions={origin,nodeBinary:process.execPath,templates:[{check_id:'query_test',profile:'node_test' as const,entry:'src/check.mjs',inputs:[{path:'src/check.mjs',expected_digest:digest(harness).value},{path:'src/query.ts'}],max_elapsed_ms:1000,max_output_bytes:4096}],full};
 server=await startWorkbench({projectDir:root,runtimeAdmission:local=>LocalAgentRuntimeAdmission.open(local,admissionOptions)});
 const sent:any[]=[],lost=new Set(['PrepareRunContext','ReserveRun']);
 const browser=(url:string,jar?:any,saved?:Record<string,string>)=>{
  const dom=new JSDOM(html,{url,runScripts:'outside-only',...(jar?{cookieJar:jar}:{})});windows.push(dom.window);dom.window.__pending=0;
  for(const [key,value] of Object.entries(saved??{}))dom.window.sessionStorage.setItem(key,value);
  dom.window.fetch=async(path:string,init:RequestInit={})=>{dom.window.__pending++;try{
   const destination=new URL(path,server.origin).href,headers=new Headers(init.headers);headers.set('Cookie',dom.cookieJar.getCookieStringSync(destination));headers.set('Connection','close');if(init.method==='POST')headers.set('Origin',server.origin);
   const command=path==='/api/commands'?JSON.parse(String(init.body)):undefined;if(command)sent.push(command);
   const response=await fetch(destination,{...init,headers}),cookie=response.headers.get('set-cookie');if(cookie)dom.cookieJar.setCookieSync(cookie,destination,{http:true});
   if(response.ok&&command&&lost.delete(command.command_type))throw TypeError('PUBLIC committed response loss');return response;
  }finally{dom.window.__pending--;}};
  dom.window.eval(`(async()=>{\n${script}\n})();`);return dom;
 };
 const find=(dom:any,text:string)=>[...dom.window.document.querySelectorAll('button')].find((button:any)=>button.textContent===text) as any;
 const ready=async(dom:any)=>{await until(()=>dom.window.document.querySelector('#operator')?.textContent.includes('Owner'));dom.window.location.hash='change/'+f.change.id;await until(()=>!!find(dom,'准备 Agent 运行资料'));};
 const first=browser(server.bootstrapUrl);await ready(first);
 const preparation=find(first,'准备 Agent 运行资料').closest('form');preparation.querySelector('[name="source"]').value=source.id;preparation.querySelector('[type="checkbox"]').checked=true;find(first,'准备 Agent 运行资料').click();
 await until(()=>first.window.document.querySelector('#notice')?.textContent.includes('PUBLIC committed response loss'));
 expect(f.store.listRuntimeRecords('context_manifest',f.change.id)).toHaveLength(1);expect(admissions).toBe(1);
 const key='cimiloop.pending.'+f.project.id,saved={[key]:first.window.sessionStorage.getItem(key)!};expect(JSON.parse(saved[key]!)).toEqual(sent[0]);
 const second=browser(server.origin+'/#change/'+f.change.id,first.cookieJar,saved);await ready(second);find(second,'按原请求核对').click();
 await until(()=>second.window.sessionStorage.getItem(key)===null&&!!find(second,'预约 Agent 运行'));
 expect(sent[1]).toEqual(sent[0]);expect(admissions).toBe(1);
 const reservation=find(second,'预约 Agent 运行').closest('form');reservation.querySelector('[name="reserved_cost_micros"]').value='100';find(second,'预约 Agent 运行').click();
 await until(()=>second.window.document.querySelector('#notice')?.textContent.includes('PUBLIC committed response loss'));
 expect(f.store.listRuns(f.change.id)).toHaveLength(1);find(second,'按原请求核对').click();
 await until(()=>second.window.sessionStorage.getItem(key)===null&&!!find(second,'查询原运行'));
 expect(sent[3]).toEqual(sent[2]);expect(f.store.listRuns(f.change.id)).toHaveLength(1);expect(f.task().usage.attempts_consumed).toBe(1);
 const contexts=f.store.listRuntimeRecords('context_manifest',f.change.id);expect(contexts[0]).toMatchObject({producer_actor_id:f.agent.id,executor_ref:{id:f.agent.id}});
 expect(origin.listExclusive('human_agent_preparation')).toHaveLength(2);await server.close();expect(origin.listExclusive('human_agent_preparation')).toHaveLength(2);
 let failedAdmission:LocalAgentRuntimeAdmission|undefined,failedLocal:LocalProject|undefined;
 await expect(startWorkbench({projectDir:root,prePlanMatt:Object.create(null),runtimeAdmission:async local=>{failedLocal=local;return failedAdmission=await LocalAgentRuntimeAdmission.open(local,admissionOptions);}})).rejects.toThrow();
 expect(failedAdmission).toBeInstanceOf(LocalAgentRuntimeAdmission);expect(()=>failedAdmission!.guard()).toThrow();expect(()=>failedLocal!.store.getProject()).toThrow();expect(origin.listExclusive('human_agent_preparation')).toHaveLength(2);
},120000);
