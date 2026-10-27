import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {describe,it,expect} from 'vitest';
import {compileOriginalAgentSandbox,isolatedEnvironment} from '../src/native.js';
import {prepareCodexProcessJob,spawnCodexProcessJob,readCompletedCodexProcessJob} from '../src/codex-process-job.js';
import {digest} from '../src/files.js';

// Diagnostic only: DOS-name error 5 is an unsupported official Codex startup,
// never a successful Runtime acceptance. The positive startup test is separate.
describe.runIf(process.platform==='win32'&&process.arch==='x64')('private directory native path diagnostic',()=>{
 it.each([false,true])('distinguishes directory access from DOS conversion in original proxy=%s',async proxy=>{
  const root=mkdtempSync(join(tmpdir(),'cc-')),state=join(root,'state'),home=join(state,'codex');mkdirSync(state);mkdirSync(home);
  const source=join(root,'Public.cs'),binary=join(root,'Public.exe');
  writeFileSync(source,String.raw`using System;using System.IO;using System.Text;using System.Collections.Generic;using System.Runtime.InteropServices;using System.Web.Script.Serialization;class Public{[DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr CreateFile(string path,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);[DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern uint GetFinalPathNameByHandle(IntPtr handle,StringBuilder path,uint size,uint flags);[DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);static void Main(string[] args){var rows=new List<object>();foreach(uint access in new uint[]{0,128,0x80000000}){IntPtr handle=CreateFile(args[0],access,7,IntPtr.Zero,3,0x02000000,IntPtr.Zero);int error=handle==new IntPtr(-1)?Marshal.GetLastWin32Error():0;var names=new List<object>();if(error==0){foreach(uint flags in new uint[]{0,1,2,8}){var path=new StringBuilder(4096);uint size=GetFinalPathNameByHandle(handle,path,4096,flags);names.Add(new{flags=flags,size=size,error=size==0?Marshal.GetLastWin32Error():0});}CloseHandle(handle);}rows.Add(new{access=access,error=error,names=names});}Console.WriteLine(new JavaScriptSerializer().Serialize(rows));}}`);
  await compileOriginalAgentSandbox(join(process.env.SystemRoot!,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/reference:System.Web.Extensions.dll','/out:'+binary,source],undefined,root);
  const command={file:binary,sha256:digest(readFileSync(binary)).value,args:[]},args=[home],job=join(root,'job'),helpers=join(root,'helpers');
  const launch=await prepareCodexProcessJob(job,helpers,command,args,root,{roots:[state]},proxy?{policy:'codex_chatgpt_tunnel/1.0.0',timeout_ms:30000}:undefined),child=spawnCodexProcessJob(launch,{cwd:root,env:isolatedEnvironment()}),stdout:Buffer[]=[],stderr:Buffer[]=[];child.stdout.on('data',(bytes:Buffer)=>stdout.push(bytes));child.stderr.on('data',(bytes:Buffer)=>stderr.push(bytes));child.stdin.end();
  const exit=await new Promise<number|null>((done,reject)=>{child.once('close',done);child.once('error',reject);});expect(exit,root+' '+Buffer.concat(stderr).toString()).toBe(0);expect(readCompletedCodexProcessJob(job,helpers,command,args,root)).toBeDefined();
  const rows=JSON.parse(Buffer.concat(stdout).toString());expect(rows.map((row:any)=>({access:row.access,error:row.error})),JSON.stringify({root,rows})).toEqual([0,128,0x80000000].map(access=>({access,error:0})));
  for(const row of rows){expect(row.names.map((name:any)=>name.flags)).toEqual([0,1,2,8]);for(const name of row.names){if(name.flags===2){expect(name.error).toBe(0);expect(name.size).toBeGreaterThan(0);}else{expect([0,5]).toContain(name.error);expect(name.size===0).toBe(name.error===5);}}}
 },90000);
});
