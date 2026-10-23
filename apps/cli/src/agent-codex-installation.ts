import{resolve}from'node:path';
import{installCodexAgentRuntime,inspectCodexAgentRuntimeInstallation,openLocalProject}from'@cimiloop/local-app';
import{bytesAt,parseGatewayJson,parseWorkspaceCheckTemplate}from'@cimiloop/runtime-adapter';
import{CliInputError}from'./input.js';import{renderFields}from'./output.js';import type{GlobalOptions}from'./commands.js';
export async function installCodexRuntime(options:GlobalOptions&{binary:string;nativeBinary:string;nodeBinary?:string;checks:string;model?:string;yes?:boolean;disableMcpServer?:string[]}){
 if(!options.yes)throw new CliInputError('安装会绑定当前Codex账号、模型、程序和固定检查；请显式使用 --yes。安装不会调用模型。');
 const local=openLocalProject(options);try{const raw=parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(bytesAt(resolve(options.checks),65536)),65536);if(!Array.isArray(raw))throw new CliInputError('检查目录须为固定WorkspaceCheckTemplate的JSON数组。');const result=await installCodexAgentRuntime(local,{binary:options.binary,native_binary:options.nativeBinary,node_binary:options.nodeBinary??process.execPath,model:options.model??'gpt-6.1-sol',disabled_mcp_servers:options.disableMcpServer??[],checks:raw.map(parseWorkspaceCheckTemplate)});process.stdout.write((options.json?JSON.stringify(result,null,2):renderFields(result))+'\n');}finally{local.store.close();}
}
export async function showCodexRuntimeInstallation(options:GlobalOptions){const local=openLocalProject(options);try{const result=await inspectCodexAgentRuntimeInstallation(local);process.stdout.write((options.json?JSON.stringify(result,null,2):renderFields(result))+'\n');if(result.state==='unavailable')process.exitCode=1;}finally{local.store.close();}}
