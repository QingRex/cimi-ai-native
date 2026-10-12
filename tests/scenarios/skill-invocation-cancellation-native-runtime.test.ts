import {constructedNamedTranscript} from '../fixtures/named-method-transcript.js';
import {startWorkbench} from '../../apps/workbench/src/server.js';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,renameSync,unlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {describe,it,expect,vi} from 'vitest';
import {CimiLoopKernel} from '../../packages/kernel/src/index.js';
import {contentDigest} from '../../packages/kernel/src/intent.js';
import {SCHEMA_VERSION,createInternalId,type SkillImportSpec,type ProviderBinding,type ProviderEvidence,type ProviderEvaluation} from '../../packages/protocol/src/v2/index.js';
import {LocalNamedSkillMethodAssessment,LocalSkillMethodInputs,LocalSkillInvocationStartCustody,LocalSkillInvocationExecution,LocalSkillInvocationNativeComposition,LocalSkillInvocationDedicatedAccount,LocalSkillInvocationResultCollection,LocalHumanAgentRunCostObservation,LocalAgentRuntimeObservation,openLocalProject,writeInstance} from '../../packages/local-app/dist/index.js';
import {readOriginalSkillInvocation,type SkillInvocationExecutionContext} from '../../packages/local-app/src/skill-invocation-execution-local.js';
import {readOriginalLocalAgentRunCosts,type LocalAgentRunFamilyReader} from '../../packages/local-app/src/agent-run-family-costs-local.js';
import {AgentRuntimeModelHost as BuiltAgentRuntimeModelHost,requestAgentRuntimeCancellation,readAgentRuntimeNamedMethodCancellation,collectAgentRuntimeOperation,AgentStartLedger,DedicatedAgentAccountLedger,parseDedicatedAgentSkillAccountScope,readAgentRuntimeNamedMethodResult,readDedicatedAgentModelOriginals,readAgentRuntimeOriginalIdentity,digest} from '../../packages/runtime-adapter/dist/index.js';
import {claimAgentRuntimeOperation} from '../../packages/runtime-adapter/src/agent-runtime-operation.js';
import {AgentRuntimeModelHost,parseAgentRuntimeModelRequest} from '../../packages/runtime-adapter/src/agent-runtime-model.js';
import {createDedicatedAgentRuntimeModel} from '../../packages/runtime-adapter/src/agent-dedicated-model.js';
import {httpFixture,HTTP_FIXTURE_KEY} from '../../packages/runtime-adapter/test/gateway-http-fixture.js';
import {createAgentRunProject} from '../fixtures/agent-run-project.js';
import {createAccountBillingEntry} from '../fixtures/agent-account-billing-entry.js';
import {flowSuccess,flowTime} from '../fixtures/flow-project.js';

