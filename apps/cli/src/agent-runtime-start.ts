import {Command} from 'commander';
import {createInternalId,SCHEMA_VERSION,type DomainError} from '@cimiloop/protocol/v2';
import {LocalHumanAgentRuntimeStart,LocalProjectError,openLocalProject,type HumanAgentRuntimeFactory} from '@cimiloop/local-app';
import {isDomainError,outputError,renderFields} from './output.js';
import type {GlobalOptions} from './commands.js';
// Same compiled command for trusted code installation; no argv/env installer.
export function createAgentStartOriginalCommand(factory?:HumanAgentRuntimeFactory){
 return new Command('start-original').exitOverride().configureOutput({writeErr:()=>undefined}).argument('<run-id>')
  .description('按原 Run 启动或只读核对原操作；首次启动须完整受信生产组合')
  .action(async(id:string,_options:unknown,command:Command)=>{
   const options=command.optsWithGlobals<GlobalOptions>();let local:ReturnType<typeof openLocalProject>|undefined;
   try{local=openLocalProject(options.projectDir?{projectDir:options.projectDir}:{});const result=await new LocalHumanAgentRuntimeStart(local,factory).start(id);
    process.stdout.write((options.json?JSON.stringify(result,null,2):renderFields(result))+'\n');if(result.outcome==='unknown')process.exitCode=1;
   }catch(error){
    const value:DomainError=error instanceof LocalProjectError?{schema_version:SCHEMA_VERSION,code:error.code,message:error.message,category:error.category,retryable:false,details:{},correlation_id:createInternalId()}:isDomainError(error)?error as DomainError:{schema_version:SCHEMA_VERSION,code:'CLI_EXECUTION_FAILED',message:'原 Agent 启动或核对失败；保留原操作',category:'internal',retryable:false,details:{},correlation_id:createInternalId()};outputError(value,Boolean(options.json));
   }finally{local?.store.close();}
  });
}
