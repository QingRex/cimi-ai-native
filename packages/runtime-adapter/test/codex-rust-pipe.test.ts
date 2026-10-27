import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';import {tmpdir} from 'node:os';import {describe,it,expect} from 'vitest';
import {isolatedEnvironment} from '../src/native.js';import {digest} from '../src/files.js';import {captureCodexProgramBundle} from '../src/codex-program-bundle.js';
import {prepareCodexProcessJob,spawnCodexProcessJob,readStartedCodexProcessJob,readCompletedCodexProcessJob,readCodexProcessJobResources} from '../src/codex-process-job.js';

const binary=process.env.CIMILOOP_PRIVATE_PIPE_RUST_BINARY;
// SAME Rust pipe module as the client source plan, with cached Rustls libraries.
// This is a transport harness, never the built Codex client or a model/Skill/
// account/billing/VHD/S1 qualification. Opt-in skips are not acceptance.
describe.runIf(process.platform==='win32'&&process.arch==='x64'&&!!binary)('original Rust private model pipe',()=>{
 it('validates bounded metadata and rejects use outside the original AppContainer',()=>{
  expect(isAbsolute(binary!)).toBe(true);const options={windowsHide:true,env:isolatedEnvironment(),timeout:10000};
  expect(execFileSync(binary!,['parse'],options).toString()).toContain('PUBLIC pipe configuration: 1 accepted, 7 refused');
  expect(execFileSync(binary!,['host_denied'],{...options,env:{...options.env,CIMILOOP_CODEX_EGRESS_PIPE:'\\\\.\\pipe\\CimiLoop.Codex.Egress.'+'1'.repeat(32),CIMILOOP_CODEX_EGRESS_POLICY:'original_named_pipe_tls/1.0.0',CIMILOOP_CODEX_EGRESS_SERVER_PID:'123'}}).toString()).toContain('PUBLIC original pipe refused before TLS');
 });
 it.for(['tls','wrong_server'])('uses the actual private pipe module with original server identity: %s',{timeout:90000},async(mode,context)=>{
  if(mode==='tls'&&process.env.CIMILOOP_PUBLIC_TLS_ACCEPTANCE!=='1')context.skip();
  const root=mkdtempSync(join(tmpdir(),'cpr-')),bin=join(root,'bin'),state=join(root,'state');mkdirSync(bin);mkdirSync(state);for(const name of ['codex.exe','codex-code-mode-host.exe'])copyFileSync(binary!,join(bin,name));
  const command={file:join(bin,'codex.exe'),args:[],sha256:digest(readFileSync(binary!)).value},args=[mode],job=join(root,'job'),helpers=join(root,'helpers');
  const launch=await prepareCodexProcessJob(job,helpers,command,args,root,{roots:[state]},{policy:'codex_chatgpt_tunnel/1.0.0',timeout_ms:45000},captureCodexProgramBundle(command,()=>{}),'codex_memory_process/1.0.0','original_volume_handles/1.0.0','explicit_package_access/1.0.0');
  const child=spawnCodexProcessJob(launch,{cwd:root,env:isolatedEnvironment()}),out:Buffer[]=[],err:Buffer[]=[];child.stdout.on('data',(b:Buffer)=>out.push(b));child.stderr.on('data',(b:Buffer)=>err.push(b));child.stdin.end();const code=await new Promise<number|null>((done,reject)=>{child.once('close',done);child.once('error',reject);});
  expect(code,'PUBLIC retained '+root+' '+Buffer.concat(err).toString()).toBe(0);expect(Buffer.concat(out).toString()).toContain(mode==='tls'?'PUBLIC original Rust pipe TLS authenticated; application requests=0':'PUBLIC original pipe refused before TLS');
  expect(readCompletedCodexProcessJob(job,helpers,command,args,root)).toBeDefined();expect(readCodexProcessJobResources(readStartedCodexProcessJob(job,helpers,command,args,root))).toMatchObject({status:'disposed',resources_disposed:true});
  const end=JSON.parse(readFileSync(join(job,'ended.json'),'utf8'));expect(end).toMatchObject({active_processes:0,root_grants_removed:true,profile_deleted:true,network:{stopped:true,opened:1,connected:mode==='tls'?1:0,failed:mode==='tls'?0:1,boundary_failed:false,limit_exceeded:false}});
  if(mode==='tls')expect(end.network.requests).toMatchObject([{host:'chatgpt.com',sni_verified:true}]);
 });
});
