import {copyFileSync,existsSync,mkdirSync,mkdtempSync,renameSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {digest} from '@cimiloop/runtime-adapter';
import * as app from '../src/index.js';
import {createIntentProject} from '../../../tests/fixtures/intent-project.js';

const seam=vi.hoisted(()=>({image:'',builds:0,observation:{} as Record<string,unknown>}));
vi.mock('node:child_process',async load=>{
 const actual=await load<typeof import('node:child_process')>();return{...actual,execFileSync:(...args:Parameters<typeof actual.execFileSync>)=>{
  const argv=args[1];if(args[0]==='PUBLIC-reader.exe'||Array.isArray(argv)&&argv.length===3&&argv[0]===seam.image)return JSON.stringify(seam.observation);return Reflect.apply(actual.execFileSync,undefined,args);
 }};
});
vi.mock('../../runtime-adapter/dist/native.js',async load=>({...await load<typeof import('../../runtime-adapter/dist/native.js')>(),buildWindowsFixedVolumeReader:async(_root:string,options:{readOnly?:true}={})=>{if(!options.readOnly)seam.builds++;return{path:'PUBLIC-reader.exe',digest:{value:'PUBLIC'},original:{PUBLIC:true}};}}));
vi.mock('../../runtime-adapter/dist/runtime-binary-originals.js',async load=>({...await load<typeof import('../../runtime-adapter/dist/runtime-binary-originals.js')>(),readRuntimeBinaryOriginal:()=>({PUBLIC:true})}));
vi.mock('@cimiloop/runtime-adapter',async load=>{
 const actual=await load<typeof import('@cimiloop/runtime-adapter')>(),identity={machine_digest:'a'.repeat(64),principal_digest:'b'.repeat(64)};
 return{...actual,initializeWindowsAgentStartLedger:async(path:string)=>actual.AgentStartLedger.initialize(path,identity),openWindowsAgentStartLedger:async(path:string)=>actual.AgentStartLedger.open(path,identity)};
});
// Actual original-installation, immutable quota and SQLite algorithms with
// PUBLIC Windows Host/OS/program facts. No actual VHD, model or G2 acceptance.
describe.runIf(process.platform==='win32')('dedicated fixed-volume actual application assembly',()=>{
 let root:string,local:app.LocalProject,fixture:ReturnType<typeof createIntentProject>,input:app.DedicatedRuntimeStorageInput;
 beforeAll(async()=>{
  mkdirSync('D:/CimiS1',{recursive:true});root=mkdtempSync('D:/CimiS1/dedicated-volume-');const project=join(root,'project');mkdirSync(project);
  fixture=createIntentProject(project,{databasePath:join(project,'.cimiloop','project.db')});
  app.writeInstance(join(project,'.cimiloop','instance.json'),{schema_version:'1.0.0',instance_id:fixture.project.instance_id,project_id:fixture.project.id,actor_id:fixture.actor.id,created_at:fixture.project.created_at});local=app.openLocalProject({projectDir:project});
  const binary=join(root,'program.exe'),connection=join(root,'model-connection.json');copyFileSync(join(process.env.SystemRoot??'C:/Windows','System32','whoami.exe'),binary);
  writeFileSync(connection,JSON.stringify({format:'cimiloop/dedicated-model/2.0.0',provider:'openai-compatible',transport:'loopback_http/1.0.0',model:'openai-compatible/codex/gpt-6-luna',endpoint:'http://127.0.0.1:3425/v1/chat/completions',credential_file:join(root,'ABSENT-CREDENTIAL'),credential_digest:digest('PUBLIC absent credential')}),{flag:'wx'});
  await app.installDedicatedAgentRuntime(local,{connection_file:connection,native_binary:binary,node_binary:binary,placement_root:join(root,'runtime'),checks:[{check_id:'query_test',profile:'node_test',entry:'src/check.mjs',inputs:[{path:'src/check.mjs',expected_digest:'4'.repeat(64)}],max_elapsed_ms:4000,max_output_bytes:32768}]});
  const maximum=64*1024**2;seam.image=resolve(root,'PUBLIC.vhdx');input={image:seam.image,volume_root:'D:\\',maximum_bytes:maximum};
  seam.observation={format:'cimiloop/fixed-volume-os-observation/1.0.0',image_path:seam.image,volume_root:'D:\\',image_identity:{volume:'1',index:'2',created:'3'},virtual_disk_id:'11111111-1111-1111-1111-111111111111',volume_id:'\\\\?\\Volume{22222222-2222-2222-2222-222222222222}\\',volume_serial:'4',virtual_bytes:maximum,volume_bytes:maximum-2*1024**2,physical_bytes:maximum+4*1024**2,provider_subtype:2,filesystem:'NTFS',physical_device:'\\\\.\\PhysicalDrive9',extent_bytes:maximum-1024**2};
 },120000);
 afterAll(()=>{local?.store.close();fixture?.store.close();});
 it('binds and reopens the same dedicated original quota without Codex registration or business effects',async()=>{
  const before=local.store.asOfEventSequence(),first=await app.installDedicatedRuntimeStorage(local,input);expect(first).toMatchObject({created:true,starts_run:false,provider_qualification_proven:false,costs_reconciled:false});
  expect(await app.installDedicatedRuntimeStorage(local,input)).toEqual({...first,created:false});expect(await app.inspectDedicatedRuntimeStorage(local)).toMatchObject({state:'installed',proof:first.proof});
  const installed=await app.openInstalledDedicatedAgentRuntime(local);if(!installed)throw Error('Expected original installation');
  try{const storage=await app.openDedicatedRuntimeStorage(local,installed);expect(storage?.read()).toEqual(first.proof);expect(installed.origin.listExclusive('dedicated_runtime_storage')).toHaveLength(1);expect(installed.origin.listExclusive('codex_runtime_storage')).toHaveLength(0);}
  finally{installed.release();}expect(local.store.asOfEventSequence()).toBe(before);expect(existsSync(join(root,'ABSENT-CREDENTIAL'))).toBe(false);
 },120000);
 it('refuses changed physical facts and missing reader originals without rebuilding or replacing tickets',async()=>{
  const installed=await app.openInstalledDedicatedAgentRuntime(local);if(!installed)throw Error('Expected original installation');
  try{
   const before=installed.origin.listExclusive('dedicated_runtime_storage'),physical=seam.observation.image_identity,builds=seam.builds;
   seam.observation.image_identity={volume:'1',index:'9',created:'3'};
   try{await expect(app.openDedicatedRuntimeStorage(local,installed)).rejects.toThrow();}finally{seam.observation.image_identity=physical;}
   const tools=join(installed.root,'storage-tools');renameSync(tools,tools+'.retained');
   try{await expect(app.openDedicatedRuntimeStorage(local,installed)).rejects.toThrow();expect(existsSync(tools)).toBe(false);}finally{renameSync(tools+'.retained',tools);}
   expect(seam.builds).toBe(builds);expect(installed.origin.listExclusive('dedicated_runtime_storage')).toEqual(before);
  }finally{installed.release();}
 },120000);
});
