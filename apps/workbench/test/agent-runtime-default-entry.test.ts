import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createAgentRunProject } from '../../../tests/fixtures/agent-run-project.js';
import { flowSuccess } from '../../../tests/fixtures/flow-project.js';
import { writeInstance } from '@cimiloop/local-app';
import { startWorkbench, type WorkbenchServer } from '../src/server.js';

const state=vi.hoisted(()=>({calls:[] as {runId:string;projectId:string;actorId:string}[]}));
// PUBLIC factory seam. HTTP, session/CSRF and Human Kernel authorization are
// real. No installed production qualification, model or Native is claimed.
vi.mock('@cimiloop/local-app',async load=>{const actual=await load<typeof import('@cimiloop/local-app')>();return{...actual,productionAgentRuntime:async(runId:string,local:Parameters<typeof actual.productionAgentRuntime>[1])=>{state.calls.push({runId,projectId:local.instance.project_id,actorId:local.instance.actor_id});throw new actual.LocalProjectError('PUBLIC complete Runtime unavailable','CAPABILITY_UNAVAILABLE','conflict');}};});
let f:ReturnType<typeof createAgentRunProject>,server:WorkbenchServer,runId:string,cookie:string,csrf:string;
beforeAll(async()=>{
 const root=mkdtempSync(join(tmpdir(),'cimiloop-workbench-default-'));f=createAgentRunProject(root);runId=f.reserveAgent(f.prepareAgent()).run.id;
 writeInstance(join(dirname(f.path),'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});server=await startWorkbench({projectDir:root});
 const login=await fetch(server.origin+'/api/session',{method:'POST',headers:{Origin:server.origin,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});expect(login.status).toBe(200);cookie=login.headers.get('set-cookie')!.split(';')[0]!;csrf=(await login.json() as {csrf:string}).csrf;
},120000);
afterAll(async()=>{await server?.close();f?.store.close();});
const request=async(body:unknown)=>{const response=await fetch(server.origin+'/api/agent-runs/'+runId+'/start',{method:'POST',headers:{Origin:server.origin,Cookie:cookie,'X-CimiLoop-CSRF':csrf,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};};
it('exposes the same default production entry as the workbench executable without declaring production admission',async()=>{
 const response=await fetch(server.origin+'/api/context',{headers:{Cookie:cookie,Connection:'close'}});expect(response.status).toBe(200);expect(await response.json()).toMatchObject({agent_start_available:true});expect(state.calls).toHaveLength(0);
});
it('routes the fixed Human Run through the default factory and preserves domain state when full admission rejects',async()=>{
 const before=f.store.asOfEventSequence(),calls=state.calls.length;expect(await request({})).toMatchObject({status:409,body:{code:'CAPABILITY_UNAVAILABLE'}});expect(state.calls.slice(calls)).toEqual([{runId,projectId:f.project.id,actorId:f.actor.id}]);expect(f.store.asOfEventSequence()).toBe(before);expect(f.store.listRuns(f.change.id)).toHaveLength(1);
});
it('does not admit serialized caller, model or path overrides to the default factory',async()=>{
 const before=state.calls.length;for(const body of [{actor_id:f.agent.id},{model:'PUBLIC foreign model'},{repository_path:f.project.repository_path}])expect((await request(body)).status).toBe(400);expect(state.calls).toHaveLength(before);
});
it('keeps current Human authorization ahead of the default production factory',async()=>{
 const before=state.calls.length;for(const assignment of f.store.listAssignments(f.actor.id).filter(value=>value.role_key==='technical_owner'&&!value.ended_at))flowSuccess(f.humanKernel.execute(f.projectCommand('EndAssignment',{assignment_id:assignment.id,expected_assignment_revision:assignment.revision,reason:'PUBLIC revoke before default startup'})));
 expect(await request({})).toMatchObject({status:403,body:{code:'ROLE_NOT_ASSIGNED'}});expect(state.calls).toHaveLength(before);
});
