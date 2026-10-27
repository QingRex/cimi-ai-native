import {isDeepStrictEqual as same} from 'node:util';
import {LocalAgentRuntimeControl,readHumanOriginalAgentRunInputs} from './agent-runtime-control-local.js';
import {readOriginalAgentRunInputs} from './agent-workspace-tools-local.js';
import {LocalHumanSkillInvocationControl} from './skill-invocation-control-local.js';
import {LocalProjectError} from './errors.js';
import type {LocalProject} from './project.js';

type Child=Awaited<ReturnType<LocalHumanSkillInvocationControl['query']>>;
export interface LocalAgentRunFamilyControlResult {
  children:Child[];
  resources_disposed:boolean;
  completion_proven:false;
  costs_reconciled:false;
}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
// An observed cancellation, a dispatch fence or native-only cleanup cannot
// prove that the original Native AND model resources have been disposed.
function disposed(operation:{outcome:string;result?:unknown}){
  if(operation.outcome!=='observed'||!object(operation.result))return false;
  const value=object(operation.result.status)?operation.result.status:operation.result;
  return value.resource_scope==='native_and_current_codex_run'&&value.resources_disposed===true&&value.native_resources_disposed===true&&
    object(value.model_resources)&&value.model_resources.resource_scope==='current_codex_run'&&value.model_resources.resources_disposed===true;
}
const changed=()=>new LocalProjectError('原父 Run 或完整子调用集合发生变化','INPUT_CHANGED','conflict');
function synchronous(guard:()=>void){const value:unknown=guard();if(value!==undefined){if(value instanceof Promise)void value.catch(()=>{});throw new LocalProjectError('控制 guard 须同步完成','CAPABILITY_UNAVAILABLE','conflict');}}

// One Human service for CLI and workbench. Kernel alone records CancelRun;
// children retain their original scopes and each existing custody controller.
// No launch, observation, settlement, capacity release or schema migration.
export class LocalHumanAgentRunFamilyControl {
  readonly #kernel:LocalProject['kernel'];
  readonly #authorize:LocalProject['kernel']['authorizeAgentRunControl'];
  constructor(private readonly local:LocalProject,
    private readonly parent=new LocalAgentRuntimeControl(local),
    private readonly child=new LocalHumanSkillInvocationControl(local)){
    this.#kernel=local.kernel;this.#authorize=local.kernel.authorizeAgentRunControl;
  }
  private capture(runId:string){
    const human=readHumanOriginalAgentRunInputs(this.local,runId);
    return this.local.store.readSnapshot(reader=>{
      const original=readOriginalAgentRunInputs({location:this.local.location,store:reader},runId);
      if(!same(original.scope,human.scope)||!same(original.record,human.record)||!same(original.context,human.context))throw changed();
      const children=reader.listRuntimeRecords('skill_invocation',original.run.change_id)
        .filter(invocation=>invocation.run_ref.id===runId).sort((a,b)=>a.invocation_key.localeCompare(b.invocation_key));
      if(children.length>64||new Set(children.map(v=>v.id)).size!==children.length||new Set(children.map(v=>v.invocation_key)).size!==children.length)throw changed();
      return{scope:original.scope,record:original.record,context:original.context,children};
    }).value;
  }
  private operation(runId:string,beforeEffect:()=>void,physical:boolean){
    synchronous(beforeEffect);
    const local=this.local,identity={store:local.store,kernel:local.kernel,instance:structuredClone(local.instance),location:structuredClone(local.location)};
    const original=this.capture(runId);
    let failed=false,failure:unknown;
    const guard=()=>{
      if(failed)throw failure;
      try{
        synchronous(beforeEffect);
        if(local.store!==identity.store||local.kernel!==identity.kernel||local.kernel!==this.#kernel||
          local.kernel.authorizeAgentRunControl!==this.#authorize||!same(local.instance,identity.instance)||!same(local.location,identity.location))throw changed();
        if(!same(this.capture(runId),original))throw changed();
        if(physical){const permission=this.#authorize.call(this.#kernel,runId);if('code'in permission)throw permission;
          if(!local.store.getRun(runId)?.cancel_requested)throw new LocalProjectError('须先由 Kernel 记录原运行取消请求','RECOVERY_CONDITIONS_UNMET','conflict');}
      }catch(error){failed=true;failure=error;throw error;}
    };
    return{original,guard};
  }
  private async join<T extends Awaited<ReturnType<LocalAgentRuntimeControl['query']>>>(parent:T,kind:'query'|'collect'|'retryCancellation'|'recover',state:ReturnType<LocalHumanAgentRunFamilyControl['operation']>):Promise<T&{family?:LocalAgentRunFamilyControlResult}>{
    const {original,guard}=state;guard();
    if(!original.children.length)return parent;
    const children:Child[]=[];
    for(const invocation of original.children){
      guard();
      try{children.push(await this.child[kind](invocation.id,guard));}
      catch{guard();children.push({ok:true,run_id:parent.run_id,invocation_id:invocation.id,invocation_key:invocation.invocation_key,
        operation:{outcome:'unknown',reason:'skill_original_operation_unavailable'},starts_run:false,domain_observation_produced:false});}
      guard();
    }
    guard();
    const family:LocalAgentRunFamilyControlResult={children,resources_disposed:disposed(parent.operation)&&children.every(value=>disposed(value.operation)),completion_proven:false,costs_reconciled:false};
    return{...parent,family};
  }
  async query(runId:string,guard:()=>void=()=>{}){
    const state=this.operation(runId,guard,false);return this.join(await this.parent.query(runId,state.guard),'query',state);
  }
  // Every member retains its own existing original collector and custody.
  // Partial collection never proves family completion or releases resources.
  async collect(runId:string,guard:()=>void=()=>{}){
    const state=this.operation(runId,guard,false);return this.join(await this.parent.collect(runId,state.guard),'collect',state);
  }
  async stop(input:unknown,guard:()=>void=()=>{}){
    synchronous(guard);
    if(!object(input)||input.command_type!=='CancelRun'||!object(input.target)||input.target.object_type!=='run'||typeof input.target.id!=='string')
      throw new LocalProjectError('仅支持原 Run 的取消请求','INVALID_COMMAND');
    const before=this.operation(input.target.id,guard,false);
    // The parent service validates the command and commits the sole Kernel
    // cancellation before any physical child control is attempted.
    const result=await this.parent.stop(input,before.guard);if('code'in result)return result;
    before.guard();
    const state=this.operation(result.run_id,guard,true);
    if(!same(state.original,before.original))throw changed();
    return this.join(result,'retryCancellation',state);
  }
  async retryCancellation(runId:string,guard:()=>void=()=>{}){
    const state=this.operation(runId,guard,true);state.guard();return this.join(await this.parent.retryCancellation(runId,state.guard),'retryCancellation',state);
  }
  async recover(runId:string,guard:()=>void=()=>{}){
    const state=this.operation(runId,guard,true);state.guard();return this.join(await this.parent.recover(runId,state.guard),'recover',state);
  }
}
