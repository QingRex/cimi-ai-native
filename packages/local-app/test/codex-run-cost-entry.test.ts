import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as app from '../src/index.js';
import { readHumanOriginalAgentRunInputs } from '../src/agent-runtime-control-local.js';
import { createAgentRunProject } from '../../../tests/fixtures/agent-run-project.js';
import { startWorkbench } from '../../../apps/workbench/src/server.js';
import { AgentRuntimeModelHost, digest, initializeWindowsAgentStartLedger, initializeWindowsDedicatedAgentAccountLedger } from '@cimiloop/runtime-adapter';
import { productionRuntimeLayout } from '../src/agent-production-admission-local.js';

// Real Kernel/SQLite/Windows protected Host and default CLI/HTTP entry. PUBLIC
// installation/login/quota; the only usage fact is an interrupted capacity
// hold. No model runs, credentials, real provider approval or bill evidence.
describe.runIf(process.platform==='win32')('default Codex Run usage and unknown fees',()=>{
  let root:string,prior:string|undefined,local:ReturnType<typeof app.openLocalProject>,f:ReturnType<typeof createAgentRunProject>,runId:string,accountRoot:string;
  const factory=()=>{const value=Reflect.get(app,'productionAgentCosts');expect(value).toBeTypeOf('function');return value;};
  beforeAll(async()=>{
    root=mkdtempSync(join(tmpdir(),'cimiloop-codex-costs-'));prior=process.env.LOCALAPPDATA;process.env.LOCALAPPDATA=join(root,'user-data');
    const project=join(root,'project');mkdirSync(project);f=createAgentRunProject(project);runId=f.reserveAgent(f.prepareAgent()).run.id;
    app.writeInstance(join(dirname(f.path),'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});local=app.openLocalProject({projectDir:project});
    const binaries=join(root,'binaries');mkdirSync(binaries);for(const name of ['codex.exe','codex-code-mode-host.exe','opencode.exe','node.exe'])copyFileSync(join(process.env.SystemRoot??'C:/Windows','System32','whoami.exe'),join(binaries,name));
    await app.installCodexAgentRuntime(local,{binary:join(binaries,'codex.exe'),native_binary:join(binaries,'opencode.exe'),node_binary:join(binaries,'node.exe'),model:'gpt-6-luna',checks:[{check_id:'query_test',profile:'node_test',entry:'src/check.mjs',inputs:[{path:'src/check.mjs',expected_digest:'4'.repeat(64)},{path:'src/query.ts'}],max_elapsed_ms:4000,max_output_bytes:32768}]},{async inspectLogin(){return{account_digest:'1'.repeat(64),quota_snapshot:{format:'cimiloop/codex-ordinary-quota/1.0.0',ordinary_usage_allowed:true,account_id_digest:'2'.repeat(64),primary:null,secondary:null,credits:null}};}});
    await app.installCodexUsageBudget(local,{model_calls:2,output_tokens:4096});const lease=await app.openInstalledCodexUsageBudget(local);if(!lease)throw Error('Expected protected account');try{accountRoot=lease.root;lease.budget.reserve({scope:readHumanOriginalAgentRunInputs(local,runId).scope,call_id:'model_0001',request_digest:'5'.repeat(64),model_header_digest:'6'.repeat(64)},2048);}finally{lease.release();}
  },120000);
  afterAll(()=>{local?.store.close();f?.store.close();if(prior===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=prior;});
  const expected=()=>({run_id:runId,outcome:'unknown',reason:'codex_bill_original_unavailable',codex_usage:{coverage:'this_run_only',state:'unknown',holds:1,unresolved:1,observed_tokens:null,cash_charged_micros:null,credit_charged_micro_units:null,cost_known:false,costs_reconciled:false},starts_run:false,domain_observation_produced:false,kernel_costs_reconciled:false});
  it('queries the installed protected capacity repeatedly without model launch, repair or Kernel effects',async()=>{
    const before=f.store.asOfEventSequence(),service=new app.LocalHumanAgentAccountBilling(local,factory()),first=await service.query(runId);expect(first).toMatchObject(expected());expect(await service.query(runId)).toEqual(first);expect(first).not.toHaveProperty('costs');expect(f.store.asOfEventSequence()).toBe(before);expect(existsSync(join(local.location.dataDirectory,'agent-runtime-model-originals'))).toBe(false);
    const lease=await app.openInstalledCodexUsageBudget(local);try{expect(lease!.budget.snapshot().held).toEqual({model_calls:1,output_tokens:2048});}finally{lease?.release();}
  },120000);
  it('uses the default compiled CLI while preserving unknown-fee exit status',()=>{
    const before=f.store.asOfEventSequence(),result=spawnSync(process.execPath,[resolve('apps/cli/dist/bin.js'),'run','costs',runId,'--json','--project-dir',local.location.repositoryPath],{encoding:'utf8',windowsHide:true,timeout:120000});expect(result.status).toBe(1);expect(JSON.parse(result.stdout)).toMatchObject(expected());expect(f.store.asOfEventSequence()).toBe(before);
  },120000);
  it('enables default authenticated HTTP reads without enabling bill mutations',async()=>{
    const server=await startWorkbench({projectDir:local.location.repositoryPath}),before=f.store.asOfEventSequence();try{
      const login=await fetch(server.origin+'/api/session',{method:'POST',headers:{Origin:server.origin,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});expect(login.status).toBe(200);const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0]!,Connection:'close'};
      expect(await(await fetch(server.origin+'/api/context',{headers})).json()).toMatchObject({agent_costs_available:true,agent_cost_settlement_available:false});
      const first=await fetch(server.origin+`/api/agent-runs/${runId}/costs`,{headers});expect(first.status).toBe(200);const body=await first.json();expect(body).toMatchObject(expected());expect(await(await fetch(server.origin+`/api/agent-runs/${runId}/costs`,{headers})).json()).toEqual(body);expect(f.store.asOfEventSequence()).toBe(before);
    }finally{await server.close();}
  },120000);
  it('renders default HTTP usage in the browser while keeping cash unknown and settlement disabled',async()=>{
    const {JSDOM}=createRequire(resolve('apps/workbench/package.json'))('jsdom'),server=await startWorkbench({projectDir:local.location.repositoryPath});
    const dom=new JSDOM(readFileSync(resolve('apps/workbench/public/index.html'),'utf8'),{url:server.bootstrapUrl,runScripts:'outside-only'});let pending=0;
    const until=async(check:()=>boolean)=>{const end=Date.now()+20000;while(!check()){if(Date.now()>end)throw Error('Codex usage browser state missing');await new Promise(done=>setTimeout(done,10));}};
    dom.window.fetch=async(path:string,init:RequestInit={})=>{pending++;try{const url=new URL(path,server.origin).href,headers=new Headers(init.headers);headers.set('Cookie',dom.cookieJar.getCookieStringSync(url));headers.set('Connection','close');if(init.method==='POST')headers.set('Origin',server.origin);const response=await fetch(url,{...init,headers}),cookie=response.headers.get('set-cookie');if(cookie)dom.cookieJar.setCookieSync(cookie,url,{http:true});const json=response.json.bind(response);Reflect.set(response,'json',async()=>{try{return await json();}finally{pending--;}});return response;}catch(error){pending--;throw error;}};
    const button=(text:string)=>[...dom.window.document.querySelectorAll('button')].find((node:any)=>node.textContent===text) as any,before=f.store.asOfEventSequence();
    try{
      dom.window.eval(`(async()=>{\n${readFileSync(resolve('apps/workbench/public/app.js'),'utf8')}\n})();`);await until(()=>dom.window.document.querySelector('#operator')?.textContent.includes(f.actor.display_name));dom.window.location.hash='change/'+f.change.id;await until(()=>!!button('查询原运行费用'));
      expect(button('查询原运行费用').disabled).toBe(false);expect(button('记录原账单费用').disabled).toBe(true);expect(button('核对原执行与费用').disabled).toBe(true);button('查询原运行费用').click();
      const output=()=>dom.window.document.querySelector('[data-agent-costs="'+runId+'"]');await until(()=>output()?.textContent.includes('原运行仍有待核对调用，费用未知'));expect(output().textContent).toContain('原预算继续保留');expect(output().textContent).toContain('已核对输出 Token');expect(output().textContent).not.toContain('0 USD');expect(output().textContent).not.toContain('0 CNY');expect(f.store.asOfEventSequence()).toBe(before);
    }finally{await until(()=>pending===0);dom.window.close();await server.close();}
  },120000);
  it('rechecks Human permission after an awaited Codex lease release',async()=>{
    const human=local.instance.actor_id;let releases=0;const service=new app.LocalHumanAgentAccountBilling(local,async(id,context)=>{const lease=await factory()(id,context);return{...lease,async release(){await lease.release();releases++;context.instance.actor_id=f.agent.id;}};});
    try{await expect(service.query(runId)).rejects.toMatchObject({code:'CALLER_IDENTITY_MISMATCH'});expect(releases).toBe(1);}finally{local.instance.actor_id=human;}
  },120000);
  it('suppresses verified usage if lease release fails',async()=>{
    const result=await new app.LocalHumanAgentAccountBilling(local,async(id,context)=>{const lease=await factory()(id,context);return{...lease,release(){lease.release();throw Error('PUBLIC sensitive release detail');}};}).query(runId);expect(result).toMatchObject({outcome:'unknown',reason:'agent_account_release_unproven'});expect(result).not.toHaveProperty('codex_usage');expect(JSON.stringify(result)).not.toContain('sensitive');
  },120000);
  it('checks the Human before opening a Codex account',async()=>{
    const human=local.instance.actor_id;local.instance.actor_id=f.agent.id;try{await expect(factory()(runId,local)).rejects.toMatchObject({code:'CALLER_IDENTITY_MISMATCH'});}finally{local.instance.actor_id=human;}
  });
  it('does not initialize or fall back when an original Codex usage account is missing',async()=>{
    renameSync(accountRoot,accountRoot+'.retained-original');try{const before=f.store.asOfEventSequence(),result=await new app.LocalHumanAgentAccountBilling(local,factory()).query(runId);expect(result).toMatchObject({outcome:'unknown',reason:'agent_account_original_unavailable'});expect(result).not.toHaveProperty('codex_usage');expect(existsSync(accountRoot)).toBe(false);expect(f.store.asOfEventSequence()).toBe(before);}finally{renameSync(accountRoot+'.retained-original',accountRoot);}
  },120000);
  it('does not read a different Dedicated account when the original Codex installation is lost',async()=>{
    const layout=productionRuntimeLayout(local),connection={format:'cimiloop/dedicated-model/1.0.0' as const,provider:'openai-compatible' as const,model:'openai-compatible/public-model',endpoint:'https://public.example/v1/chat/completions',credential_file:join(root,'ABSENT-CREDENTIAL'),credential_digest:digest('PUBLIC absent credential')};
    mkdirSync(dirname(layout.connectionPath),{recursive:true});mkdirSync(dirname(layout.accountRoot),{recursive:true});
    const {writeFileSync}=await import('node:fs');writeFileSync(layout.connectionPath,JSON.stringify(connection),{flag:'wx'});
    const origin=await initializeWindowsAgentStartLedger(layout.startRoot,layout.toolsRoot);try{
      const account=await initializeWindowsDedicatedAgentAccountLedger({origin,root:layout.accountRoot,repositoryPath:local.location.repositoryPath,toolsRoot:layout.toolsRoot,connection,admission:{async check(){throw Error('PUBLIC no model');}},policy:{format:'cimiloop/dedicated-agent-account/1.0.0',host_identity_digest:origin.identityDigest,account_digest:digest(root+' PUBLIC Dedicated').value,approval_digest:digest('PUBLIC approval').value,package_digest:digest('PUBLIC package').value,tariff_digest:digest('PUBLIC tariff').value,admission_digest:digest('PUBLIC admission').value,connection_digest:digest(JSON.stringify(connection)).value,profile:{model:'public-model',thinking:'disabled'},cash_limit_micros:60,credit_limit_micro_units:0,cash_per_call_upper_micros:30,credit_per_call_upper_micro_units:0,input_token_limit:10000,output_token_limit:512}});account.close();
    }finally{origin.close();}
    const scope=readHumanOriginalAgentRunInputs(local,runId).scope;
    await AgentRuntimeModelHost.initialize(local.location.dataDirectory,scope,{admission_digest:'7'.repeat(64),original_evidence:{kind:'codex_login/1.0.0',header_digest:'8'.repeat(64)},output_profile:'bounded_2048/1.0.0',async check(){},async execute(){throw Error('PUBLIC pending Host; no send');}},['cimi_read']);
    const installation=await app.openInstalledCodexAgentRuntime(local);if(!installation)throw Error('Expected original installation');const path=installation.root;installation.release();renameSync(path,path+'.retained-original');
    try{const result=await new app.LocalHumanAgentAccountBilling(local,factory()).query(runId);expect(result).toMatchObject({outcome:'unknown',reason:'agent_account_original_unavailable'});expect(result).not.toHaveProperty('costs');expect(app.hasProductionAgentBillAccount(local,runId)).toBe(false);expect(existsSync(path)).toBe(false);}finally{renameSync(path+'.retained-original',path);}
  },120000);
});
