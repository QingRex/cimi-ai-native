import{mkdtempSync,readFileSync,writeFileSync,renameSync,existsSync}from'node:fs';import{dirname,join}from'node:path';import{tmpdir}from'node:os';import{describe,it,expect,vi}from'vitest';
import{compileValidator,RawSkillInvocationObservationSchema,type RawSkillInvocationObservation}from'@cimiloop/protocol/v2';
import{LocalAgentParentSkillCalls}from'../src/agent-parent-skill-calls-local.js';import{LocalAgentParentSkillHost}from'../src/agent-parent-skill-host-local.js';import{originalAgentWorkspaceScope}from'../src/agent-workspace-tools-local.js';import{digest}from'@cimiloop/runtime-adapter';import{createSkillInvocationProject}from'../../../tests/fixtures/skill-invocation-project.js';import{flowSuccess,flowTime}from'../../../tests/fixtures/flow-project.js';
vi.setConfig({testTimeout:90000});
// Actual immutable file intents and Kernel/SQLite/independent result reader.
// Child execution/qualification/model/bills are PUBLIC construction, not S1.
function fixture(){const root=mkdtempSync(join(tmpdir(),'cimiloop-parent-readonly-')),f=createSkillInvocationProject(root),dataDirectory=dirname(f.path),local={caller:f.caller,store:f.store,kernel:f.kernel,location:{repositoryKind:'git' as const,repositoryPath:root,dataDirectory,databasePath:f.path,instancePath:join(dataDirectory,'instance.json'),suggestedName:'PUBLIC original parent read-only fixture'}},scope=originalAgentWorkspaceScope(local,f.reserved.run.id),body={format:'cimiloop/agent-parent-skill-catalog/1.0.0' as const,scope_digest:digest(JSON.stringify(scope)).value,entries:[{skill_alias:'review',method_name:'review',input_alias:'original',skill_binding:scope.skill_bindings[0]!,input_ref:f.inputRef}]},catalog={...body,catalog_digest:digest(JSON.stringify(body)).value},skillLocal=local as unknown as Parameters<typeof LocalAgentParentSkillCalls.open>[0]['local'],count={starts:0,captures:0,effectGuards:0},calls=LocalAgentParentSkillCalls.open({local:skillLocal,runId:f.reserved.run.id,catalog,beforeReservation:()=>{},now:()=>flowTime}),options={local:skillLocal,calls,beforeEffect:()=>{count.effectGuards++;},now:()=>flowTime,execution:{async start(){count.starts++;}},results:{captureVerified(id:string){count.captures++;const raw=f.skillRaw(f.store.getRuntimeRecord('skill_invocation',id)!,'succeeded');return{reference:raw.reference,report:compileValidator<RawSkillInvocationObservation>(RawSkillInvocationObservationSchema)(raw.report)};},readResult(project:any,invocation:any,reference:any){return compileValidator<RawSkillInvocationObservation>(RawSkillInvocationObservationSchema)(f.runPort.agent.skills!.readResult(project,invocation,reference));}}},frame={format:'cimiloop/agent-parent-skill-request/1.0.0',scope_digest:body.scope_digest,catalog_digest:catalog.catalog_digest,call_id:'sdk_'+digest('PUBLIC original SDK call').value,tool:'run_skill',skill_alias:'review',method_name:'review',input_alias:'original'},requestPath=join(dataDirectory,'agent-parent-skill-call-originals',scope.project_id,scope.run_id,frame.call_id,'request.json'),anchorPath=join(dirname(dirname(requestPath)),frame.call_id+'.anchor.json'),host=()=>LocalAgentParentSkillHost.open(options);
 const read=<T extends LocalAgentParentSkillCalls|LocalAgentParentSkillHost>(service:T):ReturnType<T['readOriginal']>=>{const method=Reflect.get(service as object,'readOriginal');expect(method).toBeTypeOf('function');return Reflect.apply(method,service,[frame]) as ReturnType<T['readOriginal']>;};
 return{root,f,local,dataDirectory,scope,calls,options,count,frame,requestPath,anchorPath,host,read,close:()=>f.store.close()};}

