import {Command} from 'commander';import {createInternalId,SCHEMA_VERSION,type DomainError} from '@cimiloop/protocol/v2';
import {LocalHumanAgentRunFamilyControl,LocalProjectError,openLocalProject} from '@cimiloop/local-app';import {isDomainError,outputError,renderFields} from './output.js';import type {GlobalOptions} from './commands.js';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
// Historical Human control uses the same service as the workbench. It never
// opens a new Agent/model factory, adopts its caller or creates another Run.
export function createAgentOriginalControlCommand(action:'query'|'collect'|'cancel'|'recover'){
 return new Command(action+'-original').argument('<run-id>').description(action==='cancel'?'重试原 Agent 取消；须先由 Kernel 记录原 Run 取消':action==='recover'?'核对原沙箱与模型进程资源；不重开 Run、不结算费用':'只读取或采集原 Agent 操作，缺原件保持 Unknown')
 .action(async(runId:string,_options:unknown,command:Command)=>{const options=command.optsWithGlobals<GlobalOptions>();let local:ReturnType<typeof openLocalProject>|undefined;
  try{local=openLocalProject(options.projectDir?{projectDir:options.projectDir}:{});const control=new LocalHumanAgentRunFamilyControl(local),result=action==='cancel'?await control.retryCancellation(runId):await control[action](runId);
   process.stdout.write((options.json?JSON.stringify(result,null,2):renderFields(result))+'\n');const original=result.operation.outcome==='observed'&&object(result.operation.result)?result.operation.result:undefined,status=object(original?.status)?original.status.status:original?.status;
   const family='family'in result&&object(result.family)?result.family:undefined;
   if(result.operation.outcome==='unknown'||status==='Unknown'||original?.outcome==='unknown'||original?.stopped_proven===false||action==='recover'&&original?.resources_disposed===false||family?.resources_disposed===false)process.exitCode=1;
  }catch(error){const value:DomainError=error instanceof LocalProjectError?{schema_version:SCHEMA_VERSION,code:error.code,message:error.message,category:error.category,retryable:false,details:{},correlation_id:createInternalId()}:isDomainError(error)?error as DomainError:{schema_version:SCHEMA_VERSION,code:'CLI_EXECUTION_FAILED',message:'原 Agent 操作尚不可核对；保留原 Run 与预算，不重新派发',category:'internal',retryable:false,details:{},correlation_id:createInternalId()};outputError(value,Boolean(options.json));}
  finally{local?.store.close();}
 });
}
