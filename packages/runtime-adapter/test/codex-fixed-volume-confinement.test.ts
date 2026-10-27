import {captureCodexProgramBundle} from '../src/codex-program-bundle.js';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,parse} from 'node:path';
import {describe,it,expect,vi} from 'vitest';
import {AgentStartLedger} from '../src/agent-start-ledger.js';
import {FixedVolumeQuota,openWindowsFixedVolumeReader} from '../src/fixed-volume-quota.js';
import {compileOriginalAgentSandbox} from '../src/native.js';
import {digest} from '../src/files.js';
import {CodexOriginalMethodRuntime,captureCodexLoginHome} from '../src/codex-original-method.js';
import {createCodexAgentRuntimeModel} from '../src/agent-codex-model.js';
import {AgentRuntimeModelHost} from '../src/agent-runtime-model.js';
import {parseAgentWorkspaceToolScope} from '../src/agent-workspace-authority.js';
import {createInternalId} from '@cimiloop/protocol/v2';
import {codexProcessLayout} from '../src/codex-process-job.js';

const seam=vi.hoisted(()=>({image:'',observation:{} as Record<string,unknown>}));
vi.mock('node:child_process',async load=>{
 const original=await load<typeof import('node:child_process')>();return{...original,execFileSync:(...args:Parameters<typeof original.execFileSync>)=>{
  const argv=args[1];if(Array.isArray(argv)&&argv.length===3&&argv[0]===seam.image)return JSON.stringify(seam.observation);
  return Reflect.apply(original.execFileSync,undefined,args);
 }};
});

