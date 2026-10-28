import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,dirname,basename} from 'node:path';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const original=vi.hoisted(()=>({identity:vi.fn(),marker:vi.fn(),operation:vi.fn(),method:vi.fn(),model:vi.fn(),ipc:vi.fn(),job:vi.fn(),codex:vi.fn(),collectedCodex:vi.fn(),dedicated:vi.fn(),collectedDedicated:vi.fn()}));
vi.mock('../src/agent-codex-model.js',async load=>({...await load<typeof import('../src/agent-codex-model.js')>(),readCodexAgentModelOriginals:original.codex,verifyCollectedCodexAgentModelOriginals:original.collectedCodex}));
vi.mock('../src/agent-dedicated-model.js',async load=>({...await load<typeof import('../src/agent-dedicated-model.js')>(),readDedicatedAgentModelOriginals:original.dedicated,verifyCollectedDedicatedAgentModelOriginals:original.collectedDedicated}));
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
 const modelHeaderBytes=Buffer.from(JSON.stringify({format:'cimiloop/agent-runtime-model-originals/2.0.0',original_evidence,permitted:['cimi_invoke_skill','cimi_read_method_resource']}));writeFileSync(modelHeader.path,modelHeaderBytes);modelHeader.digest=digest(modelHeaderBytes).value;model_original_binding.header_digest=modelHeader.digest;
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
 original.dedicated.mockImplementation(()=>({summary:{status:'Observed',original_requirement_pinned:true,budget_identity_pinned:true,scope_digest,header_digest:original_evidence.header_digest,admission_digest:input.provider_options.admission_digest},calls:original.model().calls.map((call:{call_id:string;state:string})=>({call_id:call.call_id,state:call.state})),artifacts:[]}));
 original.ipc.mockReturnValue({status:'Observed',unresolved:0,header:{scope,endpoint:{scope_digest,appcontainer_sid:native.appcontainer_sid,peer,supervisor,model_admission_digest:input.provider_options.admission_digest}},exchanges:[{ordinal:1,state:'reply_recorded',request:modelRequest,reply:{outcome:'completed',receipt:response,replay:false}},{ordinal:2,state:'reply_recorded',request,reply:{outcome:'completed',receipt,replay:false}}],artifacts:[]});
 return{root,operation,scope,collection,records,events,request,receipt};
}
beforeEach(()=>{vi.resetAllMocks();f=fixture();root=f.root;});
afterEach(()=>{vi.restoreAllMocks();if(dirname(root)!==tmpdir()||!basename(root).startsWith('cimiloop-named-cancel-unit-'))throw Error('Unsafe fresh cleanup');rmSync(root,{recursive:true,force:true});});
const read=()=>{const reader=Reflect.get(runtime,'readAgentRuntimeNamedMethodCancellation');expect(reader).toBeTypeOf('function');return reader(root,f.scope,{profile:{PUBLIC:true},files:[]},f.collection as unknown as Parameters<typeof runtime.readAgentRuntimeNamedMethodCancellation>[3]);};
it('reverifies original interrupted method and complete call prefix without inventing success or remaining material reads',()=>{
 expect(read()).toMatchObject({status:'Observed',cancellation_reverified:true,method_result_reverified:false,costs_reconciled:false,domain_observation_produced:false});expect(original.dedicated).toHaveBeenCalled();expect(original.collectedDedicated).toHaveBeenCalled();expect(read()).not.toHaveProperty('output');
});
function codexFixture(){
 const model=original.model(),identity=original.identity();model.original_evidence={kind:'codex_login/1.0.0',header_digest:digest('PUBLIC Codex original').value};identity.input.model_original_binding.original_evidence=model.original_evidence;
 const header={format:'cimiloop/agent-runtime-model-originals/5.0.0',original_evidence:model.original_evidence,permitted:['cimi_invoke_skill','cimi_read_method_resource']},bytes=Buffer.from(JSON.stringify(header));writeFileSync(model.artifacts[0].path,bytes);model.artifacts[0].digest=digest(bytes).value;identity.input.model_original_binding.header_digest=model.artifacts[0].digest;
 const codex={status:'Observed',scope_digest:digest(JSON.stringify(f.scope)).value,header_digest:model.original_evidence.header_digest,original_requirement_pinned:true,calls:model.calls.map((call:any)=>({call_id:call.call_id,state:'reply_recorded',response:call.response,original:{PUBLIC:'closed original'}})),artifacts:[]};original.codex.mockReturnValue(codex);Reflect.set(f.collection,'format','cimiloop/agent-runtime-originals/2.0.0');Reflect.set(f.collection,'codex_model',{PUBLIC:'independently checked projection'});return codex;
}
it('accepts a fully verified original Codex collection2 cancellation without claiming method success',()=>{
 codexFixture();expect(read()).toMatchObject({status:'Observed',cancellation_reverified:true,method_result_reverified:false,costs_reconciled:false});expect(original.collectedCodex).toHaveBeenCalled();expect(read()).not.toHaveProperty('output');
});
it.each(['missing','unsealed','not_pinned','foreign_header','missing_call','foreign_response','collection_changed','format_downgrade'])('keeps %s Codex cancellation originals Unknown',kind=>{
 const codex=codexFixture();if(kind==='missing')original.codex.mockImplementation(()=>{throw Error('PUBLIC missing original');});if(kind==='unsealed')codex.calls[0].state='unknown';if(kind==='not_pinned')codex.original_requirement_pinned=false;if(kind==='foreign_header')codex.header_digest=digest('foreign').value;if(kind==='missing_call')codex.calls.pop();if(kind==='foreign_response')codex.calls[0].response={content:[],finish:'stop'};
 if(kind==='collection_changed')original.collectedCodex.mockImplementation(()=>{throw Error('PUBLIC raw snapshot mismatch');});if(kind==='format_downgrade')Reflect.set(f.collection,'format','cimiloop/agent-runtime-originals/1.0.0');expect(read()).toMatchObject({status:'Unknown',cancellation_reverified:false});
});
it.each([false,true])('reverifies Codex cancellation with reversed parallel tool completions and unfinished step=%s',unfinished=>{
 const model=original.model(),method=original.method(),ipc=original.ipc(),sdk={sessionID:'session_1',messageID:'message_1',callID:'call_2'},call_id='sdk_'+digest(JSON.stringify([sdk.sessionID,sdk.messageID,sdk.callID])).value;
 const request={...f.request,call_id,tool:'read_method_resource',argument:'not-yet-read.txt'},receipt={...f.receipt,call_id,function_name:'read_method_resource',argument:request.argument,resource_path:request.argument,resource_digest:digest('PUBLIC second material').value,text:'PUBLIC second material'};
 model.calls[0].response.content.push({type:'tool-call',tool_call_id:sdk.callID,tool_name:'cimi_read_method_resource',arguments:JSON.stringify({path:request.argument})});method.calls.push({request,receipt});ipc.exchanges.push({ordinal:3,state:'reply_recorded',request,reply:{outcome:'completed',receipt,replay:false}});
 const second={type:'tool_use',sessionID:sdk.sessionID,part:{type:'tool',...sdk,tool:'cimi_read_method_resource',state:{status:'completed',input:{path:request.argument},output:JSON.stringify({...receipt,replay:false})}}};
 const events=[...f.events.slice(0,2),second,...f.events.slice(2)].filter(event=>!unfinished||!('type'in event)||event.type!=='step_finish');writeFileSync(join(f.operation,'stdout.raw'),events.map(event=>JSON.stringify(event)).join('\n')+'\n');codexFixture();
 expect(read()).toMatchObject({status:'Observed',cancellation_reverified:true,matched_calls:2,method_result_reverified:false,costs_reconciled:false});
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

// Cancellation may win after the host durably replies but before the SDK emits
// step_start. These PUBLIC readers must still prove every original IPC effect.
function appendUnobservedFinalReply(){const model=original.model(),ipc=original.ipc(),last={call_id:'model_0002',state:'reply_recorded',request:{call_id:'model_0002',tool:'model_step'},response:{content:[{type:'text',text:'PUBLIC final reply not observed by SDK'}],usage:{input_tokens:1,output_tokens:1},finish:'stop'}};model.calls.push(last);ipc.exchanges.push({ordinal:3,state:'reply_recorded',request:last.request,reply:{outcome:'completed',receipt:last.response,replay:false}});return{model,ipc,last};}
it('reverifies cancellation when exactly one final host stop reply has no SDK step, without claiming delivery or output',()=>{
 appendUnobservedFinalReply();expect(read()).toMatchObject({status:'Observed',cancellation_reverified:true,method_result_reverified:false,matched_calls:1});expect(read()).not.toHaveProperty('output');
});
it.each(['two_missing_steps','missing_tool_reply','earlier_stop','unfinished_prior_step','effect_after_final_reply'])('keeps the unobserved final reply %s contradiction Unknown',kind=>{
 const{model,ipc,last}=appendUnobservedFinalReply();
 if(kind==='two_missing_steps'){const next=structuredClone(last);next.call_id='model_0003';next.request.call_id='model_0003';model.calls.push(next);ipc.exchanges.push({ordinal:4,state:'reply_recorded',request:next.request,reply:{outcome:'completed',receipt:next.response,replay:false}});}
 if(kind==='missing_tool_reply'){last.response.finish='tool_calls';Reflect.set(last.response,'content',[{type:'tool-call',tool_call_id:'not_observed',tool_name:'cimi_invoke_skill',arguments:JSON.stringify({name:'entry'})}]);}
 if(kind==='earlier_stop'){model.calls[0].response.finish='stop';}
 if(kind==='unfinished_prior_step'){f.events.splice(3,1);writeFileSync(join(f.operation,'stdout.raw'),f.events.map(e=>JSON.stringify(e)).join(String.fromCharCode(10))+String.fromCharCode(10));}
 if(kind==='effect_after_final_reply'){const effect=ipc.exchanges.splice(1,1)[0];effect.ordinal=4;ipc.exchanges.push(effect);}
 expect(read()).toMatchObject({status:'Unknown',cancellation_reverified:false});
});
