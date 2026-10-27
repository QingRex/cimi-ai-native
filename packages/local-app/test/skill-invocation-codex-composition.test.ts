// Existing composition tests use PUBLIC storage projections. Keep their old
// source/identity guards; the complete physical path intersection has its own tests.
vi.mock('../src/agent-codex-writable-storage-local.js',async()=>{
 const runtime=await import('@cimiloop/runtime-adapter'),home=await import('../src/agent-codex-login-home-local.js');
 return{assertCodexRuntimeWritableStorage(local:any,account:any,storage:any,loginHome:any){
  const project=local.store.getProject();if(!project)throw Error('PUBLIC project unavailable');
  const proof=runtime.assertFixedVolumeRuntimeStorage(storage,{project_id:project.id,repository_path:local.location.repositoryPath,data_directory:local.location.dataDirectory});
  if(proof.runtime_ticket.identity_digest!==account.installation.origin.identityDigest)throw Error('PUBLIC storage origin mismatch');
  home.assertCodexRuntimeLoginHome(loginHome,local,account.installation,storage);return{proof,paths:[]};
 }};
});
import {mkdirSync,mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {CimiLoopKernel} from '../../kernel/src/index.js';
import {AgentStartLedger,CodexAgentUsageBudget,captureCodexLoginHome,digest,type FixedVolumeRuntimeStorage} from '@cimiloop/runtime-adapter';
import {LocalSkillInvocationNativeComposition,LocalSkillInvocationExecution,LocalSkillInvocationStartCustody,LocalSkillMethodInputs} from '../src/index.js';
import type {CodexRuntimeLoginHome} from '../src/agent-codex-login-home-local.js';
import type {InstalledCodexAgentRuntime} from '../src/agent-codex-installation-local.js';
import {type SkillInvocationExecutionContext,readOriginalSkillInvocation} from '../src/skill-invocation-execution-local.js';
import {createSkillInvocationProject} from '../../../tests/fixtures/skill-invocation-project.js';
import {flowSuccess,flowTime} from '../../../tests/fixtures/flow-project.js';
const seam=vi.hoisted(()=>({storage:undefined as unknown,home:undefined as unknown,homePath:'',identity:'',launches:[] as any[],transports:[] as unknown[],onClock:undefined as undefined|(()=>void)}));
vi.mock('../src/agent-codex-login-home-local.js',async load=>({...await load<typeof import('../src/agent-codex-login-home-local.js')>(),assertCodexRuntimeLoginHome(value:unknown){if(value!==seam.home)throw Error('PUBLIC home unavailable');return captureCodexLoginHome(seam.homePath);}}));
const PUBLIC_PROGRAM_CAPABILITY=vi.hoisted(()=>Object.freeze({kind:'codex_program_bundle/1.0.0'}));
vi.mock('../src/agent-codex-installation-local.js',async load=>({...await load<typeof import('../src/agent-codex-installation-local.js')>(),codexRuntimeInstallationProgramBundle(){return PUBLIC_PROGRAM_CAPABILITY;}}));
vi.mock('@cimiloop/runtime-adapter',async load=>{const original=await load<typeof import('@cimiloop/runtime-adapter')>();return{...original,
 // PUBLIC staging projection only. Assert capability forwarding, preserve
 // legacy header checks, and prohibit any model dispatch from this fixture.
 CodexOriginalMethodRuntime:class extends original.CodexOriginalMethodRuntime{
  constructor(...args:ConstructorParameters<typeof original.CodexOriginalMethodRuntime>){if(args[4]!==PUBLIC_PROGRAM_CAPABILITY)throw Error('PUBLIC missing forwarded programs');if(args[3]!==seam.storage||!args[3])throw Error('PUBLIC missing forwarded storage');const {network_policy,job_policy,path_resolution,...legacy}=args[0];if(path_resolution!=='original_volume_handles/1.0.0')throw Error('PUBLIC missing forwarded path policy');if(job_policy!=='codex_memory_process/1.0.0')throw Error('PUBLIC missing forwarded Job policy');if(network_policy!=='codex_chatgpt_tunnel/1.0.0')throw Error('PUBLIC missing forwarded network policy');super(legacy,args[1],args[2]);seam.transports.push(args[3]);}
  override async execute(..._args:Parameters<InstanceType<typeof original.CodexOriginalMethodRuntime>['execute']>):Promise<never>{throw Error('PUBLIC staging cannot dispatch a model');}
 },
 assertFixedVolumeRuntimeStorage(value:unknown){if(value!==seam.storage)throw Error('PUBLIC storage unavailable');return{runtime_ticket:{identity_digest:seam.identity}};},
 async openWindowsAgentRunClock(){seam.onClock?.();return{read:async()=>({format:'cimiloop/agent-run-clock/1.0.0',utc:flowTime,boot_utc:'2026-10-01T00:00:00.000Z',uptime_ms:100000000,machine_digest:digest('PUBLIC clock').value}),close:async()=>{}};},
 validateFixedMethodContext(){},AgentNamedMethodHost:{initialize(){return{PUBLIC:'fixed method staging seam'};}},
 async runOpenCodeWorkspaceRuntime(input:unknown){seam.launches.push(input);}
};});
vi.setConfig({testTimeout:120000,hookTimeout:120000});
// Real Kernel/SQLite, child custody, Task budget and Codex model headers. PUBLIC
// fixed method, OS clock/storage and Native launch seams. No model request,
// login credential read, actual Skill/Native/physical quota or S1 acceptance.
const close:(()=>void)[]=[];
afterEach(()=>{vi.restoreAllMocks();while(close.length)close.pop()!();seam.launches=[];seam.transports=[];seam.onClock=undefined;});
function fixture(){
 const root=mkdtempSync('D:/CimiS1/_'),f=createSkillInvocationProject(root);close.push(()=>f.store.close());
 const data=dirname(f.path),origin=AgentStartLedger.initialize(join(data,'host'),{machine_digest:'1'.repeat(64),principal_digest:'2'.repeat(64)});close.push(()=>origin.close());
 const custody=new LocalSkillInvocationStartCustody(root,data,origin),prepare=f.runPort.agent.skills!.prepare.bind(f.runPort.agent.skills);
 f.runPort.agent.skills!.prepare=(...args)=>custody.bindPreparation(...args,prepare(...args));
 f.runPort.agent.skills!.checkExecutionAuthority=()=>digest('PUBLIC qualified child only');
 const invocation=f.reserveSkill().invocation,kernel=new CimiLoopKernel({store:f.store,caller:f.caller,now:()=>flowTime,runVerifier:f.runPort});
 // Source and package stores share the public API; TypeScript private brands differ.
 const local={store:f.store as unknown as SkillInvocationExecutionContext['store'],caller:f.caller,kernel,location:{repositoryKind:'git' as const,repositoryPath:root,dataDirectory:data,databasePath:f.path,instancePath:join(data,'instance.json'),suggestedName:'PUBLIC child Codex'}};
 const inputs=new LocalSkillMethodInputs(root,data),plan={request:invocation.request,profile:{PUBLIC:true},files:[],prompt:'PUBLIC method packet',input_ref:invocation.input_ref};vi.spyOn(inputs,'readInvocation').mockReturnValue(plan as any);
 seam.storage={} as FixedVolumeRuntimeStorage;seam.home={} as CodexRuntimeLoginHome;seam.homePath=join(root,'login');mkdirSync(seam.homePath);seam.identity=origin.identityDigest;
 const account_digest=digest('PUBLIC account').value,quota_account_digest=digest('PUBLIC quota').value,budget=CodexAgentUsageBudget.initialize(origin,{account_digest,quota_account_digest,model_calls:4,output_tokens:8192});
 const installation:InstalledCodexAgentRuntime={origin,root:data,binary:process.execPath,native_binary:process.execPath,node_binary:process.execPath,model:'gpt-6-luna',account_digest,quota_account_digest,output_profile:'bounded_2048/1.0.0',usage_policy:'require_ordinary_permission/1.0.0',disabled_mcp_servers:[],checks:[],installation_digest:'3'.repeat(64),guard(){},release(){}};
 const options={local,custody,inputs,account:{installation,budget,root:data,guard(){origin.readExclusive('public_read','0'.repeat(64));},release(){}},storage:seam.storage as FixedVolumeRuntimeStorage,loginHome:seam.home as CodexRuntimeLoginHome};
 const composition=()=>LocalSkillInvocationNativeComposition.openCodex(options),service=()=>new LocalSkillInvocationExecution(local,composition()),original=readOriginalSkillInvocation(local,invocation.id),scope=custody.accountScope(f.project,invocation,original.request.parent,original.record_id).child;
 return{f,local,data,invocation,budget,options,composition,service,scope,root:join(data,'skill-runtime-originals',f.project.id,invocation.invocation_key)};
}
describe('Codex child application composition',()=>{
 it('stages the Codex SDK host on the same original child, dispatches Native once and retains one parent Run',async()=>{
  const f=fixture(),sequence=f.f.store.asOfEventSequence();expect(await f.service().start(f.invocation.id)).toMatchObject({outcome:'original',run_id:f.scope.run_id,invocation_key:f.invocation.invocation_key});
  expect(seam.transports).toEqual([f.options.storage]);
  const original=seam.launches[0];expect(original.scope).toEqual(f.scope);expect(original.root).toBe(f.root);expect(original.binary).toBe(process.execPath);expect(original.method).toEqual({PUBLIC:'fixed method staging seam'});
  const header=JSON.parse(readFileSync(join(f.root,'agent-runtime-model-originals',f.scope.project_id,f.scope.run_id,'header.json'),'utf8'));
  expect(header).toMatchObject({format:'cimiloop/agent-runtime-model-originals/7.0.0',scope:f.scope,permitted:['cimi_invoke_skill','cimi_read_method_resource'],output_profile:'bounded_2048/1.0.0',original_evidence:{kind:'codex_login/1.0.0'}});
  expect(f.budget.snapshot().held.model_calls).toBe(0);expect(f.f.store.listRuns(f.f.change.id)).toHaveLength(1);expect(f.f.store.asOfEventSequence()).toBe(sequence);
  f.options.account.guard=()=>{throw Error('PUBLIC unavailable account');};
  expect(await new LocalSkillInvocationExecution(f.local,{custody:f.options.custody}).start(f.invocation.id)).toMatchObject({outcome:'original'});expect(seam.launches).toHaveLength(1);
 });
 it('rejects cancellation during Task-clock preparation before producing a model header or dispatch',async()=>{
  const f=fixture();seam.onClock=()=>{flowSuccess(f.f.humanKernel.execute(f.f.humanCommand('CancelRun','run',f.scope.run_id,{reason:'PUBLIC cancellation'},'technical_owner')));};
  await expect(f.service().start(f.invocation.id)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(seam.launches).toHaveLength(0);expect(f.budget.snapshot().held.model_calls).toBe(0);expect(existsSync(join(f.root,'agent-codex-model-originals'))).toBe(false);
 });
 it('does not accept a replaced Kernel assessment or a lost home capability for delayed Native effects',async()=>{
  const f=fixture();await f.service().start(f.invocation.id);const guard=seam.launches[0].beforeNativeEffect,assessment=f.local.kernel.assessSkillInvocationExecution;f.local.kernel.assessSkillInvocationExecution=assessment.bind(f.local.kernel);expect(()=>guard()).toThrow();f.local.kernel.assessSkillInvocationExecution=assessment;
  seam.home={};expect(()=>guard()).toThrow();expect(seam.launches).toHaveLength(1);expect(f.budget.snapshot().held.model_calls).toBe(0);
 });
});
