import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe,it,expect} from 'vitest';
import {buildWindowsLauncher} from '../src/native.js';
import {boundaryProbe,runOpenCodeProbe} from '../src/probe.js';

// Real Windows boundary process and Profile component; no model, login, VHD,
// invoice, complete Runtime qualification, or S1 acceptance claim.
describe.runIf(process.platform==='win32'&&process.arch==='x64')('explicit private storage for Native boundary probes',()=>{
 it('runs the actual installed OpenCode version plus both private boundary modes without a model request',async()=>{
  const root=mkdtempSync(join(tmpdir(),'pstore-')),binary=join(process.env.APPDATA!,'npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe');
  const result=await runOpenCodeProbe({root,binary,modelProbe:false,privateStorage:true});
  expect(result.provider.version).toBe('1.18.34');expect(result.model_operations).toEqual([]);expect(result.boundaries).toHaveLength(2);
  for(const boundary of result.boundaries)expect(boundary).toMatchObject({passed:true,outside_read_denied:true,outside_write_denied:true,subprocess_denied:true,loopback_denied:true});
  for(const refs of [result.evidence_refs,...result.boundaries.map(boundary=>boundary.raw_refs)]){const ref=refs.find(value=>value.resource_type==='sandbox_proof');expect(JSON.parse(readFileSync(ref!.locator,'utf8'))).toMatchObject({phase:'ended',reason:'exited',exit_code:0,profile_storage:'read_only_package_storage/1.0.0',all_application_packages_opt_out:true});}
 },120000);
 it.each([true,false])('keeps the requested prospective policy and legacy original shape: %s',async privateStorage=>{
  const root=mkdtempSync(join(tmpdir(),'pstore-')),launcher=await buildWindowsLauncher(root);
  const result=await Reflect.apply(boundaryProbe,undefined,[root,launcher,'write',undefined,privateStorage?true:undefined]);
  const errors=result.raw_refs.find((value:{resource_type:string})=>value.resource_type==='probe_stderr');expect(result,root+' '+(errors?readFileSync(errors.locator,'utf8'):'')).toMatchObject({passed:true,outside_read_denied:true,outside_write_denied:true,subprocess_denied:true,inside_readable:true,inside_writable:true,loopback_denied:true});
  const ref=result.raw_refs.find((value:{resource_type:string})=>value.resource_type==='sandbox_proof');expect(ref).toBeDefined();
  const proof=JSON.parse(readFileSync(ref!.locator,'utf8'));expect(proof).toMatchObject({phase:'ended',reason:'exited',exit_code:0});
  const output=result.raw_refs.find((value:{resource_type:string})=>value.resource_type==='probe_stdout');
  if(privateStorage){expect(proof).toMatchObject({profile_storage:'read_only_package_storage/1.0.0',all_application_packages_opt_out:true,platform_read_capability_sid:'S-1-15-3-1024-1065365936-1281604716-3511738428-1654721687-432734479-3232135806-4053264122-3456934681'});expect(readFileSync(output!.locator,'utf8')).toContain('\"write_denied\":true');}else{expect(proof).not.toHaveProperty('profile_storage');expect(readFileSync(output!.locator,'utf8')).toContain('\"write_denied\":false');}
 },90000);
});
