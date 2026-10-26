import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,sep} from 'node:path';
import {describe,it,expect} from 'vitest';
import {compileOriginalAgentSandbox} from '../src/native.js';
import {projectWindowsCompiler} from '../src/windows-compiler.js';
import {privateNativeEnvironment} from '../src/native-process-environment.js';
import {renameSync} from 'node:fs';

// Real Windows child processes, PUBLIC compiler output only; no model/login.
describe.runIf(process.platform==='win32')('compiler writes belong to the original build root',()=>{
 it('rejects replacement of a bound private directory',()=>{
  const root=mkdtempSync(join(tmpdir(),'compiler-binding-')),scope=privateNativeEnvironment(join(root,'host')),path=scope.environment.TEMP;
  renameSync(path,path+'.retained');mkdirSync(path);expect(()=>scope.verify()).toThrow('native_process_environment_changed');
 });
 it('rejects an output outside the explicit owner before a compiler or helper directory starts',async()=>{
  const root=mkdtempSync(join(tmpdir(),'compiler-owner-')),other=mkdtempSync(join(tmpdir(),'compiler-other-'));
  await expect(compileOriginalAgentSandbox(process.execPath,['/out:'+join(other,'PUBLIC.exe')],undefined,root)).rejects.toThrow('agent_sandbox_build_failed');expect(existsSync(join(root,'compiler-operations'))).toBe(false);
 });
 it('contains the actual compiler environment, cwd and directory writes without mutating its parent',async()=>{
  const root=mkdtempSync(join(tmpdir(),'compiler-env-')),script=join(root,'public.mjs'),output=join(root,'output.exe');
  const names=['HOME','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA','TEMP','TMP'],before=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  writeFileSync(script,`import{writeFileSync,mkdirSync}from'node:fs';import{join,sep}from'node:path';const root=process.argv[3],names=${JSON.stringify(names)},environment=Object.fromEntries(names.map(name=>[name,process.env[name]??null])),contained=Object.values(environment).every(path=>typeof path==='string'&&path.toLowerCase().startsWith((root+sep).toLowerCase()));if(contained)for(const path of new Set(Object.values(environment))){mkdirSync(path,{recursive:true});writeFileSync(join(path,'PUBLIC-write'),'PUBLIC');}writeFileSync(process.argv[2].slice(5)+'.json',JSON.stringify({environment,cwd:process.cwd(),contained}));`);
  await compileOriginalAgentSandbox(process.execPath,[script,'/out:'+output,root],undefined,root);
  const result=JSON.parse(readFileSync(output+'.json','utf8'));expect(result.contained).toBe(true);expect(result.cwd.toLowerCase().startsWith((root+sep).toLowerCase())).toBe(true);
  for(const path of Object.values(result.environment))expect(existsSync(join(String(path),'PUBLIC-write'))).toBe(true);
  expect(Object.fromEntries(names.map(name=>[name,process.env[name]]))).toEqual(before);
 },60000);
 it('projects long sources into the explicitly owned root instead of the global temporary directory',async()=>{
  const root=mkdtempSync(join(tmpdir(),'compiler-projection-')),target=join(root,'long_'+ 'x'.repeat(110),'long_'+'y'.repeat(110));mkdirSync(target,{recursive:true});
  const source=join(target,'Public.cs'),output=join(target,'Public.exe');writeFileSync(source,'class Public {}');
  await projectWindowsCompiler(join(process.env.SystemRoot!,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/out:'+output,source],async args=>{
   const projected=resolve(args.find(arg=>arg.startsWith('/out:'))!.slice(5));expect(projected.toLowerCase().startsWith((root+sep).toLowerCase())).toBe(true);
   expect(dirname(projected).length).toBeLessThan(220);writeFileSync(projected,'PUBLIC executable');return 'PUBLIC compiled';
  },root);
  expect(readFileSync(output,'utf8')).toBe('PUBLIC executable');
 });
});
