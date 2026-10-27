import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {afterEach,expect,it} from 'vitest';
import {AgentStartLedger,CodexAgentUsageBudget,digest,type RuntimeContractPhaseResult} from '@cimiloop/runtime-adapter';import {createInternalId} from '@cimiloop/protocol/v2';
import type {RuntimeContractOriginal} from '../src/runtime-contract-local.js';
import {CimiLoopKernel} from '@cimiloop/kernel';import {createFlowProject,flowSuccess} from '../../../tests/fixtures/flow-project.js';import {createProviderProbe} from '../../../tests/fixtures/provider-probe.js';
import {LocalHumanRuntimeContract,type LocalProject} from '../src/index.js';
const closes:(()=>void)[]=[];afterEach(()=>{for(const close of closes.splice(0))close();});
function fixture(){const root=mkdtempSync(join(tmpdir(),'cimiloop-runtime-contract-app-')),f=createFlowProject(root),p=createProviderProbe(root,dirname(f.path)),kernel=new CimiLoopKernel({store:f.store,caller:f.caller});closes.push(()=>f.store.close());
 const registered=flowSuccess(kernel.execute(f.projectCommand('RegisterProvider',p.registration)));if(registered.command_type!=='RegisterProvider')throw Error('Descriptor expected');
 const local={store:f.store,kernel,instance:{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at},location:{repositoryKind:'git',repositoryPath:root,dataDirectory:dirname(f.path),databasePath:f.path,instancePath:join(dirname(f.path),'instance.json'),suggestedName:'PUBLIC technical contract'}} as unknown as LocalProject;
 const origin=AgentStartLedger.initialize(join(root,'origin'),{machine_digest:digest('PUBLIC machine').value,principal_digest:digest('PUBLIC principal').value});closes.push(()=>origin.close());const count={execute:0,release:0};let afterOpen=()=>{},afterRelease=()=>{};
 const services={async openOrigin(){return{origin,installation_digest:digest('PUBLIC installed').value,guard(){},release(){afterRelease();}};},async execution(){afterOpen();return{installation_digest:digest('PUBLIC installed').value,guard(){},release(){count.release++;},async execute(_o:unknown,_p:unknown,guard:()=>void){guard();count.execute++;throw Error('PUBLIC lost execution response');}};},readPhase:(_root:string,_scope:unknown,_origin:unknown,mode:'edit'|'review'):RuntimeContractPhaseResult=>({status:'Unknown',mode,effect_reverified:false,real_model_turns:null,costs_reconciled:false,business_execution_approved:false})};
 const request={request_id:createInternalId(),descriptor_id:registered.data.descriptor.id,max_elapsed_ms:600000},service=()=>new LocalHumanRuntimeContract(local,services);return{f,local,origin,count,request,service,services,setAfterOpen(value:()=>void){afterOpen=value;},setAfterRelease(value:()=>void){afterRelease=value;}};
}
it('retains one original after a lost technical response and never dispatches its unknown phase twice',async()=>{const f=fixture(),before=f.f.store.listEvents().length;expect(await f.service().start(f.request)).toMatchObject({request_id:f.request.request_id,outcome:'unknown',run_created:false});await f.service().start(f.request);await f.service().continue(f.request.request_id);expect(f.count).toMatchObject({execute:1,release:1});expect(f.origin.listExclusive('runtime_contract_request')).toHaveLength(1);expect(f.f.store.listProviderBindings()).toEqual([]);expect(f.f.store.listEvents()).toHaveLength(before);});
it('elects one original phase when the same first request arrives concurrently',async()=>{const f=fixture();await Promise.all([f.service().start(f.request),f.service().start(f.request)]);expect(f.count.execute).toBe(1);expect(f.origin.listExclusive('runtime_contract_phase')).toHaveLength(1);});
it('refuses changed inputs under an original id and retains cancellation without another dispatch',async()=>{const f=fixture();await f.service().start(f.request);await expect(f.service().start({...f.request,max_elapsed_ms:1000})).rejects.toThrow();expect(await f.service().cancel(f.request.request_id)).toMatchObject({cancellation_requested:true,run_created:false});await f.service().continue(f.request.request_id);expect(f.count.execute).toBe(1);});
it('rechecks the original Kernel after execution-open await and leaves the original request available without a phase dispatch',async()=>{const f=fixture(),method=f.local.kernel.authorizeRuntimeContractProbe;f.setAfterOpen(()=>{f.local.kernel.authorizeRuntimeContractProbe=()=>{throw Error('PUBLIC revoked');};});try{await expect(f.service().start(f.request)).rejects.toThrow();expect(f.count).toMatchObject({execute:0,release:1});expect(f.origin.listExclusive('runtime_contract_phase')).toEqual([]);expect(f.origin.listExclusive('runtime_contract_request')).toHaveLength(1);}finally{f.local.kernel.authorizeRuntimeContractProbe=method;}});
it('reads the elected capacity original after a competing Host writer wins with another start timestamp',async()=>{
 const f=fixture(),reserve=f.origin.reserveCapacity.bind(f.origin);let raced=false;
 f.origin.reserveCapacity=(policy,key,units,basis)=>{if(!raced&&basis&&typeof basis==='object'&&'format'in basis&&basis.format==='cimiloop/runtime-contract-original/1.0.0'){raced=true;const other={...structuredClone(basis),started_at:new Date(Date.parse(String(Reflect.get(basis,'started_at')))-1).toISOString()};reserve(policy,key,units,other);}return reserve(policy,key,units,basis);};
 expect(await f.service().start(f.request)).toMatchObject({request_id:f.request.request_id,run_created:false});expect(f.count.execute).toBe(0);await f.service().continue(f.request.request_id);expect(f.count.execute).toBe(1);
});
it('does not return a query result when Human authority disappears during original lease release',async()=>{
 const f=fixture();await f.service().start(f.request);let revoked=false;const owner=f.local.kernel.authorizeProviderProbeControl.bind(f.local.kernel);f.local.kernel.authorizeProviderProbeControl=()=>{if(revoked)throw Error('PUBLIC owner withdrawn');return owner();};f.setAfterRelease(()=>{revoked=true;});await expect(f.service().query(f.request.request_id)).rejects.toThrow('PUBLIC owner withdrawn');
});

