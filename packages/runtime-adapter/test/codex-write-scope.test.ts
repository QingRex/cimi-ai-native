import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {describe,it,expect} from 'vitest';
import {compileOriginalAgentSandbox,isolatedEnvironment} from '../src/native.js';
import {prepareCodexProcessJob,spawnCodexProcessJob,readCompletedCodexProcessJob,readStartedCodexProcessJob,readCodexProcessJobResources,requestCodexProcessJobCancellation} from '../src/codex-process-job.js';
import {digest} from '../src/files.js';

// Actual Windows access checks in a fresh PUBLIC root. This does not create a
// VHD, inspect a login, invoke a model, qualify a Provider or prove S1.
describe.runIf(process.platform==='win32'&&process.arch==='x64')('Codex Job enforces its original write roots',()=>{
 it('permits the private root while denying an outside write and owner ACL rewrite',async()=>{
  const root=mkdtempSync(join(tmpdir(),'cw-')),allowed=join(root,'allowed'),outside=join(root,'outside'),helper=join(root,'helpers'),job=join(root,'job');mkdirSync(allowed);mkdirSync(outside);mkdirSync(helper);const outsideFile=join(outside,'PUBLIC.txt');writeFileSync(outsideFile,'PUBLIC outside');
  const source=join(root,'Public.cs'),binary=join(root,'Public.exe');writeFileSync(source,`using System;using System.IO;using System.Web.Script.Serialization;class Public {static void Main(string[] args){bool inside=false,outsideDenied=false,aclDenied=false,readAllowed=false;try{File.WriteAllText(Path.Combine(args[0],"PUBLIC-inside.txt"),"PUBLIC inside");inside=true;}catch(UnauthorizedAccessException){}try{File.AppendAllText(args[1],"PUBLIC forbidden");}catch(UnauthorizedAccessException){outsideDenied=true;}try{var acl=File.GetAccessControl(args[1]);File.SetAccessControl(args[1],acl);}catch(UnauthorizedAccessException){aclDenied=true;}try{readAllowed=File.ReadAllText(args[1])=="PUBLIC outside";}catch{}Console.WriteLine(new JavaScriptSerializer().Serialize(new{inside=inside,outside_denied=outsideDenied,owner_acl_denied=aclDenied,read_allowed=readAllowed}));}}`);
  await compileOriginalAgentSandbox(join(process.env.SystemRoot!,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/reference:System.Web.Extensions.dll','/out:'+binary,source],undefined,root);
  const command={file:binary,args:[],sha256:digest(readFileSync(binary)).value},args=[allowed,outsideFile];
  const launch=await prepareCodexProcessJob(job,helper,command,args,root,{roots:[allowed]});
  const child=spawnCodexProcessJob(launch,{cwd:root,env:isolatedEnvironment()}),chunks:Buffer[]=[];child.stdout.on('data',(bytes:Buffer)=>chunks.push(bytes));
  const exit=await new Promise<number|null>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('PUBLIC original Job timed out; retain '+root));},15000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);resolve(code);});});
  const bytes=Buffer.concat(chunks);writeFileSync(join(root,'PUBLIC-result.json'),bytes);expect(exit,'PUBLIC retained root: '+root).toBe(0);const result=JSON.parse(bytes.toString('utf8'));expect(result.outside_denied,JSON.stringify(result)).toBe(true);expect(result).toEqual({inside:true,outside_denied:true,owner_acl_denied:true,read_allowed:false});expect(readFileSync(outsideFile,'utf8')).toBe('PUBLIC outside');
  const completed=readCompletedCodexProcessJob(job,helper,command,args,root);expect(completed.ended).toBeDefined();
  const sid=JSON.parse(readFileSync(join(job,'started.json'),'utf8')).write_scope.appcontainer_sid;
  for(const path of [allowed,join(allowed,'PUBLIC-inside.txt'),binary])expect(execFileSync('icacls.exe',[path],{windowsHide:true}).toString()).not.toContain(sid);
 },60000);
 it('cancels the original AppContainer Job and its descendant, then observes disposal without a successful model original',async()=>{
  const root=mkdtempSync(join(tmpdir(),'cw-')),allowed=join(root,'allowed'),helper=join(root,'helpers'),job=join(root,'job');mkdirSync(allowed);mkdirSync(helper);
  const source=join(root,'Public.cs'),binary=join(root,'Public.exe');writeFileSync(source,`using System;using System.IO;using System.Diagnostics;using System.Threading;class Public {static void Main(string[] args){if(args[0]=="child"){File.WriteAllText(Path.Combine(args[1],"PUBLIC-child.txt"),"PUBLIC child");Thread.Sleep(60000);return;}var start=new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"child \\\""+args[1]+"\\\"");start.UseShellExecute=false;start.CreateNoWindow=true;var child=Process.Start(start);for(int i=0;i<200&&!File.Exists(Path.Combine(args[1],"PUBLIC-child.txt"));i++)Thread.Sleep(25);if(!File.Exists(Path.Combine(args[1],"PUBLIC-child.txt")))Environment.Exit(23);Console.WriteLine("PUBLIC-ready");Console.Out.Flush();Thread.Sleep(60000);}}`);
  await compileOriginalAgentSandbox(join(process.env.SystemRoot!,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/out:'+binary,source],undefined,root);
  const command={file:binary,args:[],sha256:digest(readFileSync(binary)).value},args=['parent',allowed],launch=await prepareCodexProcessJob(job,helper,command,args,root,{roots:[allowed]}),child=spawnCodexProcessJob(launch,{cwd:root,env:isolatedEnvironment()});
  const closed=new Promise<number|null>((resolve,reject)=>{child.once('close',resolve);child.once('error',reject);});
  try{
   await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('PUBLIC original readiness timeout; retain '+root)),15000);child.stdout.on('data',(bytes:Buffer)=>{if(bytes.toString().includes('PUBLIC-ready')){clearTimeout(timer);resolve();}});void closed.then(()=>{clearTimeout(timer);reject(Error('PUBLIC original exited before readiness; retain '+root));},reject);});
   const started=readStartedCodexProcessJob(job,helper,command,args,root);expect(readCodexProcessJobResources(started).status).toBe('active');requestCodexProcessJobCancellation(launch);expect(await closed).toBe(125);
   expect(readCodexProcessJobResources(started)).toMatchObject({status:'disposed',resources_disposed:true});expect(()=>readCompletedCodexProcessJob(job,helper,command,args,root)).toThrow('codex_process_custody_unproven');
   const end=JSON.parse(readFileSync(join(job,'ended.json'),'utf8'));expect(end).toMatchObject({reason:'cancel_requested',active_processes:0,root_grants_removed:true,profile_deleted:true});
  }finally{requestCodexProcessJobCancellation(launch);await closed;}
 },60000);
});
