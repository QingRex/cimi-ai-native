import { existsSync, openSync, closeSync, fsyncSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parseCommand, compileValidator, RawAgentRunObservationSchema, SCHEMA_VERSION, isInternalId,
  type RawAgentRunObservation, type Project, type AgentRunRecord, type AgentContextManifest } from "@cimiloop/protocol/v2";
import { DedicatedAgentAccountLedger, readOriginalDedicatedAgentRunCosts, verifyCollectedDedicatedAgentModelOriginals, verifyCollectedAgentRuntimeInterruption, verifyOriginalTaskExecutionResult, collectAgentRuntimeOperation, readAgentRuntimeOriginalIdentity, agentWorkspaceIpcScopeDigest, bytesAt, directory, digest, parseGatewayJson, type OriginalTaskDomainBasis } from "@cimiloop/runtime-adapter";
import { LocalEvidenceVerifier, type ContentReference } from "./evidence-local.js";
import { executeLocalCommand, type LocalCommandInput } from "./project.js";
import { readHumanOriginalAgentRunInputs, type AgentRuntimeControlContext } from "./agent-runtime-control-local.js";
import { LocalProjectError } from "./errors.js";
import {classifyOriginalAgentExecutionFailure,type OriginalAgentExecutionFailure} from "./agent-runtime-failure-local.js";

// Original Unknown, independently pinned historical Task outputs and negative
// execution facts and independently authenticated original cash bills. Cash
// recording alone proves no execution terminal or Task acceptance.
// Native collection is a trusted code port; JSON/HTTP cannot install it.
export interface AgentRuntimeObservationPort { collect: typeof collectAgentRuntimeOperation }
type Original = ReturnType<typeof readHumanOriginalAgentRunInputs>;
type Identity = ReturnType<typeof readAgentRuntimeOriginalIdentity>;
type Request = Omit<LocalCommandInput,"command_type"|"payload"> & { command_type:"RecordRunObservation"; target:{object_type:"run";id:string}; payload:Record<string,never> };
interface Intent { format:"cimiloop/agent-unknown-observation-request/1.0.0"|"cimiloop/agent-billed-observation-request/1.0.0"; project_id:string; actor_id:string; request:Request;
  scope:Original["scope"]; context_id:string; record_digest:string; context_digest:string }
interface Proof { format:"cimiloop/agent-unknown-observation-proof/1.0.0"|"cimiloop/agent-failed-observation-proof/1.0.0"|"cimiloop/agent-billed-observation-proof/1.0.0"; execution_failure?:OriginalAgentExecutionFailure; intent:Intent; original:Identity; observed_at:string;
  cost_evidence?:ReturnType<typeof readOriginalDedicatedAgentRunCosts>; execution_result_ref?:RawAgentRunObservation["result_proof_ref"]; collection_ref:RawAgentRunObservation["result_proof_ref"]; completion_proven:false; costs_reconciled:boolean }
interface Prepared { format:"cimiloop/agent-unknown-observation-prepared/1.0.0"|"cimiloop/agent-billed-observation-prepared/1.0.0";
  raw_result_ref:Extract<ContentReference,{resource_type:"agent_run"}>; proof_ref:RawAgentRunObservation["result_proof_ref"] }
// IPC journal: 128 exchanges * four artifacts, header, ten Runtime files,
// optional fixed-check catalog. Match the collector's actual bounded history.
const MAX_ORIGINAL_ARTIFACTS=128*4+1+10+1;
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).sort().join(",")===keys.sort().join(",");
// The strict parser uses null-prototype objects. Normalize only after parsing
// (including duplicate/dangerous-key checks) for persisted value comparisons.
const parsed=(bytes:Buffer)=>structuredClone(parseGatewayJson(new TextDecoder("utf-8",{fatal:true}).decode(bytes),8*1024*1024));
const read=(path:string)=>parsed(bytesAt(path,8*1024*1024));
const saveOnce=(path:string,value:unknown)=>{try{writeFileSync(path,JSON.stringify(value),{flag:"wx"});const fd=openSync(path,"r+");try{fsyncSync(fd);}finally{closeSync(fd);}}
 catch(error){if(!(error&&typeof error==="object"&&"code" in error&&error.code==="EEXIST"))throw error;}};
