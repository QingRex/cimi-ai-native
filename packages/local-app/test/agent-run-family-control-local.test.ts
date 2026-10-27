import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {AgentStartLedger,digest} from '@cimiloop/runtime-adapter';import {createInternalId} from '@cimiloop/protocol/v2';import * as app from '../src/index.js';
import {createSkillInvocationProject} from '../../../tests/fixtures/skill-invocation-project.js';import {flowTime} from '../../../tests/fixtures/flow-project.js';
import {readHumanOriginalAgentRunInputs} from '../src/agent-runtime-control-local.js';
const closes:(()=>void)[]=[];afterAll(()=>{for(const close of closes.reverse())close();});
// Actual Kernel/SQLite/Host1 and original child custody; PUBLIC Native ports.
// This verifies complete application control, never real resources/model/S1.
const proof={resource_scope:'native_and_current_codex_run',native_resources_disposed:true,resources_disposed:true,completion_proven:false,model_resources:{resource_scope:'current_codex_run',resources_disposed:true}};
function fixture(count=2){
 const root=mkdtempSync(join(tmpdir(),'cimi-family-control-')),f=createSkillInvocationProject(root),data=dirname(f.path),origin=AgentStartLedger.initialize(join(data,'family-host'),{machine_digest:digest('PUBLIC machine').value,principal_digest:digest('PUBLIC Human').value});closes.push(()=>{origin.close();f.store.close();});
 const local={store:f.store,kernel:f.humanKernel,instance:{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:flowTime},location:{repositoryKind:'git',repositoryPath:root,dataDirectory:data,databasePath:f.path,instancePath:join(data,'instance.json'),suggestedName:'PUBLIC family'}} as unknown as app.LocalProject;
 const custody=new app.LocalSkillInvocationStartCustody(root,data,origin),prepare=f.runPort.agent.skills!.prepare.bind(f.runPort.agent.skills);f.runPort.agent.skills!.prepare=(p,r,c,b,i)=>custody.bindPreparation(p,r,c,b,i,prepare(p,r,c,b,i));
 const parent=readHumanOriginalAgentRunInputs(local,f.currentRun().id),invocations:ReturnType<typeof f.reserveSkill>['invocation'][]=[];for(let i=0;i<count;i++){const invocation=f.reserveSkill().invocation;invocations.push(invocation);custody.claim(f.project,invocation,parent.scope,parent.record.id,digest('PUBLIC staged method').value,()=>{});if(i<count-1){const result=f.observeSkill(invocation,'succeeded',{usage:{cost_known:true,cost_micros:0,currency:'USD'}});if('code'in result)throw Error('PUBLIC previous child must be settled: '+result.code);}}
 const parentPort:app.AgentRuntimeControlPort={query:vi.fn(async()=>({...proof,status:'Stopped'})),collect:vi.fn(async()=>({PUBLIC:'original collection'})),requestCancellation:vi.fn(()=>({requested:true,stopped_proven:false})),recover:vi.fn(async()=>({...proof,outcome:'recovered'}))},childPort:app.AgentRuntimeControlPort={query:vi.fn(async()=>({...proof,status:'Stopped'})),collect:vi.fn(async()=>({PUBLIC:'child collection'})),requestCancellation:vi.fn(()=>({requested:true,stopped_proven:false})),recover:vi.fn(async()=>({...proof,outcome:'recovered'}))};
 const factory=vi.fn(async()=>({custody,release(){}})),parentControl=new app.LocalAgentRuntimeControl(local,parentPort),childControl=new app.LocalHumanSkillInvocationControl(local,factory,childPort);
 const service=()=>{const Constructor=Reflect.get(app,'LocalHumanAgentRunFamilyControl');expect(Constructor).toBeTypeOf('function');return new Constructor(local,parentControl,childControl);};
 const command=()=>({command_id:createInternalId(),requested_at:flowTime,acting_role:'technical_owner',command_type:'CancelRun',target:{object_type:'run',id:f.currentRun().id},expected_revision:f.currentRun().revision,payload:{reason:'PUBLIC stop complete original family'}});return{f,local,invocations,parentPort,childPort,childControl,factory,service,command};
}
let t:ReturnType<typeof fixture>;beforeAll(()=>{t=fixture();},120000);
it('queries the complete original child set without dispatch, domain changes or new preparation',async()=>{const before=t.f.store.asOfEventSequence(),prepared=t.f.skillState.prepare_calls,result=await t.service().query(t.f.currentRun().id);
 expect(result.family!.children.map((child:any)=>child.invocation_id).sort()).toEqual(t.invocations.map(v=>v.id).sort());expect(result.family).toMatchObject({resources_disposed:true,completion_proven:false,costs_reconciled:false});expect(t.f.store.asOfEventSequence()).toBe(before);expect(t.f.skillState.prepare_calls).toBe(prepared);
});
it('keeps one Kernel cancellation and delivers to every original child despite a lost child acknowledgement',async()=>{const id=t.invocations[0]!.invocation_key;let lost=false;vi.mocked(t.childPort.requestCancellation).mockImplementation((_root,scope,guard)=>{guard?.();expect(t.f.currentRun().cancel_requested).toBe(true);if(scope.operation_key===id&&!lost){lost=true;throw Error('PUBLIC lost child acknowledgement');}return{requested:true,stopped_proven:false};});
 const command=t.command(),before=t.f.store.asOfEventSequence(),observations=t.f.store.listRuntimeRecords('skill_invocation_observation',t.f.change.id),first=await t.service().stop(command);if('code'in first)throw Error(first.code);expect(first.family!.children).toHaveLength(2);expect(first.family!.children.some((v:any)=>v.operation.outcome==='unknown')).toBe(true);const replay=await t.service().stop(command);if('code'in replay)throw Error(replay.code);expect(replay.command_result).toEqual(first.command_result);expect(t.f.store.asOfEventSequence()).toBe(before+1);expect(replay.family!.children.every((v:any)=>v.operation.outcome==='observed')).toBe(true);expect(replay.family!.resources_disposed).toBe(false);expect(t.f.store.listRuns(t.f.change.id)).toHaveLength(1);expect(t.f.task().usage.pending_reconciliation).toBe(true);expect(t.f.store.listRuntimeRecords('skill_invocation_observation',t.f.change.id)).toEqual(observations);
});
it('preserves an unavailable child in recovery instead of reporting the family disposed',async()=>{const id=t.invocations[0]!.invocation_key;vi.mocked(t.childPort.recover).mockImplementation(async(_root,scope,guard)=>{guard?.();if(scope.operation_key===id)throw Error('private original unavailable');return{...proof,outcome:'recovered'};});const before=t.f.store.asOfEventSequence(),result=await t.service().recover(t.f.currentRun().id);expect(result.family!.children).toHaveLength(2);expect(result.family!.resources_disposed).toBe(false);expect(JSON.stringify(result)).not.toContain('private original');expect(t.f.store.asOfEventSequence()).toBe(before);});
it.each([
 {resource_scope:'native_only',resources_disposed:true},
 {format:'cimiloop/original-skill-dispatch-closure/1.0.0',dispatch_closed:true,zero_effects_proven:false},
 {requested:true,stopped_proven:false},
 {...proof,resources_disposed:false},
])('does not infer complete resource disposal from partial child evidence %#',async partial=>{vi.mocked(t.childPort.query).mockResolvedValue(partial);const result=await t.service().query(t.f.currentRun().id);expect(result.family!.resources_disposed).toBe(false);vi.mocked(t.childPort.query).mockResolvedValue({...proof,status:'Stopped'});});
it('propagates current session checks into each parent physical model effect before touching children',async()=>{let expired=false,effects=0;const calls=t.factory.mock.calls.length;vi.mocked(t.parentPort.requestCancellation).mockImplementation((_root,_scope,guard)=>{expired=true;guard!();effects++;return{requested:true};});await expect(t.service().retryCancellation(t.f.currentRun().id,()=>{if(expired)throw new app.LocalProjectError('PUBLIC expired','CAPABILITY_UNAVAILABLE','forbidden');})).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(effects).toBe(0);expect(t.factory.mock.calls.length).toBe(calls);vi.mocked(t.parentPort.requestCancellation).mockReturnValue({requested:true,stopped_proven:false});});
it('stops the remaining family work when the current session expires during a child await',async()=>{let expired=false,calls=0;vi.mocked(t.childPort.query).mockImplementation(async()=>{calls++;expired=true;return{...proof,status:'Stopped'};});await expect(t.service().query(t.f.currentRun().id,()=>{if(expired)throw new app.LocalProjectError('PUBLIC expired','CAPABILITY_UNAVAILABLE','forbidden');})).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(calls).toBe(1);});
it('retains a guard failure even when a later callback would pass',async()=>{let expired=false,calls=0;vi.mocked(t.childPort.query).mockImplementation(async()=>{calls++;expired=true;return{...proof,status:'Stopped'};});await expect(t.service().query(t.f.currentRun().id,()=>{if(expired){expired=false;throw new app.LocalProjectError('PUBLIC expired once','CAPABILITY_UNAVAILABLE','forbidden');}})).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(calls).toBe(1);});
it('retains the first root-control guard failure even if an adapter catches it',async()=>{const control=new app.LocalAgentRuntimeControl(t.local,t.parentPort);await control.stop(t.command());let expired=false;
 vi.mocked(t.parentPort.requestCancellation).mockImplementation((_root,_scope,guard)=>{expired=true;try{guard!();}catch{}return{requested:true};});
 try{await expect(control.retryCancellation(t.f.currentRun().id,()=>{if(expired){expired=false;throw new app.LocalProjectError('PUBLIC expired once','CAPABILITY_UNAVAILABLE','forbidden');}})).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});}
 finally{vi.mocked(t.parentPort.requestCancellation).mockReturnValue({requested:true,stopped_proven:false});}
});
// These cases build a fresh Kernel/SQLite/Host1 project inside the test. Give
// setup the same 60-second budget used by the single-Run fixture hook; this
// does not change a production Runtime deadline or any authority assertion.
it('preserves the historical no-child response without opening child custody',async()=>{const f=fixture(0),result=await f.service().query(f.f.currentRun().id);expect(result).not.toHaveProperty('family');expect(f.factory).not.toHaveBeenCalled();},60000);
it('collects the parent and every original child without repeating preparation or producing domain observations',async()=>{
 const f=fixture(),before=f.f.store.asOfEventSequence(),prepared=f.f.skillState.prepare_calls,runId=f.f.currentRun().id;
 const first=await f.service().collect(runId),replay=await f.service().collect(runId);
 const family=first.family;if(!family)throw Error('Expected original family collection');
 expect(family.children.map(child=>child.invocation_id)).toEqual([...f.invocations].sort((a,b)=>a.invocation_key.localeCompare(b.invocation_key)).map(v=>v.id));
 expect(family).toMatchObject({resources_disposed:false,completion_proven:false,costs_reconciled:false});
 expect(replay).toEqual(first);expect(f.parentPort.collect).toHaveBeenCalledTimes(2);expect(f.childPort.collect).toHaveBeenCalledTimes(4);
 for(const invocation of f.invocations){const calls=vi.mocked(f.childPort.collect).mock.calls.filter(call=>call[1].operation_key===invocation.invocation_key);expect(calls).toHaveLength(2);for(const call of calls){expect(call[0]).toBe(join(f.local.location.dataDirectory,'skill-runtime-originals',f.f.project.id,invocation.invocation_key));expect(call[1]).toMatchObject({run_id:runId,context_digest:invocation.input_digest});}}
 expect(f.f.store.asOfEventSequence()).toBe(before);expect(f.f.skillState.prepare_calls).toBe(prepared);expect(f.f.store.listRuns(f.f.change.id)).toHaveLength(1);
},60000);
it('collects the remaining original children after an unavailable parent and child, preserving partial results and sanitized Unknowns',async()=>{
 const f=fixture(),first=f.invocations[0]!;vi.mocked(f.parentPort.collect).mockRejectedValue(Error('private parent path'));
 vi.mocked(f.childPort.collect).mockImplementation(async(_root,scope)=>{if(scope.operation_key===first.invocation_key)throw Error('private child path');return{PUBLIC:'retained child bytes'};});
 const result=await f.service().collect(f.f.currentRun().id),family=result.family;if(!family)throw Error('Expected partial original family collection');
 expect(result.operation.outcome).toBe('unknown');expect(family.children).toHaveLength(2);
 expect(family.children.find(v=>v.invocation_id===first.id)).toMatchObject({operation:{outcome:'unknown'}});expect(family.children.find(v=>v.invocation_id!==first.id)).toMatchObject({operation:{outcome:'observed',result:{PUBLIC:'retained child bytes'}}});
 expect(JSON.stringify(result)).not.toContain('private');expect(family.resources_disposed).toBe(false);
},60000);
it('halts family collection after a child await loses the Human session',async()=>{
 const f=fixture();let expired=false;vi.mocked(f.childPort.collect).mockImplementation(async()=>{expired=true;return{PUBLIC:'child bytes'};});
 await expect(f.service().collect(f.f.currentRun().id,()=>{if(expired)throw new app.LocalProjectError('PUBLIC expired','CAPABILITY_UNAVAILABLE','forbidden');})).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});
 expect(f.childPort.collect).toHaveBeenCalledTimes(1);
},60000);
it('rejects a new child reservation during parent collection instead of returning an incomplete family',async()=>{
 const f=fixture(0);vi.mocked(f.parentPort.collect).mockImplementation(async()=>{f.f.reserveSkill();return{PUBLIC:'parent bytes'};});
 await expect(f.service().collect(f.f.currentRun().id)).rejects.toMatchObject({code:'INPUT_CHANGED'});expect(f.factory).not.toHaveBeenCalled();
},60000);
it('rejects a child-set change during the parent read instead of omitting the new reservation',async()=>{const f=fixture(0);vi.mocked(f.parentPort.query).mockImplementation(async()=>{f.f.reserveSkill();return{...proof,status:'Stopped'};});await expect(f.service().query(f.f.currentRun().id)).rejects.toMatchObject({code:'INPUT_CHANGED'});expect(f.factory).not.toHaveBeenCalled();},60000);
it('stopping one original Skill also controls the parent and every original sibling under one Kernel receipt',async()=>{
 const input=t.command(),id=t.invocations[0]!.id,before=t.f.store.asOfEventSequence(),calls=vi.mocked(t.childPort.requestCancellation).mock.calls.length,observations=t.f.store.listRuntimeRecords('skill_invocation_observation',t.f.change.id),parent=vi.spyOn(app.LocalAgentRuntimeControl.prototype,'retryCancellation');
 try{
  const first=await t.childControl.stop(id,input),replay=await t.childControl.stop(id,input);
  expect(first).toMatchObject({invocation_id:id,parent_operation:{outcome:'unknown'},family:{resources_disposed:false,completion_proven:false,costs_reconciled:false,children:expect.arrayContaining(t.invocations.map(v=>expect.objectContaining({invocation_id:v.id})))}});
  if('code'in first||'code'in replay)throw Error('PUBLIC expected original cancellation receipt');
  expect(replay.command_result).toEqual(first.command_result);expect(parent).toHaveBeenCalledTimes(2);
  const delivered=vi.mocked(t.childPort.requestCancellation).mock.calls.slice(calls).map(row=>row[1].operation_key);expect(delivered).toHaveLength(4);for(const invocation of t.invocations)expect(delivered.filter(key=>key===invocation.invocation_key)).toHaveLength(2);
  expect(t.f.store.asOfEventSequence()).toBe(before+1);expect(t.f.store.listRuns(t.f.change.id)).toHaveLength(1);expect(t.f.task().usage.pending_reconciliation).toBe(true);expect(t.f.store.listRuntimeRecords('skill_invocation_observation',t.f.change.id)).toEqual(observations);
 }finally{parent.mockRestore();}
});
it('pins the selected-stop command before deferred family composition and replays its exact receipt',async()=>{
 const input=t.command(),fixed=structuredClone(input),id=t.invocations[0]!.id,before=t.f.store.asOfEventSequence();let queued=false;
 const first=await t.childControl.stop(id,input,()=>{if(!queued){queued=true;queueMicrotask(()=>{input.command_id=createInternalId();input.target.id=createInternalId();input.payload.reason='PUBLIC mutated during composition';});}});
 if('code'in first)throw Error(first.code);expect(t.f.store.transaction(tx=>tx.getCommandReceipt(fixed.command_id))).toBeDefined();expect(t.f.store.transaction(tx=>tx.getCommandReceipt(input.command_id))).toBeUndefined();
 const replay=await t.childControl.stop(id,fixed);if('code'in replay)throw Error(replay.code);expect(replay.command_result).toEqual(first.command_result);expect(t.f.store.asOfEventSequence()).toBe(before+1);
});
it('pins the complete-family stop request before the first installed session guard',async()=>{
 const input=t.command(),fixed=structuredClone(input),before=t.f.store.asOfEventSequence();let changed=false;
 const first=await t.service().stop(input,()=>{if(!changed){changed=true;input.command_id=createInternalId();input.payload.reason='PUBLIC family caller changed during guard';}});
 expect(t.f.store.transaction(tx=>tx.getCommandReceipt(fixed.command_id))).toBeDefined();
 expect(t.f.store.transaction(tx=>tx.getCommandReceipt(input.command_id))).toBeUndefined();
 const replay=await t.service().stop(fixed);if('code'in first||'code'in replay)throw Error('PUBLIC expected fixed cancellation');
 expect(replay.command_result).toEqual(first.command_result);expect(t.f.store.asOfEventSequence()).toBe(before+1);
 expect(t.f.store.listRuns(t.f.change.id)).toHaveLength(1);expect(t.f.task().usage.pending_reconciliation).toBe(true);
});
it('refuses local identity changes across deferred selected-stop composition before any Kernel or physical effect',async()=>{
 const input=t.command(),before=t.f.store.asOfEventSequence(),path=t.local.location.dataDirectory,calls=t.factory.mock.calls.length;let queued=false;
 try{await expect(t.childControl.stop(t.invocations[0]!.id,input,()=>{if(!queued){queued=true;queueMicrotask(()=>{t.local.location.dataDirectory=join(path,'PUBLIC-substituted');});}})).rejects.toMatchObject({code:'INPUT_CHANGED'});}
 finally{t.local.location.dataDirectory=path;}
 expect(t.f.store.asOfEventSequence()).toBe(before);expect(t.factory.mock.calls.length).toBe(calls);expect(t.f.store.transaction(tx=>tx.getCommandReceipt(input.command_id))).toBeUndefined();
});
