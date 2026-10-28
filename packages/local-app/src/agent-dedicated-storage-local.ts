import {openInstalledDedicatedAgentRuntime,type InstalledDedicatedAgentRuntime} from './agent-dedicated-installation-local.js';
import {bindRuntimeStorageAttachment,openRuntimeStorageAttachment,parseRuntimeStorageInput,type RuntimeStorageInput} from './runtime-storage-attachment-local.js';
import type {LocalProject} from './project.js';
import {LocalProjectError} from './errors.js';
export type DedicatedRuntimeStorageInput=RuntimeStorageInput;
export const openDedicatedRuntimeStorage=(local:Pick<LocalProject,'location'|'store'>,installed:InstalledDedicatedAgentRuntime)=>openRuntimeStorageAttachment(local,installed,'dedicated');
export async function installDedicatedRuntimeStorage(local:LocalProject,raw:DedicatedRuntimeStorageInput){
 const input=parseRuntimeStorageInput(local,raw,'dedicated'),installed=await openInstalledDedicatedAgentRuntime(local);
 if(!installed)throw new LocalProjectError('本地兼容 Runtime 原安装尚未完成；不创建固定卷或另一安装','CAPABILITY_UNAVAILABLE','conflict');
 try{return await bindRuntimeStorageAttachment(local,installed,input,'dedicated');}finally{installed.release();}
}
export async function inspectDedicatedRuntimeStorage(local:LocalProject){
 let installed:InstalledDedicatedAgentRuntime|undefined;const common={starts_run:false as const,provider_qualification_proven:false as const,costs_reconciled:false as const};
 try{installed=await openInstalledDedicatedAgentRuntime(local);if(!installed)return{...common,state:'missing' as const};const storage=await openDedicatedRuntimeStorage(local,installed);return storage?{...common,state:'installed' as const,proof:storage.read()}:{...common,state:'missing' as const};}
 catch{return{...common,state:'unavailable' as const};}finally{installed?.release();}
}
