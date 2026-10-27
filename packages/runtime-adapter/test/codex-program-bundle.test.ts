import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,renameSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {describe,it,expect} from 'vitest';
import {prepareCodexProcessJob} from '../src/codex-process-job.js';
import {digest} from '../src/files.js';
import {captureCodexProgramBundle,assertCodexProgramBundle} from '../src/codex-program-bundle.js';
import {compileOriginalAgentSandbox,isolatedEnvironment} from '../src/native.js';
import {spawnCodexProcessJob,readStartedCodexProcessJob,readCompletedCodexProcessJob,readCodexProcessJobResources} from '../src/codex-process-job.js';

describe.runIf(process.platform==='win32'&&process.arch==='x64')('original Codex program capability',()=>{
 it('rejects a serialized program grant before preparing any launch',async()=>{
  const root=mkdtempSync(join(tmpdir(),'cb-')),state=join(root,'state');mkdirSync(state);const binary=join(root,'codex.exe');copyFileSync(join(process.env.SystemRoot!,'System32','whoami.exe'),binary);
  const command={file:binary,sha256:digest(readFileSync(binary)).value,args:[]},job=join(root,'job');
  await expect(Reflect.apply(prepareCodexProcessJob,undefined,[job,join(root,'helpers'),command,['--version'],root,{roots:[state]},{policy:'codex_chatgpt_tunnel/1.0.0',timeout_ms:30000},{format:'cimiloop/codex-program-bundle/1.0.0',programs:[{path:binary}]}])).rejects.toThrow('codex_program_bundle_unproven');
  expect(existsSync(job)).toBe(false);
 });
 it('rejects programs covered by a writable root before preparing a launch',async()=>{
  const root=mkdtempSync(join(tmpdir(),'cb-')),binary=join(root,'codex.exe'),source=join(process.env.SystemRoot!,'System32','whoami.exe');for(const name of ['codex.exe','codex-code-mode-host.exe'])copyFileSync(source,join(root,name));
  const command={file:binary,sha256:digest(readFileSync(binary)).value,args:[]},capability=captureCodexProgramBundle(command,()=>{}),job=join(root,'job');
  await expect(prepareCodexProcessJob(job,join(root,'helpers'),command,[],root,{roots:[root]},{policy:'codex_chatgpt_tunnel/1.0.0',timeout_ms:30000},capability)).rejects.toThrow('codex_program_bundle_unproven');expect(existsSync(job)).toBe(false);
 });
 it('executes the pinned companion without allowing program writes and removes its original grant',async()=>{
  const root=mkdtempSync(join(tmpdir(),'cb-')),state=join(root,'state'),bin=join(root,'bin');mkdirSync(state);mkdirSync(bin);
  const binary=join(bin,'codex.exe'),companion=join(bin,'codex-code-mode-host.exe'),source=join(root,'Main.cs'),helper=join(root,'Companion.cs');
  writeFileSync(helper,'using System;class Public{static void Main(){Console.WriteLine("PUBLIC-companion");}}');
  writeFileSync(source,String.raw`using System;using System.IO;using System.Diagnostics;using System.Web.Script.Serialization;class Public{static void Main(){string path=Path.Combine(Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location),"codex-code-mode-host.exe");bool readable=File.ReadAllBytes(path).Length>0,denied=false;try{using(var output=new FileStream(path,FileMode.Open,FileAccess.Write)){} }catch(UnauthorizedAccessException){denied=true;}catch(IOException){denied=true;}var info=new ProcessStartInfo(path){UseShellExecute=false,RedirectStandardOutput=true,CreateNoWindow=true};using(var child=Process.Start(info)){string result=child.StandardOutput.ReadToEnd();child.WaitForExit();Console.WriteLine(new JavaScriptSerializer().Serialize(new{readable=readable,write_denied=denied,child_result=result.Trim(),child_exit=child.ExitCode}));}}}`);
  const compiler=join(process.env.SystemRoot!,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  await compileOriginalAgentSandbox(compiler,['/nologo','/target:exe','/out:'+companion,helper],undefined,root);
  await compileOriginalAgentSandbox(compiler,['/nologo','/target:exe','/reference:System.Web.Extensions.dll','/out:'+binary,source],undefined,root);
  const command={file:binary,sha256:digest(readFileSync(binary)).value,args:[]},capability=captureCodexProgramBundle(command,()=>{}),snapshot=assertCodexProgramBundle(capability,command),job=join(root,'job'),helpers=join(root,'helpers');
  expect(()=>assertCodexProgramBundle({...capability},command)).toThrow('codex_program_bundle_unproven');
  const launch=await prepareCodexProcessJob(job,helpers,command,[],root,{roots:[state]},{policy:'codex_chatgpt_tunnel/1.0.0',timeout_ms:30000},capability),child=spawnCodexProcessJob(launch,{cwd:root,env:isolatedEnvironment()}),stdout:Buffer[]=[],stderr:Buffer[]=[];child.stdout.on('data',(bytes:Buffer)=>stdout.push(bytes));child.stderr.on('data',(bytes:Buffer)=>stderr.push(bytes));child.stdin.end();
  const exit=await new Promise<number|null>((done,reject)=>{child.once('close',done);child.once('error',reject);});expect(exit,root+' '+Buffer.concat(stderr).toString()).toBe(0);
  expect(JSON.parse(Buffer.concat(stdout).toString())).toEqual({readable:true,write_denied:true,child_result:'PUBLIC-companion',child_exit:0});expect(launch.config.format).toBe('cimiloop/codex-process-launch/6.0.0');expect(readCompletedCodexProcessJob(job,helpers,command,[],root)).toBeDefined();
  const start=readStartedCodexProcessJob(job,helpers,command,[],root);expect(start.started).toMatchObject({format:'cimiloop/codex-process-start/5.0.0',program_bundle:snapshot});expect(readCodexProcessJobResources(start)).toMatchObject({status:'disposed',resources_disposed:true});expect(JSON.parse(readFileSync(join(job,'ended.json'),'utf8'))).toMatchObject({format:'cimiloop/codex-process-end/5.0.0',program_bundle:snapshot,root_grants_removed:true,profile_deleted:true});
  const original=readFileSync(companion);renameSync(companion,companion+'.retained');writeFileSync(companion,original);expect(()=>assertCodexProgramBundle(capability,command)).toThrow('codex_program_bundle_unproven');expect(()=>readCompletedCodexProcessJob(job,helpers,command,[],root)).toThrow('codex_program_bundle_unproven');
 },90000);
});
