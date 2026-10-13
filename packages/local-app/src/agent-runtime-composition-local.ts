import { AGENT_PARENT_SKILL_TOOLS, captureAgentParentSkillIpcPort, type AgentParentSkillIpcPort, originalTaskResultContract, runOpenCodeWorkspaceRuntime, withinAgentRuntimeTaskBudget, parseAgentModelOriginalEvidence, AgentRuntimeModelHost, type AgentRuntimeModelPort, createDedicatedAgentRuntimeModel, type DedicatedAgentAccountPort, type DedicatedModelConnection } from "@cimiloop/runtime-adapter";
import { LocalAgentRuntimeStart, type AgentRuntimeLaunchInputs, type AgentRuntimeStartContext, type AgentRuntimeStartPort } from "./agent-runtime-start-local.js";
import { LocalAgentWorkspaceToolService, type AgentWorkspaceToolLocalContext } from "./agent-workspace-tools-local.js";
import { LocalAgentStartCustody } from "./agent-start-custody-local.js";
import { LocalAgentCheckAdmission } from "./agent-check-admission-local.js";
import { openLocalAgentRunBudget } from "./agent-run-budget-local.js";
import { originalAgentWorkspaceScope } from "./agent-workspace-tools-local.js";
import { LocalProjectError } from "./errors.js";
import {DedicatedAgentAccountLedger} from '@cimiloop/runtime-adapter';
import {LocalAgentDedicatedAccount,type AgentDedicatedModelContext} from './agent-dedicated-account-local.js';

import {LocalAgentParentSkillHost} from './agent-parent-skill-host-local.js';
import {isDeepStrictEqual as same} from 'node:util';
const unavailable=()=>new LocalProjectError("原 Runtime 应用身份或父 Skill 目录不可证明","CAPABILITY_UNAVAILABLE","conflict");

