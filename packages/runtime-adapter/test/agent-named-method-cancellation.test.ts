import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,dirname,basename} from 'node:path';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const original=vi.hoisted(()=>({identity:vi.fn(),marker:vi.fn(),operation:vi.fn(),method:vi.fn(),model:vi.fn(),ipc:vi.fn(),job:vi.fn()}));
vi.mock('../src/agent-runtime-operation.js',async load=>({...await load<typeof import('../src/agent-runtime-operation.js')>(),readAgentRuntimeOriginalIdentity:original.identity,readAgentRuntimeCancellationOriginal:original.marker}));
vi.mock('../src/agent-workspace-sandbox-recovery.js',async load=>({...await load<typeof import('../src/agent-workspace-sandbox-recovery.js')>(),readOriginalAgentWorkspaceOperation:original.operation}));
vi.mock('../src/agent-named-method-host.js',async load=>({...await load<typeof import('../src/agent-named-method-host.js')>(),readAgentNamedMethodOriginals:original.method}));
vi.mock('../src/agent-runtime-model.js',async load=>({...await load<typeof import('../src/agent-runtime-model.js')>(),readAgentRuntimeModelOriginals:original.model}));
vi.mock('../src/agent-workspace-ipc-journal.js',async load=>({...await load<typeof import('../src/agent-workspace-ipc-journal.js')>(),readAgentWorkspaceIpcOriginals:original.ipc}));
vi.mock('../src/agent-job-policy.js',async load=>({...await load<typeof import('../src/agent-job-policy.js')>(),readOriginalAgentJobObservation:original.job}));
import * as runtime from '../src/index.js';import {digest} from '../src/files.js';
// Constructed independent readers/Native bytes exercise closure, never actual OS/SDK/model evidence.
let root:string,f:ReturnType<typeof fixture>;
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'cimiloop-named-cancel-unit-')),operation=join(root,'operation'),blobs=join(root,'blobs');mkdirSync(operation);mkdirSync(blobs);
 const scope={project_id:'11111111-1111-4111-8111-111111111111',run_id:'22222222-2222-4222-8222-222222222222',operation_key:'original_child'},scope_digest=digest(JSON.stringify(scope)).value;
 const owner={pid:12,creation_ticks:'12',image:process.execPath},supervisor={...owner,pid:13},peer={...owner,pid:14},nonce='33333333-3333-4333-8333-333333333333',operation_id='44444444-4444-4444-8444-444444444444';
 const method_original_binding={format:'cimiloop/agent-named-method-binding/1.0.0',profile_digest:digest('profile').value,header_digest:digest('method header').value,anchor_digest:digest('anchor').value},binary_original={format:'PUBLIC constructed original SDK'},sandbox_original={format:'PUBLIC original controller'};
 const modelHeader={name:'header.json',path:join(root,'model-header.json'),digest:digest('PUBLIC original model header').value};writeFileSync(modelHeader.path,'PUBLIC original model header');
 const original_evidence={kind:'dedicated_zhipu/1.0.0',header_digest:digest('dedicated').value},model_original_binding={format:'cimiloop/agent-model-original-binding/1.0.0',header_digest:modelHeader.digest,original_evidence};
 const input={binary_original,sandbox_original,method_original_binding,model_original_binding,lifetime_policy:'agent_task/1.0.0',deadline_uptime_ms:100000,prompt:'PUBLIC fixed request',provider_options:{admission_digest:digest('admission').value}};
 const config={format:'cimiloop/agent-workspace-sandbox-config/6.0.0',nonce,owner,scope_digest,...input,method_tools:'fixed_named_method/1.0.0',pipe_nonce:nonce};
 const launch={format:'cimiloop/agent-workspace-launcher/2.0.0',nonce,owner,supervisor,launcher_original:sandbox_original};
 const marker={format:'cimiloop/agent-runtime-cancel/1.0.0',operation_id,scope_digest},markerBytes=Buffer.from(JSON.stringify(marker)),cancellation_digest=digest(markerBytes).value;
 const native={format:'cimiloop/agent-workspace-sandbox/1.0.0',phase:'suspended',nonce,supervisor,peer,appcontainer_sid:'PUBLIC fixed SID',network_capability_sids:[],active_process_limit:1};
 const resources={format:'cimiloop/agent-workspace-resources/1.0.0',nonce,scope_digest,config_digest:digest(JSON.stringify(config)).value,owner,supervisor,runtime:peer,phase:'ended',resources_disposed:true};
 const cleanup={format:'cimiloop/agent-workspace-sandbox/1.0.0',phase:'ended',nonce,reason:'agent_sandbox_cancel_requested',exit_code:130,resources_disposed:true,cleanup_errors:[],formal_agent_execution_enabled:false};
 const proof={format:'cimiloop/agent-workspace-cancellation/1.0.0',nonce,operation_id,cancellation_digest,scope_digest,config_digest:resources.config_digest,owner,supervisor,runtime:peer,phase:'running',runtime_resumed:true,reason:cleanup.reason};
 const incomplete={format:'cimiloop/opencode-workspace-incomplete/1.0.0',nonce,original_scope_digest:scope_digest,native_exit:{code:130,signal:null},interruption_reason:'workspace_rehearsal_cancel_requested',completion_proven:false};
 const sdk={sessionID:'session_1',messageID:'message_1',callID:'call_1'},call_id='sdk_'+digest(JSON.stringify([sdk.sessionID,sdk.messageID,sdk.callID])).value;
 const request={format:'cimiloop/agent-runtime-method-request/1.0.0',scope_digest,profile_digest:method_original_binding.profile_digest,call_id,tool:'invoke_skill',argument:'entry'},receipt={format:'cimiloop/agent-named-method-receipt/1.0.0',scope_digest,profile_digest:request.profile_digest,call_id,function_name:'invoke_skill',argument:'entry',resource_path:'entry/SKILL.md',resource_digest:digest('PUBLIC entry').value,text:'PUBLIC entry',formal_agent_execution_enabled:false};
 const modelRequest={call_id:'model_0001',tool:'model_step'},response={content:[{type:'tool-call',tool_call_id:sdk.callID,tool_name:'cimi_invoke_skill',arguments:JSON.stringify({name:'entry'})}],usage:{input_tokens:1,output_tokens:1},finish:'tool_calls'};
 const events=[native,{type:'step_start',sessionID:sdk.sessionID,part:{type:'step-start',sessionID:sdk.sessionID,messageID:sdk.messageID}},{type:'tool_use',sessionID:sdk.sessionID,part:{type:'tool',...sdk,tool:'cimi_invoke_skill',state:{status:'completed',input:{name:'entry'},output:JSON.stringify({...receipt,replay:false})}}},{type:'step_finish',sessionID:sdk.sessionID,part:{type:'step-finish',messageID:sdk.messageID,reason:'tool-calls'}},cleanup];
 const records:Record<string,unknown>={'original-config.json':config,'original-launcher.json':launch,'agent-sandbox-resources.json':resources,'agent-sandbox-original.json':native,'agent-sandbox-cleanup.json':cleanup,'agent-sandbox-cancellation.json':proof,'incomplete.json':incomplete,'agent-runtime-cancel.json':marker};
 const artifacts=Object.entries(records).map(([name,value])=>{const bytes=Buffer.from(JSON.stringify(value)),hash=digest(bytes);writeFileSync(join(operation,name),bytes);const locator=join(blobs,hash.value);writeFileSync(locator,bytes);return{name,reference:{provider:'cimiloop-runtime-probe',resource_type:'agent_runtime_original_bytes',version:name,locator,digest:hash}};});
 const stdout=Buffer.from(events.map(e=>JSON.stringify(e)).join('\n')+'\n');writeFileSync(join(operation,'stdout.raw'),stdout);writeFileSync(join(operation,'stderr.raw'),'');
 const cancellation=runtime.verifyAgentRuntimeCancellation({scope_digest,owner,operation_id,cancellation_digest},name=>name==='agent-runtime-cancel.json'?markerBytes:records[name]?Buffer.from(JSON.stringify(records[name])):undefined);
 const collection={format:'cimiloop/agent-runtime-originals/1.0.0',scope_digest,status:{status:'Stopped',operation,input_digest:digest('original input').value,cancellation_requested:true,resources_disposed:true},artifacts,cancellation,synthetic_model_responses:null};
 original.identity.mockReturnValue({scope,operation,input,claim:{owner,operation_id,synthetic_model_responses:null}});original.marker.mockReturnValue({bytes:markerBytes,digest:digest(markerBytes)});original.operation.mockReturnValue({config,launch,resources});original.job.mockReturnValue(null);
 original.method.mockReturnValue({original_binding:method_original_binding,context:{profile:{entry_name:'entry',resources:[{path:'entry/SKILL.md'},{path:'not-yet-read.txt'}]}},calls:[{request,receipt}],artifacts:[]});
 original.model.mockReturnValue({status:'Observed',admission_digest:input.provider_options.admission_digest,task_packet_digest:digest(input.prompt).value,original_evidence,calls:[{call_id:'model_0001',state:'reply_recorded',request:modelRequest,response}],artifacts:[modelHeader]});
 original.ipc.mockReturnValue({status:'Observed',unresolved:0,header:{scope,endpoint:{scope_digest,appcontainer_sid:native.appcontainer_sid,peer,supervisor,model_admission_digest:input.provider_options.admission_digest}},exchanges:[{ordinal:1,state:'reply_recorded',request:modelRequest,reply:{outcome:'completed',receipt:response,replay:false}},{ordinal:2,state:'reply_recorded',request,reply:{outcome:'completed',receipt,replay:false}}],artifacts:[]});
 return{root,operation,scope,collection,records,events,request,receipt};
}
beforeEach(()=>{vi.resetAllMocks();f=fixture();root=f.root;});
afterEach(()=>{vi.restoreAllMocks();if(dirname(root)!==tmpdir()||!basename(root).startsWith('cimiloop-named-cancel-unit-'))throw Error('Unsafe fresh cleanup');rmSync(root,{recursive:true,force:true});});
const read=()=>{const reader=Reflect.get(runtime,'readAgentRuntimeNamedMethodCancellation');expect(reader).toBeTypeOf('function');return reader(root,f.scope,{profile:{PUBLIC:true},files:[]},f.collection as unknown as Parameters<typeof runtime.readAgentRuntimeNamedMethodCancellation>[3]);};
it('reverifies original interrupted method and complete call prefix without inventing success or remaining material reads',()=>{
 expect(read()).toMatchObject({status:'Observed',cancellation_reverified:true,method_result_reverified:false,costs_reconciled:false,domain_observation_produced:false});expect(read()).not.toHaveProperty('output');
});
it.each(['os_live','foreign_scope','synthetic','marker_missing','marker_changed','cancel_removed','ordinary_exit','incomplete_exit','model_unresolved','missing_ipc','foreign_model','extra_method','sdk_input','sdk_output','binding','material_drift'])('keeps %s original Unknown',kind=>{
 if(kind==='os_live')f.collection.status.status='Running';if(kind==='foreign_scope')f.collection.scope_digest=digest('foreign').value;if(kind==='synthetic')Reflect.set(f.collection,'synthetic_model_responses',true);if(kind==='marker_missing')original.marker.mockReturnValue(undefined);if(kind==='marker_changed')original.marker.mockReturnValue({bytes:Buffer.from('{}'),digest:digest('{}')});if(kind==='cancel_removed')Reflect.deleteProperty(f.collection,'cancellation');
 if(kind==='ordinary_exit')writeFileSync(join(f.operation,'agent-sandbox-cleanup.json'),JSON.stringify({...f.records['agent-sandbox-cleanup.json'] as object,reason:'exited',exit_code:0}));if(kind==='incomplete_exit')writeFileSync(join(f.operation,'incomplete.json'),JSON.stringify({...f.records['incomplete.json'] as object,native_exit:{code:0,signal:null}}));
 if(kind==='model_unresolved'){const model=original.model.mock.results[0]?.value??original.model();model.calls[0].state='unknown';model.calls[0].response=null;}
 if(kind==='missing_ipc')original.ipc().exchanges.pop();if(kind==='foreign_model')original.model().admission_digest=digest('foreign').value;if(kind==='extra_method')original.method().calls.push({...original.method().calls[0],receipt:{...f.receipt,call_id:'foreign'}});
 if(kind==='sdk_input'||kind==='sdk_output'){const part=f.events[2] as any;if(kind==='sdk_input')part.part.state.input={name:'foreign'};else part.part.state.output='{}';writeFileSync(join(f.operation,'stdout.raw'),f.events.map(e=>JSON.stringify(e)).join('\n')+'\n');}
 if(kind==='binding')original.identity().input.model_original_binding={foreign:true};if(kind==='material_drift'){const method=original.method();original.method.mockReturnValueOnce(method).mockImplementationOnce(()=>{throw Error('PUBLIC original material drift');});}
 expect(read()).toMatchObject({status:'Unknown',cancellation_reverified:false});
});

