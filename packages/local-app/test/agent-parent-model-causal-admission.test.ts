import {beforeEach,describe,it,expect,vi} from 'vitest';
import {mkdtempSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
const state=vi.hoisted(()=>({ipc:null as unknown,current:null as unknown,files:[] as unknown[],native_reads:0,child_reads:0,live_reads:0,workspace_reads:0,workspace_change:undefined as undefined|(()=>void),change:undefined as undefined|(()=>void)}));
vi.mock('../src/runs-local.js',()=>({LocalRunVerifier:class{readWorkspace(){return{files:[{path:'src/query.ts',state:'present'}]};}modelWorkspace(){state.workspace_reads++;state.workspace_change?.();return{current:[{path:'src/query.ts',digest:'a'.repeat(64)}]};}}}));
vi.mock('@cimiloop/runtime-adapter',async original=>{const real=await original<Record<string,unknown>>();return{...real,
 readWorkspaceFileRunOriginals:()=>({facts:{unresolved:0},calls:structuredClone(state.files)}),
 inspectAgentRuntimeOriginalRegistration:()=>({status:'original',identity:{operation:process.env.CIMILOOP_CAUSAL_CONTRACT_ROOT,claim:{owner:{pid:process.pid,creation_ticks:'134363431444146265',image:process.execPath}}}}),
 readAgentWorkspaceIpcOriginals:()=>structuredClone(state.ipc),readAgentWorkspaceIpcCurrentRequest:()=>structuredClone(state.current),
 AgentWorkspaceCheckHost:{readRunOriginals:()=>({facts:{unresolved:0},calls:[]})},
 readAgentRuntimeNativeResult:(_root:unknown,_project:unknown,_record:unknown,_scope:unknown,prefix:{exchanges:{request:{tool:string}}[]},_catalog:unknown,reader?:{readOriginal(raw:unknown):unknown})=>{state.native_reads++;for(const row of prefix.exchanges){if(row.request.tool==='run_skill'){if(!reader)return{status:'Unknown',reason:'Original child reader missing'};reader.readOriginal(row.request);}}return{status:'Verified'};}
};});
import {createInternalId} from '@cimiloop/protocol/v2';
import {digest,digestRuntimeBinaryFile} from '@cimiloop/runtime-adapter';
import {LocalAgentModelAdmission} from '../src/agent-model-admission-local.js';
// Shared admission contract with controlled Native/custody ports. It does not
// establish actual OS, child Native, real model/Skill or S1 qualification.
const sha='a'.repeat(64),nonce='00000000-0000-4000-8000-000000000001';
function setup(tool='run_skill',historical=false){
 const root=mkdtempSync(join(tmpdir(),'cimiloop-parent-model-causal-'));process.env.CIMILOOP_CAUSAL_CONTRACT_ROOT=root;writeFileSync(join(root,'original-config.json'),JSON.stringify({pipe_nonce:nonce}));
 const scope={project_id:createInternalId(),run_id:createInternalId(),operation_key:createInternalId(),executor_actor_id:createInternalId(),context_digest:digest('PUBLIC context'),runtime_binding:{binding_ref:{object_type:'provider_binding',id:createInternalId()},digest:digest('PUBLIC runtime')},skill_bindings:[],host_admission_ref:{provider:'local_content',resource_type:'agent_host_admission',locator:digest('PUBLIC admission').value,digest:digest('PUBLIC admission')}};
 const scope_digest=digest(JSON.stringify(scope)).value,entries=[{skill_alias:'review',method_name:'review',input_alias:'current'}],frame=(call_id:string)=>({format:'cimiloop/agent-parent-skill-request/1.0.0',scope_digest,catalog_digest:sha,call_id,tool:'run_skill',...entries[0]});
 const tail={ordinal:historical?'0002':'0001',request_digest:sha,reply_digest:null,request:tool==='run_skill'?frame('sdk_'+sha):{tool,call_id:'model_0002'},reply:null,state:'unknown'};
 const old={ordinal:'0001',request_digest:'b'.repeat(64),reply_digest:sha,request:frame('sdk_'+'b'.repeat(64)),reply:{outcome:'completed',receipt:{PUBLIC:'child'}},state:'reply_recorded'};
 state.ipc={status:'Observed',header:{nonce,scope,endpoint:{scope_digest}},exchanges:historical?[old,tail]:[tail],unresolved:1,artifacts:[]};state.current={nonce,scope_digest,ordinal:tail.ordinal,request_digest:sha,call_id:tail.request.call_id,tool};
 const input={request:scope,record:{id:'record',workspace_before_ref:{id:'workspace'}},context:{id:'context'},workspace:{id:'workspace'},source:{id:'source'},work_item:{allowed_actions:['read_files'],allowed_resources:['src/**']}};
 const custody={checkModelAuthority:()=>{state.live_reads++;state.change?.();return{algorithm:'sha256',value:sha};}},checks={forRun:()=>({recipes:[{inputs:[]}],node_digest:sha,policy_digest:sha}),verifyInstallation:()=>{}};
 const output={purpose:'review',findings:[],limitations:['PUBLIC independent child reader contract']},receipt={format:'cimiloop/agent-parent-skill-receipt/1.0.0',scope_digest,catalog_digest:sha,call_id:old.request.call_id,request_digest:digest(JSON.stringify(old.request)).value,invocation_id:createInternalId(),invocation_key:createInternalId(),observation_id:createInternalId(),report_digest:sha,status:'succeeded',output,output_digest:digest(JSON.stringify(output)).value,formal_agent_execution_enabled:false};
 const reader={sdkCatalog:{scope_digest,catalog_digest:sha,entries},readOriginal:()=>{state.child_reads++;return{receipt:structuredClone(receipt)};}};
 const service=Reflect.construct(LocalAgentModelAdmission,[root,root,custody,checks,()=>reader]) as LocalAgentModelAdmission;
 const verify=()=>Reflect.apply(service.checkModelAuthority,service,[{id:'project',repository_path:root},input,{}]);
 return{root,input,checks,custody,reader,service,verify};
}

function setupPreparation(phase='registered'){
 const s=setup();state.current=null;
 state.ipc={status:'Unknown',reason:'agent_ipc_original_registration_missing',header:null,exchanges:[],unresolved:0,artifacts:[],path:join(s.root,'agent-workspace-ipc-originals',s.input.request.project_id,s.input.request.run_id,nonce),formal_agent_execution_enabled:false};
 const owner={pid:process.pid,creation_ticks:'134363431444146265',image:process.execPath},supervisor={pid:12345,creation_ticks:'134363431444146266',image:join(s.root,'runtime.exe')},peer={pid:12346,creation_ticks:'134363431444146267',image:join(s.root,'sdk.exe')};
 const config={format:'cimiloop/agent-workspace-sandbox-config/5.0.0',nonce,pipe_nonce:nonce,scope_digest:digest(JSON.stringify(s.input.request)).value,owner};
 const resources:Record<string,unknown>={format:'cimiloop/agent-workspace-resources/1.0.0',nonce,scope_digest:config.scope_digest,config_digest:digest(JSON.stringify(config)).value,owner,supervisor,phase,runtime:['runtime_created','suspended'].includes(phase)?peer:null,resources_disposed:false};
 const save=()=>writeFileSync(join(s.root,'agent-sandbox-resources.json'),JSON.stringify(resources));
 writeFileSync(join(s.root,'original-config.json'),JSON.stringify(config));writeFileSync(join(s.root,'original-launcher.json'),JSON.stringify({format:'cimiloop/agent-workspace-launcher/2.0.0',nonce,owner,supervisor}));save();
 if(phase==='suspended')writeFileSync(join(s.root,'agent-sandbox-original.json'),JSON.stringify({format:'cimiloop/agent-workspace-sandbox/1.0.0',phase,nonce,supervisor,peer}));
 return{...s,owner,supervisor,peer,config,resources,save};
}

describe('parent model admission joins the exact current IPC request and independent historical children',()=>{
 beforeEach(()=>{state.ipc=null;state.current=null;state.files=[];state.native_reads=0;state.child_reads=0;state.live_reads=0;state.change=undefined;state.workspace_reads=0;state.workspace_change=undefined;});
 it('admits the exact current run_skill before and after the child callback without counting it as a completed Native effect',()=>{const s=setup();expect(s.verify()).toMatchObject({algorithm:'sha256'});expect(state.native_reads).toBe(0);expect(state.live_reads).toBe(1);});
 it('independently rechecks a completed historical child even when there are zero file or check calls',()=>{const s=setup('model_step',true);expect(s.verify()).toMatchObject({algorithm:'sha256'});expect(state.native_reads).toBe(2);expect(state.child_reads).toBe(2);});
 it('retains completed children while the current run_skill is in flight',()=>{const s=setup('run_skill',true);expect(s.verify()).toMatchObject({algorithm:'sha256'});expect(state.child_reads).toBe(2);});
 it('denies historical children when no independent reader is installed',()=>{const s=setup('model_step',true),service=Reflect.construct(LocalAgentModelAdmission,[s.root,s.root,s.custody,s.checks]) as LocalAgentModelAdmission;expect(()=>Reflect.apply(service.checkModelAuthority,service,[{id:'project',repository_path:s.root},s.input])).toThrow();expect(state.live_reads).toBe(0);});
 it('rejects another active request after the delegated custody callback',()=>{const s=setup();state.change=()=>{state.current={...(state.current as Record<string,unknown>),request_digest:'b'.repeat(64)};};expect(()=>s.verify()).toThrow();expect(state.live_reads).toBe(1);});
 it.each(['rejected Promise','fulfilled Promise','thenable'])('refuses and owns a mistakenly asynchronous historical reader factory: %s',async mode=>{
  const s=setup('model_step',true),unhandled:unknown[]=[],listener=(reason:unknown)=>unhandled.push(reason);let then_calls=0;
  const rejected=Promise.reject(Error('PUBLIC async historical reader refused'));void rejected.catch(()=>{});
  const value=mode==='rejected Promise'?rejected:mode==='fulfilled Promise'?Promise.resolve(s.reader):{then(_resolve:unknown,reject:(reason:unknown)=>void){then_calls++;reject(Error('PUBLIC thenable historical reader refused'));}};
  const service=Reflect.construct(LocalAgentModelAdmission,[s.root,s.root,s.custody,s.checks,()=>value]) as LocalAgentModelAdmission;process.on('unhandledRejection',listener);
  try{expect(()=>Reflect.apply(service.checkModelAuthority,service,[{id:'project',repository_path:s.root},s.input,{}])).toThrow();
   expect(state.native_reads).toBe(0);expect(state.live_reads).toBe(0);await new Promise<void>(done=>setImmediate(done));expect(unhandled).toHaveLength(0);if(mode==='thenable')expect(then_calls).toBe(1);
  }finally{process.removeListener('unhandledRejection',listener);}
 });
 it('refuses the current run_skill when the trusted authenticated context is absent',()=>{const s=setup();state.current=null;expect(()=>s.verify()).toThrow();expect(state.live_reads).toBe(0);});
 it('admits pre-IPC Native preparation through the original scope and current custody without projecting a ledger that does not exist yet',()=>{
  const s=setup();state.ipc={status:'Unknown',reason:'agent_ipc_original_registration_missing',header:null,exchanges:[],unresolved:0,artifacts:[],path:join(s.root,'agent-workspace-ipc-originals',s.input.request.project_id,s.input.request.run_id,nonce),formal_agent_execution_enabled:false};state.current=null;
  const owner={pid:process.pid,creation_ticks:'134363431444146265',image:process.execPath},supervisor={pid:12345,creation_ticks:'134363431444146266',image:join(s.root,'runtime.exe')};
  const config={format:'cimiloop/agent-workspace-sandbox-config/5.0.0',nonce,pipe_nonce:nonce,scope_digest:digest(JSON.stringify(s.input.request)).value,owner};
  writeFileSync(join(s.root,'original-config.json'),JSON.stringify(config));writeFileSync(join(s.root,'original-launcher.json'),JSON.stringify({format:'cimiloop/agent-workspace-launcher/2.0.0',nonce,owner,supervisor}));
  writeFileSync(join(s.root,'agent-sandbox-resources.json'),JSON.stringify({format:'cimiloop/agent-workspace-resources/1.0.0',nonce,scope_digest:config.scope_digest,config_digest:digest(JSON.stringify(config)).value,owner,supervisor,phase:'registered',runtime:null,resources_disposed:false}));
  expect(s.verify()).toMatchObject({algorithm:'sha256'});expect(state.native_reads).toBe(0);expect(state.live_reads).toBe(1);
 });
 it('refuses a missing IPC ledger once an original request is active instead of treating it as preparation',()=>{const s=setup();state.ipc={status:'Unknown',reason:'agent_ipc_original_registration_missing',header:null,exchanges:[],unresolved:0,artifacts:[]};expect(()=>s.verify()).toThrow();expect(state.live_reads).toBe(0);});
 it('refuses an existing incomplete IPC registration even with no Native effects',()=>{const s=setup();state.ipc={status:'Unknown',reason:'agent_ipc_original_registration_missing',header:null,exchanges:[],unresolved:0,artifacts:[],path:join(s.root,'existing-original')};state.current=null;mkdirSync(join(s.root,'existing-original'));expect(()=>s.verify()).toThrow();expect(state.live_reads).toBe(0);});

 it.each(['registered','profile_intent','grants_intent','granted','mapped','process_create_intent','runtime_created','suspended'])('admits only original pre-IPC preparation phase %s without a model or Native dispatch',phase=>{const s=setupPreparation(phase);expect(s.verify()).toMatchObject({algorithm:'sha256'});expect(state.native_reads).toBe(0);expect(state.live_reads).toBe(1);});
 it.each(['running','ended','unknown'])('refuses missing original IPC after phase %s rather than treating loss as fresh preparation',phase=>{const s=setupPreparation(phase);expect(()=>s.verify()).toThrow();expect(state.live_reads).toBe(0);});
 it.each(['resources_disposed','scope_digest','config_digest','nonce','owner','supervisor','runtime'])('refuses pre-IPC original resource %s drift before delegated authority',key=>{const s=setupPreparation();s.resources[key]=key==='resources_disposed'?true:key==='owner'?{...s.owner,pid:s.owner.pid+1}:key==='supervisor'?{...s.supervisor,pid:s.supervisor.pid+1}:key==='runtime'?s.peer:'b'.repeat(64);s.save();expect(()=>s.verify()).toThrow();expect(state.live_reads).toBe(0);});
 it('refuses a retained Native effect with missing original IPC even while resources claim preparation',()=>{const s=setupPreparation();state.files=[{PUBLIC:'retained original Native effect'}];expect(()=>s.verify()).toThrow();expect(state.live_reads).toBe(0);});
 it('rechecks original preparation phase after the final delegated custody callback',()=>{const s=setupPreparation();state.change=()=>{s.resources.phase='running';s.save();};expect(()=>s.verify()).toThrow();expect(state.live_reads).toBe(1);});
 it('rechecks missing registration after the final delegated custody callback without writing or replacing it',()=>{const s=setupPreparation();state.change=()=>mkdirSync((state.ipc as {path:string}).path,{recursive:true});expect(()=>s.verify()).toThrow();expect(state.live_reads).toBe(1);});
 it('refuses suspended preparation when its actual original peer identity has changed',()=>{const s=setupPreparation('suspended');writeFileSync(join(s.root,'agent-sandbox-original.json'),JSON.stringify({format:'cimiloop/agent-workspace-sandbox/1.0.0',phase:'suspended',nonce,supervisor:s.supervisor,peer:{...s.peer,pid:s.peer.pid+1}}));expect(()=>s.verify()).toThrow();expect(state.live_reads).toBe(0);});

 it.each(['registered','suspended'])('refuses lost original config in retained %s preparation without delegated authority',phase=>{const s=setupPreparation(phase);renameSync(join(s.root,'original-config.json'),join(s.root,'retained-original-config.json'));expect(()=>s.verify()).toThrow();expect(state.live_reads).toBe(0);});
 it.each(['running','disposed','partial IPC'])('seals %s after the final complete workspace read before returning model admission',mode=>{const s=setupPreparation();state.workspace_change=()=>{if(state.workspace_reads!==2)return;if(mode==='partial IPC')mkdirSync((state.ipc as {path:string}).path,{recursive:true});else{s.resources[mode==='running'?'phase':'resources_disposed']=mode==='running'?'running':true;s.save();}};expect(()=>s.verify()).toThrow();expect(state.live_reads).toBe(1);});

 it('seals original current request after the last current workspace read before model admission can return',()=>{const s=setup();state.workspace_change=()=>{if(state.workspace_reads===2)state.current=null;};expect(()=>s.verify()).toThrow();expect(state.live_reads).toBe(1);});
 it('seals original IPC after the last current workspace read instead of accepting a stale causal projection',()=>{const s=setup();state.workspace_change=()=>{if(state.workspace_reads===2)(state.ipc as {unresolved:number}).unresolved=2;};expect(()=>s.verify()).toThrow();expect(state.live_reads).toBe(1);});
 it('seals original Native file effects after the last current workspace read before model admission can return',()=>{const s=setup();state.workspace_change=()=>{if(state.workspace_reads===2)state.files.push({PUBLIC:'late original Native effect'});};expect(()=>s.verify()).toThrow();expect(state.live_reads).toBe(1);});
 it('does not re-enter a completed child when a later check still matches the sealed bytes',()=>{
  const s=setup('model_step',true),binary=join(s.root,'PUBLIC-sealed-model-binary.bin');writeFileSync(binary,'sealed model bytes');
  s.checks.verifyInstallation=()=>{digestRuntimeBinaryFile(binary);};
  s.verify();const native=state.native_reads,child=state.child_reads,live=state.live_reads;
  expect(s.verify()).toMatchObject({algorithm:'sha256'});
  expect(state.native_reads).toBe(native);expect(state.child_reads).toBe(child);expect(state.live_reads).toBe(live+1);
 });

});
