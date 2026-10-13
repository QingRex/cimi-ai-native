import{describe,it,expect}from'vitest';import*as runtime from'../src/index.js';import{digest}from'../src/files.js';
import{mkdtempSync,mkdirSync,writeFileSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
// Constructed bytes exercise original binding only, never prove actual OS stop.
const verify=(basis:{scope_digest:string;owner:unknown},read:(name:string)=>Buffer|undefined)=>{const fn=Reflect.get(runtime,'verifyAgentRuntimeInterruption');expect(fn).toBeTypeOf('function');return fn(basis,read);};
function fixture(){
 const owner={pid:12,creation_ticks:'12',image:process.execPath},supervisor={...owner,pid:13},peer={...owner,pid:14},nonce='11111111-1111-4111-8111-111111111111',scope_digest=digest('PUBLIC scope').value;
 const config={format:'cimiloop/agent-workspace-sandbox-config/5.0.0',nonce,owner,scope_digest},config_digest=digest(JSON.stringify(config)).value;
 const records:Record<string,Record<string,unknown>>={'original-config.json':config,'original-launcher.json':{format:'cimiloop/agent-workspace-launcher/2.0.0',nonce,owner,supervisor},
  'agent-sandbox-resources.json':{format:'cimiloop/agent-workspace-resources/1.0.0',nonce,scope_digest,config_digest,owner,supervisor,runtime:peer,phase:'ended',resources_disposed:true},
  'agent-sandbox-original.json':{format:'cimiloop/agent-workspace-sandbox/1.0.0',phase:'suspended',nonce,supervisor,peer},
  'agent-sandbox-cleanup.json':{format:'cimiloop/agent-workspace-sandbox/1.0.0',phase:'ended',nonce,reason:'agent_sandbox_parent_ended',exit_code:125,resources_disposed:true,cleanup_errors:[],formal_agent_execution_enabled:false},
  'agent-sandbox-interruption.json':{format:'cimiloop/agent-workspace-interruption/1.0.0',nonce,scope_digest,config_digest,owner,supervisor,runtime:peer,phase:'suspended',runtime_resumed:false,reason:'agent_sandbox_parent_ended'}};
 return{records,basis:{scope_digest,owner},read:(name:string)=>records[name]?Buffer.from(JSON.stringify(records[name])):undefined};
}

// PUBLIC retained config/OS byte fixtures. These are not actual OS/child stop,
// real model/Skill/billing or S1 evidence.
function parentFixture(){
 const f=fixture(),config=f.records['original-config.json']!;
 Object.assign(config,{format:'cimiloop/agent-workspace-sandbox-config/7.0.0',parent_skill_tools:'fixed_parent_skill/1.0.0',provider_options:{parent_skill_tools:'fixed_parent_skill/1.0.0'},binary_original:{format:'PUBLIC binary binding'},prompt:'PUBLIC fixed parent Task',lifetime_policy:'agent_task/1.0.0',deadline_uptime_ms:1000,parent_skill_original_binding:{format:'cimiloop/agent-parent-skill-binding/1.0.0',scope_digest:f.basis.scope_digest,catalog_digest:digest('PUBLIC original private catalog').value,sdk_catalog_digest:digest('PUBLIC original SDK catalog').value}});
 const refresh=()=>{const value=digest(JSON.stringify(config)).value;f.records['agent-sandbox-resources.json']!.config_digest=value;f.records['agent-sandbox-interruption.json']!.config_digest=value;};
 refresh();return{...f,config,refresh};
}
describe('explicit original parent config7 interruption preserves old modes',()=>{
 it('accepts the original strict parent mode without claiming child cancellation, costs or Task completion',()=>{const f=parentFixture();expect(verify(f.basis,f.read)).toMatchObject({status:'Observed',phase:'suspended',runtime_resumed:false,completion_proven:false,costs_reconciled:false});});
 it.each(['legacy_downgrade','missing_binding','binding_extra','binding_format','foreign_scope','foreign_digest','provider_mode','named_mix','deadline','lifetime','missing_binary'])('refuses %s even when retained Native config digests agree',kind=>{
  const f=parentFixture(),binding=f.config.parent_skill_original_binding as Record<string,unknown>;
  if(kind==='legacy_downgrade')f.config.format='cimiloop/agent-workspace-sandbox-config/5.0.0';if(kind==='missing_binding')delete f.config.parent_skill_original_binding;if(kind==='binding_extra')binding.extra=true;if(kind==='binding_format')binding.format='foreign';if(kind==='foreign_scope')binding.scope_digest=digest('PUBLIC foreign scope').value;if(kind==='foreign_digest')binding.sdk_catalog_digest='wrong';if(kind==='provider_mode')f.config.provider_options={};if(kind==='named_mix')f.config.method_tools='fixed_named_method/1.0.0';if(kind==='deadline')f.config.deadline_uptime_ms=0;if(kind==='lifetime')f.config.lifetime_policy=null;if(kind==='missing_binary')delete f.config.binary_original;
  f.refresh();expect(()=>verify(f.basis,f.read)).toThrow('agent_runtime_interruption_unproven');
 });
 it.each(['valid','foreign_binding','missing_input_mode'])('rechecks collected parent %s against its exact original input',kind=>{
  const f=parentFixture(),operation=mkdtempSync(join(tmpdir(),'cimiloop-parent-interruption-contract-')),blobs=join(operation,'PUBLIC-blobs');mkdirSync(blobs);const sandbox_original={format:'PUBLIC controller binding'};f.records['original-launcher.json']!.launcher_original=sandbox_original;
  const artifacts=Object.keys(f.records).map(name=>{const bytes=f.read(name)!,hash=digest(bytes);writeFileSync(join(operation,name),bytes);const locator=join(blobs,hash.value);writeFileSync(locator,bytes);return{name,reference:{locator,digest:hash}};});
  const interruption={status:'Observed',phase:'suspended',runtime_resumed:false,reason:'agent_sandbox_parent_ended',completion_proven:false,costs_reconciled:false},input:Record<string,unknown>={binary_original:f.config.binary_original,sandbox_original,parent_skill_original_binding:structuredClone(f.config.parent_skill_original_binding),provider_options:structuredClone(f.config.provider_options),lifetime_policy:f.config.lifetime_policy,deadline_uptime_ms:f.config.deadline_uptime_ms,prompt:f.config.prompt};
  if(kind==='foreign_binding')(input.parent_skill_original_binding as Record<string,unknown>).catalog_digest=digest('PUBLIC another original catalog').value;if(kind==='missing_input_mode')input.provider_options={};
  const action=()=>runtime.verifyCollectedAgentRuntimeInterruption({...f.basis,operation,input},{artifacts,interruption});
  if(kind==='valid')expect(action()).toEqual(interruption);else expect(action).toThrow('agent_runtime_interruption_unproven');
 });
});
