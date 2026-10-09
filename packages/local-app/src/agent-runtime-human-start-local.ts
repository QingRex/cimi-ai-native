import {isDeepStrictEqual} from "node:util";
import type {LocalProject} from "./project.js";
import {readHumanOriginalAgentRunInputs} from "./agent-runtime-control-local.js";
import {LocalAgentRuntimeComposition} from "./agent-runtime-composition-local.js";
import {LocalProjectError} from "./errors.js";
// Trusted installation only. The factory may stage an original composition; it
// must not launch effects. HTTP never supplies callers, credentials or ports.
export type HumanAgentRuntimeFactory=(runId:string,local:LocalProject)=>LocalAgentRuntimeComposition|Promise<LocalAgentRuntimeComposition>;
export class LocalHumanAgentRuntimeStart {
 constructor(private readonly local:LocalProject,private readonly factory?:HumanAgentRuntimeFactory){}
 async start(runId:string){
  const original=readHumanOriginalAgentRunInputs(this.local,runId);
  const authorized=this.local.kernel.authorizeAgentRunStart(runId);if("code" in authorized)throw authorized;
  if(!this.factory)throw new LocalProjectError("原 Agent 的完整生产组合尚未安装","CAPABILITY_UNAVAILABLE","conflict");
  const runtime=await this.factory(runId,this.local);
  if(!(runtime instanceof LocalAgentRuntimeComposition)||!isDeepStrictEqual(runtime.originalScope(runId),original.scope))
   throw new LocalProjectError("宿主组合与原 Agent 身份或项目不符","CALLER_IDENTITY_MISMATCH","forbidden");
  const check=()=>{
   const fresh=this.local.kernel.authorizeAgentRunStart(runId);if("code" in fresh)throw fresh;
   if(!isDeepStrictEqual(fresh,authorized)||!isDeepStrictEqual(readHumanOriginalAgentRunInputs(this.local,runId).scope,original.scope))
    throw new LocalProjectError("原启动请求权限或固定范围已改变","INPUT_CHANGED","conflict");
  };
  check();return runtime.start(runId,check);
 }
}
