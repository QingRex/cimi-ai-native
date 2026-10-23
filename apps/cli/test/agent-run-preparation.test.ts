import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeInstance } from '@cimiloop/local-app';
import { createAgentRunProject } from '../../../tests/fixtures/agent-run-project.js';

// Compiled ordinary CLI and actual Kernel/SQLite, PUBLIC Provider/host setup.
// The default full Runtime remains absent; no model/Native execution is implied.
describe('compiled Human Agent preparation commands',()=>{
 let f:ReturnType<typeof createAgentRunProject>,root:string,prepareFile:string,reserveFile:string;
 beforeAll(()=>{
  root=mkdtempSync(join(tmpdir(),'cimiloop-cli-agent-prepare-'));f=createAgentRunProject(root);
  writeInstance(join(dirname(f.path),'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
  prepareFile=join(dirname(root),'cimiloop-'+f.project.id+'-prepare.json');reserveFile=join(dirname(root),'cimiloop-'+f.project.id+'-reserve.json');
  writeFileSync(prepareFile,JSON.stringify({source_snapshot_ref:{object_type:'source_snapshot',id:f.source.id},...f.pins}),{flag:'wx'});
  writeFileSync(reserveFile,JSON.stringify(f.reserveCommand(f.prepareAgent()).payload),{flag:'wx'});
 },120000);
 afterAll(()=>f?.store.close());
 const invoke=(kind:string,target:string,file:string,role?:string)=>{const result=spawnSync(process.execPath,[resolve('apps/cli/dist/bin.js'),'--project-dir',root,'--json',...(role?['--acting-role',role]:[]),'run',kind,target,'--file',file],{encoding:'utf8',windowsHide:true,timeout:60000});if(!result.stdout)throw Error(result.stderr);return{exit:result.status,body:JSON.parse(result.stdout)};};
 it('declares technical ownership for the fixed Agent WorkItem, then reaches the real missing-host gate',()=>{const before=f.store.listRuntimeRecords('context_manifest',f.change.id).length;expect(invoke('prepare-context',f.item.id,prepareFile)).toMatchObject({exit:1,body:{ok:false,error:{code:'CAPABILITY_UNAVAILABLE'}}});expect(f.store.listRuntimeRecords('context_manifest',f.change.id)).toHaveLength(before);});
 it('uses the same Human role for original Agent reservation without creating a new Run on missing custody',()=>{expect(invoke('reserve',f.task().id,reserveFile)).toMatchObject({exit:1,body:{ok:false,error:{code:'CAPABILITY_UNAVAILABLE'}}});expect(f.store.listRuns(f.change.id)).toHaveLength(0);expect(f.task().usage.attempts_consumed).toBe(0);});
 it('keeps an explicitly selected executor role subject to the real Kernel assignment rule',()=>{expect(invoke('prepare-context',f.item.id,prepareFile,'executor')).toMatchObject({exit:1,body:{ok:false,error:{code:'EXECUTOR_NOT_ALLOWED'}}});});
});
