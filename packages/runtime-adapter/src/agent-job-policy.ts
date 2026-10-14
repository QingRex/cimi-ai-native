import {isDeepStrictEqual as same} from 'node:util';
import {join} from 'node:path';
import {bytesAt,digest,RuntimeAdapterError} from './files.js';
import {validWorkspaceWorkerIdentity} from './workspace-files.js';
import type {CreditProcessIdentity} from './gateway-credit.js';
import {parseGatewayJson} from './gateway-conversation.js';
import {readRuntimeBinaryOriginal} from './runtime-binary-originals.js';
import {AGENT_RUNTIME_STARTUP_PROFILE} from './agent-runtime-startup.js';
// Prospective independent OS Job evidence. This does not prove disk quota,
// provider approval or historical resource custody and never changes a Job.
export const AGENT_JOB_RESOURCE_POLICY=Object.freeze({format:'cimiloop/agent-job-resource-policy/1.0.0' as const,limit_flags:0x2000|0x8|0x200,active_process_limit:1,job_memory_limit_bytes:2147483648,process_memory_limit_bytes:0});
export interface AgentJobObservationBasis {policy:unknown;owner:CreditProcessIdentity;supervisor:CreditProcessIdentity;peer:CreditProcessIdentity;nonce:string;scope_digest:string;job_name:string;observer_path:string;deadline_uptime_ms:number|null}
export interface AgentJobObservation {format:'cimiloop/agent-job-observation/1.0.0';nonce:string;scope_digest:string;owner:CreditProcessIdentity;supervisor:CreditProcessIdentity;peer:CreditProcessIdentity;observer:CreditProcessIdentity;job_name:string;limit_flags:number;active_process_limit:number;job_memory_limit_bytes:number;process_memory_limit_bytes:number;peer_in_job:true;sampled_uptime_ms:number}
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&same(Object.keys(value).sort(),[...keys].sort());
// Host-private compatibility gate: old readers reject claim2. No user DB or
// public schema upgrade, and no historical claim or evidence is rewritten.
export function agentRuntimeClaimFormat(input:unknown):'cimiloop/agent-runtime-operation-claim/1.0.0'|'cimiloop/agent-runtime-operation-claim/2.0.0'|'cimiloop/agent-runtime-operation-claim/3.0.0'{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new RuntimeAdapterError('agent_runtime_job_policy_unproven');
 const value=input as Record<string,unknown>,policy=Object.hasOwn(value,'job_resource_policy'),observer=Object.hasOwn(value,'job_observer_original');
 const startup=Object.hasOwn(value,'startup_profile');
 if(startup&&(value.startup_profile!==AGENT_RUNTIME_STARTUP_PROFILE||!policy||!observer))throw new RuntimeAdapterError('agent_runtime_startup_original_unproven');
 if(!policy&&!observer)return 'cimiloop/agent-runtime-operation-claim/1.0.0';
 const proof=value.job_observer_original as ReturnType<typeof readRuntimeBinaryOriginal>;
 if(!policy||!observer||!same(value.job_resource_policy,AGENT_JOB_RESOURCE_POLICY)||!proof||proof.format!=='cimiloop/runtime-binary-original-proof/1.0.0'||typeof proof.path!=='string'||!proof.path||!/^[a-f0-9]{64}$/.test(proof.sha)||!Number.isSafeInteger(proof.bytes)||proof.bytes<=0)throw new RuntimeAdapterError('agent_runtime_job_policy_unproven');
 return startup?'cimiloop/agent-runtime-operation-claim/3.0.0':'cimiloop/agent-runtime-operation-claim/2.0.0';
}
function fail():never{throw new RuntimeAdapterError('agent_job_observation_unproven');}
export function verifyAgentJobObservation(basis:AgentJobObservationBasis,raw:unknown):AgentJobObservation{
 // Strict suspended Native JSON carries null prototypes; preserve every field
 // while comparing its exact identity values with the independent OS reply.
 basis=structuredClone(basis);
 if(!same(basis.policy,AGENT_JOB_RESOURCE_POLICY)||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(basis.nonce)||! /^[a-f0-9]{64}$/.test(basis.scope_digest)||basis.job_name!=='Local\\CimiLoop.AgentWorkspace.'+basis.nonce.replaceAll('-','')||basis.deadline_uptime_ms!==null&&(!Number.isSafeInteger(basis.deadline_uptime_ms)||basis.deadline_uptime_ms<=0))fail();
 if(!exact(raw,['format','nonce','scope_digest','owner','supervisor','peer','observer','job_name','limit_flags','active_process_limit','job_memory_limit_bytes','process_memory_limit_bytes','peer_in_job','sampled_uptime_ms'])||raw.format!=='cimiloop/agent-job-observation/1.0.0'||raw.nonce!==basis.nonce||raw.scope_digest!==basis.scope_digest||raw.job_name!==basis.job_name||raw.peer_in_job!==true||!Number.isSafeInteger(raw.sampled_uptime_ms)||Number(raw.sampled_uptime_ms)<=0||basis.deadline_uptime_ms!==null&&Number(raw.sampled_uptime_ms)>=basis.deadline_uptime_ms)fail();
 for(const key of ['owner','supervisor','peer'] as const)if(!validWorkspaceWorkerIdentity(basis[key])||!same(raw[key],basis[key]))fail();
 if(!validWorkspaceWorkerIdentity(raw.observer)||raw.observer.image!==basis.observer_path||new Set([basis.owner.pid,basis.supervisor.pid,basis.peer.pid,raw.observer.pid]).size!==4)fail();
 for(const key of ['limit_flags','active_process_limit','job_memory_limit_bytes','process_memory_limit_bytes'] as const)if(raw[key]!==AGENT_JOB_RESOURCE_POLICY[key])fail();
 return structuredClone(raw) as unknown as AgentJobObservation;
}
export function readOriginalAgentJobObservation(root:string,operation:string,input:Record<string,unknown>,config:Record<string,unknown>,launch:Record<string,unknown>,resources:Record<string,unknown>){
 const policyPresent=Object.hasOwn(input,'job_resource_policy'),observerPresent=Object.hasOwn(input,'job_observer_original');
 if(!policyPresent&&!observerPresent)return null; // Exact historical meaning, no backfill.
 if(!policyPresent||!observerPresent||!same(input.job_resource_policy,AGENT_JOB_RESOURCE_POLICY))fail();
 const observer=input.job_observer_original as ReturnType<typeof readRuntimeBinaryOriginal>;
 if(!observer||!same(readRuntimeBinaryOriginal(root,observer.path,observer.sha),observer))fail();
 const bytes=bytesAt(join(operation,'agent-job-observation.json'),65536),proof=verifyAgentJobObservation({policy:input.job_resource_policy,owner:config.owner as CreditProcessIdentity,supervisor:launch.supervisor as CreditProcessIdentity,peer:resources.runtime as CreditProcessIdentity,nonce:String(config.nonce),scope_digest:String(config.scope_digest),job_name:String(resources.job_name),observer_path:observer.path,deadline_uptime_ms:config.deadline_uptime_ms as number|null},structuredClone(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes),65536)));
 return {proof,bytes,digest:digest(bytes),observer};
}
