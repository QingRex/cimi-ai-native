import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,symlinkSync,realpathSync} from 'node:fs';import {join,isAbsolute} from 'node:path';import {tmpdir} from 'node:os';import {describe,it,expect} from 'vitest';
import {isolatedEnvironment} from '../src/native.js';import {digest} from '../src/files.js';import {captureCodexProgramBundle} from '../src/codex-program-bundle.js';import {prepareCodexProcessJob,spawnCodexProcessJob,readStartedCodexProcessJob,readCompletedCodexProcessJob,readCodexProcessJobResources} from '../src/codex-process-job.js';

const probe=process.env.CIMILOOP_CANONICAL_RUST_PROBE;
// Explicitly compiled PUBLIC Rust fixture only. No current login, model request,
// actual Skill, quota qualification or S1 assertion. Skipping is not acceptance.
describe.runIf(process.platform==='win32'&&process.arch==='x64'&&!!probe)('Rust canonicalization using original volume metadata',()=>{
 it.each(['directory','junction','missing','outside','invalid'])('resolves actual objects without widening file access: %s',async mode=>{
  expect(isAbsolute(probe!)).toBe(true);const root=mkdtempSync(join(tmpdir(),'rc-')),bin=join(root,'bin'),state=join(root,'state');mkdirSync(bin);mkdirSync(state);const binary=join(bin,'codex.exe');for(const name of ['codex.exe','codex-code-mode-host.exe'])copyFileSync(probe!,join(bin,name));
  const target=mode==='junction'?join(state,'alias'):mode==='missing'?join(state,'missing'):mode==='outside'?join(root,'PUBLIC-outside.txt'):state;
  let expected=realpathSync.native(state);if(mode==='junction'){const real=join(state,'real');mkdirSync(real);symlinkSync(real,target,'junction');expected=realpathSync.native(real);}if(mode==='outside')writeFileSync(target,'PUBLIC content must not be read');
  const command={file:binary,args:[],sha256:digest(readFileSync(binary)).value},args=[target,...(mode==='invalid'?['invalid']:[])],job=join(root,'job'),helpers=join(root,'helpers'),launch=await prepareCodexProcessJob(job,helpers,command,args,root,{roots:[state]},{policy:'codex_chatgpt_tunnel/1.0.0',timeout_ms:30000},captureCodexProgramBundle(command,()=>{}),'codex_memory_process/1.0.0','original_volume_handles/1.0.0');
  const child=spawnCodexProcessJob(launch,{cwd:root,env:isolatedEnvironment()}),out:Buffer[]=[],err:Buffer[]=[];child.stdout.on('data',(b:Buffer)=>out.push(b));child.stderr.on('data',(b:Buffer)=>err.push(b));child.stdin.end();const code=await new Promise<number|null>((done,reject)=>{child.once('close',done);child.once('error',reject);}),stdout=Buffer.concat(out).toString(),stderr=Buffer.concat(err).toString();
  if(mode==='directory'||mode==='junction'){expect(code,root+' '+stderr).toBe(0);expect(stdout).toContain('PUBLIC canonical: '+expected+' ; standard_error=Some(5)');expect(readCompletedCodexProcessJob(job,helpers,command,args,root)).toBeDefined();}
  else if(mode==='outside'){expect([0,1]).toContain(code);expect(stdout).toContain('PUBLIC read_denied=true');}
  else{expect(code).toBe(1);expect(stderr).toMatch(mode==='missing'?/Some\([23]\)/:/Some\(5\)/);expect(()=>readCompletedCodexProcessJob(job,helpers,command,args,root)).toThrow();}
  expect(readCodexProcessJobResources(readStartedCodexProcessJob(job,helpers,command,args,root))).toMatchObject({status:'disposed',resources_disposed:true});expect(JSON.parse(readFileSync(join(job,'ended.json'),'utf8'))).toMatchObject({active_processes:0,root_grants_removed:true,profile_deleted:true,volume_handles_closed:true,network:{opened:0,connected:0,bytes:0}});
 },90000);
});
