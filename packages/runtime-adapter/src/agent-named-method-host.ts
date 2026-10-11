import {mkdirSync,readdirSync,existsSync,openSync,writeFileSync,fsyncSync,closeSync,lstatSync} from 'node:fs';import {join} from 'node:path';import {isDeepStrictEqual as same} from 'node:util';
import {parseAgentWorkspaceToolScope,type AgentWorkspaceToolScope} from './agent-workspace-authority.js';import {validateFixedMethodContext} from './fixed-method.js';import {assertOrdinaryPath,bytesAt,digest,directory,RuntimeAdapterError} from './files.js';import {parseGatewayJson} from './gateway-conversation.js';import {TOOL_RECORD_BYTES} from './tool-journal.js';
const fail=(reason='agent_method_original_unproven'):never=>{throw new RuntimeAdapterError(reason);};const encode=(v:unknown)=>Buffer.from(JSON.stringify(v));
const runGuard=(guard:()=>void)=>{let value:unknown;try{value=guard();}catch{return fail('agent_method_effect_denied');}if(value!==undefined){if(value instanceof Promise){try{void Promise.prototype.then.call(value,undefined,()=>{});}catch{}}fail('agent_method_effect_denied');}};
const identity=(path:string)=>{const s=lstatSync(assertOrdinaryPath(path),{bigint:true});if(!s.isFile()||s.nlink!==1n||s.ino<=0n)fail();return {dev:String(s.dev),ino:String(s.ino),birth_ns:String(s.birthtimeNs)};};
const save=(path:string,b:Buffer)=>{if(!b.length||b.length>TOOL_RECORD_BYTES)fail('agent_method_capacity_exhausted');const fd=openSync(assertOrdinaryPath(path),'wx');try{writeFileSync(fd,b);fsyncSync(fd);}finally{closeSync(fd);}};
const parse=(p:string)=>structuredClone(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(bytesAt(p,TOOL_RECORD_BYTES)),TOOL_RECORD_BYTES));
export interface AgentNamedMethodReceipt {format:'cimiloop/agent-named-method-receipt/1.0.0';scope_digest:string;profile_digest:string;call_id:string;request_digest:string;function_name:'invoke_skill'|'read_method_resource';argument:string;resource_path:string;resource_digest:string;text:string;formal_agent_execution_enabled:false}
function expectedCall(scope:AgentWorkspaceToolScope,context:ReturnType<typeof validateFixedMethodContext>,raw:unknown){
 const f=structuredClone(raw) as Record<string,unknown>,profileDigest=digest(JSON.stringify(context.profile)).value;
 if(!f||Object.keys(f).sort().join(',')!=='argument,call_id,format,profile_digest,scope_digest,tool'||f.format!=='cimiloop/agent-runtime-method-request/1.0.0'||f.scope_digest!==digest(JSON.stringify(scope)).value||f.profile_digest!==profileDigest||typeof f.call_id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(f.call_id)||typeof f.argument!=='string'||!['invoke_skill','read_method_resource'].includes(String(f.tool)))return fail('agent_method_call_denied');
 const resource=context.profile.resources.find(r=>r.path===(f.tool==='invoke_skill'?context.profile.modules.find(m=>m.name===f.argument)?.definition_path:f.argument));if(!resource||(f.tool==='invoke_skill')!==(resource.kind==='definition'))return fail('agent_method_call_denied');
 const request=encode(f),receipt:AgentNamedMethodReceipt={format:'cimiloop/agent-named-method-receipt/1.0.0',scope_digest:String(f.scope_digest),profile_digest:profileDigest,call_id:f.call_id,request_digest:digest(request).value,function_name:f.tool as AgentNamedMethodReceipt['function_name'],argument:f.argument,resource_path:resource.path,resource_digest:resource.digest.value,text:context.files.find(file=>file.path===resource.path)!.content,formal_agent_execution_enabled:false};
 return {request,receipt};
}
// Original immutable fixed-method materials. This port grants no arbitrary
// filesystem access, builtin Skill qualification or business completion.
export class AgentNamedMethodHost {
 private constructor(readonly path:string,private readonly spine:string,private readonly scope:AgentWorkspaceToolScope,private readonly context:ReturnType<typeof validateFixedMethodContext>,private readonly header:Buffer,private readonly anchor:Buffer,private readonly guard:()=>void){}
 get profileDigest(){return digest(JSON.stringify(this.context.profile)).value;}
 get originalBinding(){return {format:'cimiloop/agent-named-method-binding/1.0.0',profile_digest:this.profileDigest,header_digest:digest(this.header).value,anchor_digest:digest(this.anchor).value};}
 static initialize(root:string,rawScope:unknown,profile:unknown,files:{path:string;content:string}[],guard:()=>void){
  if(typeof guard!=='function')fail('agent_method_effect_denied');runGuard(guard);const scope=parseAgentWorkspaceToolScope(rawScope),context=validateFixedMethodContext(profile,files,scope.operation_key);
  const path=assertOrdinaryPath(join(directory(join(root,'agent-named-method-originals',scope.project_id)),scope.operation_key)),spine=assertOrdinaryPath(join(directory(join(root,'agent-named-method-starts',scope.project_id)),scope.operation_key));
  const header=encode({format:'cimiloop/agent-named-method-originals/1.0.0',scope,profile:context.profile,maximum_calls:128,formal_agent_execution_enabled:false});if(header.length>TOOL_RECORD_BYTES)fail('agent_method_capacity_exhausted');
  if(!existsSync(path)&&!existsSync(spine)){runGuard(guard);mkdirSync(spine);mkdirSync(path);mkdirSync(join(path,'materials'));for(const [i,file] of context.files.entries())save(join(path,'materials',String(i+1).padStart(4,'0')+'.raw'),Buffer.from(file.content));save(join(path,'header.json'),header);save(join(spine,'header.json'),encode({format:'cimiloop/agent-named-method-anchor/1.0.0',header_digest:digest(header).value,header_identity:identity(join(path,'header.json')),materials:context.files.map((_,i)=>identity(join(path,'materials',String(i+1).padStart(4,'0')+'.raw')))}));}
  const host=new AgentNamedMethodHost(path,spine,scope,context,header,bytesAt(join(spine,'header.json'),TOOL_RECORD_BYTES),guard);host.assertOriginal();runGuard(guard);return host;
 }
 static readOriginals(root:string,rawScope:unknown,profile:unknown,files:{path:string;content:string}[],binding:unknown){
  try {
   const scope=parseAgentWorkspaceToolScope(rawScope),context=validateFixedMethodContext(profile,files,scope.operation_key);
   const path=assertOrdinaryPath(join(root,'agent-named-method-originals',scope.project_id,scope.operation_key)),spine=assertOrdinaryPath(join(root,'agent-named-method-starts',scope.project_id,scope.operation_key));
   const header=encode({format:'cimiloop/agent-named-method-originals/1.0.0',scope,profile:context.profile,maximum_calls:128,formal_agent_execution_enabled:false});
   const host=new AgentNamedMethodHost(path,spine,scope,context,header,bytesAt(join(spine,'header.json'),TOOL_RECORD_BYTES),()=>fail('agent_method_effect_denied'));
   if(!same(host.originalBinding,binding))fail();host.assertOriginal();
   const names=readdirSync(path).filter(n=>!['header.json','materials'].includes(n)).sort();if(names.length>128||names.some(n=>!/^[a-zA-Z0-9_-]{1,128}$/.test(n)||!lstatSync(assertOrdinaryPath(join(path,n))).isDirectory()))fail();
   const artifacts:{name:string;path:string;digest:string}[]=[],calls:{request:unknown;receipt:AgentNamedMethodReceipt}[]=[];
   const capture=(name:string,p:string,maximum=TOOL_RECORD_BYTES)=>{identity(p);const b=bytesAt(p,maximum);artifacts.push({name,path:p,digest:digest(b).value});return b;};
   capture('header.json',join(path,'header.json'));capture('start/header.json',join(spine,'header.json'));
   for(const [i] of context.files.entries()){const name=String(i+1).padStart(4,'0')+'.raw';capture('materials/'+name,join(path,'materials',name),50*1024);}
   for(const name of names){const slot=join(path,name);if(readdirSync(slot).sort().join(',')!=='reply.json,request.json')fail();const request=structuredClone(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(capture(name+'/request.json',join(slot,'request.json'))),TOOL_RECORD_BYTES)),expected=expectedCall(scope,context,request);
    if(expected.receipt.call_id!==name)fail();const receipt=structuredClone(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(capture(name+'/reply.json',join(slot,'reply.json'))),TOOL_RECORD_BYTES));if(!same(receipt,expected.receipt))fail();calls.push({request,receipt:expected.receipt});
   }
   host.assertOriginal();if(!same(readdirSync(path).filter(n=>!['header.json','materials'].includes(n)).sort(),names))fail();for(const a of artifacts)if(digest(bytesAt(a.path,TOOL_RECORD_BYTES)).value!==a.digest)fail();
   return {original_binding:host.originalBinding,context,calls,artifacts,formal_agent_execution_enabled:false as const};
  }catch{return fail();}
 }
 assertScope(raw:unknown){if(!same(parseAgentWorkspaceToolScope(raw),this.scope))fail('agent_method_scope_denied');this.assertOriginal();runGuard(this.guard);}
 private assertOriginal(){try{
  if(!bytesAt(join(this.path,'header.json'),TOOL_RECORD_BYTES).equals(this.header)||!bytesAt(join(this.spine,'header.json'),TOOL_RECORD_BYTES).equals(this.anchor)||readdirSync(this.spine).join(',')!=='header.json')fail();
  const expected=parse(join(this.spine,'header.json')) as {format:string;header_digest:string;header_identity:unknown;materials:unknown[]};if(expected.format!=='cimiloop/agent-named-method-anchor/1.0.0'||expected.header_digest!==digest(this.header).value||!same(expected.header_identity,identity(join(this.path,'header.json')))||!Array.isArray(expected.materials)||expected.materials.length!==this.context.files.length)fail();
  const names=readdirSync(join(this.path,'materials')).sort();if(names.length!==this.context.files.length)fail();for(const [i,file] of this.context.files.entries()){const name=String(i+1).padStart(4,'0')+'.raw',p=join(this.path,'materials',name);if(names[i]!==name||!same(identity(p),expected.materials[i])||!bytesAt(p,50*1024).equals(Buffer.from(file.content)))fail();}
 }catch{return fail();}}
 async execute(raw:unknown,signal?:AbortSignal):Promise<{receipt:AgentNamedMethodReceipt;replay:boolean}>{
  signal?.throwIfAborted();this.assertOriginal();try{runGuard(this.guard);}catch{fail('agent_method_effect_denied');}const {request,receipt}=expectedCall(this.scope,this.context,raw),target=assertOrdinaryPath(join(this.path,receipt.call_id));
  if(existsSync(target)){if(!bytesAt(join(target,'request.json'),TOOL_RECORD_BYTES).equals(request))fail('agent_method_call_conflict');if(!same(parse(join(target,'reply.json')),receipt))fail();this.assertOriginal();signal?.throwIfAborted();runGuard(this.guard);return {receipt:structuredClone(receipt),replay:true};}
  if(readdirSync(this.path).filter(n=>!['header.json','materials'].includes(n)).length>=128)fail('agent_method_capacity_exhausted');signal?.throwIfAborted();runGuard(this.guard);this.assertOriginal();mkdirSync(target);save(join(target,'request.json'),request);this.assertOriginal();signal?.throwIfAborted();runGuard(this.guard);save(join(target,'reply.json'),encode(receipt));return {receipt:structuredClone(receipt),replay:false};
 }
}
// Reads only. Missing/partial originals are never initialized, repaired or executed.
export const readAgentNamedMethodOriginals=AgentNamedMethodHost.readOriginals;
