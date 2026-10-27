import {copyFileSync,mkdirSync,mkdtempSync,renameSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {createInternalId} from '@cimiloop/protocol/v2';
import {digest} from '@cimiloop/runtime-adapter';
import * as app from '../src/index.js';
import {readHumanOriginalAgentRunInputs} from '../src/agent-runtime-control-local.js';
import {createSkillInvocationProject} from '../../../tests/fixtures/skill-invocation-project.js';
import {flowTime} from '../../../tests/fixtures/flow-project.js';

// Real Windows protected installation/Host1, Kernel and immutable child custody.
// PUBLIC executable/login and resource ports: no Native or model is launched.
describe.runIf(process.platform==='win32')('original Skill control after execution installation loss',()=>{
 let f:ReturnType<typeof createSkillInvocationProject>,local:app.LocalProject,prior:string|undefined,root:string,installedRoot:string;
 let child:ReturnType<ReturnType<typeof createSkillInvocationProject>['reserveSkill']>['invocation'];
 const query=vi.fn(async()=>({status:'PUBLIC original resource projection'})),cancel=vi.fn(()=>({requested:true,stopped_proven:false})),recover=vi.fn(async()=>({outcome:'unknown',resources_disposed:false}));
 beforeAll(async()=>{
  root=mkdtempSync(join(tmpdir(),'cimi-custody-recovery-'));prior=process.env.LOCALAPPDATA;process.env.LOCALAPPDATA=join(root,'user-data');
  const project=join(root,'project');mkdirSync(project);f=createSkillInvocationProject(project);const data=dirname(f.path);
  const instance={schema_version:'1.0.0' as const,instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:flowTime};app.writeInstance(join(data,'instance.json'),instance);
  local={store:f.store,kernel:f.humanKernel,instance,location:{repositoryKind:'git',repositoryPath:project,dataDirectory:data,databasePath:f.path,instancePath:join(data,'instance.json'),suggestedName:'PUBLIC original custody'}} as unknown as app.LocalProject;
  const binaries=join(root,'binaries');mkdirSync(binaries);for(const name of ['codex.exe','codex-code-mode-host.exe','opencode.exe','node.exe'])copyFileSync(join(process.env.SystemRoot!,'System32','whoami.exe'),join(binaries,name));
  await app.installCodexAgentRuntime(local,{binary:join(binaries,'codex.exe'),native_binary:join(binaries,'opencode.exe'),node_binary:join(binaries,'node.exe'),model:'gpt-6-luna',checks:[{check_id:'query_test',profile:'node_test',entry:'src/check.mjs',inputs:[{path:'src/check.mjs',expected_digest:'4'.repeat(64)}],max_elapsed_ms:4000,max_output_bytes:32768}]},{async inspectLogin(){return{account_digest:'1'.repeat(64),quota_snapshot:{format:'cimiloop/codex-ordinary-quota/1.0.0',ordinary_usage_allowed:true,account_id_digest:'2'.repeat(64),primary:null,secondary:null,credits:null}};}});
  const installed=await app.openInstalledCodexAgentRuntime(local);if(!installed)throw Error('Expected original installation');
  try{
   installedRoot=installed.root;const custody=new app.LocalSkillInvocationStartCustody(project,data,installed.origin),prepare=f.runPort.agent.skills!.prepare.bind(f.runPort.agent.skills);
   f.runPort.agent.skills!.prepare=(p,r,c,b,i)=>custody.bindPreparation(p,r,c,b,i,prepare(p,r,c,b,i));child=f.reserveSkill().invocation;
   const parent=readHumanOriginalAgentRunInputs(local,child.run_ref.id);custody.claim(f.project,child,parent.scope,parent.record.id,digest('PUBLIC original staged child').value,()=>{});
  }finally{installed.release();}
  for(const name of ['codex.exe','codex-code-mode-host.exe','opencode.exe','node.exe','checks.json'])renameSync(join(installedRoot,name),join(installedRoot,name+'.retained-custody-test'));
 },120000);
 afterAll(()=>{f?.store.close();if(prior===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=prior;});
 it('keeps default original query, cancellation and recovery usable without reopening a complete execution installation',async()=>{
  await expect(app.openInstalledCodexAgentRuntime(local)).rejects.toThrow();const control=new app.LocalHumanSkillInvocationControl(local,undefined,{query,requestCancellation:cancel,recover,collect:vi.fn()}),before=f.store.asOfEventSequence();
  expect(await control.query(child.id)).toMatchObject({invocation_id:child.id,operation:{outcome:'observed',result:{status:'PUBLIC original resource projection'}}});
  const command={command_id:createInternalId(),requested_at:flowTime,acting_role:'technical_owner',command_type:'CancelRun',target:{object_type:'run',id:child.run_ref.id},expected_revision:f.currentRun().revision,payload:{reason:'PUBLIC stop original after material loss'}};
  const first=await control.stop(child.id,command),replay=await control.stop(child.id,command);if('code'in first||'code'in replay)throw Error('Expected original cancellation receipt');expect(first).toMatchObject({operation:{outcome:'observed',result:{requested:true}},family:{resources_disposed:false}});expect(replay.command_result).toEqual(first.command_result);
  expect(await control.recover(child.id)).toMatchObject({operation:{outcome:'observed',result:{outcome:'unknown',resources_disposed:false}}});
  expect(query).toHaveBeenCalledTimes(1);expect(cancel).toHaveBeenCalledTimes(2);expect(recover).toHaveBeenCalledTimes(1);expect(f.store.asOfEventSequence()).toBe(before+1);expect(f.store.listRuns(f.change.id)).toHaveLength(1);expect(f.task().usage.pending_reconciliation).toBe(true);
  const parent=readHumanOriginalAgentRunInputs(local,child.run_ref.id);for(const port of [query,cancel,recover])for(const call of port.mock.calls as unknown as [string,unknown][]){expect(call[0]).toBe(join(local.location.dataDirectory,'skill-runtime-originals',f.project.id,child.invocation_key));expect(call[1]).toEqual({...parent.scope,operation_key:child.invocation_key,context_digest:child.input_digest});}
 },120000);
});
