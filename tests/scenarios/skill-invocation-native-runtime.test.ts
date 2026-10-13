import {createNativeFixtureRepository} from '../fixtures/native-fixture-root.js';
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
import {AgentStartLedger,DedicatedAgentAccountLedger,parseDedicatedAgentSkillAccountScope,readAgentRuntimeNamedMethodResult,readDedicatedAgentModelOriginals,readAgentRuntimeOriginalIdentity,digest} from '../../packages/runtime-adapter/dist/index.js';
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
describe.runIf(process.platform==='win32'&&process.arch==='x64')('original Skill application to Native composition',()=>{
it.each(['succeeded','failed'] as const)('executes the original reserved child with %s output and queries/retries without another Native or model request',async expectedStatus=>{
 const parent=join(process.cwd(),'.cimiloop','new-host-s1','skill-application-fixtures');mkdirSync(parent,{recursive:true});
 // CLR physical executable paths must stay below MAX_PATH. Use a fresh bounded
 // retained repository, not aliases/copies of a previously failed original Run.
 const root=mkdtempSync(join(parent,'cimiloop-skill-application-')),repository=createNativeFixtureRepository(),source=join(root,'public-source');mkdirSync(join(source,'skills','entry'),{recursive:true});mkdirSync(join(source,'skills','dependency','references'),{recursive:true});
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
  const actions=[...plan.profile.modules.map(m=>({name:'cimi_invoke_skill',args:{name:m.name}})),...plan.profile.resources.filter(r=>r.kind!=='definition').map(r=>({name:'cimi_read_method_resource',args:{path:r.path}}))];let sends=0,credentialReads=0;
  const validOutput={purpose:'review',findings:[],limitations:['Constructed method/provider reply; not actual method qualification.']},output=expectedStatus==='succeeded'?validOutput:{...validOutput,unapproved_extra_field:true};
  tls=await httpFixture({reply:raw=>{const body=raw as {request_id:string},action=actions[sends++],response={id:'public_original_'+sends,object:'chat.completion',model:'glm-fixture',request_id:body.request_id,choices:[{index:0,message:{role:'assistant',content:action?null:JSON.stringify(output),reasoning_content:'Public controlled reasoning',...(action?{tool_calls:[{id:'public_call_'+sends,type:'function',function:{name:action.name,arguments:JSON.stringify(action.args)}}]}:{})},finish_reason:action?'tool_calls':'stop'}],usage:{prompt_tokens:7,completion_tokens:9,total_tokens:16}};return {content_type:'application/json',chunks:[Buffer.from(JSON.stringify(response))]};}});
  const network=tls;vi.spyOn(LocalSkillInvocationDedicatedAccount.prototype,'createModel').mockImplementation(function(this:LocalSkillInvocationDedicatedAccount,connection){return createDedicatedAgentRuntimeModel({root:this.modelRoot,repositoryPath:repository,credentialBoundaryRoot:dataDirectory,scope:this.scope,connection,account:this,methodTools:'fixed_named_method/1.0.0'},{boundary:network.boundary,readCredential:async()=>{credentialReads++;return HTTP_FIXTURE_KEY;}});});
  const installed=LocalSkillInvocationNativeComposition.open({local,custody,inputs,account,connection,binary:join(process.env.APPDATA!,'npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe')});
  const prepareOriginal=installed.prepare.bind(installed);vi.spyOn(installed,'prepare').mockImplementation(async(...args)=>{const lease=await prepareOriginal(...args);return {...lease,launch:async()=>{try{await lease.launch();}catch(error){const reason=(error as {reason?:unknown}).reason;console.error('Public fixture launch error code: '+(typeof reason==='string'&&/^[a-z0-9_]{1,128}$/.test(reason)?reason:'unclassified'));const control=(error as {controlFailure?:unknown}).controlFailure;if(control)console.error('Public fixture control failure: '+JSON.stringify(control));throw error;}}};});
  const service=new LocalSkillInvocationExecution(local,installed),sequence=f.store.asOfEventSequence();
  // Lose only the shared application's completion ACK after actual Native
  // completion. The original dispatch is retained; no second launch repairs it.
  const returned=vi.spyOn(custody,'markReturned').mockImplementationOnce(()=>{throw Error('PUBLIC constructed lost completion ACK');});
  expect(await service.start(invocation.id)).toMatchObject({outcome:'unknown',completion_proven:false,invocation_key:invocation.invocation_key});
  const modelRoot=join(dataDirectory,'skill-runtime-originals',f.project.id,invocation.invocation_key);
  expect(readAgentRuntimeNamedMethodResult(modelRoot,relation.child,plan)).toMatchObject(expectedStatus==='succeeded'?{status:'Observed',method_result_reverified:true,output}:{status:'Observed',method_result_reverified:false,method_failure_reverified:true,failure:{code:'agent_named_method_output_invalid',returned_text_digest:digest(JSON.stringify(output))}});
  expect(readDedicatedAgentModelOriginals(modelRoot,relation.child).summary).toMatchObject({status:'Observed',original_requirement_pinned:true,budget_identity_pinned:true,costs_reconciled:false});
  expect(sends).toBe(actions.length+1);expect(credentialReads).toBe(sends);expect(account.snapshot().holds).toBe(sends+1);
  const replay=new LocalSkillInvocationExecution(local,{custody});expect(replay.query(invocation.id)).toMatchObject({outcome:'unknown'});expect(await replay.start(invocation.id)).toMatchObject({outcome:'unknown'});expect(sends).toBe(actions.length+1);
  expect(f.store.listRuns(f.change.id)).toHaveLength(1);expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.store.getRun(invocation.run_ref.id)?.status).toBe('Reserved');
  const collector=new LocalSkillInvocationResultCollection({local,custody,inputs}),captured=collector.capture(invocation.id);
  expect(captured.report).toMatchObject({status:'unknown',usage:{cost_known:false},invocation_key:invocation.invocation_key});
  returned.mockRestore();custody.markReturned(original.project,invocation,original.request.parent,original.record_id);
  expect(collector.readResult(f.project,invocation,captured.reference)).toEqual(captured.report);
  f.runPort.agent.skills!.readResult=collector.readResult.bind(collector);
  const forged=inputs.packages.content.storeContent(Buffer.from(JSON.stringify({...captured.report,status:'succeeded',output})),'skill_invocation_report');
  expect(kernel.execute(f.command('RecordSkillInvocationObservation','run',invocation.run_ref.id,{invocation_ref:{object_type:'skill_invocation',id:invocation.id},raw_result_ref:forged}))).toMatchObject({code:'EVIDENCE_MISSING'});
  expect(f.store.asOfEventSequence()).toBe(sequence);
  const forgedBill=inputs.packages.content.storeContent(Buffer.from(JSON.stringify({...captured.report,usage:{cost_known:true,cost_micros:0,currency:'USD'}})),'skill_invocation_report');
  expect(()=>collector.readResult(f.project,invocation,forgedBill)).toThrow();
  const proof=JSON.parse(inputs.packages.content.readContent(captured.report.result_proof_ref).toString()),originalProof=structuredClone(proof);
  if(expectedStatus==='succeeded')proof.method.output.limitations=['Self-consistent forged candidate'];else proof.method.failure.returned_text_digest=digest('PUBLIC forged original failed text');
  const falseProof=inputs.packages.content.storeContent(Buffer.from(JSON.stringify(proof)),'skill_invocation_proof'),falseReport=inputs.packages.content.storeContent(Buffer.from(JSON.stringify({...captured.report,result_proof_ref:falseProof})),'skill_invocation_report');
  expect(()=>collector.readResult(f.project,invocation,falseReport)).toThrow();
  const copied=originalProof.artifacts[0],replacement=inputs.packages.content.storeContent(Buffer.from('PUBLIC self-consistent replaced copy'),'provider_probe_artifact');copied.reference=replacement;
  const copiedProof=inputs.packages.content.storeContent(Buffer.from(JSON.stringify(originalProof)),'skill_invocation_proof'),copiedReport=inputs.packages.content.storeContent(Buffer.from(JSON.stringify({...captured.report,result_proof_ref:copiedProof})),'skill_invocation_report');
  expect(()=>collector.readResult(f.project,invocation,copiedReport)).toThrow();
  const observationCommand=f.command('RecordSkillInvocationObservation','run',invocation.run_ref.id,{invocation_ref:{object_type:'skill_invocation',id:invocation.id},raw_result_ref:captured.reference});
  const observed=flowSuccess(kernel.execute(observationCommand));expect(observed.command_type).toBe('RecordSkillInvocationObservation');
  expect(f.store.getRun(invocation.run_ref.id)).toMatchObject({status:'Unknown',cost_known:false});expect(f.task().usage).toMatchObject({pending_reconciliation:true,cost_known:false});
  expect(kernel.execute(observationCommand)).toEqual(observed);expect(f.store.listRuntimeRecords('skill_invocation_observation',f.change.id)).toHaveLength(1);
  expect(collector.readResult(f.project,invocation,captured.reference)).toEqual(captured.report);expect(new LocalSkillInvocationResultCollection({local,custody,inputs}).readResult(f.project,invocation,captured.reference)).toEqual(captured.report);expect(collector.capture(invocation.id)).toEqual(captured);
  expect(await replay.start(invocation.id)).toMatchObject({outcome:'original'});expect(sends).toBe(actions.length+1);
  // Account bills are authenticated by a public controlled code port only;
  // no real provider bill, model/package approval or S1 qualification here.
  const billed=new LocalSkillInvocationResultCollection({local,custody,inputs,...{account}}),captureCosts=Reflect.get(billed,'captureCosts');
  expect(captureCosts).toBeTypeOf('function');
  const billedCapture=()=>captureCosts.call(billed,invocation.id);
  const beforeBills=billed.capture(invocation.id);expect(beforeBills.report).toMatchObject({status:'unknown',usage:{cost_known:false}});
  const modelCalls=readDedicatedAgentModelOriginals(modelRoot,relation.child).calls;
  const addBill=(calls:typeof modelCalls,index:number)=>{const bytes=Buffer.from('PUBLIC CONSTRUCTED original child final bill '+index);billProjections.set(digest(bytes).value,{format:'cimiloop/dedicated-account-bill/1.0.0',bill_id:'public-child-final-'+index,account_digest:policy.account_digest,approval_digest:policy.approval_digest,package_digest:policy.package_digest,tariff_digest:policy.tariff_digest,connection_digest:policy.connection_digest,currency,credit_unit:'coding_request_micro_units',items:calls.map(call=>{const hold=call.hold!;return {request_id:hold.request_id,scope_digest:hold.scope_digest,call_id:hold.call_id,request_digest:hold.request_digest,hold_digest:digest(JSON.stringify(hold)).value,cash_charged_micros:12,credit_charged_micro_units:4};})});account!.observeBill(bytes);};
  expect(()=>billedCapture()).toThrow();addBill(modelCalls.slice(0,1),1);expect(()=>billedCapture()).toThrow();
  expect(collector.readResult(f.project,invocation,captured.reference)).toEqual(captured.report);
  addBill(modelCalls.slice(1),2);
  const accountBefore=account.snapshot(),sequenceBeforeCosts=f.store.asOfEventSequence(),fees=billedCapture();
  expect(fees.report).toMatchObject({status:'unknown',usage:{cost_known:true,cost_micros:modelCalls.length*12,currency}});expect(fees.report).not.toHaveProperty('output');
  expect(Date.parse(fees.report.observed_at)).toBeGreaterThan(Date.parse(beforeBills.report.observed_at));
  expect(billed.capture(invocation.id)).toEqual(beforeBills);
  const feesProof=JSON.parse(inputs.packages.content.readContent(fees.report.result_proof_ref).toString());
  expect(feesProof).toMatchObject({format:expectedStatus==='succeeded'?'cimiloop/original-skill-result-billed-candidate/1.0.0':'cimiloop/original-skill-result-failed-billed-candidate/1.0.0',bills_reverified:true,qualification_reverified:false,model_account_custody_proven:false,costs_reconciled:false,cost_evidence:{costs:{cash_charged_micros:modelCalls.length*12,credit_charged_micro_units:modelCalls.length*4,costs_reconciled:true},scope:relation.child,starts_run:false,kernel_costs_reconciled:false}});
  expect(account.snapshot()).toEqual(accountBefore);expect(f.store.asOfEventSequence()).toBe(sequenceBeforeCosts);
  expect(()=>collector.readResult(f.project,invocation,fees.reference)).toThrow();
  const foreign=createAccountBillingEntry({currency,credentialOutside:true});try{const wrong=new LocalSkillInvocationResultCollection({local,custody,inputs,...{account:foreign.account}});expect(()=>wrong.captureCosts(invocation.id)).toThrow();expect(()=>wrong.readResult(f.project,invocation,fees.reference)).toThrow();}finally{foreign.close();}
  const changedCash=inputs.packages.content.storeContent(Buffer.from(JSON.stringify({...fees.report,usage:{...fees.report.usage,cost_micros:0}})),'skill_invocation_report');expect(()=>billed.readResult(f.project,invocation,changedCash)).toThrow();
  const changedCurrency=inputs.packages.content.storeContent(Buffer.from(JSON.stringify({...fees.report,usage:{...fees.report.usage,currency:currency==='USD'?'CNY':'USD'}})),'skill_invocation_report');expect(()=>billed.readResult(f.project,invocation,changedCurrency)).toThrow();
  const changedProof=structuredClone(feesProof);changedProof.cost_evidence.costs.credit_charged_micro_units=0;
  const changedProofRef=inputs.packages.content.storeContent(Buffer.from(JSON.stringify(changedProof)),'skill_invocation_proof'),changedCredit=inputs.packages.content.storeContent(Buffer.from(JSON.stringify({...fees.report,result_proof_ref:changedProofRef})),'skill_invocation_report');expect(()=>billed.readResult(f.project,invocation,changedCredit)).toThrow();
  const changedUnit=structuredClone(feesProof);changedUnit.cost_evidence.costs.credit_unit='self_consistent_wrong_unit';
  const unitProofRef=inputs.packages.content.storeContent(Buffer.from(JSON.stringify(changedUnit)),'skill_invocation_proof'),unitReport=inputs.packages.content.storeContent(Buffer.from(JSON.stringify({...fees.report,result_proof_ref:unitProofRef})),'skill_invocation_report');expect(()=>billed.readResult(f.project,invocation,unitReport)).toThrow();
  const savedAuth=new Map(billProjections);billProjections.clear();try{expect(()=>billed.readResult(f.project,invocation,fees.reference)).toThrow();expect(()=>billedCapture()).toThrow();}finally{for(const [key,value]of savedAuth)billProjections.set(key,value);}
  f.runPort.agent.skills!.readResult=billed.readResult.bind(billed);
  const feeCommand=f.command('RecordSkillInvocationObservation','run',invocation.run_ref.id,{invocation_ref:{object_type:'skill_invocation',id:invocation.id},raw_result_ref:fees.reference}),feeObserved=flowSuccess(kernel.execute(feeCommand));
  expect(feeObserved).toMatchObject({command_type:'RecordSkillInvocationObservation',data:{run:{status:'Unknown',reservation_released:false},observation:{report:{status:'unknown',usage:{cost_known:true,cost_micros:modelCalls.length*12,currency}}}}});
  expect(kernel.execute(feeCommand)).toEqual(feeObserved);expect(f.store.listRuntimeRecords('skill_invocation_observation',f.change.id)).toHaveLength(2);expect(f.task().usage).toMatchObject({pending_reconciliation:true,cost_known:false});
  expect(billedCapture()).toEqual(fees);expect(new LocalSkillInvocationResultCollection({local,custody,inputs,...{account}}).readResult(f.project,invocation,fees.reference)).toEqual(fees.report);
  expect(billed.readResult(f.project,invocation,captured.reference)).toEqual(captured.report);expect(sends).toBe(actions.length+1);expect(credentialReads).toBe(sends);expect(account.snapshot()).toEqual(accountBefore);

  if(expectedStatus==='failed'){
   const identity=readAgentRuntimeOriginalIdentity(modelRoot,relation.child),stdoutPath=join(identity.operation,'stdout.raw'),retainedStdout=stdoutPath+'.test-owned-original',stdout=readFileSync(stdoutPath);
   const replaceAndCheck=(body:Buffer)=>{renameSync(stdoutPath,retainedStdout);writeFileSync(stdoutPath,body,{flag:'wx'});try{expect(readAgentRuntimeNamedMethodResult(modelRoot,relation.child,plan)).toMatchObject({status:'Unknown',method_result_reverified:false});expect(()=>new LocalSkillInvocationResultCollection({local,custody,inputs,account:account!,qualificationOriginals}).captureReconciliation(invocation.id,f.actor.id)).toThrow();}finally{unlinkSync(stdoutPath);renameSync(retainedStdout,stdoutPath);}};
   replaceAndCheck(stdout.subarray(0,Math.floor(stdout.length/2)));
   const altered=stdout.toString('utf8').replaceAll('unapproved_extra_field','forged_extra_field');expect(altered).not.toBe(stdout.toString('utf8'));replaceAndCheck(Buffer.from(altered));
   expect(readAgentRuntimeNamedMethodResult(modelRoot,relation.child,plan)).toMatchObject({status:'Observed',method_failure_reverified:true});
  }

  // Reconciliation through the actual shared Human HTTP service. The new
  // historical qualification samples above are CONSTRUCTED; Native/SDK/IPC,
  // original byte rereads, authenticated fixture bills and Kernel are actual.
  const terminal=new LocalSkillInvocationResultCollection({local,custody,inputs,account,qualificationOriginals});
  writeInstance(join(dataDirectory,'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
  let opens=0,releases=0;const wb=await startWorkbench({projectDir:repository,skillReconciliationForInvocation:()=>{opens++;return{collector:terminal,release(){releases++;}};}});
  const login=async(server:typeof wb)=>{const response=await fetch(server.origin+'/api/session',{method:'POST',headers:{Origin:server.origin,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});return {cookie:response.headers.get('set-cookie')!.split(';')[0]!,csrf:(await response.json() as {csrf:string}).csrf};};
  const session=await login(wb),reconcile={command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:'technical_owner',command_type:'ReconcileSkillInvocation',target:{object_type:'run',id:invocation.run_ref.id},expected_revision:f.store.getRun(invocation.run_ref.id)!.revision,payload:{invocation_ref:{object_type:'skill_invocation',id:invocation.id}}};
  const post=async(server:typeof wb,auth:typeof session)=>{const response=await fetch(server.origin+'/api/skill-invocations/'+invocation.id+'/reconcile-original',{method:'POST',headers:{Origin:server.origin,Cookie:auth.cookie,'X-CimiLoop-CSRF':auth.csrf,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify(reconcile)});return {status:response.status,body:await response.json()};};
  const beforeTerminal=f.store.asOfEventSequence(),beforeAccount=account.snapshot();let receipt:Awaited<ReturnType<typeof post>>;
  try{receipt=await post(wb,session);if(expectedStatus==='failed')expect(receipt.body).not.toHaveProperty('data.observation.report.output');expect(receipt).toMatchObject({status:200,body:{command_type:'ReconcileSkillInvocation',data:{observation:{resulting_status:expectedStatus==='succeeded'?'Succeeded':'Failed',report:{basis:'reconciliation',status:expectedStatus,...(expectedStatus==='succeeded'?{output}:{}),usage:{cost_known:true,cost_micros:modelCalls.length*12,currency}}},run:{status:'Unknown',reservation_released:false}}}});expect(await post(wb,session)).toEqual(receipt);}finally{await wb.close();}
  const restarted=await startWorkbench({projectDir:repository});try{expect(await post(restarted,await login(restarted))).toEqual(receipt!);}finally{await restarted.close();}
  expect(opens).toBe(1);expect(releases).toBe(1);expect(f.store.asOfEventSequence()).toBe(beforeTerminal+1);expect(account.snapshot()).toEqual(beforeAccount);expect(sends).toBe(actions.length+1);expect(credentialReads).toBe(sends);expect(f.task().status).not.toBe('Satisfied');expect(f.task().usage.pending_reconciliation).toBe(true);
  writeFileSync(join(dataDirectory,expectedStatus==='succeeded'?'d275-child-terminal-summary.json':'d276-child-failure-summary.json'),JSON.stringify({actual_native:true,actual_sdk:true,actual_http_kernel:true,original_command_replayed_after_restart:true,constructed_qualification:true,constructed_model:true,constructed_bill:true,real_skill:false,s1_accepted:false,expected_status:expectedStatus,invocation_id:invocation.id,model_requests:sends,fee_micros:modelCalls.length*12,reservation_released:false,task_accepted:false},null,2));

  // Full family fees enter the shared Human application. Neither this direct
  // parent model fixture nor fee evidence may manufacture a parent terminal.
  writeInstance(join(dataDirectory,'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
  const human=openLocalProject({projectDir:repository});try{
   let parentReleases=0;const parentFees=new LocalHumanAgentRunCostObservation(human,()=>({account:account!,release(){parentReleases++;}}));
   const parentRequest={command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:'technical_owner',command_type:'RecordRunObservation',target:{object_type:'run',id:invocation.run_ref.id},expected_revision:human.store.getRun(invocation.run_ref.id)!.revision,payload:{}};
   const beforeFamily=human.store.asOfEventSequence();await expect(parentFees.record(parentRequest)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(human.store.asOfEventSequence()).toBe(beforeFamily);
   const parentCalls=readDedicatedAgentModelOriginals(dataDirectory,relation.parent).calls;expect(parentCalls).toHaveLength(1);expect(parentCalls[0]!.call_id).toBe(modelCalls[0]!.call_id);expect(parentCalls[0]!.request_id).not.toBe(modelCalls[0]!.request_id);
   addBill(parentCalls,3);const settledAccount=account.snapshot();
   // Prepare once without a fee verifier. Kernel refuses it; no business event.
   const preparedOnly=await new LocalAgentRuntimeObservation(human).recordCosts(parentRequest,account);expect(preparedOnly).toMatchObject({code:'EVIDENCE_MISSING'});expect(human.store.asOfEventSequence()).toBe(beforeFamily);
   const familyAuth=new Map(billProjections);billProjections.clear();try{expect(await parentFees.record(parentRequest)).toMatchObject({code:'EVIDENCE_MISSING'});expect(human.store.asOfEventSequence()).toBe(beforeFamily);}finally{for(const[k,v]of familyAuth)billProjections.set(k,v);}
   // Replace only this test-owned anchor with identical bytes; physical identity must fail.
   const anchor=join(dataDirectory,'skill-invocation-start-originals',f.project.id,invocation.invocation_key,'admission.json'),retained=anchor+'.owned-original',anchorBytes=readFileSync(anchor);renameSync(anchor,retained);writeFileSync(anchor,anchorBytes,{flag:'wx'});try{expect(await parentFees.record(parentRequest)).toMatchObject({code:'EVIDENCE_MISSING'});expect(human.store.asOfEventSequence()).toBe(beforeFamily);}finally{unlinkSync(anchor);renameSync(retained,anchor);}
   const familyReceipt=await parentFees.record(parentRequest);
   expect(familyReceipt).toMatchObject({command_type:'RecordRunObservation',data:{run:{status:'Unknown',cost_charged_micros:(modelCalls.length+1)*12,reservation_released:false},observation:{report:{status:'unknown',usage:{cost_known:true,cost_micros:(modelCalls.length+1)*12,currency}}}}});
   expect(human.store.getExecutionObject('task',human.store.getRun(invocation.run_ref.id)!.task_id)!.usage).toMatchObject({cost_consumed_micros:(modelCalls.length+1)*12,cost_reserved_micros:500-(modelCalls.length+1)*12,pending_reconciliation:true,attempts_released:0});
   const afterFamily=human.store.asOfEventSequence();expect(await parentFees.record(parentRequest)).toEqual(familyReceipt);expect(human.store.asOfEventSequence()).toBe(afterFamily);expect(parentReleases).toBe(4);expect(account.snapshot()).toEqual(settledAccount);expect(parentTls.observations).toHaveLength(1);expect(sends).toBe(actions.length+1);expect(credentialReads).toBe(sends);
   const extraScope=parseDedicatedAgentSkillAccountScope({...relation.parent,operation_key:createInternalId(),context_digest:digest('PUBLIC extra unstarted child')});
   const extraTicket=origin.issueExclusive('skill_invocation_admission',digest(JSON.stringify({invocation_key:extraScope.operation_key,project_id:f.project.id})).value,{format:'cimiloop/skill-invocation-start-basis/1.0.0',parent:relation.parent,record_id:original.record_id,context_id:invocation.context_ref.id,skill_binding:invocation.skill_binding,input_ref:invocation.input_ref,preparation:{request:{invocation_key:extraScope.operation_key}}});
   await account.registerSkillScope({parent:relation.parent,child:extraScope,invocation_id:createInternalId(),admission_ticket:extraTicket});
   await expect(parentFees.record({...parentRequest,command_id:createInternalId(),requested_at:new Date().toISOString(),expected_revision:human.store.getRun(invocation.run_ref.id)!.revision})).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(human.store.asOfEventSequence()).toBe(afterFamily);
   expect(await parentFees.record(parentRequest)).toEqual(familyReceipt);expect(parentReleases).toBe(5);expect(parentTls.observations).toHaveLength(1);expect(sends).toBe(actions.length+1);expect(credentialReads).toBe(sends);
  }finally{human.store.close();}

 } finally {vi.restoreAllMocks();await parentTls?.close();await tls?.close();account?.close();origin?.close();f.store.close();console.error('Retain original Skill application Native fixture: '+root+'; repository: '+repository);}
},720000);
});
