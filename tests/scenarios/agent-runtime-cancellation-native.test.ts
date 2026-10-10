import{describe,it,expect}from'vitest';import{mkdtempSync,readFileSync,existsSync,mkdirSync,writeFileSync}from'node:fs';import{tmpdir}from'node:os';import{join,dirname,resolve}from'node:path';
import{createAgentRunProject}from'../fixtures/agent-run-project.js';import{runOpenCodeWorkspaceToolRehearsal,parseAgentWorkspaceToolScope,requestAgentRuntimeCancellation,collectAgentRuntimeOperation}from'../../packages/runtime-adapter/src/index.js';
import{digest}from'../../packages/runtime-adapter/src/files.js';
// Actual Windows held AppContainer Job/controller. The pinned Node child is
// never resumed: no SDK/model/Key/bill/Skill/S1 qualification is asserted.
describe.runIf(process.platform==='win32'&&process.arch==='x64')('actual original Native cancellation',()=>{
 it.each(['registered','suspended'])('writes explicit %s cancellation and disposes only the original Job',async phase=>{
  const root=mkdtempSync(join(tmpdir(),'cimiloop-original-cancellation-')),f=createAgentRunProject(root,'task_execution',100,undefined,['read_files','edit_files']);
  const prepared=f.prepareAgent(),reserved=f.reserveAgent(prepared),scope=parseAgentWorkspaceToolScope({project_id:f.project.id,run_id:reserved.run.id,operation_key:reserved.record.operation_key,executor_actor_id:f.agent.id,context_digest:prepared.context.input_digest,...f.pins,host_admission_ref:prepared.context.host_admission_ref}),dataDirectory=dirname(f.path);let operation='';
  const request=()=>{const result=requestAgentRuntimeCancellation(dataDirectory,scope);operation=result.operation;return new Promise<never>(()=>{});};
  try{
   await expect(runOpenCodeWorkspaceToolRehearsal({root:dataDirectory,binary:process.execPath,scope,maxElapsedMs:60000,path:'src/query.ts',expectedDigest:digest(readFileSync(join(root,'src/query.ts'))).value,replacement:'export const query = () => 7;\n',prepare:original=>phase==='registered'&&original.phase==='registered'?request():undefined,connect:async()=>request()})).rejects.toThrow('workspace_rehearsal_cancel_requested');
   const cleanup=JSON.parse(readFileSync(join(operation,'agent-sandbox-cleanup.json'),'utf8')),proof=JSON.parse(readFileSync(join(operation,'agent-sandbox-cancellation.json'),'utf8'));
   expect(cleanup).toMatchObject({reason:'agent_sandbox_cancel_requested',exit_code:130,resources_disposed:true,cleanup_errors:[]});expect(proof).toMatchObject({format:'cimiloop/agent-workspace-cancellation/1.0.0',phase,runtime_resumed:false,reason:'agent_sandbox_cancel_requested'});
   const collected=await collectAgentRuntimeOperation(dataDirectory,scope);expect(Reflect.get(collected,'cancellation')).toMatchObject({status:'Observed',phase,runtime_resumed:false});expect(collected.status).toMatchObject({status:'Stopped',resources_disposed:true,cancellation_requested:true});expect(collected.domain_observation_produced).toBe(false);expect(existsSync(join(operation,'result.json'))).toBe(false);
   const dir=resolve('.cimiloop/new-host-s1');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'d262-native-cancel-'+digest(root).value+'.json'),JSON.stringify({owned_root:root,phase,proof,cleanup,collected,actual_windows_appcontainer:true,child_resumed:false,actual_sdk_model_started:false,real_key_reads:0,paid_requests:0,originals_retained:true},null,2)+'\n');
  }finally{f.store.close();}
 },120000);
 it.each(['ordinary_eof','foreign_cancel_frame'])('keeps %s distinct from a proved explicit cancellation',async kind=>{
  const root=mkdtempSync(join(tmpdir(),'cimiloop-original-cancellation-')),f=createAgentRunProject(root,'task_execution',100,undefined,['read_files','edit_files']),prepared=f.prepareAgent(),reserved=f.reserveAgent(prepared),scope=parseAgentWorkspaceToolScope({project_id:f.project.id,run_id:reserved.run.id,operation_key:reserved.record.operation_key,executor_actor_id:f.agent.id,context_digest:prepared.context.input_digest,...f.pins,host_admission_ref:prepared.context.host_admission_ref}),dataDirectory=dirname(f.path);let operation='';
  try{
   await expect(runOpenCodeWorkspaceToolRehearsal({root:dataDirectory,binary:process.execPath,scope,maxElapsedMs:60000,path:'src/query.ts',expectedDigest:digest(readFileSync(join(root,'src/query.ts'))).value,replacement:'export const query = () => 7;\n',prepare:original=>{operation=original.operation;},connect:async native=>{
    if(!native.stdin)throw Error('Original Native control pipe missing');
    if(kind==='ordinary_eof')native.stdin.end();else{requestAgentRuntimeCancellation(dataDirectory,scope);native.stdin.end(JSON.stringify({format:'cimiloop/agent-workspace-cancel/1.0.0',nonce:'PUBLIC foreign',scope_digest:digest('PUBLIC foreign').value,operation_id:'PUBLIC foreign',cancellation_digest:'0'.repeat(64)})+'\n');}
    return new Promise<never>(()=>{});
   }})).rejects.toThrow(/^workspace_rehearsal_/);
   const cleanup=JSON.parse(readFileSync(join(operation,'agent-sandbox-cleanup.json'),'utf8'));expect(cleanup.resources_disposed).toBe(true);expect(cleanup.reason).toBe(kind==='ordinary_eof'?'agent_sandbox_parent_ended':'agent_sandbox_unavailable');expect(existsSync(join(operation,'agent-sandbox-cancellation.json'))).toBe(false);
   const collected=await collectAgentRuntimeOperation(dataDirectory,scope);expect(collected).not.toHaveProperty('cancellation');expect(collected.status).toMatchObject({status:'Stopped',resources_disposed:true,cancellation_requested:kind==='foreign_cancel_frame'});if(kind==='ordinary_eof')expect(collected.interruption).toMatchObject({reason:'agent_sandbox_parent_ended',runtime_resumed:false});expect(f.task().usage.cost_reserved_micros).toBe(100);
   const dir=resolve('.cimiloop/new-host-s1');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'d262-native-negative-'+digest(root).value+'.json'),JSON.stringify({owned_root:root,kind,cleanup,collected,actual_windows_appcontainer:true,child_resumed:false,actual_sdk_model_started:false,real_key_reads:0,paid_requests:0,originals_retained:true},null,2)+'\n');
  }finally{f.store.close();}
 },120000);
});
