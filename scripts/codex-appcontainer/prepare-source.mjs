import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,lstatSync,realpathSync,existsSync,mkdirSync,openSync,fsyncSync,closeSync,readdirSync} from 'node:fs';
import {resolve,dirname,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {addPrivatePipeSource} from './pipe-source.mjs';

export const upstreamCommit='c1382380de69521303b416720a52f42d51af6248';
export const compatibilityVersion='0.162.0+cimiloop-lowbox.1';
export const pipeCompatibilityVersion='0.162.0+cimiloop-lowbox.2';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const lf=bytes=>bytes.toString('utf8').replaceAll('\r\n','\n');
const replace=(text,before,after)=>{if(text.split(before).length!==2)throw Error('Pinned source shape changed');return text.replace(before,after);};
function ordinary(path){path=resolve(path);for(let current=path;;current=dirname(current)){if(lstatSync(current).isSymbolicLink())throw Error('Linked source path refused');if(dirname(current)===current)break;}return path;}
function save(path,value){const fd=openSync(path,'wx');try{writeFileSync(fd,JSON.stringify(value,null,2));fsyncSync(fd);}finally{closeSync(fd);}}

export function sourcePlan(rawRoot,{privatePipe=false,reqwestArchives}={}){
 if(typeof privatePipe!=='boolean'||!privatePipe&&reqwestArchives!==undefined)throw Error('Explicit private pipe source selection required');
 const version=privatePipe?pipeCompatibilityVersion:compatibilityVersion;
 const root=realpathSync.native(ordinary(rawRoot));
 const git=args=>execFileSync('git',['-C',root,...args],{windowsHide:true,encoding:'utf8',maxBuffer:8*1024**2,env:{...process.env,GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0'}});
 if(git(['rev-parse','HEAD']).trim()!==upstreamCommit)throw Error('Expected pinned official Codex commit');
 const blob=path=>git(['show',upstreamCommit+':'+path]).replaceAll('\r\n','\n');
 const manifestPaths=git(['ls-files','codex-rs/**/Cargo.toml']).trim().split('\n').filter(Boolean);
 const names=new Set(manifestPaths.flatMap(path=>{const text=lf(readFileSync(ordinary(join(root,path))));return /^version\.workspace\s*=\s*true\s*$/m.test(text)?[/^name\s*=\s*"([^"]+)"/m.exec(text)?.[1]]:[];}).filter(Boolean));
 if(names.size!==161)throw Error('Pinned workspace package set changed');
 const before=new Map(),files=new Map();
 const edit=(path,transform)=>{const original=blob(path);before.set(path,sha(original));files.set(path,transform(original));};
 edit('codex-rs/Cargo.toml',text=>replace(text,'version = "0.162.0"','version = "'+version+'"'));
 edit('codex-rs/Cargo.lock',text=>{
  let changed=0;const blocks=text.split('[[package]]');
  for(let index=1;index<blocks.length;index++){
   let block=blocks[index];const name=/^name = "([^"]+)"/m.exec(block)?.[1];
   if(names.has(name)&&!/^source = /m.test(block)){block=replace(block,'version = "0.0.0"','version = "'+version+'"');changed++;}
   for(const name of names)block=block.replaceAll('"'+name+' 0.0.0"','"'+name+' '+version+'"');
   blocks[index]=block;
  }
  if(changed!==161)throw Error('Pinned local lock entries changed');return blocks.join('[[package]]');
 });
 const helper=lf(readFileSync(new URL('./canonicalize_windows.rs',import.meta.url)));
 files.set('codex-rs/utils/absolute-path/src/appcontainer_windows.rs',helper);
 edit('codex-rs/utils/absolute-path/src/lib.rs',text=>{
  const wrapper='mod absolutize;\n#[cfg(windows)]\nmod appcontainer_windows;\n\n/// Resolve a real canonical file path, including local volume metadata in a lowbox.\npub fn canonicalize(path: impl AsRef<Path>) -> std::io::Result<PathBuf> {\n    match dunce::canonicalize(path.as_ref()) {\n        Ok(value) => Ok(value),\n        Err(error) => {\n            #[cfg(windows)]\n            { appcontainer_windows::after_error(path.as_ref(), error) }\n            #[cfg(not(windows))]\n            { Err(error) }\n        }\n    }\n}\n';
  text=replace(text,'mod absolutize;',wrapper);const at=text.indexOf('mod system_aliases;');if(at<0)throw Error('Pinned module boundary changed');return text.slice(0,at)+text.slice(at).replaceAll('dunce::canonicalize(','canonicalize(');
 });
 edit('codex-rs/utils/home-dir/src/lib.rs',text=>replace(text,'let canonical = path.canonicalize()','let canonical = codex_utils_absolute_path::canonicalize(&path)'));
 edit('codex-rs/config/src/loader/mod.rs',text=>replace(text,'use dunce::canonicalize as normalize_path;','use codex_utils_absolute_path::canonicalize as normalize_path;'));
 const transport=privatePipe?addPrivatePipeSource({files,edit,blob,archives:reqwestArchives}):undefined;
 const changes=()=>git(['-c','status.renames=false','status','--porcelain=v1','-z','--untracked-files=all']).split('\0').filter(Boolean);
 return{root,files,before,changes,commit:upstreamCommit,version,helper_digest:sha(helper),...(transport?{transport}:{})};
}

function verifyVendorTrees(plan){
 if(!plan.transport)return;
 for(const version of ['0.12.28','0.13.4']){
  const prefix='codex-rs/vendor/cimiloop-reqwest-'+version+'/',expected=new Set([...plan.files.keys()].filter(path=>path.startsWith(prefix)));
  const visit=path=>{const local=ordinary(join(plan.root,path)),info=lstatSync(local);if(info.isDirectory()){for(const entry of readdirSync(local))visit(path+'/'+entry);}else if(!info.isFile()||!expected.delete(path))throw Error('Unexpected vendored dependency material');};
  visit(prefix.slice(0,-1));if(expected.size)throw Error('Vendored dependency material missing');
 }
}
export function prepareSource(rawRoot,{verify=false,receiptDirectory,privatePipe=false,reqwestArchives}={}){
 const plan=sourcePlan(rawRoot,{privatePipe,...(reqwestArchives?{reqwestArchives}:{})}),changes=plan.changes();
 if(!verify&&changes.length)throw Error('Source checkout is dirty; preserve it and use a fresh pinned clone');
 if(verify&&changes.some(row=>!plan.files.has(row.slice(3))))throw Error('Unexpected source changes; do not adopt this build');
 if(!verify){for(const [path]of plan.files){const target=join(plan.root,path);if(plan.before.has(path)){ordinary(target);if(sha(lf(readFileSync(target)))!==plan.before.get(path))throw Error('Original source changed before patch');}else if(existsSync(target))throw Error('Existing compatibility source must not be overwritten');}}
 if(!verify){for(const [path,body]of plan.files){const target=join(plan.root,path);let parent=dirname(target);while(!existsSync(parent))parent=dirname(parent);ordinary(parent);mkdirSync(dirname(target),{recursive:true});ordinary(dirname(target));writeFileSync(target,body,{encoding:'utf8',flag:plan.before.has(path)?'w':'wx'});}}
 const materials=[...plan.files].map(([path,body])=>{const target=ordinary(join(plan.root,path)),bytes=readFileSync(target);if(typeof body==='string'?lf(bytes)!==body:!bytes.equals(body))throw Error('Compatibility source differs from the fixed plan');const s=lstatSync(target,{bigint:true});if(!s.isFile()||s.nlink!==1n)throw Error('Non-original source material');return{path,canonical_sha256:sha(body),sha256:sha(bytes),identity:{dev:String(s.dev),ino:String(s.ino),birth:String(s.birthtimeNs)}};});
 verifyVendorTrees(plan);
 const result={format:plan.transport?'cimiloop/codex-compatibility-source/2.0.0':'cimiloop/codex-compatibility-source/1.0.0',scope:'offline_compatibility_build',source_root:plan.root,upstream_commit:plan.commit,version:plan.version,helper_digest:plan.helper_digest,...(plan.transport?{transport:plan.transport}:{}),materials,provider_qualification_proven:false};
 if(receiptDirectory){if(!isAbsolute(receiptDirectory))throw Error('Receipt directory must be absolute');mkdirSync(receiptDirectory);save(join(receiptDirectory,'source.json'),result);}
 return result;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),root=args.shift(),options={},seen=new Set();
 for(let at=0;at<args.length;at++){const flag=args[at];if(seen.has(flag))throw Error('Repeated source option');seen.add(flag);if(flag==='--verify')options.verify=true;else if(flag==='--private-pipe')options.privatePipe=true;else if(flag==='--reqwest-012'||flag==='--reqwest-013'){const path=args[++at];if(!path||!isAbsolute(path))throw Error('Dependency archive path must be absolute');options.reqwestArchives??={};options.reqwestArchives[flag==='--reqwest-012'?'0.12.28':'0.13.4']=path;}else throw Error('Unknown source option');}
 if(!root||root.startsWith('--'))throw Error('Usage: node prepare-source.mjs <pinned-clone> [--private-pipe --reqwest-012 <archive> --reqwest-013 <archive>] [--verify]');
 const result=prepareSource(root,options);console.log(JSON.stringify(result,null,2));
}
