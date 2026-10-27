import {spawn,execFileSync,type SpawnOptionsWithoutStdio} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync,lstatSync,openSync,writeFileSync,fsyncSync,closeSync,realpathSync} from 'node:fs';
import {join,resolve,isAbsolute} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {assertOrdinaryPath,bytesAt,digest,directory,RuntimeAdapterError} from './files.js';
import {parseGatewayJson} from './gateway-conversation.js';
import {buildWindowsCodexProcessJob,isolatedEnvironment} from './native.js';
import {restoreNativeProcessEnvironment,nativeHelperProcessOptions,verifyNativeProcessEnvironment} from './native-process-environment.js';
import {readRuntimeBinaryOriginal} from './runtime-binary-originals.js';
import {isPublicGatewayAddress} from './gateway-address.js';
import {assertCodexProgramBundle,readCodexProgramBundle,type CodexProgramBundle} from './codex-program-bundle.js';

type Command={file:string;sha256:string;args:string[]};
export interface CodexProcessWriteScope {roots:string[];network_mode?:'deny_all'|'public_internet'}
export const CODEX_CONTAINED_PROXY_POLICY='codex_chatgpt_tunnel/1.0.0' as const;
export interface CodexProcessProxy {policy:typeof CODEX_CONTAINED_PROXY_POLICY;timeout_ms:number}
function fail():never{throw new RuntimeAdapterError('codex_process_custody_unproven');}
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const json=(path:string)=>structuredClone(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(bytesAt(path,65536)),65536));
const identity=(path:string)=>{const s=lstatSync(assertOrdinaryPath(path),{bigint:true});if(!s.isFile()||s.nlink!==1n||s.ino<=0n)fail();return{dev:String(s.dev),ino:String(s.ino),birth:String(s.birthtimeNs)};};
const artifact=(path:string)=>({digest:digest(bytesAt(path,65536)).value,identity:identity(path)});
const write=(path:string,value:unknown)=>{const fd=openSync(assertOrdinaryPath(path),'wx');try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}};
function checkedProxy(raw:unknown){if(!exact(raw,['policy','timeout_ms'])||raw.policy!==CODEX_CONTAINED_PROXY_POLICY||!Number.isSafeInteger(raw.timeout_ms)||Number(raw.timeout_ms)<1||Number(raw.timeout_ms)>900000)fail();return raw;}
function checkedProxyStart(raw:unknown,nonce:string){if(!exact(raw,['format','policy','loopback_port','pipe_name'])||raw.format!=='cimiloop/codex-model-network-start/1.0.0'||raw.policy!==CODEX_CONTAINED_PROXY_POLICY||!Number.isSafeInteger(raw.loopback_port)||Number(raw.loopback_port)<1||Number(raw.loopback_port)>65535||raw.pipe_name!=='\\\\.\\pipe\\CimiLoop.Codex.Egress.'+nonce.replaceAll('-',''))fail();}
function checkedProxyEnd(raw:unknown){
 if(!exact(raw,['format','policy','stopped','opened','connected','denied','failed','bytes','limit_exceeded','boundary_failed','requests'])||raw.format!=='cimiloop/codex-model-network-end/1.0.0'||raw.policy!==CODEX_CONTAINED_PROXY_POLICY||raw.stopped!==true||typeof raw.limit_exceeded!=='boolean'||typeof raw.boundary_failed!=='boolean'||!['opened','connected','denied','failed'].every(key=>Number.isSafeInteger(raw[key])&&Number(raw[key])>=0&&Number(raw[key])<=32)||!Number.isSafeInteger(raw.bytes)||Number(raw.bytes)<0||Number(raw.bytes)>33*1024**2||!Array.isArray(raw.requests)||raw.requests.length!==raw.opened)fail();
 let total=0;for(const row of raw.requests){if(!exact(row,['host','result','peer_address','sni_verified','sent_bytes','received_bytes'])||row.host!==null&&!['chatgpt.com','auth.openai.com'].includes(String(row.host))||!['connected','denied','failed'].includes(String(row.result))||row.peer_address!==null&&(typeof row.peer_address!=='string'||!isPublicGatewayAddress(row.peer_address))||typeof row.sni_verified!=='boolean'||!['sent_bytes','received_bytes'].every(key=>Number.isSafeInteger(row[key])&&Number(row[key])>=0&&Number(row[key])<=33*1024**2)||row.result==='connected'&&(!row.sni_verified||row.peer_address===null||row.host===null)||row.result==='denied'&&(row.host!==null||row.peer_address!==null||row.sni_verified||row.sent_bytes!==0||row.received_bytes!==0))fail();total+=Number(row.sent_bytes)+Number(row.received_bytes);}
 const requests=raw.requests;if(total>Number(raw.bytes)||['connected','denied','failed'].some(key=>requests.filter((row:unknown)=>(row as Record<string,unknown>).result===key).length!==raw[key]))fail();
}
function checkedWriteScope(raw:unknown){const app=!!raw&&typeof raw==='object'&&'format'in raw&&raw.format==='cimiloop/codex-write-roots/2.0.0';if(!exact(raw,['format','roots',...(app?['network_mode']:[])])||!app&&raw.format!=='cimiloop/codex-write-roots/1.0.0'||app&&!['deny_all','public_internet'].includes(String(raw.network_mode))||!Array.isArray(raw.roots)||raw.roots.length<1||raw.roots.length>2||raw.roots.some(path=>typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path))fail();return{format:raw.format,roots:[...raw.roots] as string[],...(app?{network_mode:String(raw.network_mode)}:{})};}
function checkedWriteProof(raw:unknown,config:ReturnType<typeof checkedWriteScope>,nonce:string){
 if(config.format==='cimiloop/codex-write-roots/2.0.0'){if(!exact(raw,['format','appcontainer_sid','profile','roots','network_mode','profile_storage'])||raw.format!=='cimiloop/codex-native-write-scope/2.0.0'||typeof raw.appcontainer_sid!=='string'||!/^S-1-15-2-(?:\d+-){6}\d+$/.test(raw.appcontainer_sid)||raw.profile!=='CimiLoop.CodexWrite.'+nonce.replaceAll('-','')||raw.network_mode!==config.network_mode||raw.profile_storage!=='read_only_package_storage/1.0.0'||!Array.isArray(raw.roots)||raw.roots.length!==config.roots.length||raw.roots.some((value,index)=>!exact(value,['path','identity'])||value.path!==config.roots[index]||typeof value.identity!=='string'||!/^\d+:\d+:\d+$/.test(value.identity)))fail();return raw;}
 const key=Buffer.from(nonce.replaceAll('-',''),'hex'),sid='S-1-5-21-'+key.readUInt32BE(0)+'-'+((key.readUInt16BE(6)*65536+key.readUInt16BE(4))>>>0)+'-'+key.readUInt32LE(8)+'-'+key.readUInt32LE(12);
 if(!exact(raw,['format','restricted_sid','roots','desktop','station_access_mask'])||raw.format!=='cimiloop/codex-native-write-scope/1.0.0'||raw.restricted_sid!==sid||raw.station_access_mask!==0x00020023||typeof raw.desktop!=='string'||!raw.desktop.endsWith('\\CimiLoop.Codex.'+nonce.replaceAll('-',''))||!Array.isArray(raw.roots)||raw.roots.length!==config.roots.length||raw.roots.some((value,index)=>!exact(value,['path','identity'])||value.path!==config.roots[index]||typeof value.identity!=='string'||!/^\d+:\d+:\d+$/.test(value.identity)))fail();return raw;
}
function paths(root:string){return{header:join(root,'header.json'),config:join(root,'config.json'),started:join(root,'started.json'),ended:join(root,'ended.json')};}
export function codexProcessLayout(root:string,operationKey:string,processRoot?:string){
 const real=realpathSync.native(assertOrdinaryPath(root)),canonical=process.platform==='win32'?real.toUpperCase():real;
 const helperRoot=processRoot?join(resolve(processRoot),digest(canonical).value):root;
 return{helperRoot,operationRoot:processRoot?join(helperRoot,'j',digest(process.platform==='win32'?operationKey.toUpperCase():operationKey).value):join(root,operationKey,'process-job')};
}
export async function prepareCodexProcessJob(root:string,helperRoot:string,command:Command,args:string[],cwd:string,writeScope?:CodexProcessWriteScope,proxy?:CodexProcessProxy,programs?:CodexProgramBundle){
 const program_bundle=programs===undefined?undefined:assertCodexProgramBundle(programs,command);if(program_bundle&&!proxy)fail();
 if(program_bundle&&writeScope?.roots.some(root=>program_bundle.programs.some(program=>{const path=resolve(program.path).toLowerCase(),base=resolve(root).toLowerCase();return path===base||path.startsWith(base+'\\');})))throw new RuntimeAdapterError('codex_program_bundle_unproven');
 if(proxy&&(!writeScope||(writeScope.network_mode??'deny_all')!=='deny_all'||!exact(proxy,['policy','timeout_ms'])||proxy.policy!==CODEX_CONTAINED_PROXY_POLICY||!Number.isSafeInteger(proxy.timeout_ms)||proxy.timeout_ms<1||proxy.timeout_ms>900000))fail();
 if(Object.values(paths(root)).some(path=>resolve(path).length+7>=260))throw new RuntimeAdapterError('native_executable_path_unsupported');
 const launcher=await buildWindowsCodexProcessJob(helperRoot);directory(root);const p=paths(root);
 const write_scope=writeScope?checkedWriteScope({format:'cimiloop/codex-write-roots/2.0.0',roots:writeScope.roots,network_mode:writeScope.network_mode??'deny_all'}):undefined;
 if(programs&&!same(program_bundle,assertCodexProgramBundle(programs,command)))fail();
 const config={format:program_bundle?'cimiloop/codex-process-launch/6.0.0':proxy?'cimiloop/codex-process-launch/5.0.0':write_scope?'cimiloop/codex-process-launch/4.0.0':'cimiloop/codex-process-launch/2.0.0',owner_pid:process.pid,binary:resolve(command.file),binary_digest:command.sha256,args:[...args],cwd:resolve(cwd),nonce:randomUUID(),cancel_path:join(root,'cancel.json'),...(write_scope?{write_scope}:{}),...(proxy?{proxy:{policy:proxy.policy,timeout_ms:proxy.timeout_ms}}:{}),...(program_bundle?{program_bundle}:{})};
 write(p.config,config);write(p.header,{format:'cimiloop/codex-process-custody/1.0.0',launcher_original:launcher.original,config:artifact(p.config)});
 return readCodexProcessLaunch(root,helperRoot,command,args,cwd);
}
export function readCodexProcessLaunch(root:string,helperRoot:string,command:Command,args:string[],cwd:string){
 const p=paths(root),header=json(p.header),config=json(p.config);
 const bundled=!!config&&typeof config==='object'&&'format'in config&&config.format==='cimiloop/codex-process-launch/6.0.0',network=bundled||!!config&&typeof config==='object'&&'format'in config&&config.format==='cimiloop/codex-process-launch/5.0.0',scoped=bundled||config&&typeof config==='object'&&'format'in config&&['cimiloop/codex-process-launch/3.0.0','cimiloop/codex-process-launch/4.0.0','cimiloop/codex-process-launch/5.0.0','cimiloop/codex-process-launch/6.0.0'].includes(String(config.format)),cancellable=scoped||config&&typeof config==='object'&&'format'in config&&config.format==='cimiloop/codex-process-launch/2.0.0';
 if(!exact(header,['format','launcher_original','config'])||header.format!=='cimiloop/codex-process-custody/1.0.0'||!same(header.config,artifact(p.config))||!exact(config,['format','owner_pid','binary','binary_digest','args','cwd','nonce',...(cancellable?['cancel_path']:[]),...(scoped?['write_scope']:[]),...(network?['proxy']:[]),...(bundled?['program_bundle']:[])])||!cancellable&&config.format!=='cimiloop/codex-process-launch/1.0.0'||cancellable&&config.cancel_path!==join(root,'cancel.json')||!Number.isSafeInteger(config.owner_pid)||Number(config.owner_pid)<1||config.binary!==resolve(command.file)||config.binary_digest!==command.sha256||!same(config.args,args)||config.cwd!==resolve(cwd)||typeof config.nonce!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(config.nonce))fail();if(scoped)checkedWriteScope(config.write_scope);if(bundled)readCodexProgramBundle(config.program_bundle,command);if(network){checkedProxy(config.proxy);if((config.write_scope as Record<string,unknown>)?.network_mode!=='deny_all')fail();}
 const original=header.launcher_original as ReturnType<typeof readRuntimeBinaryOriginal>;
 if(!original||typeof original.path!=='string'||!same(original,readRuntimeBinaryOriginal(helperRoot,original.path,original.sha))||['.config','.local','.manifest'].some(suffix=>existsSync(original.path+suffix)))fail();
 return{header:structuredClone(header),config:structuredClone(config),header_original:artifact(p.header),config_original:artifact(p.config),launcher:original.path,helperRoot,paths:p};
}
export function spawnCodexProcessJob(launch:ReturnType<typeof readCodexProcessLaunch>,options:SpawnOptionsWithoutStdio){
 // libuv's per-owner Job kills non-detached direct children immediately when
 // Node exits. Let this supervisor observe the original owner handle and
 // terminate/observe its own entire Job, including native grandchildren.
 return spawn(launch.launcher,[launch.paths.config,launch.config_original.digest,launch.paths.started,launch.paths.ended],{...options,detached:true,windowsHide:true,stdio:'pipe'});
}
export function readStartedCodexProcessJob(root:string,helperRoot:string,command:Command,args:string[],cwd:string){
 const launch=readCodexProcessLaunch(root,helperRoot,command,args,cwd),started=json(launch.paths.started);
 const process=(value:unknown)=>{if(!exact(value,['pid','creation_ticks','image'])||!Number.isSafeInteger(value.pid)||Number(value.pid)<1||typeof value.creation_ticks!=='string'||!/^\d{1,20}$/.test(value.creation_ticks)||BigInt(value.creation_ticks)===0n||typeof value.image!=='string')fail();return value as {pid:number;creation_ticks:string;image:string};};
 const bundled=launch.config.format==='cimiloop/codex-process-launch/6.0.0',network=bundled||launch.config.format==='cimiloop/codex-process-launch/5.0.0',app=network||launch.config.format==='cimiloop/codex-process-launch/4.0.0',scoped=app||launch.config.format==='cimiloop/codex-process-launch/3.0.0';
 if(!exact(started,['format','nonce','config_digest','owner','supervisor','worker','job_assignment','kill_on_close',...(scoped?['write_scope']:[]),...(network?['proxy','network']:[]),...(bundled?['program_bundle']:[])])||started.format!==(bundled?'cimiloop/codex-process-start/5.0.0':network?'cimiloop/codex-process-start/4.0.0':app?'cimiloop/codex-process-start/3.0.0':scoped?'cimiloop/codex-process-start/2.0.0':'cimiloop/codex-process-start/1.0.0')||started.nonce!==launch.config.nonce||started.config_digest!==launch.config_original.digest||started.job_assignment!=='atomic_on_create'||started.kill_on_close!==true)fail();if(scoped)checkedWriteProof(started.write_scope,checkedWriteScope(launch.config.write_scope),String(launch.config.nonce));
 if(bundled&&!same(started.program_bundle,launch.config.program_bundle))fail();
 const owner=process(started.owner),supervisor=process(started.supervisor),worker=process(started.worker),proxy=network?process(started.proxy):undefined;if(network){checkedProxyStart(started.network,String(launch.config.nonce));if(!proxy||new Set([owner.pid,supervisor.pid,worker.pid,proxy.pid]).size!==4||BigInt(supervisor.creation_ticks)>BigInt(proxy.creation_ticks)||BigInt(proxy.creation_ticks)>BigInt(worker.creation_ticks)||resolve(proxy.image).toLowerCase()!==resolve(launch.launcher).toLowerCase())fail();}
 if(owner.pid!==launch.config.owner_pid||new Set([owner.pid,supervisor.pid,worker.pid]).size!==3||BigInt(owner.creation_ticks)>=BigInt(supervisor.creation_ticks)||BigInt(supervisor.creation_ticks)>BigInt(worker.creation_ticks)||resolve(supervisor.image).toLowerCase()!==resolve(launch.launcher).toLowerCase()||resolve(worker.image).toLowerCase()!==resolve(command.file).toLowerCase())fail();
 return{launch,started,identities:{owner,supervisor,worker,...(proxy?{proxy}:{})},original:{launch:{header_original:launch.header_original,config_original:launch.config_original},started:artifact(launch.paths.started)}};
}
export function readCompletedCodexProcessJob(root:string,helperRoot:string,command:Command,args:string[],cwd:string){
 const {launch,started,original}=readStartedCodexProcessJob(root,helperRoot,command,args,cwd),ended=readCodexProcessEnd(launch,started);if(ended.reason!=='worker_exited'||ended.worker_exit_code!==0||ended.network&&((ended.network as Record<string,unknown>).boundary_failed===true||(ended.network as Record<string,unknown>).limit_exceeded===true))fail();
 return{...original,ended:artifact(launch.paths.ended)};
}
function readCodexProcessEnd(launch:ReturnType<typeof readCodexProcessLaunch>,started:ReturnType<typeof readStartedCodexProcessJob>['started']){
 const ended=json(launch.paths.ended);
 const bundled=launch.config.format==='cimiloop/codex-process-launch/6.0.0',network=bundled||launch.config.format==='cimiloop/codex-process-launch/5.0.0',app=network||launch.config.format==='cimiloop/codex-process-launch/4.0.0',scoped=app||launch.config.format==='cimiloop/codex-process-launch/3.0.0';
 if(!exact(ended,['format','nonce','config_digest','started_digest','reason','worker_exit_code','active_processes','job_closed',...(scoped?['write_scope','root_grants_removed',app?'profile_deleted':'private_desktop_closed']:[]),...(network?['network']:[]),...(bundled?['program_bundle']:[])])||ended.format!==(bundled?'cimiloop/codex-process-end/5.0.0':network?'cimiloop/codex-process-end/4.0.0':app?'cimiloop/codex-process-end/3.0.0':scoped?'cimiloop/codex-process-end/2.0.0':'cimiloop/codex-process-end/1.0.0')||ended.nonce!==launch.config.nonce||ended.config_digest!==launch.config_original.digest||ended.started_digest!==artifact(launch.paths.started).digest||!['worker_exited','owner_exited','cancel_requested',...(network?['network_deadline','network_budget_exhausted']:[])].includes(String(ended.reason))||!Number.isSafeInteger(ended.worker_exit_code)||Number(ended.worker_exit_code)<0||Number(ended.worker_exit_code)>4294967295||ended.active_processes!==0||ended.job_closed!==true||scoped&&(!same(ended.write_scope,started.write_scope)||ended.root_grants_removed!==true||ended[app?'profile_deleted':'private_desktop_closed']!==true))fail();if(bundled&&!same(ended.program_bundle,launch.config.program_bundle))fail();if(network)checkedProxyEnd(ended.network);return ended;
}

