import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {createInternalId} from '@cimiloop/protocol/v2';
import {LocalAgentRuntimeControl,LocalAgentRuntimeObservation,LocalProjectError} from '@cimiloop/local-app';
import {collectAgentRuntimeOperation} from '../../../packages/runtime-adapter/dist/index.js';
import {claimAgentRuntimeOperation} from '../../../packages/runtime-adapter/src/agent-runtime-operation.js';
import {createAccountBillingEntry} from '../../../tests/fixtures/agent-account-billing-entry.js';
import {startWorkbench,type WorkbenchServer} from '../src/server.js';
// Actual HTTP/SQLite and original collection/receipt. Qualification and Native
// claim are explicitly constructed; no model, Native execution or fee approval.
describe('current Human session after original Agent waits',()=>{
 let x:ReturnType<typeof createAccountBillingEntry>,server:WorkbenchServer,cookie:string,csrf:string,dateSpy:ReturnType<typeof vi.spyOn>|undefined,originalStopInput:unknown;
 beforeAll(async()=>{x=createAccountBillingEntry();server=await startWorkbench({projectDir:x.root});const response=await fetch(server.origin+'/api/session',{method:'POST',headers:{Origin:server.origin,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});cookie=response.headers.get('set-cookie')!.split(';')[0]!;csrf=(await response.json() as {csrf:string}).csrf;},120000);
 afterEach(()=>{vi.restoreAllMocks();dateSpy=undefined;});
 afterAll(async()=>{await server?.close();x?.close();});
 const expire=()=>{const now=Date.now();dateSpy=vi.spyOn(Date,'now').mockReturnValue(now+8*60*60*1000+1);};
 const request=async(action:string,body?:unknown)=>{const response=await fetch(server.origin+'/api/agent-runs/'+x.runId+action,{headers:{Cookie:cookie,Connection:'close',...(body===undefined?{}:{Origin:server.origin,'Content-Type':'application/json','X-CimiLoop-CSRF':csrf})},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});return {status:response.status,body:await response.json() as any};};
 const command=(kind:string)=>({command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:'technical_owner',command_type:kind,target:{object_type:'run',id:x.runId},expected_revision:x.f.store.getRun(x.runId)!.revision,payload:kind==='CancelRun'?{reason:'Stop original operation through current Human request'}:{}});
 it('suppresses a query result when the session expires across the awaited original read',async()=>{
  const sequence=x.f.store.asOfEventSequence(),original=LocalAgentRuntimeControl.prototype.query;
  vi.spyOn(LocalAgentRuntimeControl.prototype,'query').mockImplementationOnce(async function(this:LocalAgentRuntimeControl,...args){const result=await original.apply(this,args);expire();return result;});
  expect(await request('')).toEqual({status:401,body:{ok:false,code:'SESSION_REQUIRED'}});expect(x.f.store.asOfEventSequence()).toBe(sequence);
 });
 it('suppresses late stop response while preserving and replaying the single original Kernel cancellation',async()=>{
  const input=command('CancelRun'),sequence=x.f.store.asOfEventSequence(),original=LocalAgentRuntimeControl.prototype.stop;originalStopInput=input;
  vi.spyOn(LocalAgentRuntimeControl.prototype,'stop').mockImplementationOnce(async function(this:LocalAgentRuntimeControl,...args){const result=await original.apply(this,args);expire();return result;});
  expect(await request('/stop',input)).toEqual({status:401,body:{ok:false,code:'SESSION_REQUIRED'}});expect(x.f.store.getRun(x.runId)!.cancel_requested).toBe(true);expect(x.f.store.asOfEventSequence()).toBe(sequence+1);
  dateSpy?.mockRestore();expect((await request('/stop',input)).status).toBe(200);expect(x.f.store.asOfEventSequence()).toBe(sequence+1);expect(x.f.store.listRuns(x.f.change.id)).toHaveLength(1);
 });
 it('blocks a new observation after awaited collection expires the session and resumes the same request',async()=>{
  claimAgentRuntimeOperation(x.local.location.dataDirectory,x.scope,{purpose:'PUBLIC constructed incomplete original HTTP operation'},{pid:1234,creation_ticks:'123456',image:process.execPath});
  const input=command('RecordRunObservation'),sequence=x.f.store.asOfEventSequence();let collections=0;
  const originalRecord=LocalAgentRuntimeObservation.prototype.record;
  vi.spyOn(LocalAgentRuntimeObservation.prototype,'record').mockImplementation(function(this:LocalAgentRuntimeObservation,raw,guard){
   const service=new LocalAgentRuntimeObservation(Reflect.get(this,'local'),{collect:async(...args)=>{const result=await collectAgentRuntimeOperation(...args);collections++;expire();return result;}});
   return originalRecord.call(service,raw,guard);
  });
  expect(await request('/observe',input)).toEqual({status:401,body:{ok:false,code:'SESSION_REQUIRED'}});expect(collections).toBe(1);expect(x.f.store.asOfEventSequence()).toBe(sequence);expect(x.f.store.listRuntimeRecords('run_observation',x.f.change.id)).toHaveLength(0);
  dateSpy?.mockRestore();const replay=await request('/observe',input);expect(replay.status).toBe(200);expect(replay.body).toHaveProperty('command_type','RecordRunObservation');expect(collections).toBe(1);expect(x.f.store.asOfEventSequence()).toBe(sequence+1);expect(x.f.task().usage).toMatchObject({pending_reconciliation:true,cost_reserved_micros:100});
 });
 it.each(['resolved promise','rejected promise','callable thenable','false verdict'])('refuses a non-void shared observation guard: %s',async kind=>{
  const input=command('RecordRunObservation'),sequence=x.f.store.asOfEventSequence();let collections=0;
  const service=new LocalAgentRuntimeObservation(x.local,{collect:async(...args)=>{const result=await collectAgentRuntimeOperation(...args);collections++;return result;}});
  const then=vi.fn(()=>{throw Error('PUBLIC callable thenable must not be invoked');}),callable=Object.assign(()=>undefined,{then});
  const invalid=()=>kind==='resolved promise'?Promise.resolve():kind==='rejected promise'?Promise.reject(Error('PUBLIC asynchronous guard rejection')):kind==='callable thenable'?callable:false;
  await expect(service.record(input,invalid)).rejects.toThrow('Synchronous original');expect(x.f.store.asOfEventSequence()).toBe(sequence);expect(then).not.toHaveBeenCalled();expect(collections).toBe(1);
  const receipt=await service.record(input,()=>{});expect(receipt).toHaveProperty('command_type','RecordRunObservation');expect(collections).toBe(1);expect(x.f.store.asOfEventSequence()).toBe(sequence+1);
  expect(await service.record(input,()=>{})).toEqual(receipt);expect(x.f.store.asOfEventSequence()).toBe(sequence+1);
 });
 it.each(['query','stop','collect','retryCancellation','recover'] as const)('prioritizes the current session when original %s rejects after waiting',async method=>{
  const sequence=x.f.store.asOfEventSequence(),original=LocalAgentRuntimeControl.prototype[method];let waited=false;
  vi.spyOn(LocalAgentRuntimeControl.prototype,method).mockImplementationOnce(async function(this:LocalAgentRuntimeControl,...args:unknown[]){await Reflect.apply(original,this,args);waited=true;expire();throw new LocalProjectError('PUBLIC delayed original rejection','CAPABILITY_UNAVAILABLE','conflict');});
  const result=await request(method==='query'?'':method==='retryCancellation'?'/cancel':'/'+method,method==='query'?undefined:method==='stop'?originalStopInput:{});
  expect(waited).toBe(true);expect(result).toEqual({status:401,body:{ok:false,code:'SESSION_REQUIRED'}});expect(x.f.store.asOfEventSequence()).toBe(sequence);expect(x.f.store.getRun(x.runId)!.cancel_requested).toBe(true);
  dateSpy?.mockRestore();if(method==='stop')expect((await request('/stop',originalStopInput)).status).toBe(200);expect(x.f.store.asOfEventSequence()).toBe(sequence);
 });
 it('keeps a failed original collection request recoverable when the session expires before rejection',async()=>{
  const input=command('RecordRunObservation'),sequence=x.f.store.asOfEventSequence(),originalRecord=LocalAgentRuntimeObservation.prototype.record;let collections=0;
  vi.spyOn(LocalAgentRuntimeObservation.prototype,'record').mockImplementationOnce(function(this:LocalAgentRuntimeObservation,raw,guard){const service=new LocalAgentRuntimeObservation(Reflect.get(this,'local'),{collect:async(...args)=>{await collectAgentRuntimeOperation(...args);collections++;expire();throw Error('PUBLIC original collection response unavailable');}});return originalRecord.call(service,raw,guard);});
  expect(await request('/observe',input)).toEqual({status:401,body:{ok:false,code:'SESSION_REQUIRED'}});expect(collections).toBe(1);expect(x.f.store.asOfEventSequence()).toBe(sequence);
  dateSpy?.mockRestore();expect((await request('/observe',input)).status).toBe(200);expect(x.f.store.asOfEventSequence()).toBe(sequence+1);expect(x.f.store.listRuns(x.f.change.id)).toHaveLength(1);expect(x.f.task().usage).toMatchObject({pending_reconciliation:true,cost_reserved_micros:100});
 });
});
