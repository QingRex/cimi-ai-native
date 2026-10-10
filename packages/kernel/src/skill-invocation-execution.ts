import { compileValidator, DigestSchema, InternalIdSchema, SkillInvocationSchema, type Digest, type SkillInvocation } from '@cimiloop/protocol/v2';
import type { ProjectReader } from '@cimiloop/store';
import type { CallerContext } from './authorization.js';
import { parseAgentRunLaunchRequest, type AgentRunLaunchAssessment } from './agent-run-launch.js';
import { originalAgentRunAuthority } from './agent-run-authority.js';
import { contentDigest } from './intent.js';
import { skillInvocationInputDigest, runSkillInvocationFacts } from './skill-invocation-facts.js';
import type { AgentRunLaunchRequest, AgentRunLaunchAuthorityInput, RunVerifierPort } from './runs.js';
export interface SkillInvocationExecutionRequest {
 parent: AgentRunLaunchRequest;
 invocation_ref: { object_type:'skill_invocation'; id:string };
 input_digest: Digest;
}
export type SkillInvocationExecutionAuthorityInput = Omit<AgentRunLaunchAuthorityInput,'request'> & {
 request: SkillInvocationExecutionRequest; invocation:SkillInvocation; skill:AgentRunLaunchAuthorityInput['runtime'];
};
export type SkillInvocationExecutionAssessment = Omit<AgentRunLaunchAssessment,'scope'|'request'|'authority'> & {
 scope:'skill_invocation_execution_assessment'; request:SkillInvocationExecutionRequest;
 authority:(NonNullable<AgentRunLaunchAssessment['authority']> & { invocation_id:string; invocation_key:string; input_digest:Digest }) | null;
};
const exact=(value:unknown,fields:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...fields].sort().join(',');
const same=(a:unknown,b:unknown)=>contentDigest(a).value===contentDigest(b).value;
export function parseSkillInvocationExecutionRequest(raw:unknown):SkillInvocationExecutionRequest {
 if(!exact(raw,['parent','invocation_ref','input_digest'])||!exact(raw.invocation_ref,['object_type','id'])||raw.invocation_ref.object_type!=='skill_invocation')throw Error('Invalid original child request');
 return { parent:parseAgentRunLaunchRequest(raw.parent),invocation_ref:{ object_type:'skill_invocation',id:compileValidator<string>(InternalIdSchema)(raw.invocation_ref.id) },input_digest:structuredClone(compileValidator<Digest>(DigestSchema)(raw.input_digest)) };
}
// Code-only authority for the exact fixed method. This is not a parent model,
// workspace tool or first-start grant. A host must independently prove its
// current original method/Native/SDK/model/account/budget/quota/recovery custody.
export function assessSkillInvocationExecution(reader:ProjectReader,request:SkillInvocationExecutionRequest,caller:CallerContext|undefined,now:string,host?:RunVerifierPort):Omit<SkillInvocationExecutionAssessment,'as_of_event_sequence'> {
 const base={schema_version:'2.0.0' as const,scope:'skill_invocation_execution_assessment' as const,request,assessed_at:now};
 const deny=(...reasons:string[])=>({...base,decision:'DENY' as const,authority:null,reasons:[...new Set(reasons)].slice(0,32)});
 const raw=reader.getRuntimeRecord('skill_invocation',request.invocation_ref.id);
 let invocation:SkillInvocation;
 try { invocation=structuredClone(compileValidator<SkillInvocation>(SkillInvocationSchema)(raw)); } catch { return deny('SKILL_INVOCATION_ORIGINAL_MISSING'); }
 if(!same(invocation.input_digest,request.input_digest)||!same(invocation.input_digest,skillInvocationInputDigest(invocation)))return deny('SKILL_INVOCATION_BINDING_MISMATCH');
 const run=reader.getRun(request.parent.run_id),facts=run&&runSkillInvocationFacts(reader,run),child=facts?.calls.find(call=>call.invocation.id===invocation.id);
 if(!child||child.state.settled||child.state.status==='Unknown'||!child.state.costKnown)return deny('SKILL_INVOCATION_NOT_ACTIVE');
 const original=originalAgentRunAuthority(reader,request.parent,caller,now,invocation);if(!original.facts)return deny(...original.reasons);
 const {project,record,context,task,item,source,workspace,runtime,skills}=original.facts;
 const selected=context.skill_bindings.find(pin=>same(pin,invocation.skill_binding)),skill=selected&&skills.find(value=>value.id===selected.binding_ref.id);
 if(!skill||!same(invocation.capability,skill.capability)||!same(invocation.input_schema_ref,skill.input_schema_ref)||!same(invocation.output_schema_ref,skill.output_schema_ref)||
 skill.capability.capability_id!==(invocation.request.input.purpose==='review'?'verification.review':'intent.clarify')||
 context.boundary==='agent_independent_read_only'&&invocation.request.input.purpose!=='review')return deny('SKILL_INVOCATION_BINDING_MISMATCH');
 if(Math.max(run!.cost_charged_micros,facts!.costMicros)>=record.reserved_cost_micros)return deny('SKILL_INVOCATION_BUDGET_EXHAUSTED');
 if(!host?.agent?.skills?.checkExecutionAuthority)return deny('SKILL_EXECUTION_HOST_UNAVAILABLE');
 let validation:Digest;
 const input={request,record,context,task,work_item:item,source,workspace,runtime_binding:request.parent.runtime_binding,skill_bindings:request.parent.skill_bindings,runtime,skills,invocation,skill};
 try {
  const proof:unknown=host.agent.skills.checkExecutionAuthority(structuredClone(project),structuredClone(input));
  if(proof&&typeof proof==='object'&&'then' in proof) { void Promise.resolve(proof).catch(()=>undefined); throw Error('Asynchronous proof unavailable'); }
  validation=structuredClone(compileValidator<Digest>(DigestSchema)(proof));
 }
 catch { return deny('SKILL_EXECUTION_HOST_PROOF_UNPROVEN'); }
 return {...base,decision:'ALLOW',reasons:[],authority:{change_id:task.change_id,task_id:task.id,work_item_id:item.id,run_record_id:record.id,context_id:context.id,
 host_admission_ref:structuredClone(record.host_admission_ref),host_validation_digest:validation,basis_digest:contentDigest({...input,host_validation_digest:validation}),
 invocation_id:invocation.id,invocation_key:invocation.invocation_key,input_digest:structuredClone(invocation.input_digest)}};
}
