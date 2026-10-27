import {LocalProjectError} from '../src/errors.js';
import {CimiLoopKernel} from '@cimiloop/kernel';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { digest, initializeWindowsAgentStartLedger, initializeWindowsDedicatedAgentAccountLedger } from '@cimiloop/runtime-adapter';
import { openLocalProject, writeInstance, LocalHumanAgentRuntimeStart, LocalAgentRuntimeComposition, productionAgentRuntime } from '../src/index.js';
import { inspectProductionRuntime, openInstalledProductionRuntime, productionRuntimeLayout, writeProductionCheckCatalog } from '../src/agent-production-admission-local.js';
import { readHumanOriginalAgentRunInputs } from '../src/agent-runtime-control-local.js';
import { claimAgentRuntimeOperation } from '../../runtime-adapter/src/agent-runtime-operation.js';
import { createAgentRunProject } from '../../../tests/fixtures/agent-run-project.js';
import { flowSuccess } from '../../../tests/fixtures/flow-project.js';
// Actual Kernel/store. Controlled staging/launch are not Native/model/Skill evidence.
describe('owned original Human startup', () => {
 let root:string, f:ReturnType<typeof createAgentRunProject>, local:ReturnType<typeof openLocalProject>, runId:string;
 beforeEach(() => {root=mkdtempSync(join(tmpdir(),'cimiloop-owned-start-')); f=createAgentRunProject(root); runId=f.reserveAgent(f.prepareAgent()).run.id;
  writeInstance(join(dirname(f.path),'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});local=openLocalProject({projectDir:root});},120000);
 afterEach(() => {local?.store.close();f?.store.close();if(root){if(dirname(resolve(root))!==resolve(tmpdir())||!basename(root).startsWith('cimiloop-owned-start-'))throw Error('Unsafe cleanup');rmSync(root,{recursive:true,force:true});}});
 const result=()=>({ok:true as const,run_id:runId,outcome:'original' as const,completion_proven:false as const,operation_id:'controlled'});
 const runtime=()=>{const r=Object.create(LocalAgentRuntimeComposition.prototype) as LocalAgentRuntimeComposition;r.originalScope=()=>readHumanOriginalAgentRunInputs(local,runId).scope;r.start=vi.fn(async()=>result());return r;};
 const revoke=()=>{for(const a of f.store.listAssignments(f.actor.id).filter(a=>a.role_key==='technical_owner'&&!a.ended_at))flowSuccess(f.humanKernel.execute(f.projectCommand('EndAssignment',{assignment_id:a.id,expected_assignment_revision:a.revision,reason:'Revoke controlled startup'})));};
 const replacementKernel=()=>new CimiLoopKernel({store:local.store,caller:{kind:'local_operator',project_id:local.instance.project_id,actor_id:local.instance.actor_id}});
 it('refuses non-void request guards before staging without running arbitrary thenables',async()=>{
  const factory=vi.fn(()=>runtime()),service=new LocalHumanAgentRuntimeStart(local,factory);let assimilations=0;
  for(const guard of [()=>false,()=>Promise.resolve(),()=>Promise.reject(Error('PUBLIC rejected guard')),()=>({then(){assimilations++;}})]){
   await expect(service.start(runId,guard)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});
  }
  await new Promise<void>(resolve=>setImmediate(resolve));expect(factory).not.toHaveBeenCalled();expect(assimilations).toBe(0);
 });
 it.each(['start','control'] as const)('cannot replace the private Human authorization helper for %s',async action=>{
  const kernel=local.kernel,permission=action==='start'?kernel.authorizeAgentRunStart(runId):kernel.authorizeAgentRunControl(runId),factory=vi.fn(()=>runtime()),service=new LocalHumanAgentRuntimeStart(local,factory);revoke();Reflect.set(kernel,'authorizeAgentRunHuman',()=>structuredClone(permission));
  if(action==='start')await expect(service.start(runId)).rejects.toMatchObject({code:'ROLE_NOT_ASSIGNED'});else expect(kernel.authorizeAgentRunControl(runId)).toMatchObject({code:'ROLE_NOT_ASSIGNED'});expect(factory).not.toHaveBeenCalled();
 });
 it.each(['method','kernel'] as const)('rejects %s replacement after Human revocation at every startup boundary',async kind=>{
  // Use a new fixture per case: each row below is a separate startup attempt,
  // not a retry after a dispatched Run or a manufactured current permission.
  const permission=local.kernel.authorizeAgentRunStart(runId),originalKernel=local.kernel,r=runtime(),release=vi.fn();let dispatches=0;
  const change=()=>{revoke();const replacement=kind==='method'?originalKernel:replacementKernel();Reflect.set(replacement,'authorizeAgentRunStart',()=>structuredClone(permission));if(kind==='kernel')local.kernel=replacement;};
  const service=new LocalHumanAgentRuntimeStart(local,async()=>{await Promise.resolve();change();return{runtime:r,release};});
  r.start=vi.fn(async(_id,guard)=>{guard?.();dispatches++;return result();});
  await expect(service.start(runId)).rejects.toMatchObject({code:'INPUT_CHANGED'});expect(release).toHaveBeenCalledTimes(1);expect(dispatches).toBe(0);expect(r.start).not.toHaveBeenCalled();
 });
 it.each(['method','kernel'] as const)('rejects %s replacement between service construction and a request',async kind=>{
  const permission=local.kernel.authorizeAgentRunStart(runId),originalKernel=local.kernel,factory=vi.fn(()=>runtime()),service=new LocalHumanAgentRuntimeStart(local,factory);revoke();
  const replacement=kind==='method'?originalKernel:replacementKernel();Reflect.set(replacement,'authorizeAgentRunStart',()=>structuredClone(permission));if(kind==='kernel')local.kernel=replacement;
  await expect(service.start(runId)).rejects.toMatchObject({code:'INPUT_CHANGED'});expect(factory).not.toHaveBeenCalled();
 });
 it.each(['method','kernel'] as const)('rejects %s replacement inside the final Native guard without a launch',async kind=>{
  const permission=local.kernel.authorizeAgentRunStart(runId),originalKernel=local.kernel,r=runtime(),release=vi.fn();let launches=0;
  r.start=vi.fn(async(_id,guard)=>{revoke();const replacement=kind==='method'?originalKernel:replacementKernel();Reflect.set(replacement,'authorizeAgentRunStart',()=>structuredClone(permission));if(kind==='kernel')local.kernel=replacement;guard?.();launches++;return result();});
  await expect(new LocalHumanAgentRuntimeStart(local,()=>({runtime:r,release})).start(runId)).rejects.toMatchObject({code:'INPUT_CHANGED'});expect(launches).toBe(0);expect(release).toHaveBeenCalledTimes(1);
 });
 it.each(['method','kernel'] as const)('retains the original startup but refuses stale Human permission after release-time %s replacement',async kind=>{
  const permission=local.kernel.authorizeAgentRunStart(runId),originalKernel=local.kernel,r=runtime(),release=vi.fn(async()=>{await Promise.resolve();revoke();const replacement=kind==='method'?originalKernel:replacementKernel();Reflect.set(replacement,'authorizeAgentRunStart',()=>structuredClone(permission));if(kind==='kernel')local.kernel=replacement;});
  await expect(new LocalHumanAgentRuntimeStart(local,()=>({runtime:r,release})).start(runId)).rejects.toMatchObject({code:'INPUT_CHANGED'});expect(r.start).toHaveBeenCalledTimes(1);expect(release).toHaveBeenCalledTimes(1);expect(f.store.listRuns(f.change.id)).toHaveLength(1);
 });
 it('awaits a bound lease release once after startup',async()=>{const r=runtime(),seen:string[]=[],owner={runtime:r,release:vi.fn(async function(this:{runtime:LocalAgentRuntimeComposition}){expect(this.runtime).toBe(r);seen.push('release');await Promise.resolve();seen.push('released');})},sequence=f.store.asOfEventSequence();expect(await new LocalHumanAgentRuntimeStart(local,()=>owner as any).start(runId)).toEqual(result());expect(owner.release).toHaveBeenCalledTimes(1);expect(seen).toEqual(['release','released']);expect(r.start).toHaveBeenCalledTimes(1);expect(f.store.asOfEventSequence()).toBe(sequence);});
 it('releases a foreign staged composition before any start',async()=>{const r=runtime();r.originalScope=()=>({...readHumanOriginalAgentRunInputs(local,runId).scope,project_id:'foreign'});const release=vi.fn();await expect(new LocalHumanAgentRuntimeStart(local,()=>({runtime:r,release}) as any).start(runId)).rejects.toMatchObject({code:'CALLER_IDENTITY_MISMATCH'});expect(release).toHaveBeenCalledTimes(1);expect(r.start).not.toHaveBeenCalled();});
 it('releases an awaited lease after Human revocation',async()=>{const r=runtime(),release=vi.fn();let done!:(v:any)=>void;const waiting=new LocalHumanAgentRuntimeStart(local,()=>new Promise<any>(resolve=>{done=resolve;})).start(runId);revoke();done({runtime:r,release});await expect(waiting).rejects.toMatchObject({code:'ROLE_NOT_ASSIGNED'});expect(release).toHaveBeenCalledTimes(1);expect(r.start).not.toHaveBeenCalled();});
 it('sanitizes startup errors while releasing once',async()=>{const r=runtime(),release=vi.fn();r.start=vi.fn(async()=>{throw Error('private_runtime_secret');});const error=await new LocalHumanAgentRuntimeStart(local,()=>({runtime:r,release}) as any).start(runId).catch(e=>e);expect(error).toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(error.message).not.toContain('private_runtime_secret');expect(release).toHaveBeenCalledTimes(1);});
 it('names the chosen Codex admission gaps without replacing them with a generic factory error',async()=>{await expect(new LocalHumanAgentRuntimeStart(local,productionAgentRuntime).start(runId)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE',message:expect.stringContaining('现有 Codex 登录'),details:{production_admission:'unapproved',plan:'Codex login',missing:['Codex 原安装','Codex Context 前完整准入']}});});
 it('keeps a historical HTTP installation readable without using it for new execution',async()=>{
  const layout=productionRuntimeLayout(local),projectId=local.store.getProject()!.id,parent=join(process.env.LOCALAPPDATA!,'CimiLoop','accounts'),credential=join(parent,`${projectId}.credential.dpapi.json`);
  mkdirSync(parent,{recursive:true});mkdirSync(join(layout.startRoot,'..'),{recursive:true});mkdirSync(join(root,'src'),{recursive:true});
  const harness='export const query = () => 1;\n';writeFileSync(join(root,'src','check.mjs'),harness);
  const connection={format:'cimiloop/dedicated-model/1.0.0' as const,provider:'openai-compatible' as const,model:'openai-compatible/grok-4',endpoint:'https://api.x.ai/v1/chat/completions',credential_file:credential,credential_digest:digest('public-fixture-not-a-key')};
  writeFileSync(layout.connectionPath,JSON.stringify(connection),{flag:'wx'});writeFileSync(credential,Buffer.from('public fixture placeholder'));
  writeProductionCheckCatalog(local,[{check_id:'query_test',profile:'node_test',entry:'src/check.mjs',inputs:[{path:'src/check.mjs',expected_digest:digest(harness).value}],max_elapsed_ms:1000,max_output_bytes:4096}]);
  let ledger:Awaited<ReturnType<typeof initializeWindowsAgentStartLedger>>|undefined,account:Awaited<ReturnType<typeof initializeWindowsDedicatedAgentAccountLedger>>|undefined;
  try{
   ledger=await initializeWindowsAgentStartLedger(layout.startRoot,layout.toolsRoot);
   account=await initializeWindowsDedicatedAgentAccountLedger({origin:ledger,repositoryPath:root,root:layout.accountRoot,toolsRoot:layout.toolsRoot,connection,admission:{check:async()=>{throw Error('PUBLIC historical account cannot authorize a call');}},policy:{format:'cimiloop/dedicated-agent-account/1.0.0',host_identity_digest:ledger.identityDigest,account_digest:digest('public fixture account').value,approval_digest:digest('public fixture approval').value,package_digest:digest('public fixture package').value,tariff_digest:digest('public fixture tariff').value,admission_digest:digest('public fixture admission').value,connection_digest:digest(JSON.stringify(connection)).value,profile:{model:'grok-4',thinking:'disabled'},cash_limit_micros:60,credit_limit_micro_units:0,cash_per_call_upper_micros:30,credit_per_call_upper_micro_units:0,input_token_limit:1000000,output_token_limit:512}});
   account.close();account=undefined;ledger.close();ledger=undefined;
   const gaps=await inspectProductionRuntime(local),error=await Promise.resolve(productionAgentRuntime(runId,local)).then(()=>{throw Error('paid path opened');},(caught:unknown)=>caught);
   expect(error).toMatchObject({code:'CAPABILITY_UNAVAILABLE',details:{production_admission:'unapproved',plan:'Codex login',missing:['Codex 原安装','Codex Context 前完整准入']}});
   expect((error as {message:string}).message).toContain('未读取登录凭据');expect((error as {message:string}).message).toContain('未发送模型请求');
   expect(gaps.filter(item=>item!=='固定 Runtime 二进制')).toEqual([]);
   await expect(openInstalledProductionRuntime(runId,local)).rejects.toMatchObject({details:{plan:'Codex login',missing:['Codex 原安装','Codex Context 前完整准入']}});
  }finally{
   try{account?.close();}catch{/* already closed */}
   try{ledger?.close();}catch{/* already closed */}
   for(const name of [projectId,`${projectId}.credential.dpapi.json`]){const target=join(parent,name);if(resolve(target).startsWith(resolve(parent)+sep)){try{rmSync(target,{recursive:true,force:true});}catch{/* Windows custody may retain this new fixture. */}}}
  }
 },180000);
 it('sanitizes factory and release errors without a second dispatch',async()=>{await expect(new LocalHumanAgentRuntimeStart(local,()=>{throw Error('private_factory_secret');}).start(runId)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});const r=runtime(),release=vi.fn(async()=>{throw Error('private_release_secret');});const error=await new LocalHumanAgentRuntimeStart(local,()=>({runtime:r,release}) as any).start(runId).catch(e=>e);expect(error).toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(error.message).not.toContain('private_release_secret');expect(r.start).toHaveBeenCalledTimes(1);expect(release).toHaveBeenCalledTimes(1);});
 it('checks the request after factory and release waits and before Native effects',async()=>{const r=runtime(),release=vi.fn(),guard=vi.fn();let blocked=false;guard.mockImplementation(()=>{if(blocked)throw {http:'expired'};});await expect((new LocalHumanAgentRuntimeStart(local,()=>{blocked=true;return {runtime:r,release} as any;}).start as any)(runId,guard)).rejects.toEqual({http:'expired'});expect(release).toHaveBeenCalledTimes(1);expect(r.start).not.toHaveBeenCalled();blocked=false;const r2=runtime(),release2=vi.fn(async()=>{blocked=true;});r2.start=vi.fn(async(_id,check)=>{expect(check).toBeTypeOf('function');check!();return result();});await expect((new LocalHumanAgentRuntimeStart(local,()=>({runtime:r2,release:release2}) as any).start as any)(runId,guard)).rejects.toEqual({http:'expired'});expect(release2).toHaveBeenCalledTimes(1);});
 it('rejects a lease without release before effects',async()=>{const r=runtime();await expect(new LocalHumanAgentRuntimeStart(local,()=>({runtime:r}) as any).start(runId)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(r.start).not.toHaveBeenCalled();});
 it('replays original identity without factory, effects or bypassing current Human permission',async()=>{const scope=readHumanOriginalAgentRunInputs(local,runId).scope,claim=claimAgentRuntimeOperation(local.location.dataDirectory,scope,{controlled:true},{pid:1234,creation_ticks:'123456',image:process.execPath}),factory=vi.fn(()=>runtime()),sequence=f.store.asOfEventSequence(),expected={ok:true,run_id:runId,outcome:'original',completion_proven:false,operation_id:claim.operationId};expect(await new LocalHumanAgentRuntimeStart(local).start(runId)).toEqual(expected);expect(await new LocalHumanAgentRuntimeStart(local,factory).start(runId)).toEqual(expected);expect(factory).not.toHaveBeenCalled();expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.store.listRuns(f.change.id)).toHaveLength(1);revoke();await expect(new LocalHumanAgentRuntimeStart(local).start(runId)).rejects.toMatchObject({code:'ROLE_NOT_ASSIGNED'});});
 it('keeps partial dispatch Unknown without factory, repair or restart',async()=>{const scope=readHumanOriginalAgentRunInputs(local,runId).scope;mkdirSync(join(local.location.dataDirectory,'agent-runtime-starts',scope.project_id,runId),{recursive:true});const factory=vi.fn(()=>runtime());expect(await new LocalHumanAgentRuntimeStart(local,factory).start(runId)).toMatchObject({outcome:'unknown',completion_proven:false,reason:'agent_original_start_unproven'});expect(factory).not.toHaveBeenCalled();expect(f.store.listRuns(f.change.id)).toHaveLength(1);});
 it('checks Human revocation after an awaited factory rejection',async()=>{let reject!:(error:unknown)=>void;const waiting=new LocalHumanAgentRuntimeStart(local,()=>new Promise<any>((_done,fail)=>{reject=fail;})).start(runId);revoke();reject(Error('private_factory_secret'));await expect(waiting).rejects.toMatchObject({code:'ROLE_NOT_ASSIGNED'});});
 it('sanitizes a scope exception from a staged composition and releases once',async()=>{const r=runtime(),release=vi.fn();r.originalScope=()=>{throw new LocalProjectError('private_scope_secret','CAPABILITY_UNAVAILABLE','conflict');};const error=await new LocalHumanAgentRuntimeStart(local,()=>({runtime:r,release}) as any).start(runId).catch(e=>e);expect(error).toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(error.message).not.toContain('private_scope_secret');expect(release).toHaveBeenCalledTimes(1);expect(r.start).not.toHaveBeenCalled();});
});
