import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {describe,expect,it} from 'vitest';
import {AgentStartLedger} from '../src/agent-start-ledger.js';
import {CodexOriginalMethodRuntime,captureCodexLoginHome,type CodexOriginalMethodOptions} from '../src/codex-original-method.js';
import {createInternalId} from '@cimiloop/protocol/v2';
import {CodexAgentUsageBudget} from '../src/codex-agent-usage-budget.js';
import {createBudgetedCodexAgentRuntimeModel} from '../src/agent-codex-model.js';
import {AgentRuntimeModelHost} from '../src/agent-runtime-model.js';
import {claimAgentRuntimeOperation,requestAgentRuntimeCancellation,recoverAgentRuntimeOperation} from '../src/agent-runtime-operation.js';
import {codexChatGptAccountDigest} from '../src/codex-original-method.js';
import {codexProcessLayout} from '../src/codex-process-job.js';

// Actual Windows Job/process tree and immutable Host1. The app-server is PUBLIC
// Node stdio, with no login, model, bill, Provider qualification or S1 claim.
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const pause=()=>new Promise<void>(done=>setTimeout(done,25));
async function until(predicate:()=>boolean,ms=20000){const end=Date.now()+ms;while(!predicate()){if(Date.now()>end)throw Error('PUBLIC process observation timed out');await pause();}}
const request={operation_key:'PUBLIC_job',model:'gpt-6-luna',prompt:'PUBLIC input',instructions:'PUBLIC only',tools:[],output_schema:{type:'string'},usage_policy:'require_ordinary_permission/1.0.0' as const};
function fixture(mode='normal'){
 const root=mkdtempSync(join(tmpdir(),'cimiloop-codex-job-')),script=join(root,'server.mjs'),originals=join(root,'originals'),operation=join(originals,request.operation_key),job=join(operation,'process-job');
 const state=join(root,'state.json'),descendant=join(root,'descendant.json');
 writeFileSync(script,String.raw`import{createInterface}from'node:readline';import{existsSync,writeFileSync,mkdirSync}from'node:fs';import{dirname,join,sep}from'node:path';import{spawn}from'node:child_process';
const[mode,state,started,descendant]=process.argv.slice(2),send=v=>process.stdout.write(JSON.stringify(v)+'\n');
createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line),ok=result=>send({id:r.id,result});
if(r.method==='initialize')ok({});if(r.method==='account/read')ok({account:{type:'chatgpt',email:'PUBLIC@example.test'},requiresOpenaiAuth:true});
if(r.method==='account/rateLimits/read')ok({ordinaryUsageAllowed:true,accountId:'PUBLIC-account',rateLimits:{primary:null,secondary:null,credits:null}});
if(r.method==='thread/start')ok({model:r.params.model,modelProvider:'openai',approvalPolicy:'never',activePermissionProfile:{id:'cimiloop-method'},instructionSources:[],thread:{id:'PUBLIC_THREAD',ephemeral:r.params.ephemeral===true}});
if(r.method==='mcpServerStatus/list')ok({data:[],nextCursor:null});if(r.method==='turn/start'){ok({turn:{id:'PUBLIC_TURN'}});
if(existsSync(started)){const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});child.unref();writeFileSync(descendant,JSON.stringify({pid:child.pid}));}let environment;if(mode==='environment'){const names=['HOME','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA','TEMP','TMP','CODEX_HOME'],paths=Object.fromEntries(names.map(name=>[name,process.env[name]??null])),contained=Object.values(paths).every(path=>typeof path==='string'&&path.toLowerCase().startsWith((dirname(state)+sep).toLowerCase()));environment={paths,contained};if(contained)for(const name of names.filter(name=>name!=='CODEX_HOME')){mkdirSync(paths[name],{recursive:true});writeFileSync(join(paths[name],'PUBLIC-write.txt'),'PUBLIC environment effect');}}writeFileSync(state,JSON.stringify({pid:process.pid,turns:1,...(environment?{environment}:{})}));
if(mode==='stall'){setInterval(()=>{},1000);return;}send({method:'item/completed',params:{threadId:'PUBLIC_THREAD',turnId:'PUBLIC_TURN',item:{type:'agentMessage',phase:'final_answer',text:'PUBLIC response'}}});
send({method:'thread/tokenUsage/updated',params:{threadId:'PUBLIC_THREAD',turnId:'PUBLIC_TURN',tokenUsage:{total:{inputTokens:5,cachedInputTokens:0,outputTokens:3,totalTokens:8,reasoningOutputTokens:0,cacheWriteInputTokens:0}}}});
send({method:'turn/completed',params:{threadId:'PUBLIC_THREAD',turn:{id:'PUBLIC_TURN',status:'completed',error:null}}});}});`);
 const options={root:originals,command:{file:process.execPath,args:[script,mode,state,join(job,'started.json'),descendant],sha256:hash(readFileSync(process.execPath))},state_policy:'private_operation_state/1.0.0',process_custody:'owner_job/1.0.0',timeout_ms:20000} as CodexOriginalMethodOptions;
 const host={machine_digest:hash('PUBLIC machine'),principal_digest:hash('PUBLIC user')},origin=AgentStartLedger.initialize(join(root,'origin'),host);
 return{root,job,state,descendant,options,host,origin,adapter:new CodexOriginalMethodRuntime(options,false,origin)};
}
const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}};
describe.runIf(process.platform==='win32'&&process.arch==='x64')('owner-bound Codex process Job',()=>{
 it.each(['cancel','recover'] as const)('delivers original SDK cancellation while model Job end originals arrive via %s without replaying or freeing its hold',async kind=>{
  const f=fixture('stall');try{const scope={project_id:createInternalId(),run_id:createInternalId(),operation_key:createInternalId(),executor_actor_id:createInternalId(),context_digest:{algorithm:'sha256' as const,value:hash('PUBLIC context')},runtime_binding:{binding_ref:{object_type:'provider_binding' as const,id:createInternalId()},digest:{algorithm:'sha256' as const,value:hash('PUBLIC runtime')}},skill_bindings:[],host_admission_ref:{provider:'local_content' as const,resource_type:'agent_host_admission' as const,locator:hash('PUBLIC admission'),digest:{algorithm:'sha256' as const,value:hash('PUBLIC admission')}}};
  const account=codexChatGptAccountDigest({account:{type:'chatgpt',email:'PUBLIC@example.test'}}),quota=hash('PUBLIC-account'),budget=CodexAgentUsageBudget.initialize(f.origin,{account_digest:account,quota_account_digest:quota,model_calls:2,output_tokens:4096}),transport=new CodexOriginalMethodRuntime({...f.options,account_digest:account},false,f.origin),model=createBudgetedCodexAgentRuntimeModel({root:f.root,scope,runtime:transport,model:'gpt-6-luna',account_digest:account,quota_account_digest:quota,output_profile:'bounded_2048/1.0.0',usage_policy:'require_ordinary_permission/1.0.0',origin:'public_fixture',admission_digest:hash('PUBLIC qualification'),permitted_tools:['cimi_read'],authority:{async check(){},beforeEffect(){}}},budget);
  const host=await AgentRuntimeModelHost.initialize(f.root,scope,model,['cimi_read']),header=join(f.root,'agent-runtime-model-starts',scope.project_id,scope.run_id,'header.json');
  claimAgentRuntimeOperation(f.root,scope,{purpose:'agent_runtime',model_original_binding:{format:'cimiloop/agent-model-original-binding/1.0.0',header_digest:hash(readFileSync(header)),original_evidence:model.original_evidence}},{pid:process.pid,creation_ticks:'1',image:process.execPath});
  const abort=new AbortController(),pending=host.execute({format:'cimiloop/agent-runtime-model-request/3.0.0',scope_digest:hash(JSON.stringify(scope)),admission_digest:model.admission_digest,call_id:'model_0001',tool:'model_step',prompt:[{role:'user',content:[{type:'text',text:'PUBLIC bounded read'}]}],tools:[{type:'function',name:'cimi_read',description:'PUBLIC read',inputSchema:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}}],max_output_tokens:2048},abort.signal);void pending.catch(()=>{});
  try{await until(()=>existsSync(f.state));const dispatch=JSON.parse(readFileSync(join(f.root,'agent-codex-model-originals',scope.project_id,scope.run_id,'model_0001','request.json'),'utf8')),job=codexProcessLayout(f.options.root,dispatch.codex_request.operation_key).operationRoot,cancel=join(job,'cancel.json'),end=join(job,'ended.json'),before=budget.snapshot();
   if(kind==='recover'){const sdk=join(f.root,'agent-runtime-claims',scope.project_id,'runs',scope.run_id,'cancel.json');expect(()=>requestAgentRuntimeCancellation(f.root,scope,()=>{if(existsSync(sdk))throw Error('PUBLIC lost cancellation delivery');})).toThrow('PUBLIC lost cancellation delivery');expect(existsSync(sdk)).toBe(true);expect(existsSync(cancel)).toBe(false);}
   const guard=()=>{if(existsSync(cancel)){const deadline=Date.now()+10000,wait=new Int32Array(new SharedArrayBuffer(4));while(!existsSync(end)&&Date.now()<deadline)Atomics.wait(wait,0,0,10);expect(existsSync(end)).toBe(true);}};
   const result=kind==='cancel'?requestAgentRuntimeCancellation(f.root,scope,guard):await recoverAgentRuntimeOperation(f.root,scope,guard);expect(existsSync(cancel)).toBe(true);expect(existsSync(end)).toBe(true);expect(result).toMatchObject({model_cancellation:{status:'Requested',calls:[{call_id:'model_0001',requested:true}]}});if(kind==='cancel')expect(result).toMatchObject({requested:true,stopped_proven:false});else expect(result).toMatchObject({outcome:'unknown',resources_disposed:false,completion_proven:false});await expect(pending).rejects.toThrow();expect(budget.snapshot()).toEqual(before);expect(budget.snapshot().held.model_calls).toBe(1);expect(JSON.parse(readFileSync(f.state,'utf8')).turns).toBe(1);expect(JSON.parse(readFileSync(end,'utf8'))).toMatchObject({active_processes:0,job_closed:true});
  }finally{abort.abort();await pending.catch(()=>{});}
  }finally{f.origin.close();}
 },120000);
 it('delivers cancellation through retained process custody without model replay or cost completion',async()=>{
  const cancel=Reflect.get(CodexOriginalMethodRuntime,'requestProcessCancellationRetained');expect(cancel).toBeTypeOf('function');
  const f=fixture('stall'),abort=new AbortController(),pending=f.adapter.execute(request,()=>'',()=>{},abort.signal);void pending.catch(()=>{});
  try{await until(()=>existsSync(f.state));const options=f.adapter.originalConfiguration,path=join(f.job,'cancel.json'),started=join(f.job,'started.json');
   expect(()=>cancel(options,request,()=>{throw Error('PUBLIC Human revoked');})).toThrow('PUBLIC Human revoked');expect(existsSync(path)).toBe(false);
   renameSync(started,started+'.retained');try{expect(()=>cancel(options,request,()=>{})).toThrow();expect(existsSync(path)).toBe(false);}finally{renameSync(started+'.retained',started);}
   expect(cancel(options,request,()=>{})).toMatchObject({requested:true,stopped_proven:false,completion_proven:false,costs_reconciled:false});const bytes=readFileSync(path);
   await expect(pending).rejects.toThrow();expect(CodexOriginalMethodRuntime.readProcessResourcesRetained(options,request)).toMatchObject({status:'disposed',resources_disposed:true});
   expect(cancel(options,request,()=>{})).toMatchObject({requested:true,stopped_proven:false});expect(readFileSync(path)).toEqual(bytes);expect(f.adapter.readOriginal(request)).toBe(null);await expect(f.adapter.execute(request,()=>'',()=>{})).rejects.toThrow('codex_original_pending');expect(JSON.parse(readFileSync(f.state,'utf8')).turns).toBe(1);expect(f.origin.listExclusive('codex_process_job_intent')).toHaveLength(1);expect(f.origin.listExclusive('codex_process_job_complete')).toEqual([]);
  }finally{abort.abort();await pending.catch(()=>{});f.origin.close();}
 },120000);
 it.each(['missing_capability','unknown_policy'])('refuses a model network policy without the code-owned confined execution: %s',mode=>{
  const f=fixture(),options={...f.options,root:join(f.root,'network-must-not-create')};Reflect.set(options,'network_policy',mode==='unknown_policy'?'PUBLIC unknown network':'codex_chatgpt_tunnel/1.0.0');
  try{expect(()=>new CodexOriginalMethodRuntime(options,false,f.origin)).toThrow('codex_network_boundary_unproven');expect(existsSync(options.root)).toBe(false);expect(f.origin.listExclusive('codex_process_job_intent')).toEqual([]);expect(existsSync(f.state)).toBe(false);}finally{f.origin.close();}
 });
 it.each(['missing_storage','copied_storage','unknown_policy','missing_environment'])('refuses serialized write confinement without its live fixed-volume capability: %s',mode=>{
  const f=fixture(),home=join(f.root,'PUBLIC-confinement-login');mkdirSync(home);
  const options:CodexOriginalMethodOptions={...f.options,root:join(f.root,'must-not-create'),state_policy:'private_login_home/2.0.0',login_home:captureCodexLoginHome(home),environment_policy:'private_user_directories/1.0.0'};Reflect.set(options,'write_confinement','appcontainer_fixed_volume/1.0.0');
  if(mode==='unknown_policy')Reflect.set(options,'write_confinement','PUBLIC fabricated confinement');if(mode==='missing_environment')Reflect.deleteProperty(options,'environment_policy');
  const storage=mode==='copied_storage'?{read(){throw Error('PUBLIC untrusted reader must not run');}}:undefined;
  try{expect(()=>Reflect.construct(CodexOriginalMethodRuntime,[options,false,f.origin,storage])).toThrow('codex_write_confinement_unproven');expect(existsSync(options.root)).toBe(false);expect(f.origin.listExclusive('codex_process_job_intent')).toEqual([]);expect(existsSync(f.state)).toBe(false);}finally{f.origin.close();}
 });
 it.each(['missing_home','missing_job','unknown_policy'])('rejects private user-directory policy with %s before a process intent or model dispatch',mode=>{
  const f=fixture(),path=join(f.root,'private-environment-login');mkdirSync(path);const options:CodexOriginalMethodOptions={...f.options,state_policy:'private_login_home/2.0.0',login_home:captureCodexLoginHome(path),environment_policy:'private_user_directories/1.0.0'};
  if(mode==='missing_home')Reflect.deleteProperty(options,'login_home');if(mode==='missing_job')Reflect.deleteProperty(options,'process_custody');if(mode==='unknown_policy')Reflect.set(options,'environment_policy','PUBLIC fabricated policy');
  try{expect(()=>new CodexOriginalMethodRuntime(options,false,f.origin)).toThrow();expect(f.origin.listExclusive('codex_process_job_intent')).toEqual([]);expect(existsSync(f.state)).toBe(false);}finally{f.origin.close();}
 });
 it('contains the actual user-directory environment and writes while replay keeps the original explicit policy',async()=>{
  const f=fixture('environment'),home=join(f.root,'private-login');mkdirSync(home);const options={...f.options,state_policy:'private_login_home/2.0.0' as const,login_home:captureCodexLoginHome(home)};Reflect.set(options,'environment_policy','private_user_directories/1.0.0');
  try{const runtime=new CodexOriginalMethodRuntime(options,false,f.origin),result=await runtime.execute(request,()=>'',()=>{}),state=JSON.parse(readFileSync(f.state,'utf8'));expect(state.environment.contained).toBe(true);
   const claim=JSON.parse(readFileSync(join(options.root,request.operation_key,'start.json'),'utf8'));expect(claim).toMatchObject({format:'cimiloop/codex-method-start/11.0.0',environment_policy:'private_user_directories/1.0.0',environment:state.environment.paths});
   expect(state.environment.paths.CODEX_HOME).toBe(home);for(const [name,path] of Object.entries(state.environment.paths)){if(name==='CODEX_HOME')continue;expect(existsSync(join(String(path),'PUBLIC-write.txt'))).toBe(true);expect(String(path).toLowerCase().startsWith((join(options.root,request.operation_key,'state')+'\\').toLowerCase())).toBe(true);}
   expect(CodexOriginalMethodRuntime.readRetained(runtime.originalConfiguration,request)).toEqual(result);expect(JSON.parse(readFileSync(f.state,'utf8')).turns).toBe(1);
   const originalClaim=readFileSync(join(options.root,request.operation_key,'start.json')),raw=JSON.parse(originalClaim.toString());raw.environment.LOCALAPPDATA=join(f.root,'foreign-user-root');writeFileSync(join(options.root,request.operation_key,'start.json'),JSON.stringify(raw));expect(()=>CodexOriginalMethodRuntime.readRetained(runtime.originalConfiguration,request)).toThrow('codex_original_input_changed');writeFileSync(join(options.root,request.operation_key,'start.json'),originalClaim);
   expect(CodexOriginalMethodRuntime.readRetained(runtime.originalConfiguration,request)).toEqual(result);expect(JSON.parse(readFileSync(f.state,'utf8')).turns).toBe(1);
  }finally{f.origin.close();}
 },120000);
 it('observes the original model Job through cancellation without sealing model output or dispatching again',async()=>{
  const read=Reflect.get(CodexOriginalMethodRuntime,'readProcessResourcesRetained');expect(read).toBeTypeOf('function');
  const f=fixture('stall'),abort=new AbortController();const pending=f.adapter.execute(request,()=>'',()=>{},abort.signal);void pending.catch(()=>{});
  try{await until(()=>existsSync(f.state));const options=f.adapter.originalConfiguration;
   expect(read(options,request)).toMatchObject({status:'active',resources_disposed:false,completion_proven:false,costs_reconciled:false});
   abort.abort();await expect(pending).rejects.toThrow();await until(()=>existsSync(join(f.job,'ended.json')));
   expect(JSON.parse(readFileSync(join(f.job,'ended.json'),'utf8'))).toMatchObject({reason:'cancel_requested',active_processes:0,job_closed:true});
   const path=join(f.root,'origin','starts.sqlite'),before=hash(readFileSync(path));expect(read(options,request)).toMatchObject({status:'disposed',resources_disposed:true,completion_proven:false,costs_reconciled:false});expect(hash(readFileSync(path))).toBe(before);
   expect(f.adapter.readOriginal(request)).toBe(null);await expect(f.adapter.execute(request,()=>'',()=>{})).rejects.toThrow('codex_original_pending');expect(f.origin.listExclusive('codex_process_job_intent')).toHaveLength(1);expect(f.origin.listExclusive('codex_process_job_complete')).toEqual([]);
   const ended=join(f.job,'ended.json');renameSync(ended,ended+'.retained');try{expect(read(options,request)).toMatchObject({status:'unknown',resources_disposed:false});expect(existsSync(ended)).toBe(false);}finally{renameSync(ended+'.retained',ended);}
   const started=join(f.job,'started.json');writeFileSync(started,readFileSync(started,'utf8')+'\n');expect(()=>read(options,request)).toThrow('codex_process_custody_unproven');
  }finally{abort.abort();await pending.catch(()=>{});f.origin.close();}
 },120000);
 it('records an atomic Job launch and empty Job before sealing one ordinary original, then replays without a new child',async()=>{
  const f=fixture();try{
   const result=await f.adapter.execute(request,()=>'',()=>{});
   expect(JSON.parse(readFileSync(join(f.options.root,request.operation_key,'start.json'),'utf8')).format).toBe('cimiloop/codex-method-start/10.0.0');
   const started=JSON.parse(readFileSync(join(f.job,'started.json'),'utf8')),ended=JSON.parse(readFileSync(join(f.job,'ended.json'),'utf8'));
   expect(started).toMatchObject({job_assignment:'atomic_on_create',kill_on_close:true,owner:{pid:process.pid},worker:{pid:JSON.parse(readFileSync(f.state,'utf8')).pid}});
   expect(ended).toMatchObject({reason:'worker_exited',active_processes:0,job_closed:true});expect(alive(JSON.parse(readFileSync(f.descendant,'utf8')).pid)).toBe(false);
   const starts=f.origin.listExclusive('codex_process_job_intent').length;expect(await f.adapter.execute(request,()=>{throw Error('PUBLIC replay must not call tool');},()=>{throw Error('PUBLIC replay must not dispatch');})).toEqual(result);expect(f.origin.listExclusive('codex_process_job_intent')).toHaveLength(starts);
   const seal=join(f.options.root,request.operation_key,'seal.json');renameSync(seal,seal+'.retained');expect(CodexOriginalMethodRuntime.readProcessResourcesRetained(f.adapter.originalConfiguration,request)).toMatchObject({status:'disposed',resources_disposed:true,completion_proven:false,costs_reconciled:false});expect(f.adapter.readOriginal(request)).toBe(null);await expect(f.adapter.execute(request,()=>'',()=>{})).rejects.toThrow('codex_original_pending');
  }finally{f.origin.close();}
 },120000);
 it('requires the independent original Host before accepting a prospective process policy',()=>{
  const f=fixture();try{expect(()=>new CodexOriginalMethodRuntime(f.options)).toThrow('codex_process_custody_unproven');}finally{f.origin.close();}
 });
 it('places prospective Job assets under the explicit short data root without rewriting the original method workspace',async()=>{
  const f=fixture(),short=join(f.root,'processes');try{
   const options={...f.options,process_root:short} as CodexOriginalMethodOptions,adapter=new CodexOriginalMethodRuntime(options,false,f.origin),original=await adapter.execute(request,()=>'',()=>{});
   expect(existsSync(short)).toBe(true);expect(readdirSync(short,{recursive:true}).some(path=>String(path).endsWith('ended.json'))).toBe(true);expect(existsSync(f.job)).toBe(false);expect(original.original_ref.locator).toBe(join(f.options.root,request.operation_key,'stdio.jsonl'));expect(CodexOriginalMethodRuntime.readRetained(adapter.originalConfiguration,request)).toEqual(original);
  }finally{f.origin.close();}
 },120000);
 it('reads a completed original after its live Host closes without changing the origin database',async()=>{
  const f=fixture();let open=true;try{const original=await f.adapter.execute(request,()=>'',()=>{}),options=f.adapter.originalConfiguration;f.origin.close();open=false;
   const path=join(f.root,'origin','starts.sqlite'),before=hash(readFileSync(path));expect(CodexOriginalMethodRuntime.readRetained(options,request)).toEqual(original);expect(hash(readFileSync(path))).toBe(before);
  }finally{if(open)f.origin.close();}
 },120000);
 it('retains the independent intent when Human authority changes during asynchronous helper preparation',async()=>{
  const f=fixture();let checks=0;try{await expect(f.adapter.execute(request,()=>'',()=>{if(++checks===2)throw Error('PUBLIC authority revoked');})).rejects.toThrow('PUBLIC authority revoked');
   expect(f.origin.listExclusive('codex_process_job_intent')).toHaveLength(1);expect(existsSync(f.state)).toBe(false);await expect(f.adapter.execute(request,()=>'',()=>{})).rejects.toThrow('codex_original_pending');
  }finally{f.origin.close();}
 },120000);
 it('rejects changed Job bytes even if a local success seal is recomputed',async()=>{
  const f=fixture();try{await f.adapter.execute(request,()=>'',()=>{});const end=join(f.job,'ended.json');writeFileSync(end,readFileSync(end,'utf8')+'\n');
   const sealPath=join(f.options.root,request.operation_key,'seal.json'),seal=JSON.parse(readFileSync(sealPath,'utf8'));seal.process_job.ended.digest=hash(readFileSync(end));writeFileSync(sealPath,JSON.stringify(seal));expect(()=>f.adapter.readOriginal(request)).toThrow('codex_process_custody_unproven');expect(f.origin.listExclusive('codex_process_job_complete')).toHaveLength(1);
  }finally{f.origin.close();}
 },120000);
 it('stops the actual worker and descendant after abrupt owner death, retaining the original pending identity',async()=>{
  const f=fixture('stall'),entry=join(f.root,'owner.mjs');f.origin.close();
  const runtime=pathToFileURL(resolve('packages/runtime-adapter/dist/index.js')).href;
  writeFileSync(entry,`import{AgentStartLedger,CodexOriginalMethodRuntime}from ${JSON.stringify(runtime)};const origin=AgentStartLedger.open(${JSON.stringify(join(f.root,'origin'))},${JSON.stringify(f.host)}),runtime=new CodexOriginalMethodRuntime(${JSON.stringify(f.options)},false,origin),abort=new AbortController();process.on('message',m=>{if(m==='abort')abort.abort();});try{await runtime.execute(${JSON.stringify(request)},()=>'',()=>{},abort.signal);}catch{}finally{origin.close();process.exit(0);}`);
  const owner=spawn(process.execPath,[entry],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});let terminated=false;
  try{
   await until(()=>existsSync(f.state));expect(existsSync(join(f.job,'started.json'))).toBe(true);
   const worker=JSON.parse(readFileSync(f.state,'utf8')).pid,descendant=JSON.parse(readFileSync(f.descendant,'utf8')).pid;
   owner.kill();terminated=true;await until(()=>existsSync(join(f.job,'ended.json')));
   expect(JSON.parse(readFileSync(join(f.job,'ended.json'),'utf8'))).toMatchObject({reason:'owner_exited',active_processes:0,job_closed:true});expect(alive(worker)).toBe(false);expect(alive(descendant)).toBe(false);
   const origin=AgentStartLedger.open(join(f.root,'origin'),f.host);try{const reopened=new CodexOriginalMethodRuntime(f.options,false,origin);expect(reopened.readOriginal(request)).toBe(null);expect(CodexOriginalMethodRuntime.readProcessResourcesRetained(reopened.originalConfiguration,request)).toMatchObject({status:'disposed',resources_disposed:true,completion_proven:false,costs_reconciled:false});await expect(reopened.execute(request,()=>'',()=>{})).rejects.toThrow('codex_original_pending');expect(origin.listExclusive('codex_process_job_intent')).toHaveLength(1);}finally{origin.close();}
  }finally{if(!terminated&&owner.connected)owner.send('abort');if(!terminated)await until(()=>owner.exitCode!==null||owner.signalCode!==null);}
 },120000);
});
