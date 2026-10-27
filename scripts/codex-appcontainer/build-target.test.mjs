import {mkdtempSync,mkdirSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';import test from 'node:test';import assert from 'node:assert/strict';
import {privateBuildTarget} from './build-target.mjs';
const format='cimiloop/private-codex-build-tools/3.0.0';
test('separate build targets require an explicit existing original directory',()=>{
 const base=mkdtempSync(join(tmpdir(),'cimi-build-target-')),root=join(base,'build'),target=join(base,'target');mkdirSync(root);mkdirSync(target);
 assert.equal(privateBuildTarget(root,{format:'cimiloop/private-codex-build-tools/2.0.0'}),join(root,'target'));
 assert.equal(privateBuildTarget(root,{format,target_directory:target}),target);
 for(const path of ['relative',join(base,'missing'),root,base,join(root,'source'),dirname(root).slice(0,3)])assert.throws(()=>privateBuildTarget(root,{format,target_directory:path}));
 const file=join(base,'file');writeFileSync(file,'PUBLIC build fixture');assert.throws(()=>privateBuildTarget(root,{format,target_directory:file}));
 const repository=fileURLToPath(new URL('../..',import.meta.url));assert.throws(()=>privateBuildTarget(root,{format,target_directory:repository}));
});
test('a linked target or linked ancestor cannot redirect build output',()=>{
 const base=mkdtempSync(join(tmpdir(),'cimi-build-target-')),root=join(base,'build'),target=join(base,'target'),link=join(base,'link');mkdirSync(root);mkdirSync(target);mkdirSync(join(target,'child'));symlinkSync(target,link,process.platform==='win32'?'junction':'dir');
 assert.throws(()=>privateBuildTarget(root,{format,target_directory:link}));assert.throws(()=>privateBuildTarget(root,{format,target_directory:join(link,'child')}));
});
