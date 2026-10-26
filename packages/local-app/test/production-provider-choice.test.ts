import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {createInternalId} from '@cimiloop/protocol/v2';
import {digest} from '@cimiloop/runtime-adapter';
import type {AgentStartLedger,DedicatedAgentAccountPolicy,DedicatedModelConnection} from '@cimiloop/runtime-adapter';
import type {LocalProject} from '../src/project.js';
import {productionAgentRuntime,openInstalledProductionRuntime,productionAccountAdmission,productionModelFeeAuthorized} from '../src/agent-production-admission-local.js';
const state=vi.hoisted(()=>({installed:false,connectionReads:0,connection:undefined as unknown}));
vi.mock('../src/agent-codex-installation-local.js',async load=>({...await load<typeof import('../src/agent-codex-installation-local.js')>(),hasInstalledCodexAgentRuntime:()=>state.installed}));
vi.mock('../../runtime-adapter/dist/index.js',async load=>({...await load<typeof import('../../runtime-adapter/dist/index.js')>(),loadModelConnection:()=>{state.connectionReads++;return state.connection;}}));
afterEach(()=>{state.installed=false;state.connectionReads=0;state.connection=undefined;});
// PUBLIC metadata only. The test neither opens credentials nor qualifies a
// Runtime; it proves that a connection file cannot choose a paid provider.
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'cimiloop-provider-choice-')),id=createInternalId();
 const connection:DedicatedModelConnection={format:'cimiloop/dedicated-model/1.0.0',provider:'openai-compatible',model:'openai-compatible/deepseek-v4.1-flash',endpoint:'https://opencode.ai/inference/go/openai/v1/chat/completions',credential_file:join(root,'PUBLIC-never-opened'),credential_digest:digest('PUBLIC')};state.connection=connection;
 const local={store:{getProject:()=>({id})},kernel:{},instance:{project_id:id,actor_id:createInternalId()},location:{repositoryPath:root,dataDirectory:root}} as unknown as LocalProject;
 return{local,connection};
}
it.each([false,true])('uses only the chosen Codex route with installed=%s and never reads an HTTP connection',async installed=>{
 const {local}=fixture();state.installed=installed;await expect(productionAgentRuntime('PUBLIC unstarted Run',local)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE',details:{plan:'Codex login',production_admission:'unapproved',missing:installed?['Codex Context 前完整准入']:['Codex 原安装','Codex Context 前完整准入']}});expect(state.connectionReads).toBe(0);
});
it('keeps the exported installed-runtime entry on the same Codex admission path',async()=>{const {local}=fixture();await expect(openInstalledProductionRuntime('PUBLIC unstarted Run',local)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE',details:{plan:'Codex login',missing:['Codex 原安装','Codex Context 前完整准入']}});expect(state.connectionReads).toBe(0);});
it('does not turn the old Go model and five-dollar metadata into a new fee authorization',async()=>{
 const {connection}=fixture(),origin={identityDigest:'1'.repeat(64)} as AgentStartLedger;
 const policy={host_identity_digest:origin.identityDigest,connection_digest:digest(JSON.stringify(connection)).value,profile:{model:'deepseek-v4.1-flash',thinking:'disabled'},cash_limit_micros:5_000_000,cash_per_call_upper_micros:5_000_000,credit_limit_micro_units:0,credit_per_call_upper_micro_units:0} as DedicatedAgentAccountPolicy;
 expect(productionModelFeeAuthorized(connection,policy)).toBe(false);
});
it('refuses a new HTTP account admission even when historical connection and host digests match',async()=>{
 const {connection}=fixture(),origin={identityDigest:'1'.repeat(64)} as AgentStartLedger;
 const policy={host_identity_digest:origin.identityDigest,connection_digest:digest(JSON.stringify(connection)).value,profile:{model:'deepseek-v4.1-flash',thinking:'disabled'},cash_limit_micros:5_000_000,cash_per_call_upper_micros:5_000_000,credit_limit_micro_units:0,credit_per_call_upper_micro_units:0} as DedicatedAgentAccountPolicy;
 await expect(productionAccountAdmission(origin).check({} as never,connection,policy)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE',details:{plan:'Codex login'}});
});
