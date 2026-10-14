import {isDeepStrictEqual as same} from 'node:util';
import {RuntimeAdapterError} from './files.js';
import {agentWorkspaceConfigBaseFormat,assertAgentRuntimeStartupOriginal} from './agent-runtime-startup.js';
// Explicit config6 compatibility. It grants only fixed-material method tools;
// collected evidence must bind them to the original operation's exact pins.
export function assertAgentNamedMethodConfig(config:Record<string,unknown>,input?:Record<string,unknown>):boolean {
 assertAgentRuntimeStartupOriginal(config,input);
 const named=agentWorkspaceConfigBaseFormat(config)==='cimiloop/agent-workspace-sandbox-config/6.0.0';
 const fail=():never=>{throw new RuntimeAdapterError('agent_method_config_unproven');};
 if(!named){if(config.method_tools!==undefined||config.method_original_binding!==undefined||input?.method_original_binding!==undefined)fail();return false;}
 const binding=config.method_original_binding as Record<string,unknown>;
 if(config.method_tools!=='fixed_named_method/1.0.0'||!binding||typeof binding!=='object'||Array.isArray(binding)||Object.keys(binding).sort().join(',')!=='anchor_digest,format,header_digest,profile_digest'||binding.format!=='cimiloop/agent-named-method-binding/1.0.0'||!['profile_digest','header_digest','anchor_digest'].every(k=>typeof binding[k]==='string'&&/^[a-f0-9]{64}$/.test(binding[k]))||config.lifetime_policy!=='agent_task/1.0.0'||typeof config.prompt!=='string'||!config.prompt||!Number.isSafeInteger(config.deadline_uptime_ms)||(config.deadline_uptime_ms as number)<=0||!config.binary_original)fail();
 if(input&&(!same(binding,input.method_original_binding)||!same(config.binary_original,input.binary_original)||input.lifetime_policy!==config.lifetime_policy||input.deadline_uptime_ms!==config.deadline_uptime_ms))fail();
 return true;
}
