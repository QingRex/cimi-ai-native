import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {createInternalId} from '@cimiloop/protocol/v2';
import * as runtime from '../src/index.js';
import {digest} from '../src/files.js';

// Actual owned Windows files and Host1; PUBLIC technical permission only.
// No model, business Run, approved Provider or production qualification.
it('executes one fixed technical edit, then replays its original receipt without another file replacement',async()=>{
 const Host=Reflect.get(runtime,'RuntimeContractFileHost');expect(Host).toBeTypeOf('function');
 const root=mkdtempSync(join(tmpdir(),'cimiloop-contract-files-')),workspace=join(root,'workspace');mkdirSync(workspace);writeFileSync(join(workspace,'input.txt'),'before\n');
 const origin=runtime.AgentStartLedger.initialize(join(root,'origin'),{machine_digest:digest('PUBLIC machine').value,principal_digest:digest('PUBLIC owner').value}),scope=runtime.parseAgentWorkspaceToolScope({project_id:createInternalId(),run_id:createInternalId(),operation_key:createInternalId(),executor_actor_id:createInternalId(),context_digest:digest('PUBLIC technical original'),runtime_binding:{binding_ref:{object_type:'provider_binding',id:createInternalId()},digest:digest('PUBLIC transport descriptor pin only')},skill_bindings:[],host_admission_ref:{provider:'local_content',resource_type:'agent_host_admission',locator:digest('PUBLIC technical request').value,digest:digest('PUBLIC technical request')}});
 let authorized=true;const authority=()=>{if(!authorized)throw Error('PUBLIC revoked');return digest('PUBLIC fixed technical authority').value;};
 const host=await Host.open({workspace,tools:join(root,'tools'),origin,scope,mode:'edit',authority});
 try{const input={format:'cimiloop/workspace-tool-invocation/1.0.0',project_id:scope.project_id,run_id:scope.run_id,operation_key:scope.operation_key,executor_actor_id:scope.executor_actor_id,context_digest:scope.context_digest,call_id:'sdk_edit_1',tool:'replace_file',path:'input.txt',expected_digest:digest('before\n').value,replacement_utf8:'after\n'};
 const first=await host.execute(input);expect(first.replay).toBe(false);expect(readFileSync(join(workspace,'input.txt'),'utf8')).toBe('after\n');expect(await host.execute(input)).toEqual({...first,replay:true});expect(host.originals().calls).toHaveLength(1);expect(host.originals().calls[0]?.state).toBe('completed');
 const stat=lstatSync(join(workspace,'input.txt'),{bigint:true});expect(first.receipt.native.after_file_identity).toEqual({volume_serial:stat.dev.toString(16).padStart(8,'0'),file_index:stat.ino.toString(16).padStart(16,'0')});
 await expect(host.execute({...input,call_id:'sdk_second_write'})).rejects.toThrow();await expect(host.execute({...input,call_id:'sdk_other_path',path:'other.txt'})).rejects.toThrow();expect(host.originals().calls).toHaveLength(1);
 authorized=false;await expect(host.execute(input)).rejects.toThrow();expect(readFileSync(join(workspace,'input.txt'),'utf8')).toBe('after\n');
 }finally{await host.close();origin.close();}
},60000);

it('retains a committed edit as Unknown after losing its completion record and never sends it again',async()=>{
 const root=mkdtempSync(join(tmpdir(),'rc-lost-')),workspace=join(root,'files');mkdirSync(workspace);writeFileSync(join(workspace,'input.txt'),'before\n');
 const origin=runtime.AgentStartLedger.initialize(join(root,'origin'),{machine_digest:digest('PUBLIC machine').value,principal_digest:digest('PUBLIC owner').value}),scope=runtime.parseAgentWorkspaceToolScope({project_id:createInternalId(),run_id:createInternalId(),operation_key:createInternalId(),executor_actor_id:createInternalId(),context_digest:digest('PUBLIC technical original'),runtime_binding:{binding_ref:{object_type:'provider_binding',id:createInternalId()},digest:digest('PUBLIC descriptor')},skill_bindings:[],host_admission_ref:{provider:'local_content',resource_type:'agent_host_admission',locator:digest('PUBLIC admission').value,digest:digest('PUBLIC admission')}});
 const host=await runtime.RuntimeContractFileHost.open({workspace,tools:root,origin,scope,mode:'edit',authority:()=>digest('PUBLIC technical authority').value}),issue=origin.issueExclusive.bind(origin);
 origin.issueExclusive=(...args)=>{if(args[0]==='runtime_contract_file_completed')throw Error('PUBLIC completion persistence lost');return issue(...args);};
 const input={format:'cimiloop/workspace-tool-invocation/1.0.0',project_id:scope.project_id,run_id:scope.run_id,operation_key:scope.operation_key,executor_actor_id:scope.executor_actor_id,context_digest:scope.context_digest,call_id:'sdk_lost_1',tool:'replace_file',path:'input.txt',expected_digest:digest('before\n').value,replacement_utf8:'after\n'};
 try{await expect(host.execute(input)).rejects.toThrow('PUBLIC completion persistence lost');expect(readFileSync(join(workspace,'input.txt'),'utf8')).toBe('after\n');const original=lstatSync(join(workspace,'input.txt'),{bigint:true});
  expect(host.originals().calls).toMatchObject([{state:'unknown'}]);await expect(host.execute(input)).rejects.toThrow();await expect(host.execute({...input,call_id:'sdk_lost_2'})).rejects.toThrow();expect(host.originals().calls).toHaveLength(1);expect(lstatSync(join(workspace,'input.txt'),{bigint:true}).ino).toBe(original.ino);
 }finally{await host.close();origin.close();}
},60000);
