import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {basename,dirname,join,resolve} from 'node:path';
import {beforeAll,afterAll,it,expect,describe} from 'vitest';
import {writeInstance,openLocalProject,LocalHumanAgentRuntimeStart,LocalAgentRuntimeComposition} from '@cimiloop/local-app';
import {readOriginalAgentRunInputs} from '../../../packages/local-app/src/agent-workspace-tools-local.js';
import {flowSuccess} from '../../../tests/fixtures/flow-project.js';
import {createAgentRunProject} from '../../../tests/fixtures/agent-run-project.js';
import {startWorkbench,type WorkbenchServer} from '../src/server.js';
// Actual HTTP and SQLite/Kernel; constructed qualification, no Native or model call.
describe('original Agent start joins the Human workbench',()=>{
 let root:string,f:ReturnType<typeof createAgentRunProject>,server:WorkbenchServer,runId:string,cookie:string,csrf:string;
 const request=async(body:unknown)=>{const r=await fetch(server.origin+'/api/agent-runs/'+runId+'/start',{method:'POST',headers:{Origin:server.origin,Cookie:cookie,'Content-Type':'application/json','X-CimiLoop-CSRF':csrf,Connection:'close'},body:JSON.stringify(body)});return{status:r.status,body:await r.json() as any};};
 beforeAll(async()=>{root=mkdtempSync(join(tmpdir(),'cimiloop-workbench-start-'));f=createAgentRunProject(root);runId=f.reserveAgent(f.prepareAgent()).run.id;
 writeInstance(join(dirname(f.path),'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});server=await startWorkbench({projectDir:root});
 const login=await fetch(server.origin+'/api/session',{method:'POST',headers:{Origin:server.origin,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});cookie=login.headers.get('set-cookie')!.split(';')[0]!;csrf=(await login.json() as {csrf:string}).csrf;
 },120000);
 afterAll(async()=>{await server?.close();f?.store.close();if(root){if(dirname(root)!==resolve(tmpdir())||!basename(root).startsWith('cimiloop-workbench-start-'))throw Error('Unsafe cleanup');rmSync(root,{recursive:true,force:true});}});
 it('rejects default start before any original dispatch or business effect',async()=>{const before=f.store.asOfEventSequence();expect(await request({})).toMatchObject({status:409,body:{code:'CAPABILITY_UNAVAILABLE'}});expect(f.store.asOfEventSequence()).toBe(before);expect(f.store.listRuns(f.change.id)).toHaveLength(1);});
 it('rejects serialized model, caller and path overrides',async()=>{for(const body of [{model:'caller-choice'},{actor_id:f.agent.id},{repository_path:root}])expect((await request(body)).status).toBe(400);});
 it('requires Human technical-owner permission from Kernel without granting an Agent caller that permission',()=>{const before=f.store.asOfEventSequence();expect((f.kernel as any).authorizeAgentRunStart(runId)).toMatchObject({code:'CALLER_IDENTITY_MISMATCH'});expect((f.humanKernel as any).authorizeAgentRunStart(runId)).toMatchObject({ok:true,run_id:runId});expect(f.store.asOfEventSequence()).toBe(before);});
 it('refuses a foreign trusted composition before its start method',async()=>{
  const local=openLocalProject({projectDir:root});let starts=0;
  const runtime=Object.create(LocalAgentRuntimeComposition.prototype) as LocalAgentRuntimeComposition;
  runtime.originalScope=()=>({...readOriginalAgentRunInputs(local,runId).scope,project_id:'foreign'});
  runtime.start=async()=>{starts++;throw Error('Must not start');};
  try{await expect(new LocalHumanAgentRuntimeStart(local,()=>runtime).start(runId)).rejects.toMatchObject({code:'CALLER_IDENTITY_MISMATCH'});expect(starts).toBe(0);}finally{local.store.close();}
 });
 it('rechecks Human permission after an awaited factory and rejects a revoked original operator',async()=>{
  const local=openLocalProject({projectDir:root});let starts=0,resolveFactory!:(r:LocalAgentRuntimeComposition)=>void;
  const runtime=Object.create(LocalAgentRuntimeComposition.prototype) as LocalAgentRuntimeComposition;
  runtime.originalScope=()=>readOriginalAgentRunInputs(local,runId).scope;
  runtime.start=async()=>{starts++;throw Error('Must not start');};
  const waiting=new LocalHumanAgentRuntimeStart(local,()=>new Promise<LocalAgentRuntimeComposition>(done=>{resolveFactory=done;})).start(runId);
  try{for(const assignment of f.store.listAssignments(f.actor.id).filter(a=>a.role_key==='technical_owner'&&!a.ended_at))flowSuccess(f.humanKernel.execute(f.projectCommand('EndAssignment',{assignment_id:assignment.id,expected_assignment_revision:assignment.revision,reason:'Revoke while original startup factory awaits'})));
   resolveFactory(runtime);await expect(waiting).rejects.toMatchObject({code:'ROLE_NOT_ASSIGNED'});expect(starts).toBe(0);
  }finally{local.store.close();}
 });
});
