import {join} from 'node:path';import {isDeepStrictEqual as same} from 'node:util';
import {queryAgentRuntimeOperation,collectAgentRuntimeOperation,requestAgentRuntimeCancellation,recoverAgentRuntimeOperation} from '@cimiloop/runtime-adapter';
import {LocalAgentRuntimeControl,readHumanOriginalAgentRunInputs,type AgentRuntimeControlPort} from './agent-runtime-control-local.js';
import {readOriginalSkillInvocationMetadataFromReader} from './skill-invocation-execution-local.js';
import {LocalSkillInvocationStartCustody} from './skill-invocation-start-custody-local.js';
import type {LocalProject} from './project.js';import {LocalProjectError} from './errors.js';
import {productionSkillRuntimeOriginals} from './skill-runtime-originals-local.js';
export interface SkillRuntimeControlLease {custody:LocalSkillInvocationStartCustody;guard?():void;release():void|Promise<void>}
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
 constructor(private readonly local:LocalProject,private readonly factory:HumanSkillRuntimeFactory=productionSkillRuntimeOriginals,private readonly port:AgentRuntimeControlPort=defaults){}
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
    const read=()=>{fresh();if(lease.guard)synchronous(lease.guard.bind(lease));fresh();const state=physical?lease.custody.closeUndispatched(original.project,original.invocation,original.request.parent,original.record_id,fresh):lease.custody.inspect(original.project,original.invocation,original.request.parent,original.record_id);if(state.state==='closed')return {closure:state.closure};if(!('material_digest'in state))throw fail();
     const relation=lease.custody.accountScope(original.project,original.invocation,original.request.parent,original.record_id);
     return {root:join(this.local.location.dataDirectory,'skill-runtime-originals',original.project.id,original.invocation.invocation_key),scope:relation.child};};
    const selected=read();fresh();let result:unknown;
    if('closure'in selected)result=selected.closure;
    else if(kind==='query')result=await this.port.query(selected.root,selected.scope);
    else if(kind==='collect'){const record=this.local.store.getRuntimeRecord('run_record',original.record_id);if(!record||record.run_kind!=='agent')throw fail();result=await this.port.collect(selected.root,selected.scope,{project:original.project,record});}
    else if(kind==='cancel')result=await this.port.requestCancellation(selected.root,selected.scope,fresh);
    else result=await this.port.recover(selected.root,selected.scope,fresh);
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
 async stop(id:string,input:unknown,beforeEffect:()=>void=()=>{}){
  const command=structuredClone(input),local=this.local,identity={store:local.store,kernel:local.kernel,authorize:local.kernel.authorizeAgentRunControl,instance:structuredClone(local.instance),location:structuredClone(local.location)};
  const changed=()=>new LocalProjectError('原 Skill 停止入口或固定关系发生变化','INPUT_CHANGED','conflict');
  const identityGuard=()=>{if(local.store!==identity.store||local.kernel!==identity.kernel||local.kernel.authorizeAgentRunControl!==identity.authorize||!same(local.instance,identity.instance)||!same(local.location,identity.location))throw changed();};
  const external=()=>{identityGuard();synchronous(beforeEffect);identityGuard();};
  external();const original=this.original(id),keys=['acting_role','command_id','command_type','expected_revision','payload','requested_at','target'];
  if(!command||typeof command!=='object'||Array.isArray(command)||Object.keys(command).sort().join(',')!==keys.sort().join(',')||!('command_type'in command)||command.command_type!=='CancelRun'||!('target'in command)||!command.target||typeof command.target!=='object'||!('object_type'in command.target)||command.target.object_type!=='run'||!('id'in command.target)||command.target.id!==original.invocation.run_ref.id)throw new LocalProjectError('仅支持当前原 Skill 父 Run 的取消命令','INVALID_COMMAND');
  let failed=false,failure:unknown;
  const guard=()=>{if(failed)throw failure;try{external();if(!same(this.original(id),original))throw changed();}catch(error){failed=true;failure=error;throw error;}};
  guard();
  // Compose lazily to avoid a module-initialization cycle. Family control calls
  // retryCancellation on each original child, never recursively calls stop.
  const {LocalHumanAgentRunFamilyControl}=await import('./agent-run-family-control-local.js');guard();
  const result=await new LocalHumanAgentRunFamilyControl(local,new LocalAgentRuntimeControl(local),this).stop(command,guard);guard();
  if('code'in result)return result;
  const family=result.family;if(!family)throw changed();const selected=family.children.find(child=>child.invocation_id===id);if(!selected)throw changed();
  // Keep the selected-child envelope for historical callers while exposing
  // the parent and complete set. Unknown resources never release any budget.
  return{...selected,command_result:result.command_result,parent_operation:result.operation,family};
 }
}
