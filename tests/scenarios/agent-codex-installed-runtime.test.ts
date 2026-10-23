import{execFileSync}from'node:child_process';
import{mkdirSync,mkdtempSync,writeFileSync}from'node:fs';
import{join,resolve}from'node:path';
import{describe,expect,it}from'vitest';
import{openLocalProject,openInstalledCodexAgentRuntime}from'../../packages/local-app/dist/index.js';
import{AgentRuntimeModelHost}from'../../packages/runtime-adapter/dist/agent-runtime-model.js';
import{CodexOriginalMethodRuntime,createCodexAgentRuntimeModel,readCodexAgentModelOriginals,bytesAt,digest,parseGatewayJson,parseAgentWorkspaceToolScope}from'../../packages/runtime-adapter/dist/index.js';
import{createInternalId}from'../../packages/protocol/dist/v2/index.js';
import{startWorkbench}from'../../apps/workbench/src/server.js';

// Explicit opt-in uses the approved current Codex login and Luna quota. Public
// project/SDK domain setup; real protected installation, CLI, HTTP and model.
// No Native execution, provider qualification, paid bill or S1 acceptance.
const configPath=process.env.CIMILOOP_CODEX_NATIVE_TEST_CONFIG;
describe.runIf(process.platform==='win32'&&process.arch==='x64'&&!!configPath)('installed original Codex model account',()=>{
 it('uses the compiled installer and default workbench, then one SDK exchange bound to that installed account',async()=>{
  const config=JSON.parse(JSON.stringify(parseGatewayJson(bytesAt(configPath!,65536).toString('utf8'),65536))) as{binary:string;model:string;disabled_mcp_servers:string[]};expect(config.model).toBe('gpt-6-luna');
  const parent=process.env.CIMILOOP_NATIVE_TEST_ROOT??join(process.env.LOCALAPPDATA!,'CimiS1');mkdirSync(parent,{recursive:true});const root=mkdtempSync(join(parent,'codex-installed-')),project=join(root,'project');mkdirSync(join(project,'src'),{recursive:true});
  const git=(...args:string[])=>execFileSync('git',['-c','commit.gpgsign=false','-c','core.hooksPath=disabled-hooks','-C',project,...args],{windowsHide:true,stdio:'pipe',encoding:'utf8'});
  git('init');git('config','user.name','PUBLIC installed SDK test');git('config','user.email','public@example.test');writeFileSync(join(project,'src/query.ts'),'export const query=()=>1;\n');const check="import{query}from'./query.ts';if(query()!==1)throw Error('query');\n";writeFileSync(join(project,'src/check.mjs'),check);git('add','.');git('commit','-m','PUBLIC SDK integration source');
  const cli=resolve('apps/cli/dist/bin.js'),command=(...args:string[])=>JSON.parse(execFileSync(process.execPath,[cli,...args,'--project-dir',project,'--json'],{windowsHide:true,stdio:'pipe',encoding:'utf8',timeout:120000}));
  command('init','--yes');const checks=join(root,'checks.json');writeFileSync(checks,JSON.stringify([{check_id:'query_test',profile:'node_test',entry:'src/check.mjs',inputs:[{path:'src/check.mjs',expected_digest:digest(check).value},{path:'src/query.ts'}],max_elapsed_ms:4000,max_output_bytes:32768}]),{flag:'wx'});
  const args=['runtime','install-codex','--binary',config.binary,'--native-binary',join(process.env.APPDATA!,'npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe'),'--checks',checks,'--model',config.model,'--yes'];if(config.disabled_mcp_servers.length)args.push('--disable-mcp-server',...config.disabled_mcp_servers);
  const startedAt=new Date().toISOString();console.error('Preserve actual Codex installation/SDK test: '+root);
  const installed=command(...args);expect(installed).toMatchObject({created:true,model:'gpt-6-luna',costs_reconciled:false,provider_qualification_proven:false});expect(command('runtime','codex-installation')).toMatchObject({state:'installed',model:config.model,installation_digest:installed.installation_digest,starts_run:false});
  const local=openLocalProject({projectDir:project});let lease:Awaited<ReturnType<typeof openInstalledCodexAgentRuntime>>;
  try{
   lease=await openInstalledCodexAgentRuntime(local);if(!lease)throw Error('Installed Codex runtime missing');const fixed=lease,before=local.store.asOfEventSequence(),server=await startWorkbench({projectDir:project});
   try{const login=await fetch(server.origin+'/api/session',{method:'POST',headers:{Origin:server.origin,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});expect(login.status).toBe(200);const context=await fetch(server.origin+'/api/context',{headers:{Cookie:login.headers.get('set-cookie')!.split(';')[0]!,Connection:'close'}});expect(await context.json()).toMatchObject({agent_start_available:false,codex_runtime_installation:{state:'installed',model:config.model,installation_digest:installed.installation_digest,starts_run:false}});}finally{await server.close();}
   expect(local.store.asOfEventSequence()).toBe(before);
   const scope=parseAgentWorkspaceToolScope({project_id:local.instance.project_id,run_id:createInternalId(),operation_key:createInternalId(),executor_actor_id:createInternalId(),context_digest:digest('PUBLIC SDK contract, not a Kernel Run'),skill_bindings:[],runtime_binding:{binding_ref:{object_type:'provider_binding',id:createInternalId()},digest:digest('PUBLIC qualification only')},host_admission_ref:{provider:'local_content',resource_type:'agent_host_admission',locator:digest('PUBLIC host admission').value,digest:digest('PUBLIC host admission')}});
   const admission=digest(JSON.stringify({installation:fixed.installation_digest,scope,qualification:'PUBLIC SDK setup; not production'})).value;
   const transport=new CodexOriginalMethodRuntime({root:join(fixed.root,'originals'),command:{file:fixed.binary,args:[],sha256:digest(bytesAt(fixed.binary,512*1024*1024)).value},account_digest:fixed.account_digest,disabled_mcp_servers:fixed.disabled_mcp_servers,timeout_ms:180000});
   const model=createCodexAgentRuntimeModel({root:local.location.dataDirectory,scope,runtime:transport,model:fixed.model,account_digest:fixed.account_digest,quota_account_digest:fixed.quota_account_digest,admission_digest:admission,output_profile:fixed.output_profile,usage_policy:fixed.usage_policy,origin:'external_model',permitted_tools:['cimi_read'],authority:{async check(current){expect(current).toEqual(scope);fixed.guard();},beforeEffect(){fixed.guard();}}});
   const host=await AgentRuntimeModelHost.initialize(local.location.dataDirectory,scope,model,['cimi_read']),request={format:'cimiloop/agent-runtime-model-request/3.0.0',scope_digest:digest(JSON.stringify(scope)).value,admission_digest:admission,call_id:'model_0001',tool:'model_step',prompt:[{role:'user',content:[{type:'text',text:'This is a single model/SDK account-binding test. Submit one short text acknowledgement, finish=stop. Do not request business tools. No Task, Human approval, delivery or bill is being verified.'}]}],tools:[{type:'function',name:'cimi_read',description:'PUBLIC test catalog; do not request this tool.',inputSchema:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}}],max_output_tokens:2048};
   writeFileSync(join(root,'original-operation.json'),JSON.stringify({project,scope,request,installation_digest:installed.installation_digest,startedAt}),{flag:'wx'});
   const first=await host.execute(request);expect(first.receipt).toMatchObject({finish:'stop'});expect(first.receipt.content.every(part=>part.type==='text')).toBe(true);const original=readCodexAgentModelOriginals(local.location.dataDirectory,scope);
   expect(original).toMatchObject({status:'Observed',real_model_turns:1,quota_account_digest:fixed.quota_account_digest,usage_policy:fixed.usage_policy,calls:[{original:{ordinary_quota:{before:{ordinary_usage_allowed:true,account_id_digest:fixed.quota_account_digest},after:{account_id_digest:fixed.quota_account_digest},costs_reconciled:false}}}]});
   expect(await host.execute(request)).toMatchObject({receipt:first.receipt,replay:true});expect(readCodexAgentModelOriginals(local.location.dataDirectory,scope)).toEqual(original);expect(local.store.asOfEventSequence()).toBe(before);
   writeFileSync(join(root,'summary.json'),JSON.stringify({ok:true,root,project,startedAt,finishedAt:new Date().toISOString(),scope,model:config.model,installationDigest:installed.installation_digest,realModelTurns:1,outputTokens:original.calls[0]!.original!.usage.outputTokens,replayAddedModelTurns:0,additionalKernelEvents:0,defaultCliInstallation:true,defaultWorkbenchDiscovery:true,nativeExecuted:false,productionQualification:false,costsReconciled:false},null,2),{flag:'wx'});
  }finally{lease?.release();local.store.close();}
 },360000);
});
