import {Command} from 'commander';import {createInternalId,SCHEMA_VERSION,type DomainError} from '@cimiloop/protocol/v2';
import {LocalHumanRuntimeContract,LocalProjectError,openLocalProject} from '@cimiloop/local-app';
import {isDomainError,outputError,renderFields} from './output.js';import type{GlobalOptions}from'./commands.js';
export function createRuntimeContractCommand(){
 const group=new Command('contract').description('Human 负责人使用已安装账户验证固定 Runtime 读写及独立评审；不创建业务 Run 或批准生产执行');
 const run=async(command:Command,action:(service:LocalHumanRuntimeContract)=>Promise<unknown>)=>{const options=command.optsWithGlobals<GlobalOptions>();let local:ReturnType<typeof openLocalProject>|undefined;
  try{local=openLocalProject(options.projectDir?{projectDir:options.projectDir}:{});const result=await action(new LocalHumanRuntimeContract(local));process.stdout.write((options.json?JSON.stringify(result,null,2):renderFields(result as Record<string,unknown>))+'\n');if(result&&typeof result==='object'&&'outcome'in result&&result.outcome==='unknown')process.exitCode=1;}
  catch(error){const value:DomainError=error instanceof LocalProjectError?{schema_version:SCHEMA_VERSION,code:error.code,message:error.message,category:error.category,retryable:false,details:{},correlation_id:createInternalId()}:isDomainError(error)?error as DomainError:{schema_version:SCHEMA_VERSION,code:'CLI_EXECUTION_FAILED',message:'固定 Runtime 契约未完成；保留原请求 ID 查询，不重新派发 Unknown 阶段',category:'internal',retryable:false,details:{},correlation_id:createInternalId()};outputError(value,Boolean(options.json));}
  finally{local?.store.close();}
 };
 group.command('start').argument('<descriptor-id>').requiredOption('--request-id <uuidv7>','先保存此原请求 ID；响应丢失后不得换 ID 重提').option('--max-elapsed-ms <ms>','原请求累计期限1000—600000毫秒','600000').description('验证真实版本／隔离边界，再使用原账户额度执行固定编辑及独立只读评审')
  .action(async(descriptorId:string,options:{requestId:string;maxElapsedMs:string},command:Command)=>run(command,service=>service.start({request_id:options.requestId,descriptor_id:descriptorId,max_elapsed_ms:Number(options.maxElapsedMs)})));
 for(const action of['query','continue','cancel','recover','capture'] as const)group.command(action).argument('<request-id>').description(action==='continue'?'只接续尚未登记的原阶段；已登记 Unknown 阶段不重派':action==='capture'?'重读完整原件并固定证据引用；采集不等于批准':'只操作已登记的原请求，不创建业务 Run').action(async(value:string,_options:unknown,command:Command)=>run(command,service=>service[action](value)));
 group.command('list').description('只读列出原契约请求，不启动模型').action(async(_options:unknown,command:Command)=>run(command,service=>service.list()));return group;
}
