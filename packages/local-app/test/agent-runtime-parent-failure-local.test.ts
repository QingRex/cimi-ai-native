import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {afterEach,describe,expect,it} from "vitest";
import {rawReference,digest} from "../../runtime-adapter/src/files.js";
import {classifyOriginalAgentExecutionFailure} from "../src/agent-runtime-failure-local.js";
// Constructed immutable Native bytes test refusal boundaries. They are not
// independent evidence of a real process, account, model or S1 execution.
describe("original parent negative execution result",()=>{
 const roots:string[]=[];
 afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
 function fixture(){
  const root=mkdtempSync(join(tmpdir(),"cimiloop-negative-result-contract-"));roots.push(root);
  const nonce="11111111-1111-4111-8111-111111111111",scope_digest=digest("scope").value,owner={pid:12,creation_ticks:"12",image:process.execPath},supervisor={...owner,pid:13},peer={...owner,pid:14};
  const config={format:"cimiloop/agent-workspace-sandbox-config/2.0.0",nonce,owner,scope_digest,deadline_uptime_ms:60000};
  const records:Record<string,Record<string,unknown>>={"original-config.json":config,"original-launcher.json":{format:"cimiloop/agent-workspace-launcher/1.0.0",nonce,owner,supervisor},
   "agent-sandbox-original.json":{format:"cimiloop/agent-workspace-sandbox/1.0.0",nonce,phase:"suspended",supervisor,peer},
   "agent-sandbox-resources.json":{format:"cimiloop/agent-workspace-resources/1.0.0",nonce,phase:"ended",scope_digest,config_digest:digest(JSON.stringify(config)).value,owner,supervisor,runtime:peer,resources_disposed:true},
   "agent-sandbox-cleanup.json":{format:"cimiloop/agent-workspace-sandbox/1.0.0",phase:"ended",nonce,reason:"agent_sandbox_task_deadline",exit_code:12,runtime_stopped_uptime_ms:60001,resources_disposed:true,cleanup_errors:[],formal_agent_execution_enabled:false},
   "incomplete.json":{format:"cimiloop/opencode-workspace-incomplete/1.0.0",nonce,original_scope_digest:scope_digest,native_exit:{code:12,signal:null},interruption_reason:"agent_run_budget_exhausted",completion_proven:false}};
  const identity={claim:{owner},input:{deadline_uptime_ms:60000} as Record<string,unknown>};
  const collection={scope_digest,status:{status:"Stopped",resources_disposed:true},artifacts:[] as {name:string;reference:ReturnType<typeof rawReference>}[]};
  const materialize=()=>{collection.artifacts=Object.entries(records).map(([name,value])=>({name,reference:rawReference(root,Buffer.from(JSON.stringify(value)),"agent_runtime_original_bytes",name)}));};
  const classify=()=>classifyOriginalAgentExecutionFailure(identity as never,collection as never);
  materialize();return {records,identity,collection,materialize,classify};
 }
 function parent(){const f=fixture(),config=f.records['original-config.json']!;Object.assign(config,{format:'cimiloop/agent-workspace-sandbox-config/7.0.0',parent_skill_tools:'fixed_parent_skill/1.0.0',provider_options:{parent_skill_tools:'fixed_parent_skill/1.0.0'},binary_original:{format:'PUBLIC binary binding'},prompt:'PUBLIC fixed parent Task',lifetime_policy:'agent_task/1.0.0',parent_skill_original_binding:{format:'cimiloop/agent-parent-skill-binding/1.0.0',scope_digest:f.collection.scope_digest,catalog_digest:digest('PUBLIC private catalog').value,sdk_catalog_digest:digest('PUBLIC SDK catalog').value}});const sandbox_original={format:'PUBLIC controller binding'};Object.assign(f.records['original-launcher.json']!,{format:'cimiloop/agent-workspace-launcher/2.0.0',launcher_original:sandbox_original});Object.assign(f.identity.input,{binary_original:config.binary_original,sandbox_original,prompt:config.prompt,lifetime_policy:config.lifetime_policy,provider_options:structuredClone(config.provider_options),parent_skill_original_binding:structuredClone(config.parent_skill_original_binding)});const refresh=()=>{f.records['agent-sandbox-resources.json']!.config_digest=digest(JSON.stringify(config)).value;f.materialize();};refresh();return{...f,config,refresh};}
 it('classifies the original parent deadline and nonzero exit without success or billing',()=>{const f=parent();expect(f.classify()).toBe('agent_original_task_deadline');Object.assign(f.records['agent-sandbox-cleanup.json']!,{reason:'exited',exit_code:3});Object.assign(f.records['incomplete.json']!,{native_exit:{code:3,signal:null},interruption_reason:'workspace_rehearsal_runtime_failed'});f.refresh();expect(f.classify()).toBe('agent_original_runtime_exit_failed');});
 it.each(['downgrade','missing_binding','input_binding','input_mode','named_mix','deadline','binary','prompt'])('leaves parent %s Unknown without renewing the original clock or changing costs',kind=>{const f=parent();if(kind==='downgrade')f.config.format='cimiloop/agent-workspace-sandbox-config/5.0.0';if(kind==='missing_binding')delete f.config.parent_skill_original_binding;if(kind==='input_binding')f.identity.input.parent_skill_original_binding={foreign:true};if(kind==='input_mode')f.identity.input.provider_options={};if(kind==='named_mix')f.config.method_tools='fixed_named_method/1.0.0';if(kind==='deadline')f.config.deadline_uptime_ms=0;if(kind==='binary')f.identity.input.binary_original={foreign:true};if(kind==='prompt')f.identity.input.prompt='PUBLIC foreign prompt';f.refresh();expect(f.classify()).toBeNull();});
});
