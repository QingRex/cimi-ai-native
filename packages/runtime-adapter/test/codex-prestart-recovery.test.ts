import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {describe,it,expect} from 'vitest';
import * as jobs from '../src/codex-process-job.js';
import {compileOriginalAgentSandbox,isolatedEnvironment} from '../src/native.js';
import {digest} from '../src/files.js';
import {captureCodexProgramBundle} from '../src/codex-program-bundle.js';

// Actual Windows Job/AppContainer and original supervisor; PUBLIC program only.
// No login, external request, actual VHD, billing or model acceptance evidence.
describe.runIf(process.platform==='win32'&&process.arch==='x64')('original Codex prestart resources',()=>{
 it.each([false,true])('recovers a refused original startup without starting its model or inferring completion: explicit=%s',async explicit=>{
  const root=mkdtempSync(join(tmpdir(),'cpf-')),bin=join(root,'bin'),state=join(root,'state');mkdirSync(bin);mkdirSync(state);
  const binary=join(bin,'codex.exe'),source=join(root,'Public.cs');
  writeFileSync(source,'class Public {static void Main(){System.Console.WriteLine("PUBLIC model executed");}}');
  await compileOriginalAgentSandbox(join(process.env.SystemRoot!,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/out:'+binary,source],undefined,root);copyFileSync(binary,join(bin,'codex-code-mode-host.exe'));
  const command={file:binary,args:[],sha256:digest(readFileSync(binary)).value},args=['x'.repeat(32760)],job=join(root,'job'),helpers=join(root,'helpers');
  const launch=await jobs.prepareCodexProcessJob(job,helpers,command,args,root,{roots:[state]},{policy:'codex_chatgpt_tunnel/1.0.0',timeout_ms:10000},captureCodexProgramBundle(command,()=>{}),'codex_memory_process/1.0.0','original_volume_handles/1.0.0',explicit?'explicit_package_access/1.0.0':undefined);
  // An accepted executable cannot be replaced: make the model's *arguments*
  // exceed CreateProcess's bounded command line instead. The refusal occurs
  // inside the original proxy before any model instruction is authorized.
  const child=jobs.spawnCodexProcessJob(launch,{cwd:root,env:isolatedEnvironment()}),out:Buffer[]=[],err:Buffer[]=[];
  child.stdout.on('data',(b:Buffer)=>out.push(b));child.stderr.on('data',(b:Buffer)=>err.push(b));child.stdin.end();
  const code=await new Promise<number|null>((done,reject)=>{child.once('close',done);child.once('error',reject);});
  expect(code,root+' '+Buffer.concat(err).toString()).toBe(121);expect(Buffer.concat(out).toString()).not.toContain('PUBLIC model executed');expect(existsSync(join(job,'started.json'))).toBe(false);
  const read=Reflect.get(jobs,'readCodexProcessJobPrestartResources');expect(read).toBeTypeOf('function');
  const result=Reflect.apply(read,undefined,[launch]);expect(result).toMatchObject({status:'disposed',resources_disposed:true,completion_proven:false,costs_reconciled:false});
  const path=join(job,'start-failure-resources.json'),saved=readFileSync(path),record=JSON.parse(saved.toString());
  expect(record).toMatchObject({model_resume_authorized:false,active_processes:0,job_closed:true,root_grants_removed:true,profile_deleted:true,volume_handles_closed:true});
  // A resource receipt cannot manufacture a completed model original.
  expect(()=>jobs.readCompletedCodexProcessJob(job,helpers,command,args,root)).toThrow();
  record.root_grants_removed=false;writeFileSync(path,JSON.stringify(record));expect(()=>Reflect.apply(read,undefined,[launch])).toThrow();writeFileSync(path,saved);
  const acl=execFileSync(join(process.env.SystemRoot!,'System32/icacls.exe'),[state],{windowsHide:true,env:isolatedEnvironment()}).toString();expect(acl).not.toContain(record.write_scope.appcontainer_sid);
  expect(Reflect.apply(read,undefined,[launch])).toEqual(result);
 },90000);
});
