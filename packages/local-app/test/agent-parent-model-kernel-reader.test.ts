import {describe,it,expect,vi} from 'vitest';
import {mkdtempSync} from 'node:fs';import {join,dirname} from 'node:path';import {tmpdir} from 'node:os';
import {createSkillInvocationProject} from '../../../tests/fixtures/skill-invocation-project.js';
import {originalAgentWorkspaceScope} from '../src/agent-workspace-tools-local.js';import {contentDigest} from '../../kernel/src/intent.js';
vi.setConfig({testTimeout:120000});
function setup(){const root=mkdtempSync(join(tmpdir(),'cimiloop-model-snapshot-reader-')),f=createSkillInvocationProject(root),dataDirectory=dirname(f.path),local={caller:f.caller,store:f.store,kernel:f.kernel,location:{repositoryKind:'git' as const,repositoryPath:root,dataDirectory,databasePath:f.path,instancePath:join(dataDirectory,'instance.json'),suggestedName:'PUBLIC model scoped reader contract'}},scope=originalAgentWorkspaceScope(local,f.reserved.run.id);return{f,scope,close:()=>f.store.close()};}
// Actual Kernel/SQLite snapshot; qualification/model/Skill proof PUBLIC only.
describe('Kernel model admission supplies the original current readonly snapshot',()=>{
 it('provides a frozen current reader with detached data and no transaction or writer authority',()=>{const s=setup();try{let calls=0;
  Reflect.set(s.f.runPort.agent,'checkModelAuthority',(_project:unknown,_input:unknown,reader:object)=>{
   calls++;expect(reader).toBeDefined();expect(Object.isFrozen(reader)).toBe(true);for(const key of ['transaction','readSnapshot','execute','insertRuntimeRecord','updateRun'])expect(Reflect.get(reader,key)).toBeUndefined();
   const event=s.f.store.listEvents().at(-1)!;expect(Reflect.apply(Reflect.get(reader,'getCommandReceipt'),reader,[event.command_id])).toMatchObject({command_id:event.command_id});
   const get=Reflect.get(reader,'getRun'),run=Reflect.apply(get,reader,[s.scope.run_id]);expect(run).toEqual(s.f.currentRun());if(!run||typeof run!=='object')throw Error('Original Run expected');Reflect.set(run,'status','PUBLIC detached mutation');expect(s.f.currentRun().status).not.toBe('PUBLIC detached mutation');
   expect(Reflect.apply(Reflect.get(reader,'getCurrentProject'),reader,[])).toEqual(s.f.store.getProject());
   return contentDigest('PUBLIC current snapshot proof');
  });const before=s.f.store.asOfEventSequence();expect(s.f.kernel.assessAgentRunModel(s.scope)).toMatchObject({decision:'ALLOW'});expect(calls).toBe(1);expect(s.f.store.asOfEventSequence()).toBe(before);
 }finally{s.close();}});
 it('expires the retained reader when the synchronous host check returns',()=>{const s=setup();try{let retained:object|undefined;
  Reflect.set(s.f.runPort.agent,'checkModelAuthority',(_project:unknown,_input:unknown,reader:object)=>{expect(reader).toBeDefined();retained=reader;return contentDigest('PUBLIC original proof');});
  expect(s.f.kernel.assessAgentRunModel(s.scope)).toMatchObject({decision:'ALLOW'});expect(()=>Reflect.apply(Reflect.get(retained!,'getRun'),retained,[s.scope.run_id])).toThrow();expect(()=>Reflect.apply(Reflect.get(retained!,'getCurrentProject'),retained,[])).toThrow();
 }finally{s.close();}});
 it('rejects an async model authority callback and owns its late rejection while expiring the reader',async()=>{const s=setup(),unhandled:unknown[]=[],listener=(reason:unknown)=>unhandled.push(reason);process.on('unhandledRejection',listener);try{let retained:object|undefined;
  Reflect.set(s.f.runPort.agent,'checkModelAuthority',(_project:unknown,_input:unknown,reader:object)=>{expect(reader).toBeDefined();retained=reader;return Promise.reject(Error('PUBLIC late async authority refusal'));});
  expect(s.f.kernel.assessAgentRunModel(s.scope)).toMatchObject({decision:'DENY',reasons:['AGENT_MODEL_HOST_PROOF_UNPROVEN']});expect(()=>Reflect.apply(Reflect.get(retained!,'getRun'),retained,[s.scope.run_id])).toThrow();await new Promise<void>(done=>setImmediate(done));expect(unhandled).toHaveLength(0);
 }finally{process.removeListener('unhandledRejection',listener);s.close();}});
});
