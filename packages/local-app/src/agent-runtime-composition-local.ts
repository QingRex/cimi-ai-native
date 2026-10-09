import { runOpenCodeWorkspaceRuntime, AgentRuntimeModelHost, type AgentRuntimeModelPort } from "@cimiloop/runtime-adapter";
import { LocalAgentRuntimeStart, type AgentRuntimeLaunchInputs, type AgentRuntimeStartContext, type AgentRuntimeStartPort } from "./agent-runtime-start-local.js";
import { LocalAgentWorkspaceToolService, type AgentWorkspaceToolLocalContext } from "./agent-workspace-tools-local.js";
import { LocalAgentStartCustody } from "./agent-start-custody-local.js";
import { LocalAgentCheckAdmission } from "./agent-check-admission-local.js";
import { openLocalAgentRunBudget } from "./agent-run-budget-local.js";
import { LocalProjectError } from "./errors.js";

interface Options {
 local:AgentRuntimeStartContext & AgentWorkspaceToolLocalContext;
 binary:string; custody:LocalAgentStartCustody; checks:LocalAgentCheckAdmission;
 model:AgentRuntimeModelPort;
}
// Shared trusted application composition. Human HTTP/CLI cannot choose callers,
// model ports, custody, binaries or check recipes. Missing approvals must make
// model.check fail; no fall-through to constructed model replies exists here.
export class LocalAgentRuntimeComposition implements AgentRuntimeStartPort {
 readonly custody:LocalAgentStartCustody;
 private constructor(private readonly options:Options){this.custody=options.custody;}
 static open(options:Options){
  if(!(options.custody instanceof LocalAgentStartCustody)||!(options.checks instanceof LocalAgentCheckAdmission)||typeof options.model?.check!=="function"||typeof options.model?.execute!=="function")
   throw new LocalProjectError("完整原 Runtime、检查及模型账户准入尚未安装","CAPABILITY_UNAVAILABLE","conflict");
  return new LocalAgentRuntimeComposition({...options,model:{admission_digest:options.model.admission_digest,check:options.model.check.bind(options.model),execute:options.model.execute.bind(options.model)}});
 }
 start(runId:string){return new LocalAgentRuntimeStart(this.options.local,this).start(runId);}
 async prepare(input:AgentRuntimeLaunchInputs){
  await this.options.model.check(structuredClone(input.scope));
  const budget=await openLocalAgentRunBudget(this.options.local,input.record.run_id);
  budget.assertScope(input.scope);
  const service=await LocalAgentWorkspaceToolService.open(this.options.local,input.record.run_id);
  try {
   await service.installAdmittedChecks(this.options.checks,this.custody);
   const catalog=await service.getCheckCatalog();
   if(this.custody.inspectOriginal(input.project,input.record,input.context,input.scope).state === "claimed")throw new LocalProjectError("原 Run 已有启动，保留原模型账本","CAPABILITY_UNAVAILABLE","conflict");

   // Frozen domain packet, not a caller-supplied freeform command/prompt. The
   // original dispatch material_digest protects every source object in this packet.
   const prompt=JSON.stringify({format:"cimiloop/agent-runtime-task-packet/1.0.0",operation_key:input.scope.operation_key,context_digest:input.scope.context_digest,
    task:input.task,work_item:input.work_item,definition:input.definition,contract:input.contract,plan:input.plan,context:input.context,check_catalog:catalog},null,1);
   if(Buffer.byteLength(prompt)>32768||Buffer.byteLength(JSON.stringify({prompt}))>48000||prompt.split(/\r?\n/).length>1000||prompt.split(/\r?\n/).some(line=>Buffer.byteLength(line)>1800))throw new LocalProjectError("原任务资料超出当前 Runtime 输入容量；保留原 Run","CAPABILITY_UNAVAILABLE","conflict");
   const model=await AgentRuntimeModelHost.initialize(this.options.local.location.dataDirectory,input.scope,this.options.model,["cimi_read","cimi_replace","cimi_check"],prompt);
   return {launch:async()=>{
    await runOpenCodeWorkspaceRuntime({root:this.options.local.location.dataDirectory,binary:this.options.binary,scope:input.scope,maxElapsedMs:180000,prompt,model,runBudget:budget,checkCatalog:catalog,
     connect:(supervisor,originalSupervisor,peer,nonce,signal,originalModel)=>service.openIpc(supervisor,originalSupervisor,peer,{nonce,signal,model:originalModel})});
   },dispose:()=>service.close()};
  } catch(error){await service.close();throw error;}
 }
}