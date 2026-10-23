import { isDeepStrictEqual as same } from 'node:util';
import { CimiLoopKernel, type KernelResult, type AgentRunAdmissionInput, type AgentRunToolAuthorityInput } from '@cimiloop/kernel';
import { AgentStartLedger, type WorkspaceCheckTemplate } from '@cimiloop/runtime-adapter';
import type { Project, Digest, AgentContextManifest } from '@cimiloop/protocol/v2';
import { parseVersionedCommand } from '@cimiloop/protocol';
import { installedRunVerifier, type LocalProject } from './project.js';
import { LocalAgentCheckAdmission } from './agent-check-admission-local.js';
import { LocalAgentStartCustody, type AgentStartFullCustodyPort } from './agent-start-custody-local.js';
import { LocalAgentModelAdmission } from './agent-model-admission-local.js';
import { LocalAgentRuntimeComposition } from './agent-runtime-composition-local.js';
import { LocalEvidenceVerifier } from './evidence-local.js';
import { LocalProviderVerifier } from './providers-local.js';
import { readOriginalAgentRunInputs } from './agent-workspace-tools-local.js';
import type { InstalledCodexUsageBudget } from './agent-codex-usage-budget-local.js';
import type { LocalAgentParentSkillHost } from './agent-parent-skill-host-local.js';
import { captureLocalAgentParentSkillResults } from './agent-parent-skill-results-local.js';
import { LocalProjectError } from './errors.js';
import { agentPreparationWorkItem, humanAgentPreparation } from './agent-human-preparation-local.js';

type Reference=AgentContextManifest['host_admission_ref'];
export interface AgentProductionCustodyPort extends AgentStartFullCustodyPort {
 verifyModel:NonNullable<AgentStartFullCustodyPort['verifyModel']>;
 verifyTool(project:Project,input:AgentRunToolAuthorityInput,original:Reference):Digest;
}
interface Options {origin:AgentStartLedger;nodeBinary:string;templates:WorkspaceCheckTemplate[];full:AgentProductionCustodyPort;guard?:()=>void}
const owners=new WeakMap<LocalProject['store'],object>();
const active=new WeakMap<LocalProject['store'],{local:LocalProject;lease:LocalAgentRuntimeAdmission}>();
const keys=['admitContext','checkRunAuthority','checkToolAuthority','checkModelAuthority'] as const;
const unavailable=()=>new LocalProjectError('完整原 Runtime 准入租约未安装、已释放或正被其他服务使用','CAPABILITY_UNAVAILABLE','conflict');
const inputs=(input:AgentRunAdmissionInput):AgentRunAdmissionInput=>({task:input.task,work_item:input.work_item,source:input.source,workspace:input.workspace,runtime_binding:input.runtime_binding,skill_bindings:input.skill_bindings});
function synchronous<T>(value:T):T{
 if(value!==null&&(typeof value==='object'||typeof value==='function')){
  let then:unknown;try{then=Reflect.get(value,'then');}catch{void Promise.resolve(value).catch(()=>{});throw unavailable();}
  if(typeof then==='function'){void Promise.resolve(value).catch(()=>{});throw unavailable();}
 }
 return value;
}

// Ordinary Human CLI/UI metadata entry. All other commands retain the original
// Kernel path, including an explicitly selected executor role.
export function executeHumanAgentRunCommand(local:LocalProject,raw:unknown):KernelResult{
 let command;try{command=parseVersionedCommand(raw);}catch{return local.kernel.execute(raw);}
 if(command.schema_version!=='2.0.0'||(command.command_type!=='PrepareRunContext'&&command.command_type!=='ReserveRun')||command.acting_role!=='technical_owner'||command.actor_id!==local.instance.actor_id||command.project_id!==local.instance.project_id||!['human_cli','human_ui'].includes(command.source.origin))return local.kernel.execute(raw);
 const item=agentPreparationWorkItem(local,command.command_type,'target' in command?command.target?.id:undefined,command.payload);
 if(!item||local.store.getActor(item.executor_ref.id)?.actor_type!=='agent')return local.kernel.execute(raw);
 const permission=local.kernel.authorizeAgentRunPreparation(item.id);if('code' in permission)return permission;
 const lease=LocalAgentRuntimeAdmission.current(local);if(!lease)throw new LocalProjectError('准备 Agent 运行需要安装完整 Runtime 准入宿主','CAPABILITY_UNAVAILABLE','conflict');
 return lease.executeHumanPreparation(command);
}

