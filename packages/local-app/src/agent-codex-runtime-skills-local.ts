import {isDeepStrictEqual as same} from 'node:util';
import {currentAgentSkillMethodProblems,requestDigest} from '@cimiloop/kernel';
import {compileValidator,NamedSkillMethodEvidenceSchema,type NamedSkillMethodEvidence,type NamedSkillMethodEvidenceReference,type ProviderBinding,type ProviderDescriptor,type Project} from '@cimiloop/protocol/v2';
import {digest,parseGatewayJson} from '@cimiloop/runtime-adapter';
import type {LocalProject} from './project.js';
import type {InstalledCodexUsageBudget} from './agent-codex-usage-budget-local.js';
import type {AgentRuntimeSkillInstallation} from './agent-runtime-skills-local.js';
import {LocalCodexNamedMethodOriginals} from './codex-named-method-originals-local.js';
import {LocalSkillMethodInputs} from './skill-methods-local.js';
import {readOriginalAgentRunInputs} from './agent-workspace-tools-local.js';
import {LocalProjectError} from './errors.js';

const hash=(value:unknown)=>({algorithm:'sha256' as const,value:requestDigest(value)});
const fail=():never=>{throw new LocalProjectError('当前原 Skill 目录、方法证据或账户准入不可核对','CAPABILITY_UNAVAILABLE','conflict');};
function text(value:string){if(!value.trim()||value.length>4000)throw new LocalProjectError('批准的 Skill 评审输入超出固定方法容量；请显式缩小 Task，不能截断验收要求','CAPABILITY_UNAVAILABLE','conflict');return value;}