import {CimiLoopKernel} from '@cimiloop/kernel';
import {SCHEMA_VERSION,createInternalId} from '@cimiloop/protocol/v2';
import {collectAgentRuntimeOperation} from '@cimiloop/runtime-adapter';
import {claimAgentRuntimeOperation} from '../../runtime-adapter/src/agent-runtime-operation.js';
import {LocalRunVerifier} from '../src/runs-local.js';
import {LocalAgentRuntimeObservation} from '../src/agent-runtime-observation-local.js';
// Actual Kernel/SQLite, immutable claim and original child receipts. The partial
// Native claim, child model/qualification and bills remain PUBLIC construction.
function human(f:ReturnType<typeof fixture>,port:unknown){
 const verifier=Reflect.construct(LocalRunVerifier,[f.root,f.dataDirectory,undefined,undefined,undefined,port]) as LocalRunVerifier;
 const local={store:f.f.store,location:f.local.location,instance:{schema_version:'1.0.0' as const,instance_id:f.f.project.instance_id,project_id:f.f.project.id,actor_id:f.f.actor.id,created_at:f.f.project.created_at},kernel:new CimiLoopKernel({store:f.f.store,caller:{kind:'local_operator',project_id:f.f.project.id,actor_id:f.f.actor.id},runVerifier:verifier})};
 const collect=vi.fn(collectAgentRuntimeOperation),service=()=>Reflect.construct(LocalAgentRuntimeObservation,[local,{collect},undefined,port]) as LocalAgentRuntimeObservation;
 const catalog=f.host().sdkCatalog,binding={format:'cimiloop/agent-parent-skill-binding/1.0.0',scope_digest:catalog.scope_digest,catalog_digest:catalog.catalog_digest,sdk_catalog_digest:digest(JSON.stringify(catalog)).value};
 const claim=claimAgentRuntimeOperation(f.dataDirectory,f.scope,{purpose:'PUBLIC incomplete parent Runtime',parent_skill_original_binding:binding},{pid:process.pid,creation_ticks:'123456',image:process.execPath});
 const request={command_id:createInternalId(),requested_at:flowTime,acting_role:'technical_owner' as const,command_type:'RecordRunObservation' as const,target:{object_type:'run' as const,id:f.scope.run_id},expected_revision:f.f.currentRun().revision,payload:{}};
 return{local,collect,service,claim,request};
}
describe('shared Human original parent result composition uses the Kernel current Writer',()=>{
 it('captures only a Run-bound historical child reader before collection and independently reads the same known child in the actual Kernel Writer without nested transactions or effects',async()=>{
  const f=fixture();try{const child=await f.host().invoke(f.frame),host=f.host(),readers:unknown[]=[],port={forOriginal(scope:unknown,reader?:Parameters<typeof host.readOriginalFromReader>[1]){expect(scope).toEqual(f.scope);readers.push(reader);expect((reader?host.readOriginalFromReader(f.frame,reader):host.readOriginal(f.frame)).receipt).toEqual(child.receipt);return Object.freeze({get sdkCatalog(){return host.sdkCatalog;},readOriginal:reader?(raw:unknown)=>host.readOriginalFromReader(raw,reader):host.readOriginal.bind(host)});}},h=human(f,port),sequence=f.f.store.asOfEventSequence(),effects={...f.count},result=await h.service().record(h.request);
   expect(result).toMatchObject({ok:true,command_type:'RecordRunObservation',data:{observation:{report:{status:'unknown',usage:{cost_known:false}}}}});expect(h.collect).toHaveBeenCalledTimes(1);const installed=(h.collect.mock.calls[0] as unknown[])[4];expect(installed).toBeDefined();expect(Object.isFrozen(installed)).toBe(true);expect(Reflect.get(installed as object,'invoke')).toBeUndefined();expect(readers).toHaveLength(2);expect(readers[0]).toBeUndefined();expect(readers[1]).toBeDefined();expect(()=>Reflect.get(readers[1] as object,'getRun')(f.scope.run_id)).toThrow();expect(f.count).toEqual(effects);expect(f.f.store.asOfEventSequence()).toBe(sequence+1);expect(f.f.task().status).not.toBe('Satisfied');
  }finally{f.close();}
 });
 it('recovers one committed Human response loss with the original receipt after original claim bytes disappear, without recollection, child reads or another effect',async()=>{
  const f=fixture();try{const child=await f.host().invoke(f.frame),host=f.host();let reads=0;const port={forOriginal(scope:unknown,reader?:Parameters<typeof host.readOriginalFromReader>[1]){expect(scope).toEqual(f.scope);reads++;expect((reader?host.readOriginalFromReader(f.frame,reader):host.readOriginal(f.frame)).receipt).toEqual(child.receipt);return{get sdkCatalog(){return host.sdkCatalog;},readOriginal:reader?(raw:unknown)=>host.readOriginalFromReader(raw,reader):host.readOriginal.bind(host)};}},h=human(f,port),execute=h.local.kernel.execute.bind(h.local.kernel);let lose=true;h.local.kernel.execute=command=>{const result=execute(command);if(lose&&'ok'in result&&result.ok){lose=false;throw Error('PUBLIC original committed response loss');}return result;};
   await expect(h.service().record(h.request)).rejects.toThrow('PUBLIC original committed response loss');expect(reads).toBe(2);const sequence=f.f.store.asOfEventSequence(),effects={...f.count};writeFileSync(join(h.claim.claimDirectory,'input.json'),'{}');h.collect.mockRejectedValue(Error('Must not recollect original'));expect(await h.service().record(h.request)).toMatchObject({ok:true,command_type:'RecordRunObservation'});expect(h.collect).toHaveBeenCalledTimes(1);expect(reads).toBe(2);expect(f.count).toEqual(effects);expect(f.f.store.asOfEventSequence()).toBe(sequence);
  }finally{f.close();}
 });
 it('consumes an asynchronous installed historical-reader factory rejection before any Native collection or Kernel observation, retaining the original budget',async()=>{
  const f=fixture();try{await f.host().invoke(f.frame);const port={forOriginal(){return Promise.reject(Error('PUBLIC asynchronous reader factory'));}},h=human(f,port),sequence=f.f.store.asOfEventSequence(),effects={...f.count};await expect(h.service().record(h.request)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(h.collect).not.toHaveBeenCalled();expect(f.f.store.asOfEventSequence()).toBe(sequence);expect(f.count).toEqual(effects);expect(f.f.task().status).not.toBe('Satisfied');
  }finally{f.close();}
 });
});

import {rawReference} from '../../runtime-adapter/src/files.js';
import {readAgentRuntimeOriginalIdentity} from '@cimiloop/runtime-adapter';
describe('original parent history capacity preserves the existing full ordinary allowance',()=>{
 for(const extra of[0,1])it(extra===0?'accepts all original ordinary artifacts plus the one immutable parent catalog at the exact parent boundary':'rejects one more artifact than the original parent boundary without a Kernel observation',async()=>{
  const f=fixture();try{await f.host().invoke(f.frame);const host=f.host(),port={forOriginal(){return host;}},h=human(f,port),identity=readAgentRuntimeOriginalIdentity(f.dataDirectory,f.scope),sequence=f.f.store.asOfEventSequence(),effects={...f.count};
   h.collect.mockImplementation(async(...args)=>{const original=await collectAgentRuntimeOperation(...args);const oldLimit=128*4+1+10+1+(identity.claim.format==='cimiloop/agent-runtime-operation-claim/2.0.0'?1:0)+('cancellation'in original?2:0)+(original.synthetic_model_responses===null?64*3+2:0)+('dedicated_model'in original?64*10+3:0);
    // PUBLIC bounded byte fixtures test the capacity contract, not actual SDK
    // history, models, Native completion or S1. Keep all original allowance.
    original.artifacts=Array.from({length:oldLimit+extra},(_,index)=>{const name='PUBLIC-parent-history-'+index;return{name,reference:rawReference(f.dataDirectory,Buffer.from('PUBLIC original bounded history'),'agent_runtime_original_bytes',name)};});
    const name='parent-skill-catalog.json';original.artifacts.push({name,reference:rawReference(f.dataDirectory,Buffer.from(JSON.stringify(host.sdkCatalog)),'agent_runtime_original_bytes',name)});return original;
   });
   if(extra===0){expect(await h.service().record(h.request)).toMatchObject({ok:true,command_type:'RecordRunObservation',data:{observation:{report:{status:'unknown',usage:{cost_known:false}}}}});expect(f.f.store.asOfEventSequence()).toBe(sequence+1);}else{await expect(h.service().record(h.request)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(f.f.store.asOfEventSequence()).toBe(sequence);}
   expect(f.count).toEqual(effects);expect(f.f.task().status).not.toBe('Satisfied');
  }finally{f.close();}
 });
});

import {LocalAgentRuntimeControl} from '../src/agent-runtime-control-local.js';
describe('readonly original parent control collection installs the historical result port',()=>{
 it('collects the original parent bytes with the captured child reader and no Kernel observation or new effect',async()=>{
  const f=fixture();try{const child=await f.host().invoke(f.frame),host=f.host();let calls=0;const port={forOriginal(scope:unknown,writer?:Parameters<typeof host.readOriginalFromReader>[1]){expect(scope).toEqual(f.scope);expect(writer).toBeUndefined();calls++;expect(host.readOriginal(f.frame).receipt).toEqual(child.receipt);return host;}},h=human(f,port),effects={...f.count},sequence=f.f.store.asOfEventSequence(),control=Reflect.construct(LocalAgentRuntimeControl,[h.local,{collect:h.collect,query:async()=>{},recover:async()=>{},requestCancellation:()=>{}},port]) as LocalAgentRuntimeControl;
   expect(await control.collect(f.scope.run_id)).toMatchObject({ok:true,run_id:f.scope.run_id,starts_run:false,domain_observation_produced:false,operation:{outcome:'observed'}});expect(calls).toBe(1);expect(h.collect).toHaveBeenCalledTimes(1);const installed=(h.collect.mock.calls[0] as unknown[])[4];expect(installed).toBeDefined();expect(Object.isFrozen(installed)).toBe(true);expect(Reflect.get(installed as object,'invoke')).toBeUndefined();expect(f.count).toEqual(effects);expect(f.f.store.asOfEventSequence()).toBe(sequence);expect(f.f.task().status).not.toBe('Satisfied');
  }finally{f.close();}
 });
});

describe('original control fixes complete local identity across installed callbacks',()=>{
 it('rejects a historical-reader factory changing the data root before any collection at that root',async()=>{
  const f=fixture();try{await f.host().invoke(f.frame);const host=f.host(),catalog=host.sdkCatalog,reader=host.readOriginal.bind(host),h=human(f,undefined),other=mkdtempSync(join(tmpdir(),'cimiloop-control-root-drift-')),identity=readAgentRuntimeOriginalIdentity(f.dataDirectory,f.scope);
   claimAgentRuntimeOperation(other,f.scope,identity.input,{pid:process.pid,creation_ticks:'123456',image:process.execPath});
   h.local.location={...h.local.location};const effects={...f.count},sequence=f.f.store.asOfEventSequence(),port={forOriginal(){h.local.location.dataDirectory=other;return{sdkCatalog:catalog,readOriginal:reader};}},control=Reflect.construct(LocalAgentRuntimeControl,[h.local,{collect:h.collect,query:async()=>{},recover:async()=>{},requestCancellation:()=>{}},port]) as LocalAgentRuntimeControl;
   await expect(control.collect(f.scope.run_id)).rejects.toMatchObject({code:'INPUT_CHANGED'});expect(h.collect).not.toHaveBeenCalled();expect(f.count).toEqual(effects);expect(f.f.store.asOfEventSequence()).toBe(sequence);
  }finally{f.close();}
 });
 it('rejects database path drift while awaiting collection without generating an observation or another effect',async()=>{
  const f=fixture();try{await f.host().invoke(f.frame);const host=f.host(),h=human(f,{forOriginal(){return host;}}),effects={...f.count},sequence=f.f.store.asOfEventSequence();
   h.local.location={...h.local.location};h.collect.mockImplementation(async(...args)=>{const result=await collectAgentRuntimeOperation(...args);h.local.location.databasePath=join(f.dataDirectory,'PUBLIC-different-database.sqlite');return result;});
   const control=Reflect.construct(LocalAgentRuntimeControl,[h.local,{collect:h.collect,query:async()=>{},recover:async()=>{},requestCancellation:()=>{}},{forOriginal(){return host;}}]) as LocalAgentRuntimeControl;
   await expect(control.collect(f.scope.run_id)).rejects.toMatchObject({code:'INPUT_CHANGED'});expect(h.collect).toHaveBeenCalledTimes(1);expect(f.count).toEqual(effects);expect(f.f.store.asOfEventSequence()).toBe(sequence);
  }finally{f.close();}
 });
});