it('rejects an otherwise exactly matched SDK prefix that continues after an earlier original stop',()=>{
 const model=original.model(),ipc=original.ipc(),second=structuredClone(model.calls[0]);second.call_id='model_0002';second.request.call_id='model_0002';
 const first={call_id:'model_0001',state:'reply_recorded',request:{call_id:'model_0001',tool:'model_step'},response:{content:[{type:'text',text:'PUBLIC stop'}],usage:{input_tokens:1,output_tokens:1},finish:'stop'}};
 model.calls=[first,second];ipc.exchanges=[{ordinal:1,state:'reply_recorded',request:first.request,reply:{outcome:'completed',receipt:first.response,replay:false}},{ordinal:2,state:'reply_recorded',request:second.request,reply:{outcome:'completed',receipt:second.response,replay:false}},{...ipc.exchanges[1],ordinal:3}];
 const events=[f.events[0],{type:'step_start',sessionID:'session_1',part:{type:'step-start',sessionID:'session_1',messageID:'message_0'}},{type:'text',sessionID:'session_1',part:{type:'text',sessionID:'session_1',messageID:'message_0',text:'PUBLIC stop'}},{type:'step_finish',sessionID:'session_1',part:{type:'step-finish',messageID:'message_0',reason:'stop'}},...f.events.slice(1)];
 writeFileSync(join(f.operation,'stdout.raw'),events.map(e=>JSON.stringify(e)).join('\n')+'\n');expect(read()).toMatchObject({status:'Unknown',cancellation_reverified:false});
});
