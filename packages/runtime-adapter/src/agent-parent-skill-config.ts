import {isDeepStrictEqual as same} from 'node:util';
import {RuntimeAdapterError} from './files.js';
import {agentWorkspaceConfigBaseFormat,assertAgentRuntimeStartupOriginal} from './agent-runtime-startup.js';
const fail=():never=>{throw new RuntimeAdapterError('agent_parent_skill_config_unproven');};
const owns=(v:unknown,key:string)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.hasOwn(v,key);
const options=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
// Config7 is an explicit fixed parent SDK mode. Old configs retain their original
// meaning and cannot acquire parent tools by an extra flag or binding.
export function assertAgentParentSkillConfig(config:Record<string,unknown>,input?:Record<string,unknown>):boolean {
 assertAgentRuntimeStartupOriginal(config,input);
 const parent=agentWorkspaceConfigBaseFormat(config)==='cimiloop/agent-workspace-sandbox-config/7.0.0',provider=options(config.provider_options);
 if(!parent){if(owns(config,'parent_skill_tools')||owns(config,'parent_skill_original_binding')||owns(provider,'parent_skill_tools')||input&&(owns(input,'parent_skill_original_binding')||owns(options(input.provider_options),'parent_skill_tools')))fail();return false;}
 const binding=options(config.parent_skill_original_binding);
 if(config.parent_skill_tools!=='fixed_parent_skill/1.0.0'||provider.parent_skill_tools!=='fixed_parent_skill/1.0.0'||
  owns(config,'method_tools')||owns(config,'method_original_binding')||input&&owns(input,'method_original_binding')||
  Object.keys(binding).sort().join(',')!=='catalog_digest,format,scope_digest,sdk_catalog_digest'||binding.format!=='cimiloop/agent-parent-skill-binding/1.0.0'||
  !['scope_digest','catalog_digest','sdk_catalog_digest'].every(k=>typeof binding[k]==='string'&&/^[a-f0-9]{64}$/.test(binding[k]))||binding.scope_digest!==config.scope_digest||
  config.lifetime_policy!=='agent_task/1.0.0'||typeof config.prompt!=='string'||!config.prompt||!Number.isSafeInteger(config.deadline_uptime_ms)||(config.deadline_uptime_ms as number)<=0||
  !config.binary_original||typeof config.binary_original!=='object'||Array.isArray(config.binary_original))fail();
 if(input&&(!same(binding,input.parent_skill_original_binding)||options(input.provider_options).parent_skill_tools!=='fixed_parent_skill/1.0.0'||
  !same(config.binary_original,input.binary_original)||input.prompt!==config.prompt||input.lifetime_policy!==config.lifetime_policy||input.deadline_uptime_ms!==config.deadline_uptime_ms))fail();
 return true;
}
