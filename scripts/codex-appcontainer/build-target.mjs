import {lstatSync,realpathSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,isAbsolute,join,parse,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const external=(parent,child)=>{const path=relative(parent,child);return isAbsolute(path)||path==='..'||path.startsWith('..\\')||path.startsWith('../');};
function ordinaryDirectory(path){
 if(typeof path!=='string'||!isAbsolute(path))throw Error('Build target must be an absolute existing directory');
 for(let current=resolve(path);;current=dirname(current)){const value=lstatSync(current);if(value.isSymbolicLink()||!value.isDirectory())throw Error('Linked or non-directory build target refused');if(dirname(current)===current)break;}
 return realpathSync.native(path);
}
// Developer build layout only. Separate targets neither move nor delete the
// original cache, toolchain, source, receipts or stopped Job.
export function privateBuildTarget(root,config){
 if(config.format!=='cimiloop/private-codex-build-tools/3.0.0')return join(root,'target');
 const target=ordinaryDirectory(config.target_directory),build=ordinaryDirectory(root),repository=resolve(fileURLToPath(new URL('../..',import.meta.url)));
 if(target===parse(target).root||!external(build,target)||!external(target,build)||!external(repository,target)||!external(target,repository))throw Error('Separate target must be outside the build root and repository');
 return target;
}
export function privateV8SourceBuild(config){
 if(!Object.hasOwn(config,'v8_source_build'))return undefined;
 const selected=config.v8_source_build;
 if(!selected||Object.keys(selected).sort().join(',')!=='clang_root,format'||selected.format!=='cimiloop/locked-v8-sandbox-source/1.0.0')throw Error('Explicit locked V8 source build required');
 const clang=ordinaryDirectory(selected.clang_root),bin=join(clang,'bin');
 const materials=['clang.exe','clang-cl.exe','libclang.dll','lld-link.exe'].map(name=>{
  const path=join(bin,name);ordinaryDirectory(bin);const before=lstatSync(path,{bigint:true});
  if(!before.isFile()||before.isSymbolicLink()||before.size<2n||before.size>512n*1024n**2n)throw Error('Original V8 Clang tool unavailable');
  const bytes=readFileSync(path),after=lstatSync(path,{bigint:true});
  if(bytes.subarray(0,2).toString()!=='MZ'||before.dev!==after.dev||before.ino!==after.ino||before.birthtimeNs!==after.birthtimeNs||before.mtimeNs!==after.mtimeNs||before.size!==after.size||BigInt(bytes.length)!==before.size)throw Error('Original V8 Clang tool changed');
  return{path,sha256:createHash('sha256').update(bytes).digest('hex'),identity:{dev:String(before.dev),ino:String(before.ino),birth:String(before.birthtimeNs)}};
 });
 // The pinned Cargo feature still selects v8_enable_sandbox. No arbitrary GN
 // arguments or prebuilt substitutions are accepted by this configuration.
 return{environment:{V8_FROM_SOURCE:'1',CARGO_BUILD_JOBS:'1',CLANG_BASE_PATH:clang,LIBCLANG_PATH:bin},materials};
}
