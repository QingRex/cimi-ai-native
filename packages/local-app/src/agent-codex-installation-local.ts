import{closeSync,existsSync,fsyncSync,lstatSync,openSync,writeFileSync}from'node:fs';
import{dirname,isAbsolute,join,relative,resolve,sep}from'node:path';
import{isDeepStrictEqual as same}from'node:util';
import{requestDigest}from'@cimiloop/kernel';
import{AgentStartLedger,assertOrdinaryPath,bytesAt,digest,directory,initializeWindowsAgentStartLedger,openWindowsAgentStartLedger,inspectCodexMethodLogin,parseGatewayJson,parseWorkspaceCheckTemplate,type WorkspaceCheckTemplate}from'@cimiloop/runtime-adapter';
import type{LocalProject}from'./project.js';import{readInstance}from'./instance.js';import{LocalProjectError}from'./errors.js';
import {codexRuntimePlacement} from './agent-codex-placement-local.js';
import {captureCodexProgramBundle,type CodexProgramBundle} from '@cimiloop/runtime-adapter';

const namespace='codex_runtime_installation',requestNamespace='codex_runtime_install_request';
const writableScopes=new WeakMap<object,readonly string[]>();
const programBundles=new WeakMap<object,CodexProgramBundle>();
const sha=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function fail():never{throw new LocalProjectError('Codex账户与Runtime原安装尚不可核对；保留原登记和原操作','CAPABILITY_UNAVAILABLE','conflict');}
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(parseGatewayJson(JSON.stringify(v),65536))) as T;
function freezeJson<T>(value:T):T{if(value&&typeof value==='object'){for(const item of Object.values(value))freezeJson(item);Object.freeze(value);}return value;}
function identity(path:string,folder=false){const stat=lstatSync(assertOrdinaryPath(path),{bigint:true});if((folder?!stat.isDirectory():!stat.isFile()||stat.nlink!==1n)||stat.ino<=0n)fail();return{dev:String(stat.dev),ino:String(stat.ino),birth:String(stat.birthtimeNs)};}
function binding(local:LocalProject){
 const project=local.store.getProject(),actor=local.store.getActor(local.instance.actor_id);
 if(!project||project.id!==local.instance.project_id||project.instance_id!==local.instance.instance_id||!actor||actor.actor_type!=='human'||actor.project_id!==project.id||!same(readInstance(local.location.instancePath),local.instance))fail();
 return{instance:structuredClone(local.instance),repository:local.location.repositoryPath,data_directory:local.location.dataDirectory,repository_identity:identity(local.location.repositoryPath,true),data_identity:identity(local.location.dataDirectory,true)};
}
function layout(local:LocalProject){const {root,tools}=codexRuntimePlacement(local);return{root,tools};}
export interface CodexAgentRuntimeInstallInput{binary:string;native_binary:string;node_binary:string;model:string;disabled_mcp_servers?:string[];checks:WorkspaceCheckTemplate[];placement_root?:string}
type Name='codex.exe'|'codex-code-mode-host.exe'|'opencode.exe'|'node.exe'|'checks.json';
interface Material{name:Name;digest:string;identity:ReturnType<typeof identity>}
interface Request{format:'cimiloop/codex-runtime-install-request/1.0.0';binding:ReturnType<typeof binding>;model:string;account_digest:string;quota_account_digest:string;output_profile:'bounded_2048/1.0.0';usage_policy:'require_ordinary_permission/1.0.0';disabled_mcp_servers:string[];materials:Material[];originals_identity:ReturnType<typeof identity>}
interface Installed{format:'cimiloop/codex-runtime-installation/1.0.0';request:Request}
const names:Name[]=['codex.exe','codex-code-mode-host.exe','opencode.exe','node.exe','checks.json'];
function material(root:string,name:Name,bytes?:Buffer):Material{
 const path=join(root,name),max=name==='checks.json'?65536:512*1024*1024;
 if(bytes){if(bytes.length>max)fail();if(!existsSync(path)){const fd=openSync(assertOrdinaryPath(path),'wx');try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}}if(!bytesAt(path,max).equals(bytes))fail();}
 const before=identity(path),hash=digest(bytesAt(path,max)).value;if(!same(before,identity(path)))fail();return{name,digest:hash,identity:before};
}
function catalog(raw:WorkspaceCheckTemplate[]){if(!Array.isArray(raw)||!raw.length||raw.length>16)fail();const checks=raw.map(parseWorkspaceCheckTemplate).sort((a,b)=>a.check_id.localeCompare(b.check_id));if(new Set(checks.map(c=>c.check_id)).size!==checks.length||Buffer.byteLength(JSON.stringify(checks))>65536)fail();return checks;}
function decode(raw:unknown):Request{
 const v=copy(raw);
 if(!exact(v,['format','binding','model','account_digest','quota_account_digest','output_profile','usage_policy','disabled_mcp_servers','materials','originals_identity'])||v.format!=='cimiloop/codex-runtime-install-request/1.0.0'||!['gpt-6.1-sol','gpt-6-luna'].includes(String(v.model))||!sha(v.account_digest)||!sha(v.quota_account_digest)||v.output_profile!=='bounded_2048/1.0.0'||v.usage_policy!=='require_ordinary_permission/1.0.0'||!Array.isArray(v.disabled_mcp_servers)||v.disabled_mcp_servers.length>64||new Set(v.disabled_mcp_servers).size!==v.disabled_mcp_servers.length||v.disabled_mcp_servers.some(s=>typeof s!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(s)||['__proto__','constructor','prototype'].includes(s))||!Array.isArray(v.materials)||v.materials.length!==names.length||new Set(v.materials.map(m=>(m as Material).name)).size!==names.length||names.some(name=>!(v.materials as Material[]).some(m=>m.name===name)))fail();
 return v as unknown as Request;
}
function readInstalled(origin:AgentStartLedger,local:LocalProject,root:string,fixedBinding:ReturnType<typeof binding>){
 if(!same(binding(local),fixedBinding))fail();const key=requestDigest(fixedBinding),row=origin.readExclusive(namespace,key);if(!row)fail();const installed=copy(row!.basis);
 if(!exact(installed,['format','request'])||installed.format!=='cimiloop/codex-runtime-installation/1.0.0')fail();const request=decode(installed.request);
 if(!same(request.binding,fixedBinding)||!same(origin.readExclusive(requestNamespace,key)?.basis,request)||!same(request.materials,request.materials.map(m=>material(root,m.name)))||!same(request.originals_identity,identity(join(root,'originals'),true)))fail();
 catalog(copy(parseGatewayJson(bytesAt(join(root,'checks.json'),65536).toString('utf8'),65536)) as WorkspaceCheckTemplate[]);
 return{format:'cimiloop/codex-runtime-installation/1.0.0' as const,request};
}

