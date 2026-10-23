import { closeSync, fstatSync, fsyncSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, statfsSync, writeFileSync, writeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentStartLedger, bytesAt, digest, FixedVolumeQuota, openWindowsFixedVolumeReader, parseGatewayJson } from '../../packages/runtime-adapter/dist/index.js';

// Explicit opt-in writes only a new owned filler on the already prepared,
// bounded dedicated volume. No attach/format, model, qualification or cleanup
// of other files. The filler is truncated through its original open handle.
const preparedPath=process.env.CIMILOOP_FIXED_VOLUME_PREPARED;
describe.runIf(process.platform==='win32'&&process.arch==='x64'&&!!preparedPath)('actual dedicated fixed-volume hard boundary',()=>{
 it('pins the original VHD/NTFS identity, observes disk-full rejection, then restores only its own filler',async()=>{
  const plan=parseGatewayJson(bytesAt(preparedPath!,16384).toString('utf8'),16384) as Record<string,unknown>;
  expect(plan.format).toBe('cimiloop/fixed-volume-prepare/1.0.0');expect(plan.executes).toBe(true);
  if(typeof plan.image!=='string'||typeof plan.volume_root!=='string'||!/^([D-Z]):\\$/.test(plan.volume_root)||typeof plan.maximum_bytes!=='number'||!Number.isSafeInteger(plan.maximum_bytes)||plan.maximum_bytes<64*1024**2||plan.maximum_bytes>256*1024**2)throw Error('Use a newly prepared 64..256 MiB dedicated test volume.');
  const image=plan.image,volume=plan.volume_root,maximum=plan.maximum_bytes;
  const parent=join(process.env.LOCALAPPDATA!,'CimiS1');mkdirSync(parent,{recursive:true});const evidence=mkdtempSync(join(parent,'fixed-volume-acceptance-'));
  console.error('Preserve actual fixed-volume evidence: '+evidence);
  const reader=await openWindowsFixedVolumeReader(join(evidence,'tools'));
  const initial=reader(image,volume,maximum),space=statfsSync(volume);
  expect(space.bavail*space.bsize).toBeGreaterThan(maximum/2);
  const origin=AgentStartLedger.initialize(join(evidence,'origin'),{machine_digest:digest('PUBLIC physical-quota test host').value,principal_digest:digest('PUBLIC quota projection; no production authority').value});
  try{
   const quota=FixedVolumeQuota.initialize(origin,reader,{image,volume_root:volume,maximum_bytes:maximum});
   const owned=mkdtempSync(join(volume,'cimiloop-quota-test-'));expect(quota.assertPath(owned).runtime_scope_proven).toBe(false);
   const filler=join(owned,'owned-filler.bin'),fd=openSync(filler,'wx+'),block=Buffer.alloc(1024**2,0x51);let written=0,full=false;
   const startedAt=new Date().toISOString();
   try{
    while(written<=maximum){try{const count=writeSync(fd,block);if(count<=0)throw Error('No write progress');written+=count;fsyncSync(fd);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOSPC')throw error;full=true;break;}}
    expect(full).toBe(true);expect(written).toBeLessThanOrEqual(maximum);expect(fstatSync(fd).size).toBeLessThanOrEqual(maximum);
    expect(quota.read().observation).toEqual(initial);
    writeFileSync(join(evidence,'disk-full-original.json'),JSON.stringify({format:'cimiloop/fixed-volume-full-test/1.0.0',startedAt,observedAt:new Date().toISOString(),prepared:resolve(preparedPath!),filler,written,file_bytes:fstatSync(fd).size,error_code:'ENOSPC',initial,proof:quota.read(),runtime_scope_proven:false,production_qualification:false},null,2),{flag:'wx'});
   }finally{
    // Never delete a named path or resize the VHD. Release only this open test
    // file's bytes, leaving the original evidence and owned directory in place.
    try{ftruncateSync(fd,0);fsyncSync(fd);}finally{closeSync(fd);}
   }
   expect(quota.assertPath(owned).observation).toEqual(initial);
   expect(statfsSync(volume).bavail*statfsSync(volume).bsize).toBeGreaterThan(maximum/2);
   writeFileSync(join(evidence,'summary.json'),JSON.stringify({ok:true,finishedAt:new Date().toISOString(),evidence,volume,maximum_bytes:maximum,actual_disk_full:true,own_filler_restored:true,runtime_scope_proven:false,production_qualification:false},null,2),{flag:'wx'});
  }finally{origin.close();}
 },120000);
});
