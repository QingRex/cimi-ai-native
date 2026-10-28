import {mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import type {LocalProject} from '../src/project.js';
import {openRuntimeContractExecution} from '../src/runtime-contract-native-local.js';
import {openSkillMethodProbeExecution} from '../src/skill-method-probe-native-local.js';

const state=vi.hoisted(()=>({opens:0,homes:0,closed:0,afterOpen:()=>{},afterStorage:()=>{}}));
// PUBLIC account/storage seam only. Real selection marker and production
// factories; no credential, Native/model launch or qualification evidence.
vi.mock('../src/agent-codex-usage-budget-local.js',()=>({openInstalledCodexUsageBudget:async()=>{state.opens++;state.afterOpen();return{installation:{installation_digest:'1'.repeat(64)},guard(){},release(){state.closed++;}};}}));
vi.mock('../src/agent-codex-storage-local.js',()=>({openCodexRuntimeStorage:async()=>{state.afterStorage();return{PUBLIC:true};}}));
vi.mock('../src/agent-codex-login-home-local.js',()=>({openCodexRuntimeLoginHome:async()=>{state.homes++;return{PUBLIC:true};},assertCodexRuntimeLoginHome(){throw Error('No login execution in this test');}}));
vi.mock('../src/agent-codex-writable-storage-local.js',()=>({assertCodexRuntimeWritableStorage(){return{PUBLIC:true};}}));
afterEach(()=>{state.opens=state.homes=state.closed=0;state.afterOpen=()=>{};state.afterStorage=()=>{};});
function fixture(){const root=mkdtempSync(join(tmpdir(),'cimiloop-technical-selection-'));return{local:{location:{dataDirectory:root,repositoryPath:root}} as LocalProject,select(){mkdirSync(join(root,'dedicated-runtime-placement'));}};}
for(const[name,open]of [['Runtime contract',openRuntimeContractExecution],['isolated Skill',openSkillMethodProbeExecution]] as const){
 it(`${name} refuses the old login before opening an account when local provider is selected`,async()=>{
  const f=fixture();f.select();await expect(open(f.local)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE',details:{plan:'local OpenAI-compatible'}});expect(state.opens).toBe(0);expect(state.homes).toBe(0);
 });
 it(`${name} closes the borrowed account and stops before login if selection changes during its await`,async()=>{
  const f=fixture();state.afterOpen=f.select;await expect(open(f.local)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE',details:{plan:'local OpenAI-compatible'}});expect(state.opens).toBe(1);expect(state.homes).toBe(0);expect(state.closed).toBe(1);
 });
 it(`${name} rechecks selection after storage await and before login`,async()=>{
  const f=fixture();state.afterStorage=f.select;await expect(open(f.local)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE',details:{plan:'local OpenAI-compatible'}});expect(state.homes).toBe(0);expect(state.closed).toBe(1);
 });
 it(`${name} rejects an already borrowed execution guard after provider selection changes`,async()=>{
  const f=fixture(),lease=await open(f.local);try{f.select();expect(()=>lease.guard()).toThrow('本地 OpenAI');}finally{await lease.release();}expect(state.closed).toBe(1);
 });
}