const pathFor=(root:string,projectId:string,runId:string,commandId:string)=>{
 if(![projectId,runId,commandId].every(isInternalId))throw Error("Invalid original observation identity");
 return join(root,"agent-runtime-observations",projectId,runId,commandId);
};
export const parseLocalAgentObservationRequest=(input:unknown,local:AgentRuntimeControlContext):Request=>{
 if(!exact(input,["command_id","requested_at","acting_role","command_type","target","expected_revision","payload"])||input.command_type!=="RecordRunObservation"||
 !exact(input.payload,[])||!exact(input.target,["object_type","id"])||input.target.object_type!=="run")throw new LocalProjectError("仅支持原Run的待核对观测请求","INVALID_COMMAND");
 try { const value=structuredClone(input), hash="0".repeat(64);
 parseCommand({...value,schema_version:SCHEMA_VERSION,correlation_id:value.command_id,project_id:local.instance.project_id,actor_id:local.instance.actor_id,
 source:{origin:"human_ui",producer:"cimiloop-workbench",repository_path:local.location.repositoryPath},payload:{raw_result_ref:{provider:"local_content",resource_type:"agent_run",locator:hash,digest:{algorithm:"sha256",value:hash}}}});
 return value as unknown as Request;
 }catch{throw new LocalProjectError("原观测请求格式无效","INVALID_COMMAND");}
};
const intentFor=(local:AgentRuntimeControlContext,request:Request,original:Original,billed=false):Intent=>({format:billed?"cimiloop/agent-billed-observation-request/1.0.0":"cimiloop/agent-unknown-observation-request/1.0.0",project_id:original.project.id,
 actor_id:local.instance.actor_id,request,scope:original.scope,context_id:original.context.id,record_digest:digest(JSON.stringify(original.record)).value,context_digest:digest(JSON.stringify(original.context)).value});
const reportFor=(proof:Proof,reference:RawAgentRunObservation["result_proof_ref"]):RawAgentRunObservation=>({format:"cimiloop/agent-run/1.0.0",run_id:proof.intent.scope.run_id,
 operation_key:proof.intent.scope.operation_key,producer_actor_id:proof.intent.actor_id,observed_at:proof.observed_at,input_digest:proof.intent.scope.context_digest,
 context_ref:{object_type:"context_manifest",id:proof.intent.context_id},runtime_binding:proof.intent.scope.runtime_binding,
 skill_bindings:proof.intent.scope.skill_bindings,host_admission_ref:proof.intent.scope.host_admission_ref,result_proof_ref:reference,
 basis:"direct_observation",status:proof.format==="cimiloop/agent-failed-observation-proof/1.0.0"?"failed":"unknown",usage:proof.cost_evidence?{cost_known:true,cost_micros:proof.cost_evidence.costs.cash_charged_micros,currency:proof.cost_evidence.costs.currency!}:{cost_known:false},method:proof.cost_evidence?"Original model requests and authenticated account bills reverified; execution settlement unproven":proof.format==="cimiloop/agent-failed-observation-proof/1.0.0"?"Original Native negative execution: "+proof.execution_failure:proof.execution_result_ref?"Original SDK task output and Native effects reverified; model/account and billing unproven":"Original Runtime collection; completion and billing unproven",
 observation:proof.cost_evidence?"原模型请求已与账户原占用及认证账单逐笔核对；只记录核定现金用量，执行终态与预算结清继续待核对，不满足任务或返还未启动次数。":proof.format==="cimiloop/agent-failed-observation-proof/1.0.0"?"原Native证明本次执行失败；模型账户、费用与原未决调用继续待核对，不结清预算或满足任务。":proof.execution_result_ref?"原SDK结构化Task产物与独立Native账本已对应核验；真实模型账户、账单与Task验收仍待证明，不结清费用或满足任务。":"原操作采集已保存并核对归属；终态、真实模型账户及费用仍待核对。停止或资源处置不代表任务完成。",resolves_observation_refs:[]});
