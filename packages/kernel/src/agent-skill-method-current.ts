import type {ProjectReader} from '@cimiloop/store';
import type {AgentContextManifest,AgentRunRecord,Project,ProviderBinding,ProviderDescriptor} from '@cimiloop/protocol/v2';
import {contentDigest} from './intent.js';
import {originalAgentRunAuthority} from './agent-run-authority.js';
import {runSkillInvocationFacts} from './skill-invocation-facts.js';

export interface CurrentAgentSkillMethodInput {
 project:Project;record:AgentRunRecord;context:AgentContextManifest;binding:ProviderBinding;descriptor:ProviderDescriptor;
 request:{invocation_key:string;method_name:string;purpose:string};
}
const same=(a:unknown,b:unknown)=>a!==undefined&&b!==undefined&&contentDigest(a).value===contentDigest(b).value;
// Shared Kernel policy for the synchronous installed method host. This is only
// the current domain intersection, never qualification or execution authority.
// A Writer may supply its own reader: do not open a nested snapshot/transaction.
export function currentAgentSkillMethodProblems(reader:ProjectReader,input:CurrentAgentSkillMethodInput,now:string):string[]{
 const {project,record,context,binding,descriptor,request}=input;
 if(!same(reader.getProject(),project)||!same(reader.getRuntimeRecord('run_record',record.id),record)||
  context.id!==record.context_ref.id||!same(reader.getRuntimeRecord('context_manifest',context.id),context)||!same(reader.getProviderBinding(binding.id),binding)||
  !same(reader.getProviderDescriptor(descriptor.id),descriptor)||binding.descriptor_ref.id!==descriptor.id||
  !same(binding.descriptor_digest,contentDigest(descriptor))||descriptor.provider_kind!=='skill'||
  !/^[A-Za-z0-9_-]{1,64}$/.test(request.method_name)||!request.invocation_key)return['SKILL_METHOD_ORIGINAL_MISMATCH'];
 const scope={project_id:project.id,run_id:record.run_id,operation_key:record.operation_key,executor_actor_id:record.executor_ref.id,
  context_digest:record.input_digest,runtime_binding:record.runtime_binding,skill_bindings:record.skill_bindings,host_admission_ref:record.host_admission_ref};
 const actor=reader.getActor(record.executor_ref.id),run=reader.getRun(record.run_id);
 if(!actor||actor.actor_type!=='agent'||!run)return['SKILL_METHOD_ORIGINAL_MISMATCH'];
 const facts=runSkillInvocationFacts(reader,run),known=facts.calls.find(call=>call.invocation.invocation_key===request.invocation_key);
 if(known&&(known.state.settled||known.state.status==='Unknown'||!known.state.costKnown))return['SKILL_INVOCATION_NOT_ACTIVE'];
 const child=known?.invocation;
 if(child&&(child.request.method_name!==request.method_name||child.request.input.purpose!==request.purpose||
  child.skill_binding.binding_ref.id!==binding.id))return['SKILL_METHOD_ORIGINAL_MISMATCH'];
 const original=originalAgentRunAuthority(reader,scope,{kind:'agent',project_id:project.id,actor_id:actor.id,provider_identity_ref:actor.provider_identity_ref},now,child);
 if(!original.facts)return original.reasons;
 if(!context.skill_bindings.some(pin=>pin.binding_ref.id===binding.id&&same(pin.digest,contentDigest(binding)))||
  binding.capability.capability_id!==(request.purpose==='review'?'verification.review':request.purpose==='clarification'?'intent.clarify':'')||
  context.boundary==='agent_independent_read_only'&&request.purpose!=='review')return['SKILL_METHOD_BINDING_MISMATCH'];
 if(Math.max(run.cost_charged_micros,facts.costMicros)>=record.reserved_cost_micros)return['SKILL_INVOCATION_BUDGET_EXHAUSTED'];
 return[];
}
