import {afterEach,it,expect,vi} from 'vitest';
import {openCodexRuntimeControlOriginals} from '../src/codex-runtime-control-originals-local.js';
import type {LocalProject} from '../src/project.js';
import type {InstalledCodexAgentRuntime} from '../src/agent-codex-installation-local.js';

const seam=vi.hoisted(()=>({stage:'account',active:true,accountReads:0,storageReads:0,homeReads:0,released:0,account:undefined as any}));
vi.mock('../src/agent-codex-usage-budget-local.js',()=>({async openInstalledCodexUsageBudget(){seam.accountReads++;if(seam.stage==='account')seam.active=false;return seam.account;}}));
vi.mock('../src/agent-codex-storage-local.js',()=>({async openCodexRuntimeStorage(){seam.storageReads++;if(seam.stage==='storage')seam.active=false;return{PUBLIC:'storage'};}}));
vi.mock('../src/agent-codex-login-home-local.js',()=>({async openCodexRuntimeLoginHome(){seam.homeReads++;if(seam.stage==='home')seam.active=false;return{PUBLIC:'home'};}}));
afterEach(()=>{seam.active=true;seam.accountReads=0;seam.storageReads=0;seam.homeReads=0;seam.released=0;seam.account=undefined;});

// PUBLIC lease factories only. These cases prove the Human guard runs after
// each awaited read and that only the newly borrowed lease is released.
it.each(['account','storage','home'])('stops on Human revocation after the %s read and closes the returned account once',async stage=>{
 seam.stage=stage;const installed={installation_digest:'PUBLIC installation',guard(){}} as InstalledCodexAgentRuntime;
 seam.account={installation:installed,guard(){},release(){seam.released++;}};
 await expect(openCodexRuntimeControlOriginals({} as LocalProject,installed,()=>{if(!seam.active)throw Error('PUBLIC Human revoked');})).rejects.toThrow('PUBLIC Human revoked');
 expect(seam.accountReads).toBe(1);expect(seam.storageReads).toBe(stage==='account'?0:1);expect(seam.homeReads).toBe(stage==='home'?1:0);expect(seam.released).toBe(1);
});