const validateCollection=(root:string,identity:Identity,value:unknown)=>{
 if(!exact(value,["format","scope_digest","status","artifacts","missing","ipc","native","domain_observation_produced","formal_agent_execution_enabled","synthetic_model_responses",...(value&&typeof value==="object"&&"model" in value?["model"]:[]),...(value&&typeof value==="object"&&"interruption" in value?["interruption"]:[]),...(value&&typeof value==="object"&&"dedicated_model" in value?["dedicated_model"]:[])])||
 value.format!=="cimiloop/agent-runtime-originals/1.0.0"||value.scope_digest!==agentWorkspaceIpcScopeDigest(identity.scope)||(value.synthetic_model_responses!==true&&value.synthetic_model_responses!==null)||
 value.formal_agent_execution_enabled!==false||value.domain_observation_produced!==false||!value.status||typeof value.status!=="object"||
 !("operation" in value.status)||value.status.operation!==identity.operation||!Array.isArray(value.artifacts)||value.artifacts.length>MAX_ORIGINAL_ARTIFACTS+(value.synthetic_model_responses===null?64*3+2:0)+(value&&typeof value==="object"&&"dedicated_model" in value?64*10+3:0))throw Error("Original collection mismatch");
 const names=new Set<string>();
 for(const artifact of value.artifacts){if(!exact(artifact,["name","reference"])||typeof artifact.name!=="string"||names.has(artifact.name)||!exact(artifact.reference,["provider","resource_type","locator","digest","version"])||
 artifact.reference.provider!=="cimiloop-runtime-probe"||artifact.reference.resource_type!=="agent_runtime_original_bytes"||artifact.reference.version!==artifact.name||
 !exact(artifact.reference.digest,["algorithm","value"])||artifact.reference.digest.algorithm!=="sha256"||typeof artifact.reference.digest.value!=="string"||
 !/^[a-f0-9]{64}$/.test(artifact.reference.digest.value)||artifact.reference.locator!==join(resolve(root),"blobs",artifact.reference.digest.value)||
 digest(bytesAt(artifact.reference.locator,4*1024*1024)).value!==artifact.reference.digest.value)throw Error("Original collection bytes unproven");names.add(artifact.name);}
 verifyCollectedDedicatedAgentModelOriginals(root,identity.scope,value as unknown as Parameters<typeof verifyCollectedDedicatedAgentModelOriginals>[2]);
 verifyCollectedAgentRuntimeInterruption({scope_digest:agentWorkspaceIpcScopeDigest(identity.scope),owner:identity.claim.owner,operation:identity.operation,input:identity.input},value as unknown as Parameters<typeof verifyCollectedAgentRuntimeInterruption>[1]);
};

