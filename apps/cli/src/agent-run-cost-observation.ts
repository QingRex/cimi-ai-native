import{Command}from'commander';import{createInternalId,SCHEMA_VERSION,type DomainError}from'@cimiloop/protocol/v2';
import{LocalHumanAgentRunCostObservation,LocalProjectError,openLocalProject,type HumanAgentAccountFactory}from'@cimiloop/local-app';
import{readJsonObject}from'./input.js';import{isDomainError,outputError,renderFields}from'./output.js';import type{GlobalOptions}from'./commands.js';
// Code installation only. Original command identity must already be saved in
// the request file, so response-loss retry cannot create another command.
export const createAgentCostObservationCommand=(factory?:HumanAgentAccountFactory)=>createOriginalCommand(factory,false);
export const createAgentReconcileOriginalCommand=(factory?:HumanAgentAccountFactory)=>createOriginalCommand(factory,true);
function createOriginalCommand(factory:HumanAgentAccountFactory|undefined,reconciling:boolean){
 return new Command(reconciling?'reconcile-original':'record-costs').exitOverride().configureOutput({writeErr:()=>undefined}).argument('<run-id>')
  .description(reconciling?'核对原 Native 执行、全部未知观测与原账单，由 Kernel 结清原 Run':'按原命令核对账单并记录 Kernel 现金用量；执行终态与剩余预算仍待核对')
  .requiredOption('--request-file <json>',`保留原 command_id 的严格 ${reconciling?'ReconcileRun':'RecordRunObservation'} 请求；payload 必须为空`)
  .action(async(id:string,own:{requestFile:string},command:Command)=>{
   const options=command.optsWithGlobals<GlobalOptions>();let local:ReturnType<typeof openLocalProject>|undefined;
   try{
    const request=readJsonObject(own.requestFile);
    if(!request.target||typeof request.target!=='object'||Array.isArray(request.target)||!('id' in request.target)||request.target.id!==id)throw new LocalProjectError('请求文件必须对应原 Run','INVALID_COMMAND');
    local=openLocalProject(options.projectDir?{projectDir:options.projectDir}:{});
    const service=new LocalHumanAgentRunCostObservation(local,factory),result=await(reconciling?service.reconcile(request):service.record(request));
    if(isDomainError(result)){outputError(result,Boolean(options.json));return;}
    process.stdout.write((options.json?JSON.stringify(result,null,2):renderFields(result))+'\n');
   }catch(error){
    const value:DomainError=error instanceof LocalProjectError?{schema_version:SCHEMA_VERSION,code:error.code,message:error.message,category:error.category,retryable:false,details:{},correlation_id:createInternalId()}:isDomainError(error)?error as DomainError:{schema_version:SCHEMA_VERSION,code:'CLI_EXECUTION_FAILED',message:'原账单费用记录失败；保留原命令请求',category:'internal',retryable:false,details:{},correlation_id:createInternalId()};outputError(value,Boolean(options.json));
   }finally{local?.store.close();}
  });
}
