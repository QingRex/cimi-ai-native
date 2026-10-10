import {mkdtempSync,writeFileSync,unlinkSync,renameSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {LocalRunVerifier} from '../src/runs-local.js';import {createAgentRunProject} from '../../../tests/fixtures/agent-run-project.js';
vi.setConfig({testTimeout:120000});
// Real Git/Kernel original manifest; no fabricated Native effect is admitted.
// Actual legal Native edits are covered by the Windows production integration.
let f:ReturnType<typeof createAgentRunProject>,reader:LocalRunVerifier,workspace:ReturnType<typeof createAgentRunProject>['prepareAgent'] extends ()=>infer P?P extends {workspace:infer W}?W:never:never;
beforeEach(()=>{const root=mkdtempSync(join(tmpdir(),'cimiloop-model-workspace-'));f=createAgentRunProject(root,'task_execution',100,[{provider:'cimiloop_workspace',resource_type:'repository_path',locator:'src/**',version:'1.0.0'}],['read_files'],['src/**']);const prepared=f.prepareAgent();workspace=prepared.workspace;reader=new LocalRunVerifier(root,readerRoot());},60000);
function readerRoot(){return f.runPort.dataDirectory;}
afterEach(()=>f?.store.close());
it('keeps the complete original projection read-only',()=>{const before=f.store.asOfEventSequence();expect(reader.modelWorkspace(f.project,workspace,[],[]).current).toHaveLength(1);expect(f.store.asOfEventSequence()).toBe(before);});
it.each(['content','new file','deleted file','outside resource','index','HEAD'] as const)('refuses %s without complete same-Run original Native records',kind=>{
 const root=f.project.repository_path,path=join(root,'src/query.ts');
 if(kind==='content')writeFileSync(path,'export const query=()=>999;\n');
 if(kind==='new file')writeFileSync(join(root,'src/new.ts'),'extra');
 if(kind==='deleted file')unlinkSync(path);
 if(kind==='outside resource')writeFileSync(join(root,'outside.txt'),'foreign');
 if(kind==='index'){writeFileSync(path,'indexed');f.git('add','src/query.ts');}
 if(kind==='HEAD'){writeFileSync(path,'new commit');f.git('add','src/query.ts');f.git('commit','--quiet','-m','Foreign new commit');}
 expect(()=>reader.modelWorkspace(f.project,workspace,[],['src/query.ts'])).toThrow();
});

it.runIf(process.platform==='win32')('preserves one original file after a Windows case-only directory entry change',()=>{const root=f.project.repository_path;renameSync(join(root,'src/query.ts'),join(root,'src/QUERY.ts'));expect(reader.modelWorkspace(f.project,workspace,[],[]).current).toHaveLength(1);});