export class LocalAgentRunResultVerifier {
 private readonly content:LocalEvidenceVerifier;
 constructor(private readonly repositoryPath:string,private readonly dataDirectory:string,private readonly accountForRun?:(runId:string)=>DedicatedAgentAccountLedger){this.content=new LocalEvidenceVerifier(repositoryPath,dataDirectory);}
 readRunResult(project:Project,record:AgentRunRecord,context:AgentContextManifest,reference:Prepared["raw_result_ref"],domain:OriginalTaskDomainBasis):RawAgentRunObservation {
  if(resolve(project.repository_path)!==resolve(this.repositoryPath))throw Error("Original result project mismatch");
  const report=compileValidator<RawAgentRunObservation>(RawAgentRunObservationSchema)(parsed(this.content.readContent(reference)));
  const proof=readProof(this.content,report.result_proof_ref),intent=proof.intent;
  if(project.id!==intent.project_id||record.project_id!==project.id||context.project_id!==project.id||record.run_id!==intent.scope.run_id||record.context_ref.id!==context.id||
    digest(JSON.stringify(record)).value!==intent.record_digest||digest(JSON.stringify(context)).value!==intent.context_digest||
    !isDeepStrictEqual(proof.original,readAgentRuntimeOriginalIdentity(this.dataDirectory,intent.scope))||!isDeepStrictEqual(report,reportFor(proof,report.result_proof_ref)))throw Error("Original result proof mismatch");
  const prepared=read(join(pathFor(this.dataDirectory,project.id,record.run_id,intent.request.command_id),"prepared.json")) as Prepared;
  if(!isDeepStrictEqual(prepared.raw_result_ref,reference)||!isDeepStrictEqual(prepared.proof_ref,report.result_proof_ref)||
    !isDeepStrictEqual(read(join(pathFor(this.dataDirectory,project.id,record.run_id,intent.request.command_id),"request.json")),intent))throw Error("Original prepared result mismatch");
  const collection=parsed(this.content.readContent(proof.collection_ref));
  validateCollection(this.dataDirectory,proof.original,collection);
  if(proof.cost_evidence){if(!this.accountForRun||proof.intent.format!=="cimiloop/agent-billed-observation-request/1.0.0"||!isDeepStrictEqual(proof.cost_evidence,readOriginalDedicatedAgentRunCosts(this.dataDirectory,intent.scope,this.accountForRun(record.run_id))))throw Error("Original bill/model costs unproven");}
  if(proof.execution_result_ref){const verified=verifyOriginalTaskExecutionResult(this.dataDirectory,project,record,context,proof.original,collection as Awaited<ReturnType<typeof collectAgentRuntimeOperation>>,domain);
    if(!verified||!isDeepStrictEqual(parsed(this.content.readContent(proof.execution_result_ref)),verified))throw Error("Original task execution result unproven");}
  if(proof.format==="cimiloop/agent-failed-observation-proof/1.0.0"&&classifyOriginalAgentExecutionFailure(proof.original,collection as Awaited<ReturnType<typeof collectAgentRuntimeOperation>>)!==proof.execution_failure)throw Error("Original failed execution unproven");
  return report;
 }
}
function readProof(content:LocalEvidenceVerifier,reference:RawAgentRunObservation["result_proof_ref"]):Proof {
 const value=parsed(content.readContent(reference));
 if(value&&typeof value==='object'&&'format' in value&&value.format==='cimiloop/agent-billed-observation-proof/1.0.0'){
  const billed=value as Record<string,unknown>;
  if(!exact(billed,['format','intent','original','observed_at','collection_ref','completion_proven','costs_reconciled','cost_evidence',...('execution_failure' in billed?['execution_failure']:[]),...('execution_result_ref' in billed?['execution_result_ref']:[])])||billed.completion_proven!==false||billed.costs_reconciled!==true||typeof billed.observed_at!=='string'||!billed.cost_evidence)throw Error('Original cost proof unavailable');return billed as unknown as Proof;
 }
 const failed=value&&typeof value==="object"&&"format" in value&&value.format==="cimiloop/agent-failed-observation-proof/1.0.0";
 if(!exact(value,["format","intent","original","observed_at","collection_ref","completion_proven","costs_reconciled",...(failed?["execution_failure"]:[]),...(value&&typeof value==="object"&&"execution_result_ref" in value?["execution_result_ref"]:[])])||!failed&&value.format!=="cimiloop/agent-unknown-observation-proof/1.0.0"||failed&&!["agent_original_task_deadline","agent_original_runtime_exit_failed"].includes(String(value.execution_failure))||
 value.completion_proven!==false||value.costs_reconciled!==false||typeof value.observed_at!=="string")throw Error("Original Unknown proof unavailable");return value as unknown as Proof;
}

