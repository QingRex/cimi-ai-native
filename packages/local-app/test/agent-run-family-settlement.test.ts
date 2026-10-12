import{beforeAll,afterAll,it,expect,vi}from'vitest';
import{join}from'node:path';import{writeFileSync,readFileSync}from'node:fs';
import{createOriginalLocalFamily}from'./original-family-settlement-fixture.js';
import{readOriginalLocalAgentRunCosts}from'../src/agent-run-family-costs-local.js';
import{parseOriginalAgentCostProofBytes,LocalAgentRunResultVerifier}from'../src/agent-runtime-observation-local.js';
import{LocalHumanAgentRunCostObservation}from'../src/agent-run-cost-observation-local.js';
import{openLocalProject}from'../src/project.js';import{writeInstance}from'../src/instance.js';
import{createInternalId}from'@cimiloop/protocol/v2';
let x:Awaited<ReturnType<typeof createOriginalLocalFamily>>;
beforeAll(async()=>{x=await createOriginalLocalFamily();},120000);afterAll(async()=>{vi.restoreAllMocks();await x?.close();});
const read=(port:unknown=x.familySkills,reader:unknown=x.f.store)=>{const value=Reflect.apply(readOriginalLocalAgentRunCosts,undefined,[x.repo,x.dataDirectory,x.parent,x.account,reader,port]);if(value.format!=='cimiloop/agent-run-family-cost-evidence/2.0.0')throw Error('Expected explicit family v2 proof');return value;};
it('requires a settled Kernel child and an independent historical reader before including a closed unregistered child in final family costs',()=>{
 expect(()=>read()).toThrow();x.settleChild();expect(()=>read(null)).toThrow();const before=x.f.store.asOfEventSequence(),costs=read();
 expect(costs).toMatchObject({format:'cimiloop/agent-run-family-cost-evidence/2.0.0',costs:{holds:1,closed_zero_scopes:1,costs_reconciled:true,cash_charged_micros:12,credit_charged_micro_units:4}});expect(costs.child_results).toHaveLength(1);expect(read()).toEqual(costs);expect(x.f.store.asOfEventSequence()).toBe(before);expect(x.f.currentRun()).toMatchObject({status:'Unknown',reservation_released:false});expect(x.f.task().usage.cost_reserved_micros).toBe(100);expect(x.sends()).toBe(1);
});
it('rejects forged or asynchronous historical child readers and omitted current Kernel children',()=>{
 const reader=x.familySkills.readResult;
 for(const readResult of [()=>{throw Error('PUBLIC original qualification absent');},(...args:Parameters<typeof reader>)=>({...reader(...args),usage:{cost_known:true,cost_micros:1,currency:'USD'}}),async(...args:Parameters<typeof reader>)=>reader(...args)])expect(()=>read({...x.familySkills,readResult})).toThrow();
 const snapshot=new Proxy(x.f.store,{get(target,key){if(key==='listRuntimeRecords')return(kind:string,...args:unknown[])=>kind==='skill_invocation'?[]:Reflect.apply(Reflect.get(target,key),target,[kind,...args]);const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});expect(()=>read(x.familySkills,snapshot)).toThrow();
});
it('rechecks original closed dispatch even with unchanged Kernel NotStarted and final bills',()=>{
 const path=join(x.dataDirectory,'skill-invocation-start-originals',x.f.project.id,x.invocation.invocation_key,'dispatch.json'),bytes=readFileSync(path);writeFileSync(path,'{}');try{expect(()=>read()).toThrow();}finally{writeFileSync(path,bytes);}expect(read().costs.cash_charged_micros).toBe(12);
});
it('explicitly accepts bounded canonical family v2 while keeping unknown versions and noncanonical JSON rejected',()=>{
 const proof={format:'cimiloop/agent-billed-observation-proof/1.0.0',cost_evidence:read()},bytes=Buffer.from(JSON.stringify(proof));expect(parseOriginalAgentCostProofBytes(bytes)).toEqual(proof);expect(()=>parseOriginalAgentCostProofBytes(Buffer.from(JSON.stringify({...proof,cost_evidence:{...proof.cost_evidence,format:'cimiloop/agent-run-family-cost-evidence/3.0.0'}})))).toThrow();expect(()=>parseOriginalAgentCostProofBytes(Buffer.from(JSON.stringify(proof,null,2)))).toThrow();
});
it('carries the trusted family reader through shared fee observation and replays response loss without reopening or mistaking costs for Native terminal',async()=>{
 writeInstance(join(x.dataDirectory,'instance.json'),{schema_version:'1.0.0',instance_id:x.f.project.instance_id,project_id:x.f.project.id,actor_id:x.f.actor.id,created_at:x.f.project.created_at});const human=openLocalProject({projectDir:x.repo});
 const request=(kind:'RecordRunObservation'|'ReconcileRun'='RecordRunObservation')=>({command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:'technical_owner',command_type:kind,target:{object_type:'run',id:x.parent.run_id},expected_revision:x.f.currentRun().revision,payload:{}});
 try{
  const before=x.f.store.asOfEventSequence();await expect(new LocalHumanAgentRunCostObservation(human,()=>({account:x.account,release(){}})).record(request())).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(x.f.store.asOfEventSequence()).toBe(before);
  let opens=0;const service=new LocalHumanAgentRunCostObservation(human,()=>{opens++;return{account:x.account,familySkills:x.familySkills,release(){throw Error('PUBLIC response lost after original fee commit');}};});const command=request();
  await expect(service.record(command)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(x.f.store.asOfEventSequence()).toBe(before+1);
  const replay=new LocalHumanAgentRunCostObservation(human,()=>{throw Error('PUBLIC must not reopen factory');}),receipt=await replay.record(command);expect(receipt).toMatchObject({command_type:'RecordRunObservation',data:{run:{status:'Unknown',cost_charged_micros:12}}});expect(await replay.record(command)).toEqual(receipt);expect(opens).toBe(1);
  const observation=x.f.store.listRuntimeRecords('run_observation',x.f.change.id).find(o=>o.run_ref.id===x.parent.run_id)!,record=x.f.store.getRuntimeRecord('run_record',x.original.record_id)!;
  if(record.run_kind!=='agent'||observation.raw_result_ref.resource_type!=='agent_run')throw Error('Original Agent fee record expected');const context=x.f.store.getRuntimeRecord('context_manifest',record.context_ref.id)!;if(!('runtime_binding'in context))throw Error('Original Agent context expected');
  const reference=observation.raw_result_ref,domain={definition:x.f.store.getExecutionRecord('task_definition',record.definition_ref.id)!,contract:x.f.store.getIntentRecord('contract_version',record.contract_ref.id)!,plan:x.f.store.getIntentRecord('plan_version',record.plan_ref.id)!,run:x.f.currentRun()};
  expect(()=>new LocalAgentRunResultVerifier(x.repo,x.dataDirectory,()=>x.account,x.f.store).readRunResult(x.f.project,record,context,reference,domain)).toThrow();
  expect(new LocalAgentRunResultVerifier(x.repo,x.dataDirectory,()=>x.account,x.f.store,x.familySkills).readRunResult(x.f.project,record,context,reference,domain)).toEqual(observation.report);
  await expect(new LocalHumanAgentRunCostObservation(human,()=>({account:x.account,familySkills:x.familySkills,release(){}})).reconcile(request('ReconcileRun'))).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});
  expect(x.f.store.asOfEventSequence()).toBe(before+1);expect(x.f.task().usage).toMatchObject({cost_consumed_micros:12,cost_reserved_micros:88,pending_reconciliation:true});expect(x.f.task().status).not.toBe('Satisfied');expect(x.sends()).toBe(1);
 }finally{human.store.close();}
},120000);
it('rejects an independently read stored child report whose cash differs from its actual bill even when the parent total exceeds that report',async()=>{
 const y=await createOriginalLocalFamily('executed');try{
  y.settleChild();const report=y.f.store.listRuntimeRecords('skill_invocation_observation',y.f.change.id)[0]!.report;expect(report.usage).toMatchObject({cost_known:true,cost_micros:17,currency:'USD'});expect(y.account.readRunFamilyCosts(y.parent,[y.custody.accountScope(y.f.project,y.invocation,y.parent,y.original.record_id).child])).toMatchObject({cash_charged_micros:24,costs_reconciled:true});
  expect(()=>Reflect.apply(readOriginalLocalAgentRunCosts,undefined,[y.repo,y.dataDirectory,y.parent,y.account,y.f.store,y.familySkills])).toThrow();expect(y.sends()).toBe(2);
 }finally{await y.close();}
},120000);
it('joins an executed child only when its independently read report cash exactly equals its own authenticated original bill',async()=>{
 const y=await createOriginalLocalFamily('executed',12);try{y.settleChild();const proof=Reflect.apply(readOriginalLocalAgentRunCosts,undefined,[y.repo,y.dataDirectory,y.parent,y.account,y.f.store,y.familySkills]);if(proof.format!=='cimiloop/agent-run-family-cost-evidence/2.0.0')throw Error('Expected explicit family v2 proof');expect(proof.costs).toMatchObject({cash_charged_micros:24,credit_charged_micro_units:8,closed_zero_scopes:0});expect(proof.child_results[0]!.usage).toMatchObject({cost_known:true,cost_micros:12,currency:'USD'});expect(y.sends()).toBe(2);expect(y.f.task().status).not.toBe('Satisfied');}finally{await y.close();}
},120000);
