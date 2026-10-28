import {resolve} from 'node:path';
import {installDedicatedAgentRuntime,inspectDedicatedAgentRuntimeInstallation,installDedicatedRuntimeStorage,inspectDedicatedRuntimeStorage,openLocalProject} from '@cimiloop/local-app';
import {bytesAt,parseGatewayJson,parseWorkspaceCheckTemplate} from '@cimiloop/runtime-adapter';
import {CliInputError} from './input.js';
import {renderFields} from './output.js';
import type {GlobalOptions} from './commands.js';

export async function installDedicatedRuntime(options:GlobalOptions&{connection:string;nativeBinary:string;nodeBinary?:string;checks:string;placementRoot:string;yes?:boolean}){
 if(!options.yes)throw new CliInputError('安装将固定本地兼容连接元数据、程序和检查，请显式使用 --yes。不会读取密钥或发送模型请求。');
 const local=openLocalProject(options);
 try{
  const raw=parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(bytesAt(resolve(options.checks),65536)),65536);
  if(!Array.isArray(raw))throw new CliInputError('检查目录须为固定 WorkspaceCheckTemplate 的 JSON 数组。');
  const result=await installDedicatedAgentRuntime(local,{connection_file:resolve(options.connection),native_binary:resolve(options.nativeBinary),node_binary:resolve(options.nodeBinary??process.execPath),checks:raw.map(parseWorkspaceCheckTemplate),placement_root:resolve(options.placementRoot)});
  process.stdout.write((options.json?JSON.stringify(result,null,2):renderFields(result))+'\n');
 }finally{local.store.close();}
}
export async function showDedicatedRuntimeInstallation(options:GlobalOptions){
 const local=openLocalProject(options);try{const result=await inspectDedicatedAgentRuntimeInstallation(local);process.stdout.write((options.json?JSON.stringify(result,null,2):renderFields(result))+'\n');if(result.state==='unavailable')process.exitCode=1;}finally{local.store.close();}
}
export async function installDedicatedStorage(options:GlobalOptions&{image:string;volumeRoot:string;maximumMib:string;yes?:boolean}){
 if(!options.yes)throw new CliInputError('绑定已有固定卷的原镜像与当前项目，不创建、挂载或格式化卷；请显式使用 --yes。不会调用模型。');
 if(!/^[1-9][0-9]*$/.test(options.maximumMib)||Number(options.maximumMib)<64||Number(options.maximumMib)>8192)throw new CliInputError('固定卷容量必须为64至8192 MiB整数。');
 const local=openLocalProject(options);try{const result=await installDedicatedRuntimeStorage(local,{image:resolve(options.image),volume_root:options.volumeRoot,maximum_bytes:Number(options.maximumMib)*1024**2});process.stdout.write((options.json?JSON.stringify(result,null,2):renderFields(result))+'\n');}finally{local.store.close();}
}
export async function showDedicatedStorage(options:GlobalOptions){
 const local=openLocalProject(options);try{const result=await inspectDedicatedRuntimeStorage(local);process.stdout.write((options.json?JSON.stringify(result,null,2):renderFields(result))+'\n');if(result.state==='unavailable')process.exitCode=1;}finally{local.store.close();}
}
