import {beforeEach,describe,it,expect} from 'vitest';
import {mkdtempSync,renameSync,readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {createInternalId} from '@cimiloop/protocol/v2';import * as adapter from '../src/index.js';
import {AgentWorkspaceToolIpc} from '../src/agent-workspace-ipc.js';import {AgentWorkspaceIpcJournal,readAgentWorkspaceIpcOriginals} from '../src/agent-workspace-ipc-journal.js';
import {parseAgentWorkspaceToolScope} from '../src/agent-workspace-authority.js';import {digest} from '../src/files.js';
const readCurrent=()=>Reflect.apply(Reflect.get(adapter,'readAgentWorkspaceIpcCurrentRequest'),undefined,[]) as null|Record<string,unknown>;
function setup(){
 const root=mkdtempSync(join(tmpdir(),'cimiloop-ipc-causal-')),scope=parseAgentWorkspaceToolScope({project_id:createInternalId(),run_id:createInternalId(),operation_key:createInternalId(),executor_actor_id:createInternalId(),context_digest:digest('PUBLIC context'),runtime_binding:{binding_ref:{object_type:'provider_binding',id:createInternalId()},digest:digest('PUBLIC runtime')},skill_bindings:[],host_admission_ref:{provider:'local_content',resource_type:'agent_host_admission',locator:digest('PUBLIC admission').value,digest:digest('PUBLIC admission')}}),nonce=randomUUID();
 const endpoint={pipe:'\\\\.\\pipe\\CimiLoop.AgentWorkspace.'+nonce,scope_digest:digest(JSON.stringify(scope)).value,check_catalog_digest:null,peer:{pid:123,creation_ticks:'1',image:process.execPath},supervisor:{pid:124,creation_ticks:'2',image:process.execPath},appcontainer_sid:null},journal=AgentWorkspaceIpcJournal.create(root,scope,endpoint,nonce,digest('PUBLIC transport').value);
 const frame={format:'cimiloop/agent-workspace-tool-request/1.0.0',scope_digest:endpoint.scope_digest,call_id:'sdk_'+digest('PUBLIC SDK').value,tool:'read_file',path:'src/query.ts',expected_digest:digest('PUBLIC file').value},bytes=Buffer.from(JSON.stringify(frame)),request_digest=digest(bytes).value,replies:unknown[]=[];
 const host=Object.create(AgentWorkspaceToolIpc.prototype) as object,stopping=new AbortController();
 const respond=Reflect.get(AgentWorkspaceToolIpc.prototype,'respond');
 const fields={scope,nonce,originals:journal,stopping,stopped:false,attempts:[],child:{stdin:{write:(reply:unknown)=>replies.push(reply)}},options:{execute:async()=>({receipt:{PUBLIC:'controlled file receipt'},replay:false})}};
 for(const [key,value] of Object.entries(fields))Reflect.set(host,key,value);
 return{root,scope,nonce,frame,bytes,request_digest,host,stopping,fields,replies,run:()=>Reflect.apply(respond,host,[bytes,request_digest]) as Promise<void>,originals:()=>readAgentWorkspaceIpcOriginals(root,scope,nonce)};
}
// Exercise the actual respond implementation and durable original byte journal.
// OS-authentication/receipt are controlled here; actual Windows proof is separate.
describe('current original IPC context is owned by the authenticated response lifetime',()=>{
 beforeEach(()=>expect(Reflect.get(adapter,'readAgentWorkspaceIpcCurrentRequest')).toBeTypeOf('function'));
 it('is absent outside respond and binds persisted request bytes inside the original callback',async()=>{
  const s=setup();expect(readCurrent()).toBeNull();let observed:unknown;
  s.fields.options.execute=async()=>{observed=readCurrent();expect(s.originals().unresolved).toBe(1);await Promise.resolve();expect(readCurrent()).toEqual(observed);return{receipt:{PUBLIC:'controlled file receipt'},replay:false};};
  await s.run();expect(observed).toEqual({nonce:s.nonce,scope_digest:s.frame.scope_digest,ordinal:'0001',request_digest:s.request_digest,call_id:s.frame.call_id,tool:'read_file'});expect(readCurrent()).toBeNull();expect(s.originals().unresolved).toBe(0);expect(s.replies).toHaveLength(1);
 });
 it('expires a retained asynchronous continuation after the original reply',async()=>{
  const s=setup();let release!:()=>void,late:Promise<boolean>|undefined;const waiting=new Promise<void>(done=>release=done);
  s.fields.options.execute=async()=>{late=waiting.then(()=>{expect(()=>readCurrent()).toThrow();return true;});return{receipt:{PUBLIC:'controlled file receipt'},replay:false};};
  await s.run();release();expect(await late).toBe(true);
 });
 it('denies the current request immediately after its original host stop signal',async()=>{
  const s=setup();s.fields.options.execute=async()=>{expect(readCurrent()).not.toBeNull();s.stopping.abort();expect(()=>readCurrent()).toThrow();return{receipt:{PUBLIC:'controlled file receipt'},replay:false};};await s.run();
 });
 it('refuses lost original request bytes instead of trusting a captured digest',async()=>{
  const s=setup();s.fields.options.execute=async()=>{const request=s.originals().artifacts.find(row=>row.name==='0001/request.raw')!;renameSync(request.path,request.path+'.PUBLIC-retained-original');expect(()=>readCurrent()).toThrow();return{receipt:{PUBLIC:'controlled file receipt'},replay:false};};await s.run();
 });
 it('binds the immutable original header bytes even when a substituted header has the same nonce and scope',async()=>{
  const s=setup();let denied=false;
  s.fields.options.execute=async()=>{const path=s.originals().artifacts.find(row=>row.name==='header.json')!.path,original=JSON.parse(readFileSync(path,'utf8'));renameSync(path,path+'.PUBLIC-retained-original');writeFileSync(path,JSON.stringify({...original,transport_digest:'b'.repeat(64)}),{flag:'wx'});
   try{readCurrent();}catch{denied=true;}return{receipt:{PUBLIC:'controlled file receipt'},replay:false};};
  await expect(s.run()).rejects.toThrow();expect(denied).toBe(true);
 });
 it('isolates simultaneous original host callbacks instead of sharing a mutable global current request',async()=>{
  const a=setup(),b=setup();let release!:()=>void,entered!:()=>void;const waiting=new Promise<void>(done=>release=done),first=new Promise<void>(done=>entered=done);
  a.fields.options.execute=async()=>{expect(readCurrent()?.nonce).toBe(a.nonce);entered();await waiting;expect(readCurrent()?.nonce).toBe(a.nonce);return{receipt:{PUBLIC:'controlled file receipt'},replay:false};};
  b.fields.options.execute=async()=>{expect(readCurrent()?.nonce).toBe(b.nonce);release();return{receipt:{PUBLIC:'controlled file receipt'},replay:false};};
  const original=a.run();await first;await b.run();await original;expect(readCurrent()).toBeNull();
 });
});
