import {lstatSync,mkdirSync,writeFileSync,openSync,fsyncSync,closeSync,existsSync} from 'node:fs';
import {join,resolve,relative,isAbsolute,dirname,basename} from 'node:path';
import {assertOrdinaryPath,directory,bytesAt,digest,RuntimeAdapterError} from './files.js';

// Host helper directories, never a model permission or a disk-quota approval.
// Callers choose an already-owned build/operation root, not a global fallback.
export function privateNativeEnvironment(root:string,options:{readOnly?:true}={}){
 const base=options.readOnly?assertOrdinaryPath(root):directory(root),user=join(base,'user');
 const environment={HOME:user,USERPROFILE:user,LOCALAPPDATA:join(user,'AppData','Local'),APPDATA:join(user,'AppData','Roaming'),PROGRAMDATA:join(base,'program-data'),TEMP:join(base,'temp'),TMP:join(base,'temp')};
 const identities=[...new Set([base,...Object.values(environment)])].map(path=>{if(!options.readOnly)directory(path);const s=lstatSync(assertOrdinaryPath(path),{bigint:true});if(!s.isDirectory())throw new RuntimeAdapterError('native_process_environment_changed');return{path,dev:String(s.dev),ino:String(s.ino),birth:String(s.birthtimeNs)};});
 const verify=()=>{for(const original of identities){const s=lstatSync(assertOrdinaryPath(original.path),{bigint:true});if(!s.isDirectory()||String(s.dev)!==original.dev||String(s.ino)!==original.ino||String(s.birthtimeNs)!==original.birth)throw new RuntimeAdapterError('native_process_environment_changed');}};
 verify();return{environment:Object.freeze(environment),verify,basis:{format:'cimiloop/native-process-environment/1.0.0' as const,root:base,environment:{...environment},identities}};
}

const unavailable=():never=>{throw new RuntimeAdapterError('native_process_environment_unproven');};
const physical=(path:string,kind:'file'|'directory')=>{const s=lstatSync(assertOrdinaryPath(path),{bigint:true});if(kind==='file'?!s.isFile()||s.nlink!==1n:!s.isDirectory())unavailable();return{dev:String(s.dev),ino:String(s.ino),birth:String(s.birthtimeNs)};};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
type Binding={root:string;environment:ReturnType<typeof privateNativeEnvironment>;verify():void};
const bindings=new Map<string,Binding>();
const binaryKey=(path:string)=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path);

// Installation is prospective host setup, never a Run resubmission. A complete
// old helper may be bound to this new environment; a partial environment is
// retained and refused. Read-only recovery never installs missing originals.
export function bindNativeProcessEnvironment(ownerRoot:string,binary:string,options:{readOnly?:true}={}){
 const root=assertOrdinaryPath(ownerRoot),ownerIdentity=physical(root,'directory'),path=assertOrdinaryPath(binary),child=relative(root,path);
 if(isAbsolute(child)||child==='..'||child.startsWith('..\\')||child.startsWith('../'))unavailable();
 const previous=bindings.get(binaryKey(path));if(previous){previous.verify();if(previous.root!==root)unavailable();return;}
 const home=join(root,'native-process-environment'),record=join(home,'original.json');let created=false;
 if(!existsSync(home)){if(options.readOnly)unavailable();mkdirSync(home);created=true;}
 const homeIdentity=physical(home,'directory'),scope=privateNativeEnvironment(join(home,'directories'),created?{}:{readOnly:true});
 const basis={format:'cimiloop/native-helper-environment/1.0.0',owner_root:root,owner_identity:ownerIdentity,home_identity:homeIdentity,environment:scope.basis};
 if(created){writeFileSync(record,JSON.stringify(basis),{flag:'wx'});const fd=openSync(record,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}}
 const original=bytesAt(record,65536);if(!same(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(original)),basis))unavailable();
 const binaryIdentity=physical(path,'file'),binaryDigest=digest(bytesAt(path,512*1024*1024)).value;
 const verify=()=>{scope.verify();if(!same(physical(root,'directory'),ownerIdentity)||!same(physical(home,'directory'),homeIdentity)||!bytesAt(record,65536).equals(original)||!same(physical(path,'file'),binaryIdentity)||digest(bytesAt(path,512*1024*1024)).value!==binaryDigest)unavailable();};
 verify();bindings.set(binaryKey(path),{root,environment:scope,verify});
}
function bindingFor(binary:string){let binding=bindings.get(binaryKey(binary));if(!binding){const parent=dirname(dirname(resolve(binary)));if(['tools','runtime-binary-originals'].includes(basename(parent))){const owner=dirname(parent);if(existsSync(assertOrdinaryPath(join(owner,'native-process-environment')))){bindNativeProcessEnvironment(owner,binary,{readOnly:true});binding=bindings.get(binaryKey(binary));}}}return binding;}
export function nativeProcessEnvironmentOwner(binary:string){const binding=bindingFor(binary);binding?.verify();return binding?.root;}
export function restoreNativeProcessEnvironment(ownerRoot:string,binary:string){if(!existsSync(assertOrdinaryPath(join(ownerRoot,'native-process-environment'))))return false;bindNativeProcessEnvironment(ownerRoot,binary,{readOnly:true});return true;}
export function verifyNativeProcessEnvironment(binary:string,required=false){const binding=bindingFor(binary);if(!binding){if(required)unavailable();return;}binding.verify();}
export function nativeHelperProcessOptions(binary:string,base:NodeJS.ProcessEnv,required=false){
 const binding=bindingFor(binary);if(!binding){if(required)unavailable();return{env:base};}binding.verify();
 return{cwd:binding.environment.basis.root,env:{...base,...binding.environment.environment}};
}
