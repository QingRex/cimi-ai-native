import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {describe,it,expect} from 'vitest';
import {compileOriginalAgentSandbox,isolatedEnvironment} from '../src/native.js';import {digest} from '../src/files.js';
import {captureCodexProgramBundle} from '../src/codex-program-bundle.js';
import {prepareCodexProcessJob,spawnCodexProcessJob,readStartedCodexProcessJob,readCompletedCodexProcessJob,readCodexProcessJobResources} from '../src/codex-process-job.js';

// Actual model/proxy Job with PUBLIC .NET programs. No login, model request,
// VHD, bill or production qualification. Preserve the original fixture on failure.
describe.runIf(process.platform==='win32'&&process.arch==='x64')('original Codex explicit package access',()=>{
 it.each([false,true])('keeps the historical policy and enforces the prospective package policy: %s',async explicit=>{
  const root=mkdtempSync(join(tmpdir(),'cpkg-')),bin=join(root,'bin'),state=join(root,'state');mkdirSync(bin);mkdirSync(state);const source=join(root,'Public.cs'),binary=join(bin,'codex.exe'),canary=join(root,'PUBLIC-all-applications.txt');writeFileSync(canary,'PUBLIC original');
  writeFileSync(source,String.raw`using System;using System.IO;using System.Security.AccessControl;using System.Security.Principal;class Public{static void Main(string[] args){if(args[0]=="grant"){var acl=File.GetAccessControl(args[1]);acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-15-2-1"),FileSystemRights.Modify,AccessControlType.Allow));File.SetAccessControl(args[1],acl);return;}bool denied=false;try{File.AppendAllText(args[1],"PUBLIC effect");}catch(UnauthorizedAccessException){denied=true;}File.WriteAllText(Path.Combine(args[2],"PUBLIC-state.txt"),"PUBLIC allowed");Console.WriteLine("PUBLIC shared_write_denied="+denied.ToString().ToLower());}}`);
  await compileOriginalAgentSandbox(join(process.env.SystemRoot!,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/out:'+binary,source],undefined,root);copyFileSync(binary,join(bin,'codex-code-mode-host.exe'));execFileSync(binary,['grant',canary],{windowsHide:true,env:isolatedEnvironment()});
  const command={file:binary,args:[],sha256:digest(readFileSync(binary)).value},args=['probe',canary,state],job=join(root,'job'),helpers=join(root,'helpers'),launch=await Reflect.apply(prepareCodexProcessJob,undefined,[job,helpers,command,args,root,{roots:[state]},{policy:'codex_chatgpt_tunnel/1.0.0',timeout_ms:30000},captureCodexProgramBundle(command,()=>{}),'codex_memory_process/1.0.0','original_volume_handles/1.0.0',explicit?'explicit_package_access/1.0.0':undefined]);
  const child=spawnCodexProcessJob(launch,{cwd:root,env:isolatedEnvironment()}),out:Buffer[]=[],err:Buffer[]=[];child.stdout.on('data',(b:Buffer)=>out.push(b));child.stderr.on('data',(b:Buffer)=>err.push(b));child.stdin.end();const code=await new Promise<number|null>((done,reject)=>{child.once('close',done);child.once('error',reject);});
  expect(code,root+' '+Buffer.concat(err).toString()).toBe(0);expect(Buffer.concat(out).toString()).toContain('PUBLIC shared_write_denied='+explicit);expect(readCompletedCodexProcessJob(job,helpers,command,args,root)).toBeDefined();expect(readCodexProcessJobResources(readStartedCodexProcessJob(job,helpers,command,args,root))).toMatchObject({status:'disposed',resources_disposed:true});
  const started=JSON.parse(readFileSync(join(job,'started.json'),'utf8')),ended=JSON.parse(readFileSync(join(job,'ended.json'),'utf8'));
  if(explicit){expect(launch.config.format).toBe('cimiloop/codex-process-launch/9.0.0');expect(started.write_scope).toMatchObject({format:'cimiloop/codex-native-write-scope/3.0.0',all_application_packages_opt_out:true});expect(ended.write_scope).toEqual(started.write_scope);expect(readFileSync(canary,'utf8')).toBe('PUBLIC original');
   const path=join(job,'started.json'),original=readFileSync(path);started.write_scope.all_application_packages_opt_out=false;writeFileSync(path,JSON.stringify(started));expect(()=>readStartedCodexProcessJob(job,helpers,command,args,root)).toThrow();started.write_scope.all_application_packages_opt_out=true;
   started.network={format:'cimiloop/codex-model-network-start/1.0.0',policy:'codex_chatgpt_tunnel/1.0.0',loopback_port:12345,pipe_name:started.network.pipe_name};writeFileSync(path,JSON.stringify(started));expect(()=>readStartedCodexProcessJob(job,helpers,command,args,root)).toThrow();writeFileSync(path,original);expect(readCompletedCodexProcessJob(job,helpers,command,args,root)).toBeDefined();
  }
  else{expect(launch.config.format).toBe('cimiloop/codex-process-launch/8.0.0');expect(started.write_scope).not.toHaveProperty('all_application_packages_opt_out');}
 },90000);
});
