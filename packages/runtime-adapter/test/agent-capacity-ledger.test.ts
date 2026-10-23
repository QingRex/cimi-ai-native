import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentStartLedger } from '../src/agent-start-ledger.js';
import { digest } from '../src/files.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Actual SQLite, immutable rows and physical identities; PUBLIC host identity.
// Retain each new root. No production account, model or bill is claimed.
const host={machine_digest:digest('PUBLIC capacity machine').value,principal_digest:digest('PUBLIC capacity principal').value};
function setup(){const root=join(mkdtempSync(join(tmpdir(),'cimiloop-capacity-')),'origin'),ledger=AgentStartLedger.initialize(root,host);const policy=ledger.issueExclusive('capacity_policy',digest('account').value,{format:'cimiloop/host-capacity-policy/1.0.0',binding:{account:'PUBLIC'},limits:{model_calls:2,output_tokens:3000}});return{root,ledger,policy};}
describe('original Host atomic capacity reservation',()=>{
 it.each([false,true])('serializes independent processes racing for the last capacity slot, same request=%s',async sameRequest=>{
  const f=setup(),policy=f.ledger.issueExclusive('capacity_policy',digest('last slot').value,{format:'cimiloop/host-capacity-policy/1.0.0',binding:{account:'PUBLIC'},limits:{model_calls:1,output_tokens:2048}});f.ledger.close();
  const contenders=[0,1].map(n=>{const child=spawn(process.execPath,[fileURLToPath(new URL('../../../tests/fixtures/agent-capacity-contender.mjs',import.meta.url)),f.root,JSON.stringify(host),JSON.stringify(policy),digest('contender'+(sameRequest?0:n)).value],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});let stderr='';child.stderr!.on('data',b=>{stderr+=b.toString();});const ready=new Promise<void>((done,reject)=>{child.on('message',v=>{if(v==='ready')done();});child.once('error',reject);child.once('exit',()=>reject(Error('Contender ended before ready: '+stderr)));});const result=new Promise<{created?:boolean;error?:string}>((done,reject)=>{child.on('message',v=>{if(v!=='ready')done(v as {created?:boolean;error?:string});});child.once('error',reject);});const ended=new Promise<number|null>((done,reject)=>{child.once('close',done);child.once('error',reject);});return{child,ready,result,ended};});
  await Promise.all(contenders.map(c=>c.ready));for(const c of contenders)c.child.send('go');const results=await Promise.all(contenders.map(c=>c.result));expect(await Promise.all(contenders.map(c=>c.ended))).toEqual([0,0]);expect(results.filter(r=>r.created===true)).toHaveLength(1);if(sameRequest)expect(results.filter(r=>r.created===false)).toHaveLength(1);else expect(results.filter(r=>r.error==='agent_capacity_exhausted')).toHaveLength(1);
  const reopened=AgentStartLedger.open(f.root,host);try{expect(reopened.readCapacity(policy)).toMatchObject({held:{model_calls:1,output_tokens:2048},remaining:{model_calls:0,output_tokens:0}});}finally{reopened.close();}
 },45000);
 it('holds the full requested maximum, retains Unknown and rejects oversubscription',()=>{const f=setup();try{
  expect(f.ledger.reserveCapacity(f.policy,digest('one').value,{model_calls:1,output_tokens:2048},{request:'one'})).toMatchObject({created:true});
  expect(()=>f.ledger.reserveCapacity(f.policy,digest('two').value,{model_calls:1,output_tokens:2048},{request:'two'})).toThrow('agent_capacity_exhausted');
  expect(f.ledger.readCapacity(f.policy)).toMatchObject({held:{model_calls:1,output_tokens:2048},remaining:{model_calls:1,output_tokens:952}});
 }finally{f.ledger.close();}});
 it('returns the same immutable reservation after restart without charging twice',()=>{const f=setup(),id=digest('same').value;const first=f.ledger.reserveCapacity(f.policy,id,{model_calls:1,output_tokens:1000},{request:'same'});f.ledger.close();const reopened=AgentStartLedger.open(f.root,host);try{
  expect(reopened.reserveCapacity(f.policy,id,{model_calls:1,output_tokens:1000},{request:'same'})).toEqual({...first,created:false});
  expect(reopened.readCapacity(f.policy)).toMatchObject({held:{model_calls:1,output_tokens:1000}});
  expect(()=>reopened.reserveCapacity(f.policy,id,{model_calls:1,output_tokens:999},{request:'same'})).toThrow('agent_start_exclusive_conflict');
 }finally{reopened.close();}});
 it('refuses foreign policies, incomplete vectors and zero-effect reservations',()=>{const f=setup();try{
  const ordinary=f.ledger.issue({format:'cimiloop/host-capacity-policy/1.0.0',binding:{},limits:{model_calls:2}});
  expect(()=>f.ledger.reserveCapacity(ordinary,digest('foreign').value,{model_calls:1},{})).toThrow('agent_capacity_policy_invalid');
  for(const units of[{model_calls:1},{model_calls:0,output_tokens:0},{model_calls:1,output_tokens:-1},{model_calls:1,output_tokens:1,extra:1}])expect(()=>f.ledger.reserveCapacity(f.policy,digest(JSON.stringify(units)).value,units,{})).toThrow('agent_capacity_units_invalid');
  expect(f.ledger.readCapacity(f.policy).reservations).toHaveLength(0);
 }finally{f.ledger.close();}});
});
