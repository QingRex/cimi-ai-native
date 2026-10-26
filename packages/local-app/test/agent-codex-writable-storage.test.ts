import {expect,it,vi} from 'vitest';
import * as app from '../src/index.js';
const source=vi.hoisted(()=>({installation:['R:\\runtime-host','R:\\runtime-tools'],account:['R:\\account','R:\\registry','R:\\account-tools'],checked:[] as string[],denied:''}));
vi.mock('../src/agent-codex-installation-local.js',async load=>({...await load<typeof import('../src/agent-codex-installation-local.js')>(),codexRuntimeInstallationWritablePaths:()=>[...source.installation]}));
vi.mock('../src/agent-codex-usage-budget-local.js',async load=>({...await load<typeof import('../src/agent-codex-usage-budget-local.js')>(),codexUsageBudgetWritablePaths:()=>[...source.account]}));
vi.mock('../src/agent-codex-login-home-local.js',async load=>({...await load<typeof import('../src/agent-codex-login-home-local.js')>(),assertCodexRuntimeLoginHome:()=>({path:'R:\\login',identity:{PUBLIC:true}})}));
vi.mock('@cimiloop/runtime-adapter',async load=>({...await load<typeof import('@cimiloop/runtime-adapter')>(),assertFixedVolumeRuntimePaths(_storage:unknown,_scope:unknown,paths:string[]){source.checked=[...paths];if(paths.includes(source.denied))throw Error('PUBLIC off-volume');return{runtime_ticket:{identity_digest:'PUBLIC-origin'}};}}));
// PUBLIC source/volume projections only: verify the complete installed path
// intersection. These do not create a physical quota or production admission.
const local:any={store:{getProject:()=>({id:'PUBLIC-project'})},location:{repositoryPath:'R:\\repo',dataDirectory:'R:\\repo\\.git\\cimiloop'}},account:any={installation:{origin:{identityDigest:'PUBLIC-origin'}},guard(){}};
const storage={assertCodexRuntimeWritableStorage(...args:unknown[]){const method=Reflect.get(app,'assertCodexRuntimeWritableStorage');expect(method).toBeTypeOf('function');return Reflect.apply(method,undefined,args) as {paths:string[]};}};
it('checks every actual Host/account/helper root and the original login home against the same physical quota',()=>{
 source.checked=[];source.denied='';const result=storage.assertCodexRuntimeWritableStorage(local,account,{} as never,{} as never);
 expect(source.checked).toEqual([...source.installation,...source.account,'R:\\login']);expect(result.paths).toEqual(source.checked);
});
it.each(['Host','registry','account-tools'])('refuses an off-volume %s before returning any Runtime storage authority',kind=>{
 source.checked=[];source.denied=kind==='Host'?source.installation[0]!:kind==='registry'?source.account[1]!:source.account[2]!;
 expect(()=>storage.assertCodexRuntimeWritableStorage(local,account,{} as never,{} as never)).toThrow('全部可写');source.denied='';
});
it('does not accept an arbitrary caller JSON manifest as the installed writable roots',()=>{
 source.checked=[];const hostile={...account,writable_paths:['R:\\PUBLIC claimed only']};storage.assertCodexRuntimeWritableStorage(local,hostile,{} as never,{} as never);
 expect(source.checked).toEqual([...source.installation,...source.account,'R:\\login']);expect(source.checked).not.toContain('R:\\PUBLIC claimed only');
});
