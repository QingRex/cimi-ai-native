import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {AgentStartLedger,digest} from '@cimiloop/runtime-adapter';
import {createInternalId} from '@cimiloop/protocol/v2';
import * as app from '../src/index.js';
import {readHumanAgentPreparationReceipt} from '../src/agent-human-preparation-original-local.js';
import {createAgentRunProject} from '../../../tests/fixtures/agent-run-project.js';
import {flowTime} from '../../../tests/fixtures/flow-project.js';
type Source={origin:AgentStartLedger;guard():void;release():void};
const seam=vi.hoisted(()=>({dedicated:undefined as Source|undefined,codex:undefined as Source|undefined,fullReads:0,reads:[] as string[],closed:[] as string[]}));
vi.mock('../src/agent-dedicated-installation-local.js',async load=>({...await load<typeof import('../src/agent-dedicated-installation-local.js')>(),openOriginalDedicatedRuntimeCustody:async()=>{seam.reads.push('dedicated');return seam.dedicated;}}));
vi.mock('../src/agent-codex-installation-local.js',async load=>({...await load<typeof import('../src/agent-codex-installation-local.js')>(),openInstalledCodexAgentRuntime:async()=>{seam.fullReads++;throw Error('PUBLIC no execution programs');},openOriginalCodexRuntimeCustody:async()=>{seam.reads.push('codex');return seam.codex;}}));
const closers:(()=>void)[]=[];
afterEach(()=>{while(closers.length)closers.pop()!();vi.useRealTimers();seam.dedicated=undefined;seam.codex=undefined;seam.reads=[];seam.closed=[];seam.fullReads=0;});
vi.setConfig({testTimeout:120000});
async function fixture(){
 vi.useFakeTimers({now:new Date(flowTime),toFake:['Date']});const root=mkdtempSync(join(tmpdir(),'cimiloop-human-original-')),f=createAgentRunProject(root,'task_execution',100,[{provider:'cimiloop_workspace',resource_type:'repository_path',locator:'src/**',version:'1.0.0'}],['read_files','run_checks'],['src/**']);closers.push(()=>f.store.close());
 const check="import{query}from'./query.ts';if(query()!==1)throw Error('PUBLIC');\n";writeFileSync(join(root,'src/check.mjs'),check);f.git('add','src/check.mjs');f.git('commit','--quiet','-m','PUBLIC check');const source=f.capture(),data=dirname(f.path);
 app.writeInstance(join(data,'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});const local=app.openLocalProject({projectDir:root});closers.push(()=>local.store.close());
 const origin=AgentStartLedger.initialize(join(data,'PUBLIC-dedicated-origin'),{machine_digest:'1'.repeat(64),principal_digest:'2'.repeat(64)});closers.push(()=>origin.close());
 const full={admit:f.runPort.agent.admitContext.bind(f.runPort.agent),verifyLaunch:()=>digest('PUBLIC'),verifyModel:()=>digest('PUBLIC'),verifyTool:()=>digest('PUBLIC')};
 const command={...f.prepareCommand(),actor_id:local.instance.actor_id,acting_role:'technical_owner' as const,source:{origin:'human_cli' as const,producer:'cimiloop-cli',repository_path:root},payload:{...f.pins,source_snapshot_ref:{object_type:'source_snapshot' as const,id:source.id}}};
 const admission=await app.LocalAgentRuntimeAdmission.open(local,{origin,nodeBinary:process.execPath,templates:[{check_id:'query_test',profile:'node_test',entry:'src/check.mjs',inputs:[{path:'src/check.mjs',expected_digest:digest(check).value},{path:'src/query.ts'}],max_elapsed_ms:1000,max_output_bytes:4096}],full});
 let result;try{result=app.executeHumanAgentRunCommand(local,command);expect(result).toHaveProperty('command_type','PrepareRunContext');}finally{admission.release();}
 seam.dedicated={origin,guard(){origin.readExclusive('public_read_guard','0'.repeat(64));},release(){seam.closed.push('dedicated');}};
 const second=()=>{const other=AgentStartLedger.initialize(join(data,'PUBLIC-codex-origin'),{machine_digest:'1'.repeat(64),principal_digest:'2'.repeat(64)});closers.push(()=>other.close());seam.codex={origin:other,guard(){},release(){seam.closed.push('codex');}};return other;};
 return{f,local,origin,command,result,second};
}
it('restores the local-provider original after full execution material loss without account or model factories',async()=>{
 const f=await fixture(),before=f.local.store.asOfEventSequence();expect(await app.executeHumanAgentRunCommandAsync(f.local,f.command)).toEqual(f.result);expect(seam.fullReads).toBe(0);expect(seam.reads).toEqual(['dedicated','codex']);expect(seam.closed).toEqual(['dedicated']);expect(f.local.store.asOfEventSequence()).toBe(before);expect(f.local.store.listRuntimeRecords('context_manifest',f.f.change.id)).toHaveLength(1);
});
it('keeps a historical Codex mapping recoverable when a local provider also exists',async()=>{
 const f=await fixture(),other=f.second(),row=f.origin.listExclusive('human_agent_preparation')[0]!;other.issueExclusive('human_agent_preparation',row.id,row.basis);seam.dedicated={origin:AgentStartLedger.initialize(join(f.local.location.dataDirectory,'PUBLIC-empty-origin'),{machine_digest:'1'.repeat(64),principal_digest:'2'.repeat(64)}),guard(){},release(){seam.closed.push('dedicated');}};closers.push(()=>seam.dedicated?.origin.close());
 expect(await readHumanAgentPreparationReceipt(f.local,f.command)).toEqual(f.result);expect(seam.closed.sort()).toEqual(['codex','dedicated']);expect(seam.fullReads).toBe(0);
});
it('rejects ambiguous duplicate protected mappings even when their JSON and receipts match',async()=>{
 const f=await fixture(),other=f.second(),row=f.origin.listExclusive('human_agent_preparation')[0]!;other.issueExclusive('human_agent_preparation',row.id,row.basis);const before=f.local.store.asOfEventSequence();await expect(readHumanAgentPreparationReceipt(f.local,f.command)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(seam.closed.sort()).toEqual(['codex','dedicated']);expect(seam.fullReads).toBe(0);expect(f.local.store.asOfEventSequence()).toBe(before);
});
it('preserves command-id conflict without electing another provider or submitting again',async()=>{
 const f=await fixture(),before=f.local.store.asOfEventSequence();await expect(readHumanAgentPreparationReceipt(f.local,{...f.command,expected_revision:f.command.expected_revision+1})).rejects.toMatchObject({code:'COMMAND_ID_REUSED'});expect(seam.closed).toEqual(['dedicated']);expect(seam.fullReads).toBe(0);expect(f.local.store.asOfEventSequence()).toBe(before);
});
it('closes the first source if opening the second source changes the original Human',async()=>{
 const f=await fixture(),original=f.local.instance;let calls=0;await expect(readHumanAgentPreparationReceipt(f.local,f.command,()=>{if(seam.reads.includes('codex')&&++calls===1)f.local.instance={...original,actor_id:f.f.agent.id};})).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});f.local.instance=original;expect(seam.closed).toEqual(['dedicated']);expect(seam.fullReads).toBe(0);
});
it('does not open any original source for a command without a receipt',async()=>{
 const f=await fixture();expect(await readHumanAgentPreparationReceipt(f.local,{...f.command,command_id:createInternalId()})).toBeUndefined();expect(seam.reads).toEqual([]);expect(seam.fullReads).toBe(0);
});
it('does not run a mutating external callback after original sources close and the final uniqueness check',async()=>{
 const f=await fixture(),other=f.second(),row=f.origin.listExclusive('human_agent_preparation')[0]!;let afterClose=0;
 expect(await readHumanAgentPreparationReceipt(f.local,f.command,()=>{if(seam.closed.length){afterClose++;other.issueExclusive('human_agent_preparation',row.id,row.basis);}})).toEqual(f.result);
 expect(afterClose).toBe(0);expect(other.readExclusive('human_agent_preparation',row.id)).toBeNull();expect(seam.closed.sort()).toEqual(['codex','dedicated']);
});
