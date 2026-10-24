import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {requestDigest,type SkillInvocationVerifierPort} from '@cimiloop/kernel';
import {bytesAt,digest,parseGatewayJson,parseAgentWorkspaceToolScope,AgentStartLedger,type AgentWorkspaceToolScope,type FixedVolumeRuntimeStorage} from '@cimiloop/runtime-adapter';
import type {Project,AgentRunRecord} from '@cimiloop/protocol/v2';
import type {LocalProject} from './project.js';
import {LocalSkillMethodInputs} from './skill-methods-local.js';
import {LocalNamedSkillMethodAssessment,type NamedSkillMethodExecutionAdmission} from './skill-method-assessment-local.js';
import {LocalSkillInvocationStartCustody} from './skill-invocation-start-custody-local.js';
import {LocalSkillInvocationResultCollection} from './skill-invocation-result-local.js';
import {LocalSkillInvocationNativeComposition} from './skill-invocation-native-composition-local.js';
import {LocalSkillInvocationExecution,type SkillInvocationExecutionContext} from './skill-invocation-execution-local.js';
import {LocalAgentParentSkillCalls,type ParentSkillOriginalReader} from './agent-parent-skill-calls-local.js';
import {LocalAgentParentSkillHost} from './agent-parent-skill-host-local.js';
import {LocalAgentParentSkillCandidate} from './agent-parent-skill-candidate-local.js';
import {readOriginalAgentRunInputs} from './agent-workspace-tools-local.js';
import type {LocalAgentParentSkillResultPort} from './agent-parent-skill-results-local.js';
import type {LocalAgentStartCustody} from './agent-start-custody-local.js';
import type {LocalAgentCheckAdmission} from './agent-check-admission-local.js';
import type {LocalAgentModelAdmission} from './agent-model-admission-local.js';
import type {InstalledCodexUsageBudget} from './agent-codex-usage-budget-local.js';
import type {CodexRuntimeLoginHome} from './agent-codex-login-home-local.js';
import {LocalProjectError} from './errors.js';

type Catalog=Parameters<typeof LocalAgentParentSkillCalls.open>[0]['catalog'];
export interface AgentRuntimeSkillInstallation {
 methods:NamedSkillMethodExecutionAdmission;
 // Trusted launcher configuration; the model sees only the checked aliases.
 // This is a current Native source recipe, never a caller-provided input_ref.
 catalog(project:Project,record:AgentRunRecord):Catalog;
}
interface Options {
 local:LocalProject;origin:AgentStartLedger;installation:AgentRuntimeSkillInstallation;
 checks:LocalAgentCheckAdmission;custody:LocalAgentStartCustody;guard():void;
 context(runId:string):Context;
 model(scope:AgentWorkspaceToolScope):LocalAgentModelAdmission;
 verifyModel:NonNullable<LocalAgentStartCustody['checkModelAuthority']>;
 parentResults:LocalAgentParentSkillResultPort;
}
type Context=SkillInvocationExecutionContext&{kernel:Pick<LocalProject['kernel'],'execute'|'assessSkillInvocationExecution'>};
type Execution={account:InstalledCodexUsageBudget;storage:FixedVolumeRuntimeStorage;loginHome:CodexRuntimeLoginHome};
const fail=():never=>{throw new LocalProjectError('完整原 Skill 准入、当前源码目录或父宿主不可证明','CAPABILITY_UNAVAILABLE','conflict');};
function sync<T>(value:T):T{if(value!==null&&(typeof value==='object'||typeof value==='function')){let then:unknown;try{then=Reflect.get(value,'then');}catch{void Promise.resolve(value).catch(()=>{});fail();}if(typeof then==='function'){void Promise.resolve(value).catch(()=>{});fail();}}return value;}

