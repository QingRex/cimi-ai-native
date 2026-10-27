import {mkdtempSync,mkdirSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';import test from 'node:test';import assert from 'node:assert/strict';
import {privateBuildTarget} from './build-target.mjs';
import * as build from './build-target.mjs';
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
test('V8 source builds require explicit complete Clang tools and keep sandbox feature selection in pinned source',()=>{
 assert.equal(typeof build.privateV8SourceBuild,'function');
 const base=mkdtempSync(join(tmpdir(),'cimi-v8-source-')),clang=join(base,'llvm'),bin=join(clang,'bin');mkdirSync(bin,{recursive:true});
 assert.equal(build.privateV8SourceBuild({}),undefined);
 const config={v8_source_build:{format:'cimiloop/locked-v8-sandbox-source/1.0.0',clang_root:clang}};
 assert.throws(()=>build.privateV8SourceBuild(config));
 for(const name of ['clang.exe','clang-cl.exe','libclang.dll'])writeFileSync(join(bin,name),'MZ PUBLIC '+name);
 assert.throws(()=>build.privateV8SourceBuild(config),'V8 linker/archiver must exist');
 writeFileSync(join(bin,'lld-link.exe'),'MZ PUBLIC linker');
 const original=build.privateV8SourceBuild(config);
 assert.deepEqual(original.environment,{V8_FROM_SOURCE:'1',CARGO_BUILD_JOBS:'1',CLANG_BASE_PATH:clang,LIBCLANG_PATH:bin});assert.equal(original.materials.length,4);
 assert.throws(()=>build.privateV8SourceBuild({v8_source_build:{...config.v8_source_build,GN_ARGS:'v8_enable_sandbox=false'}}));
 assert.throws(()=>build.privateV8SourceBuild({v8_source_build:{...config.v8_source_build,format:'unknown'}}));
 writeFileSync(join(bin,'libclang.dll'),'MZ PUBLIC replacement');assert.notDeepEqual(build.privateV8SourceBuild(config),original);
 const priorLinker=build.privateV8SourceBuild(config);writeFileSync(join(bin,'lld-link.exe'),'MZ PUBLIC replaced linker');assert.notDeepEqual(build.privateV8SourceBuild(config),priorLinker);
});
