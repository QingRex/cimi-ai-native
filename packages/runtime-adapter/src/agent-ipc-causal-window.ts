import {isDeepStrictEqual as same} from 'node:util';
import {copyToolJson} from './tool-journal.js';
import {RuntimeAdapterError} from './files.js';
import type {readAgentWorkspaceIpcOriginals} from './agent-workspace-ipc-journal.js';
export interface AgentWorkspaceIpcCurrentRequest {nonce:string;scope_digest:string;ordinal:string;request_digest:string;call_id:string;tool:string}
type Originals=ReturnType<typeof readAgentWorkspaceIpcOriginals>;
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function deny():never{throw new RuntimeAdapterError('agent_ipc_causal_window_unproven');}
function data(raw:unknown,key:string):unknown {
 if(!raw||typeof raw!=='object')deny();const descriptor=Object.getOwnPropertyDescriptor(raw,key);if(!descriptor||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))deny();return descriptor.value;
}
function fields(raw:unknown,omit:string[]=[]):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))deny();const value:Record<string,unknown>=Object.create(null);
 for(const key of Reflect.ownKeys(raw)){if(typeof key!=='string')deny();if(!omit.includes(key))value[key]=data(raw,key);else data(raw,key);}
 return copyToolJson(value) as Record<string,unknown>;
}
function array(raw:unknown,maximum:number):unknown[]{
 if(!Array.isArray(raw)||Object.getPrototypeOf(raw)!==Array.prototype||raw.length>maximum||Reflect.ownKeys(raw).length!==raw.length+1)deny();return Array.from({length:raw.length},(_,i)=>data(raw,String(i)));
}
function copyOriginals(raw:Originals):Originals{
 const spine=fields(raw,['exchanges','artifacts']),exchanges=array(data(raw,'exchanges'),128).map(row=>({...fields(row,['request','reply']),request:copyToolJson(data(row,'request')),reply:copyToolJson(data(row,'reply'))})),artifacts=array(data(raw,'artifacts'),513).map(row=>copyToolJson(row));
 return{...spine,exchanges,artifacts} as Originals;
}
// Pure projection only. It grants no authority; production callers obtain the
// current value exclusively from the authenticated host's private async context.
// Independent Native/Kernel readers must still prove all retained effects.
export function projectAgentWorkspaceIpcCausalPrefix(originals:Originals,current:AgentWorkspaceIpcCurrentRequest|null){
 const source=copyOriginals(originals),active=current===null?null:copyToolJson(current) as AgentWorkspaceIpcCurrentRequest;
 if(source.status!=='Observed'||!source.header||!Array.isArray(source.exchanges)||!Number.isSafeInteger(source.unresolved))deny();
 const pending=source.exchanges.filter(row=>row.state==='unknown');
 if(source.unresolved!==pending.length||source.exchanges.some(row=>!['unknown','reply_recorded'].includes(row.state)))deny();
 if(active){
  const header=source.header;if(!header||!('nonce'in header))deny();
  if(!exact(active,['nonce','scope_digest','ordinal','request_digest','call_id','tool'])||active.nonce!==header.nonce||active.scope_digest!==header.endpoint.scope_digest||!sha(active.scope_digest)||!sha(active.request_digest)||!/^\d{4}$/.test(active.ordinal)||!['model_step','run_skill'].includes(active.tool))deny();
  const tail=source.exchanges.at(-1),frame=tail?.request as Record<string,unknown>|null;
  if(!tail||pending.length!==1||tail!==pending[0]||!frame||tail.ordinal!==active.ordinal||tail.request_digest!==active.request_digest||tail.reply_digest!==null||tail.reply!==null||frame.call_id!==active.call_id||frame.tool!==active.tool)deny();
 }else if(pending.length)deny();
 // Remove the single proven in-flight tail first. Completed model steps are
 // model evidence, not Native file/check/Skill effects, and stay in originals.
 const completed=active?source.exchanges.slice(0,-1):source.exchanges;
 if(completed.some(row=>row.state!=='reply_recorded'||!row.reply||!row.request))deny();
 const exchanges=completed.filter(row=>!(row.request&&typeof row.request==='object'&&'tool'in row.request&&row.request.tool==='model_step'));
 if(!same(originals,source)||!same(current,active))deny();
 return{prefix:{...source,exchanges,unresolved:0} as Originals,current:active};
}
