import {Command} from 'commander';import {resolve} from 'node:path';
import {createInternalId,SCHEMA_VERSION,type DomainError,type SkillMethodInput} from '@cimiloop/protocol/v2';
import {LocalHumanSkillMethodProbe,LocalSkillMethodInputs,LocalProjectError,openLocalProject} from '@cimiloop/local-app';
import {bytesAt} from '@cimiloop/runtime-adapter';import {readJsonObject} from './input.js';import {isDomainError,outputError,renderFields} from './output.js';import type {GlobalOptions} from './commands.js';
export function createSkillMethodProbeCommand(){
 const group=new Command('probe').description('由 Human 项目负责人执行固定材料隔离方法；不创建业务 Run 或批准生产资格');
 const run=async(command:Command,action:(service:LocalHumanSkillMethodProbe,local:ReturnType<typeof openLocalProject>)=>Promise<unknown>)=>{
  const options=command.optsWithGlobals<GlobalOptions>();let local:ReturnType<typeof openLocalProject>|undefined;
  try{local=openLocalProject(options.projectDir?{projectDir:options.projectDir}:{});const result=await action(new LocalHumanSkillMethodProbe(local),local);process.stdout.write((options.json?JSON.stringify(result,null,2):renderFields(result as Record<string,unknown>))+'\n');if(result&&typeof result==='object'&&'outcome'in result&&result.outcome==='unknown')process.exitCode=1;}
  catch(error){const value:DomainError=error instanceof LocalProjectError?{schema_version:SCHEMA_VERSION,code:error.code,message:error.message,category:error.category,retryable:false,details:{},correlation_id:createInternalId()}:isDomainError(error)?error as DomainError:{schema_version:SCHEMA_VERSION,code:'CLI_EXECUTION_FAILED',message:'隔离方法未完成；保留原请求，使用原请求 ID 查询',category:'internal',retryable:false,details:{},correlation_id:createInternalId()};outputError(value,Boolean(options.json));}
  finally{local?.store.close();}
 };
 group.command('start').argument('<descriptor-id>').requiredOption('--runtime-binding <id>','已批准的固定 Runtime Binding').requiredOption('--method <name>','固定包入口方法名').requiredOption('--request-id <uuidv7>','先保存此原请求 UUIDv7；重试不得换 ID').requiredOption('--input-file <json>','固定 SkillMethodInput；评审资料可通过 --artifact 加入').option('--artifact <file...>','明确选择要交给模型的固定评审资料；每份最多256KiB').option('--max-elapsed-ms <ms>','原请求累计时限1000–600000毫秒','180000')
  .action(async(descriptorId:string,options:{runtimeBinding:string;method:string;requestId:string;inputFile:string;artifact?:string[];maxElapsedMs:string},command:Command)=>run(command,async(service,local)=>{
   const permission=local.kernel.authorizeProviderProbeControl();if('code'in permission)throw permission;const raw=readJsonObject(options.inputFile);
   if(options.artifact?.length){if(raw.purpose!=='review')throw new LocalProjectError('--artifact 仅用于固定评审资料','CLI_ARGUMENT_INVALID','validation');const content=new LocalSkillMethodInputs(local.location.repositoryPath,local.location.dataDirectory).packages.content;raw.artifact_refs=[...(Array.isArray(raw.artifact_refs)?raw.artifact_refs:[]),...options.artifact.map(path=>content.storeContent(bytesAt(resolve(path),256*1024),'provider_probe_artifact'))];}
   return service.startFromInput({request_id:options.requestId,descriptor_id:descriptorId,runtime_binding_id:options.runtimeBinding,method_name:options.method,input:raw as SkillMethodInput,max_elapsed_ms:Number(options.maxElapsedMs)});
  }));
 for(const action of ['query','collect','cancel','recover'] as const)group.command(action).argument('<request-id>').description('只操作原隔离请求，不创建另一次调用').action(async(value:string,_options:unknown,command:Command)=>run(command,service=>service[action](value)));
 group.command('capture').argument('<request-ids...>').description('重读1–4个原调用并保存方法证据；不把采集当作批准').action(async(values:string[],_options:unknown,command:Command)=>run(command,service=>service.capture(values)));
 return group;
}