// Explicit local Human installation. Pinning bytes does not qualify a provider,
// create a Run/Context, settle a bill, or bypass complete Runtime admission.
export async function installCodexAgentRuntime(local:LocalProject,raw:CodexAgentRuntimeInstallInput,services:{inspectLogin?:typeof inspectCodexMethodLogin}={}){
 const fixedBinding=binding(local),placement=codexRuntimePlacement(local,raw.placement_root),where={root:placement.root,tools:placement.tools},input=structuredClone(raw);if(!['gpt-6.1-sol','gpt-6-luna'].includes(input.model))fail();
 const disabled=[...(input.disabled_mcp_servers??[])].sort();if(disabled.length>64||new Set(disabled).size!==disabled.length||disabled.some(s=>typeof s!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(s)||['__proto__','constructor','prototype'].includes(s)))fail();
 const bytes:Record<Name,Buffer>={'codex.exe':bytesAt(input.binary,512*1024*1024),'codex-code-mode-host.exe':bytesAt(join(dirname(input.binary),'codex-code-mode-host.exe'),512*1024*1024),'opencode.exe':bytesAt(input.native_binary,512*1024*1024),'node.exe':bytesAt(input.node_binary,512*1024*1024),'checks.json':Buffer.from(JSON.stringify(catalog(input.checks)))};
 if(placement.registered&&!existsSync(where.root))fail();placement.commit();
 directory(join(where.root,'..'));const origin=existsSync(where.root)?await openWindowsAgentStartLedger(where.root,where.tools):await initializeWindowsAgentStartLedger(where.root,where.tools);
 try{
  const key=requestDigest(fixedBinding),assertInput=(request:Request)=>{if(!same(request.binding,fixedBinding)||request.model!==input.model||!same(request.disabled_mcp_servers,disabled)||names.some(name=>request.materials.find(m=>m.name===name)?.digest!==digest(bytes[name]).value))fail();};
  const result=(fixed:Installed,created:boolean)=>{placement.commit();return{ok:true as const,created,model:fixed.request.model,installation_digest:requestDigest(fixed),provider_qualification_proven:false as const,costs_reconciled:false as const};};
  if(origin.readExclusive(namespace,key)){const fixed=readInstalled(origin,local,where.root,fixedBinding);assertInput(fixed.request);return result(fixed,false);}
  const pending=origin.readExclusive(requestNamespace,key);
  if(pending){const request=decode(pending.basis);assertInput(request);if(!same(binding(local),fixedBinding)||!same(request.materials,request.materials.map(m=>material(where.root,m.name)))||!same(request.originals_identity,identity(join(where.root,'originals'),true)))fail();const fixed:Installed={format:'cimiloop/codex-runtime-installation/1.0.0',request},claim=origin.claimExclusiveOnce(namespace,key,fixed);return result(readInstalled(origin,local,where.root,fixedBinding),claim.created);}
  const materials=names.map(name=>material(where.root,name,bytes[name])),originalsIdentity=identity(directory(join(where.root,'originals')),true);
  const guard=()=>{if(!same(binding(local),fixedBinding)||!same(materials,materials.map(m=>material(where.root,m.name)))||!same(originalsIdentity,identity(join(where.root,'originals'),true)))fail();};
  const inspected=await(services.inspectLogin??inspectCodexMethodLogin)({root:join(where.root,'inspection'),command:{file:join(where.root,'codex.exe'),args:[],sha256:materials[0]!.digest},disabled_mcp_servers:disabled,usage_policy:'require_ordinary_permission/1.0.0'},guard);
  guard();if(!sha(inspected.account_digest)||inspected.quota_snapshot?.ordinary_usage_allowed!==true||!sha(inspected.quota_snapshot?.account_id_digest))fail();
  const request:Request={format:'cimiloop/codex-runtime-install-request/1.0.0',binding:fixedBinding,model:input.model,account_digest:inspected.account_digest,quota_account_digest:inspected.quota_snapshot!.account_id_digest!,output_profile:'bounded_2048/1.0.0',usage_policy:'require_ordinary_permission/1.0.0',disabled_mcp_servers:disabled,materials,originals_identity:originalsIdentity};
  origin.issueExclusive(requestNamespace,key,request);const fixed:Installed={format:'cimiloop/codex-runtime-installation/1.0.0',request},claim=origin.claimExclusiveOnce(namespace,key,fixed);return result(readInstalled(origin,local,where.root,fixedBinding),claim.created);
 }catch{fail();}finally{origin.close();}
}

