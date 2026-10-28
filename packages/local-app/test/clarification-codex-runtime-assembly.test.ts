import {execFileSync} from 'node:child_process';
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,renameSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {packageGitSkill,type VerifiedSkillPackage} from '@cimiloop/skill-adapter';
import * as app from '../src/index.js';
import {openOriginalCodexMattInstallation} from '../src/clarification-codex-installation-local.js';
import {mattClarificationInput} from '../src/clarification-matt-local.js';
import {createInternalId} from '@cimiloop/protocol/v2';
import {createIntentProject} from '../../../tests/fixtures/intent-project.js';

const seam=vi.hoisted(()=>({image:'',observation:{} as Record<string,unknown>}));
vi.mock('node:child_process',async load=>{
 const real=await load<typeof import('node:child_process')>();return{...real,execFileSync:(...args:Parameters<typeof real.execFileSync>)=>{
  const argv=args[1];if(args[0]==='PUBLIC-reader.exe'||Array.isArray(argv)&&argv.length===3&&argv[0]===seam.image)return JSON.stringify(seam.observation);
  return Reflect.apply(real.execFileSync,undefined,args);
 }};
});
vi.mock('../../runtime-adapter/dist/native.js',async load=>({...await load<typeof import('../../runtime-adapter/dist/native.js')>(),buildWindowsFixedVolumeReader:async()=>({path:'PUBLIC-reader.exe',digest:{value:'PUBLIC'},original:{PUBLIC:true}})}));
vi.mock('../../runtime-adapter/dist/runtime-binary-originals.js',async load=>({...await load<typeof import('../../runtime-adapter/dist/runtime-binary-originals.js')>(),readRuntimeBinaryOriginal:()=>({PUBLIC:true})}));
vi.mock('@cimiloop/runtime-adapter',async load=>{
 const real=await load<typeof import('@cimiloop/runtime-adapter')>(),identity={machine_digest:'a'.repeat(64),principal_digest:'b'.repeat(64)};
 return{...real,initializeWindowsAgentStartLedger:async(path:string)=>real.AgentStartLedger.initialize(path,identity),openWindowsAgentStartLedger:async(path:string)=>real.AgentStartLedger.open(path,identity)};
});
// Actual protected Host1 algorithms, branded account/program/home and assembly.
// PUBLIC Host identity, executable/login/OS facts: no Windows custody, model,
// physical quota or S1 claim. No OS helper is used to authenticate the Host.
describe.runIf(process.platform==='win32')('contained Matt actual source assembly',()=>{
 let root:string,source:VerifiedSkillPackage,prior:string|undefined;
 const locals:app.LocalProject[]=[],fixtures:ReturnType<typeof createIntentProject>[]=[];
 const login=()=>({account_digest:'1'.repeat(64),quota_snapshot:{format:'cimiloop/codex-ordinary-quota/1.0.0' as const,ordinary_usage_allowed:true,account_id_digest:'2'.repeat(64),primary:null,secondary:null,credits:null}});
 beforeAll(()=>{
  mkdirSync('D:/CimiS1',{recursive:true});root=mkdtempSync('D:/CimiS1/matt-assembly-');prior=process.env.LOCALAPPDATA;process.env.LOCALAPPDATA=join(root,'user-data');
  mkdirSync(join(root,'bin'));for(const name of ['codex.exe','codex-code-mode-host.exe','opencode.exe','node.exe'])copyFileSync(join(process.env.SystemRoot??'C:/Windows','System32','whoami.exe'),join(root,'bin',name));
  const repo=join(root,'source');mkdirSync(repo);const git=(...args:string[])=>execFileSync('git',['-c','commit.gpgsign=false','-c','core.hooksPath=disabled-hooks','-C',repo,...args],{encoding:'utf8',windowsHide:true,stdio:'pipe'}).trim();
  git('init');git('config','user.name','PUBLIC fixture');git('config','user.email','public@example.test');mkdirSync(join(repo,'skills','grill-me'),{recursive:true});writeFileSync(join(repo,'LICENSE'),'PUBLIC fixture license');writeFileSync(join(repo,'skills','grill-me','SKILL.md'),'---\nname: grill-me\ndescription: PUBLIC clarification\n---\nAsk Human questions.\n');git('add','.');git('commit','-m','PUBLIC source');
  source=packageGitSkill(repo,{format:'cimiloop/skill-import/1.0.0',repository_url:'https://example.test/skills',commit_id:git('rev-parse','HEAD'),entry_path:'skills/grill-me',license_path:'LICENSE',name:'PUBLIC source',version:'1.0.0',modules:[{path:'skills/grill-me',dependencies:[]}],capabilities:[{capability_id:'intent.clarify',version:'1.0.0'}],provider_dependencies:[],required_permissions:{actions:[],resources:[],environment_ids:[],network_hosts:[]},harness_requirements:['invoke_skills'],dependency_review:'PUBLIC fixture only'});
 },120000);
 afterAll(()=>{for(const local of locals)local.store.close();for(const fixture of fixtures)fixture.store.close();if(prior===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=prior;});
 async function setup(){
  const project=mkdtempSync(join(root,'project-')),fixture=createIntentProject(project,{databasePath:join(project,'.cimiloop','project.db')});fixtures.push(fixture);
  app.writeInstance(join(project,'.cimiloop','instance.json'),{schema_version:'1.0.0',instance_id:fixture.project.instance_id,project_id:fixture.project.id,actor_id:fixture.actor.id,created_at:fixture.project.created_at});const local=app.openLocalProject({projectDir:project});locals.push(local);
  await app.installCodexMatt(local,{source,binary:join(root,'bin','codex.exe'),model:'gpt-6-luna'},{inspectLogin:async()=>login()});
  await app.installCodexAgentRuntime(local,{binary:join(root,'bin','codex.exe'),native_binary:join(root,'bin','opencode.exe'),node_binary:join(root,'bin','node.exe'),model:'gpt-6-luna',checks:[{check_id:'query_test',profile:'node_test',entry:'src/check.mjs',inputs:[{path:'src/check.mjs',expected_digest:'4'.repeat(64)},{path:'src/query.ts'}],max_elapsed_ms:4000,max_output_bytes:32768}]},{inspectLogin:async()=>login()});
  await app.installCodexUsageBudget(local,{model_calls:4,output_tokens:8192});
  const image=resolve(root,'PUBLIC.vhdx'),maximum=64*1024**2;seam.image=image;
  seam.observation={format:'cimiloop/fixed-volume-os-observation/1.0.0',image_path:image,volume_root:'D:\\',image_identity:{volume:'1',index:'2',created:'3'},virtual_disk_id:'11111111-1111-1111-1111-111111111111',volume_id:'\\\\?\\Volume{22222222-2222-2222-2222-222222222222}\\',volume_serial:'4',virtual_bytes:maximum,volume_bytes:maximum-2*1024**2,physical_bytes:maximum+4*1024**2,provider_subtype:2,filesystem:'NTFS',physical_device:'\\\\.\\PhysicalDrive9',extent_bytes:maximum-1024**2};
  await app.installCodexRuntimeStorage(local,{image,volume_root:'D:\\',maximum_bytes:maximum});
  const home=mkdtempSync(join(root,'home-'));await app.installCodexRuntimeLoginHome(local,{path:home},{inspectLogin:async()=>login()});return{local,fixture};
 }
 it('attaches the original source once and reopens the contained default without model or domain effects',async()=>{
  const {local}=await setup(),before=local.store.asOfEventSequence();const result=await app.installCodexMattRuntime(local);expect(result).toMatchObject({created:true,qualification:'unqualified_method_execution',starts_run:false,costs_reconciled:false,formal_agent_execution_enabled:false});expect(await app.installCodexMattRuntime(local)).toMatchObject({created:false,attachment_digest:result.attachment_digest});
  const lease=await app.openInstalledCodexMatt(local);expect(lease).toBeDefined();if(!lease)throw Error('Expected original attachment');
  try{lease.guard();expect(lease.readMethodSource().source.source_digest).toEqual(source.source_digest);const originals=join(local.location.dataDirectory,'matt-runtime-originals',lease.installation_digest);expect(existsSync(originals)).toBe(true);renameSync(originals,originals+'.retained-original');expect(()=>lease.guard()).toThrow();await expect(app.openInstalledCodexMatt(local)).rejects.toThrow();expect(existsSync(originals)).toBe(false);}finally{lease.release();}
  expect(local.store.asOfEventSequence()).toBe(before);
 },120000);
 it('releases the successfully assembled account when the Human changes across the outer await',async()=>{
  const {local}=await setup(),actor=local.instance.actor_id;let account:app.InstalledCodexUsageBudget|undefined,definition:app.InstalledCodexMatt|undefined,queued=false;
  try{await expect(app.installCodexMattRuntime(local,{
   async openDefinition(){const original=await openOriginalCodexMattInstallation(local);if(!original)throw Error('Expected original definition');definition={...original,guard(){original.guard();if(!queued&&original.origin.readExclusive('codex_matt_runtime_attachment',original.installation_digest)){queued=true;queueMicrotask(()=>{local.instance.actor_id='PUBLIC-replaced';});}}};return definition;},
   async openAccount(){account=await app.openInstalledCodexUsageBudget(local);return account;}
  })).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(queued).toBe(true);expect(account).toBeDefined();local.instance.actor_id=actor;expect(()=>account!.guard()).toThrow();expect(()=>definition!.guard()).toThrow();
  }finally{local.instance.actor_id=actor;account?.release();definition?.release();}
 },120000);
 it('uses the same dual-original rejection in reads, synchronous verification and execution-control reads',async()=>{
  const {local,fixture}=await setup();await app.installCodexMattRuntime(local);const lease=await app.openInstalledCodexMatt(local);if(!lease)throw Error('Expected contained source');
  const change=fixture.create(),service=new app.LocalPrePlanClarification(local),session=service.begin(change.id,{request_id:createInternalId(),requirement:'PUBLIC fixed original review',background:'PUBLIC Human input',constraints:['Preserve original operation']}).session,input=mattClarificationInput(session,{request_id:createInternalId(),kind:'matt',expected_head:0});
  const original:app.MattClarificationOriginal={format:'cimiloop/pre-plan-matt-original/2.0.0',invocation_key:input.invocation_key,input_digest:input.input_digest,method_name:'grill-me',source_digest:source.source_digest,origin:'external_model',qualification:'unqualified_method_execution',output:{purpose:'clarification',questions:[],unresolved:[]},original_ref:{provider:'codex_app_server',resource_type:'skill_invocation_proof',locator:'PUBLIC retained original',digest:source.source_digest}};
  const read=vi.spyOn(app.CodexMattClarificationHost.prototype,'readOriginalSync').mockReturnValue(original),verify=vi.spyOn(app.CodexMattClarificationHost.prototype,'verifyOriginal').mockImplementation(()=>{});
  try{await expect(lease.host.readOriginal(input)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(()=>lease.host.verifyOriginal(input,original)).toThrow();expect(()=>lease.readExecutionControls(input,original)).toThrow();expect(verify).not.toHaveBeenCalled();}finally{read.mockRestore();verify.mockRestore();lease.release();}
 },120000);
 it('preserves contained original routing after local selection while refusing all new old-account effects',async()=>{
  const {local,fixture}=await setup();await app.installCodexMattRuntime(local);
  const change=fixture.create(),service=new app.LocalPrePlanClarification(local),session=service.begin(change.id,{request_id:createInternalId(),requirement:'PUBLIC retained original',background:'PUBLIC Human input',constraints:['Preserve contained history']}).session,input=mattClarificationInput(session,{request_id:createInternalId(),kind:'matt',expected_head:0});
  const original:app.MattClarificationOriginal={format:'cimiloop/pre-plan-matt-original/2.0.0',invocation_key:input.invocation_key,input_digest:input.input_digest,method_name:'grill-me',source_digest:source.source_digest,origin:'external_model',qualification:'unqualified_method_execution',output:{purpose:'clarification',questions:[],unresolved:[]},original_ref:{provider:'codex_app_server',resource_type:'skill_invocation_proof',locator:'PUBLIC contained original routing',digest:source.source_digest}};
  // PUBLIC result ports check routing only, not original/model authenticity.
  const contained=(self:app.CodexMattClarificationHost)=>String(Reflect.get(self,'configuration')?.root).includes('matt-runtime-originals');
  const read=vi.spyOn(app.CodexMattClarificationHost.prototype,'readOriginalSync').mockImplementation(function(this:app.CodexMattClarificationHost){return contained(this)?original:null;}),
   verify=vi.spyOn(app.CodexMattClarificationHost.prototype,'verifyOriginal').mockImplementation(function(this:app.CodexMattClarificationHost){if(!contained(this))throw Error('PUBLIC wrong legacy reader');}),
   controls=vi.spyOn(app.CodexMattClarificationHost.prototype,'readExecutionControls').mockImplementation(function(this:app.CodexMattClarificationHost){if(!contained(this))throw Error('PUBLIC wrong legacy controls');return{PUBLIC:'contained routing only'} as never;});
  let lease:app.InstalledCodexMatt|undefined;
  try{
   mkdirSync(join(local.location.dataDirectory,'dedicated-runtime-placement'));lease=await app.openInstalledCodexMatt(local);if(!lease)throw Error('Expected retained original host');
   expect(await lease.host.readOriginal(input)).toEqual(original);expect(lease.readOriginalSync(input)).toEqual(original);lease.host.verifyOriginal(input,original);expect(lease.readExecutionControls(input,original)).toEqual({PUBLIC:'contained routing only'});
   const prepare=lease.host.prepare;if(!prepare)throw Error('Expected fenced prepare');expect(()=>prepare(input)).toThrow();await expect(lease.host.invoke(input,()=>{throw Error('PUBLIC no model');})).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});
  }finally{read.mockRestore();verify.mockRestore();controls.mockRestore();lease?.release();}
 // Four positive original-read entry points repeat the full branded account,
 // program/home and volume audit. The first full run took 168s on this host;
 // only this test gets more time, with every production deadline unchanged.
 },240000);
});