// Actual Git package bytes, Kernel, SQLite, application factory, Windows Native,
// OS IPC and SDK tools. Qualification/account approval/provider replies/address
// and credential are constructed; this proves neither real Skill nor S1.
describe.runIf(process.platform==='win32'&&process.arch==='x64')('original Skill cancellation to Kernel composition',()=>{
it('reconciles the original actual SDK child cancellation and final bills through HTTP without reopening',async()=>{const expectedStatus='succeeded' as const;
 const parent=join(process.cwd(),'.cimiloop','new-host-s1','skill-cancellation-fixtures');mkdirSync(parent,{recursive:true});
 // CLR physical executable paths must stay below MAX_PATH. Use a fresh bounded
 // retained repository, not aliases/copies of a previously failed original Run.
 const root=mkdtempSync(join(parent,'cimiloop-skill-cancellation-')),repository=mkdtempSync(join(process.cwd(),'_')),source=join(root,'public-source');mkdirSync(join(source,'skills','entry'),{recursive:true});mkdirSync(join(source,'skills','dependency','references'),{recursive:true});
 writeFileSync(join(source,'LICENSE'),'Public constructed method package license\n');
 writeFileSync(join(source,'skills','entry','SKILL.md'),'---\nname: entry\ndescription: Constructed fixed method\n---\nInvoke dependency and read the original fixed input.\n');
 writeFileSync(join(source,'skills','dependency','SKILL.md'),'---\nname: dependency\ndescription: Constructed fixed dependency\n---\nRead the original artifact; propose findings only.\n');
 writeFileSync(join(source,'skills','dependency','references','format.md'),'Use strict review output.\n');
 const git=(...args:string[])=>execFileSync('git',['-c','commit.gpgsign=false','-c','core.hooksPath=disabled-hooks','-C',source,...args],{encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();
 git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');git('add','.');git('commit','-m','public constructed method');
 const f=createAgentRunProject(repository,'task_execution',500,undefined,undefined,undefined,undefined,240000),dataDirectory=dirname(f.path),inputs=new LocalSkillMethodInputs(repository,dataDirectory);
 let origin:AgentStartLedger|undefined,account:DedicatedAgentAccountLedger|undefined,tls:Awaited<ReturnType<typeof httpFixture>>|undefined,parentTls:Awaited<ReturnType<typeof httpFixture>>|undefined;
 try {
  const spec:SkillImportSpec={format:'cimiloop/skill-import/1.0.0',repository_url:'https://example.test/public-skills',commit_id:git('rev-parse','HEAD'),entry_path:'skills/entry',license_path:'LICENSE',name:'application-method-fixture',version:'1.0.0',modules:[{path:'skills/entry',dependencies:['skills/dependency']},{path:'skills/dependency',dependencies:[]}],capabilities:[{capability_id:'verification.review',version:'1.0.0'}],provider_dependencies:[],required_permissions:{actions:[],resources:[],environment_ids:[],network_hosts:[]},harness_requirements:['invoke_skills'],dependency_review:'Constructed qualification and method; not real Matt or Superpowers.'};
  const imported=inputs.packages.importGit(source,spec),registration=flowSuccess(f.humanKernel.execute(f.projectCommand('RegisterProvider',imported.registration)));if(registration.command_type!=='RegisterProvider')throw Error('Expected provider');const descriptor=registration.data.descriptor;
  const metadata=()=>({schema_version:SCHEMA_VERSION,id:createInternalId(),project_id:f.project.id,created_at:flowTime,producer_actor_id:f.actor.id});
  const evidence:ProviderEvidence={...metadata(),descriptor_ref:{object_type:'provider_descriptor',id:descriptor.id},descriptor_digest:contentDigest(descriptor),purpose:'skill_probe',origin:'local_skill_observation',observed_at:flowTime,raw_result_ref:inputs.packages.content.storeContent(Buffer.from('Constructed qualification only'),'provider_probe_snapshot')};
  const evaluation:ProviderEvaluation={...metadata(),descriptor_ref:evidence.descriptor_ref,descriptor_digest:evidence.descriptor_digest,purpose:'provider_assessment',profile:'controlled_execution',rule_version:'skill-provider-assessment/1.0.0',input_digest:contentDigest({constructed:descriptor.id}),evidence_refs:[{object_type:'evidence',id:evidence.id}],outcome:'ALLOW',reasons:[],assessments:[{key:'constructed-domain-only',result:'supports',evidence_refs:[]}]};
  const binding:ProviderBinding={...f.skill,...metadata(),descriptor_ref:evidence.descriptor_ref,descriptor_digest:evidence.descriptor_digest,input_schema_ref:descriptor.input_schema_ref,output_schema_ref:descriptor.output_schema_ref,approval:{...f.skill.approval!,evaluation_ref:{object_type:'evaluation',id:evaluation.id},input_digest:evaluation.input_digest},probe_evidence_refs:evaluation.evidence_refs};
  f.store.transaction(tx=>{tx.insertProviderEvidence(evidence);tx.insertProviderEvaluation(evaluation);tx.insertProviderBinding(binding);});
  const kernel=new CimiLoopKernel({store:f.store,caller:f.caller,now:()=>new Date().toISOString(),runVerifier:f.runPort});
  const pins={...f.pins,skill_bindings:[{binding_ref:{object_type:'provider_binding' as const,id:binding.id},digest:contentDigest(binding)}]};
  const preparation=flowSuccess(kernel.execute(f.prepareCommand(pins)));if(preparation.command_type!=='PrepareRunContext'||!('runtime_binding' in preparation.data.context))throw Error('Expected agent context');
  const reservation=flowSuccess(kernel.execute(f.reserveCommand({...preparation.data,context:preparation.data.context},500)));if(reservation.command_type!=='ReserveRun')throw Error('Expected parent Run');
  origin=AgentStartLedger.initialize(join(dataDirectory,'child-host'),{machine_digest:digest('constructed machine').value,principal_digest:digest('constructed principal').value});
  // This qualification uses complete constructed samples and a PUBLIC fake
  // original-model/harness verifier. It never proves real method behavior.
  const qualificationOriginals={verify:()=>({origin:'external_model' as const,checks:{runtime_custody:'passed' as const,independent_context:'passed' as const,provider_dependencies:'passed' as const,permission_intersection:'passed' as const,cost_accounting_and_cap:'passed' as const,invocation_recovery:'passed' as const,behavior:'passed' as const,harness:{invoke_skills:'passed' as const}}})};
  const assessor=new LocalNamedSkillMethodAssessment(repository,dataDirectory),custody=new LocalSkillInvocationStartCustody(repository,dataDirectory,origin),prepare=inputs.invocationPreparer(id=>f.store.getProviderDescriptor(id),{verify:(project,record,_context,_binding,originalDescriptor,plan)=>{
    const content=inputs.packages.content,artifact=(value:unknown)=>content.storeContent(Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value)),'provider_probe_artifact');
    const samples=Array.from({length:2},()=>{const invocation_key=createInternalId(),samplePlan=inputs.read(project,originalDescriptor,{invocation_key,method_name:plan.request.method_name,input_ref:plan.input_ref});
      const original=constructedNamedTranscript(samplePlan.profile,samplePlan.files,{purpose:'review',findings:[],limitations:['Constructed qualification sample; not actual model/Skill']},samplePlan.prompt);
      return {invocation_key,input_ref:plan.input_ref,transcript_ref:artifact(original.transcript),stdout_ref:artifact(original.stdout),native_proof_ref:artifact(original.native)};});
    const evidence={format:'cimiloop/named-skill-method-evidence/1.0.0',project_id:project.id,descriptor_ref:{object_type:'provider_descriptor',id:originalDescriptor.id},descriptor_digest:contentDigest(originalDescriptor),runtime_binding:record.runtime_binding,method_name:plan.request.method_name,purpose:'review',observed_at:new Date().toISOString(),samples};
    const ref=content.storeContent(Buffer.from(JSON.stringify(evidence)),'named_skill_method_evidence'),assessment=assessor.evaluate(project,originalDescriptor,ref,'controlled_execution',qualificationOriginals);expect(assessment.outcome).toBe('ALLOW');return content.storeContent(Buffer.from(JSON.stringify(assessment)),'skill_method_qualification');
  }});
  f.runPort.agent.skills={prepare:(...args)=>custody.bindPreparation(...args,prepare(...args)),readResult:()=>{throw Error('Domain result not installed');},checkExecutionAuthority:(_project,request)=>contentDigest({constructed_authority:request})};
  const artifact=inputs.packages.content.storeContent(Buffer.from('Public fixed diff\n'),'workspace_diff'),input_ref=inputs.packages.content.storeContent(Buffer.from(JSON.stringify({purpose:'review',goal:'Review original child',spec:'Fixed public specification',standards:'Fixed public standard',artifact_refs:[artifact]})),'skill_method_input');
  const child=flowSuccess(kernel.execute(f.command('ReserveSkillInvocation','run',reservation.data.run.id,{skill_binding_ref:{object_type:'provider_binding',id:binding.id},method_name:'entry',input_ref})));if(child.command_type!=='ReserveSkillInvocation')throw Error('Expected original child');const invocation=child.data.invocation;
  // The source fixture store and built LocalProject store expose the same
  // production public API but have separate nominal TypeScript private brands.
  const local:SkillInvocationExecutionContext={store:f.store as unknown as SkillInvocationExecutionContext['store'],caller:f.caller,kernel,location:{repositoryKind:'git' as const,repositoryPath:repository,dataDirectory,databasePath:f.path,instancePath:join(dataDirectory,'instance.json'),suggestedName:'Actual child application fixture'}};
  const original=readOriginalSkillInvocation(local,invocation.id),relation=custody.accountScope(original.project,invocation,original.request.parent,original.record_id),plan=inputs.readInvocation(f.project,descriptor,invocation);
  const connection={format:'cimiloop/dedicated-model/1.0.0' as const,provider:'zhipuai-coding-plan' as const,model:'zhipuai-coding-plan/glm-fixture',credential_file:join(root,'PUBLIC-absent.dpapi.json'),credential_digest:digest('public constructed credential identity')};
  const policy={format:'cimiloop/dedicated-agent-account/1.0.0' as const,host_identity_digest:origin.identityDigest,account_digest:digest(root).value,approval_digest:digest('constructed approval').value,package_digest:digest('constructed package').value,tariff_digest:digest('constructed tariff').value,admission_digest:digest('constructed admission').value,connection_digest:digest(JSON.stringify(connection)).value,profile:{model:'glm-fixture',thinking:'enabled' as const},cash_limit_micros:500,credit_limit_micro_units:200,cash_per_call_upper_micros:30,credit_per_call_upper_micro_units:10,input_token_limit:1000000,output_token_limit:512};
  const currency=f.store.getRuntimeRecord('run_record',original.record_id)!.cost_currency!,billProjections=new Map<string,unknown>();
  account=DedicatedAgentAccountLedger.initialize({origin,repositoryPath:repository,root:join(root,'public-account'),policy,connection,admission:{check:async()=>{},checkSkillScope:async()=>{}},custody:{protect:()=>{},verify:()=>{}},billing:{identity_digest:digest('PUBLIC constructed Skill bill verifier').value,currency,credit_unit:'coding_request_micro_units',verifyOriginal:bytes=>{const projection=billProjections.get(digest(bytes).value);if(!projection)throw Error('PUBLIC original bill authentication absent');return projection;}}});
  // PUBLIC CONSTRUCTED parent model originals only; this parent claim is not
  // a Native process or formal execution. The Skill child below is actual Native.
  parentTls=await httpFixture({reply:raw=>({content_type:'application/json',chunks:[Buffer.from(JSON.stringify({id:'PUBLIC-parent-cost-1',model:'glm-fixture',request_id:(raw as {request_id:string}).request_id,choices:[{index:0,message:{role:'assistant',content:'PUBLIC constructed parent result',reasoning_content:'PUBLIC parent reasoning'},finish_reason:'stop'}],usage:{prompt_tokens:5,completion_tokens:5,total_tokens:10}}))]})});
  const parentHost=await AgentRuntimeModelHost.initialize(dataDirectory,relation.parent,createDedicatedAgentRuntimeModel({root:dataDirectory,repositoryPath:repository,credentialBoundaryRoot:dataDirectory,scope:relation.parent,connection,account},{boundary:parentTls.boundary,readCredential:async()=>HTTP_FIXTURE_KEY}),['cimi_read']);
  claimAgentRuntimeOperation(dataDirectory,relation.parent,{purpose:'agent_runtime',model_original_binding:parentHost.originalBinding},{pid:1234,creation_ticks:'123456',image:process.execPath});
  await parentHost.execute(parseAgentRuntimeModelRequest(relation.parent,{format:'cimiloop/agent-runtime-model-request/1.0.0',scope_digest:digest(JSON.stringify(relation.parent)).value,admission_digest:account.admission_digest,call_id:'model_0001',tool:'model_step',prompt:[{role:'user',content:'PUBLIC constructed parent cost'}],tools:[],max_output_tokens:512},['cimi_read']));
  // Kernel already owns this reservation; an account-only empty family is not complete.
  expect(()=>readOriginalLocalAgentRunCosts(repository,dataDirectory,relation.parent,account!,f.store as unknown as LocalAgentRunFamilyReader)).toThrow();
  const actions=[{name:'cimi_invoke_skill',args:{name:plan.profile.entry_name}}];let sends=0,credentialReads=0;
  const output={purpose:'review',findings:[],limitations:['Constructed model/qualification; cancellation accepts no output']};
  tls=await httpFixture({reply:raw=>{const body=raw as {request_id:string},action=actions[sends++],response={id:'public_original_'+sends,object:'chat.completion',model:'glm-fixture',request_id:body.request_id,choices:[{index:0,message:{role:'assistant',content:action?null:JSON.stringify(output),reasoning_content:'Public controlled reasoning',...(action?{tool_calls:[{id:'public_call_'+sends,type:'function',function:{name:action.name,arguments:JSON.stringify(action.args)}}]}:{})},finish_reason:action?'tool_calls':'stop'}],usage:{prompt_tokens:7,completion_tokens:9,total_tokens:16}};return {content_type:'application/json',chunks:[Buffer.from(JSON.stringify(response))]};}});
  const network=tls;vi.spyOn(LocalSkillInvocationDedicatedAccount.prototype,'createModel').mockImplementation(function(this:LocalSkillInvocationDedicatedAccount,connection){return createDedicatedAgentRuntimeModel({root:this.modelRoot,repositoryPath:repository,credentialBoundaryRoot:dataDirectory,scope:this.scope,connection,account:this,methodTools:'fixed_named_method/1.0.0'},{boundary:network.boundary,readCredential:async()=>{credentialReads++;return HTTP_FIXTURE_KEY;}});});
  const installed=LocalSkillInvocationNativeComposition.open({local,custody,inputs,account,connection,binary:join(process.env.APPDATA!,'npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe')});
  const prepareOriginal=installed.prepare.bind(installed);vi.spyOn(installed,'prepare').mockImplementation(async(...args)=>{const lease=await prepareOriginal(...args);return {...lease,launch:async()=>{try{await lease.launch();}catch(error){const reason=(error as {reason?:unknown}).reason;console.error('Public fixture launch error code: '+(typeof reason==='string'&&/^[a-z0-9_]{1,128}$/.test(reason)?reason:'unclassified'));const control=(error as {controlFailure?:unknown}).controlFailure;if(control)console.error('Public fixture control failure: '+JSON.stringify(control));throw error;}}};});

  const modelRoot=join(dataDirectory,'skill-runtime-originals',f.project.id,invocation.invocation_key);
  let cancellationCommand:ReturnType<typeof f.humanCommand>|undefined,cancellationReceipt:unknown;
  const originalExecute=BuiltAgentRuntimeModelHost.prototype.execute;
  vi.spyOn(BuiltAgentRuntimeModelHost.prototype,'execute').mockImplementation(async function(this:BuiltAgentRuntimeModelHost,...args){
   const result=await originalExecute.apply(this,args);
   if(result.receipt.finish==='stop'&&!cancellationCommand){
    cancellationCommand=f.humanCommand('CancelRun','run',invocation.run_ref.id,{reason:'PUBLIC cancel at complete original model reply boundary'},'technical_owner');
    cancellationReceipt=flowSuccess(new CimiLoopKernel({store:f.store,caller:{kind:'local_operator',project_id:f.project.id,actor_id:f.actor.id},now:()=>new Date().toISOString(),runVerifier:f.runPort}).execute(cancellationCommand));
    requestAgentRuntimeCancellation(modelRoot,relation.child);
   }
   return result;
  });
  const sequence=f.store.asOfEventSequence(),service=new LocalSkillInvocationExecution(local,installed);
  await service.start(invocation.id);expect(cancellationCommand).toBeDefined();expect(sends).toBe(2);expect(credentialReads).toBe(2);
  const collection=await collectAgentRuntimeOperation(modelRoot,relation.child),candidate=readAgentRuntimeNamedMethodCancellation(modelRoot,relation.child,plan,collection);
  expect(collection.status).toMatchObject({status:'Stopped',cancellation_requested:true,resources_disposed:true});expect(candidate).toMatchObject({status:'Observed',cancellation_reverified:true,method_result_reverified:false});expect(candidate).not.toHaveProperty('output');
  const calls=readDedicatedAgentModelOriginals(modelRoot,relation.child).calls;expect(calls).toHaveLength(2);
  const bill=Buffer.from('PUBLIC CONSTRUCTED complete cancelled child bill');billProjections.set(digest(bill).value,{format:'cimiloop/dedicated-account-bill/1.0.0',bill_id:'public-child-cancelled-final',account_digest:policy.account_digest,approval_digest:policy.approval_digest,package_digest:policy.package_digest,tariff_digest:policy.tariff_digest,connection_digest:policy.connection_digest,currency,credit_unit:'coding_request_micro_units',items:calls.map(call=>{const hold=call.hold!;return{request_id:hold.request_id,scope_digest:hold.scope_digest,call_id:hold.call_id,request_digest:hold.request_digest,hold_digest:digest(JSON.stringify(hold)).value,cash_charged_micros:12,credit_charged_micro_units:4};})});
  const collector=new LocalSkillInvocationResultCollection({local,custody,inputs,account,qualificationOriginals});await expect(collector.captureCancellationReconciliation(invocation.id,f.actor.id)).rejects.toThrow();account.observeBill(bill);
  const captured=await collector.captureCancellationReconciliation(invocation.id,f.actor.id);expect(captured.report).toMatchObject({status:'cancelled',usage:{cost_known:true,cost_micros:24,currency},basis:'reconciliation'});expect(captured.report).not.toHaveProperty('output');expect(collector.readResult(f.project,invocation,captured.reference)).toEqual(captured.report);
  writeInstance(join(dataDirectory,'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
  const request={command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:'technical_owner',command_type:'ReconcileSkillInvocation',target:{object_type:'run',id:invocation.run_ref.id},expected_revision:f.store.getRun(invocation.run_ref.id)!.revision,payload:{invocation_ref:{object_type:'skill_invocation',id:invocation.id}}};
  let opens=0,releases=0,server=await startWorkbench({projectDir:repository,skillReconciliationForInvocation:()=>{opens++;return{collector,release(){releases++;throw Error('PUBLIC response loss after original cancellation commit');}};}});
  let sessionAuth:{cookie:string;csrf:string}|undefined;
  const session=async()=>{if(sessionAuth)return sessionAuth;const response=await fetch(server.origin+'/api/session',{method:'POST',headers:{Origin:server.origin,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});sessionAuth={cookie:response.headers.get('set-cookie')!.split(';')[0]!,csrf:(await response.json() as {csrf:string}).csrf};return sessionAuth;};
  const send=async()=>{const auth=await session(),response=await fetch(server.origin+'/api/skill-invocations/'+invocation.id+'/reconcile-original',{method:'POST',headers:{Cookie:auth.cookie,Origin:server.origin,'Content-Type':'application/json','X-CimiLoop-CSRF':auth.csrf,Connection:'close'},body:JSON.stringify(request)});return{status:response.status,body:await response.json() as any};};
  let replay:unknown;
  try{expect((await send()).status).toBe(409);expect(f.store.asOfEventSequence()).toBe(sequence+2);await server.close();server=await startWorkbench({projectDir:repository});sessionAuth=undefined;const result=await send();expect(result.status).toBe(200);expect(result.body).toMatchObject({data:{observation:{resulting_status:'Cancelled'},run:{status:'Unknown',reservation_released:false}}});replay=result.body;expect((await send()).body).toEqual(replay);expect(f.store.asOfEventSequence()).toBe(sequence+2);expect(opens).toBe(1);expect(releases).toBe(1);}
  finally{await server.close();}
  expect(await new LocalSkillInvocationExecution(local,{custody}).start(invocation.id)).toMatchObject({outcome:'unknown'});expect(sends).toBe(2);expect(f.store.listRuns(f.change.id)).toHaveLength(1);expect(f.task().status).not.toBe('Satisfied');expect(f.task().usage.pending_reconciliation).toBe(true);expect(f.task().usage.cost_reserved_micros).toBe(500);
  writeFileSync(join(dataDirectory,'d278-child-cancellation-summary.json'),JSON.stringify({actual_native:true,actual_sdk:true,actual_http_kernel:true,original_command_replayed_after_restart:true,constructed_qualification:true,constructed_model:true,constructed_bill:true,real_skill:false,s1_accepted:false,status:'cancelled',model_requests:sends,fee_micros:24,credit_micro_units:8,reservation_released:false,task_accepted:false,root,repository,cancellation_receipt:cancellationReceipt,candidate,replay},null,2)+'\n',{flag:'wx'});
 }finally{vi.restoreAllMocks();await parentTls?.close();await tls?.close();account?.close();origin?.close();f.store.close();console.error('Retain original D278 Skill cancellation fixture: '+root+' repository '+repository);}
},240000);
});