export interface InstalledCodexAgentRuntime{origin:AgentStartLedger;root:string;binary:string;native_binary:string;node_binary:string;model:string;account_digest:string;quota_account_digest:string;output_profile:'bounded_2048/1.0.0';usage_policy:'require_ordinary_permission/1.0.0';disabled_mcp_servers:string[];checks:WorkspaceCheckTemplate[];installation_digest:string;guard():void;release():void}
export function codexRuntimeInstallationWritablePaths(installed:InstalledCodexAgentRuntime){const paths=writableScopes.get(installed);if(!paths)fail();installed.guard();return [...paths!];}
// Only an opened original installation may lend its two pinned programs.
// A serialized/spread lease cannot select additional read or execute paths.
export function codexRuntimeInstallationProgramBundle(installed:InstalledCodexAgentRuntime):CodexProgramBundle{
 if(!writableScopes.has(installed))fail();installed.guard();let capability=programBundles.get(installed);
 if(!capability){capability=captureCodexProgramBundle({file:installed.binary,args:[],sha256:digest(bytesAt(installed.binary,512*1024*1024)).value},()=>installed.guard());programBundles.set(installed,capability);}return capability;
}
// Presence chooses the already installed provider only. It never grants
// execution, repairs missing bytes, or opens login credentials.
export function hasInstalledCodexAgentRuntime(local:LocalProject){return !!process.env.LOCALAPPDATA&&existsSync(layout(local).root);}
// Discovery reads only the existing protected origin and exact physical bundle.
// Missing/corrupt originals are never recreated or reapproved by a query.
export async function openInstalledCodexAgentRuntime(local:LocalProject):Promise<InstalledCodexAgentRuntime|undefined>{
 if(!process.env.LOCALAPPDATA)return undefined;const placement=codexRuntimePlacement(local),where={root:placement.root,tools:placement.tools};if(!existsSync(where.root)){if(placement.registered)fail();return undefined;}let origin:AgentStartLedger|undefined;
 try{const fixedBinding=binding(local);origin=await openWindowsAgentStartLedger(where.root,where.tools);const fixed=readInstalled(origin,local,where.root,fixedBinding),seal=requestDigest(fixed);let released=false;
  const guard=()=>{if(released||!same(layout(local),where)||requestDigest(readInstalled(origin!,local,where.root,fixedBinding))!==seal)fail();};
  const lease=Object.freeze({origin,root:where.root,binary:join(where.root,'codex.exe'),native_binary:join(where.root,'opencode.exe'),node_binary:join(where.root,'node.exe'),model:fixed.request.model,account_digest:fixed.request.account_digest,quota_account_digest:fixed.request.quota_account_digest,output_profile:fixed.request.output_profile,usage_policy:fixed.request.usage_policy,disabled_mcp_servers:freezeJson([...fixed.request.disabled_mcp_servers]),checks:freezeJson(catalog(copy(parseGatewayJson(bytesAt(join(where.root,'checks.json'),65536).toString('utf8'),65536)) as WorkspaceCheckTemplate[])),installation_digest:seal,guard,release(){if(!released){released=true;origin!.close();}}});
  writableScopes.set(lease,Object.freeze([where.root,where.tools]));return lease;
 }catch{origin?.close();return fail();}
}

export async function inspectCodexAgentRuntimeInstallation(local:LocalProject){
 const common={starts_run:false as const,provider_qualification_proven:false as const,costs_reconciled:false as const};let lease:InstalledCodexAgentRuntime|undefined;
 try{lease=await openInstalledCodexAgentRuntime(local);return lease?{...common,state:'installed' as const,model:lease.model,installation_digest:lease.installation_digest}:{...common,state:'missing' as const};}
 catch{return{...common,state:'unavailable' as const};}finally{lease?.release();}
}