// Concrete installed adapter: no imported ALLOW, arbitrary recipe callback or
// caller-selected evidence reference. Domain authority remains Kernel policy;
// model/quota/Native custody is still checked by the existing child runtime.
export function createCodexAgentRuntimeSkillInstallation(local:LocalProject,account:InstalledCodexUsageBudget):AgentRuntimeSkillInstallation {
 const store=local.store,location=structuredClone(local.location),kernel=local.kernel,installed=account.installation,guardMethod=account.guard,installationGuard=installed.guard;
 const guard=()=>{if(local.store!==store||local.kernel!==kernel||!same(local.location,location)||account.installation!==installed||account.guard!==guardMethod||installed.guard!==installationGuard)fail();
  for(const [owner,method] of [[account,guardMethod],[installed,installationGuard]] as const){const result:unknown=Reflect.apply(method,owner,[]);if(result!==undefined){void Promise.resolve(result).catch(()=>{});fail();}}
  if(local.store!==store||local.kernel!==kernel||!same(local.location,location)||account.installation!==installed||account.guard!==guardMethod||installed.guard!==installationGuard)fail();};
 guard();
 const inputs=new LocalSkillMethodInputs(location.repositoryPath,location.dataDirectory),originals=new LocalCodexNamedMethodOriginals(location.repositoryPath,location.dataDirectory,installed);
 const selected=new Map<string,{binding:ProviderBinding;runtime:NamedSkillMethodEvidence['runtime_binding']}>();
 const key=(descriptor:ProviderDescriptor,method:string)=>descriptor.id+'/'+method;
 const reference=(project:Project,descriptor:ProviderDescriptor,method:string,binding:ProviderBinding,runtime:NamedSkillMethodEvidence['runtime_binding']):NamedSkillMethodEvidenceReference=>{
  guard();if(!same(store.getProject(),project)||!same(store.getProviderDescriptor(descriptor.id),descriptor)||!same(store.getProviderBinding(binding.id),binding)||
   descriptor.project_id!==project.id||descriptor.provider_kind!=='skill'||binding.descriptor_ref.id!==descriptor.id||!same(binding.descriptor_digest,hash(descriptor))||
   binding.approval?.binding_scope!=='task_execution'||binding.runtime_binding_ref?.id!==runtime.binding_ref.id)fail();
  const refs:NamedSkillMethodEvidenceReference[]=[];
  for(const pin of binding.probe_evidence_refs){
   const evidence=store.getProviderEvidence(pin.id);if(!evidence||evidence.project_id!==project.id||evidence.purpose!=='skill_probe'||evidence.descriptor_ref.id!==descriptor.id||!same(evidence.descriptor_digest,hash(descriptor)))fail();
   const raw=structuredClone(compileValidator<NamedSkillMethodEvidence>(NamedSkillMethodEvidenceSchema)(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(inputs.packages.content.readContent(evidence!.raw_result_ref)),384*1024)));
   if(raw.method_name===method){if(raw.project_id!==project.id||raw.descriptor_ref.id!==descriptor.id||!same(raw.descriptor_digest,hash(descriptor))||!same(raw.runtime_binding,runtime)||raw.purpose!=='review'||raw.observed_at!==evidence!.observed_at||Date.parse(raw.observed_at)>Date.now())fail();refs.push({...evidence!.raw_result_ref,resource_type:'named_skill_method_evidence'});}
  }
  if(!refs.length||refs.some(ref=>!same(ref,refs[0])))fail();guard();return structuredClone(refs[0]!);
 };
 const methods:AgentRuntimeSkillInstallation['methods']={originals,
  evidence(project,descriptor,method){const current=selected.get(key(descriptor,method));if(!current)fail();return reference(project,descriptor,method,current!.binding,current!.runtime);},
  admitCurrent(project,record,context,binding,descriptor,plan,assessment){
   guard();const problems=currentAgentSkillMethodProblems(store,{project,record,context,binding,descriptor,request:{invocation_key:plan.request.invocation_key,method_name:plan.request.method_name,purpose:plan.request.input.purpose}},new Date().toISOString());
   if(problems.length||assessment.outcome!=='ALLOW'||assessment.profile!=='controlled_execution'||assessment.project_id!==project.id||
    !same(assessment.descriptor_digest,hash(descriptor))||assessment.descriptor_ref.id!==descriptor.id||!same(assessment.runtime_binding,record.runtime_binding)||
    assessment.method_name!==plan.request.method_name||assessment.purpose!==plan.request.input.purpose||
    !same(assessment.evidence_ref,reference(project,descriptor,plan.request.method_name,binding,record.runtime_binding))||
    !same(plan,inputs.read(project,descriptor,{invocation_key:plan.request.invocation_key,method_name:plan.request.method_name,input_ref:plan.input_ref})))fail();
   account.budget.assertAccount(installed);guard();
  }
 };
 return Object.freeze({methods:Object.freeze(methods),catalog(project,record){
  guard();const original=readOriginalAgentRunInputs(local,record.run_id);if(!same(original.project,project)||!same(original.record,record))fail();
  const definition=store.getExecutionRecord('task_definition',record.definition_ref.id),contract=store.getIntentRecord('contract_version',record.contract_ref.id),plan=store.getIntentRecord('plan_version',record.plan_ref.id);
  if(!definition||!contract||!plan||definition.task_id!==record.task_id||definition.body.task_id!==record.task_id||definition.version!==record.definition_ref.domain_version||
   !same(definition.content_digest,hash(definition.body))||!same(definition.plan_ref,record.plan_ref)||!same(plan.contract_ref,record.contract_ref)||
   contract.version!==record.contract_ref.domain_version||plan.version!==record.plan_ref.domain_version||[definition,contract,plan].some(value=>value.project_id!==project.id||value.change_id!==record.change_id))fail();
  const body=definition!.body,criteria=contract!.body.acceptance_criteria.filter(value=>body.verification.acceptance_keys.includes(value.key));
  if(criteria.length!==new Set(body.verification.acceptance_keys).size)fail();
  const recipe={format:'cimiloop/original-run-candidate/1.0.0' as const,goal:text(body.goal),
   spec:text(JSON.stringify({contract_ref:record.contract_ref,goal:contract!.body.goal,scope:contract!.body.scope,non_goals:contract!.body.non_goals,acceptance_criteria:criteria,outputs:body.outputs,allowed_changes:body.allowed_changes})),
   standards:text(JSON.stringify({constraints:contract!.body.constraints,method:body.verification.method,evidence_requirements:body.verification.evidence_requirements})),
   required_check_ids:installed.checks.map(check=>check.check_id)};
  if(!recipe.required_check_ids.length||recipe.required_check_ids.length>16||new Set(recipe.required_check_ids).size!==recipe.required_check_ids.length)fail();
  const entries=record.skill_bindings.map((pin,index)=>{
   const binding=store.getProviderBinding(pin.binding_ref.id),descriptor=binding&&store.getProviderDescriptor(binding.descriptor_ref.id);
   if(!binding||!descriptor||!same(pin.digest,hash(binding))||binding.capability.capability_id!=='verification.review')fail();
   const verified=inputs.packages.inspect(descriptor!),method=verified.modules.find(module=>module.path===verified.package.spec.entry_path)?.name;if(!method)fail();
   if(currentAgentSkillMethodProblems(store,{project,record,context:original.context,binding:binding!,descriptor:descriptor!,request:{invocation_key:'catalog:'+record.run_id,method_name:method!,purpose:'review'}},new Date().toISOString()).length)fail();
   const current=selected.get(key(descriptor!,method!)),value={binding:binding!,runtime:record.runtime_binding};if(current&&!same(current,value))fail();selected.set(key(descriptor!,method!),structuredClone(value));
   return{skill_alias:'review_'+(index+1),method_name:method!,input_alias:'current',skill_binding:structuredClone(pin),input_recipe:structuredClone(recipe)};
  });
  if(!entries.length||entries.length>64)fail();const bodyCatalog={format:'cimiloop/agent-parent-skill-catalog/2.0.0' as const,scope_digest:digest(JSON.stringify(original.scope)).value,entries};guard();return{...bodyCatalog,catalog_digest:digest(JSON.stringify(bodyCatalog)).value};
 }} satisfies AgentRuntimeSkillInstallation);
}
