import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {it,expect,vi,afterEach} from 'vitest';
import {LocalProviderVerifier} from '../src/providers-local.js';
import {LocalCodexRuntimeControlOriginals,assertCodexRuntimeControlSourcesComplete} from '../src/codex-runtime-control-originals-local.js';
import {LocalCodexRuntimeSdkOriginals} from '../src/codex-runtime-sdk-originals-local.js';
import type {InstalledCodexAgentRuntime} from '../src/agent-codex-installation-local.js';
import {CimiLoopKernel,requestDigest} from '@cimiloop/kernel';import {AgentStartLedger,digest} from '@cimiloop/runtime-adapter';
import {createFlowProject,flowSuccess} from '../../../tests/fixtures/flow-project.js';import {createProviderProbe} from '../../../tests/fixtures/provider-probe.js';

const seam=vi.hoisted(()=>({calls:0,drift:false,bounded:true}));
vi.mock('@cimiloop/runtime-adapter',async load=>({...await load<typeof import('@cimiloop/runtime-adapter')>(),readCodexAgentModelControlOriginals(_root:string,scope:unknown){seam.calls++;return{format:'cimiloop/codex-model-control-originals/1.0.0',scope,header_digest:'1'.repeat(64),origin:'external_model',calls:[{call_id:'PUBLIC-call',usage:{inputTokens:1,outputTokens:1},control:{job_policy:seam.bounded?'codex_memory_process/1.0.0':null,network_policy:'codex_chatgpt_tunnel/1.0.0',job_limits:seam.bounded?{policy:'codex_memory_process/1.0.0',flags:0x2208,job_memory_bytes:2147483648,active_process_limit:8}:null,program_bundle:{PUBLIC:true},write_confinement:{scope:{project_id:Reflect.get(scope as object,'project_id')}},network:{stopped:true,boundary_failed:false,limit_exceeded:seam.drift&&seam.calls>2},original:{PUBLIC:'Native originals'}}}]};}}));
afterEach(()=>{vi.restoreAllMocks();seam.calls=0;seam.drift=false;seam.bounded=true;});

// PUBLIC SDK/Job projections exercise source aggregation and real Kernel
// assessment. Native enforcement has separate actual OS tests; this fixture
// cannot prove a real model, invoice, VHD, recovery matrix or S1 acceptance.
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'rcontrol-')),f=createFlowProject(root),data=dirname(f.path),p=createProviderProbe(root,data),kernel=new CimiLoopKernel({store:f.store,caller:f.caller,providerVerifier:p.port});
 p.registration.required_permissions.network_hosts=['chatgpt.com','auth.openai.com'];const registered=flowSuccess(kernel.execute(f.projectCommand('RegisterProvider',p.registration)));if(registered.command_type!=='RegisterProvider')throw Error('PUBLIC descriptor expected');const descriptor=registered.data.descriptor;
 const recorded=flowSuccess(kernel.execute(f.projectCommand('RecordProviderEvidence',{descriptor_ref:{object_type:'provider_descriptor',id:descriptor.id},descriptor_digest:{algorithm:'sha256',value:requestDigest(descriptor)},raw_result_ref:p.save()})));if(recorded.command_type!=='RecordProviderEvidence')throw Error('PUBLIC evidence expected');const evidence=recorded.data.evidence;
 const origin=AgentStartLedger.initialize(join(root,'origin'),{machine_digest:digest('PUBLIC machine').value,principal_digest:digest('PUBLIC user').value});let active=true;
 const installed:InstalledCodexAgentRuntime={origin,root,binary:process.execPath,native_binary:process.execPath,node_binary:process.execPath,model:'gpt-6-luna',account_digest:'1'.repeat(64),quota_account_digest:'2'.repeat(64),output_profile:'bounded_2048/1.0.0',usage_policy:'require_ordinary_permission/1.0.0',disabled_mcp_servers:[],checks:[],installation_digest:'3'.repeat(64),guard(){if(!active)throw Error('PUBLIC installation released');},release(){active=false;}};
 const local={location:{repositoryKind:'directory' as const,repositoryPath:root,dataDirectory:data,databasePath:f.path,instancePath:join(data,'instance.json'),suggestedName:'PUBLIC control source'},instance:{schema_version:'1.0.0' as const,instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at}};
 const context={sdk:{checks:{real_edit:{result:'supports'},independent_review:{result:'supports'},model_account_identity:{result:'supports'}}},original:{PUBLIC:'fixed contract request'},phases:['edit','review'].map(mode=>({phase:{mode,scope:{project_id:f.project.id,operation_key:mode}},result:{basis_digest:digest(mode).value}})),boundary_digest:'4'.repeat(64)};
 vi.spyOn(LocalCodexRuntimeSdkOriginals.prototype,'readRuntimeControlContext').mockReturnValue(context as unknown as ReturnType<LocalCodexRuntimeSdkOriginals['readRuntimeControlContext']>);
 const source=new LocalCodexRuntimeControlOriginals(local,installed),verifier=new LocalProviderVerifier(root,data);
 return{f,p,descriptor,evidence,source,verifier,installed,close(){origin.close();f.store.close();}};
}