export class LocalAgentRuntimeObservation {
 private readonly content:LocalEvidenceVerifier;
 constructor(private readonly local:AgentRuntimeControlContext,private readonly port:AgentRuntimeObservationPort={collect:collectAgentRuntimeOperation}){
 this.content=new LocalEvidenceVerifier(local.location.repositoryPath,local.location.dataDirectory);}
 async record(raw:unknown){return this.recordOriginal(raw,false);}
 async recordCosts(raw:unknown,account?:DedicatedAgentAccountLedger){return this.recordOriginal(raw,true,account);}
 private async recordOriginal(raw:unknown,billed:boolean,account?:DedicatedAgentAccountLedger){
  const request=parseLocalAgentObservationRequest(raw,this.local),original=readHumanOriginalAgentRunInputs(this.local,request.target.id),intent=intentFor(this.local,request,original,billed);
  const location=pathFor(this.local.location.dataDirectory,original.project.id,original.run.id,request.command_id),requestPath=join(location,"request.json"),preparedPath=join(location,"prepared.json");
  directory(location);saveOnce(requestPath,intent);
  let saved:unknown;try{saved=read(requestPath);}catch{throw new LocalProjectError("原观测准备登记缺失或损坏，请保留原请求核对","EVIDENCE_MISSING","storage");}
  if(!isDeepStrictEqual(saved,intent))throw new LocalProjectError("同Command ID的原观测输入已改变","COMMAND_ID_REUSED","conflict");
  if(!existsSync(preparedPath)){
   try{
    const identity=readAgentRuntimeOriginalIdentity(this.local.location.dataDirectory,original.scope),collection=await this.port.collect(this.local.location.dataDirectory,original.scope,{project:original.project,record:original.record});
    const fresh=readHumanOriginalAgentRunInputs(this.local,original.run.id);
    if(!isDeepStrictEqual(intentFor(this.local,request,fresh,billed),intent)||!isDeepStrictEqual(identity,readAgentRuntimeOriginalIdentity(this.local.location.dataDirectory,original.scope)))throw Error("Original observation inputs changed");
    validateCollection(this.local.location.dataDirectory,identity,collection);
    const failure=classifyOriginalAgentExecutionFailure(identity,collection);
    // Query the immutable versions named by the original Run, never current
    // Change pins or mutable Task usage. HTTP/model input cannot supply them.
    const definition=this.local.kernel.getObject("task_definition",original.record.definition_ref.id),
      contract=this.local.kernel.getObject("contract_version",original.record.contract_ref.id),plan=this.local.kernel.getObject("plan_version",original.record.plan_ref.id);
    const domain="code" in definition||"code" in contract||"code" in plan?undefined:
      {definition:definition.object,contract:contract.object,plan:plan.object} as OriginalTaskDomainBasis;
    const execution=failure?null:verifyOriginalTaskExecutionResult(this.local.location.dataDirectory,original.project,original.record,original.context,identity,collection,domain);
    const cost_evidence=billed&&account?readOriginalDedicatedAgentRunCosts(this.local.location.dataDirectory,original.scope,account):undefined;
    if(billed&&(!cost_evidence||cost_evidence.costs.currency!==original.record.cost_currency))throw Error('Original cost currency/account unproven');
    const proof:Proof={format:billed?"cimiloop/agent-billed-observation-proof/1.0.0":failure?"cimiloop/agent-failed-observation-proof/1.0.0":"cimiloop/agent-unknown-observation-proof/1.0.0",...(failure?{execution_failure:failure}:{}),...(cost_evidence?{cost_evidence}:{}),intent,original:identity,observed_at:new Date().toISOString(),
      collection_ref:this.content.storeContent(Buffer.from(JSON.stringify(collection)),"agent_run_proof"),
      ...(execution?{execution_result_ref:this.content.storeContent(Buffer.from(JSON.stringify(execution)),"agent_run_proof")}:{}),completion_proven:false,costs_reconciled:billed};
    const proof_ref=this.content.storeContent(Buffer.from(JSON.stringify(proof)),"agent_run_proof"),raw_result_ref=this.content.storeContent(Buffer.from(JSON.stringify(reportFor(proof,proof_ref))),"agent_run");
    saveOnce(preparedPath,{format:billed?"cimiloop/agent-billed-observation-prepared/1.0.0":"cimiloop/agent-unknown-observation-prepared/1.0.0",raw_result_ref,proof_ref});
   }catch{throw new LocalProjectError("原操作观测尚未形成可核对资料；保留原请求与预算","CAPABILITY_UNAVAILABLE","conflict");}
  }
  let prepared:Prepared;
  try{const value=read(preparedPath);if(!exact(value,["format","raw_result_ref","proof_ref"])||value.format!==(billed?"cimiloop/agent-billed-observation-prepared/1.0.0":"cimiloop/agent-unknown-observation-prepared/1.0.0"))throw Error("Prepared result mismatch");prepared=value as unknown as Prepared;}
  catch{throw new LocalProjectError("原观测准备结果损坏；保留原请求核对","EVIDENCE_MISSING","storage");}
  // On an exact retry Kernel may return its prior immutable receipt even if
  // later Native files are gone. Never recollect or regenerate the report.
  return executeLocalCommand(this.local,{...request,payload:{raw_result_ref:prepared.raw_result_ref}});
 }
}
