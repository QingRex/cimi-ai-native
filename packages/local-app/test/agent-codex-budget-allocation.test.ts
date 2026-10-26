import {copyFileSync,existsSync,mkdirSync,mkdtempSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {createInternalId} from '@cimiloop/protocol/v2';
import {AgentStartLedger} from '@cimiloop/runtime-adapter';
import * as app from '../src/index.js';
import {codexUsageBudgetWritablePaths} from '../src/agent-codex-usage-budget-local.js';
import {codexRuntimeInstallationWritablePaths} from '../src/agent-codex-installation-local.js';
import {createIntentProject} from '../../../tests/fixtures/intent-project.js';

const volume=vi.hoisted(()=>({deny:false,paths:[] as string[],afterOpen:undefined as (()=>void)|undefined}));
vi.mock('../src/agent-codex-storage-local.js',async load=>({...await load<typeof import('../src/agent-codex-storage-local.js')>(),async openCodexRuntimeStorage(_local:unknown,installed:app.InstalledCodexAgentRuntime){volume.afterOpen?.();return {PUBLIC:'volume projection only',identity:installed.origin.identityDigest};}}));
vi.mock('@cimiloop/runtime-adapter',async load=>({...await load<typeof import('@cimiloop/runtime-adapter')>(),assertFixedVolumeRuntimePaths(storage:{identity:string},_scope:unknown,paths:string[]){volume.paths=[...paths];if(volume.deny)throw Error('PUBLIC volume mismatch');return {runtime_ticket:{identity_digest:storage.identity}};}}));

// Real protected Windows Host1 accounts and SQLite/Kernel. Only the physical
// quota observation and installed executables/login are PUBLIC fixtures. This
// does not exercise a real VHD, model, provider qualification or S1 acceptance.
describe.runIf(process.platform==='win32')('installed finite Codex capacity allocation',()=>{
 let root:string,prior:string|undefined;const locals:app.LocalProject[]=[],fixtures:ReturnType<typeof createIntentProject>[]=[];
 beforeAll(()=>{root=mkdtempSync(join(tmpdir(),'cimiloop-budget-allocation-'));prior=process.env.LOCALAPPDATA;process.env.LOCALAPPDATA=join(root,'local-data');mkdirSync(join(root,'binaries'));for(const name of ['codex.exe','codex-code-mode-host.exe','opencode.exe','node.exe'])copyFileSync(join(process.env.SystemRoot??'C:/Windows','System32','whoami.exe'),join(root,'binaries',name));});
 afterAll(()=>{for(const local of locals)local.store.close();for(const fixture of fixtures)fixture.store.close();if(prior===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=prior;});
 async function project(account='1'){
  volume.deny=false;volume.afterOpen=undefined;const path=mkdtempSync(join(root,'project-')),f=createIntentProject(path,{databasePath:join(path,'.cimiloop','project.db')});fixtures.push(f);
  app.writeInstance(join(path,'.cimiloop','instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});const local=app.openLocalProject({projectDir:path});locals.push(local);
  await app.installCodexAgentRuntime(local,{binary:join(root,'binaries','codex.exe'),native_binary:join(root,'binaries','opencode.exe'),node_binary:join(root,'binaries','node.exe'),model:'gpt-6-luna',checks:[{check_id:'query_test',profile:'node_test',entry:'src/check.mjs',inputs:[{path:'src/check.mjs',expected_digest:'4'.repeat(64)}],max_elapsed_ms:4000,max_output_bytes:32768}]},{async inspectLogin(){return {account_digest:account.repeat(64),quota_snapshot:{format:'cimiloop/codex-ordinary-quota/1.0.0' as const,ordinary_usage_allowed:true,account_id_digest:'2'.repeat(64),primary:null,secondary:null,credits:null}};}});return local;
 }
 const allocate=(local:app.LocalProject,request:unknown)=>{const method=Reflect.get(app,'allocateCodexUsageBudget');expect(method).toBeTypeOf('function');return Reflect.apply(method,undefined,[local,request]) as Promise<any>;};
 const request=(source:app.LocalProject)=>({source_project_dir:source.location.repositoryPath,request_id:createInternalId(),model_calls:1,output_tokens:2048});
 it('allocates once, exposes only local writable roots, and replays without opening the source account',async()=>{
  const source=await project('3'),target=await project('3');await app.installCodexUsageBudget(source,{model_calls:2,output_tokens:4096});const q=request(source),before=target.store.asOfEventSequence();
  expect(await allocate(target,q)).toMatchObject({created:true,limits:{model_calls:1,output_tokens:2048},starts_run:false,costs_reconciled:false});expect(target.store.asOfEventSequence()).toBe(before);
  const parent=await app.openInstalledCodexUsageBudget(source);if(!parent)throw Error('Expected source');expect(parent.budget.snapshot().held).toEqual({model_calls:1,output_tokens:2048});const original=parent.root;parent.release();
  const child=await app.openInstalledCodexUsageBudget(target);if(!child)throw Error('Expected child');expect(child.budget.snapshot().held.model_calls).toBe(0);expect(codexUsageBudgetWritablePaths(child)).toEqual([child.root,join(codexRuntimeInstallationWritablePaths(child.installation)[1]!,'usage')]);expect(volume.paths).toContain(child.root);expect(()=>codexUsageBudgetWritablePaths({...child})).toThrow();child.release();
  renameSync(original,original+'.retained-original');expect(await allocate(target,q)).toMatchObject({created:false});const reopened=await app.openInstalledCodexUsageBudget(target);if(!reopened)throw Error('Expected reopened child');reopened.guard();reopened.release();expect(existsSync(original)).toBe(false);
  await expect(app.installCodexUsageBudget(target,{model_calls:1,output_tokens:2048})).rejects.toThrow();await expect(allocate(target,{...q,request_id:createInternalId()})).rejects.toThrow();
 },240000);
 it('recovers an attachment response failure by funding the same original, without a second source reservation',async()=>{
  const source=await project('4'),target=await project('4');await app.installCodexUsageBudget(source,{model_calls:1,output_tokens:2048});const q=request(source),original=AgentStartLedger.prototype.claimExclusiveOnce;
  const crash=vi.spyOn(AgentStartLedger.prototype,'claimExclusiveOnce').mockImplementation(function(this:AgentStartLedger,namespace,id,basis){if(namespace==='codex_usage_account'&&(basis as {format?:string})?.format==='cimiloop/codex-usage-account-attachment/2.0.0')throw Error('PUBLIC interruption after funding');return original.call(this,namespace,id,basis);});
  try{await expect(allocate(target,q)).rejects.toThrow();}finally{crash.mockRestore();}
  await expect(app.openInstalledCodexUsageBudget(target)).rejects.toThrow();expect(await allocate(target,q)).toMatchObject({created:true});const parent=await app.openInstalledCodexUsageBudget(source);if(!parent)throw Error('Expected source');expect(parent.budget.snapshot().held.model_calls).toBe(1);expect(parent.budget.snapshot().reservations).toHaveLength(1);parent.release();
 },240000);
 it('keeps an exhausted, unfunded original and never recreates its missing destination on replay',async()=>{
  const source=await project('5'),first=await project('5'),second=await project('5');await app.installCodexUsageBudget(source,{model_calls:1,output_tokens:2048});await allocate(first,request(source));const q=request(source);await expect(allocate(second,q)).rejects.toThrow();
  const installed=await app.openInstalledCodexAgentRuntime(second);if(!installed)throw Error('Expected installation');const intents=installed.origin.listExclusive('codex_usage_allocation_intent');expect(intents).toHaveLength(1);const path=(intents[0]!.basis as {root:string}).root;installed.release();expect(existsSync(path)).toBe(true);await expect(app.openInstalledCodexUsageBudget(second)).rejects.toThrow();renameSync(path,path+'.retained-original');await expect(allocate(second,q)).rejects.toThrow();expect(existsSync(path)).toBe(false);
 },240000);
 it('rejects a changed Kernel authority or off-volume roots before consuming source capacity',async()=>{
  const source=await project('6'),target=await project('6');await app.installCodexUsageBudget(source,{model_calls:2,output_tokens:4096});const q=request(source);volume.deny=true;await expect(allocate(target,q)).rejects.toThrow();volume.deny=false;
  const original=target.kernel.authorizeProviderProbeControl;volume.afterOpen=()=>{target.kernel.authorizeProviderProbeControl=original.bind(target.kernel);};try{await expect(allocate(target,q)).rejects.toThrow();}finally{target.kernel.authorizeProviderProbeControl=original;volume.afterOpen=undefined;}
  const parent=await app.openInstalledCodexUsageBudget(source);if(!parent)throw Error('Expected source');expect(parent.budget.snapshot().held.model_calls).toBe(0);parent.release();
 },240000);
});
