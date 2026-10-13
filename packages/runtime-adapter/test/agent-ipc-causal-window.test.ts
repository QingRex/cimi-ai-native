import {beforeEach,describe,it,expect} from 'vitest';
import * as adapter from '../src/index.js';
type Originals={status:string;header:unknown;exchanges:Record<string,unknown>[];unresolved:number;artifacts:unknown[]};
type Window={nonce:string;scope_digest:string;ordinal:string;request_digest:string;call_id:string;tool:string};
const project=(originals:Originals,current:Window|null)=>{
 const fn=Reflect.get(adapter,'projectAgentWorkspaceIpcCausalPrefix');expect(fn).toBeTypeOf('function');
 return Reflect.apply(fn,undefined,[originals,current]) as {prefix:Originals;current:Window|null};
};
const sha='a'.repeat(64),other='b'.repeat(64),nonce='00000000-0000-4000-8000-000000000001';
function setup(){
 const historical={ordinal:'0001',request_digest:other,reply_digest:sha,request:{tool:'run_skill',call_id:'sdk_old'},reply:{outcome:'completed',receipt:{PUBLIC:'historical child must still be independently verified'}},state:'reply_recorded'};
 const request={tool:'run_skill',call_id:'sdk_current'},tail={ordinal:'0002',request_digest:sha,reply_digest:null,request,reply:null,state:'unknown'};
 const originals={status:'Observed',header:{nonce,endpoint:{scope_digest:sha}},exchanges:[historical,tail],unresolved:1,artifacts:[{name:'0002/request.raw',digest:sha}]};
 const current={nonce,scope_digest:sha,ordinal:'0002',request_digest:sha,call_id:'sdk_current',tool:'run_skill'};return{originals,current,historical,tail};
}
// Pure projection contract only; these PUBLIC records do not prove OS identity,
// Native effects, model/account qualification, real Skill or S1.
describe('one exact original IPC request causal window',()=>{
 beforeEach(()=>expect(Reflect.get(adapter,'projectAgentWorkspaceIpcCausalPrefix')).toBeTypeOf('function'));
 it('excludes only the exact in-flight tail and retains a completed Skill as an effect requiring independent verification',()=>{
  const s=setup(),saved=structuredClone(s.originals),result=project(s.originals,s.current);
  expect(result.prefix.exchanges).toEqual([s.historical]);expect(result.prefix.unresolved).toBe(0);expect(result.current).toEqual(s.current);expect(s.originals).toEqual(saved);
  Reflect.set(result.prefix.exchanges[0]!.reply as object,'PUBLIC','changed detached projection');expect(s.originals).toEqual(saved);
 });
 it.each(['nonce','scope_digest','ordinal','request_digest','call_id','tool'])('refuses a different current %s instead of ignoring unresolved effects',key=>{
  const s=setup();expect(()=>project(s.originals,{...s.current,[key]:key==='ordinal'?'0001':key.endsWith('digest')?other:'foreign'})).toThrow();
 });
 it('refuses an unresolved tail without the live authenticated request context',()=>{const s=setup();expect(()=>project(s.originals,null)).toThrow();});
 it('refuses an additional unresolved historical request',()=>{const s=setup();s.originals.exchanges[0]={...s.historical,state:'unknown',reply:null,reply_digest:null};s.originals.unresolved=2;expect(()=>project(s.originals,s.current)).toThrow();});
 it('refuses a current request followed by any later exchange',()=>{const s=setup();s.originals.exchanges.push({...s.historical,ordinal:'0003'});expect(()=>project(s.originals,s.current)).toThrow();});
 it('refuses a mismatched unresolved count instead of normalizing the ledger',()=>{const s=setup();s.originals.unresolved=0;expect(()=>project(s.originals,s.current)).toThrow();});
 it('accepts a complete historical prefix without inventing an active request',()=>{const s=setup();s.originals.exchanges.pop();s.originals.unresolved=0;const result=project(s.originals,null);expect(result.prefix).toEqual(s.originals);expect(result.current).toBeNull();});
 it('permits only model_step or run_skill as an exact pending request and never a file effect',()=>{const s=setup();s.originals.exchanges[1]={...s.tail,request:{...s.tail.request,tool:'replace_file'}};expect(()=>project(s.originals,{...s.current,tool:'replace_file'})).toThrow();});
 it('preserves the complete allowed original history without applying one wire frame node limit to the entire ledger',()=>{
  const s=setup(),record={role:'user',parts:Array.from({length:50},(_,i)=>({type:'text',text:'PUBLIC bounded original model text '+i}))};
  s.originals.exchanges=Array.from({length:127},(_,i)=>({...s.historical,ordinal:String(i+1).padStart(4,'0'),request:i%2===0?{tool:'model_step',call_id:'model_'+String(Math.floor(i/2)+1).padStart(4,'0'),prompt:[record]}:s.historical.request}));
  s.originals.exchanges.push({...s.tail,ordinal:'0128'});s.current.ordinal='0128';const before=structuredClone(s.originals),result=project(s.originals,s.current);
  expect(result.prefix.exchanges).toHaveLength(63);expect(s.originals).toEqual(before);expect(result.current).toEqual(s.current);
 });
 it('refuses more than the fixed 128 original exchanges instead of silently discarding history',()=>{
  const s=setup();s.originals.exchanges=Array.from({length:128},(_,i)=>({...s.historical,ordinal:String(i+1).padStart(4,'0')}));s.originals.exchanges.push({...s.tail,ordinal:'0129'});s.current.ordinal='0129';expect(()=>project(s.originals,s.current)).toThrow();
 });
 it('refuses a fabricated current context when its original reply is already recorded',()=>{const s=setup();s.originals.exchanges[1]={...s.tail,state:'reply_recorded',reply:{outcome:'completed',receipt:s.historical.reply.receipt},reply_digest:other};s.originals.unresolved=0;expect(()=>project(s.originals,s.current)).toThrow();});
});
