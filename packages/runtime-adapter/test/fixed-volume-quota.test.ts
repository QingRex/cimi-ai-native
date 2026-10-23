import { mkdtempSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as runtime from '../src/index.js';

// Actual compiler and read-only Windows APIs. No disk creation/attach/format,
// model, quota approval or S1 acceptance; retain each new owned test root.
describe.runIf(process.platform==='win32'&&process.arch==='x64')('fixed VHD volume physical reader',()=>{
 it('refuses a normal file/volume and leaves the original file untouched',async()=>{
  const root=mkdtempSync(join(tmpdir(),'cimiloop-fixed-quota-')),image=join(root,'PUBLIC-not-a-vhd.vhdx');writeFileSync(image,'PUBLIC invalid image');
  const reader=await runtime.openWindowsFixedVolumeReader(join(root,'tools'));
  expect(()=>reader(image,'R:\\',64*1024*1024)).toThrow('fixed_volume_original_unproven');expect(runtime.bytesAt(image).toString()).toBe('PUBLIC invalid image');
 });
 it('refuses malformed roots and unbounded sizes before any volume effect',async()=>{
  const root=mkdtempSync(join(tmpdir(),'cimiloop-fixed-quota-')),image=join(root,'PUBLIC-absent.vhdx'),reader=await runtime.openWindowsFixedVolumeReader(join(root,'tools'));
  for(const volume of['C:\\folder','\\\\server\\share\\','R:\\;format','R:'])expect(()=>reader(image,volume,64*1024*1024)).toThrow();
  for(const bytes of[0,65536,Number.MAX_SAFE_INTEGER,NaN])expect(()=>reader(image,'R:\\',bytes)).toThrow();expect(existsSync(image)).toBe(false);
 });
 it('refuses an unretained CLR configuration beside the retained reader',async()=>{
  const root=mkdtempSync(join(tmpdir(),'cimiloop-fixed-quota-')),tools=join(root,'tools'),reader=await runtime.openWindowsFixedVolumeReader(tools);
  const originals=join(tools,'runtime-binary-originals'),names=readdirSync(originals).filter(name=>/^[a-f0-9]{64}$/.test(name));expect(names).toHaveLength(1);
  const sidecar=join(originals,names[0]!,'runtime.exe.config');writeFileSync(sidecar,'<configuration/>',{flag:'wx'});
  expect(()=>reader(join(root,'absent.vhdx'),'R:\\',64*1024**2)).toThrow('fixed_volume_original_unproven');expect(runtime.bytesAt(sidecar).toString()).toBe('<configuration/>');
 });
});
