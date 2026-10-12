import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {execFile,execFileSync} from 'node:child_process';import {promisify} from 'node:util';
import {beforeAll,describe,it,expect,vi} from 'vitest';
import {buildWindowsAgentWorkspaceSandbox,isolatedEnvironment} from '../src/native.js';import {digest} from '../src/files.js';
vi.setConfig({testTimeout:30000,hookTimeout:120000});
// Actual compiled production C# methods and exact saved config/catalog bytes.
// No Native process/Job/AppContainer effects, provider call or qualification.
describe.runIf(process.platform==='win32'&&process.arch==='x64')('parent Skill original Native config and fixed SDK permissions',()=>{
 let fixture:string,core:string,contract:string;
 beforeAll(async()=>{
  fixture=mkdtempSync(join(tmpdir(),'cimiloop-parent-native-config-'));
  core=(await buildWindowsAgentWorkspaceSandbox(join(fixture,'original'))).path;
  contract=join(fixture,'ParentSkillConfigContract.exe');
  const source=fileURLToPath(new URL('../../../tests/fixtures/agent-parent-skill-config-contract.cs',import.meta.url));
  await promisify(execFile)(join(process.env.SystemRoot!,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/reference:System.Web.Extensions.dll','/out:'+contract,source],{windowsHide:true,timeout:30000,env:isolatedEnvironment()});
  console.error('Retain original parent Native config fixture: '+fixture);
 });
 function basis(){
  const scope_digest=digest('PUBLIC parent scope').value,catalog_digest=digest('PUBLIC private fixed alias catalog').value;
  const catalog={scope_digest,catalog_digest,entries:[{skill_alias:'analyse',method_name:'inspect',input_alias:'candidate'}]},bytes=JSON.stringify(catalog);
  const config={format:'cimiloop/agent-workspace-sandbox-config/7.0.0',nonce:'PUBLIC nonce',root:'PUBLIC root',binary:'PUBLIC binary',owner:{},pipe_nonce:'PUBLIC pipe nonce',scope_digest,elapsed_ms:600000,provider_options:{admission_digest:digest('PUBLIC model admission').value,parent_skill_tools:'fixed_parent_skill/1.0.0'},deadline_uptime_ms:123456789,prompt:'PUBLIC complete original Task packet',lifetime_policy:'agent_task/1.0.0',binary_original:{format:'cimiloop/runtime-binary-original-proof/1.0.0',path:'PUBLIC binary'},parent_skill_tools:'fixed_parent_skill/1.0.0',parent_skill_original_binding:{format:'cimiloop/agent-parent-skill-binding/1.0.0',scope_digest,catalog_digest,sdk_catalog_digest:digest(bytes).value}};
  const modules=mkdtempSync(join(fixture,'modules-'));writeFileSync(join(modules,'parent-skill-catalog.json'),bytes,{flag:'wx'});return{config,catalog,bytes,modules};
 }
 const read=(mode:string,config:unknown,modules?:string)=>JSON.parse(execFileSync(contract,[core],{input:JSON.stringify({mode,config,modules,production:true,checks_only:false})+'\n',windowsHide:true,timeout:15000,encoding:'utf8',env:isolatedEnvironment()}));
 it('accepts only explicit saved Native7 with original parent scope, catalog pin, Task policy and finite original deadline',()=>{const f=basis();expect(read('config',f.config)).toMatchObject({accepted:true,result:123456789});});
 it('reads the original fixed alias catalog bytes bound to the same scope and private catalog digest',()=>{const f=basis();expect(read('catalog',f.config,f.modules)).toMatchObject({accepted:true});});
 it('grants exactly the four fixed ordinary parent SDK tools under default deny',()=>{const f=basis();expect(read('permissions',f.config)).toEqual({accepted:true,result:{'*':'deny',cimi_read:'allow',cimi_replace:'allow',cimi_check:'allow',cimi_run_skill:'allow'}});});
 for(const name of ['old_format','missing_marker','wrong_marker','bad_catalog_digest','wrong_scope','null_deadline','null_prompt','extra_authority'])it('rejects '+name+' instead of interpreting it as ordinary or named-method execution',()=>{
  const f=basis();switch(name){case'old_format':f.config.format='cimiloop/agent-workspace-sandbox-config/5.0.0';break;case'missing_marker':Reflect.deleteProperty(f.config,'parent_skill_tools');break;case'wrong_marker':f.config.parent_skill_tools='unrestricted';break;case'bad_catalog_digest':f.config.parent_skill_original_binding.sdk_catalog_digest='invalid';break;case'wrong_scope':f.config.parent_skill_original_binding.scope_digest=digest('other scope').value;break;case'null_deadline':Reflect.set(f.config,'deadline_uptime_ms',null);break;case'null_prompt':Reflect.set(f.config,'prompt',null);break;case'extra_authority':Reflect.set(f.config,'approved',true);}
  expect(read('config',f.config)).toMatchObject({accepted:false});
 });
 it('rejects a BOM added to the original catalog instead of normalizing changed bytes into the old SDK digest',()=>{const f=basis();writeFileSync(join(f.modules,'parent-skill-catalog.json'),Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(f.bytes)]));expect(read('catalog',f.config,f.modules)).toMatchObject({accepted:false});});
 it('rejects catalog bytes above the fixed original bound before admitting a parent SDK catalog',()=>{const f=basis(),bytes=f.bytes+' '.repeat(16385);f.config.parent_skill_original_binding.sdk_catalog_digest=digest(bytes).value;writeFileSync(join(f.modules,'parent-skill-catalog.json'),bytes);expect(read('catalog',f.config,f.modules)).toMatchObject({accepted:false});});
 it('rejects substituted original catalog bytes including refreshed file bytes with a missing alias',()=>{const f=basis();writeFileSync(join(f.modules,'parent-skill-catalog.json'),JSON.stringify({...f.catalog,entries:[]}));expect(read('catalog',f.config,f.modules)).toMatchObject({accepted:false});});
 it('rejects repeated or authority-bearing aliases even when the bytes digest matches',()=>{for(const entries of [[...basis().catalog.entries,...basis().catalog.entries],[{skill_alias:'analyse',method_name:'inspect',input_alias:'candidate',run_id:'caller-selected'}]]){const f=basis(),bytes=JSON.stringify({...f.catalog,entries});f.config.parent_skill_original_binding.sdk_catalog_digest=digest(bytes).value;writeFileSync(join(f.modules,'parent-skill-catalog.json'),bytes);expect(read('catalog',f.config,f.modules)).toMatchObject({accepted:false});}});
 it('preserves ordinary Native5 and named Native6 permission sets and rejects a parent mode downgrade',()=>{
  const f=basis(),ordinary=structuredClone(f.config);Reflect.deleteProperty(ordinary,'parent_skill_tools');Reflect.deleteProperty(ordinary,'parent_skill_original_binding');ordinary.format='cimiloop/agent-workspace-sandbox-config/5.0.0';Reflect.set(ordinary,'provider_options',{admission_digest:f.config.provider_options.admission_digest});
  expect(read('config',ordinary)).toMatchObject({accepted:true});expect(read('permissions',ordinary)).toEqual({accepted:true,result:{'*':'deny',cimi_read:'allow',cimi_replace:'allow',cimi_check:'allow'}});
  const named={...ordinary,format:'cimiloop/agent-workspace-sandbox-config/6.0.0',method_tools:'fixed_named_method/1.0.0',method_original_binding:{format:'cimiloop/agent-named-method-binding/1.0.0',profile_digest:digest('profile').value,header_digest:digest('header').value,anchor_digest:digest('anchor').value}};
  expect(read('config',named)).toMatchObject({accepted:true});expect(read('permissions',named)).toEqual({accepted:true,result:{'*':'deny',cimi_invoke_skill:'allow',cimi_read_method_resource:'allow'}});
 });
});