// Real Host1, compiler, C# stdio and AppContainer Job. ONLY the fixed-volume OS
// observation is a PUBLIC projection: no VHD, login, model, bill or S1 claim.
describe.runIf(process.platform==='win32'&&process.arch==='x64')('original Codex confinement wiring',()=>{
 it.each([false,true,'programs','bounded','paths'])('consumes the actual storage capability and original network mode=%s, then replays without a new worker',async network=>{
  const pathScoped=network==='paths',bounded=pathScoped||network==='bounded',bundled=bounded||network==='programs';const root=mkdtempSync(join(tmpdir(),'cx-')),home=join(root,'PUBLIC-login'),source=join(root,'Public.cs'),binary=join(root,bundled?'codex.exe':'Public.exe');mkdirSync(home);
  writeFileSync(source,String.raw`using System;using System.IO;using System.Collections.Generic;using System.Web.Script.Serialization;
class Public {static JavaScriptSerializer json=new JavaScriptSerializer();static void Send(object value){Console.WriteLine(json.Serialize(value));Console.Out.Flush();}
static void Main(){string line;while((line=Console.ReadLine())!=null){var r=json.DeserializeObject(line) as Dictionary<string,object>;if(!r.ContainsKey("method"))continue;string method=(string)r["method"];object result=null;
if(method=="initialize")result=new{};
if(method=="account/read")result=new{account=new{type="chatgpt",email="PUBLIC@example.test"},requiresOpenaiAuth=true};
if(method=="account/rateLimits/read")result=new{ordinaryUsageAllowed=true,accountId="PUBLIC-account",rateLimits=new{primary=(object)null,secondary=(object)null,credits=(object)null}};
if(method=="mcpServerStatus/list")result=new{data=new object[0],nextCursor=(object)null};
if(method=="thread/start")result=new{model="gpt-6-luna",modelProvider="openai",approvalPolicy="never",activePermissionProfile=new{id="cimiloop-method"},instructionSources=new object[0],thread=new{id="PUBLIC_THREAD",ephemeral=true}};
if(method=="turn/start")result=new{turn=new{id="PUBLIC_TURN"}};
if(result!=null)Send(new{id=r["id"],result=result});
if(method=="turn/start"){string message="PUBLIC response";try{File.WriteAllText(Path.Combine(Environment.GetEnvironmentVariable("TEMP"),"PUBLIC-effect.txt"),"PUBLIC original effect");}catch(Exception error){message="PUBLIC effect failed: "+error.GetType().Name+" at "+Environment.GetEnvironmentVariable("TEMP");}
Send(new{method="item/completed",@params=new{threadId="PUBLIC_THREAD",turnId="PUBLIC_TURN",item=new{type="agentMessage",phase="final_answer",text=message}}});
Send(new{method="thread/tokenUsage/updated",@params=new{threadId="PUBLIC_THREAD",turnId="PUBLIC_TURN",tokenUsage=new{total=new{inputTokens=5,cachedInputTokens=0,outputTokens=3,totalTokens=8,reasoningOutputTokens=0,cacheWriteInputTokens=0}}}});
Send(new{method="turn/completed",@params=new{threadId="PUBLIC_THREAD",turn=new{id="PUBLIC_TURN",status="completed",error=(object)null}}});}}}}
`);
  await compileOriginalAgentSandbox(join(process.env.SystemRoot!,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/reference:System.Web.Extensions.dll','/out:'+binary,source],undefined,root);
  if(bundled)copyFileSync(binary,join(root,'codex-code-mode-host.exe'));
  const origin=AgentStartLedger.initialize(join(root,'host'),{machine_digest:'1'.repeat(64),principal_digest:'2'.repeat(64)}),maximum=64*1024**2,volume=parse(root).root.toUpperCase();
  seam.image=join(root,'PUBLIC-not-a-vhd.vhdx');seam.observation={format:'cimiloop/fixed-volume-os-observation/1.0.0',image_path:seam.image,volume_root:volume,image_identity:{volume:'1',index:'2',created:'3'},virtual_disk_id:'11111111-1111-1111-1111-111111111111',volume_id:'\\\\?\\Volume{22222222-2222-2222-2222-222222222222}\\',volume_serial:'4',virtual_bytes:maximum,volume_bytes:maximum-2*1024**2,physical_bytes:maximum+4*1024**2,provider_subtype:2,filesystem:'NTFS',physical_device:'\\\\.\\PhysicalDrive9',extent_bytes:maximum-1024**2};
  try{
   const reader=await openWindowsFixedVolumeReader(join(root,'reader')),quota=FixedVolumeQuota.initialize(origin,reader,{image:seam.image,volume_root:volume,maximum_bytes:maximum}),storage=quota.bindRuntime({project_id:'11111111-1111-7111-8111-111111111111',repository_path:root,data_directory:root});
   const account=digest(JSON.stringify({format:'cimiloop/codex-account/1.0.0',type:'chatgpt',email:'public@example.test',workspace:null})).value;
   const runtime=new CodexOriginalMethodRuntime({root:join(root,'originals'),...(network?{network_policy:'codex_chatgpt_tunnel/1.0.0' as const}:{}),...(bounded?{job_policy:'codex_memory_process/1.0.0' as const}:{}),...(pathScoped?{path_resolution:'original_volume_handles/1.0.0' as const}:{}),account_digest:account,command:{file:binary,args:[],sha256:digest(readFileSync(binary)).value},login_home:captureCodexLoginHome(home),state_policy:'private_login_home/2.0.0',environment_policy:'private_user_directories/1.0.0',process_custody:'owner_job/1.0.0',process_root:join(root,'jobs'),timeout_ms:60000},false,origin,storage,bundled?captureCodexProgramBundle({file:binary,args:[],sha256:digest(readFileSync(binary)).value},()=>{}):undefined);
   const request={operation_key:'PUBLIC_original',model:'gpt-6-luna',prompt:'PUBLIC input',instructions:'PUBLIC only',tools:[],output_schema:{type:'string'},usage_policy:'require_ordinary_permission/1.0.0' as const},result=await runtime.execute(request,()=>'',()=>{}),options=runtime.originalConfiguration;
   expect(result.output_text).toBe('PUBLIC response');const start=JSON.parse(readFileSync(join(options.root,request.operation_key,'start.json'),'utf8'));expect(start).toMatchObject({format:pathScoped?'cimiloop/codex-method-start/16.0.0':bounded?'cimiloop/codex-method-start/15.0.0':bundled?'cimiloop/codex-method-start/14.0.0':network?'cimiloop/codex-method-start/13.0.0':'cimiloop/codex-method-start/12.0.0',write_confinement:{network_mode:'deny_all'},write_roots:[join(options.root,request.operation_key,'state'),home]});
   const launch=JSON.parse(readFileSync(join(codexProcessLayout(options.root,request.operation_key,options.process_root).operationRoot,'config.json'),'utf8')),profile='cimiloop.codexwrite.'+launch.nonce.replaceAll('-','');
   expect(launch).toMatchObject({format:pathScoped?'cimiloop/codex-process-launch/8.0.0':bounded?'cimiloop/codex-process-launch/7.0.0':bundled?'cimiloop/codex-process-launch/6.0.0':network?'cimiloop/codex-process-launch/5.0.0':'cimiloop/codex-process-launch/4.0.0',write_scope:{network_mode:'deny_all',roots:start.write_roots}});expect(readFileSync(join(options.root,request.operation_key,'state','user','AppData','Local','Packages',profile,'AC','Temp','PUBLIC-effect.txt'),'utf8')).toBe('PUBLIC original effect');
   expect(await runtime.execute(request,()=>{throw Error('PUBLIC no repeated tool');},()=>{throw Error('PUBLIC no repeated dispatch');})).toEqual(result);expect(origin.listExclusive('codex_process_job_intent')).toHaveLength(1);
   if(bounded)expect(CodexOriginalMethodRuntime.readProcessControlRetained(options,request)).toMatchObject({job_policy:'codex_memory_process/1.0.0',job_limits:{job_memory_bytes:2147483648,active_process_limit:8},network:{stopped:true,boundary_failed:false,limit_exceeded:false}});
   if(pathScoped){expect(start.path_resolution).toBe('original_volume_handles/1.0.0');expect(launch.path_policy).toBe(start.path_resolution);expect(CodexOriginalMethodRuntime.readProcessControlRetained(options,request)).toMatchObject({path_resolution:{format:'cimiloop/codex-volume-metadata/1.0.0',desired_access:0}});}
   expect(CodexOriginalMethodRuntime.readRetained(options,request)).toEqual(result);expect(CodexOriginalMethodRuntime.readProcessResourcesRetained(options,request)).toMatchObject({status:'disposed',resources_disposed:true,costs_reconciled:false});
   const readOnly=new CodexOriginalMethodRuntime(options,true);await expect(readOnly.execute({...request,operation_key:'PUBLIC_other'},()=>'',()=>{})).rejects.toThrow('codex_read_only_original');expect(()=>new CodexOriginalMethodRuntime(options,false,origin)).toThrow(bundled?'codex_program_bundle_unproven':network?'codex_network_boundary_unproven':'codex_write_confinement_unproven');
   for(const [baseVersion,permitted] of [[23,['cimi_read']],[24,['cimi_read','cimi_run_skill']],[25,['cimi_invoke_skill','cimi_read_method_resource']]] as const){
    const version=baseVersion+(network?3:0)+(bundled?3:0)+(bounded?3:0)+(pathScoped?3:0);const scope=parseAgentWorkspaceToolScope({project_id:storage.read().scope.project_id,run_id:createInternalId(),operation_key:createInternalId(),executor_actor_id:createInternalId(),context_digest:digest('PUBLIC context'),skill_bindings:[],runtime_binding:{binding_ref:{object_type:'provider_binding',id:createInternalId()},digest:digest('PUBLIC binding')},host_admission_ref:{provider:'local_content',resource_type:'agent_host_admission',locator:digest('PUBLIC admission').value,digest:digest('PUBLIC admission')}});
    const modelOptions={root,scope,runtime:readOnly,model:'gpt-6-luna',account_digest:account,quota_account_digest:digest('PUBLIC-account').value,output_profile:'bounded_2048/1.0.0' as const,usage_policy:'require_ordinary_permission/1.0.0' as const,admission_digest:digest('PUBLIC admission').value,origin:'public_fixture' as const,permitted_tools:[...permitted],authority:{async check(){},beforeEffect(){}}};
    expect(()=>createCodexAgentRuntimeModel({...modelOptions,scope:{...scope,project_id:createInternalId()}})).toThrow();
    const parent=baseVersion===24,host=await AgentRuntimeModelHost.initialize(root,scope,createCodexAgentRuntimeModel(modelOptions),[...permitted],parent?'PUBLIC packet':undefined);
    // Force the original header/dispatch records through the SDK host, then
    // stop at the real read-only transport. These three calls cannot spawn.
    await expect(host.execute({format:parent?'cimiloop/agent-runtime-model-request/5.0.0':'cimiloop/agent-runtime-model-request/3.0.0',scope_digest:digest(JSON.stringify(scope)).value,admission_digest:modelOptions.admission_digest,call_id:'model_0001',tool:'model_step',prompt:[{role:'user',content:[{type:'text',text:parent?'<content>\n1: PUBLIC packet\n\n(End of file - total 1 lines)\n</content>':'PUBLIC input'}]}],tools:permitted.map(name=>({type:'function',name,description:'PUBLIC only',inputSchema:{type:'object',properties:{},additionalProperties:false}})),max_output_tokens:parent?1600:2048})).rejects.toThrow('codex_read_only_original');
    const paths=['agent-codex-model-originals','agent-codex-model-starts'].map(name=>join(root,name,scope.project_id,scope.run_id,'header.json')),saved=paths.map(path=>readFileSync(path)),header=JSON.parse(saved[0]!.toString());expect(header.format).toBe('cimiloop/codex-agent-model/'+version+'.0.0');
    header.format='cimiloop/codex-agent-model/'+(version-3)+'.0.0';for(const path of paths)writeFileSync(path,JSON.stringify(header));expect(()=>createCodexAgentRuntimeModel(modelOptions)).toThrow();paths.forEach((path,index)=>writeFileSync(path,saved[index]!));expect(()=>createCodexAgentRuntimeModel(modelOptions)).not.toThrow();
   }
   seam.observation.volume_serial='5';await expect(runtime.execute({...request,operation_key:'PUBLIC_other'},()=>'',()=>{})).rejects.toThrow('codex_write_confinement_unproven');expect(existsSync(join(options.root,'PUBLIC_other'))).toBe(false);expect(origin.listExclusive('codex_process_job_intent')).toHaveLength(1);
  }finally{origin.close();seam.image='';}
 },180000);
});
