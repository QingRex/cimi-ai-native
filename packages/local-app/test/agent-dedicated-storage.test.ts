import {existsSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {describe,it,expect} from 'vitest';
import {AgentStartLedger,digest} from '@cimiloop/runtime-adapter';
import * as app from '../src/index.js';
import {createIntentProject} from '../../../tests/fixtures/intent-project.js';

// Actual SQLite/Host1 algorithms; PUBLIC installation, no OS volume facts,
// credentials, model, login or physical-quota acceptance.
describe('dedicated original fixed-volume attachment',()=>{
 const api=(name:string)=>{const fn=Reflect.get(app,name);expect(fn,name).toBeTypeOf('function');return fn;};
 function fixture(){
  const root=mkdtempSync(join(tmpdir(),'cimiloop-dedicated-storage-')),project=join(root,'project'),data=join(project,'.cimiloop'),f=createIntentProject(project,{databasePath:join(data,'project.db')});
  const origin=AgentStartLedger.initialize(join(root,'origin'),{machine_digest:'1'.repeat(64),principal_digest:'2'.repeat(64)});
  app.writeInstance(join(data,'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
  const local=app.openLocalProject({projectDir:project});let guards=0;
  const installed={origin,root:join(root,'installed'),tools:join(root,'tools'),account_root:join(root,'account'),native_binary:process.execPath,node_binary:process.execPath,connection:{PUBLIC:'not used for storage reads'},checks:[],installation_digest:'3'.repeat(64),guard(){guards++;},release(){}};
  return{root,local,origin,installed,guards:()=>guards,close(){origin.close();local.store.close();f.store.close();}};
 }
 it('discovers no attachment without creating a reader or installation',async()=>{
  const f=fixture();try{expect(await api('openDedicatedRuntimeStorage')(f.local,f.installed)).toBeUndefined();expect(f.origin.listExclusive('dedicated_runtime_storage')).toHaveLength(0);expect(existsSync(f.installed.root)).toBe(false);expect(f.guards()).toBeGreaterThan(0);}finally{f.close();}
 });
 it('retains a corrupt original without compiling a replacement reader',async()=>{
  const f=fixture();try{const key=digest(f.installed.installation_digest).value;f.origin.issueExclusive('dedicated_runtime_storage',key,{PUBLIC:'corrupt'});const row=f.origin.readExclusive('dedicated_runtime_storage',key);
   await expect(api('openDedicatedRuntimeStorage')(f.local,f.installed)).rejects.toThrow();expect(f.origin.readExclusive('dedicated_runtime_storage',key)).toEqual(row);expect(existsSync(f.installed.root)).toBe(false);
  }finally{f.close();}
 });
 it.each(['fixed_volume_reader','fixed_volume_reader_ready','fixed_volume_runtime','fixed_volume_quota'])('retains a pending %s instead of treating it as a new install',async namespace=>{
  const f=fixture();try{const key=namespace==='fixed_volume_runtime'?digest(f.local.instance.project_id).value:digest(f.installed.installation_digest).value;f.origin.issueExclusive(namespace,key,{PUBLIC:'pending'});const row=f.origin.readExclusive(namespace,key);
   await expect(api('openDedicatedRuntimeStorage')(f.local,f.installed)).rejects.toThrow();expect(f.origin.readExclusive(namespace,key)).toEqual(row);expect(existsSync(f.installed.root)).toBe(false);
  }finally{f.close();}
 });
 it('refuses an off-volume project before opening installation or changing domain state',async()=>{
  const f=fixture();try{const before=f.local.store.asOfEventSequence();await expect(api('installDedicatedRuntimeStorage')(f.local,{image:'D:\\PUBLIC\\absent.vhdx',volume_root:'R:\\',maximum_bytes:4096*1024**2})).rejects.toThrow();expect(f.local.store.asOfEventSequence()).toBe(before);expect(existsSync(f.installed.root)).toBe(false);}finally{f.close();}
 });
});