interface Options {
 local:AgentRuntimeStartContext & AgentWorkspaceToolLocalContext;
 binary:string; custody:LocalAgentStartCustody; checks:LocalAgentCheckAdmission;
 model:AgentRuntimeModelPort;
 parentSkill?:LocalAgentParentSkillHost;
}
// Shared trusted application composition. Human HTTP/CLI cannot choose callers,
// model ports, custody, binaries or check recipes. Missing approvals must make
// model.check fail; no fall-through to constructed model replies exists here.
export class LocalAgentRuntimeComposition implements AgentRuntimeStartPort {
 readonly custody:LocalAgentStartCustody;
 private readonly identity:{location:Options['local']['location'];caller:Options['local']['caller'];store:Options['local']['store'];kernel:Options['local']['kernel']};
 private constructor(private readonly options:Options){this.custody=options.custody;this.identity={location:structuredClone(options.local.location),caller:structuredClone(options.local.caller),store:options.local.store,kernel:options.local.kernel};}
 private assertIdentity(){const local=this.options.local;if(local.store!==this.identity.store||local.kernel!==this.identity.kernel||!same(local.location,this.identity.location)||!same(local.caller,this.identity.caller))throw unavailable();}
 static open(options:Options){
  if(!(options.custody instanceof LocalAgentStartCustody)||!(options.checks instanceof LocalAgentCheckAdmission)||typeof options.model?.check!=="function"||typeof options.model?.execute!=="function"||options.parentSkill!==undefined&&!(options.parentSkill instanceof LocalAgentParentSkillHost))
   throw new LocalProjectError("完整原 Runtime、检查及模型账户准入尚未安装","CAPABILITY_UNAVAILABLE","conflict");
  let originalEvidence;try{originalEvidence=parseAgentModelOriginalEvidence(options.model.original_evidence);}catch{throw new LocalProjectError("原模型证据固定身份无效","CAPABILITY_UNAVAILABLE","conflict");}
  return new LocalAgentRuntimeComposition({...options,model:{...(originalEvidence?{original_evidence:originalEvidence}:{}),admission_digest:options.model.admission_digest,check:options.model.check.bind(options.model),execute:options.model.execute.bind(options.model)}});
 }
 static openDedicated(options:Omit<Options,"model"> & {runId:string;connection:DedicatedModelConnection;account:DedicatedAgentAccountPort}){
  if(options.parentSkill!==undefined&&!(options.parentSkill instanceof LocalAgentParentSkillHost))throw unavailable();
  const scope=originalAgentWorkspaceScope(options.local,options.runId);
  if(options.parentSkill)captureAgentParentSkillIpcPort(scope,options.parentSkill).assertScope(scope);
  const model=createDedicatedAgentRuntimeModel({root:options.local.location.dataDirectory,repositoryPath:options.local.location.repositoryPath,scope,connection:options.connection,account:options.account,...(options.parentSkill?{parentSkillTools:"fixed_parent_skill/1.0.0" as const}:{})});
  return this.open({local:options.local,binary:options.binary,custody:options.custody,checks:options.checks,model,...(options.parentSkill?{parentSkill:options.parentSkill}:{})});
 }
 static openDedicatedPersistent(options:Omit<Options,"model"> & {local:AgentDedicatedModelContext;runId:string;connection:DedicatedModelConnection;account:DedicatedAgentAccountLedger}){
  return this.openDedicated({...options,account:LocalAgentDedicatedAccount.open(options.local,options.runId,options.account).modelAccountPort()});
 }
 originalScope(runId:string){this.assertIdentity();return structuredClone(originalAgentWorkspaceScope(this.options.local,runId));}
 start(runId:string,beforeLaunch?:()=>void){
  if(!beforeLaunch)return new LocalAgentRuntimeStart(this.options.local,this).start(runId);
  const guarded:AgentRuntimeStartPort={custody:this.custody,prepare:async input=>{
   beforeLaunch();const staged=await this.prepare(input,beforeLaunch);
   try{beforeLaunch();}catch(error){await staged.dispose();throw error;}
   return {launch:async()=>{beforeLaunch();await staged.launch();},dispose:()=>staged.dispose()};
  }};
  return new LocalAgentRuntimeStart(this.options.local,guarded).start(runId);
 }
 async prepare(input:AgentRuntimeLaunchInputs,beforeNativeEffect?:()=>void){
  // Detach the Kernel-assembled packet before any await. This application owns
  // identity/custody; parent catalog capture grants no child effect authority.
  this.assertIdentity();input=structuredClone(input);
  if(!same(this.originalScope(input.record.run_id),input.scope))throw unavailable();
  const parent=this.options.parentSkill?captureAgentParentSkillIpcPort(input.scope,this.options.parentSkill):undefined;
  const guard=(signal?:AbortSignal)=>{signal?.throwIfAborted();this.assertIdentity();if(!same(this.originalScope(input.record.run_id),input.scope))throw unavailable();parent?.assertScope(input.scope);signal?.throwIfAborted();};
  const installedParent:AgentParentSkillIpcPort|undefined=parent?Object.freeze({get sdkCatalog(){guard();return parent.catalog;},invoke:parent.invoke}):undefined;
  guard();const budget=await openLocalAgentRunBudget(this.options.local,input.record.run_id);
  try {
  guard();budget.assertScope(input.scope);
  return await withinAgentRuntimeTaskBudget(budget,async signal=>{
  guard(signal);await this.options.model.check(structuredClone(input.scope));guard(signal);
  const service=await LocalAgentWorkspaceToolService.open(this.options.local,input.record.run_id);
  try {
   guard(signal);await service.installAdmittedChecks(this.options.checks,this.custody);guard(signal);
   const catalog=await service.getCheckCatalog();guard(signal);
   if(this.custody.inspectOriginal(input.project,input.record,input.context,input.scope).state === "claimed")throw new LocalProjectError("原 Run 已有启动，保留原模型账本","CAPABILITY_UNAVAILABLE","conflict");

   // Frozen domain packet, not a caller-supplied freeform command/prompt. The
   // original dispatch material_digest protects every source object in this packet.
   guard(signal);const prompt=JSON.stringify({format:parent?"cimiloop/agent-runtime-task-packet/3.0.0":"cimiloop/agent-runtime-task-packet/2.0.0",...(parent?{parent_skill_catalog:parent.catalog}:{}),operation_key:input.scope.operation_key,context_digest:input.scope.context_digest,
    task:input.task,work_item:input.work_item,definition:input.definition,contract:input.contract,plan:input.plan,context:input.context,check_catalog:catalog,
    result_contract:originalTaskResultContract(input.scope,input.record.definition_ref,input.definition.body.outputs,catalog.recipes.map(recipe=>recipe.check_id))},null,1);
   if(Buffer.byteLength(prompt)>32768||Buffer.byteLength(JSON.stringify({prompt}))>48000||prompt.split(/\r?\n/).length>1000||prompt.split(/\r?\n/).some(line=>Buffer.byteLength(line)>1800))throw new LocalProjectError("原任务资料超出当前 Runtime 输入容量；保留原 Run","CAPABILITY_UNAVAILABLE","conflict");
   const model=await AgentRuntimeModelHost.initialize(this.options.local.location.dataDirectory,input.scope,this.options.model,parent?[...AGENT_PARENT_SKILL_TOOLS]:["cimi_read","cimi_replace","cimi_check"],prompt,signal);
   guard(signal);
   return {launch:async()=>{
    guard();
    await runOpenCodeWorkspaceRuntime({root:this.options.local.location.dataDirectory,binary:this.options.binary,scope:input.scope,prompt,model,runBudget:budget,checkCatalog:catalog,...(installedParent?{parentSkill:installedParent}:{}),beforeNativeEffect:()=>{guard();if(beforeNativeEffect){const result:unknown=beforeNativeEffect();if(result!==undefined){if(result instanceof Promise)void Promise.prototype.then.call(result,undefined,()=>{});throw unavailable();}}guard();},
     connect:(supervisor,originalSupervisor,peer,nonce,signal,originalModel,originalParent)=>{
      guard(signal);if(installedParent?(originalParent===undefined||!same(originalParent.sdkCatalog,installedParent.sdkCatalog)):originalParent!==undefined)throw unavailable();
      return service.openIpc(supervisor,originalSupervisor,peer,{nonce,signal,model:originalModel,runBudget:budget,...(originalParent?{parentSkill:originalParent}:{})});
     }});
   },dispose:async()=>{try{await service.close();}finally{await budget.close();}}};
  } catch(error){await service.close();throw error;}
  },staged=>staged.dispose());
  }catch(error){await budget.close();throw error;}
 }
}
