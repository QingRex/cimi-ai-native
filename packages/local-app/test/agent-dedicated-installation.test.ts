import {copyFileSync,existsSync,mkdtempSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {digest} from '@cimiloop/runtime-adapter';
import * as app from '../src/index.js';
import {createIntentProject} from '../../../tests/fixtures/intent-project.js';
import {startWorkbench} from '../../../apps/workbench/src/server.js';
const interleave=vi.hoisted(()=>({afterOpen:undefined as (()=>void)|undefined}));
vi.mock('../../runtime-adapter/dist/index.js',async load=>{
 const actual=await load<typeof import('../../runtime-adapter/dist/index.js')>();
 return{...actual,openWindowsAgentStartLedger:async(...args:Parameters<typeof actual.openWindowsAgentStartLedger>)=>{const value=await actual.openWindowsAgentStartLedger(...args);const callback=interleave.afterOpen;interleave.afterOpen=undefined;callback?.();return value;}};
});

// Actual Windows Host1, project and immutable materials. PUBLIC programs and
// absent credential: no execution, model, paid request or qualification.
describe.runIf(process.platform==='win32')('dedicated local provider installation',()=>{
 let root:string,local:ReturnType<typeof app.openLocalProject>,fixture:ReturnType<typeof createIntentProject>;
 const api=(name:string)=>{const fn=Reflect.get(app,name);expect(fn,name).toBeTypeOf('function');return fn;};
 const input=()=>({connection_file:join(root,'connection.json'),native_binary:join(root,'program.exe'),node_binary:join(root,'program.exe'),placement_root:join(root,'runtime'),checks:[{check_id:'query_test',profile:'node_test',entry:'src/check.mjs',inputs:[{path:'src/check.mjs',expected_digest:'4'.repeat(64)}],max_elapsed_ms:4000,max_output_bytes:32768}]});
 beforeAll(()=>{
  root=mkdtempSync(join(tmpdir(),'cimiloop-dedicated-install-'));const repository=join(root,'project');mkdirSync(repository);
  fixture=createIntentProject(repository,{databasePath:join(repository,'.cimiloop','project.db')});
  app.writeInstance(join(repository,'.cimiloop','instance.json'),{schema_version:'1.0.0',instance_id:fixture.project.instance_id,project_id:fixture.project.id,actor_id:fixture.actor.id,created_at:fixture.project.created_at});
  local=app.openLocalProject({projectDir:repository});
  copyFileSync(join(process.env.SystemRoot??'C:/Windows','System32','whoami.exe'),join(root,'program.exe'));
  writeFileSync(join(root,'connection.json'),JSON.stringify({format:'cimiloop/dedicated-model/2.0.0',provider:'openai-compatible',transport:'loopback_http/1.0.0',model:'openai-compatible/codex/gpt-6-luna',endpoint:'http://127.0.0.1:3425/v1/chat/completions',credential_file:join(root,'ABSENT-CREDENTIAL'),credential_digest:digest('PUBLIC absent credential')}),{flag:'wx'});
 },60000);
 afterAll(()=>{local?.store.close();fixture?.store.close();});
 it('discovers absence without creating an origin or accessing credentials',async()=>{
  expect(await api('openInstalledDedicatedAgentRuntime')(local)).toBeUndefined();
  expect(existsSync(join(root,'runtime'))).toBe(false);
 });
 it('installs and replays one original bundle without credentials, login or business effects',async()=>{
  const before=local.store.asOfEventSequence(),first=await api('installDedicatedAgentRuntime')(local,input());
  expect(first).toMatchObject({created:true,starts_run:false,model_dispatch_available:false,provider_qualification_proven:false,costs_reconciled:false});
  const second=await api('installDedicatedAgentRuntime')(local,input());expect(second).toEqual({...first,created:false});
  const installed=await api('openInstalledDedicatedAgentRuntime')(local);
  try{installed.guard();expect(installed.connection.model).toBe('openai-compatible/codex/gpt-6-luna');expect(installed.installation_digest).toBe(first.installation_digest);expect(installed.account_root.startsWith(input().placement_root)).toBe(true);expect(()=>{installed.checks[0].inputs[0].path='PUBLIC mutation';}).toThrow();}
  finally{installed?.release();}expect(()=>installed.guard()).toThrow();
  expect(local.store.asOfEventSequence()).toBe(before);expect(existsSync(join(root,'ABSENT-CREDENTIAL'))).toBe(false);
 },120000);
 it('refuses a different placement or check recipe without replacing the original',async()=>{
  await expect(api('installDedicatedAgentRuntime')(local,{...input(),placement_root:join(root,'other')})).rejects.toThrow();
  await expect(api('installDedicatedAgentRuntime')(local,{...input(),checks:[{...input().checks[0],max_elapsed_ms:5000}]})).rejects.toThrow();
  expect(existsSync(join(root,'other'))).toBe(false);
 });
 it('retains original custody after a pinned executable is lost and never repairs on read',async()=>{
  const installed=await api('openInstalledDedicatedAgentRuntime')(local),file=installed.native_binary;installed.release();renameSync(file,file+'.retained');
  let custody;
  try{await expect(api('openInstalledDedicatedAgentRuntime')(local)).rejects.toThrow();custody=await api('openOriginalDedicatedRuntimeCustody')(local);custody.guard();expect(custody).not.toHaveProperty('connection');expect(custody).not.toHaveProperty('native_binary');expect(existsSync(file)).toBe(false);}
  finally{custody?.release();renameSync(file+'.retained',file);}
 },60000);
 it('rejects same-byte material replacement through physical identity',async()=>{
  const installed=await api('openInstalledDedicatedAgentRuntime')(local),file=installed.native_binary;renameSync(file,file+'.retained');copyFileSync(file+'.retained',file);
  try{expect(()=>installed.guard()).toThrow();await expect(api('openInstalledDedicatedAgentRuntime')(local)).rejects.toThrow();}
  finally{installed.release();renameSync(file,file+'.replacement-retained');renameSync(file+'.retained',file);}
 });
 it('does not recreate an installation root whose protected placement still exists',async()=>{
  const installed=await api('openInstalledDedicatedAgentRuntime')(local),path=installed.root;installed.release();renameSync(path,path+'.retained');
  try{await expect(api('openInstalledDedicatedAgentRuntime')(local)).rejects.toThrow();await expect(api('installDedicatedAgentRuntime')(local,input())).rejects.toThrow();expect(existsSync(path)).toBe(false);}
  finally{renameSync(path+'.retained',path);}
 });
 it('refuses placement loss during the original Host1 await without recreating the anchor',async()=>{
  const file=join(local.location.dataDirectory,'dedicated-runtime-placement','original.json');
  interleave.afterOpen=()=>renameSync(file,file+'.retained');
  try{await expect(api('installDedicatedAgentRuntime')(local,input())).rejects.toThrow();expect(existsSync(file)).toBe(false);}
  finally{interleave.afterOpen=undefined;if(existsSync(file+'.retained'))renameSync(file+'.retained',file);}
 },60000);
 it('rejects an existing Windows short-name alias for an in-repository connection',async()=>{
  const file=join(local.location.repositoryPath,'connection.json');copyFileSync(input().connection_file,file);
  const script="$fso=New-Object -ComObject Scripting.FileSystemObject; [Console]::Out.Write($fso.GetFolder($env:CIMILOOP_TEST_DIRECTORY).ShortPath)";
  const short=execFileSync(join(process.env.SystemRoot??'C:/Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,CIMILOOP_TEST_DIRECTORY:local.location.repositoryPath}}).trim();
  expect(short.toLowerCase()).not.toBe(local.location.repositoryPath.toLowerCase());
  await expect(api('installDedicatedAgentRuntime')(local,{...input(),connection_file:join(short,'connection.json')})).rejects.toThrow();
 },60000);
 it('uses the compiled CLI to replay installation and inspect the original without injection',()=>{
  const file=join(root,'checks.json');writeFileSync(file,JSON.stringify(input().checks),{flag:'wx'});
  const run=(args:string[])=>spawnSync(process.execPath,[resolve('apps/cli/dist/bin.js'),'runtime',...args,'--json','--project-dir',local.location.repositoryPath],{encoding:'utf8',windowsHide:true,timeout:60000});
  const installed=run(['install-local-provider','--connection',input().connection_file,'--native-binary',input().native_binary,'--node-binary',input().node_binary,'--checks',file,'--placement-root',input().placement_root,'--yes']);
  expect(installed.status,installed.stderr).toBe(0);expect(JSON.parse(installed.stdout)).toMatchObject({created:false,model_dispatch_available:false});
  const observed=run(['local-provider-installation']);expect(observed.status,observed.stderr).toBe(0);expect(JSON.parse(observed.stdout)).toMatchObject({state:'installed',model:'openai-compatible/codex/gpt-6-luna',starts_run:false});
 },60000);
 it('reports the selected original over authenticated default workbench HTTP while full model admission stays closed',async()=>{
  const before=local.store.asOfEventSequence(),workbench=await startWorkbench({projectDir:local.location.repositoryPath});
  try{
   const login=await fetch(workbench.origin+'/api/session',{method:'POST',headers:{Origin:workbench.origin,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({bootstrap:new URL(workbench.bootstrapUrl).hash.slice(1)})});
   const response=await fetch(workbench.origin+'/api/context',{headers:{Cookie:login.headers.get('set-cookie')!.split(';')[0]!,Connection:'close'}});
   expect(response.status).toBe(200);expect(await response.json()).toMatchObject({selected_runtime:'local OpenAI-compatible',local_provider_runtime_installation:{state:'installed',model_dispatch_available:false}});
   await expect(app.productionAgentRuntime('PUBLIC no business Run',local)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE',details:{plan:'local OpenAI-compatible'}});
   expect(local.store.asOfEventSequence()).toBe(before);
  }finally{await workbench.close();}
 },60000);
});
