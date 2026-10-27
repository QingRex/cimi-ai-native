import {mkdtempSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {describe,it,expect,vi} from 'vitest';import {AgentStartLedger,digest,CodexAgentUsageBudget} from '@cimiloop/runtime-adapter';
import * as app from '../src/index.js';
import {createIntentProject} from '../../../tests/fixtures/intent-project.js';
const hash=(s:string)=>digest(s).value;
// Actual Kernel/store and protected-ledger algorithms with PUBLIC source leases.
// No Native/model/login/volume qualification or S1 acceptance is claimed.
describe('explicit contained Matt Runtime attachment',()=>{
 function fixture(){const root=mkdtempSync(join(tmpdir(),'cimi-matt-contained-')),project=join(root,'project'),f=createIntentProject(project,{databasePath:join(project,'.cimiloop','project.db')});
  app.writeInstance(join(project,'.cimiloop','instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});const local=app.openLocalProject({projectDir:project}),origin=AgentStartLedger.initialize(join(root,'definition-host'),{machine_digest:hash('PUBLIC machine'),principal_digest:hash('PUBLIC principal')}),release=vi.fn();
  const definition:app.InstalledCodexMatt={origin,root:join(root,'definition'),model:'gpt-6-luna',account_digest:hash('PUBLIC account'),source_digest:hash('PUBLIC source'),installation_digest:hash('PUBLIC definition install'),guard(){},release,readOriginalSync(){return null;},readMethodSource(){throw Error('PUBLIC unavailable source must not be read');},readExecutionControls(){throw Error('PUBLIC control unavailable');},host:{async invoke(){throw Error('PUBLIC must not invoke');},async readOriginal(){return null;},verifyOriginal(){throw Error('PUBLIC original unavailable');}}};
  const activate=Reflect.get(app,'installCodexMattRuntime');expect(activate).toBeTypeOf('function');
  return{root,local,origin,definition,activate,release,close(){origin.close();local.store.close();f.store.close();}};
 }
 it('does not create an attachment or account when the fixed Matt source is absent',async()=>{
  const f=fixture(),account=vi.fn();try{await expect(f.activate(f.local,{async openDefinition(){return undefined;},openAccount:account})).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(account).not.toHaveBeenCalled();expect(f.origin.listExclusive('codex_matt_runtime_attachment')).toHaveLength(0);}finally{f.close();}
 });
 it('retains legacy originals and releases their lease when the existing shared account is unavailable',async()=>{
  const f=fixture();try{await expect(f.activate(f.local,{async openDefinition(){return f.definition;},async openAccount(){return undefined;}})).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(f.release).toHaveBeenCalledTimes(1);expect(f.origin.listExclusive('codex_matt_runtime_attachment')).toHaveLength(0);expect(existsSync(join(f.local.location.dataDirectory,'matt-runtime-originals'))).toBe(false);}finally{f.close();}
 });
 it('refuses a different model/account before storage or program assembly',async()=>{
  const f=fixture(),release=vi.fn(),storage=vi.fn();const installation:app.InstalledCodexAgentRuntime={origin:f.origin,root:f.root,binary:process.execPath,native_binary:process.execPath,node_binary:process.execPath,model:'other',account_digest:f.definition.account_digest,quota_account_digest:hash('PUBLIC quota'),output_profile:'bounded_2048/1.0.0',usage_policy:'require_ordinary_permission/1.0.0',disabled_mcp_servers:[],checks:[],installation_digest:hash('PUBLIC runtime install'),guard(){},release(){}};
  try{await expect(f.activate(f.local,{async openDefinition(){return f.definition;},async openAccount(){return{installation,budget:CodexAgentUsageBudget.initialize(f.origin,{account_digest:installation.account_digest,quota_account_digest:installation.quota_account_digest,model_calls:2,output_tokens:4096}),root:f.root,guard(){},release};},openStorage:storage})).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(storage).not.toHaveBeenCalled();expect(release).toHaveBeenCalledTimes(1);expect(f.release).toHaveBeenCalledTimes(1);expect(f.origin.listExclusive('codex_matt_runtime_attachment')).toHaveLength(0);}finally{f.close();}
 });
 it('rechecks the original Human after awaited source opening',async()=>{
  const f=fixture(),actor=f.local.instance.actor_id,account=vi.fn();try{await expect(f.activate(f.local,{async openDefinition(){f.local.instance.actor_id='PUBLIC-replaced';return f.definition;},openAccount:account})).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(account).not.toHaveBeenCalled();expect(f.release).toHaveBeenCalledTimes(1);}finally{f.local.instance.actor_id=actor;f.close();}
 });
});
