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
test('explicit GN and Ninja replace an unavailable download without accepting arbitrary build arguments',()=>{
 const base=mkdtempSync(join(tmpdir(),'cimi-v8-tools-')),bin=join(base,'llvm','bin');mkdirSync(bin,{recursive:true});
 for(const name of ['clang.exe','clang-cl.exe','libclang.dll','lld-link.exe'])writeFileSync(join(bin,name),'MZ PUBLIC '+name);
 const gn=join(base,'gn.exe'),ninja=join(base,'ninja.exe');writeFileSync(gn,'MZ PUBLIC pinned GN');writeFileSync(ninja,'MZ PUBLIC installed Ninja');
 const policy={format:'cimiloop/locked-v8-sandbox-source/1.0.0',clang_root:join(base,'llvm'),gn_binary:gn,ninja_binary:ninja};
 const original=build.privateV8SourceBuild({v8_source_build:policy});
 assert.equal(original.environment.GN,gn);assert.equal(original.environment.NINJA,ninja);assert.equal(original.materials.length,6);
 assert.throws(()=>build.privateV8SourceBuild({v8_source_build:{...policy,ninja_binary:join(base,'missing.exe')}}));
 assert.throws(()=>build.privateV8SourceBuild({v8_source_build:{format:policy.format,clang_root:policy.clang_root,gn_binary:gn}}));
 assert.throws(()=>build.privateV8SourceBuild({v8_source_build:{...policy,EXTRA_GN_ARGS:'v8_enable_sandbox=false'}}));
 writeFileSync(gn,'MZ PUBLIC replaced GN');assert.notDeepEqual(build.privateV8SourceBuild({v8_source_build:policy}),original);
});
test('V8 uses the selected Visual Studio installation instead of rediscovering an absent default location',()=>{
 assert.equal(typeof build.privateVisualStudioSourceEnvironment,'function');
 const base=mkdtempSync(join(tmpdir(),'cimi-v8-vs-')),vs=join(base,'selected-build-tools');mkdirSync(vs);
 assert.deepEqual(build.privateVisualStudioSourceEnvironment(vs,'PATH=PUBLIC\r\nVisualStudioVersion=17.0\r\n'),{GYP_MSVS_OVERRIDE_PATH:vs,GYP_MSVS_VERSION:'2022',vs2022_install:vs});
 assert.deepEqual(build.privateVisualStudioSourceEnvironment(vs,'visualstudioversion=18.0'),{GYP_MSVS_OVERRIDE_PATH:vs,GYP_MSVS_VERSION:'2026',vs2026_install:vs});
 for(const text of ['', 'VisualStudioVersion=unknown', 'VisualStudioVersion=19.0', 'VisualStudioVersion=17.0\nvisualstudioversion=18.0', 'VisualStudioVersion=17.0\nVisualStudioVersion=17.0'])assert.throws(()=>build.privateVisualStudioSourceEnvironment(vs,text));
});
test('a pinned compiler can use a separately installed libclang for binding generation',()=>{
 const base=mkdtempSync(join(tmpdir(),'cimi-v8-binding-')),compiler=join(base,'compiler'),binding=join(base,'binding');mkdirSync(join(compiler,'bin'),{recursive:true});mkdirSync(join(binding,'bin'),{recursive:true});
 for(const name of ['clang.exe','clang-cl.exe','lld-link.exe'])writeFileSync(join(compiler,'bin',name),'MZ PUBLIC pinned '+name);
 writeFileSync(join(binding,'bin','libclang.dll'),'MZ PUBLIC binding library');
 const policy={format:'cimiloop/locked-v8-sandbox-source/1.0.0',clang_root:compiler,binding_clang_root:binding};
 const original=build.privateV8SourceBuild({v8_source_build:policy});assert.equal(original.environment.CLANG_BASE_PATH,compiler);assert.equal(original.environment.LIBCLANG_PATH,join(binding,'bin'));assert.equal(original.materials[2].path,join(binding,'bin','libclang.dll'));
 assert.throws(()=>build.privateV8SourceBuild({v8_source_build:{...policy,binding_clang_root:'relative'}}));
 writeFileSync(join(binding,'bin','libclang.dll'),'MZ PUBLIC replaced binding library');assert.notDeepEqual(build.privateV8SourceBuild({v8_source_build:policy}),original);
});

test('V8 build parallelism is explicit and bounded without opening arbitrary tool arguments',()=>{
 const base=mkdtempSync(join(tmpdir(),'cimi-v8-jobs-')),bin=join(base,'bin');mkdirSync(bin);
 for(const name of ['clang.exe','clang-cl.exe','libclang.dll','lld-link.exe'])writeFileSync(join(bin,name),'MZ PUBLIC '+name);
 const policy={format:'cimiloop/locked-v8-sandbox-source/1.0.0',clang_root:base};
 const original=build.privateV8SourceBuild({v8_source_build:policy});
 const parallel=build.privateV8SourceBuild({v8_source_build:{...policy,build_jobs:2}});
 assert.equal(parallel.environment.CARGO_BUILD_JOBS,'2');assert.deepEqual(parallel.materials,original.materials);
 assert.equal(build.privateV8SourceBuild({v8_source_build:{...policy,build_jobs:4}}).environment.CARGO_BUILD_JOBS,'4');
 for(const jobs of [0,5,-1,1.5,'2',null])assert.throws(()=>build.privateV8SourceBuild({v8_source_build:{...policy,build_jobs:jobs}}));
 assert.throws(()=>build.privateV8SourceBuild({v8_source_build:{...policy,build_jobs:2,GN_ARGS:'v8_enable_sandbox=false'}}));
});
