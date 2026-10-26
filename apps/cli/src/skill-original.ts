import {Command} from 'commander';
import {createInternalId,SCHEMA_VERSION,type DomainError} from '@cimiloop/protocol/v2';
import {LocalHumanNamedSkillCapture,LocalHumanSkillInvocationControl,LocalProjectError,openLocalProject,type HumanSkillRuntimeFactory} from '@cimiloop/local-app';
import {isDomainError,outputError,renderFields} from './output.js';
import type {GlobalOptions} from './commands.js';

// All entries use the shared Human service. No argument accepts credentials,
// source roots, Agent identity or an executable/qualification implementation.
export function createSkillOriginalCommand(action:'capture'|'query'|'collect'|'cancel'|'recover',factory?:HumanSkillRuntimeFactory){
 const descriptions={capture:'保存已有原技能调用证据；不启动模型或批准执行',query:'查询原技能操作，不重新启动',collect:'采集原技能运行资料，不生成领域结论',cancel:'将已由 Kernel 确认的取消传给同一原技能操作',recover:'回收已取消原技能操作的资源，不重新执行'};
 return new Command(action+'-original').exitOverride().configureOutput({writeErr:()=>undefined})
  .argument(action==='capture'?'<invocation-ids...>':'<invocation-id>').description(descriptions[action])
  .action(async(value:string|string[],_options:unknown,command:Command)=>{
   const options=command.optsWithGlobals<GlobalOptions>();let local:ReturnType<typeof openLocalProject>|undefined;
   try{
    local=openLocalProject(options.projectDir?{projectDir:options.projectDir}:{});
    const control=new LocalHumanSkillInvocationControl(local,factory),id=value as string;
    const result=action==='capture'?await new LocalHumanNamedSkillCapture(local,factory).capture(value):action==='query'?await control.query(id):action==='collect'?await control.collect(id):action==='cancel'?await control.retryCancellation(id):await control.recover(id);
    process.stdout.write((options.json?JSON.stringify(result,null,2):renderFields(result))+'\n');
    if('operation'in result&&result.operation.outcome==='unknown')process.exitCode=1;
   }catch(error){
    const value:DomainError=error instanceof LocalProjectError?{schema_version:SCHEMA_VERSION,code:error.code,message:error.message,category:error.category,retryable:false,details:{},correlation_id:createInternalId()}:isDomainError(error)?error as DomainError:{schema_version:SCHEMA_VERSION,code:'CLI_EXECUTION_FAILED',message:'原技能资料读取或资源核对失败；保留原操作',category:'internal',retryable:false,details:{},correlation_id:createInternalId()};outputError(value,Boolean(options.json));
   }finally{local?.store.close();}
  });
}
