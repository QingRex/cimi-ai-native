import {openInstalledCodexAgentRuntime,type InstalledCodexAgentRuntime} from './agent-codex-installation-local.js';
import {bindRuntimeStorageAttachment,openRuntimeStorageAttachment,parseRuntimeStorageInput,type RuntimeStorageInput} from './runtime-storage-attachment-local.js';
import type {LocalProject} from './project.js';
import {LocalProjectError} from './errors.js';
export type CodexRuntimeStorageInput=RuntimeStorageInput;
export const openCodexRuntimeStorage=(local:Pick<LocalProject,'location'|'store'>,installed:InstalledCodexAgentRuntime)=>openRuntimeStorageAttachment(local,installed,'codex');
export async function installCodexRuntimeStorage(local:LocalProject,raw:CodexRuntimeStorageInput){
 const input=parseRuntimeStorageInput(local,raw,'codex'),installed=await openInstalledCodexAgentRuntime(local);
 if(!installed)throw new LocalProjectError('Codex Runtime原固定卷与项目写入范围不可核对；保留原卷和原操作','CAPABILITY_UNAVAILABLE','conflict');
 try{return await bindRuntimeStorageAttachment(local,installed,input,'codex');}finally{installed.release();}
}
export async function inspectCodexRuntimeStorage(local:LocalProject){
 let installed:InstalledCodexAgentRuntime|undefined;const common={starts_run:false as const,provider_qualification_proven:false as const,costs_reconciled:false as const};
 try{installed=await openInstalledCodexAgentRuntime(local);if(!installed)return{...common,state:'missing' as const};const storage=await openCodexRuntimeStorage(local,installed);return storage?{...common,state:'installed' as const,proof:storage.read()}:{...common,state:'missing' as const};}
 catch{return{...common,state:'unavailable' as const};}finally{installed?.release();}
}
