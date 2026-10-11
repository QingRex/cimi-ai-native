import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {describe,it,expect,vi} from 'vitest';
import {CimiLoopKernel} from '../../packages/kernel/src/index.js';
import {contentDigest} from '../../packages/kernel/src/intent.js';
import {SCHEMA_VERSION,createInternalId,type SkillImportSpec,type ProviderBinding,type ProviderEvidence,type ProviderEvaluation} from '../../packages/protocol/src/v2/index.js';
import {LocalSkillMethodInputs,LocalSkillInvocationStartCustody,LocalSkillInvocationExecution,LocalSkillInvocationNativeComposition,LocalSkillInvocationDedicatedAccount,LocalSkillInvocationResultCollection} from '../../packages/local-app/src/index.js';
import {readOriginalSkillInvocation,type SkillInvocationExecutionContext} from '../../packages/local-app/src/skill-invocation-execution-local.js';
import {AgentStartLedger,DedicatedAgentAccountLedger,readAgentRuntimeNamedMethodResult,readDedicatedAgentModelOriginals,digest} from '../../packages/runtime-adapter/dist/index.js';
import {createDedicatedAgentRuntimeModel} from '../../packages/runtime-adapter/src/agent-dedicated-model.js';
import {httpFixture,HTTP_FIXTURE_KEY} from '../../packages/runtime-adapter/test/gateway-http-fixture.js';
import {createAgentRunProject} from '../fixtures/agent-run-project.js';
import {flowSuccess,flowTime} from '../fixtures/flow-project.js';

