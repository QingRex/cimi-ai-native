import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {digest,initializeWindowsDedicatedAgentAccountLedger,type AgentWorkspaceToolScope,type DedicatedModelConnection} from '@cimiloop/runtime-adapter';
import * as app from '../src/index.js';
import {readHumanOriginalAgentRunInputs} from '../src/agent-runtime-control-local.js';
import {createAgentRunProject} from '../../../tests/fixtures/agent-run-project.js';

// Actual Windows protected installation/account and SQLite. PUBLIC policy and
// reserved bytes only: no credentials, network, model, invoice or S1 evidence.
describe.runIf(process.platform==='win32')('dedicated installation original account reader',()=>{
 let root:string,local:app.LocalProject,fixture:ReturnType<typeof createAgentRunProject>,scope:AgentWorkspaceToolScope,accountRoot:string,installationRoot:string,connection:DedicatedModelConnection;
 const open=()=>{const fn=Reflect.get(app,'openOriginalDedicatedAccount');expect(fn).toBeTypeOf('function');return fn;};
 beforeAll(async()=>{
  root=mkdtempSync(join(tmpdir(),'cimiloop-dedicated-account-originals-'));const project=join(root,'project');mkdirSync(project);fixture=createAgentRunProject(project);const run=fixture.reserveAgent(fixture.prepareAgent()).run;
  app.writeInstance(join(dirname(fixture.path),'instance.json'),{schema_version:'1.0.0',instance_id:fixture.project.instance_id,project_id:fixture.project.id,actor_id:fixture.actor.id,created_at:fixture.project.created_at});local=app.openLocalProject({projectDir:project});scope=readHumanOriginalAgentRunInputs(local,run.id).scope;
  const binary=join(root,'program.exe'),file=join(root,'connection.json');copyFileSync(join(process.env.SystemRoot??'C:/Windows','System32','whoami.exe'),binary);
  connection={format:'cimiloop/dedicated-model/2.0.0',provider:'openai-compatible',transport:'loopback_http/1.0.0',model:'openai-compatible/codex/gpt-6-luna',endpoint:'http://127.0.0.1:3425/v1/chat/completions',credential_file:join(root,'ABSENT-CREDENTIAL'),credential_digest:digest('PUBLIC absent credential')};writeFileSync(file,JSON.stringify(connection),{flag:'wx'});
  await app.installDedicatedAgentRuntime(local,{connection_file:file,native_binary:binary,node_binary:binary,placement_root:join(root,'runtime'),checks:[{check_id:'query_test',profile:'node_test',entry:'src/check.mjs',inputs:[{path:'src/check.mjs',expected_digest:'4'.repeat(64)}],max_elapsed_ms:4000,max_output_bytes:32768}]});
  const installed=await app.openInstalledDedicatedAgentRuntime(local);if(!installed)throw Error('Expected original installation');accountRoot=installed.account_root;installationRoot=installed.root;mkdirSync(dirname(accountRoot),{recursive:true});
  const policy={format:'cimiloop/dedicated-agent-account/1.0.0' as const,host_identity_digest:installed.origin.identityDigest,account_digest:digest(root+' PUBLIC account').value,approval_digest:digest('PUBLIC approval').value,package_digest:digest('PUBLIC package').value,tariff_digest:digest('PUBLIC tariff').value,admission_digest:digest('PUBLIC admission').value,connection_digest:digest(JSON.stringify(connection)).value,profile:{model:'codex/gpt-6-luna',thinking:'disabled' as const},cash_limit_micros:60,credit_limit_micro_units:0,cash_per_call_upper_micros:30,credit_per_call_upper_micro_units:0,input_token_limit:10000,output_token_limit:512};
  let account;
  try{account=await initializeWindowsDedicatedAgentAccountLedger({origin:installed.origin,root:accountRoot,repositoryPath:project,toolsRoot:installed.tools,connection,policy,admission:{async check(){}}});const body=Buffer.from('PUBLIC original request bytes');await account.reserve(scope,{scope_digest:digest(JSON.stringify(scope)).value,admission_digest:policy.admission_digest,connection_digest:policy.connection_digest,call_id:'model_0001',request_id:digest(root+' PUBLIC hold').value,request_digest:digest(body).value,input_bytes:body.length,max_output_tokens:512},body);}
  finally{account?.close();installed.release();}
 },120000);
 afterAll(()=>{local?.store.close();fixture?.store.close();});
 it('reads the original held funds and denies all new model admission without a credential',async()=>{
  const before=local.store.asOfEventSequence(),lease=await open()(local);if(!lease)throw Error('Expected original account');
  try{lease.guard();expect(lease.account.readRunCosts(scope)).toMatchObject({holds:1,unresolved:1,costs_reconciled:false});expect(lease.account.snapshot().cash_held_micros).toBe(30);await expect(lease.account.check(scope,connection)).rejects.toThrow();}
  finally{lease.release();lease.release();}expect(()=>lease.guard()).toThrow();expect(local.store.asOfEventSequence()).toBe(before);expect(existsSync(connection.credential_file)).toBe(false);
 },60000);
 it('uses the shared default Human costs entry for the exact original Run hold',async()=>{
  const before=local.store.asOfEventSequence(),service=new app.LocalHumanAgentAccountBilling(local,app.productionAgentCosts);
  expect(await service.query(scope.run_id)).toMatchObject({outcome:'observed',costs:{holds:1,unresolved:1,costs_reconciled:false},starts_run:false});expect(local.store.asOfEventSequence()).toBe(before);
 },60000);
 it.each(['original','production'] as const)('rejects %s account reads after its live connection original is replaced',async kind=>{
  const lease=kind==='original'?await open()(local):await app.productionAgentAccount(scope.run_id,local);if(!lease)throw Error('Expected original account');
  const metadata=join(installationRoot,'model-connection.json'),bytes=readFileSync(metadata),before=local.store.asOfEventSequence();
  renameSync(metadata,metadata+'.live-retained');writeFileSync(metadata,bytes,{flag:'wx'});
  try{expect(()=>lease.account.readRunCostOriginals(scope)).toThrow();expect(()=>lease.account.snapshot()).toThrow();expect(local.store.asOfEventSequence()).toBe(before);}
  finally{lease.release();renameSync(metadata,metadata+'.'+kind+'-replacement-retained');renameSync(metadata+'.live-retained',metadata);}
 },60000);
 it('retains account history after program loss while rejecting replaced connection originals',async()=>{
  const program=join(installationRoot,'opencode.exe'),metadata=join(installationRoot,'model-connection.json');renameSync(program,program+'.retained');let lease;
  try{await expect(app.openInstalledDedicatedAgentRuntime(local)).rejects.toThrow();lease=await open()(local);if(!lease)throw Error('Expected original account');expect(lease.account.readRunCosts(scope).holds).toBe(1);lease.release();lease=undefined;
   const bytes=readFileSync(metadata);renameSync(metadata,metadata+'.retained');writeFileSync(metadata,bytes,{flag:'wx'});
   try{await expect(open()(local)).rejects.toThrow();}finally{renameSync(metadata,metadata+'.replacement-retained');renameSync(metadata+'.retained',metadata);}
  }finally{lease?.release();renameSync(program+'.retained',program);}
 },60000);
 it('does not recreate a missing registered account or discard its original Host ticket',async()=>{
  const file=join(accountRoot,'account.sqlite');renameSync(file,file+'.retained');
  try{await expect(open()(local)).rejects.toThrow();expect(existsSync(file)).toBe(false);}finally{renameSync(file+'.retained',file);}
 },60000);
});
