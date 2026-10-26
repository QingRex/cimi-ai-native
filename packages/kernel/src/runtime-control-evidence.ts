import {compileValidator,DigestSchema,type Digest,type Project,type ProviderDescriptor,type ProviderEvidence,type ProviderEvaluation} from '@cimiloop/protocol/v2';
import {contentDigest} from './intent.js';

export const runtimeControlKeys=['network_host_limits','cost_accounting_and_cap','disk_limit','crash_recovery'] as const;
export type RuntimeControlKey=typeof runtimeControlKeys[number];
export interface RuntimeControlEvidence {
 format:'cimiloop/runtime-control-evidence/1.0.0';
 project_id:string;
 descriptor_digest:Digest;
 evidence_digest:Digest;
 checks:Record<RuntimeControlKey,{result:'supports'|'refutes'|'inconclusive';basis_digest?:Digest}>;
}
export interface RuntimeControlEvidencePort {
 // Trusted host IO, not a command payload or an imported report. The host must
 // independently re-read the original enforcement/account/quota/recovery
 // sources and bind each determinate result to its complete immutable basis.
 readRuntimeControlEvidence(project:Project,descriptor:ProviderDescriptor,evidence:ProviderEvidence[]):RuntimeControlEvidence;
}
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const fail=():never=>{throw Error('Independent Runtime control evidence unavailable or changed');};
const digest=compileValidator<Digest>(DigestSchema);
function synchronous(value:unknown){
 if(value!==null&&(typeof value==='object'||typeof value==='function')){
  let then:unknown;try{then=Reflect.get(value,'then');}catch{void Promise.resolve(value).catch(()=>{});return fail();}
  if(typeof then==='function'){void Promise.resolve(value).catch(()=>{});return fail();}
 }
 return structuredClone(value);
}
export function readRuntimeControlEvidence(port:Partial<RuntimeControlEvidencePort>,project:Project,descriptor:ProviderDescriptor,evidence:ProviderEvidence[]){
 const method=port.readRuntimeControlEvidence;if(typeof method!=='function')return fail();
 const raw=synchronous(method.call(port,structuredClone(project),structuredClone(descriptor),structuredClone(evidence)));
 if(method!==port.readRuntimeControlEvidence||!exact(raw,['format','project_id','descriptor_digest','evidence_digest','checks'])||raw.format!=='cimiloop/runtime-control-evidence/1.0.0'||raw.project_id!==project.id||descriptor.provider_kind!=='runtime'||
  digest(raw.descriptor_digest).value!==contentDigest(descriptor).value||
  digest(raw.evidence_digest).value!==contentDigest(evidence.map(e=>({id:e.id,digest:contentDigest(e)}))).value||!exact(raw.checks,runtimeControlKeys))return fail();
 const checks:ProviderEvaluation['assessments']=[];
 for(const key of runtimeControlKeys){
  const value=raw.checks[key];
  if(!value||typeof value!=='object'||!('result'in value)||typeof value.result!=='string'||!['supports','refutes','inconclusive'].includes(value.result))return fail();
  const hasBasis=Object.hasOwn(value,'basis_digest');
  if(!exact(value,hasBasis?['result','basis_digest']:['result'])||value.result!=='inconclusive'&&!hasBasis)return fail();
  if(hasBasis)digest(Reflect.get(value,'basis_digest'));
  checks.push({key,result:value.result as 'supports'|'refutes'|'inconclusive',evidence_refs:hasBasis?evidence.map(e=>({object_type:'evidence',id:e.id})):[]});
 }
 return{basis:raw as unknown as RuntimeControlEvidence,checks};
}
