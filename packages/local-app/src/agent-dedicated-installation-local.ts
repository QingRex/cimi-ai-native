import {closeSync,existsSync,fsyncSync,lstatSync,openSync,realpathSync,writeFileSync} from 'node:fs';
import {basename,dirname,isAbsolute,join,parse,relative,resolve,sep} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {requestDigest} from '@cimiloop/kernel';
import {AgentStartLedger,assertOrdinaryPath,bytesAt,digest,directory,initializeWindowsAgentStartLedger,loadModelConnection,openWindowsAgentStartLedger,parseGatewayJson,parseWorkspaceCheckTemplate,type DedicatedModelConnection,type WorkspaceCheckTemplate} from '@cimiloop/runtime-adapter';
import type {LocalProject} from './project.js';
import {readInstance} from './instance.js';
import {LocalProjectError} from './errors.js';

const namespace='dedicated_runtime_installation',requestNamespace='dedicated_runtime_install_request';
const owned=new WeakSet<object>();
function freezeJson<T>(value:T):T{if(value&&typeof value==='object'){for(const item of Object.values(value))freezeJson(item);Object.freeze(value);}return value;}
function fail():never{throw new LocalProjectError('本地 OpenAI 兼容 Runtime 原安装缺失或改变；保留原目录和原操作，不回退登录账户','CAPABILITY_UNAVAILABLE','conflict');}
// Resolve existing Windows short names without opening file contents; retain
// missing tails so pre-install and absent-credential paths use the same rule.
function physicalPath(input:string):string{
 if(process.platform==='win32'&&!/^[A-Za-z]:[\\/]/.test(input))fail();assertOrdinaryPath(input);let current=resolve(input);const suffix:string[]=[];
 for(;;){try{lstatSync(current);let canonical=realpathSync.native(current);if(process.platform==='win32'&&canonical.startsWith('\\\\?\\'))canonical=canonical.slice(4);if(process.platform==='win32'&&!/^[A-Za-z]:[\\/]/.test(canonical))fail();return join(canonical,...suffix.reverse());}
  catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT')||dirname(current)===current)fail();suffix.push(basename(current));current=dirname(current);}}
}
const outside=(parent:string,path:string)=>{const value=relative(physicalPath(parent),physicalPath(path));return isAbsolute(value)||value==='..'||value.startsWith('..'+sep);};
const json=(path:string):unknown=>JSON.parse(JSON.stringify(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(bytesAt(path,65536)),65536)));
function identity(path:string,folder=false){const s=lstatSync(assertOrdinaryPath(path),{bigint:true});if((folder?!s.isDirectory():!s.isFile()||s.nlink!==1n)||s.ino<=0n)fail();return{dev:String(s.dev),ino:String(s.ino),birth:String(s.birthtimeNs)};}
function binding(local:LocalProject){
 const project=local.store.getProject(),actor=local.store.getActor(local.instance.actor_id);
 if(!project||project.id!==local.instance.project_id||project.instance_id!==local.instance.instance_id||!actor||actor.actor_type!=='human'||actor.project_id!==project.id||!same(readInstance(local.location.instancePath),local.instance))fail();
 return{instance:structuredClone(local.instance),repository:local.location.repositoryPath,data_directory:local.location.dataDirectory,repository_identity:identity(local.location.repositoryPath,true),data_identity:identity(local.location.dataDirectory,true)};
}
function writeOnce(path:string,bytes:Buffer){
 assertOrdinaryPath(path);if(!existsSync(path)){const fd=openSync(path,'wx');try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}}
 if(!bytesAt(path,512*1024*1024).equals(bytes))fail();
}
function placement(local:LocalProject,requested?:string){
 const anchor=assertOrdinaryPath(join(local.location.dataDirectory,'dedicated-runtime-placement')),file=join(anchor,'original.json');
 const body=(base:string)=>({format:'cimiloop/dedicated-runtime-placement/1.0.0',project_id:local.instance.project_id,actor_id:local.instance.actor_id,instance_id:local.instance.instance_id,repository:local.location.repositoryPath,data_directory:local.location.dataDirectory,base,root:join(base,'runtime-dedicated',local.instance.project_id,local.instance.actor_id),tools:join(base,'runtime-dedicated-tools'),account_root:join(base,'accounts',local.instance.project_id,local.instance.actor_id)});
 const validate=(value:unknown)=>{
  if(!value||typeof value!=='object'||!('base'in value)||typeof value.base!=='string'||!isAbsolute(value.base))fail();const fixed=body(assertOrdinaryPath(resolve(value.base)));
  if(!same(fixed,value)||[local.location.repositoryPath,local.location.dataDirectory].some(path=>parse(resolve(path)).root.toLowerCase()!==parse(fixed.base).root.toLowerCase())||
   [fixed.base,fixed.root,fixed.tools,fixed.account_root].some(path=>!outside(local.location.repositoryPath,path)||!outside(local.location.dataDirectory,path)))fail();return fixed;
 };
 let saved:ReturnType<typeof body>|undefined;
 if(existsSync(anchor)){if(!existsSync(assertOrdinaryPath(file)))fail();saved=validate(json(file));}
 const selected=requested===undefined?saved:validate(body(assertOrdinaryPath(resolve(requested))));
 if(saved&&selected&&!same(saved,selected))fail();
 return{selected,registered:!!saved,commit(){if(!selected)fail();directory(anchor);writeOnce(file,Buffer.from(JSON.stringify(selected)));}};
}
type Name='opencode.exe'|'node.exe'|'checks.json'|'model-connection.json';
const names:Name[]=['opencode.exe','node.exe','checks.json','model-connection.json'];
interface Material{name:Name;digest:string;identity:ReturnType<typeof identity>}
interface Request{format:'cimiloop/dedicated-runtime-install-request/1.0.0';binding:ReturnType<typeof binding>;materials:Material[];originals_identity:ReturnType<typeof identity>}
interface Installed{format:'cimiloop/dedicated-runtime-installation/1.0.0';request:Request}
function material(root:string,name:Name,bytes?:Buffer):Material{
 const path=join(root,name);if(bytes)writeOnce(path,bytes);const before=identity(path),hash=digest(bytesAt(path,name.endsWith('.json')?65536:512*1024*1024)).value;
 if(!same(before,identity(path)))fail();return{name,digest:hash,identity:before};
}
function catalog(raw:readonly WorkspaceCheckTemplate[]){
 if(!Array.isArray(raw)||!raw.length||raw.length>16)fail();const result=raw.map(parseWorkspaceCheckTemplate).sort((a,b)=>a.check_id.localeCompare(b.check_id));
 if(new Set(result.map(c=>c.check_id)).size!==result.length||Buffer.byteLength(JSON.stringify(result))>65536)fail();return result;
}
function connection(local:LocalProject,path:string){
 const value=structuredClone(loadModelConnection(path));if(value.format!=='cimiloop/dedicated-model/2.0.0'||!outside(local.location.repositoryPath,value.credential_file)||!outside(local.location.dataDirectory,value.credential_file)||parse(resolve(value.credential_file)).root.toLowerCase()!==parse(resolve(local.location.repositoryPath)).root.toLowerCase())fail();return value;
}
function readOriginal(origin:AgentStartLedger,local:LocalProject,root:string,fixedBinding:ReturnType<typeof binding>):Installed{
 if(!same(binding(local),fixedBinding))fail();const key=requestDigest(fixedBinding),row=origin.readExclusive(namespace,key),raw=row?.basis as Installed|undefined;
 if(!raw||Object.keys(raw).sort().join(',')!=='format,request'||raw.format!=='cimiloop/dedicated-runtime-installation/1.0.0')fail();
 const request=raw.request;if(!request||Object.keys(request).sort().join(',')!=='binding,format,materials,originals_identity'||request.format!=='cimiloop/dedicated-runtime-install-request/1.0.0'||!same(request.binding,fixedBinding)||!Array.isArray(request.materials)||request.materials.length!==names.length||!same(request.materials.map(m=>m.name),names)||!same(origin.readExclusive(requestNamespace,key)?.basis,request)||!same(request.originals_identity,identity(join(root,'originals'),true)))fail();return structuredClone(raw);
}
function readInstalled(origin:AgentStartLedger,local:LocalProject,root:string,fixedBinding:ReturnType<typeof binding>){
 const fixed=readOriginal(origin,local,root,fixedBinding);
 if(!same(fixed.request.materials,names.map(name=>material(root,name))))fail();
 catalog(json(join(root,'checks.json')) as WorkspaceCheckTemplate[]);connection(local,join(root,'model-connection.json'));
 if(!same(readOriginal(origin,local,root,fixedBinding),fixed))fail();return fixed;
}
export interface DedicatedAgentRuntimeInstallInput{connection_file:string;native_binary:string;node_binary:string;checks:WorkspaceCheckTemplate[];placement_root:string}
// Explicit Human metadata/program installation. No credential reads, login,
// network, account creation, qualification or business authority is performed.
export async function installDedicatedAgentRuntime(local:LocalProject,raw:DedicatedAgentRuntimeInstallInput){
 const input=structuredClone(raw),fixedBinding=binding(local),where=placement(local,input.placement_root);if(!where.selected)fail();
 if(!isAbsolute(input.connection_file)||!outside(local.location.repositoryPath,input.connection_file)||!outside(local.location.dataDirectory,input.connection_file))fail();
 const config=connection(local,input.connection_file),root=where.selected.root,tools=where.selected.tools;
 const bytes:Record<Name,Buffer>={'opencode.exe':bytesAt(input.native_binary,512*1024*1024),'node.exe':bytesAt(input.node_binary,512*1024*1024),'checks.json':Buffer.from(JSON.stringify(catalog(input.checks))),'model-connection.json':Buffer.from(JSON.stringify(config))};
 if(where.registered&&!existsSync(root))fail();where.commit();
 const currentPlacement=()=>{const current=placement(local);if(!current.registered||!same(current.selected,where.selected))fail();};
 currentPlacement();directory(join(root,'..'));
 const origin=existsSync(root)?await openWindowsAgentStartLedger(root,tools):await initializeWindowsAgentStartLedger(root,tools);
 try{
  currentPlacement();const key=requestDigest(fixedBinding),installed=origin.readExclusive(namespace,key);
  const assertInput=(request:Request)=>{if(!same(request.binding,fixedBinding)||request.materials.length!==names.length||names.some(name=>request.materials.find(m=>m.name===name)?.digest!==digest(bytes[name]).value))fail();};
  const result=(fixed:Installed,created:boolean)=>{currentPlacement();return{ok:true as const,created,installation_digest:requestDigest(fixed),starts_run:false as const,model_dispatch_available:false as const,provider_qualification_proven:false as const,costs_reconciled:false as const};};
  if(installed){const fixed=readInstalled(origin,local,root,fixedBinding);assertInput(fixed.request);return result(fixed,false);}
  const pending=origin.readExclusive(requestNamespace,key);
  if(pending){const request=pending.basis as unknown as Request;assertInput(request);if(!same(request.materials,names.map(name=>material(root,name)))||!same(request.originals_identity,identity(join(root,'originals'),true)))fail();}
  else{const request:Request={format:'cimiloop/dedicated-runtime-install-request/1.0.0',binding:fixedBinding,materials:names.map(name=>material(root,name,bytes[name])),originals_identity:identity(directory(join(root,'originals')),true)};if(!same(binding(local),fixedBinding))fail();origin.issueExclusive(requestNamespace,key,request);}
  const request=origin.readExclusive(requestNamespace,key)!.basis as unknown as Request;
  const claim=origin.claimExclusiveOnce(namespace,key,{format:'cimiloop/dedicated-runtime-installation/1.0.0',request});return result(readInstalled(origin,local,root,fixedBinding),claim.created);
 }finally{origin.close();}
}
export interface OriginalDedicatedRuntimeCustody{origin:AgentStartLedger;root:string;tools:string;account_root:string;installation_digest:string;guard():void;release():void}
export interface InstalledDedicatedAgentRuntime extends OriginalDedicatedRuntimeCustody{native_binary:string;node_binary:string;connection:DedicatedModelConnection;checks:WorkspaceCheckTemplate[]}
export function hasInstalledDedicatedAgentRuntime(local:LocalProject){return existsSync(assertOrdinaryPath(join(local.location.dataDirectory,'dedicated-runtime-placement')));}
// Selection fences new legacy effects even if the selected installation is
// incomplete. Historical readers intentionally do not use this effect fence.
export function assertCodexExecutionSelected(local:LocalProject){if(hasInstalledDedicatedAgentRuntime(local))throw new LocalProjectError('项目已显式选择本地 OpenAI 兼容连接；新执行不能借用旧 Codex 账户','CAPABILITY_UNAVAILABLE','conflict',{production_admission:'unapproved',plan:'local OpenAI-compatible',missing:['当前本地 provider 的完整执行准入']});}
async function open(local:LocalProject,full:boolean):Promise<OriginalDedicatedRuntimeCustody|InstalledDedicatedAgentRuntime|undefined>{
 const chosen=placement(local);if(!chosen.selected)return undefined;const where=chosen.selected;if(!existsSync(where.root))fail();
 let origin:AgentStartLedger|undefined;
 try{
  const fixedBinding=binding(local);origin=await openWindowsAgentStartLedger(where.root,where.tools);const original=origin,read=full?readInstalled:readOriginal,fixed=read(original,local,where.root,fixedBinding),seal=requestDigest(fixed);let released=false;
  const guard=()=>{if(released||!same(placement(local).selected,where)||requestDigest(read(original,local,where.root,fixedBinding))!==seal)fail();};
  const common={origin:original,root:where.root,tools:where.tools,account_root:where.account_root,installation_digest:seal,guard,release(){if(!released){released=true;original.close();}}};
  const config=full?connection(local,join(where.root,'model-connection.json')):undefined,checks=full?catalog(json(join(where.root,'checks.json')) as WorkspaceCheckTemplate[]):undefined;
  const lease=Object.freeze(full?{...common,native_binary:join(where.root,'opencode.exe'),node_binary:join(where.root,'node.exe'),connection:freezeJson(config!),checks:freezeJson(checks!)}:common);guard();if(full)owned.add(lease);return lease;
 }catch(error){origin?.close();throw error;}
}
export const openOriginalDedicatedRuntimeCustody=(local:LocalProject)=>open(local,false) as Promise<OriginalDedicatedRuntimeCustody|undefined>;
export const openInstalledDedicatedAgentRuntime=(local:LocalProject)=>open(local,true) as Promise<InstalledDedicatedAgentRuntime|undefined>;
export function dedicatedRuntimeInstallationWritablePaths(installed:InstalledDedicatedAgentRuntime){if(!owned.has(installed))fail();installed.guard();return[installed.root,installed.tools,installed.account_root];}
export async function inspectDedicatedAgentRuntimeInstallation(local:LocalProject){
 const common={starts_run:false as const,model_dispatch_available:false as const,provider_qualification_proven:false as const,costs_reconciled:false as const};let lease:InstalledDedicatedAgentRuntime|undefined;
 try{lease=await openInstalledDedicatedAgentRuntime(local);return lease?{...common,state:'installed' as const,model:lease.connection.model,installation_digest:lease.installation_digest}:{...common,state:'missing' as const};}
 catch{return{...common,state:'unavailable' as const};}finally{lease?.release();}
}
