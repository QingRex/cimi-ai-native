import {afterEach,expect,it,vi} from 'vitest';
import * as app from '../src/index.js';
const source=vi.hoisted(()=>({accountTools:'R:\\account-tools',checked:[] as string[],denied:'',foreign:false,afterVolume:()=>{}}));
vi.mock('../src/agent-dedicated-installation-local.js',async load=>({...await load<typeof import('../src/agent-dedicated-installation-local.js')>(),dedicatedRuntimeInstallationWritablePaths:()=>['R:\\runtime','R:\\runtime-tools','R:\\account']}));
vi.mock('@cimiloop/runtime-adapter',async load=>({...await load<typeof import('@cimiloop/runtime-adapter')>(),readWindowsDedicatedAgentAccountWritablePaths:()=>['R:\\account',source.accountTools],assertFixedVolumeRuntimePaths(_storage:unknown,_scope:unknown,paths:string[]){source.checked=[...paths];if(paths.includes(source.denied))throw Error('PUBLIC off-volume');source.afterVolume();return{runtime_ticket:{identity_digest:source.foreign?'PUBLIC foreign Host':'PUBLIC Host'}};}}));
afterEach(()=>{source.accountTools='R:\\account-tools';source.checked=[];source.denied='';source.foreign=false;source.afterVolume=()=>{};});
// PUBLIC source/volume facts. This verifies application assembly, never actual
// physical quota or approval; genuine account roots are tested on Windows.
const local:any={store:{getProject:()=>({id:'PUBLIC project'})},location:{repositoryPath:'R:\\repo',dataDirectory:'R:\\repo\\.git\\cimiloop'}},installed:any={account_root:'R:\\account',installation_digest:'PUBLIC installed',origin:{identityDigest:'PUBLIC Host'},guard(){}};
function read(account:unknown={}){const method=Reflect.get(app,'assertDedicatedRuntimeWritableStorage');expect(method).toBeTypeOf('function');return Reflect.apply(method,undefined,[local,installed,account,{}]) as {paths:string[]};}
it('checks original installation, actual account and account helper roots in the same fixed volume',()=>{expect(read().paths).toEqual(['R:\\runtime','R:\\runtime-tools','R:\\account','R:\\account-tools']);expect(source.checked).toEqual(read().paths);});
it.each(['R:\\runtime','R:\\runtime-tools','R:\\account','R:\\account-tools'])('rejects an uncovered original writable root %s',root=>{source.denied=root;expect(()=>read()).toThrow('全部可写');});
it('rejects a different Host quota and caller-supplied writable manifests',()=>{source.foreign=true;expect(()=>read({writable_paths:['R:\\pretend-only']})).toThrow('全部可写');source.foreign=false;expect(read({writable_paths:['R:\\pretend-only']}).paths).not.toContain('R:\\pretend-only');});
it('rechecks original source roots after the volume reader returns',()=>{source.afterVolume=()=>{source.accountTools='R:\\changed-tools';};expect(()=>read()).toThrow('全部可写');});
