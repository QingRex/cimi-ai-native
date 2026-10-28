import {createServer} from 'node:http';
import type {Socket} from 'node:net';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {expect,it} from 'vitest';
import {createInternalId} from '@cimiloop/protocol/v2';
import * as runtime from '../src/index.js';
import {GatewayHttpTransport} from '../src/gateway-http.js';
import {parseAgentWorkspaceToolScope} from '../src/agent-workspace-authority.js';
import {AgentRuntimeModelHost,parseAgentRuntimeModelRequest} from '../src/agent-runtime-model.js';
import {createDedicatedAgentRuntimeModel,type DedicatedAgentAccountPort} from '../src/agent-dedicated-model.js';
import {validateModelConnection} from '../src/connection.js';
import {digest} from '../src/files.js';

// Actual loopback HTTP and socket ownership, with PUBLIC replies/accounts.
// No user credential, real provider/model/bill or S1 acceptance is exercised.
const key='shortk';
function packet(){
 const scope=parseAgentWorkspaceToolScope({project_id:createInternalId(),run_id:createInternalId(),operation_key:createInternalId(),executor_actor_id:createInternalId(),context_digest:digest('PUBLIC context'),skill_bindings:[],runtime_binding:{binding_ref:{object_type:'provider_binding',id:createInternalId()},digest:digest('PUBLIC binding')},host_admission_ref:{provider:'local_content',resource_type:'agent_host_admission',locator:digest('PUBLIC admission').value,digest:digest('PUBLIC admission')}});
 const admission=digest('PUBLIC model admission').value,profile={model:'codex/gpt-6-luna',thinking:'disabled' as const};
 const request=parseAgentRuntimeModelRequest(scope,{format:'cimiloop/agent-runtime-model-request/1.0.0',scope_digest:digest(JSON.stringify(scope)).value,admission_digest:admission,call_id:'model_0001',tool:'model_step',prompt:[{role:'user',content:'PUBLIC input'}],tools:[{type:'function',name:'cimi_read',description:'read',inputSchema:{type:'object',properties:{path:{type:'string'}},required:['path']}}],max_output_tokens:128},['cimi_read']);
 return{scope,admission,profile,request};
}
function boundary(endpoint:string){const Constructor=Reflect.get(runtime,'LoopbackGatewayNetworkBoundary');expect(Constructor).toBeTypeOf('function');return Reflect.construct(Constructor,[endpoint]) as any;}
async function fixture(mode:'ok'|'redirect'|'lost'|'secret'='ok'){
 let calls=0,last:any;const sockets=new Set<Socket>();
 const server=createServer((request,response)=>{calls++;const chunks:Buffer[]=[];request.on('data',chunk=>chunks.push(chunk));request.on('end',()=>{
  last={headers:request.headers,url:request.url,body:JSON.parse(Buffer.concat(chunks).toString())};
  if(mode==='redirect'){response.writeHead(302,{location:'http://127.0.0.1:1/forbidden'});response.end();return;}
  const bytes=Buffer.from(JSON.stringify({id:'PUBLIC_reply_1',model:'codex/gpt-6-luna',choices:[{index:0,message:{role:'assistant',content:mode==='secret'?key:'PUBLIC original answer'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:2,total_tokens:3}}));
  response.writeHead(200,{'content-type':'application/json','content-length':bytes.length});
  if(mode==='lost'){response.write(bytes.subarray(0,12));response.socket!.destroy();return;}
  response.end(bytes);
 });});
 server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();if(!address||typeof address==='string')throw Error('PUBLIC listener unavailable');
 const endpoint=`http://127.0.0.1:${address.port}/v1/chat/completions`;
 return{endpoint,port:address.port,calls:()=>calls,last:()=>last,async close(){for(const socket of sockets)socket.destroy();await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));}};
}
it('uses one owned literal-loopback socket and the exact OpenAI model without retry',async()=>{
 const f=await fixture();try{const b=boundary(f.endpoint),transport=new GatewayHttpTransport(b),p=packet(),prepared=transport.prepareAgent(p.request,p.profile,[]),connection=await b.connect();
  const result=await transport.sendAgentOriginal(prepared,connection,key);expect(result.parsed.receipt.finish).toBe('stop');expect(f.calls()).toBe(1);
  expect(f.last()).toMatchObject({url:'/v1/chat/completions',headers:{host:`127.0.0.1:${f.port}`,authorization:'Bearer '+key},body:{model:'codex/gpt-6-luna',max_tokens:128,stream:false}});
  expect(connection.observation).toMatchObject({format:'cimiloop/loopback-http-peer/1.0.0',peer_address:'127.0.0.1',peer_port:f.port});expect(connection.observation).not.toHaveProperty('certificate_digest');
  await expect(transport.sendAgentOriginal(prepared,connection,key)).rejects.toThrow('gateway_http_request_unowned');expect(f.calls()).toBe(1);
 }finally{await f.close();}
});
it.each(['redirect','lost','secret'] as const)('refuses %s without redirects, automatic resend or unsafe response capture',async mode=>{
 const f=await fixture(mode);try{const b=boundary(f.endpoint),transport=new GatewayHttpTransport(b),p=packet(),prepared=transport.prepareAgent(p.request,p.profile,[]),connection=await b.connect();
  await expect(transport.sendAgentOriginal(prepared,connection,key)).rejects.toThrow();expect(f.calls()).toBe(1);
  await expect(transport.sendAgentOriginal(prepared,connection,key)).rejects.toThrow('gateway_http_request_unowned');expect(f.calls()).toBe(1);
 }finally{await f.close();}
});
it('rejects a foreign socket and cancellation before any HTTP request',async()=>{
 const f=await fixture();let connection:any;try{const owner=boundary(f.endpoint),foreign=boundary(f.endpoint),transport=new GatewayHttpTransport(foreign),p=packet(),prepared=transport.prepareAgent(p.request,p.profile,[]);connection=await owner.connect();
  await expect(transport.sendAgentOriginal(prepared,connection,key)).rejects.toThrow('gateway_loopback_connection_unowned');expect(f.calls()).toBe(0);
  const ownTransport=new GatewayHttpTransport(owner),ownPrepared=ownTransport.prepareAgent(p.request,p.profile,[]),control=new AbortController();control.abort();
  await expect(ownTransport.sendAgentOriginal(ownPrepared,connection,key,8000,control.signal)).rejects.toThrow('gateway_http_aborted');expect(f.calls()).toBe(0);
 }finally{connection?.socket.destroy();await f.close();}
});
it('joins the original Agent ledger and replays one response without another request or hold',async()=>{
 const f=await fixture();try{const p=packet(),root=mkdtempSync(join(tmpdir(),'cimi-local-agent-'));let holds=0,credentials=0;
  const connection=validateModelConnection({format:'cimiloop/dedicated-model/2.0.0',provider:'openai-compatible',transport:'loopback_http/1.0.0',endpoint:f.endpoint,model:'openai-compatible/codex/gpt-6-luna',credential_file:resolve(tmpdir(),'PUBLIC-absent-'+p.scope.run_id+'.json'),credential_digest:digest('PUBLIC ciphertext')});
  const account:DedicatedAgentAccountPort={admission_digest:p.admission,profile:p.profile,check:async()=>{},reserve:async(_scope,request)=>{holds++;return{format:'cimiloop/agent-model-budget-hold/1.0.0',...request,account_digest:digest('PUBLIC account').value,approval_digest:digest('PUBLIC approval').value,tariff_digest:digest('PUBLIC tariff').value,cash_upper_micros:1,credit_upper_micro_units:0,input_token_limit:10000,output_token_limit:128};},verifyHold:async()=>{}};
  const model=createDedicatedAgentRuntimeModel({root,repositoryPath:root,scope:p.scope,connection,account},{readCredential:async()=>{credentials++;return key;}}),host=await AgentRuntimeModelHost.initialize(root,p.scope,model,['cimi_read']);
  expect((await host.execute(p.request)).replay).toBe(false);expect((await host.execute(p.request)).replay).toBe(true);expect({holds,credentials,calls:f.calls()}).toEqual({holds:1,credentials:1,calls:1});
 }finally{await f.close();}
});
