import {mkdtempSync,writeFileSync,readFileSync,existsSync,readdirSync,renameSync,mkdirSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,sep} from 'node:path';
import {describe,it,expect,vi} from 'vitest';
import {compileOriginalAgentSandbox,nativeControl,buildWindowsLauncher} from '../src/native.js';
import * as environments from '../src/native-process-environment.js';

// Actual CSharp/Windows helper. PUBLIC output only, no login/model/account.
describe.runIf(process.platform==='win32')('installed Native helper directory environment',()=>{
 it('does not compile a missing identity observer while opening it for read-only recovery',async()=>{
  const root=mkdtempSync(join(tmpdir(),'native-env-observer-')),missing=join(root,'lost-tools');await expect(buildWindowsLauncher(missing,undefined,{readOnly:true})).rejects.toThrow('native_launcher_original_unavailable');expect(existsSync(missing)).toBe(false);
 });
 it('contains actual helper directories, cwd and writes in its original owner',async()=>{
  const root=mkdtempSync(join(tmpdir(),'native-env-')),source=join(root,'Public.cs'),binary=join(root,'Public.exe');
  writeFileSync(source,`using System;using System.IO;using System.Collections.Generic;using System.Web.Script.Serialization;class Public {static void Main(string[] args){var values=new Dictionary<string,string>();foreach(var name in new[]{"HOME","USERPROFILE","APPDATA","LOCALAPPDATA","PROGRAMDATA","TEMP","TMP"})values[name]=Environment.GetEnvironmentVariable(name);bool contained=true;foreach(var value in values.Values)contained=contained&&value!=null&&value.StartsWith(args[0]+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase);if(contained)foreach(var value in values.Values){Directory.CreateDirectory(value);File.WriteAllText(Path.Combine(value,"PUBLIC-write"),"PUBLIC");}Console.WriteLine(new JavaScriptSerializer().Serialize(new {contained=contained,environment=values,cwd=Environment.CurrentDirectory}));}}`);
  await compileOriginalAgentSandbox(join(process.env.SystemRoot!,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/reference:System.Web.Extensions.dll','/out:'+binary,source],undefined,root);
  const install=Reflect.get(environments,'bindNativeProcessEnvironment');if(typeof install==='function')Reflect.apply(install,undefined,[root,binary]);
  const result=(await nativeControl(binary,[root])).value as {contained:boolean;environment:Record<string,string>;cwd:string};expect(result.contained).toBe(true);
  expect(result.cwd.startsWith(root+sep)).toBe(true);for(const path of Object.values(result.environment))expect(existsSync(join(path,'PUBLIC-write'))).toBe(true);
 },60000);
 it('reopens the exact installed environment read-only and rejects a replaced directory',async()=>{
  const root=mkdtempSync(join(tmpdir(),'native-env-read-')),binary=join(root,'PUBLIC.exe');writeFileSync(binary,'PUBLIC helper');environments.bindNativeProcessEnvironment(root,binary);
  const entries=readdirSync(root,{recursive:true}).map(String).sort();vi.resetModules();const reopened=await import('../src/native-process-environment.js');reopened.bindNativeProcessEnvironment(root,binary,{readOnly:true});expect(readdirSync(root,{recursive:true}).map(String).sort()).toEqual(entries);
  const options=reopened.nativeHelperProcessOptions(binary,{},true),temporary=String(options.env.TEMP);renameSync(temporary,temporary+'.retained');mkdirSync(temporary);expect(()=>reopened.nativeHelperProcessOptions(binary,{},true)).toThrow('native_process_environment_changed');
 });
 it('restores a known installed tool layout in a fresh module without creating files',async()=>{
  const root=mkdtempSync(join(tmpdir(),'native-env-layout-')),build=join(root,'tools','PUBLIC');mkdirSync(build,{recursive:true});const binary=join(build,'PUBLIC.exe');writeFileSync(binary,'PUBLIC helper');environments.bindNativeProcessEnvironment(root,binary);
  const before=readdirSync(root,{recursive:true}).map(String).sort();vi.resetModules();const reopened=await import('../src/native-process-environment.js');expect(reopened.nativeHelperProcessOptions(binary,{},true).cwd).toBe(join(root,'native-process-environment','directories'));expect(reopened.nativeProcessEnvironmentOwner(binary)).toBe(root);expect(readdirSync(root,{recursive:true}).map(String).sort()).toEqual(before);
 });
 it('does not create a missing or partial original during read-only recovery',()=>{
  const root=mkdtempSync(join(tmpdir(),'native-env-missing-')),binary=join(root,'PUBLIC.exe'),home=join(root,'native-process-environment');writeFileSync(binary,'PUBLIC helper');
  expect(environments.restoreNativeProcessEnvironment(root,binary)).toBe(false);expect(existsSync(home)).toBe(false);expect(()=>environments.bindNativeProcessEnvironment(root,binary,{readOnly:true})).toThrow();expect(existsSync(home)).toBe(false);
  mkdirSync(home);expect(()=>environments.bindNativeProcessEnvironment(root,binary)).toThrow();expect(readdirSync(home)).toEqual([]);
 });
 it('rejects same-byte helper replacement without replacing the installed binding',()=>{
  const root=mkdtempSync(join(tmpdir(),'native-env-binary-')),binary=join(root,'PUBLIC.exe');writeFileSync(binary,'PUBLIC helper');environments.bindNativeProcessEnvironment(root,binary);renameSync(binary,binary+'.retained');copyFileSync(binary+'.retained',binary);
  expect(readFileSync(binary)).toEqual(readFileSync(binary+'.retained'));expect(()=>environments.nativeHelperProcessOptions(binary,{},true)).toThrow('native_process_environment_unproven');expect(()=>environments.bindNativeProcessEnvironment(root,binary)).toThrow();
 });
});