// Trusted host lifecycle only. The full independent port remains mandatory;
// neither a Codex login, check recipe nor caller JSON can create qualification.
// Borrowed Host/account objects and original Native operations survive release.
export class LocalAgentRuntimeAdmission {
 private constructor(readonly custody:LocalAgentStartCustody,readonly checks:LocalAgentCheckAdmission,private readonly assertCurrent:()=>void,private readonly close:()=>void,private readonly runtime:(runId:string,account:InstalledCodexUsageBudget,parent?:LocalAgentParentSkillHost)=>LocalAgentRuntimeComposition,private readonly prepare:(raw:unknown)=>KernelResult){Object.freeze(this);}
 guard(){this.assertCurrent();}
 release(){this.close();}
 executeHumanPreparation(raw:unknown){this.assertCurrent();return this.prepare(raw);}
 runtimeForRun(runId:string,account:InstalledCodexUsageBudget,parent?:LocalAgentParentSkillHost){this.assertCurrent();return this.runtime(runId,account,parent);}
 static current(local:LocalProject){const entry=active.get(local.store);if(!entry)return undefined;if(entry.local.kernel!==local.kernel||!same(entry.local.location,local.location)||!same(entry.local.instance,local.instance))throw unavailable();entry.lease.guard();return entry.lease;}
 static async open(local:LocalProject,raw:Options):Promise<LocalAgentRuntimeAdmission>{
  if(owners.has(local.store))throw unavailable();const verifier=installedRunVerifier(local);if(!verifier||!(raw.origin instanceof AgentStartLedger))throw unavailable();
  const owner={},store=local.store,kernel=local.kernel,location=structuredClone(local.location),instance=structuredClone(local.instance),agent=verifier.agent,full=raw.full,hostGuard=raw.guard,origin=raw.origin,nodeBinary=raw.nodeBinary,templates=structuredClone(raw.templates);
  const methods={admit:full?.admit,verifyLaunch:full?.verifyLaunch,verifyModel:full?.verifyModel,verifyTool:full?.verifyTool};
  if(Object.values(methods).some(method=>typeof method!=='function')||hostGuard!==undefined&&typeof hostGuard!=='function')throw unavailable();
  const prior=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(agent,key)]));let closed=false,installed=false,lease:LocalAgentRuntimeAdmission|undefined;
  const assigned:Partial<typeof agent>={};
  const installedSlots=new Map<typeof keys[number],PropertyDescriptor>();
  const guard=()=>{
   if(closed||owners.get(store)!==owner||local.store!==store||local.kernel!==kernel||!same(local.location,location)||!same(local.instance,instance)||installedRunVerifier(local)!==verifier||verifier.agent!==agent||Object.entries(methods).some(([key,method])=>Reflect.get(full,key)!==method))throw unavailable();
   if(hostGuard){const result:unknown=hostGuard();if(synchronous(result)!==undefined)throw unavailable();}
   if(local.store!==store||local.kernel!==kernel||!same(local.location,location)||!same(local.instance,instance)||installedRunVerifier(local)!==verifier||verifier.agent!==agent||owners.get(store)!==owner||Object.entries(methods).some(([key,method])=>Reflect.get(full,key)!==method))throw unavailable();
   for(const key of keys){const expected=installed?installedSlots.get(key):prior.get(key);if(!same(Object.getOwnPropertyDescriptor(agent,key),expected))throw unavailable();}
   origin.readExclusive('runtime_admission_guard','0'.repeat(64));
  };
  const invoke=<K extends keyof typeof methods>(key:K,...args:Parameters<AgentProductionCustodyPort[K]>):ReturnType<AgentProductionCustodyPort[K]>=>{
   guard();const result=synchronous(Reflect.apply(methods[key]!,full,structuredClone(args))) as ReturnType<AgentProductionCustodyPort[K]>;guard();return structuredClone(result);
  };
  const release=()=>{if(closed)return;closed=true;let conflict=false;
   for(const [key,owned] of installedSlots){if(!same(Object.getOwnPropertyDescriptor(agent,key),owned)){conflict=true;continue;}const descriptor=prior.get(key);try{if(descriptor)Object.defineProperty(agent,key,descriptor);else if(!Reflect.deleteProperty(agent,key))conflict=true;}catch{conflict=true;}}
   if(owners.get(store)===owner)owners.delete(store);else conflict=true;
   const current=active.get(store);if(current?.lease===lease)active.delete(store);else if(current)conflict=true;
   if(conflict)throw unavailable();
  };
  owners.set(store,owner);
  try{
   guard();const project=store.getProject();if(!project||project.id!==instance.project_id)throw unavailable();
   const checks=await LocalAgentCheckAdmission.open({repositoryPath:location.repositoryPath,dataDirectory:location.dataDirectory,nodeBinary,projectId:project.id,templates,custody:{admit:(p,input)=>invoke('admit',p,input),verify:(p,input,ref)=>invoke('verifyTool',p,input,ref)}});guard();
   const original=(p:Project,input:AgentRunAdmissionInput,ref:Reference)=>checks.read(p,inputs(input),ref).original_host_admission_ref;
   const custody=new LocalAgentStartCustody(location.repositoryPath,location.dataDirectory,origin,{admit:checks.admit.bind(checks),verifyLaunch:(p,input,ref)=>invoke('verifyLaunch',p,input,original(p,input,ref)),verifyModel:(p,input,ref)=>invoke('verifyModel',p,input,original(p,input,ref))});
   const modelAdmissions=new Map<string,LocalAgentModelAdmission>(),parentResults=captureLocalAgentParentSkillResults(local.agentParentSkillResults);
   Object.assign(assigned,{
    admitContext:(...args:Parameters<typeof custody.admit>)=>{guard();const result=custody.admit(...args);guard();return result;},
    checkRunAuthority:(...args:Parameters<typeof custody.checkRunAuthority>)=>{guard();const result=custody.checkRunAuthority(...args);guard();return result;},
    checkToolAuthority:(p:Project,input:AgentRunToolAuthorityInput)=>{guard();const result=checks.validateTool(p,input,custody);guard();return result;},
    checkModelAuthority:(...args:Parameters<LocalAgentModelAdmission['checkModelAuthority']>)=>{
     guard();const scope=args[1].request;let model=modelAdmissions.get(scope.run_id);
     if(!model){model=new LocalAgentModelAdmission(location.repositoryPath,location.dataDirectory,custody,checks,parentResults?reader=>{const result=parentResults(scope,reader);if(!result)throw unavailable();return result;}:undefined);modelAdmissions.set(scope.run_id,model);}
     const result=model.checkModelAuthority(...args);guard();return result;
    }
   } satisfies Partial<typeof agent>);
   guard();
   for(const key of keys){const descriptor=prior.get(key);if(descriptor? !('value' in descriptor)||!descriptor.writable:!Object.isExtensible(agent))throw unavailable();}
   for(const key of keys){const descriptor=prior.get(key);Object.defineProperty(agent,key,descriptor?{...descriptor,value:Reflect.get(assigned,key)}:{value:Reflect.get(assigned,key),writable:true,enumerable:true,configurable:true});installedSlots.set(key,Object.getOwnPropertyDescriptor(agent,key)!);}
   installed=true;guard();
   const runtime=(runId:string,account:InstalledCodexUsageBudget,parent?:LocalAgentParentSkillHost)=>{
    guard();account.guard();if(account.installation.origin.identityDigest!==origin.identityDigest||parent&&!parentResults)throw unavailable();checks.assertInstalledConfiguration(account.installation.node_binary,account.installation.checks);
    const identified=readOriginalAgentRunInputs(local,runId),caller={kind:'agent' as const,project_id:identified.project.id,actor_id:identified.actor.id,provider_identity_ref:structuredClone(identified.actor.provider_identity_ref)};
    const agentKernel=new CimiLoopKernel({store,caller,runVerifier:verifier,evidenceVerifier:new LocalEvidenceVerifier(location.repositoryPath,location.dataDirectory),providerVerifier:new LocalProviderVerifier(location.repositoryPath,location.dataDirectory)});
    const borrowed={...account,guard:()=>{guard();account.guard();guard();}};
    const result=LocalAgentRuntimeComposition.openCodex({local:{location:structuredClone(location),store,caller,kernel:agentKernel},runId,account:borrowed,custody,checks,...(parent?{parentSkill:parent}:{})});guard();return result;
   };
   lease=new LocalAgentRuntimeAdmission(custody,checks,guard,release,runtime,humanAgentPreparation(local,verifier,origin,guard));active.set(store,{local,lease});return lease;
  }catch(error){release();throw error;}
 }
}
