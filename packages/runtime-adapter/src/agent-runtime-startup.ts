import {RuntimeAdapterError} from './files.js';
import {parseAgentModelOutputProfile} from './agent-model-output.js';

// Fixed child-process policy, not a caller environment override or approval.
// Config8/9/10 and claim3 retain it prospectively; old originals are untouched.
export const AGENT_RUNTIME_STARTUP_PROFILE='bun_interpreter/1.0.0' as const;
export const AGENT_RUNTIME_WRITABLE_STORAGE_PROFILE='private_state_only/1.0.0' as const;
const prefix='cimiloop/agent-workspace-sandbox-config/';
const fail=():never=>{throw new RuntimeAdapterError('agent_runtime_startup_original_unproven');};
export function agentWorkspaceConfigBaseFormat(config:Record<string,unknown>):string {
 const version=String(config.format).match(/^cimiloop\/agent-workspace-sandbox-config\/(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16)\.0\.0$/)?.[1];
 if(!version)fail();
 const current=Number(version)>=8;
 if(current?config.startup_profile!==AGENT_RUNTIME_STARTUP_PROFILE: Object.hasOwn(config,'startup_profile'))fail();
 const privateWrites=Number(version)>=14;
 if(privateWrites?config.writable_storage_profile!==AGENT_RUNTIME_WRITABLE_STORAGE_PROFILE:Object.hasOwn(config,'writable_storage_profile'))fail();
 const options=config.provider_options as Record<string,unknown>|undefined,profile=parseAgentModelOutputProfile(options?.model_output_profile),bounded=Number(version)>=11;
 if(bounded? !profile : options!==undefined&&Object.hasOwn(options,'model_output_profile'))fail();
 return prefix+(privateWrites?Number(version)===14?5:Number(version)===15?7:6:bounded?Number(version)===11?5:Number(version)===12?7:6:current?Number(version)-3:Number(version))+'.0.0';
}
export function assertAgentRuntimeStartupOriginal(config:Record<string,unknown>,input?:Record<string,unknown>):void {
 agentWorkspaceConfigBaseFormat(config);
 if(input){
  const current=Object.hasOwn(config,'startup_profile');
  if(current?!Object.hasOwn(input,'startup_profile')||input.startup_profile!==AGENT_RUNTIME_STARTUP_PROFILE:Object.hasOwn(input,'startup_profile'))fail();
  if(Object.hasOwn(config,'writable_storage_profile')?!Object.hasOwn(input,'writable_storage_profile')||input.writable_storage_profile!==AGENT_RUNTIME_WRITABLE_STORAGE_PROFILE:Object.hasOwn(input,'writable_storage_profile'))fail();
  if(parseAgentModelOutputProfile((config.provider_options as Record<string,unknown>|undefined)?.model_output_profile)!==parseAgentModelOutputProfile((input.provider_options as Record<string,unknown>|undefined)?.model_output_profile))fail();
 }
}
