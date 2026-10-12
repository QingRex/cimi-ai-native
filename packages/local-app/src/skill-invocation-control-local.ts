import {join} from 'node:path';import {isDeepStrictEqual as same} from 'node:util';
import {queryAgentRuntimeOperation,collectAgentRuntimeOperation,requestAgentRuntimeCancellation,recoverAgentRuntimeOperation} from '@cimiloop/runtime-adapter';
import {readHumanOriginalAgentRunInputs,type AgentRuntimeControlPort} from './agent-runtime-control-local.js';
import {readOriginalSkillInvocationMetadataFromReader} from './skill-invocation-execution-local.js';
import {LocalSkillInvocationStartCustody} from './skill-invocation-start-custody-local.js';
import {executeLocalCommand,type LocalProject} from './project.js';import {LocalProjectError} from './errors.js';
export interface SkillRuntimeControlLease {custody:LocalSkillInvocationStartCustody;release():void|Promise<void>}
// Trusted original custody only. No staging/launch/model/account factory exists.
export type HumanSkillRuntimeFactory=(invocationId:string,local:LocalProject)=>SkillRuntimeControlLease|Promise<SkillRuntimeControlLease>;
const defaults:AgentRuntimeControlPort={query:queryAgentRuntimeOperation,collect:collectAgentRuntimeOperation,requestCancellation:requestAgentRuntimeCancellation,recover:recoverAgentRuntimeOperation};
type Operation={outcome:'observed';result:unknown}|{outcome:'unknown';reason:'skill_original_operation_unavailable'};
const unavailable=():Operation=>({outcome:'unknown',reason:'skill_original_operation_unavailable'});
function synchronous(guard:()=>void){const value:unknown=guard();if(value!==undefined){if(value instanceof Promise)void value.catch(()=>{});throw new LocalProjectError('控制 guard 须同步完成','CAPABILITY_UNAVAILABLE','conflict');}}
const fail=()=>new LocalProjectError('原 Skill 身份或宿主登记不可核对','CAPABILITY_UNAVAILABLE','conflict');
// Kernel owns all business mutations. Resource observations never generate a
// domain result, a bill, a new Run or an implicit never-started proof.
export class LocalHumanSkillInvocationControl {
 constructor(private readonly local:LocalProject,private readonly factory?:HumanSkillRuntimeFactory,private readonly port:AgentRuntimeControlPort=defaults){}
 private original(id:string){
  const original=this.local.store.readSnapshot(reader=>readOriginalSkillInvocationMetadataFromReader(this.local,reader,id)).value;
  const human=readHumanOriginalAgentRunInputs(this.local,original.invocation.run_ref.id);
  if(!same(human.scope,original.request.parent))throw fail();return original;
 }
 private async operate(id:string,kind:'query'|'collect'|'cancel'|'recover',beforeEffect:()=>void){
  let guardError:unknown,guardFailed=false;
  const authorize=()=>{try{synchronous(beforeEffect);}catch(error){guardError=error;guardFailed=true;throw error;}};
  authorize();const original=this.original(id),identity=structuredClone(this.local.instance),location=structuredClone(this.local.location),physical=kind==='cancel'||kind==='recover';
  const fresh=()=>{authorize();if(!same(identity,this.local.instance)||!same(location,this.local.location)||!same(this.original(id),original))throw new LocalProjectError('原 Skill 固定关系已变化','INPUT_CHANGED','conflict');
   if(physical){const permission=this.local.kernel.authorizeAgentRunControl(original.invocation.run_ref.id);if('code'in permission)throw permission;
    if(!this.local.store.getRun(original.invocation.run_ref.id)?.cancel_requested)throw new LocalProjectError('须先由 Kernel 记录原父 Run 取消','RECOVERY_CONDITIONS_UNMET','conflict');}
  };
  fresh();let release:(()=>void|Promise<void>)|undefined,operation:Operation=unavailable();
  try{
   if(this.factory){const lease=await this.factory(id,this.local);if(typeof lease?.release!=='function')throw fail();release=lease.release.bind(lease);fresh();
    if(!(lease.custody instanceof LocalSkillInvocationStartCustody))throw fail();
    const read=()=>{fresh();const state=physical?lease.custody.closeUndispatched(original.project,original.invocation,original.request.parent,original.record_id,fresh):lease.custody.inspect(original.project,original.invocation,original.request.parent,original.record_id);if(state.state==='closed')return {closure:state.closure};if(!('material_digest'in state))throw fail();
     const relation=lease.custody.accountScope(original.project,original.invocation,original.request.parent,original.record_id);
     return {root:join(this.local.location.dataDirectory,'skill-runtime-originals',original.project.id,original.invocation.invocation_key),scope:relation.child};};
    const selected=read();fresh();let result:unknown;
    if('closure'in selected)result=selected.closure;
    else if(kind==='query')result=await this.port.query(selected.root,selected.scope);
    else if(kind==='collect'){const record=this.local.store.getRuntimeRecord('run_record',original.record_id);if(!record||record.run_kind!=='agent')throw fail();result=await this.port.collect(selected.root,selected.scope,{project:original.project,record});}
    else if(kind==='cancel')result=await this.port.requestCancellation(selected.root,selected.scope);
    else result=await this.port.recover(selected.root,selected.scope);
    if(!same(read(),selected))throw fail();operation={outcome:'observed',result};
   }
  }catch(error){if(guardFailed&&error===guardError)throw error;fresh();operation=unavailable();}
  finally{if(release){try{await release();}catch{operation=unavailable();}fresh();}}
  return {ok:true as const,run_id:original.invocation.run_ref.id,invocation_id:id,invocation_key:original.invocation.invocation_key,operation,starts_run:false as const,domain_observation_produced:false as const};
 }
 query(id:string,guard:()=>void=()=>{}){return this.operate(id,'query',guard);}
 collect(id:string,guard:()=>void=()=>{}){return this.operate(id,'collect',guard);}
 retryCancellation(id:string,guard:()=>void=()=>{}){return this.operate(id,'cancel',guard);}
 recover(id:string,guard:()=>void=()=>{}){return this.operate(id,'recover',guard);}
 async stop(id:string,input:unknown,guard:()=>void=()=>{}){
  synchronous(guard);const original=this.original(id),keys=['acting_role','command_id','command_type','expected_revision','payload','requested_at','target'];
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!==keys.sort().join(',')||!('command_type'in input)||input.command_type!=='CancelRun'||!('target'in input)||!input.target||typeof input.target!=='object'||!('object_type'in input.target)||input.target.object_type!=='run'||!('id'in input.target)||input.target.id!==original.invocation.run_ref.id)throw new LocalProjectError('仅支持当前原 Skill 父 Run 的取消命令','INVALID_COMMAND');
  synchronous(guard);const command_result=executeLocalCommand(this.local,input);if('code'in command_result)return command_result;
  // A missing Native original/factory never prevents the authorized Kernel
  // command. Its receipt remains the same after acknowledgement loss/replay.
  return {...await this.retryCancellation(id,guard),command_result};
 }
}
