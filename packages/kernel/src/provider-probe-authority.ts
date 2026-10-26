import type {ProjectReader} from '@cimiloop/store';
import type {DomainError,ProviderDescriptor,ProviderBinding} from '@cimiloop/protocol/v2';
import {callerMatchesActor,resolveAssignment,assignmentIsEffective,type CallerContext} from './authorization.js';
import {contentDigest} from './intent.js';
import {providerEvaluationStatus} from './provider-assessment.js';
type Failure={code:DomainError['code'];message:string;category:DomainError['category']};
const unavailable=():Failure=>({code:'CAPABILITY_UNAVAILABLE',message:'隔离方法需要当前候选 Skill、固定 Runtime 批准和只读固定材料边界',category:'conflict'});
export interface HumanPermission {ok:true;project_id:string;actor_id:string;assignment_id:string;assignment_revision:number}
export function providerProbeHuman(reader:ProjectReader,caller:CallerContext|undefined,now:string):Failure|HumanPermission{
 const project=reader.getProject(),actor=caller&&caller.kind==='local_operator'?reader.getActor(caller.actor_id):undefined;
 if(!project||!caller||caller.kind!=='local_operator'||!actor||!callerMatchesActor(caller,actor)||caller.project_id!==project.id)return{code:'CALLER_IDENTITY_MISMATCH',message:'隔离 Provider 操作需要当前项目 Human 本地身份',category:'forbidden'} satisfies Failure;
 const assignment=resolveAssignment(reader.listAssignments(actor.id),{projectId:project.id,actorId:actor.id,role:'project_owner',scope:{kind:'project',id:project.id},now});
 if(!assignment)return{code:'ROLE_NOT_ASSIGNED',message:'隔离 Provider 操作需要当前 Human 项目负责人指派',category:'forbidden'} satisfies Failure;
 return{ok:true as const,project_id:project.id,actor_id:actor.id,assignment_id:assignment.id,assignment_revision:assignment.revision};
}
// A fixed-material isolation request is not a Task/Run or production grant.
// Business execution still needs controlled qualification and its own Context.
export function namedSkillProbeAuthority(reader:ProjectReader,caller:CallerContext|undefined,now:string,descriptorId:string,runtimeId:string,purpose:string):Failure|(HumanPermission&{descriptor:ProviderDescriptor;runtime_binding:ProviderBinding;runtime_descriptor:ProviderDescriptor}){
 const human=providerProbeHuman(reader,caller,now);if('code'in human)return human;
 const project=reader.getProject()!,descriptor=reader.getProviderDescriptor(descriptorId),runtime=reader.getProviderBinding(runtimeId),runtimeDescriptor=runtime&&reader.getProviderDescriptor(runtime.descriptor_ref.id);
 if(!descriptor||descriptor.project_id!==project.id||descriptor.provider_kind!=='skill'||!runtime||runtime.project_id!==project.id||!runtimeDescriptor||runtimeDescriptor.project_id!==project.id||runtimeDescriptor.provider_kind!=='runtime'||
  runtime.capability.capability_id!=='runtime.execute'||contentDigest(runtimeDescriptor).value!==runtime.descriptor_digest.value||!runtime.approval||runtime.runtime_binding_ref||
  !['review','clarification'].includes(purpose)||!descriptor.capabilities.some(capability=>capability.capability_id===(purpose==='review'?'verification.review':'intent.clarify'))||
  descriptor.dependencies.length||Object.values(descriptor.required_permissions).some(values=>values.length))return unavailable();
 const evaluation=reader.getProviderEvaluation(runtime.approval.evaluation_ref.id),assignment=reader.listAssignments(runtime.producer_actor_id).find(value=>value.id===runtime.approval!.assignment_ref.id);
 if(!evaluation||providerEvaluationStatus(reader,runtimeDescriptor,evaluation).length||evaluation.input_digest.value!==runtime.approval.input_digest.value||
  contentDigest(evaluation.evidence_refs).value!==contentDigest(runtime.probe_evidence_refs).value||
  (runtime.approval.binding_scope==='isolated_provider_probe'?evaluation.profile!=='technical_contract':evaluation.profile!=='controlled_execution')||
  !assignment||assignment.project_id!==project.id||assignment.actor_id!==runtime.producer_actor_id||assignment.role_key!=='project_owner'||assignment.scope.kind!=='project'||assignment.scope.id!==project.id||
  reader.getActor(assignment.actor_id)?.actor_type!=='human'||!assignmentIsEffective(assignment,now)||Date.parse(assignment.created_at)>Date.parse(runtime.created_at))return unavailable();
 return{...human,descriptor,runtime_binding:runtime,runtime_descriptor:runtimeDescriptor};
}
