import {join} from 'node:path';import {mkdirSync,readFileSync,writeFileSync,openSync,fsyncSync,closeSync,existsSync} from 'node:fs';
import {isDeepStrictEqual as same} from 'node:util';
import {parseCommand,SCHEMA_VERSION,isInternalId,type SkillInvocationObservation} from '@cimiloop/protocol/v2';
import {requestDigest} from '@cimiloop/kernel';
import {LocalSkillInvocationResultCollection} from './skill-invocation-result-local.js';
import {openLocalProject,executeLocalCommand,type LocalProject} from './project.js';import {LocalProjectError} from './errors.js';
export interface SkillReconciliationLease {collector:LocalSkillInvocationResultCollection;release():void|Promise<void>}
export type HumanSkillReconciliationFactory=(invocationId:string,local:LocalProject)=>SkillReconciliationLease|Promise<SkillReconciliationLease>;
interface Request {command_id:string;requested_at:string;acting_role:'technical_owner';command_type:'ReconcileSkillInvocation';target:{object_type:'run';id:string};expected_revision:number;payload:{invocation_ref:{object_type:'skill_invocation';id:string}}}
const fail=()=>new LocalProjectError('原 Skill 终态、方法资格及账单尚不可核对；保留原请求和预算','CAPABILITY_UNAVAILABLE','conflict');
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.sort().join(',');
export function parseHumanSkillReconciliation(raw:unknown,local:LocalProject):Request{
 if(!exact(raw,['command_id','requested_at','acting_role','command_type','target','expected_revision','payload'])||raw.command_type!=='ReconcileSkillInvocation'||raw.acting_role!=='technical_owner'||!exact(raw.target,['object_type','id'])||raw.target.object_type!=='run'||!exact(raw.payload,['invocation_ref'])||!exact(raw.payload.invocation_ref,['object_type','id'])||raw.payload.invocation_ref.object_type!=='skill_invocation')throw new LocalProjectError('仅支持原 Skill Human 核对请求','INVALID_COMMAND');
 try{const value=structuredClone(raw) as unknown as Request,hash='0'.repeat(64);parseCommand({...value,schema_version:SCHEMA_VERSION,correlation_id:value.command_id,project_id:local.instance.project_id,actor_id:local.instance.actor_id,source:{origin:'human_ui',producer:'cimiloop-workbench',repository_path:local.location.repositoryPath},payload:{...value.payload,raw_result_ref:{provider:'local_content',resource_type:'skill_invocation_report',locator:hash,digest:{algorithm:'sha256',value:hash}}}});return value as unknown as Request;}catch{throw new LocalProjectError('原 Skill 核对请求格式无效','INVALID_COMMAND');}
}
const read=(path:string)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(path))) as unknown;
const save=(path:string,value:unknown)=>{try{writeFileSync(path,JSON.stringify(value),{flag:'wx'});const fd=openSync(path,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='EEXIST'))throw error;}};
// Human commands and historical collectors only. No execution factory, agent
// caller, model/bill write, new invocation or qualification can be installed here.
export class LocalHumanSkillInvocationReconciliation {
 constructor(private readonly local:LocalProject,private readonly factory?:HumanSkillReconciliationFactory){}
 private original(request:Request){const {store,instance}=this.local,project=store.getProject(),actor=store.getActor(instance.actor_id),invocation=store.getRuntimeRecord('skill_invocation',request.payload.invocation_ref.id),run=store.getRun(request.target.id);
  if(!project||project.id!==instance.project_id||!actor||actor.actor_type!=='human'||actor.project_id!==project.id||!invocation||invocation.project_id!==project.id||invocation.run_ref.id!==run?.id||run.project_id!==project.id)throw fail();return {project_id:project.id,actor_id:actor.id,invocation_digest:requestDigest(invocation),invocation_id:invocation.id,run_id:run.id};
 }
 async reconcile(raw:unknown,beforeCommit:()=>void=()=>{}){
  let guardFailed=false,guardError:unknown;const authorize=()=>{try{const result:unknown=beforeCommit();if(result&&typeof result==='object'&&'then'in result){void Promise.resolve(result).catch(()=>undefined);throw Error('Synchronous reconciliation guard required');}}catch(error){guardFailed=true;guardError=error;throw error;}};
  const request=parseHumanSkillReconciliation(raw,this.local),original=this.original(request),identity=structuredClone(this.local.instance);
  if(![original.project_id,original.invocation_id,request.command_id].every(isInternalId))throw fail();
  const dir=join(this.local.location.dataDirectory,'skill-reconciliation-originals',original.project_id,original.invocation_id,request.command_id),intent={format:'cimiloop/human-skill-reconciliation-request/1.0.0',original,request};
  mkdirSync(dir,{recursive:true});const intentPath=join(dir,'intent.json');save(intentPath,intent);if(!same(read(intentPath),intent))throw new LocalProjectError('原 Skill 核对命令已用于不同输入','COMMAND_ID_REUSED','conflict');
  const preparedPath=join(dir,'prepared.json');
  const prepared=()=>{const p=read(preparedPath);if(!exact(p,['format','request_digest','raw_result_ref'])||p.format!=='cimiloop/human-skill-reconciliation-prepared/1.0.0'||p.request_digest!==requestDigest(intent))throw fail();return p.raw_result_ref as SkillInvocationObservation['raw_result_ref'];};
  const command=(ref:SkillInvocationObservation['raw_result_ref'])=>({...request,payload:{...request.payload,raw_result_ref:ref}});
  if(this.local.store.transaction(tx=>!!tx.getCommandReceipt(request.command_id))){if(!existsSync(preparedPath))throw fail();authorize();return executeLocalCommand(this.local,command(prepared()));}
  if(!this.factory)throw fail();let inner:LocalProject|undefined,release:(()=>void|Promise<void>)|undefined;
  try{
   const lease=await this.factory(original.invocation_id,this.local);if(typeof lease?.release!=='function')throw fail();release=lease.release.bind(lease);authorize();
   if(!(lease.collector instanceof LocalSkillInvocationResultCollection)||!same(identity,this.local.instance)||!same(this.original(request),original))throw fail();
   const collector=lease.collector;
   if(!existsSync(preparedPath)){const capture=collector.captureReconciliation(original.invocation_id,original.actor_id);
    if(capture.report.run_ref.id!==original.run_id||capture.report.invocation_ref.id!==original.invocation_id||capture.report.producer_actor_id!==original.actor_id)throw fail();
    save(preparedPath,{format:'cimiloop/human-skill-reconciliation-prepared/1.0.0',request_digest:requestDigest(intent),raw_result_ref:capture.reference});}
   inner=openLocalProject({projectDir:this.local.location.repositoryPath,skillInvocationResults:{readResult:collector.readResult.bind(collector)}});
   if(!same(identity,inner.instance)||!same(this.original(request),original))throw fail();authorize();return executeLocalCommand(inner,command(prepared()));
  }catch(error){if(guardFailed&&error===guardError)throw error;throw fail();}
  finally{inner?.store.close();if(release){try{await release();}catch{throw new LocalProjectError('原 Skill 核对账户释放尚待核对；保留原命令回执','CAPABILITY_UNAVAILABLE','conflict');}if(!same(identity,this.local.instance)||!same(this.original(request),original))throw fail();}}
 }
}
