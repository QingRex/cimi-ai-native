import {describe,it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {pinBinary} from '../src/native.js';import {readRuntimeBinaryOriginal} from '../src/runtime-binary-originals.js';import {readOriginalAgentJobObservation} from '../src/agent-job-policy.js';
import * as adapter from '../src/index.js';
import {agentRuntimeClaimFormat} from '../src/agent-job-policy.js';
const api=adapter as unknown as {verifyAgentJobObservation:(basis:unknown,raw:unknown)=>unknown};
const owner={pid:100,creation_ticks:'123400',image:'C:\\host\\node.exe'},supervisor={pid:101,creation_ticks:'123401',image:'C:\\original\\sandbox.exe'},peer={pid:102,creation_ticks:'123402',image:'C:\\original\\opencode.exe'},observer={pid:103,creation_ticks:'123403',image:'C:\\original\\observer.exe'};
const nonce='019a1234-5678-7000-8000-000000000001',job='Local\\CimiLoop.AgentWorkspace.'+nonce.replaceAll('-','');
const policy={format:'cimiloop/agent-job-resource-policy/1.0.0',limit_flags:8712,active_process_limit:1,job_memory_limit_bytes:2147483648,process_memory_limit_bytes:0};
const basis={policy,owner,supervisor,peer,nonce,scope_digest:'a'.repeat(64),job_name:job,observer_path:observer.image,deadline_uptime_ms:100000};
const proof=()=>({format:'cimiloop/agent-job-observation/1.0.0',nonce,scope_digest:basis.scope_digest,owner,supervisor,peer,observer,job_name:job,limit_flags:8712,active_process_limit:1,job_memory_limit_bytes:2147483648,process_memory_limit_bytes:0,peer_in_job:true,sampled_uptime_ms:90000});
describe('independent original Agent Job OS observation',()=>{
 it('versions new interpreter startup claims explicitly while preserving old claim1/2 meaning',()=>{
  const input={job_resource_policy:policy,job_observer_original:{format:'cimiloop/runtime-binary-original-proof/1.0.0',path:observer.image,sha:'a'.repeat(64),bytes:10}};
  expect(agentRuntimeClaimFormat({...input,startup_profile:'bun_interpreter/1.0.0'})).toBe('cimiloop/agent-runtime-operation-claim/3.0.0');
  expect(agentRuntimeClaimFormat({...input,startup_profile:'bun_interpreter/1.0.0',writable_storage_profile:'private_state_only/1.0.0'})).toBe('cimiloop/agent-runtime-operation-claim/3.0.0');
  expect(()=>agentRuntimeClaimFormat({...input,writable_storage_profile:'private_state_only/1.0.0'})).toThrow();
  expect(()=>agentRuntimeClaimFormat({...input,startup_profile:'bun_interpreter/1.0.0',writable_storage_profile:'foreign'})).toThrow();
  expect(agentRuntimeClaimFormat(input)).toBe('cimiloop/agent-runtime-operation-claim/2.0.0');
  expect(agentRuntimeClaimFormat({})).toBe('cimiloop/agent-runtime-operation-claim/1.0.0');
  expect(()=>agentRuntimeClaimFormat({...input,startup_profile:'unrecorded ambient'})).toThrow();
  expect(()=>agentRuntimeClaimFormat({startup_profile:'bun_interpreter/1.0.0'})).toThrow();
 });
 it('reads strict historical JSON against the retained observer and immutable original roles',()=>{
  const root=mkdtempSync(join(tmpdir(),'cimiloop-job-reader-contract-'));try{
   const source=join(root,'constructed-observer.exe');writeFileSync(source,'constructed observer original');const pinned=pinBinary(root,source),original=readRuntimeBinaryOriginal(root,pinned.path,pinned.digest.value),operation=join(root,'operation');mkdirSync(operation);
   const raw={...proof(),observer:{...observer,image:pinned.path}},bytes=Buffer.from(JSON.stringify(raw));writeFileSync(join(operation,'agent-job-observation.json'),bytes);
   const input={job_resource_policy:policy,job_observer_original:original},config={owner,nonce,scope_digest:basis.scope_digest,deadline_uptime_ms:basis.deadline_uptime_ms},launch={supervisor},resources={runtime:peer,job_name:job};
   expect(readOriginalAgentJobObservation(root,operation,input,config,launch,resources)).toMatchObject({proof:raw,bytes,observer:original});
   writeFileSync(join(operation,'agent-job-observation.json'),'{"format":"first","format":"second"}');expect(()=>readOriginalAgentJobObservation(root,operation,input,config,launch,resources)).toThrow();
   expect(readOriginalAgentJobObservation(root,operation,{},config,launch,resources)).toBeNull();
  }finally{rmSync(root,{recursive:true});}
 });
 it('accepts the exact strict-parsed suspended Native basis without weakening original identity',()=>{
  const original=adapter.parseGatewayJson(JSON.stringify({supervisor,peer}),65536) as {supervisor:typeof supervisor;peer:typeof peer};
  expect(api.verifyAgentJobObservation({...basis,...original},proof())).toEqual(proof());
  expect(()=>api.verifyAgentJobObservation({...basis,...original},{...proof(),peer:{...peer,creation_ticks:'999999'}})).toThrow('agent_job_observation_unproven');
 });
 it('accepts one exact original Job observation with a frozen hard memory and process policy',()=>{expect(api.verifyAgentJobObservation(basis,proof())).toEqual(proof());});
 for(const [field,value] of [['limit_flags',8712|0x800],['active_process_limit',2],['job_memory_limit_bytes',4294967296],['process_memory_limit_bytes',1],['peer_in_job',false],['scope_digest','b'.repeat(64)],['job_name',job+'foreign'],['sampled_uptime_ms',100000]] as const)it('refuses changed '+field,()=>{expect(()=>api.verifyAgentJobObservation(basis,{...proof(),[field]:value})).toThrow('agent_job_observation_unproven');});
 for(const field of ['owner','supervisor','peer'] as const)it('refuses a substituted original '+field,()=>{expect(()=>api.verifyAgentJobObservation(basis,{...proof(),[field]:{...proof()[field],creation_ticks:'999999'}})).toThrow('agent_job_observation_unproven');});
 it('refuses an observer outside its retained binary original',()=>{expect(()=>api.verifyAgentJobObservation(basis,{...proof(),observer:{...observer,image:'C:\\foreign.exe'}})).toThrow('agent_job_observation_unproven');});
 it('refuses duplicate process roles and unknown fields',()=>{expect(()=>api.verifyAgentJobObservation(basis,{...proof(),observer:peer})).toThrow('agent_job_observation_unproven');expect(()=>api.verifyAgentJobObservation(basis,{...proof(),physical_disk_quota:true})).toThrow('agent_job_observation_unproven');});
 it('refuses a caller policy broadening even with agreeing observation',()=>{const p={...policy,job_memory_limit_bytes:4294967296};expect(()=>api.verifyAgentJobObservation({...basis,policy:p},{...proof(),job_memory_limit_bytes:4294967296})).toThrow('agent_job_observation_unproven');});
});
