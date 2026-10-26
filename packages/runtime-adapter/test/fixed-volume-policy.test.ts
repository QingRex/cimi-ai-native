import { existsSync,mkdtempSync,renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentStartLedger } from '../src/agent-start-ledger.js';
import { digest } from '../src/files.js';
import { FixedVolumeQuota, FixedVolumeRuntimeStorage,assertFixedVolumeRuntimeStorage,openWindowsFixedVolumeReader, parseFixedVolumeObservation } from '../src/fixed-volume-quota.js';
import * as volumeModule from '../src/fixed-volume-quota.js';
const seam=vi.hoisted(()=>({output:{} as Record<string,unknown>,builds:0,reads:0,onRead:undefined as undefined|(()=>void)}));
vi.mock('node:child_process',()=>({execFileSync:()=>{seam.reads++;seam.onRead?.();return JSON.stringify(seam.output);}}));
vi.mock('../src/native.js',()=>({isolatedEnvironment:()=>({}),buildWindowsFixedVolumeReader:async(_root:string,options?:{readOnly?:true})=>{if(!options?.readOnly)seam.builds++;return{path:'PUBLIC-reader.exe',digest:{value:'PUBLIC'},original:{PUBLIC:true}};}}));
vi.mock('../src/runtime-binary-originals.js',()=>({readRuntimeBinaryOriginal:()=>({PUBLIC:true})}));
// Actual immutable SQLite, PUBLIC OS facts only. No positive physical quota or
// production qualification is implied by these reader/recipe seams.
describe.runIf(process.platform==='win32')('original fixed volume policy projection',()=>{
 const maximum=64*1024**2,image=resolve('D:/PUBLIC/image.vhdx'),root='R:\\';
 beforeEach(()=>{seam.output={format:'cimiloop/fixed-volume-os-observation/1.0.0',image_path:image,volume_root:root,image_identity:{volume:'1',index:'2',created:'3'},virtual_disk_id:'11111111-1111-1111-1111-111111111111',volume_id:'\\\\?\\Volume{22222222-2222-2222-2222-222222222222}\\',volume_serial:'4',virtual_bytes:maximum,volume_bytes:maximum-2*1024**2,physical_bytes:maximum+4*1024**2,provider_subtype:2,filesystem:'NTFS',physical_device:'\\\\.\\PhysicalDrive9',extent_bytes:maximum-1024**2};});
 function ledger(){return AgentStartLedger.initialize(join(mkdtempSync(join(tmpdir(),'cimiloop-volume-policy-')),'origin'),{machine_digest:digest('PUBLIC machine').value,principal_digest:digest('PUBLIC user').value});}
 it('refuses a retained ready ticket with missing intent before any directory, ticket or compile effect',async()=>{
  const origin=ledger(),tools=join(mkdtempSync(join(tmpdir(),'cimiloop-volume-orphan-')),'tools'),key=digest('PUBLIC orphan reader').value;
  try{origin.issueExclusive('fixed_volume_reader_ready',key,{PUBLIC:'retained original ready'});const before=seam.builds;
   const open=Reflect.get(volumeModule,'openHostFixedVolumeReader');await expect(open(origin,tools,key,{PUBLIC:'replacement must be refused'})).rejects.toThrow();
   expect(seam.builds).toBe(before);expect(existsSync(tools)).toBe(false);expect(origin.listExclusive('fixed_volume_reader')).toHaveLength(0);
  }finally{origin.close();}
 });
 it('does not recreate a lost helper after quota and runtime tickets were saved before final attachment',async()=>{
  const origin=ledger(),tools=join(mkdtempSync(join(tmpdir(),'cimiloop-volume-pending-')),'tools'),key=digest('PUBLIC install').value,basis={PUBLIC:'fixed pending original'};
  const open=Reflect.get(volumeModule,'openHostFixedVolumeReader')??((_origin:unknown,path:string)=>openWindowsFixedVolumeReader(path));
  try{const reader=await open(origin,tools,key,basis),quota=FixedVolumeQuota.initialize(origin,reader,{image,volume_root:root,maximum_bytes:maximum});quota.bindRuntime({project_id:'11111111-1111-7111-8111-111111111111',repository_path:root+'project',data_directory:root+'project\\.git\\cimiloop'});
   if(existsSync(tools))renameSync(tools,tools+'.retained');const before=seam.builds;
   await expect(open(origin,tools,key,basis)).rejects.toThrow();expect(seam.builds).toBe(before);expect(existsSync(tools)).toBe(false);expect(origin.listExclusive('fixed_volume_runtime')).toHaveLength(1);
  }finally{origin.close();}
 });
 it('refuses a policy stored under another requested volume identity',async()=>{const origin=ledger(),reader=await openWindowsFixedVolumeReader('PUBLIC');try{const {physical_device:_,...original}=seam.output;original.volume_root='S:\\';seam.output.volume_root='S:\\';origin.issueExclusive('fixed_volume_quota',digest(root).value,{format:'cimiloop/fixed-volume-policy/1.0.0',original});expect(()=>FixedVolumeQuota.open(origin,reader,root)).toThrow();}finally{origin.close();}});
 it('pins immutable disk/volume identity, permits OS device renumbering and refuses paths on another volume',async()=>{const origin=ledger(),reader=await openWindowsFixedVolumeReader('PUBLIC');try{const quota=FixedVolumeQuota.initialize(origin,reader,{image,volume_root:root,maximum_bytes:maximum});expect(quota.read()).toMatchObject({status:'Verified',maximum_bytes:maximum,runtime_scope_proven:false});seam.output.physical_device='\\\\.\\PhysicalDrive12';expect(quota.assertPath(root+'workspace')).toMatchObject({status:'Verified'});expect(()=>quota.assertPath('D:/PUBLIC/elsewhere')).toThrow();expect(FixedVolumeQuota.open(origin,reader,root).read().policy_ticket).toEqual(quota.read().policy_ticket);}finally{origin.close();}});
 it('binds an original project repository and data root to the same immutable volume and reopens without a new ticket',async()=>{
  const origin=ledger(),reader=await openWindowsFixedVolumeReader('PUBLIC');try{
   const quota=FixedVolumeQuota.initialize(origin,reader,{image,volume_root:root,maximum_bytes:maximum}),scope={project_id:'11111111-1111-7111-8111-111111111111',repository_path:root+'project',data_directory:root+'project\\.git\\cimiloop'};
   const bind=Reflect.get(quota,'bindRuntime');expect(bind).toBeTypeOf('function');const storage=bind.call(quota,scope);
   const proof=storage.read();expect(()=>Reflect.construct(FixedVolumeRuntimeStorage,[Symbol('forged'),quota,origin,proof.runtime_ticket,proof])).toThrow();
   expect(()=>assertFixedVolumeRuntimeStorage(Object.create(FixedVolumeRuntimeStorage.prototype),scope)).toThrow();expect(()=>assertFixedVolumeRuntimeStorage(proof,scope)).toThrow();
   expect(()=>bind.call({...quota},scope)).toThrow();
   expect(storage.read()).toMatchObject({runtime_scope_proven:false,scope});storage.assertRuntime(scope.project_id,scope.repository_path,scope.data_directory);
   expect(origin.listExclusive('fixed_volume_runtime')).toHaveLength(1);
   const reopen=Reflect.get(quota,'openRuntime');expect(reopen).toBeTypeOf('function');expect(reopen.call(quota,scope).read()).toEqual(storage.read());expect(origin.listExclusive('fixed_volume_runtime')).toHaveLength(1);
   expect(()=>storage.assertRuntime(scope.project_id,scope.repository_path,root+'elsewhere')).toThrow();
   expect(()=>bind.call(quota,{...scope,data_directory:'D:\\PUBLIC\\outside'})).toThrow();expect(origin.listExclusive('fixed_volume_runtime')).toHaveLength(1);
   seam.output.volume_serial='5';expect(()=>storage.assertRuntime(scope.project_id,scope.repository_path,scope.data_directory)).toThrow();
  }finally{origin.close();}
 });
 it('checks extra Runtime paths through the genuine storage capability without another policy or a replaceable quota method',async()=>{
  const origin=ledger(),reader=await openWindowsFixedVolumeReader('PUBLIC');try{
   const quota=FixedVolumeQuota.initialize(origin,reader,{image,volume_root:root,maximum_bytes:maximum}),scope={project_id:'11111111-1111-7111-8111-111111111111',repository_path:root+'project',data_directory:root+'project\\.git\\cimiloop'},storage=quota.bindRuntime(scope),assertPath=Reflect.get(volumeModule,'assertFixedVolumeRuntimePath');expect(assertPath).toBeTypeOf('function');
   const ticket=storage.read().runtime_ticket;expect(assertPath(storage,scope,root+'private-login')).toMatchObject({runtime_ticket:ticket});
   expect(()=>assertPath(storage,scope,'D:/PUBLIC/outside')).toThrow();expect(()=>assertPath({...storage.read()},scope,root+'private-login')).toThrow();expect(()=>assertPath(storage,{...scope,project_id:'22222222-2222-7222-8222-222222222222'},root+'private-login')).toThrow();
   expect(origin.listExclusive('fixed_volume_runtime')).toHaveLength(1);seam.output.volume_serial='5';expect(()=>assertPath(storage,scope,root+'private-login')).toThrow();
  }finally{origin.close();}
 });
 it('checks the whole writable set with four fresh OS reads and rejects off-volume or substituted capabilities',async()=>{
  const origin=ledger(),reader=await openWindowsFixedVolumeReader('PUBLIC');try{
   const quota=FixedVolumeQuota.initialize(origin,reader,{image,volume_root:root,maximum_bytes:maximum}),scope={project_id:'11111111-1111-7111-8111-111111111111',repository_path:root+'project',data_directory:root+'project\\.git\\cimiloop'},storage=quota.bindRuntime(scope),paths=['host','tools','account','registry','account-tools','login'].map(name=>root+name),before=seam.reads;
   expect(volumeModule.assertFixedVolumeRuntimePaths(storage,scope,paths)).toHaveProperty('runtime_ticket');expect(seam.reads-before).toBe(4);
   expect(()=>volumeModule.assertFixedVolumeRuntimePaths(storage,scope,[...paths,'D:\\PUBLIC\\outside'])).toThrow();expect(()=>volumeModule.assertFixedVolumeRuntimePaths(storage.read(),scope,paths)).toThrow();
   const started=seam.reads;seam.onRead=()=>{if(seam.reads===started+3)seam.output.volume_serial='5';};expect(()=>volumeModule.assertFixedVolumeRuntimePaths(storage,scope,paths)).toThrow();
  }finally{seam.onRead=undefined;origin.close();}
 });
 it('never creates a runtime scope during read and refuses changing a previously bound project root',async()=>{
  const origin=ledger(),reader=await openWindowsFixedVolumeReader('PUBLIC');try{
   const quota=FixedVolumeQuota.initialize(origin,reader,{image,volume_root:root,maximum_bytes:maximum}),scope={project_id:'11111111-1111-7111-8111-111111111111',repository_path:root+'project',data_directory:root+'project\\.git\\cimiloop'};
   const open=Reflect.get(quota,'openRuntime'),bind=Reflect.get(quota,'bindRuntime');expect(open).toBeTypeOf('function');expect(bind).toBeTypeOf('function');
   expect(()=>open.call(quota,scope)).toThrow();expect(origin.listExclusive('fixed_volume_runtime')).toHaveLength(0);
   bind.call(quota,scope);expect(()=>bind.call(quota,{...scope,data_directory:root+'another'})).toThrow();expect(origin.listExclusive('fixed_volume_runtime')).toHaveLength(1);
  }finally{origin.close();}
 });
 it('does not trust a replaced public quota method after the original volume changes',async()=>{
  const origin=ledger(),reader=await openWindowsFixedVolumeReader('PUBLIC');try{
   const quota=FixedVolumeQuota.initialize(origin,reader,{image,volume_root:root,maximum_bytes:maximum}),scope={project_id:'11111111-1111-7111-8111-111111111111',repository_path:root+'project',data_directory:root+'project\\.git\\cimiloop'},storage=quota.bindRuntime(scope),proof=quota.read();
   const patch=vi.spyOn(FixedVolumeQuota.prototype,'assertPath').mockReturnValue(proof);seam.output.volume_serial='5';
   try{expect(()=>assertFixedVolumeRuntimeStorage(storage,scope)).toThrow();}finally{patch.mockRestore();}
  }finally{origin.close();}
 });
 it.each(['virtual_disk_id','volume_id','image_identity','volume_bytes'])('refuses changed original %s and never replaces the old policy',async key=>{const origin=ledger(),reader=await openWindowsFixedVolumeReader('PUBLIC');try{const quota=FixedVolumeQuota.initialize(origin,reader,{image,volume_root:root,maximum_bytes:maximum});seam.output[key]=key==='image_identity'?{volume:'1',index:'5',created:'3'}:key==='volume_bytes'?maximum-3*1024**2:key==='volume_id'?'\\\\?\\Volume{33333333-3333-3333-3333-333333333333}\\':'33333333-3333-3333-3333-333333333333';expect(()=>quota.read()).toThrow();expect(()=>FixedVolumeQuota.initialize(origin,reader,{image,volume_root:root,maximum_bytes:maximum})).toThrow();expect(origin.listExclusive('fixed_volume_quota')).toHaveLength(1);}finally{origin.close();}});
 it('cannot initialize from a caller-provided JSON reader or recreate a missing policy on open',async()=>{const origin=ledger(),reader=await openWindowsFixedVolumeReader('PUBLIC');try{expect(()=>FixedVolumeQuota.open(origin,reader,root)).toThrow();expect(origin.listExclusive('fixed_volume_quota')).toHaveLength(0);expect(()=>FixedVolumeQuota.initialize(origin,(()=>seam.output) as unknown as typeof reader,{image,volume_root:root,maximum_bytes:maximum})).toThrow();}finally{origin.close();}});
 it('cannot use JavaScript construction to present an unrelated Host ticket as the volume policy',async()=>{const origin=ledger(),reader=await openWindowsFixedVolumeReader('PUBLIC');try{const ticket=origin.issue({PUBLIC:'unrelated'}),{physical_device:_,...original}=seam.output;expect(()=>Reflect.construct(FixedVolumeQuota,[origin,reader,ticket,original])).toThrow();expect(origin.listExclusive('fixed_volume_quota')).toHaveLength(0);}finally{origin.close();}});
 it.each([{provider_subtype:3},{filesystem:'ReFS'},{volume_bytes:maximum+1},{physical_bytes:maximum-1},{approved:true}])('refuses invalid or self-asserted observation %j',extra=>{expect(()=>parseFixedVolumeObservation({...seam.output,...extra},image,root,maximum)).toThrow();});
});
