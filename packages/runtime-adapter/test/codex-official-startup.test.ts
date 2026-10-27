import {copyFileSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {describe,it,expect} from 'vitest';
import {isolatedEnvironment} from '../src/native.js';
import {digest} from '../src/files.js';
import {captureCodexProgramBundle} from '../src/codex-program-bundle.js';
import {prepareCodexProcessJob,spawnCodexProcessJob,readStartedCodexProcessJob,readCompletedCodexProcessJob,readCodexProcessJobResources,requestCodexProcessJobCancellation} from '../src/codex-process-job.js';

// Explicit program path only. Never discover/read the real login or inherit
// CODEX_HOME. This proves offline official-binary compatibility, not a model,
// account, physical-quota, cost, provider-qualification or S1 acceptance.
const program=process.env.CIMILOOP_OFFICIAL_CODEX_BINARY;
describe.runIf(process.platform==='win32'&&process.arch==='x64'&&!!program)('official Codex offline contained startup',()=>{
 it.each(['version','initialize'])('starts %s with empty private user directories',async mode=>{
  expect(isAbsolute(program!)).toBe(true);
  const root=mkdtempSync(join(tmpdir(),'co-')),bin=join(root,'bin'),state=join(root,'state');mkdirSync(bin);mkdirSync(state);
  const binary=join(bin,'codex.exe');copyFileSync(program!,binary);copyFileSync(join(dirname(program!),'codex-code-mode-host.exe'),join(bin,'codex-code-mode-host.exe'));
  const paths=Object.fromEntries(['home','local','roaming','temp','codex'].map(name=>{const path=join(state,name);mkdirSync(path);return[name,path];}));
  const env={...isolatedEnvironment(),HOME:paths.home,USERPROFILE:paths.home,LOCALAPPDATA:paths.local,APPDATA:paths.roaming,TEMP:paths.temp,TMP:paths.temp,CODEX_HOME:paths.codex};
  const args=mode==='version'?['--version']:['app-server','--stdio'],command={file:binary,sha256:digest(readFileSync(binary)).value,args:[]},job=join(root,'job'),helper=join(root,'helpers');
  const launch=await prepareCodexProcessJob(job,helper,command,args,root,{roots:[state]},{policy:'codex_chatgpt_tunnel/1.0.0',timeout_ms:30000},captureCodexProgramBundle(command,()=>{}),'codex_memory_process/1.0.0');
  const child=spawnCodexProcessJob(launch,{cwd:root,env}),chunks:Buffer[]=[],errors:Buffer[]=[];
  child.stdout.on('data',(bytes:Buffer)=>{chunks.push(bytes);if(mode==='initialize'&&Buffer.concat(chunks).toString().split('\n').some(line=>{try{return JSON.parse(line).id===1;}catch{return false;}}))child.stdin.end();});child.stderr.on('data',(bytes:Buffer)=>errors.push(bytes));
  const closed=new Promise<number|null>((done,reject)=>{const timer=setTimeout(()=>{requestCodexProcessJobCancellation(launch);reject(Error('PUBLIC offline startup timed out; retain '+root));},45000);child.once('close',code=>{clearTimeout(timer);done(code);});child.once('error',error=>{clearTimeout(timer);reject(error);});});
  if(mode==='initialize')child.stdin.write(JSON.stringify({id:1,method:'initialize',params:{clientInfo:{name:'cimiloop_offline',version:'1.0.0'},capabilities:{experimentalApi:true}}})+'\n');else child.stdin.end();
  const exit=await closed;writeFileSync(join(root,'PUBLIC-program-startup.json'),JSON.stringify({format:'cimiloop/offline-codex-startup-diagnostic/1.0.0',mode,exit,program_bundle:launch.config.program_bundle,version:mode==='version'?Buffer.concat(chunks).toString().trim():null,model_requests:0,credentials_read:false}));
  expect(exit,'PUBLIC retained root: '+root+'; '+Buffer.concat(errors).toString()).toBe(0);
  const stdout=Buffer.concat(chunks).toString();if(mode==='version')expect(stdout.trim()).toMatch(/^codex-cli \d+\.\d+\.\d+/);else{const result=stdout.trim().split('\n').map(line=>JSON.parse(line)).find(frame=>frame.id===1);expect(result?.error).toBeUndefined();expect(result?.result).toBeDefined();}
  expect(readCompletedCodexProcessJob(job,helper,command,args,root)).toBeDefined();expect(readCodexProcessJobResources(readStartedCodexProcessJob(job,helper,command,args,root))).toMatchObject({status:'disposed',resources_disposed:true});
  expect(JSON.parse(readFileSync(join(job,'ended.json'),'utf8'))).toMatchObject({network:{stopped:true,opened:0,connected:0,bytes:0},active_processes:0,root_grants_removed:true,profile_deleted:true});
 },90000);
});
