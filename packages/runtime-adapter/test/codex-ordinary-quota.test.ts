import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CodexOriginalMethodRuntime,inspectCodexMethodLogin } from '../src/codex-original-method.js';
import { AgentStartLedger } from '../src/agent-start-ledger.js';

// Actual stdio/immutable originals; PUBLIC account/quota/model. No real login,
// bill, purchased credits, reset-credit effect, method qualification or S1.
const ledgers:AgentStartLedger[]=[];
afterAll(()=>{for(const ledger of ledgers)ledger.close();});
function fixture(mode='normal',transportPolicy=false){
 const root=mkdtempSync(join(tmpdir(),'cimiloop-codex-quota-')),script=join(root,'server.mjs'),log=join(root,'rpc.jsonl');
 const origin=AgentStartLedger.initialize(join(root,'host'),{machine_digest:'1'.repeat(64),principal_digest:'2'.repeat(64)});ledgers.push(origin);
 writeFileSync(script,String.raw`import{createInterface}from'node:readline';import{appendFileSync}from'node:fs';let reads=0;const mode=process.argv[2],send=v=>process.stdout.write(JSON.stringify(v)+'\n');
 createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);appendFileSync(process.argv[3],JSON.stringify(r)+'\n');const ok=result=>send({id:r.id,result});
 if(r.method==='initialize')ok({});if(r.method==='account/read')ok({account:{type:'chatgpt',email:'PUBLIC@example.test'},requiresOpenaiAuth:true});
 if(r.method==='thread/start')ok({model:r.params.model,modelProvider:'openai',approvalPolicy:'never',activePermissionProfile:{id:'cimiloop-method'},instructionSources:[],thread:{id:'PUBLIC_THREAD'}});
 if(r.method==='mcpServerStatus/list')ok({data:[],nextCursor:null});
 if(r.method==='account/rateLimits/read'){reads++;const ordinaryUsageAllowed=mode==='blocked'?false:mode==='unknown'?null:reads===2&&mode==='depleted'?false:true;const result={ordinaryUsageAllowed,accountId:mode==='unidentified'?null:reads===2&&mode==='foreign'?'PUBLIC-other':'PUBLIC-account',rateLimits:{limitId:'codex',primary:{usedPercent:ordinaryUsageAllowed?100:0,windowDurationMins:300,resetsAt:2000000000},secondary:null,credits:{hasCredits:false,unlimited:false,balance:'0'}}};if(mode==='missing')delete result.ordinaryUsageAllowed;if(mode==='notify'&&reads===1)process.stdout.write(JSON.stringify({id:r.id,result})+'\n'+JSON.stringify({method:'account/rateLimits/updated',params:{rateLimits:result.rateLimits}})+'\n');else ok(result);}
 if(r.method==='turn/start'){ok({turn:{id:'PUBLIC_TURN'}});send({method:'item/completed',params:{threadId:'PUBLIC_THREAD',turnId:'PUBLIC_TURN',item:{type:'agentMessage',phase:'final_answer',text:'PUBLIC original response'}}});send({method:'thread/tokenUsage/updated',params:{threadId:'PUBLIC_THREAD',turnId:'PUBLIC_TURN',tokenUsage:{total:{inputTokens:5,cachedInputTokens:0,outputTokens:3,totalTokens:8,reasoningOutputTokens:0,cacheWriteInputTokens:0}}}});send({method:'turn/completed',params:{threadId:'PUBLIC_THREAD',turn:{id:'PUBLIC_TURN',status:'completed',error:null}}});}});`);
 const adapter=new CodexOriginalMethodRuntime({root:join(root,'originals'),command:{file:process.execPath,args:[script,mode,log],sha256:createHash('sha256').update(readFileSync(process.execPath)).digest('hex')},timeout_ms:10000,...(transportPolicy?{usage_policy:'require_ordinary_permission/1.0.0' as const}:{})},false,origin);
 const input={operation_key:'PUBLIC_quota_operation',model:'gpt-6-luna',prompt:'PUBLIC original input',instructions:'Return PUBLIC response only',tools:[],output_schema:{type:'string'},usage_policy:'require_ordinary_permission/1.0.0'};
 const request=input as unknown as Parameters<typeof adapter.execute>[0],rpc=()=>{try{return readFileSync(log,'utf8').trim().split('\n').map(l=>JSON.parse(l));}catch{return [];}};
 return {root,adapter,origin,request,rpc,turns:()=>rpc().filter(r=>r.method==='turn/start').length};
}
describe('Codex ordinary quota at the actual original send boundary',()=>{
 it('refuses a complete downgrade after all quota frames and self-seal evidence have been rewritten',async()=>{
  const f=fixture('normal',true),request={...f.request};Reflect.deleteProperty(request,'usage_policy');
  const original=await f.adapter.execute(request,()=>'',()=>{}),path=join(f.root,'originals',request.operation_key,'start.json');
  const claim=JSON.parse(readFileSync(path,'utf8'));claim.format='cimiloop/codex-method-start/3.0.0';delete claim.transport_usage_policy;
  writeFileSync(path,JSON.stringify(claim));
  const frames=readFileSync(original.original_ref.locator,'utf8').trimEnd().split('\n').map(line=>JSON.parse(line));
  const values=frames.map(frame=>JSON.parse(Buffer.from(frame.bytes,'base64').toString('utf8')));
  const quotaIds=new Set(values.filter(value=>value.method==='account/rateLimits/read').map(value=>value.id));
  const retained=frames.filter((_frame,index)=>!quotaIds.has(values[index].id)&&values[index].method!=='account/rateLimits/updated');
  writeFileSync(original.original_ref.locator,retained.map(frame=>JSON.stringify(frame)).join('\n')+'\n');
  const sealPath=join(f.root,'originals',request.operation_key,'seal.json'),seal=JSON.parse(readFileSync(sealPath,'utf8'));
  seal.claim_digest=createHash('sha256').update(readFileSync(path)).digest('hex');seal.transcript_digest=createHash('sha256').update(readFileSync(original.original_ref.locator)).digest('hex');
  writeFileSync(sealPath,JSON.stringify(seal));
  expect(()=>f.adapter.readOriginal(request)).toThrow();expect(f.turns()).toBe(1);
 });
 it('transport policy gates a new ordinary method without mutating its original request',async()=>{
  const f=fixture('normal',true),request={...f.request};Reflect.deleteProperty(request,'usage_policy');const raw=JSON.stringify(request);
  const original=await f.adapter.execute(request,()=>'',()=>{});
  expect(original).toMatchObject({ordinary_quota:{before:{ordinary_usage_allowed:true},after:{ordinary_usage_allowed:true},costs_reconciled:false}});
  expect(JSON.stringify(request)).toBe(raw);expect(original.input_digest).toBe(createHash('sha256').update(raw).digest('hex'));
  expect(JSON.parse(readFileSync(join(f.root,'originals',request.operation_key,'start.json'),'utf8'))).toMatchObject({format:'cimiloop/codex-method-start/7.0.0',transport_usage_policy:'require_ordinary_permission/1.0.0',request});
  expect(f.adapter.readOriginal(request)).toEqual(original);expect(await f.adapter.execute(request,()=>'',()=>{})).toEqual(original);expect(f.turns()).toBe(1);
  expect(f.origin.listExclusive('codex_method_transport')).toHaveLength(1);
 });
 it('requires independent original custody before creating a mandatory transport root',()=>{
  const f=fixture(),options={...f.adapter.originalConfiguration,root:join(f.root,'no-origin'),usage_policy:'require_ordinary_permission/1.0.0' as const};
  expect(()=>new CodexOriginalMethodRuntime(options)).toThrow('codex_transport_origin_required');expect(existsSync(options.root)).toBe(false);expect(f.turns()).toBe(0);
 });
 it('retains the independent registration after start loss and never fills or resends that original',async()=>{
  const f=fixture('normal',true),request={...f.request};Reflect.deleteProperty(request,'usage_policy');await f.adapter.execute(request,()=>'',()=>{});
  const start=join(f.root,'originals',request.operation_key,'start.json'),rows=f.origin.listExclusive('codex_method_transport');renameSync(start,start+'.retained');
  expect(f.adapter.readOriginal(request)).toBeNull();await expect(f.adapter.execute(request,()=>'',()=>{})).rejects.toThrow('codex_original_pending');
  expect(existsSync(start)).toBe(false);expect(f.origin.listExclusive('codex_method_transport')).toEqual(rows);expect(f.turns()).toBe(1);
 });
 it.runIf(process.platform==='win32').each(['root','operation'])('does not resend a lost original through a Windows %s case alias',async mode=>{
  const f=fixture('normal',true),request={...f.request};Reflect.deleteProperty(request,'usage_policy');await f.adapter.execute(request,()=>'',()=>{});
  const operation=join(f.root,'originals',request.operation_key),start=join(operation,'start.json');renameSync(operation,operation+'.retained');
  const options=f.adapter.originalConfiguration,aliasRequest={...request};
  if(mode==='root')options.root=options.root.toUpperCase();else aliasRequest.operation_key=aliasRequest.operation_key.toUpperCase();
  const alias=new CodexOriginalMethodRuntime(options,false,f.origin);
  await expect(alias.execute(aliasRequest,()=>'',()=>{})).rejects.toThrow('codex_original_pending');
  expect(existsSync(start)).toBe(false);expect(existsSync(operation)).toBe(false);expect(f.origin.listExclusive('codex_method_transport')).toHaveLength(1);expect(f.turns()).toBe(1);
 });
 it('refuses a same-byte replaced operation directory using its independent physical registration',async()=>{
  const f=fixture('normal',true),request={...f.request};Reflect.deleteProperty(request,'usage_policy');await f.adapter.execute(request,()=>'',()=>{});
  const path=join(f.root,'originals',request.operation_key);renameSync(path,path+'.retained');cpSync(path+'.retained',path,{recursive:true});
  expect(()=>f.adapter.readOriginal(request)).toThrow('codex_original_input_changed');expect(f.turns()).toBe(1);
 });
 it('does not recreate a missing transport registration while reading a new sealed original',async()=>{
  const f=fixture('normal',true),request={...f.request};Reflect.deleteProperty(request,'usage_policy');await f.adapter.execute(request,()=>'',()=>{});
  const other=AgentStartLedger.initialize(join(f.root,'foreign-host'),{machine_digest:'1'.repeat(64),principal_digest:'2'.repeat(64)});ledgers.push(other);
  const reader=new CodexOriginalMethodRuntime(f.adapter.originalConfiguration,true,other);
  expect(()=>reader.readOriginal(request)).toThrow('codex_original_input_changed');expect(other.listExclusive('codex_method_transport')).toHaveLength(0);expect(f.turns()).toBe(1);
 });
 it.each(['blocked','unknown','missing','notify','unidentified'])('transport policy refuses %s without a request-level policy or a replacement model turn',async mode=>{
  const f=fixture(mode,true),request={...f.request};Reflect.deleteProperty(request,'usage_policy');
  await expect(f.adapter.execute(request,()=>'',()=>{})).rejects.toThrow();expect(f.turns()).toBe(0);
  await expect(f.adapter.execute(request,()=>'',()=>{})).rejects.toThrow('codex_original_pending');expect(f.turns()).toBe(0);
 });
 it('transport policy keeps post-turn account changes Unknown without resending',async()=>{
  const f=fixture('foreign',true),request={...f.request};Reflect.deleteProperty(request,'usage_policy');
  await expect(f.adapter.execute(request,()=>'',()=>{})).rejects.toThrow();expect(f.turns()).toBe(1);expect(f.adapter.readOriginal(request)).toBeNull();
  await expect(f.adapter.execute(request,()=>'',()=>{})).rejects.toThrow('codex_original_pending');expect(f.turns()).toBe(1);
 });
 it('transport policy preserves closed legacy originals and never adds permission evidence to them',async()=>{
  const f=fixture(),request={...f.request};Reflect.deleteProperty(request,'usage_policy');const original=await f.adapter.execute(request,()=>'',()=>{}),path=join(f.root,'originals',request.operation_key,'start.json'),before=readFileSync(path);
  const guarded=new CodexOriginalMethodRuntime({...f.adapter.originalConfiguration,...{usage_policy:'require_ordinary_permission/1.0.0' as const}},false,f.origin);
  expect(guarded.readOriginal(request)).toEqual(original);expect(await guarded.execute(request,()=>'',()=>{throw Error('No new effect');})).toEqual(original);
  expect(original.ordinary_quota).toBeUndefined();expect(readFileSync(path)).toEqual(before);expect(f.turns()).toBe(1);
  expect(f.origin.listExclusive('codex_method_transport')).toHaveLength(0);
  renameSync(join(f.root,'originals',request.operation_key,'seal.json'),join(f.root,'originals',request.operation_key,'seal.retained.json'));
  await expect(guarded.execute(request,()=>'',()=>{})).rejects.toThrow('codex_original_pending');expect(f.turns()).toBe(1);expect(readFileSync(path)).toEqual(before);
 });
 it.each(['missing','changed','downgrade','legacy-extra'])('transport policy refuses %s original policy even with a refreshed PUBLIC seal',async mode=>{
  const f=fixture('normal',mode!=='legacy-extra'),request={...f.request};Reflect.deleteProperty(request,'usage_policy');await f.adapter.execute(request,()=>'',()=>{});
  const path=join(f.root,'originals',request.operation_key,'start.json'),claim=JSON.parse(readFileSync(path,'utf8'));
  if(mode==='missing')delete claim.transport_usage_policy;
  if(mode==='changed')claim.transport_usage_policy='unrestricted';
  if(mode==='downgrade'){claim.format='cimiloop/codex-method-start/3.0.0';delete claim.transport_usage_policy;}
  if(mode==='legacy-extra')claim.transport_usage_policy='require_ordinary_permission/1.0.0';
  writeFileSync(path,JSON.stringify(claim));const sealPath=join(f.root,'originals',request.operation_key,'seal.json'),seal=JSON.parse(readFileSync(sealPath,'utf8'));seal.claim_digest=createHash('sha256').update(readFileSync(path)).digest('hex');writeFileSync(sealPath,JSON.stringify(seal));
  expect(()=>f.adapter.readOriginal(request)).toThrow();expect(f.turns()).toBe(1);
 });
 it('transport policy preserves a request-level quota account pin',async()=>{
  const f=fixture('normal',true),request={...f.request,quota_account_digest:createHash('sha256').update('PUBLIC-other').digest('hex')};
  await expect(f.adapter.execute(request,()=>'',()=>{})).rejects.toThrow('codex_ordinary_permission_unavailable');expect(f.turns()).toBe(0);
 });
 it.each([undefined,'unrestricted'])('transport policy refuses an explicit invalid transport option %s before making an original root',value=>{
  const f=fixture(),options={...f.adapter.originalConfiguration,root:join(f.root,'must-not-create')};Reflect.set(options,'usage_policy',value);
  expect(()=>new CodexOriginalMethodRuntime(options)).toThrow();expect(existsSync(options.root)).toBe(false);expect(f.turns()).toBe(0);
 });
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
