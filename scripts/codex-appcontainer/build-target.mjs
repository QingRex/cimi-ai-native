import {lstatSync,realpathSync} from 'node:fs';
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
