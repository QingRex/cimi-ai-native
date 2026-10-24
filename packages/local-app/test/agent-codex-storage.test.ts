import {existsSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {describe,it,expect} from 'vitest';
import {AgentStartLedger,digest} from '@cimiloop/runtime-adapter';
import {openCodexRuntimeStorage,installCodexRuntimeStorage} from '../src/agent-codex-storage-local.js';
import {createIntentProject} from '../../../tests/fixtures/intent-project.js';
import type {InstalledCodexAgentRuntime} from '../src/agent-codex-installation-local.js';
import {openLocalProject} from '../src/project.js';
import {writeInstance} from '../src/instance.js';

// Actual SQLite/immutable Host1 and default application reader. PUBLIC installed
// account/binaries; no volume is created and no model/login is opened.
describe('Codex fixed-volume installation boundary',()=>{
 function fixture(){
  const root=mkdtempSync(join(tmpdir(),'cimiloop-storage-install-')),project=join(root,'project'),data=join(project,'.cimiloop'),f=createIntentProject(project,{databasePath:join(data,'project.db')});
  const origin=AgentStartLedger.initialize(join(root,'origin'),{machine_digest:'1'.repeat(64),principal_digest:'2'.repeat(64)});
  writeInstance(join(data,'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
  const local=openLocalProject({projectDir:project});
  let guards=0;const installed:InstalledCodexAgentRuntime={origin,root:join(root,'installed'),binary:process.execPath,native_binary:process.execPath,node_binary:process.execPath,model:'gpt-6-luna',account_digest:'1'.repeat(64),quota_account_digest:'2'.repeat(64),output_profile:'bounded_2048/1.0.0',usage_policy:'require_ordinary_permission/1.0.0',disabled_mcp_servers:[],checks:[],installation_digest:'3'.repeat(64),guard(){guards++;},release(){}};
  return{root,local,installed,origin,guards:()=>guards,close(){origin.close();local.store.close();f.store.close();}};
 }
 it('does not create a policy, reader or model while opening an absent storage attachment',async()=>{
  const f=fixture();try{expect(await openCodexRuntimeStorage(f.local,f.installed)).toBeUndefined();expect(f.origin.listExclusive('codex_runtime_storage')).toHaveLength(0);expect(f.origin.listExclusive('fixed_volume_runtime')).toHaveLength(0);expect(existsSync(f.installed.root)).toBe(false);expect(f.guards()).toBeGreaterThan(0);}finally{f.close();}
 });
 it('retains a corrupt original attachment and refuses before creating a missing reader',async()=>{
  const f=fixture();try{const key=digest(f.installed.installation_digest).value;f.origin.issueExclusive('codex_runtime_storage',key,{PUBLIC:'corrupt original'});const before=f.origin.readExclusive('codex_runtime_storage',key);
   await expect(openCodexRuntimeStorage(f.local,f.installed)).rejects.toThrow('原固定卷');expect(f.origin.readExclusive('codex_runtime_storage',key)).toEqual(before);expect(existsSync(f.installed.root)).toBe(false);
  }finally{f.close();}
 });
 it.each(['fixed_volume_reader','fixed_volume_reader_ready','fixed_volume_runtime','fixed_volume_quota'])('reports a pending %s as unavailable rather than a fresh missing installation',async namespace=>{
  const f=fixture();try{const key=namespace==='fixed_volume_runtime'?digest(f.local.instance.project_id).value:digest(f.installed.installation_digest).value;f.origin.issueExclusive(namespace,key,{PUBLIC:'incomplete original intent'});const before=f.origin.readExclusive(namespace,key);
   await expect(openCodexRuntimeStorage(f.local,f.installed)).rejects.toThrow('原固定卷');expect(f.origin.readExclusive(namespace,key)).toEqual(before);expect(existsSync(f.installed.root)).toBe(false);
  }finally{f.close();}
 });
 it('refuses an off-volume existing project before opening an installation or changing its database',async()=>{
  const f=fixture();try{const before=f.local.store.asOfEventSequence();await expect(installCodexRuntimeStorage(f.local,{image:'D:\\PUBLIC\\absent.vhdx',volume_root:'R:\\',maximum_bytes:1024**3})).rejects.toThrow('原固定卷');expect(f.local.store.asOfEventSequence()).toBe(before);expect(existsSync(f.installed.root)).toBe(false);}finally{f.close();}
 });
});