// The same application owns preparation, current original qualification, the
// child's Native transport, Kernel observations and independent parent reads.
// No installation flag or imported ALLOW substitutes for the method originals.
export class LocalAgentRuntimeSkills {
 readonly custody:LocalSkillInvocationStartCustody;readonly inputs:LocalSkillMethodInputs;
 readonly port:SkillInvocationVerifierPort;
 readonly #assessor:LocalNamedSkillMethodAssessment;
 readonly #methods;readonly #catalog;readonly #originals;
 readonly #contexts=new Map<string,Context>();
 readonly #collectors=new Map<string,LocalSkillInvocationResultCollection>();
 readonly #parents=new Map<string,{scope:AgentWorkspaceToolScope;host:LocalAgentParentSkillHost;candidate:LocalAgentParentSkillCandidate;token:object;execution:boolean}>();
 #closed=false;
 constructor(private readonly options:Options){
  const installation=options.installation,methods=installation?.methods;
  if(!(options.origin instanceof AgentStartLedger)||typeof installation?.catalog!=='function'||typeof methods?.evidence!=='function'||typeof methods?.admitCurrent!=='function'||typeof methods?.originals?.verify!=='function')fail();
  this.#methods={source:methods,evidence:methods.evidence,admit:methods.admitCurrent,originals:methods.originals,verify:methods.originals.verify};this.#catalog=installation.catalog;
  this.custody=new LocalSkillInvocationStartCustody(options.local.location.repositoryPath,options.local.location.dataDirectory,options.origin);
  this.inputs=new LocalSkillMethodInputs(options.local.location.repositoryPath,options.local.location.dataDirectory);
  this.#assessor=new LocalNamedSkillMethodAssessment(options.local.location.repositoryPath,options.local.location.dataDirectory);
  this.#originals={verify:(...args:Parameters<NamedSkillMethodExecutionAdmission['originals']['verify']>)=>{this.guard();const result=sync(Reflect.apply(this.#methods.verify,this.#methods.originals,structuredClone(args)));this.guard();return structuredClone(result);}};
  const host:NamedSkillMethodExecutionAdmission={originals:this.#originals,evidence:(...args)=>this.evidence(...args),admitCurrent:(...args)=>{this.admit(...args);}};
  const prepare=this.inputs.invocationPreparer(id=>options.local.store.getProviderDescriptor(id),this.#assessor.qualificationVerifier(host));
  const port:SkillInvocationVerifierPort={
   prepare:(...args:Parameters<SkillInvocationVerifierPort['prepare']>)=>{this.guard();const result=this.custody.bindPreparation(...args,prepare(...args));this.guard();return result;},
   checkExecutionAuthority:(...args:Parameters<NonNullable<SkillInvocationVerifierPort['checkExecutionAuthority']>>)=>this.checkExecution(...args),
   verifyParentCandidate:(project,input,reader)=>{this.guard();const scope=readOriginalAgentRunInputs(this.options.local,input.record.run_id).scope,parent=this.#parents.get(scope.run_id);if(!parent||!same(parent.scope,scope)||!parent.execution)fail();const value=parent!.candidate.verifyParentCandidate(project,input,reader);this.guard();return value;},
   readResult:(project,invocation,reference)=>{this.guard();const value=this.collector(invocation.run_ref.id).readResult(project,invocation,reference);this.guard();return value;}
  };this.port=Object.freeze(port);
 }
 assertInstallation(){const {installation}=this.options,m=this.#methods;if(this.#closed||installation.catalog!==this.#catalog||installation.methods!==m.source||m.source.evidence!==m.evidence||m.source.admitCurrent!==m.admit||m.source.originals!==m.originals||m.originals.verify!==m.verify)fail();}
 guard(){this.assertInstallation();if(sync(this.options.guard())!==undefined)fail();this.assertInstallation();}
 release(){this.#closed=true;this.#parents.clear();this.#collectors.clear();this.#contexts.clear();}
 private context(runId:string){this.guard();let context=this.#contexts.get(runId);if(!context){if(this.#contexts.size>=1024)fail();context=this.options.context(runId);this.#contexts.set(runId,context);}return context;}
 private collector(runId:string){let collector=this.#collectors.get(runId);if(!collector){collector=new LocalSkillInvocationResultCollection({local:this.context(runId),custody:this.custody,inputs:this.inputs,qualificationOriginals:this.#originals});this.#collectors.set(runId,collector);}return collector;}
 private evidence(...args:Parameters<NamedSkillMethodExecutionAdmission['evidence']>){this.guard();const value=sync(Reflect.apply(this.#methods.evidence,this.#methods.source,structuredClone(args)));this.guard();return structuredClone(value);}
 private admit(...args:Parameters<NamedSkillMethodExecutionAdmission['admitCurrent']>){this.guard();if(sync(Reflect.apply(this.#methods.admit,this.#methods.source,structuredClone(args)))!==undefined)fail();this.guard();}
 private checkExecution(project:Parameters<NonNullable<SkillInvocationVerifierPort['checkExecutionAuthority']>>[0],input:Parameters<NonNullable<SkillInvocationVerifierPort['checkExecutionAuthority']>>[1]){
  this.guard();const descriptor=this.options.local.store.getProviderDescriptor(input.skill.descriptor_ref.id);if(!descriptor)fail();
  const plan=this.inputs.readInvocation(project,descriptor!,input.invocation),relation=this.custody.accountScope(project,input.invocation,input.request.parent,input.record.id);
  const qualificationInput={...input.invocation,method_qualification_ref:this.custody.originalQualification(project,input.invocation,input.request.parent,input.record.id)},qualification=this.#assessor.verifyHistoricalQualification(project,descriptor!,qualificationInput,this.#originals);
  this.admit(project,input.record,input.context,input.skill,descriptor!,plan,qualification.assessment);
  const {request,invocation:_,skill:__,...parent}=input;const validation=this.options.verifyModel(project,{...parent,request:request.parent});this.guard();
  const after=this.#assessor.verifyHistoricalQualification(project,descriptor!,{...input.invocation,method_qualification_ref:this.custody.originalQualification(project,input.invocation,input.request.parent,input.record.id)},this.#originals);
  if(!same(qualification,after)||!same(plan,this.inputs.readInvocation(project,descriptor!,input.invocation))||!same(relation,this.custody.accountScope(project,input.invocation,input.request.parent,input.record.id)))fail();
  this.admit(project,input.record,input.context,input.skill,descriptor!,plan,after.assessment);this.guard();
  return digest(JSON.stringify({format:'cimiloop/runtime-skill-current-admission/1.0.0',relation,qualification,validation,plan_digest:requestDigest(plan)}));
 }
 private saved(scope:AgentWorkspaceToolScope){
  const path=join(this.options.local.location.dataDirectory,'agent-parent-skill-call-originals',scope.project_id,scope.run_id,'header.json');if(!existsSync(path))return undefined;
  const value=structuredClone(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(bytesAt(path,65536)),65536)) as {format?:unknown;scope?:unknown;catalog?:Catalog};
  if(!value||Object.keys(value).sort().join(',')!=='catalog,format,scope'||value.format!=='cimiloop/agent-parent-skill-call-header/1.0.0'||!same(value.scope,scope)||!value.catalog)fail();return value.catalog;
 }
 forOriginal(raw:AgentWorkspaceToolScope,reader?:ParentSkillOriginalReader){this.guard();const scope=parseAgentWorkspaceToolScope(raw),existing=this.#parents.get(scope.run_id);if(existing){if(!same(existing.scope,scope))fail();return existing.host;}const catalog=this.saved(scope);return catalog?this.build(scope.run_id,catalog,undefined,reader):undefined;}
 parentForRun(runId:string,execution:Execution){
  try{this.guard();const original=readOriginalAgentRunInputs(this.options.local,runId),catalog=sync(Reflect.apply(this.#catalog,this.options.installation,structuredClone([original.project,original.record]))),saved=this.saved(original.scope);
  if(!catalog||catalog.format!=='cimiloop/agent-parent-skill-catalog/2.0.0'||saved&&!same(catalog,saved))fail();
  return this.build(runId,structuredClone(catalog),execution);}catch{fail();}
 }
 private build(runId:string,catalog:Catalog,execution?:Execution,reader?:ParentSkillOriginalReader){
  this.guard();if(this.#parents.size>=1024&&!this.#parents.has(runId))fail();const local=this.context(runId),scope=readOriginalAgentRunInputs(local,runId).scope,token={},modelAdmission=this.options.model(scope);
  if(catalog.format!=='cimiloop/agent-parent-skill-catalog/2.0.0')fail();
  const candidateOptions={local,runId,catalog,checks:this.options.checks,modelAdmission,startCustody:this.options.custody,parentResults:this.options.parentResults};
  const candidate=reader?LocalAgentParentSkillCandidate.openFromOriginalReader(candidateOptions,reader):LocalAgentParentSkillCandidate.open(candidateOptions);
  const guard=()=>{this.guard();const current=this.#parents.get(runId);if(!execution||!current||current.token!==token)fail();execution!.account.guard();this.guard();};
  const calls=LocalAgentParentSkillCalls.open({local,runId,catalog,candidates:candidate,beforeReservation:guard});
  if(execution){
   // Reject absent/stale named-method qualification before the parent can send
   // any model request. The later Kernel child gate also checks current scope.
   const project=this.options.local.store.getProject();if(!project)fail();
   for(const entry of catalog.entries){
    const binding=this.options.local.store.getProviderBinding(entry.skill_binding.binding_ref.id),descriptor=binding&&this.options.local.store.getProviderDescriptor(binding.descriptor_ref.id);if(!binding||!descriptor||requestDigest(binding)!==entry.skill_binding.digest.value)fail();
    const verified=this.inputs.packages.inspect(descriptor!),entryModule=verified.modules.find(module=>module.path===verified.package.spec.entry_path);if(entryModule?.name!==entry.method_name)fail();
    const reference=this.evidence(project!,descriptor!,entry.method_name),assessment=structuredClone(this.#assessor.evaluate(project!,descriptor!,reference,'controlled_execution',this.#originals));
    if(assessment.outcome!=='ALLOW'||assessment.purpose!=='review'||assessment.method_name!==entry.method_name||!same(assessment.runtime_binding,scope.runtime_binding))fail();
    if(!same(binding,this.options.local.store.getProviderBinding(binding!.id))||!same(descriptor,this.options.local.store.getProviderDescriptor(descriptor!.id))||!same(verified,this.inputs.packages.inspect(descriptor!))||!same(reference,this.evidence(project!,descriptor!,entry.method_name))||!same(assessment,structuredClone(this.#assessor.evaluate(project!,descriptor!,reference,'controlled_execution',this.#originals))))fail();this.guard();
   }
  }
  const child=execution?LocalSkillInvocationNativeComposition.openCodex({local,custody:this.custody,inputs:this.inputs,...execution}):undefined;
  const host=LocalAgentParentSkillHost.open({local,calls,beforeEffect:guard,results:this.collector(runId),execution:{start:async id=>{guard();if(!child)fail();const result=await new LocalSkillInvocationExecution(local,child).start(id);guard();return result;}}});
  this.#parents.set(runId,{scope,host,candidate,token,execution:!!execution});this.guard();return host;
 }
}