// Actual Git package bytes, Kernel, SQLite, application factory, Windows Native,
// OS IPC and SDK tools. Qualification/account approval/provider replies/address
// and credential are constructed; this proves neither real Skill nor S1.
describe.runIf(process.platform==='win32'&&process.arch==='x64')('original Skill application to Native composition',()=>{
it('executes the original reserved child and queries/retries without another Native or model request',async()=>{
 const parent=join(process.cwd(),'.cimiloop','new-host-s1','skill-application-fixtures');mkdirSync(parent,{recursive:true});
 // CLR physical executable paths must stay below MAX_PATH. Use a fresh bounded
 // retained repository, not aliases/copies of a previously failed original Run.
 const root=mkdtempSync(join(parent,'cimiloop-skill-application-')),repository=mkdtempSync(join(process.cwd(),'_')),source=join(root,'public-source');mkdirSync(join(source,'skills','entry'),{recursive:true});mkdirSync(join(source,'skills','dependency','references'),{recursive:true});
 writeFileSync(join(source,'LICENSE'),'Public constructed method package license\n');
 writeFileSync(join(source,'skills','entry','SKILL.md'),'---\nname: entry\ndescription: Constructed fixed method\n---\nInvoke dependency and read the original fixed input.\n');
 writeFileSync(join(source,'skills','dependency','SKILL.md'),'---\nname: dependency\ndescription: Constructed fixed dependency\n---\nRead the original artifact; propose findings only.\n');
 writeFileSync(join(source,'skills','dependency','references','format.md'),'Use strict review output.\n');
 const git=(...args:string[])=>execFileSync('git',['-c','commit.gpgsign=false','-c','core.hooksPath=disabled-hooks','-C',source,...args],{encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim();
 git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');git('add','.');git('commit','-m','public constructed method');
 const f=createAgentRunProject(repository,'task_execution',500,undefined,undefined,undefined,undefined,240000),dataDirectory=dirname(f.path),inputs=new LocalSkillMethodInputs(repository,dataDirectory);
 let origin:AgentStartLedger|undefined,account:DedicatedAgentAccountLedger|undefined,tls:Awaited<ReturnType<typeof httpFixture>>|undefined;
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
  const custody=new LocalSkillInvocationStartCustody(repository,dataDirectory,origin),prepare=inputs.invocationPreparer(id=>f.store.getProviderDescriptor(id),{verify:()=>inputs.packages.content.storeContent(Buffer.from('Constructed named method qualification only'),'skill_method_qualification')});
  f.runPort.agent.skills={prepare:(...args)=>custody.bindPreparation(...args,prepare(...args)),readResult:()=>{throw Error('Domain result not installed');},checkExecutionAuthority:(_project,request)=>contentDigest({constructed_authority:request})};
  const artifact=inputs.packages.content.storeContent(Buffer.from('Public fixed diff\n'),'workspace_diff'),input_ref=inputs.packages.content.storeContent(Buffer.from(JSON.stringify({purpose:'review',goal:'Review original child',spec:'Fixed public specification',standards:'Fixed public standard',artifact_refs:[artifact]})),'skill_method_input');
  const child=flowSuccess(kernel.execute(f.command('ReserveSkillInvocation','run',reservation.data.run.id,{skill_binding_ref:{object_type:'provider_binding',id:binding.id},method_name:'entry',input_ref})));if(child.command_type!=='ReserveSkillInvocation')throw Error('Expected original child');const invocation=child.data.invocation;
  // The source fixture store and built LocalProject store expose the same
  // production public API but have separate nominal TypeScript private brands.
  const local:SkillInvocationExecutionContext={store:f.store as unknown as SkillInvocationExecutionContext['store'],caller:f.caller,kernel,location:{repositoryKind:'git' as const,repositoryPath:repository,dataDirectory,databasePath:f.path,instancePath:join(dataDirectory,'instance.json'),suggestedName:'Actual child application fixture'}};
  const original=readOriginalSkillInvocation(local,invocation.id),relation=custody.accountScope(original.project,invocation,original.request.parent,original.record_id),plan=inputs.readInvocation(f.project,descriptor,invocation);
  const connection={format:'cimiloop/dedicated-model/1.0.0' as const,provider:'zhipuai-coding-plan' as const,model:'zhipuai-coding-plan/glm-fixture',credential_file:join(root,'PUBLIC-absent.dpapi.json'),credential_digest:digest('public constructed credential identity')};
  const policy={format:'cimiloop/dedicated-agent-account/1.0.0' as const,host_identity_digest:origin.identityDigest,account_digest:digest(root).value,approval_digest:digest('constructed approval').value,package_digest:digest('constructed package').value,tariff_digest:digest('constructed tariff').value,admission_digest:digest('constructed admission').value,connection_digest:digest(JSON.stringify(connection)).value,profile:{model:'glm-fixture',thinking:'enabled' as const},cash_limit_micros:500,credit_limit_micro_units:200,cash_per_call_upper_micros:30,credit_per_call_upper_micro_units:10,input_token_limit:1000000,output_token_limit:512};
  account=DedicatedAgentAccountLedger.initialize({origin,repositoryPath:repository,root:join(root,'public-account'),policy,connection,admission:{check:async()=>{},checkSkillScope:async()=>{}},custody:{protect:()=>{},verify:()=>{}}});
  const actions=[...plan.profile.modules.map(m=>({name:'cimi_invoke_skill',args:{name:m.name}})),...plan.profile.resources.filter(r=>r.kind!=='definition').map(r=>({name:'cimi_read_method_resource',args:{path:r.path}}))];let sends=0,credentialReads=0;
  const output={purpose:'review',findings:[],limitations:['Constructed method/provider reply; not actual method qualification.']};
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
  expect(readAgentRuntimeNamedMethodResult(modelRoot,relation.child,plan)).toMatchObject({status:'Observed',method_result_reverified:true,output});
  expect(readDedicatedAgentModelOriginals(modelRoot,relation.child).summary).toMatchObject({status:'Observed',original_requirement_pinned:true,budget_identity_pinned:true,costs_reconciled:false});
  expect(sends).toBe(actions.length+1);expect(credentialReads).toBe(sends);expect(account.snapshot().holds).toBe(sends);
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
  proof.method.output.limitations=['Self-consistent forged candidate'];
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
 } finally {vi.restoreAllMocks();await tls?.close();account?.close();origin?.close();f.store.close();console.error('Retain original Skill application Native fixture: '+root+'; repository: '+repository);}
},240000);
});
