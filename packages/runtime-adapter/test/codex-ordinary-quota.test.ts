import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexOriginalMethodRuntime,inspectCodexMethodLogin } from '../src/codex-original-method.js';

// Actual stdio/immutable originals; PUBLIC account/quota/model. No real login,
// bill, purchased credits, reset-credit effect, method qualification or S1.
function fixture(mode='normal'){
 const root=mkdtempSync(join(tmpdir(),'cimiloop-codex-quota-')),script=join(root,'server.mjs'),log=join(root,'rpc.jsonl');
 writeFileSync(script,String.raw`import{createInterface}from'node:readline';import{appendFileSync}from'node:fs';let reads=0;const mode=process.argv[2],send=v=>process.stdout.write(JSON.stringify(v)+'\n');
 createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);appendFileSync(process.argv[3],JSON.stringify(r)+'\n');const ok=result=>send({id:r.id,result});
 if(r.method==='initialize')ok({});if(r.method==='account/read')ok({account:{type:'chatgpt',email:'PUBLIC@example.test'},requiresOpenaiAuth:true});
 if(r.method==='thread/start')ok({model:r.params.model,modelProvider:'openai',approvalPolicy:'never',activePermissionProfile:{id:'cimiloop-method'},instructionSources:[],thread:{id:'PUBLIC_THREAD'}});
 if(r.method==='mcpServerStatus/list')ok({data:[],nextCursor:null});
 if(r.method==='account/rateLimits/read'){reads++;const ordinaryUsageAllowed=mode==='blocked'?false:mode==='unknown'?null:reads===2&&mode==='depleted'?false:true;const result={ordinaryUsageAllowed,accountId:mode==='unidentified'?null:reads===2&&mode==='foreign'?'PUBLIC-other':'PUBLIC-account',rateLimits:{limitId:'codex',primary:{usedPercent:ordinaryUsageAllowed?100:0,windowDurationMins:300,resetsAt:2000000000},secondary:null,credits:{hasCredits:false,unlimited:false,balance:'0'}}};if(mode==='missing')delete result.ordinaryUsageAllowed;if(mode==='notify'&&reads===1)process.stdout.write(JSON.stringify({id:r.id,result})+'\n'+JSON.stringify({method:'account/rateLimits/updated',params:{rateLimits:result.rateLimits}})+'\n');else ok(result);}
 if(r.method==='turn/start'){ok({turn:{id:'PUBLIC_TURN'}});send({method:'item/completed',params:{threadId:'PUBLIC_THREAD',turnId:'PUBLIC_TURN',item:{type:'agentMessage',phase:'final_answer',text:'PUBLIC original response'}}});send({method:'thread/tokenUsage/updated',params:{threadId:'PUBLIC_THREAD',turnId:'PUBLIC_TURN',tokenUsage:{total:{inputTokens:5,cachedInputTokens:0,outputTokens:3,totalTokens:8,reasoningOutputTokens:0,cacheWriteInputTokens:0}}}});send({method:'turn/completed',params:{threadId:'PUBLIC_THREAD',turn:{id:'PUBLIC_TURN',status:'completed',error:null}}});}});`);
 const adapter=new CodexOriginalMethodRuntime({root:join(root,'originals'),command:{file:process.execPath,args:[script,mode,log],sha256:createHash('sha256').update(readFileSync(process.execPath)).digest('hex')},timeout_ms:10000});
 const input={operation_key:'PUBLIC_quota_operation',model:'gpt-6-luna',prompt:'PUBLIC original input',instructions:'Return PUBLIC response only',tools:[],output_schema:{type:'string'},usage_policy:'require_ordinary_permission/1.0.0'};
 const request=input as unknown as Parameters<typeof adapter.execute>[0],rpc=()=>{try{return readFileSync(log,'utf8').trim().split('\n').map(l=>JSON.parse(l));}catch{return [];}};
 return {root,adapter,request,rpc,turns:()=>rpc().filter(r=>r.method==='turn/start').length};
}
describe('Codex ordinary quota at the actual original send boundary',()=>{
 it('binds a fixed quota account to a new original request and retains it unchanged on replay',async()=>{
  const f=fixture(),request={...f.request,quota_account_digest:createHash('sha256').update('PUBLIC-account').digest('hex')};
  const original=await f.adapter.execute(request,()=>'',()=>{});expect(original.ordinary_quota!.before.account_id_digest).toBe(request.quota_account_digest);
  expect(f.adapter.readOriginal(request)).toEqual(original);expect(await f.adapter.execute(request,()=>'',()=>{})).toEqual(original);expect(f.turns()).toBe(1);
  expect(()=>f.adapter.readOriginal({...request,quota_account_digest:createHash('sha256').update('PUBLIC-other').digest('hex')})).toThrow('codex_original_input_changed');
 });
 it('refuses a different quota account from the pinned installation before sending a model turn',async()=>{
  const f=fixture(),request={...f.request,quota_account_digest:createHash('sha256').update('PUBLIC-other').digest('hex')};
  await expect(f.adapter.execute(request,()=>'',()=>{})).rejects.toThrow('codex_ordinary_permission_unavailable');expect(f.turns()).toBe(0);
  await expect(f.adapter.execute(request,()=>'',()=>{})).rejects.toThrow('codex_original_pending');expect(f.turns()).toBe(0);
 });
 it('inspects the same login and explicit quota permission without starting a thread or a model',async()=>{
  const f=fixture('blocked'),options={root:join(f.root,'inspection'),command:f.adapter.originalConfiguration.command,usage_policy:'require_ordinary_permission/1.0.0' as const};
  expect(await inspectCodexMethodLogin(options,()=>{})).toMatchObject({account_digest:expect.stringMatching(/^[a-f0-9]{64}$/),quota_snapshot:{ordinary_usage_allowed:false}});
  expect(f.rpc().filter(r=>r.method==='account/read')).toHaveLength(2);expect(f.turns()).toBe(0);expect(f.rpc().some(r=>r.method==='thread/start')).toBe(false);
 });
 it('retains explicit backend permission and post-turn depletion without inferring permission from percentages',async()=>{
  const f=fixture('depleted'),original=await f.adapter.execute(f.request,()=>{throw Error('No business tool');},()=>{});
  expect(original).toMatchObject({ordinary_quota:{before:{ordinary_usage_allowed:true,primary:{used_percent:100}},after:{ordinary_usage_allowed:false,primary:{used_percent:0}},costs_reconciled:false}});
  expect(f.adapter.readOriginal(f.request)).toEqual(original);expect(await f.adapter.execute(f.request,()=>{throw Error('No replay tool');},()=>{})).toEqual(original);expect(f.turns()).toBe(1);
  expect(f.rpc().filter(r=>r.method==='account/rateLimits/read')).toHaveLength(2);expect(f.rpc().filter(r=>r.method==='account/rateLimits/read').map(r=>r.params)).toEqual([{supportsLunaReserve:false,excludeResetCreditDetails:true},{supportsLunaReserve:false,excludeResetCreditDetails:true}]);
  expect(f.rpc().some(r=>/consume|purchase/i.test(String(r.method)))).toBe(false);
 });
 it.each(['blocked','unknown','missing','notify','unidentified'])('refuses %s permission before a model turn and never retries the pending operation',async mode=>{
  const f=fixture(mode);await expect(f.adapter.execute(f.request,()=>'',()=>{})).rejects.toThrow();expect(f.turns()).toBe(0);expect(f.adapter.readOriginal(f.request)).toBeNull();await expect(f.adapter.execute(f.request,()=>'',()=>{})).rejects.toThrow('codex_original_pending');expect(f.turns()).toBe(0);
 });
 it('retains Unknown when the post-turn quota belongs to a different account without repeating the turn',async()=>{
  const f=fixture('foreign');await expect(f.adapter.execute(f.request,()=>'',()=>{})).rejects.toThrow();expect(f.turns()).toBe(1);expect(f.adapter.readOriginal(f.request)).toBeNull();await expect(f.adapter.execute(f.request,()=>'',()=>{})).rejects.toThrow('codex_original_pending');expect(f.turns()).toBe(1);
 });
 it.each(['permission','params','missing-post-read','duplicate-reply','unidentified','early-pre-read','early-post-read','early-final-account-request','early-ready-account-request','account-refresh'])('independently refuses %s even when PUBLIC modified stdio has a matching seal digest',async mode=>{
  const f=fixture(),original=await f.adapter.execute(f.request,()=>'',()=>{}),path=original.original_ref.locator;
  let frames=readFileSync(path,'utf8').trimEnd().split('\n').map(line=>JSON.parse(line)),values=frames.map(frame=>JSON.parse(Buffer.from(frame.bytes,'base64').toString('utf8')));
  const requests=values.map((value,index)=>({value,index})).filter(({value})=>value.method==='account/rateLimits/read'),first=requests[0]!,last=requests[1]!;
  const responseIndex=values.findIndex(value=>value.id===first.value.id&&!value.method);
  if(mode==='permission'){values[responseIndex].result.ordinaryUsageAllowed=false;frames[responseIndex].bytes=Buffer.from(JSON.stringify(values[responseIndex])+'\n').toString('base64');}
  if(mode==='params'){values[first.index].params.supportsLunaReserve=true;frames[first.index].bytes=Buffer.from(JSON.stringify(values[first.index])+'\n').toString('base64');}
  if(mode==='missing-post-read')frames=frames.filter((_frame,index)=>index!==last.index&&!(values[index].id===last.value.id&&!values[index].method));
  if(mode==='duplicate-reply')frames.splice(responseIndex+1,0,structuredClone(frames[responseIndex]));
  if(mode==='unidentified')for(const {value} of requests){const index=values.findIndex(v=>v.id===value.id&&!v.method);values[index].result.accountId=null;frames[index].bytes=Buffer.from(JSON.stringify(values[index])+'\n').toString('base64');}
  if(mode==='early-pre-read'||mode==='early-post-read'){
   const selected=mode==='early-pre-read'?first:last,response=values.findIndex(v=>v.id===selected.value.id&&!v.method),pair=[frames[selected.index],frames[response]];
   const target=frames[mode==='early-pre-read'?values.findIndex(v=>v.method==='thread/start'):values.map((v,index)=>({v,index})).filter(({v})=>v.method==='account/read').at(-1)!.index];
   frames=frames.filter(frame=>!pair.includes(frame));frames.splice(frames.indexOf(target),0,...pair);
  }
  if(mode==='early-final-account-request'||mode==='early-ready-account-request'||mode==='account-refresh'){
   const accounts=values.map((value,index)=>({value,index})).filter(({value})=>value.method==='account/read'),selected=mode==='early-ready-account-request'?accounts[1]!:accounts.at(-1)!;
   if(mode==='account-refresh'){selected.value.params.refreshToken=true;frames[selected.index].bytes=Buffer.from(JSON.stringify(selected.value)+'\n').toString('base64');}
   else {const frame=frames[selected.index],target=frames[values.findIndex(v=>v.method===(mode==='early-ready-account-request'?'thread/start':'turn/start'))];frames=frames.filter(f=>f!==frame);frames.splice(frames.indexOf(target),0,frame);}
  }
  writeFileSync(path,frames.map(frame=>JSON.stringify(frame)).join('\n')+'\n');
  const sealPath=join(f.root,'originals',f.request.operation_key,'seal.json'),seal=JSON.parse(readFileSync(sealPath,'utf8'));seal.transcript_digest=createHash('sha256').update(readFileSync(path)).digest('hex');writeFileSync(sealPath,JSON.stringify(seal));
  expect(()=>f.adapter.readOriginal(f.request)).toThrow();expect(f.turns()).toBe(1);
 });
});
