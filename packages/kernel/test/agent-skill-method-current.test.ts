import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it} from 'vitest';
import * as Kernel from '../src/index.js';
import {createSkillInvocationProject} from '../../../tests/fixtures/skill-invocation-project.js';
import {flowTime,flowSuccess} from '../../../tests/fixtures/flow-project.js';
import {createInternalId} from '@cimiloop/protocol/v2';

const closes:(()=>void)[]=[];afterEach(()=>{while(closes.length)closes.pop()!();});
function fixture(){const f=createSkillInvocationProject(mkdtempSync(join(tmpdir(),'cimiloop-method-current-')));closes.push(()=>f.store.close());const record=f.reserved.record;if(record.run_kind!=='agent'||!('runtime_binding'in f.prepared.context))throw Error('Agent expected');
 const input={project:f.store.getProject()!,record,context:f.prepared.context,binding:f.skill,descriptor:f.store.getProviderDescriptor(f.skill.descriptor_ref.id)!,request:{invocation_key:createInternalId(),method_name:'review',purpose:'review'}};
 const assess=(value=input)=>{const fn=Reflect.get(Kernel,'currentAgentSkillMethodProblems');expect(fn).toBeTypeOf('function');return Reflect.apply(fn,undefined,[f.store,value,flowTime]) as string[];};return{f,input,assess};}

it('checks the current Kernel scope and cost without creating an invocation or treating that check as method qualification',()=>{const {f,assess}=fixture(),sequence=f.store.asOfEventSequence();expect(assess()).toEqual([]);expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.store.listRuntimeRecords('skill_invocation',f.change.id)).toEqual([]);});
it('rejects cancellation and a substituted original context',()=>{const {f,input,assess}=fixture();expect(assess({...input,context:{...input.context,input_digest:{algorithm:'sha256',value:'0'.repeat(64)}}})).not.toEqual([]);expect(flowSuccess(f.humanKernel.execute(f.humanCommand('CancelRun','run',f.currentRun().id,{reason:'PUBLIC cancellation'},'technical_owner'))).command_type).toBe('CancelRun');expect(assess()).not.toEqual([]);});
it('allows only the exact original active child while a child is unresolved',()=>{const {f,input,assess}=fixture(),{invocation}=f.reserveSkill();expect(assess()).not.toEqual([]);expect(assess({...input,request:{invocation_key:invocation.invocation_key,method_name:invocation.request.method_name,purpose:invocation.request.input.purpose}})).toEqual([]);expect(assess({...input,request:{invocation_key:invocation.invocation_key,method_name:'another_method',purpose:'review'}})).not.toEqual([]);});
