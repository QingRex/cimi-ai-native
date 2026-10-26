import { describe, expect, it } from "vitest";
import { agentWorkspaceConfigBaseFormat, assertAgentRuntimeStartupOriginal } from "../src/agent-runtime-startup.js";
import { assertAgentRuntimeModelOriginalMode } from "../src/agent-runtime-model.js";

describe("prospective bounded Agent model output policy",()=>{
 it('binds Native17 tool names to the original input and model Host without upgrading Native14',()=>{
  const options={model_output_profile:'bounded_2048/1.0.0',workspace_tool_names:['cimi_read','cimi_check']},config={format:'cimiloop/agent-workspace-sandbox-config/17.0.0',startup_profile:'bun_interpreter/1.0.0',writable_storage_profile:'private_state_only/1.0.0',provider_options:options},header={format:'cimiloop/agent-runtime-model-originals/7.0.0',output_profile:'bounded_2048/1.0.0',original_evidence:{kind:'codex_login/1.0.0',header_digest:'a'.repeat(64)},permitted:['cimi_read','cimi_check']};
  expect(agentWorkspaceConfigBaseFormat(config)).toBe('cimiloop/agent-workspace-sandbox-config/5.0.0');expect(()=>assertAgentRuntimeStartupOriginal(config,config)).not.toThrow();expect(()=>assertAgentRuntimeModelOriginalMode(header,false,options)).not.toThrow();
  expect(()=>assertAgentRuntimeStartupOriginal(config,{...config,provider_options:{...options,workspace_tool_names:['cimi_read','cimi_replace','cimi_check']}})).toThrow();expect(()=>assertAgentRuntimeModelOriginalMode({...header,permitted:['cimi_read','cimi_replace','cimi_check']},false,options)).toThrow();expect(()=>agentWorkspaceConfigBaseFormat({...config,format:'cimiloop/agent-workspace-sandbox-config/14.0.0'})).toThrow();
 });
 it.each([[14,5],[15,7],[16,6]])('pins private-state-only writes for new Native config%s', (version,base)=>{
  const config={format:`cimiloop/agent-workspace-sandbox-config/${version}.0.0`,startup_profile:'bun_interpreter/1.0.0',writable_storage_profile:'private_state_only/1.0.0',provider_options:{model_output_profile:'bounded_2048/1.0.0'}};
  expect(agentWorkspaceConfigBaseFormat(config)).toBe(`cimiloop/agent-workspace-sandbox-config/${base}.0.0`);
  expect(()=>agentWorkspaceConfigBaseFormat({...config,writable_storage_profile:undefined})).toThrow();
  expect(()=>agentWorkspaceConfigBaseFormat({...config,format:'cimiloop/agent-workspace-sandbox-config/11.0.0'})).toThrow();
  expect(()=>assertAgentRuntimeStartupOriginal(config,{startup_profile:config.startup_profile,provider_options:config.provider_options})).toThrow();
  expect(()=>assertAgentRuntimeStartupOriginal(config,{startup_profile:config.startup_profile,writable_storage_profile:config.writable_storage_profile,provider_options:config.provider_options})).not.toThrow();
 });
 it.each([[11,5],[12,7]])('recognizes explicit Native config%s and rejects missing, foreign or legacy policy markers', (version,base)=>{
  const config={format:`cimiloop/agent-workspace-sandbox-config/${version}.0.0`,startup_profile:'bun_interpreter/1.0.0',provider_options:{model_output_profile:'bounded_2048/1.0.0'}};
  expect(agentWorkspaceConfigBaseFormat(config)).toBe(`cimiloop/agent-workspace-sandbox-config/${base}.0.0`);
  expect(()=>agentWorkspaceConfigBaseFormat({...config,provider_options:{}})).toThrow();
  expect(()=>agentWorkspaceConfigBaseFormat({...config,provider_options:{model_output_profile:'foreign'}})).toThrow();
  expect(()=>agentWorkspaceConfigBaseFormat({...config,format:`cimiloop/agent-workspace-sandbox-config/${base+3}.0.0`})).toThrow();
  expect(()=>assertAgentRuntimeStartupOriginal(config,{startup_profile:'bun_interpreter/1.0.0',provider_options:{}})).toThrow();
  expect(()=>assertAgentRuntimeStartupOriginal(config,{startup_profile:'bun_interpreter/1.0.0',provider_options:config.provider_options})).not.toThrow();
 });
 it.each([false,true])('requires exact backend/Host/Native profile agreement with parent=%s',parent=>{
  const header={format:`cimiloop/agent-runtime-model-originals/${parent?8:7}.0.0`,output_profile:'bounded_2048/1.0.0',original_evidence:{kind:'codex_login/1.0.0',header_digest:'a'.repeat(64)},permitted:parent?['cimi_read','cimi_replace','cimi_check','cimi_run_skill']:['cimi_read'],...(parent?{parent_skill_tools:'fixed_parent_skill/1.0.0'}:{})};
  expect(()=>assertAgentRuntimeModelOriginalMode(header,parent,{model_output_profile:'bounded_2048/1.0.0'})).not.toThrow();
  expect(()=>assertAgentRuntimeModelOriginalMode(header,parent,{})).toThrow();expect(()=>assertAgentRuntimeModelOriginalMode({...header,output_profile:undefined},parent)).toThrow();
 });
});