export function requestCodexProcessJobCancellation(launch:ReturnType<typeof readCodexProcessLaunch>){
 if(!['cimiloop/codex-process-launch/2.0.0','cimiloop/codex-process-launch/3.0.0','cimiloop/codex-process-launch/4.0.0','cimiloop/codex-process-launch/5.0.0','cimiloop/codex-process-launch/6.0.0'].includes(String(launch.config.format))||launch.config.cancel_path!==join(launch.paths.config,'..','cancel.json')||!same(launch.config_original,artifact(launch.paths.config))||!same(launch.header_original,artifact(launch.paths.header)))fail();
 const path=String(launch.config.cancel_path),body={format:'cimiloop/codex-process-cancel/1.0.0',nonce:launch.config.nonce,config_digest:launch.config_original.digest};
 if(existsSync(path)){if(!same(json(path),body))fail();return;}
 write(path,body);
}

// Uses the original pinned observer and exact started identities; no current
// executable, login, process factory, PID-only kill or missing-root repair.
export function readCodexProcessJobResources(start:ReturnType<typeof readStartedCodexProcessJob>){
 const {launch,started,identities}=start;if(!['cimiloop/codex-process-launch/2.0.0','cimiloop/codex-process-launch/3.0.0','cimiloop/codex-process-launch/4.0.0','cimiloop/codex-process-launch/5.0.0','cimiloop/codex-process-launch/6.0.0'].includes(String(launch.config.format)))fail();
 const original=launch.header.launcher_original as ReturnType<typeof readRuntimeBinaryOriginal>;if(digest(bytesAt(launch.launcher,512*1024*1024)).value!==original.sha)fail();
 restoreNativeProcessEnvironment(launch.helperRoot,launch.launcher);
 const selected=[identities.supervisor,identities.worker,...(identities.proxy?[identities.proxy]:[])],bytes=execFileSync(launch.launcher,['--inspect-identities',JSON.stringify(selected)],{windowsHide:true,timeout:10000,maxBuffer:16384,...nativeHelperProcessOptions(launch.launcher,isolatedEnvironment())}),snapshot=structuredClone(parseGatewayJson(bytes.toString('utf8'),16384));verifyNativeProcessEnvironment(launch.launcher);
 if(!exact(snapshot,['format','states'])||snapshot.format!=='cimiloop/codex-process-identities/1.0.0'||!Array.isArray(snapshot.states)||snapshot.states.length!==selected.length||snapshot.states.some((value,index)=>!exact(value,['identity','state'])||!same(value.identity,selected[index])||!['active','absent','unknown'].includes(String(value.state))))fail();
 let ended:unknown;if(existsSync(launch.paths.ended))ended=readCodexProcessEnd(launch,started);
 const states=snapshot.states as {identity:unknown;state:string}[],status=states.some(value=>value.state==='active')?'active' as const:ended&&states.every(value=>value.state==='absent')?'disposed' as const:'unknown' as const;
 if(!same(start.original.started,artifact(launch.paths.started))||!same(started,json(launch.paths.started))||!same(launch.config_original,artifact(launch.paths.config))||digest(bytesAt(launch.launcher,512*1024*1024)).value!==original.sha)fail();
 return{status,resources_disposed:status==='disposed',basis:{original:start.original,states,...(ended?{ended,ended_original:artifact(launch.paths.ended)}:{})}};
}
