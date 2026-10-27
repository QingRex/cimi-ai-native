import {lstatSync,realpathSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {basename,dirname,isAbsolute,join,parse,relative,resolve} from 'node:path';
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
export function privateVisualStudioSourceEnvironment(path,originalText){
 const vs=ordinaryDirectory(path);
 if(typeof originalText!=='string')throw Error('Original Visual Studio environment unavailable');
 // Inspect original lines before the general environment merge can collapse
 // exact or differently-cased duplicate version records.
 const version=originalText.split(/\r?\n/).filter(line=>line.slice(0,line.indexOf('=')).toLowerCase()==='visualstudioversion');
 if(version.length!==1)throw Error('Original Visual Studio version unavailable');
 const major=/^(15|16|17|18)\.\d+$/.exec(version[0].slice(version[0].indexOf('=')+1))?.[1],year=({15:'2017',16:'2019',17:'2022',18:'2026'})[major];
 if(!year)throw Error('Unsupported original Visual Studio version');
 return{GYP_MSVS_OVERRIDE_PATH:vs,GYP_MSVS_VERSION:year,['vs'+year+'_install']:vs};
}
export function privateV8SourceBuild(config){
 if(!Object.hasOwn(config,'v8_source_build'))return undefined;
 const selected=config.v8_source_build;
 const explicitTools=selected&&(Object.hasOwn(selected,'gn_binary')||Object.hasOwn(selected,'ninja_binary'));
 const keys=['clang_root','format',...(selected&&Object.hasOwn(selected,'binding_clang_root')?['binding_clang_root']:[]),...(selected&&Object.hasOwn(selected,'build_jobs')?['build_jobs']:[]),...(explicitTools?['gn_binary','ninja_binary']:[])];
 if(!selected||Object.keys(selected).sort().join(',')!==keys.sort().join(',')||selected.format!=='cimiloop/locked-v8-sandbox-source/1.0.0')throw Error('Explicit locked V8 source build required');
 const jobs=Object.hasOwn(selected,'build_jobs')?selected.build_jobs:1;
 if(!Number.isInteger(jobs)||jobs<1||jobs>4)throw Error('V8 build jobs must be an explicit integer from 1 to 4');
 const clang=ordinaryDirectory(selected.clang_root),bin=join(clang,'bin'),bindingBin=Object.hasOwn(selected,'binding_clang_root')?join(ordinaryDirectory(selected.binding_clang_root),'bin'):bin;
 const seal=raw=>{
  if(typeof raw!=='string'||!isAbsolute(raw))throw Error('Original V8 build tool must be absolute');
  const path=join(ordinaryDirectory(dirname(raw)),basename(raw)),before=lstatSync(path,{bigint:true});
  if(!before.isFile()||before.isSymbolicLink()||before.size<2n||before.size>512n*1024n**2n)throw Error('Original V8 Clang tool unavailable');
  const bytes=readFileSync(path),after=lstatSync(path,{bigint:true});
  if(bytes.subarray(0,2).toString()!=='MZ'||before.dev!==after.dev||before.ino!==after.ino||before.birthtimeNs!==after.birthtimeNs||before.mtimeNs!==after.mtimeNs||before.size!==after.size||BigInt(bytes.length)!==before.size)throw Error('Original V8 Clang tool changed');
  return{path,sha256:createHash('sha256').update(bytes).digest('hex'),identity:{dev:String(before.dev),ino:String(before.ino),birth:String(before.birthtimeNs)}};
 };
 const materials=['clang.exe','clang-cl.exe','libclang.dll','lld-link.exe'].map(name=>seal(join(name==='libclang.dll'?bindingBin:bin,name)));
 if(explicitTools)materials.push(seal(selected.gn_binary),seal(selected.ninja_binary));
 // The pinned Cargo feature still selects v8_enable_sandbox. No arbitrary GN
 // arguments or prebuilt substitutions are accepted by this configuration.
 return{environment:{V8_FROM_SOURCE:'1',CARGO_BUILD_JOBS:String(jobs),CLANG_BASE_PATH:clang,LIBCLANG_PATH:bindingBin,...(explicitTools?{GN:materials[4].path,NINJA:materials[5].path}:{})},materials};
}
