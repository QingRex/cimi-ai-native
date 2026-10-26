import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {AgentStartLedger,digest} from '@cimiloop/runtime-adapter';import {createInternalId} from '@cimiloop/protocol/v2';
import * as app from '../src/index.js';
import {createAgentRunProject} from '../../../tests/fixtures/agent-run-project.js';
import {installConstructedNativeFamilySkill} from '../../../tests/fixtures/agent-run-family-skill.js';
import type {OriginalNativeParentPreparation} from '../../../tests/fixtures/agent-run-family-native.js';
import {flowTime} from '../../../tests/fixtures/flow-project.js';
const closes:(()=>void)[]=[];afterEach(()=>{while(closes.length)closes.pop()!();vi.useRealTimers();});
vi.setConfig({testTimeout:120000});
function fixture(){
 vi.useFakeTimers({now:new Date(flowTime),toFake:['Date']});const root=mkdtempSync(join(tmpdir(),'cimiloop-skill-probe-')),f=createAgentRunProject(root),dataDirectory=dirname(f.path);closes.push(()=>f.store.close());
 const origin=AgentStartLedger.initialize(join(dataDirectory,'PUBLIC-probe-origin'),{machine_digest:digest('PUBLIC machine').value,principal_digest:digest('PUBLIC principal').value});closes.push(()=>origin.close());
 const skill=installConstructedNativeFamilySkill({f,dataDirectory,ledger:origin} as unknown as OriginalNativeParentPreparation),local={store:f.store,kernel:f.humanKernel,instance:{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:flowTime},location:{repositoryKind:'git',repositoryPath:root,dataDirectory,databasePath:f.path,instancePath:join(dataDirectory,'instance.json'),suggestedName:'PUBLIC isolated method'}} as unknown as app.LocalProject;
 const request={request_id:createInternalId(),descriptor_id:skill.descriptor.id,runtime_binding_id:f.runtime.id,method_name:'entry',input_ref:skill.input_ref,max_elapsed_ms:180000},count={prepare:0,launch:0,dispose:0,close:0};let afterOpen=()=>{};
 const services={async openOrigin(){return{origin,installation_digest:digest('PUBLIC installation').value,guard(){},release(){}};},async execution(){afterOpen();return{installation_digest:digest('PUBLIC installation').value,guard(){},release(){count.close++;},async prepare(_input:unknown,guard:()=>void){guard();count.prepare++;return{async launch(){guard();count.launch++;throw Error('PUBLIC lost Native response');},dispose(){count.dispose++;}};}};}};
 const service=()=>{const Type=Reflect.get(app,'LocalHumanSkillMethodProbe');expect(Type).toBeTypeOf('function');return Reflect.construct(Type,[local,services]) as {start(raw:unknown):Promise<any>;query(id:string):Promise<any>;cancel(id:string):Promise<any>};};return{f,origin,local,request,count,services,service,setAfterOpen(fn:()=>void){afterOpen=fn;}};
}
it('retains the first technical identity after an interrupted dispatch and never prepares or launches it twice, including after service reopening',async()=>{const f=fixture(),sequence=f.f.store.asOfEventSequence(),first=await f.service().start(f.request);expect(first).toMatchObject({request_id:f.request.request_id,outcome:'unknown',run_created:false,costs_reconciled:false});expect(f.count).toMatchObject({prepare:1,launch:1,dispose:1});expect(await f.service().start(f.request)).toMatchObject({request_id:f.request.request_id,run_created:false});expect(f.count).toMatchObject({prepare:1,launch:1,dispose:1});expect(f.f.store.asOfEventSequence()).toBe(sequence);});
it('refuses another payload under the original request id without opening another execution lease',async()=>{const f=fixture();await f.service().start(f.request);await expect(f.service().start({...f.request,max_elapsed_ms:60000})).rejects.toThrow();expect(f.count.prepare).toBe(1);expect(f.count.close).toBe(1);});
it('rechecks the real Human permission after the execution-open await and leaves no request claim or business record when revoked',async()=>{const f=fixture(),authorize=f.local.kernel.authorizeNamedSkillProbe;f.setAfterOpen(()=>{f.local.kernel.authorizeNamedSkillProbe=()=>{throw Error('PUBLIC revoked owner');};});try{await expect(f.service().start(f.request)).rejects.toThrow();expect(f.origin.listExclusive('skill_method_probe_request')).toEqual([]);expect(f.count).toMatchObject({prepare:0,launch:0,close:1});}finally{f.local.kernel.authorizeNamedSkillProbe=authorize;}});
it('admits only one sender when the same isolated request arrives concurrently',async()=>{const f=fixture();await Promise.all([f.service().start(f.request),f.service().start(f.request)]);expect(f.count).toMatchObject({prepare:1,launch:1,dispose:1});expect(f.origin.listExclusive('skill_method_probe_request')).toHaveLength(1);});
it('retains cancellation while Native preparation has not yet returned and blocks the later original launch',async()=>{
 const f=fixture();let prepared!:()=>void,finish!:(value:unknown)=>void;const ready=new Promise<void>(resolve=>{prepared=resolve;});
 Reflect.set(f.services,'execution',async()=>({installation_digest:digest('PUBLIC installation').value,guard(){},release(){f.count.close++;},async prepare(_input:unknown,guard:()=>void){f.count.prepare++;prepared();return new Promise(resolve=>{finish=resolve;}).then(()=>({async launch(){guard();f.count.launch++;},dispose(){f.count.dispose++;}}));}}));
 const pending=f.service().start(f.request);await ready;await f.service().cancel(f.request.request_id);finish(undefined);await pending;expect(f.count).toMatchObject({prepare:1,launch:0,dispose:1});expect(f.origin.listExclusive('skill_method_probe_cancellation')).toHaveLength(1);
});
it('uses the atomic original capacity ticket after a crash before the secondary index and never elects another sender',async()=>{
 const f=fixture(),issue=f.origin.issueExclusive.bind(f.origin),spy=vi.spyOn(f.origin,'issueExclusive').mockImplementation((namespace,id,basis)=>{if(namespace==='skill_method_probe_request')throw Error('PUBLIC lost index write');return issue(namespace,id,basis);});
 await expect(f.service().start(f.request)).rejects.toThrow('PUBLIC lost index write');spy.mockRestore();expect(f.origin.listExclusive('skill_method_probe_request')).toEqual([]);
 expect(await f.service().start(f.request)).toMatchObject({request_id:f.request.request_id,outcome:'unknown'});expect(f.count.prepare).toBe(0);expect(f.count.launch).toBe(0);expect(f.count.close).toBe(1);
});
it('keeps failed and Unknown historical reservations held and refuses a new dispatch when the original 64-request capacity is full',async()=>{
 const f=fixture();await f.service().start(f.request);const policy=f.origin.listExclusive('capacity_policy').find(row=>(row.basis as {binding?:{format?:string}})?.binding?.format==='cimiloop/isolated-skill-method-history/1.0.0');expect(policy).toBeDefined();
 // PUBLIC capacity-only reservations, not fabricated Native or method results.
 for(let index=0;index<63;index++)f.origin.reserveCapacity(policy!.ticket,digest('PUBLIC retained capacity '+index).value,{requests:1},{PUBLIC_capacity_only:true});
 await expect(f.service().start({...f.request,request_id:createInternalId()})).rejects.toThrow('64');expect(f.count.prepare).toBe(1);expect(f.origin.readCapacity(policy!.ticket).held.requests).toBe(64);
});
it('refuses missing real default account/storage composition before creating a probe request or capacity policy',async()=>{
 const f=fixture(),Type=Reflect.get(app,'LocalHumanSkillMethodProbe'),service=Reflect.construct(Type,[f.local,{openOrigin:f.services.openOrigin}]) as {start(raw:unknown):Promise<unknown>};
 await expect(service.start(f.request)).rejects.toThrow();expect(f.origin.listExclusive('skill_method_probe_request')).toEqual([]);expect(f.origin.listExclusive('capacity_policy')).toEqual([]);expect(f.count.launch).toBe(0);
});
