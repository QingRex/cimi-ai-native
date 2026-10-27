// A small compilation slice of the authenticated source plan. It is never a
// built Codex client or a production installation/qualification.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,lstatSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {join,dirname,isAbsolute,resolve} from 'node:path';
import {sourcePlan} from './prepare-source.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const selected=['http-client','websocket-client','utils/rustls-provider','utils/cargo-bin'];
function ordinary(path){for(let at=resolve(path);;at=dirname(at)){if(lstatSync(at).isSymbolicLink())throw Error('Linked module source refused');if(dirname(at)===at)break;}return path;}
function facts(path){const info=lstatSync(ordinary(path),{bigint:true});if(!info.isFile()||info.nlink!==1n)throw Error('Non-original module source');return{sha256:sha(readFileSync(path)),identity:{dev:String(info.dev),ino:String(info.ino),birth:String(info.birthtimeNs)}};}
function pins(lock){return new Set(lock.split('[[package]]').flatMap(block=>{const name=/^name = "([^"]+)"$/m.exec(block)?.[1],version=/^version = "([^"]+)"$/m.exec(block)?.[1],source=/^source = "([^"]+)"$/m.exec(block)?.[1],checksum=/^checksum = "([^"]+)"$/m.exec(block)?.[1];return name&&version&&source?[JSON.stringify([name,version,source,checksum??null])]:[];}));}

export function preparePipeModuleSource(source,output,options){
 if(!isAbsolute(output)||existsSync(output))throw Error('Module compilation source requires a fresh absolute directory');ordinary(dirname(output));
 const plan=sourcePlan(source,{...options,privatePipe:true}),materials=new Map(),gitEnv={...process.env,GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0'};
 const git=args=>execFileSync('git',['-C',plan.root,...args],{windowsHide:true,encoding:'utf8',maxBuffer:8*1024**2,env:gitEnv});
 const read=path=>execFileSync('git',['-C',plan.root,'show',plan.commit+':'+path],{windowsHide:true,maxBuffer:8*1024**2,env:gitEnv});
 for(const prefix of selected){
  const paths=git(['ls-tree','-r','--name-only',plan.commit,'--','codex-rs/'+prefix]).trim().split('\n').filter(Boolean);
  for(const path of paths){const mode=git(['ls-tree',plan.commit,'--',path]);if(!mode.startsWith('100644 ')&&!mode.startsWith('100755 '))throw Error('Non-regular upstream module source');materials.set(path.slice('codex-rs/'.length),read(path));}
 }
 for(const [path,body]of plan.files)if(path.startsWith('codex-rs/vendor/')||selected.some(prefix=>path.startsWith('codex-rs/'+prefix+'/')))materials.set(path.slice('codex-rs/'.length),body);
 let manifest=plan.files.get('codex-rs/Cargo.toml');manifest=manifest.replace(/^members = \[[\s\S]*?\]/m,'members = '+JSON.stringify([...selected,'pipe-module-check']));
 materials.set('Cargo.toml',manifest);materials.set('Cargo.lock',plan.files.get('codex-rs/Cargo.lock'));
 const config=git(['ls-tree','-r','--name-only',plan.commit,'--','codex-rs/.cargo']).trim().split('\n').filter(Boolean);for(const path of config)materials.set(path.slice('codex-rs/'.length),read(path));
 materials.set('pipe-module-check/Cargo.toml',`[package]\nname = "cimiloop-private-pipe-module-check"\nversion.workspace = true\nedition.workspace = true\n[dependencies]\nreqwest012 = { package = "reqwest", version = "=0.12.28", default-features = false, features = ["rustls-tls-native-roots", "json", "stream", "http2"] }\nreqwest013 = { package = "reqwest", version = "=0.13.4", default-features = false, features = ["rustls", "json", "stream", "http2"] }\ncodex-websocket-client = { workspace = true }\n`);
 materials.set('pipe-module-check/src/lib.rs',`// Compile both patched HTTP clients and the actual patched WebSocket dependency.\npub fn http_012() -> Result<reqwest012::Client, reqwest012::Error> { reqwest012::Client::builder().build() }\npub fn http_013() -> Result<reqwest013::Client, reqwest013::Error> { reqwest013::Client::builder().build() }\n`);
 mkdirSync(output);for(const [path,body]of materials){const target=join(output,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,body,{flag:'wx'});}
 const basis={format:'cimiloop/private-pipe-module-source/1.0.0',scope:'http_websocket_module_compilation_only',root:output,upstream_commit:plan.commit,version:plan.version,transport:plan.transport,materials:[...materials.keys()].filter(path=>path!=='Cargo.lock').map(path=>({path,...facts(join(output,path))})),lock_before:{sha256:sha(readFileSync(join(output,'Cargo.lock'))),pins:[...pins(readFileSync(join(output,'Cargo.lock'),'utf8'))].sort()},codex_client_build_proven:false};
 writeFileSync(join(output,'module-source.json'),JSON.stringify(basis,null,2),{flag:'wx'});return basis;
}

export function verifyPipeModuleSource(basis){
 if(basis.format!=='cimiloop/private-pipe-module-source/1.0.0'||basis.scope!=='http_websocket_module_compilation_only'||basis.codex_client_build_proven!==false)throw Error('Module compilation source scope unavailable');
 const expected=new Set([...basis.materials.map(value=>value.path),'Cargo.lock','module-source.json']);const visit=(directory,prefix='')=>{for(const name of readdirSync(ordinary(directory))){const path=prefix+name,full=join(directory,name),info=lstatSync(ordinary(full));if(info.isDirectory())visit(full,path+'/');else if(!info.isFile()||!expected.delete(path))throw Error('Unexpected module compilation source');}};visit(basis.root);if(expected.size)throw Error('Module compilation source missing');
 for(const value of basis.materials)if(JSON.stringify({path:value.path,...facts(join(basis.root,value.path))})!==JSON.stringify(value))throw Error('Original module compilation source changed');
 const lock=readFileSync(join(basis.root,'Cargo.lock'),'utf8'),allowed=new Set(basis.lock_before.pins);for(const pin of pins(lock))if(!allowed.has(pin))throw Error('Module compilation changed a pinned upstream dependency');
 return{...basis,lock_after:{sha256:sha(lock),pins:[...pins(lock)].sort()}};
}
