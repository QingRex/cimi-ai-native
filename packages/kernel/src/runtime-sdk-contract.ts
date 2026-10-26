import {compileValidator,DigestSchema,type Digest,type Project,type ProviderDescriptor,type ProviderEvidence,type RuntimeProbeResult} from '@cimiloop/protocol/v2';
import {contentDigest} from './intent.js';
export const runtimeSdkContractRule='runtime-sdk-contract/1.0.0';
export const runtimeSdkContractKeys=['real_edit','independent_review','model_account_identity'] as const;
export interface RuntimeSdkContractEvidence{format:'cimiloop/runtime-sdk-contract-evidence/1.0.0';project_id:string;descriptor_digest:Digest;evidence_digest:Digest;marker_digest:Digest;checks:Record<typeof runtimeSdkContractKeys[number],{result:'supports'|'refutes'|'inconclusive';basis_digest:Digest}>}
export interface RuntimeSdkContractEvidencePort{readRuntimeSdkContractEvidence(project:Project,descriptor:ProviderDescriptor,evidence:ProviderEvidence):RuntimeSdkContractEvidence}
export const hasRuntimeSdkContract=(probe:RuntimeProbeResult)=>probe.evidence_refs.some(ref=>ref.version===runtimeSdkContractRule);
const exact=(raw:unknown,keys:readonly string[]):raw is Record<string,unknown>=>!!raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).sort().join(',')===[...keys].sort().join(',');
function fail():never{throw Error('Original SDK Runtime contract unavailable or changed');}
const digest=compileValidator<Digest>(DigestSchema);
export function readRuntimeSdkContractEvidence(port:Partial<RuntimeSdkContractEvidencePort>,project:Project,descriptor:ProviderDescriptor,evidence:ProviderEvidence,probe:RuntimeProbeResult){
 const refs=probe.evidence_refs.filter(ref=>ref.version===runtimeSdkContractRule),method=port.readRuntimeSdkContractEvidence;if(refs.length!==1||!refs[0]?.digest||probe.model_operations.length||typeof method!=='function')fail();
 const value:unknown=method.call(port,structuredClone(project),structuredClone(descriptor),structuredClone(evidence));
 if(value&&typeof value==='object'&&'then'in value){if(value instanceof Promise)void Promise.prototype.then.call(value,undefined,()=>{});fail();}
 if(method!==port.readRuntimeSdkContractEvidence||!exact(value,['format','project_id','descriptor_digest','evidence_digest','marker_digest','checks'])||value.format!=='cimiloop/runtime-sdk-contract-evidence/1.0.0'||value.project_id!==project.id||digest(value.descriptor_digest).value!==contentDigest(descriptor).value||digest(value.evidence_digest).value!==contentDigest(evidence).value||digest(value.marker_digest).value!==refs[0].digest.value||!exact(value.checks,runtimeSdkContractKeys))fail();
 const result:Record<string,boolean|undefined>={};for(const key of runtimeSdkContractKeys){const check=value.checks[key];if(!exact(check,['result','basis_digest'])||typeof check.result!=='string'||!['supports','refutes','inconclusive'].includes(check.result))fail();digest(check.basis_digest);result[key]=check.result==='supports'?true:check.result==='refutes'?false:undefined;}
 return{basis:structuredClone(value) as unknown as RuntimeSdkContractEvidence,values:result};
}
