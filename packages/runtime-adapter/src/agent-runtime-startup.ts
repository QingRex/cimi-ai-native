import {RuntimeAdapterError} from './files.js';

// Fixed child-process policy, not a caller environment override or approval.
// Config8/9/10 and claim3 retain it prospectively; old originals are untouched.
export const AGENT_RUNTIME_STARTUP_PROFILE='bun_interpreter/1.0.0' as const;
const prefix='cimiloop/agent-workspace-sandbox-config/';
const fail=():never=>{throw new RuntimeAdapterError('agent_runtime_startup_original_unproven');};
export function agentWorkspaceConfigBaseFormat(config:Record<string,unknown>):string {
 const version=String(config.format).match(/^cimiloop\/agent-workspace-sandbox-config\/(1|2|3|4|5|6|7|8|9|10)\.0\.0$/)?.[1];
 if(!version)fail();
 const current=Number(version)>=8;
 if(current?config.startup_profile!==AGENT_RUNTIME_STARTUP_PROFILE: Object.hasOwn(config,'startup_profile'))fail();
 return prefix+(current?Number(version)-3:Number(version))+'.0.0';
}
export function assertAgentRuntimeStartupOriginal(config:Record<string,unknown>,input?:Record<string,unknown>):void {
 agentWorkspaceConfigBaseFormat(config);
 if(input){
  const current=Object.hasOwn(config,'startup_profile');
  if(current?!Object.hasOwn(input,'startup_profile')||input.startup_profile!==AGENT_RUNTIME_STARTUP_PROFILE:Object.hasOwn(input,'startup_profile'))fail();
 }
}