function usageAccount(f:ReturnType<typeof fixture>){
 const budget=CodexAgentUsageBudget.initialize(f.origin,{account_digest:'1'.repeat(64),quota_account_digest:'2'.repeat(64),model_calls:8,output_tokens:16384});let releases=0;
 const lease={installation:{installation_digest:digest('PUBLIC installed').value},budget,guard(){},release(){releases++;}};
 Object.assign(f.services,{async openUsageBudget(){return lease;}});
 const read=()=>{const service=f.service(),method=Reflect.get(service,'usage');expect(method).toBeTypeOf('function');return Reflect.apply(method,service,[f.request.request_id]) as Promise<any>;};
 return{budget,lease,read,releases:()=>releases};
}
it('reads interrupted technical-phase reservations without re-dispatch, releasing capacity, or claiming an invoice',async()=>{
 const f=fixture(),a=usageAccount(f);await f.service().start(f.request);const original=f.origin.listExclusive('runtime_contract_request')[0]!.basis as RuntimeContractOriginal,phase=original.phases[0]!;
 a.budget.reserve({scope:phase.scope,call_id:'model_0001',request_digest:'4'.repeat(64),model_header_digest:'5'.repeat(64)},2048);const before=a.budget.snapshot(),events=f.f.store.asOfEventSequence();
 const result=await a.read();expect(result).toMatchObject({request_id:f.request.request_id,run_created:false,starts_model:false,costs_reconciled:false,cost_known:false,usage_complete:false,policy_digest:before.policy_digest});
 expect(result.phases[0]).toMatchObject({mode:'edit',operation_key:phase.scope.operation_key,usage:{state:'unknown',holds:1,unresolved:1,held_output_tokens:2048,observed_tokens:null}});expect(result.phases[1]).toMatchObject({mode:'review',usage:null});
 expect(await a.read()).toEqual(result);expect(a.budget.snapshot()).toEqual(before);expect(f.count.execute).toBe(1);expect(f.f.store.asOfEventSequence()).toBe(events);expect(a.releases()).toBe(2);
});
it('rejects usage from another installation and closes the borrowed account',async()=>{const f=fixture(),a=usageAccount(f);await f.service().start(f.request);a.lease.installation.installation_digest='6'.repeat(64);await expect(a.read()).rejects.toThrow();expect(a.releases()).toBe(1);expect(f.count.execute).toBe(1);});
it('rechecks Human authority after opening the usage account and still closes that lease',async()=>{
 const f=fixture(),a=usageAccount(f);await f.service().start(f.request);const owner=f.local.kernel.authorizeProviderProbeControl;Object.assign(f.services,{async openUsageBudget(){f.local.kernel.authorizeProviderProbeControl=()=>{throw Error('PUBLIC usage owner withdrawn');};return a.lease;}});
 try{await expect(a.read()).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(a.releases()).toBe(1);expect(f.count.execute).toBe(1);}finally{f.local.kernel.authorizeProviderProbeControl=owner;}
});
it('rejects a usage snapshot when the account guard adds another original reservation during the read',async()=>{
 const f=fixture(),a=usageAccount(f);await f.service().start(f.request);const original=f.origin.listExclusive('runtime_contract_request')[0]!.basis as RuntimeContractOriginal,scope=original.phases[0]!.scope;let checks=0;
 a.lease.guard=()=>{if(++checks===2)a.budget.reserve({scope,call_id:'model_0002',request_digest:'7'.repeat(64),model_header_digest:'8'.repeat(64)},2048);};await expect(a.read()).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(a.releases()).toBe(1);expect(a.budget.snapshot().held.model_calls).toBe(1);expect(f.count.execute).toBe(1);
});
