import{Command}from'commander';import{createInternalId,SCHEMA_VERSION,type DomainError}from'@cimiloop/protocol/v2';
import{LocalHumanAgentAccountBilling,LocalProjectError,openLocalProject,type HumanAgentAccountFactory}from'@cimiloop/local-app';
import{isDomainError,outputError,renderFields}from'./output.js';import type{GlobalOptions}from'./commands.js';
// Code-installed embedders reuse this SAME command. No argv/env/JSON module,
// account root, connection or bill-verifier installation mechanism exists.
export function createAgentCostsCommand(factory?:HumanAgentAccountFactory){
 return new Command('costs').exitOverride().configureOutput({writeErr:()=>undefined}).argument('<run-id>').description('读取原运行账户账单；结果与预算结算仍以 Kernel 为准')
  .action(async(id:string,_options:unknown,command:Command)=>{
   const options=command.optsWithGlobals<GlobalOptions>();let local:ReturnType<typeof openLocalProject>|undefined;
   try{local=openLocalProject(options.projectDir?{projectDir:options.projectDir}:{});const result=await new LocalHumanAgentAccountBilling(local,factory).query(id);
    process.stdout.write((options.json?JSON.stringify(result,null,2):renderFields(result))+'\n');if(result.outcome==='unknown')process.exitCode=1;
   }catch(error){
    const value:DomainError=error instanceof LocalProjectError?{schema_version:SCHEMA_VERSION,code:error.code,message:error.message,category:error.category,retryable:false,details:{},correlation_id:createInternalId()}:isDomainError(error)?error as DomainError:{schema_version:SCHEMA_VERSION,code:'CLI_EXECUTION_FAILED',message:'原账户费用读取失败',category:'internal',retryable:false,details:{},correlation_id:createInternalId()};outputError(value,Boolean(options.json));
   }finally{local?.store.close();}
  });
}
