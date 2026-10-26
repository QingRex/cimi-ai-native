import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {afterEach,expect,it} from 'vitest';
import {AgentStartLedger,digest} from '../../../packages/runtime-adapter/dist/index.js';import {writeInstance} from '@cimiloop/local-app';import {createInternalId} from '@cimiloop/protocol/v2';
import {createAgentRunProject} from '../../../tests/fixtures/agent-run-project.js';import {installConstructedNativeFamilySkill} from '../../../tests/fixtures/agent-run-family-skill.js';import type {OriginalNativeParentPreparation} from '../../../tests/fixtures/agent-run-family-native.js';
import {startWorkbench,type WorkbenchServer} from '../src/server.js';
let server:WorkbenchServer|undefined,origin:AgentStartLedger|undefined,f:ReturnType<typeof createAgentRunProject>|undefined;
afterEach(async()=>{await server?.close();origin?.close();f?.store.close();});
// Actual HTTP/session/Kernel/SQLite/Git content and Host1. Provider approval and
// dispatch are PUBLIC seams; no Native/model or real qualification is claimed.
it('requires the browser session and CSRF, preserves a lost original start response, and keeps every action on that technical identity',async()=>{
 const root=mkdtempSync(join(tmpdir(),'cimiloop-probe-http-'));f=createAgentRunProject(root);const dataDirectory=dirname(f.path);
 writeInstance(join(dataDirectory,'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
 origin=AgentStartLedger.initialize(join(dataDirectory,'PUBLIC-probe-origin'),{machine_digest:digest('PUBLIC machine').value,principal_digest:digest('PUBLIC user').value});const ledger=origin,skill=installConstructedNativeFamilySkill({f,dataDirectory,ledger} as unknown as OriginalNativeParentPreparation);let launches=0,opens=0;
 server=await startWorkbench({projectDir:root,skillProbeServices:{async openOrigin(){return{origin:ledger,installation_digest:digest('PUBLIC installation').value,guard(){},release(){}};},async execution(){opens++;return{installation_digest:digest('PUBLIC installation').value,guard(){},release(){},async prepare(_input,guard){guard();return{async launch(){guard();launches++;throw Error('PUBLIC interrupted original');},dispose(){}};}};}}});
 const base=server.origin,login=await fetch(base+'/api/session',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})}),cookie=login.headers.get('set-cookie')!.split(';')[0]!,csrf=(await login.json() as {csrf:string}).csrf;
 const headers={Cookie:cookie,Origin:base,'Content-Type':'application/json','X-CimiLoop-CSRF':csrf},request_id=createInternalId(),body={request_id,descriptor_id:skill.descriptor.id,runtime_binding_id:f.runtime.id,method_name:'entry',max_elapsed_ms:180000,input:JSON.parse(skill.inputs.packages.content.readContent(skill.input_ref).toString('utf8'))},path=base+'/api/skill-probes/'+request_id,sequence=f.store.asOfEventSequence();
 expect((await fetch(path+'/start',{method:'POST',headers:{...headers,'X-CimiLoop-CSRF':'PUBLIC wrong'},body:JSON.stringify(body)})).status).toBe(403);expect(opens).toBe(0);
 expect((await fetch(path+'/start',{method:'POST',headers,body:JSON.stringify(body)})).status).toBe(200); // Drop the response body deliberately.
 const replay=await fetch(path+'/start',{method:'POST',headers,body:JSON.stringify(body)});expect(replay.status).toBe(200);expect(await replay.json()).toMatchObject({request_id,run_created:false,costs_reconciled:false,outcome:'unknown'});expect(launches).toBe(1);expect(opens).toBe(1);
 const listed=await fetch(base+'/api/skill-probes',{headers:{Cookie:cookie}});expect(await listed.json()).toMatchObject({requests:[{request_id,descriptor_id:skill.descriptor.id}]});
 expect((await fetch(path+'/recover',{method:'POST',headers,body:'{}'})).status).toBe(409);
 const cancelled=await fetch(path+'/cancel',{method:'POST',headers,body:'{}'});expect(await cancelled.json()).toMatchObject({request_id,cancellation_requested:true,completion_proven:false});
 expect((await fetch(path+'/cancel',{method:'POST',headers,body:'{"root":"PUBLIC forbidden override"}'})).status).toBe(400);
 expect(launches).toBe(1);expect(f.store.asOfEventSequence()).toBe(sequence);expect(ledger.listExclusive('skill_method_probe_request')).toHaveLength(1);expect(ledger.listExclusive('skill_method_probe_cancellation')).toHaveLength(1);
},120000);