it('installs a Runtime control reader that cannot take imported flags as a source scope',()=>{
 const root=mkdtempSync(join(tmpdir(),'rcontrol-')),verifier=new LocalProviderVerifier(root,root),read=Reflect.get(verifier,'readRuntimeControlEvidence');
 expect(read).toBeTypeOf('function');expect(()=>Reflect.apply(read,verifier,[{id:'PUBLIC project'},{provider_kind:'runtime'},[]])).toThrow('Original installed Runtime control reader unavailable');
 const install=Reflect.get(verifier,'withRuntimeControlOriginals');expect(install).toBeTypeOf('function');expect(()=>Reflect.apply(install,verifier,[{checks:{network_host_limits:'supports',cost_accounting_and_cap:'supports',disk_limit:'supports',crash_recovery:'supports'}},()=>{},()=>{}])).toThrow('Runtime control source scope unavailable');
});

it('reads the bounded original source while the Kernel keeps all three unfinished controls blocking',()=>{
 const t=fixture();try{
  const before=t.f.store.listEvents().length,port={sourceDigest:t.p.port.sourceDigest.bind(t.p.port),schemaDigest:t.p.port.schemaDigest.bind(t.p.port),readProbe:t.p.port.readProbe.bind(t.p.port),readArtifact:t.p.port.readArtifact.bind(t.p.port),readRuntimeControlEvidence:(...args:Parameters<LocalProviderVerifier['readRuntimeControlEvidence']>)=>t.verifier.readRuntimeControlEvidence(...args)},kernel=new CimiLoopKernel({store:t.f.store,caller:t.f.caller,providerVerifier:port});
  const result=t.verifier.withRuntimeControlOriginals(t.source,()=>t.installed.guard(),()=>flowSuccess(kernel.execute(t.f.projectCommand('EvaluateProvider',{descriptor_ref:{object_type:'provider_descriptor',id:t.descriptor.id},descriptor_digest:{algorithm:'sha256',value:requestDigest(t.descriptor)},profile:'controlled_execution',evidence_refs:[{object_type:'evidence',id:t.evidence.id}]}))));
  if(result.command_type!=='EvaluateProvider')throw Error('PUBLIC evaluation expected');expect(result.data.evaluation.outcome).toBe('NEED_MORE_EVIDENCE');expect(result.data.evaluation.assessments).toContainEqual(expect.objectContaining({key:'network_host_limits',result:'supports'}));for(const key of ['cost_accounting_and_cap','disk_limit','crash_recovery'])expect(result.data.evaluation.assessments).toContainEqual(expect.objectContaining({key,result:'inconclusive'}));expect(t.f.store.listEvents()).toHaveLength(before+1);
  expect(()=>t.verifier.readRuntimeControlEvidence(t.f.project,t.descriptor,[t.evidence])).toThrow('Original installed Runtime control reader unavailable');
 }finally{t.close();}
});
it('keeps a historical unbounded model Job inconclusive without upgrading its originals',()=>{const t=fixture();try{seam.bounded=false;const result=t.source.readRuntimeControlEvidence(t.f.project,t.descriptor,[t.evidence]);expect(result.checks.network_host_limits.result).toBe('inconclusive');}finally{t.close();}});
it('refutes a bounded egress policy outside the Provider declared network hosts',()=>{const t=fixture();try{const result=t.source.readRuntimeControlEvidence(t.f.project,{...t.descriptor,required_permissions:{...t.descriptor.required_permissions,network_hosts:['chatgpt.com']}},[t.evidence]);expect(result.checks.network_host_limits.result).toBe('refutes');}finally{t.close();}});
it('rejects a changed original in the final source read',()=>{const t=fixture();try{seam.drift=true;expect(()=>t.source.readRuntimeControlEvidence(t.f.project,t.descriptor,[t.evidence])).toThrow('Original installed Runtime control sources unavailable or changed');}finally{t.close();}});
it('requires the same live installation after opening the source scope',()=>{const t=fixture();try{t.installed.release();expect(()=>t.source.readRuntimeControlEvidence(t.f.project,t.descriptor,[t.evidence])).toThrow('PUBLIC installation released');}finally{t.close();}});
it('requires four code-installed readers before activating a production host',()=>{const t=fixture();try{expect(()=>assertCodexRuntimeControlSourcesComplete(t.source)).toThrow(expect.objectContaining({code:'CAPABILITY_UNAVAILABLE',details:expect.objectContaining({missing:['cost_accounting_and_cap','disk_limit','crash_recovery']})}));expect(()=>assertCodexRuntimeControlSourcesComplete({...t.source} as LocalCodexRuntimeControlOriginals)).toThrow('Original installed Runtime control sources unavailable or changed');}finally{t.close();}});
