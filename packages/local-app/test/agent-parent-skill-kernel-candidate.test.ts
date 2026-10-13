import {describe,it,expect,vi} from 'vitest';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSkillInvocationProject} from '../../../tests/fixtures/skill-invocation-project.js';
import {contentDigest} from '../../kernel/src/intent.js';
vi.setConfig({testTimeout:120000});
function setup(){const directory=mkdtempSync(join(tmpdir(),'cimiloop-kernel-candidate-')),f=createSkillInvocationProject(directory),command={...f.reserveSkillCommand(),source:{origin:'agent',producer:'cimiloop-parent-sdk-skill-current-candidate'}},port=f.runPort.agent.skills!,count={reads:0};let available=true,retained:unknown;
 const verify=(project:unknown,input:unknown,reader:unknown)=>{count.reads++;if(!available)throw Error('PUBLIC candidate originals withdrawn');
  expect(project).toEqual(Reflect.apply(Reflect.get(reader as object,'getCurrentProject'),reader,[]));expect(input).toMatchObject({command,run:{id:f.reserved.run.id},record:{id:f.reserved.record.id},context:{id:f.prepared.context.id},binding:{id:f.skill.id}});
  expect(Object.isFrozen(reader)).toBe(true);expect(Reflect.get(reader as object,'transaction')).toBeUndefined();expect(Reflect.get(reader as object,'insertRuntimeRecord')).toBeUndefined();
  const get=Reflect.get(reader as object,'getProviderBinding');expect(get).toBeTypeOf('function');expect(Reflect.apply(get,reader,[f.skill.id])).toEqual(f.skill);retained=reader;
  return contentDigest({format:'PUBLIC CONSTRUCTED independent candidate proof',project,input});
 };
 return{f,directory,command,port,count,verify,withdraw:()=>{available=false;},reader:()=>retained,close:()=>f.store.close()};}
// Actual Git/Kernel transaction, PUBLIC candidate/native/qualification proof.
// No real Native, Skill, model, paid request or S1 acceptance in this contract.
describe('Kernel independently admits only an explicit original parent candidate',()=>{
 it('rejects a current-candidate producer without an installed independent reader even on a clean baseline',()=>{const s=setup();try{
  const result=s.f.kernel.execute(s.command);expect(result).toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(s.f.store.listRuntimeRecords('skill_invocation',s.f.change.id)).toHaveLength(0);expect(s.f.skillState.prepare_calls).toBe(0);
 }finally{s.close();}});
 it('joins a changed actual Git candidate through two independent writer-bound reads without refreshing global source or host admission',()=>{const s=setup();try{
  writeFileSync(join(s.directory,'src/query.ts'),'export const query = () => 2;\n');expect(s.f.runPort.sourceIsCurrent(s.f.project,s.f.source)).toBe(false);const admissions=s.f.state.admission_calls;
  Reflect.set(s.port,'verifyParentCandidate',s.verify);expect(s.f.kernel.execute(s.command)).toMatchObject({ok:true,command_type:'ReserveSkillInvocation'});
  expect(s.count.reads).toBe(2);expect(s.f.state.admission_calls).toBe(admissions);expect(s.f.runPort.sourceIsCurrent(s.f.project,s.f.source)).toBe(false);expect(s.f.skillState.prepare_calls).toBe(1);
  const reader=s.reader() as object;expect(()=>Reflect.apply(Reflect.get(reader,'getRun'),reader,[s.f.reserved.run.id])).toThrow();const reads=s.count.reads;Reflect.set(s.port,'verifyParentCandidate',()=>{throw Error('Original receipt cannot reopen candidate');});
  expect(s.f.kernel.execute(s.command)).toMatchObject({ok:true,command_type:'ReserveSkillInvocation'});expect(s.count.reads).toBe(reads);expect(s.f.store.listRuntimeRecords('skill_invocation',s.f.change.id)).toHaveLength(1);
 }finally{s.close();}});
 it('rejects a captured verified boolean before package preparation or a child effect',()=>{const s=setup();try{
  Reflect.set(s.port,'verifyParentCandidate',()=>true);expect(s.f.kernel.execute(s.command)).toMatchObject({code:'EVIDENCE_MISSING'});expect(s.f.skillState.prepare_calls).toBe(0);expect(s.f.store.listRuntimeRecords('skill_invocation',s.f.change.id)).toHaveLength(0);
 }finally{s.close();}});
 it('rechecks the original candidate after method qualification before inserting any child or advancing the Run',()=>{const s=setup();try{
  Reflect.set(s.port,'verifyParentCandidate',s.verify);const prepare=s.port.prepare.bind(s.port),sequence=s.f.store.asOfEventSequence(),run=s.f.currentRun();s.port.prepare=(...args)=>{const result=prepare(...args);s.withdraw();return result;};
  expect(s.f.kernel.execute(s.command)).toMatchObject({code:'EVIDENCE_MISSING'});expect(s.count.reads).toBe(2);expect(s.f.store.asOfEventSequence()).toBe(sequence);expect(s.f.currentRun()).toEqual(run);expect(s.f.store.listRuntimeRecords('skill_invocation',s.f.change.id)).toHaveLength(0);
 }finally{s.close();}});
 it('keeps legacy reservation source/admission gates closed when source changed despite an installed candidate reader',()=>{const s=setup();try{
  Reflect.set(s.port,'verifyParentCandidate',s.verify);writeFileSync(join(s.directory,'src/query.ts'),'export const query = () => 2;\n');expect(s.f.kernel.execute(s.f.reserveSkillCommand())).toMatchObject({code:'INPUT_CHANGED'});expect(s.count.reads).toBe(0);expect(s.f.store.listRuntimeRecords('skill_invocation',s.f.change.id)).toHaveLength(0);
 }finally{s.close();}});
});
