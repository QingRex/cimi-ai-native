import {spawn,type SpawnOptionsWithoutStdio} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync,lstatSync,openSync,writeFileSync,fsyncSync,closeSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {assertOrdinaryPath,bytesAt,digest,directory,RuntimeAdapterError} from './files.js';
import {parseGatewayJson} from './gateway-conversation.js';
import {buildWindowsCodexProcessJob} from './native.js';
import {readRuntimeBinaryOriginal} from './runtime-binary-originals.js';

type Command={file:string;sha256:string;args:string[]};
function fail():never{throw new RuntimeAdapterError('codex_process_custody_unproven');}
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const json=(path:string)=>structuredClone(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(bytesAt(path,65536)),65536));
const identity=(path:string)=>{const s=lstatSync(assertOrdinaryPath(path),{bigint:true});if(!s.isFile()||s.nlink!==1n||s.ino<=0n)fail();return{dev:String(s.dev),ino:String(s.ino),birth:String(s.birthtimeNs)};};
const artifact=(path:string)=>({digest:digest(bytesAt(path,65536)).value,identity:identity(path)});
const write=(path:string,value:unknown)=>{const fd=openSync(assertOrdinaryPath(path),'wx');try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}};
function paths(root:string){return{header:join(root,'header.json'),config:join(root,'config.json'),started:join(root,'started.json'),ended:join(root,'ended.json')};}
export function codexProcessLayout(root:string,operationKey:string,processRoot?:string){
 const real=realpathSync.native(assertOrdinaryPath(root)),canonical=process.platform==='win32'?real.toUpperCase():real;
 const helperRoot=processRoot?join(resolve(processRoot),digest(canonical).value):root;
 return{helperRoot,operationRoot:processRoot?join(helperRoot,'j',digest(process.platform==='win32'?operationKey.toUpperCase():operationKey).value):join(root,operationKey,'process-job')};
}
export async function prepareCodexProcessJob(root:string,helperRoot:string,command:Command,args:string[],cwd:string){
 if(Object.values(paths(root)).some(path=>resolve(path).length+7>=260))throw new RuntimeAdapterError('native_executable_path_unsupported');
 const launcher=await buildWindowsCodexProcessJob(helperRoot);directory(root);const p=paths(root);
 const config={format:'cimiloop/codex-process-launch/1.0.0',owner_pid:process.pid,binary:resolve(command.file),binary_digest:command.sha256,args:[...args],cwd:resolve(cwd),nonce:randomUUID()};
 write(p.config,config);write(p.header,{format:'cimiloop/codex-process-custody/1.0.0',launcher_original:launcher.original,config:artifact(p.config)});
 return readCodexProcessLaunch(root,helperRoot,command,args,cwd);
}
export function readCodexProcessLaunch(root:string,helperRoot:string,command:Command,args:string[],cwd:string){
 const p=paths(root),header=json(p.header),config=json(p.config);
 if(!exact(header,['format','launcher_original','config'])||header.format!=='cimiloop/codex-process-custody/1.0.0'||!same(header.config,artifact(p.config))||!exact(config,['format','owner_pid','binary','binary_digest','args','cwd','nonce'])||config.format!=='cimiloop/codex-process-launch/1.0.0'||!Number.isSafeInteger(config.owner_pid)||Number(config.owner_pid)<1||config.binary!==resolve(command.file)||config.binary_digest!==command.sha256||!same(config.args,args)||config.cwd!==resolve(cwd)||typeof config.nonce!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(config.nonce))fail();
 const original=header.launcher_original as ReturnType<typeof readRuntimeBinaryOriginal>;
 if(!original||typeof original.path!=='string'||!same(original,readRuntimeBinaryOriginal(helperRoot,original.path,original.sha))||['.config','.local','.manifest'].some(suffix=>existsSync(original.path+suffix)))fail();
 return{header:structuredClone(header),config:structuredClone(config),header_original:artifact(p.header),config_original:artifact(p.config),launcher:original.path,paths:p};
}
export function spawnCodexProcessJob(launch:ReturnType<typeof readCodexProcessLaunch>,options:SpawnOptionsWithoutStdio){
 // libuv's per-owner Job kills non-detached direct children immediately when
 // Node exits. Let this supervisor observe the original owner handle and
 // terminate/observe its own entire Job, including native grandchildren.
 return spawn(launch.launcher,[launch.paths.config,launch.config_original.digest,launch.paths.started,launch.paths.ended],{...options,detached:true,windowsHide:true,stdio:'pipe'});
}
export function readCompletedCodexProcessJob(root:string,helperRoot:string,command:Command,args:string[],cwd:string){
 const launch=readCodexProcessLaunch(root,helperRoot,command,args,cwd),started=json(launch.paths.started),ended=json(launch.paths.ended);
 const process=(value:unknown)=>{if(!exact(value,['pid','creation_ticks','image'])||!Number.isSafeInteger(value.pid)||Number(value.pid)<1||typeof value.creation_ticks!=='string'||!/^\d{1,20}$/.test(value.creation_ticks)||BigInt(value.creation_ticks)===0n||typeof value.image!=='string')fail();return value as {pid:number;creation_ticks:string;image:string};};
 if(!exact(started,['format','nonce','config_digest','owner','supervisor','worker','job_assignment','kill_on_close'])||started.format!=='cimiloop/codex-process-start/1.0.0'||started.nonce!==launch.config.nonce||started.config_digest!==launch.config_original.digest||started.job_assignment!=='atomic_on_create'||started.kill_on_close!==true)fail();
 const owner=process(started.owner),supervisor=process(started.supervisor),worker=process(started.worker);
 if(owner.pid!==launch.config.owner_pid||new Set([owner.pid,supervisor.pid,worker.pid]).size!==3||BigInt(owner.creation_ticks)>=BigInt(supervisor.creation_ticks)||BigInt(supervisor.creation_ticks)>BigInt(worker.creation_ticks)||resolve(supervisor.image).toLowerCase()!==resolve(launch.launcher).toLowerCase()||resolve(worker.image).toLowerCase()!==resolve(command.file).toLowerCase())fail();
 if(!exact(ended,['format','nonce','config_digest','started_digest','reason','worker_exit_code','active_processes','job_closed'])||ended.format!=='cimiloop/codex-process-end/1.0.0'||ended.nonce!==launch.config.nonce||ended.config_digest!==launch.config_original.digest||ended.started_digest!==artifact(launch.paths.started).digest||ended.reason!=='worker_exited'||ended.worker_exit_code!==0||ended.active_processes!==0||ended.job_closed!==true)fail();
 return{launch:{header_original:launch.header_original,config_original:launch.config_original},started:artifact(launch.paths.started),ended:artifact(launch.paths.ended)};
}
