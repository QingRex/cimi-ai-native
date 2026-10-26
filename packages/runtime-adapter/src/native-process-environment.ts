import {lstatSync} from 'node:fs';
import {join} from 'node:path';
import {assertOrdinaryPath,directory,RuntimeAdapterError} from './files.js';

// Host helper directories, never a model permission or a disk-quota approval.
// Callers choose an already-owned build/operation root, not a global fallback.
export function privateNativeEnvironment(root:string,options:{readOnly?:true}={}){
 const base=options.readOnly?assertOrdinaryPath(root):directory(root),user=join(base,'user');
 const environment={HOME:user,USERPROFILE:user,LOCALAPPDATA:join(user,'AppData','Local'),APPDATA:join(user,'AppData','Roaming'),PROGRAMDATA:join(base,'program-data'),TEMP:join(base,'temp'),TMP:join(base,'temp')};
 const identities=[...new Set([base,...Object.values(environment)])].map(path=>{if(!options.readOnly)directory(path);const s=lstatSync(assertOrdinaryPath(path),{bigint:true});if(!s.isDirectory())throw new RuntimeAdapterError('native_process_environment_changed');return{path,dev:String(s.dev),ino:String(s.ino),birth:String(s.birthtimeNs)};});
 const verify=()=>{for(const original of identities){const s=lstatSync(assertOrdinaryPath(original.path),{bigint:true});if(!s.isDirectory()||String(s.dev)!==original.dev||String(s.ino)!==original.ino||String(s.birthtimeNs)!==original.birth)throw new RuntimeAdapterError('native_process_environment_changed');}};
 verify();return{environment:Object.freeze(environment),verify,basis:{format:'cimiloop/native-process-environment/1.0.0' as const,root:base,environment:{...environment},identities}};
}
