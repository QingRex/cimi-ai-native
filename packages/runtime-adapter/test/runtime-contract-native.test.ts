import {existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {expect,it} from 'vitest';
import {createInternalId} from '@cimiloop/protocol/v2';
import {AgentStartLedger,AgentRunBudget,AgentRuntimeModelHost,AgentWorkspaceToolIpc,CodexOriginalMethodRuntime,CodexAgentUsageBudget,RuntimeContractFileHost,createBudgetedCodexAgentRuntimeModel,codexChatGptAccountDigest,openWindowsAgentRunClock,parseAgentWorkspaceToolScope,runOpenCodeWorkspaceRuntime,runtimeContractPrompt,readRuntimeContractPhase,queryAgentRuntimeOperation} from '../src/index.js';
import {digest} from '../src/files.js';

// Actual Windows/AppContainer, original OpenCode SDK/IPC, file broker and stdio.
// The model/account replies are PUBLIC fixtures. No login or real model is used;
// this cannot qualify a production account, settle a bill or count as S1.
it('joins an actual SDK edit and independent read-only review, then rechecks originals without another dispatch',async()=>{
 const root=mkdtempSync(join(tmpdir(),'rc-')),script=join(root,'public.mjs'),counter=join(root,'turns.json'),login=join(root,'login');mkdirSync(login);writeFileSync(counter,'{}');
 const before=digest('before\n').value,after=digest('after\n').value;
 writeFileSync(script,String.raw`import{createInterface}from'node:readline';import{readFileSync,writeFileSync}from'node:fs';
 const mode=process.argv[2],counter=process.argv[3],thread='PUBLIC_THREAD_'+process.pid;let tool,args;
 const send=v=>process.stdout.write(JSON.stringify(v)+'\n'),event=item=>send({method:'item/completed',params:{threadId:thread,turnId:'PUBLIC_TURN',item}});
 createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line),ok=result=>send({id:r.id,result});
 if(!r.method){if(r.id===901){event({type:'dynamicToolCall',id:'PUBLIC_SUBMISSION',namespace:null,tool,arguments:args,status:'completed',contentItems:r.result.contentItems,success:r.result.success});event({type:'agentMessage',phase:'final_answer',text:'{"submitted":true}'});send({method:'thread/tokenUsage/updated',params:{threadId:thread,turnId:'PUBLIC_TURN',tokenUsage:{total:{inputTokens:57,cachedInputTokens:5,outputTokens:19,totalTokens:76,reasoningOutputTokens:7,cacheWriteInputTokens:0}}}});send({method:'turn/completed',params:{threadId:thread,turn:{id:'PUBLIC_TURN',status:'completed',error:null}}});}return;}
 if(r.method==='initialize')ok({userAgent:'PUBLIC'});if(r.method==='account/read')ok({account:{type:'chatgpt',email:'PUBLIC@example.test'},requiresOpenaiAuth:true});if(r.method==='account/rateLimits/read')ok({ordinaryUsageAllowed:true,accountId:'PUBLIC-account',rateLimits:{primary:null,secondary:null,credits:null}});
 if(r.method==='thread/start')ok({model:r.params.model,modelProvider:'openai',approvalPolicy:'never',activePermissionProfile:{id:'cimiloop-method'},instructionSources:[],thread:{id:thread,ephemeral:r.params.ephemeral===true}});if(r.method==='mcpServerStatus/list')ok({data:[],nextCursor:null});
 if(r.method==='turn/start'){const counts=JSON.parse(readFileSync(counter,'utf8')),step=counts[mode]??0;counts[mode]=step+1;writeFileSync(counter,JSON.stringify(counts));ok({turn:{id:'PUBLIC_TURN'}});
 if(step===0){tool='cimi_read';args={path:'input.txt',expected_digest:mode==='edit'?process.argv[4]:process.argv[5]};}
 else if(mode==='edit'&&step===1){tool='cimi_replace';args={path:'input.txt',expected_digest:process.argv[4],replacement_utf8:'after\n'};}
 else{tool='cimiloop_task_result';args={text:mode==='edit'?'CIMILOOP_EDIT_COMPLETE':'CIMILOOP_REVIEW_ACCEPT'};}
 send({id:901,method:'item/tool/call',params:{threadId:thread,turnId:'PUBLIC_TURN',callId:'PUBLIC_SUBMISSION',namespace:null,tool,arguments:args}});}});`);
 const origin=AgentStartLedger.initialize(join(root,'origin'),{machine_digest:digest('PUBLIC machine').value,principal_digest:digest('PUBLIC owner').value}),account=codexChatGptAccountDigest({account:{type:'chatgpt',email:'PUBLIC@example.test'}}),quota=digest('PUBLIC-account').value;
 const usage=CodexAgentUsageBudget.initialize(origin,{account_digest:account,quota_account_digest:quota,model_calls:5,output_tokens:10240}),project_id=createInternalId(),descriptor=createInternalId(),started=new Date().toISOString(),task=createInternalId();
 const loginStat=lstatSync(login,{bigint:true}),login_home={path:login,identity:{dev:String(loginStat.dev),ino:String(loginStat.ino),birth:String(loginStat.birthtimeNs)}};
 const binary=join(process.env.APPDATA!,'npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe');expect(existsSync(binary)).toBe(true);
 const phases:Parameters<typeof readRuntimeContractPhase>[]=[];
 try{for(const mode of ['edit','review'] as const){
  const phaseRoot=join(root,mode==='edit'?'e':'r'),workspace=join(phaseRoot,'files');mkdirSync(workspace,{recursive:true});writeFileSync(join(workspace,'input.txt'),mode==='edit'?'before\n':readFileSync(join(root,'e','files','input.txt')));
  const scope=parseAgentWorkspaceToolScope({project_id,run_id:createInternalId(),operation_key:createInternalId(),executor_actor_id:createInternalId(),context_digest:digest('PUBLIC '+mode),runtime_binding:{binding_ref:{object_type:'provider_binding',id:descriptor},digest:digest('PUBLIC descriptor transport pin')},skill_bindings:[],host_admission_ref:{provider:'local_content',resource_type:'agent_host_admission',locator:digest('PUBLIC '+mode).value,digest:digest('PUBLIC '+mode)}});
  const clock=await openWindowsAgentRunClock(phaseRoot),budget=await AgentRunBudget.open(phaseRoot,{basis:()=>({scope,task_id:task,first_started_at:started,max_elapsed_ms:300000}),readClock:clock.read,closeClock:clock.close});
  const files=await RuntimeContractFileHost.open({workspace,tools:phaseRoot,origin,scope,mode,authority:()=>digest('PUBLIC Kernel technical grant').value});
  try{const transport=new CodexOriginalMethodRuntime({root:join(phaseRoot,'codex'),command:{file:process.execPath,args:[script,mode,counter,before,after],sha256:digest(readFileSync(process.execPath)).value},account_digest:account,timeout_ms:30000,state_policy:'private_login_home/2.0.0',login_home,process_custody:'owner_job/1.0.0',process_root:join(phaseRoot,'processes')},false,origin);
   const permitted=mode==='edit'?['cimi_read','cimi_replace']:['cimi_read'],prompt=runtimeContractPrompt(mode),port=createBudgetedCodexAgentRuntimeModel({root:phaseRoot,scope,runtime:transport,model:'gpt-6-luna',account_digest:account,quota_account_digest:quota,output_profile:'bounded_2048/1.0.0',usage_policy:'require_ordinary_permission/1.0.0',origin:'public_fixture',admission_digest:digest('PUBLIC technical admission '+mode).value,permitted_tools:permitted,authority:{async check(){},beforeEffect(){}}},usage),model=await AgentRuntimeModelHost.initialize(phaseRoot,scope,port,permitted,prompt);
   await runOpenCodeWorkspaceRuntime({root:phaseRoot,binary,scope,prompt,model,runBudget:budget,connect:(supervisor,originalSupervisor,peer,nonce,signal,originalModel)=>AgentWorkspaceToolIpc.open({toolsDirectory:phaseRoot,scope,supervisor,originalSupervisor,originalPeer:peer,nonce,signal,model:originalModel,runBudget:budget,execute:input=>files.execute(input),cancel:()=>files.close()})});
  }finally{await files.close();await budget.close();}
  phases.push([phaseRoot,scope,origin,mode]);expect(readRuntimeContractPhase(phaseRoot,scope,origin,mode)).toMatchObject({status:'Observed',origin:'public_fixture',mode,effect_reverified:true,real_model_turns:0,costs_reconciled:false,business_execution_approved:false,final_text:mode==='edit'?'CIMILOOP_EDIT_COMPLETE':'CIMILOOP_REVIEW_ACCEPT'});
  expect(await queryAgentRuntimeOperation(phaseRoot,scope)).toMatchObject({status:'Stopped',resource_scope:'native_and_current_codex_run',native_resources_disposed:true,resources_disposed:true,completion_proven:false,model_resources:{status:'Observed',resources_disposed:true,completion_proven:false,costs_reconciled:false,family_resources_disposed:false}});
 }
 const results=phases.map(args=>readRuntimeContractPhase(...args));expect(results[0]!.session_id).not.toBe(results[1]!.session_id);expect(results[0]!.native_profile).not.toBe(results[1]!.native_profile);expect(results[0]!.model_threads!.some(id=>results[1]!.model_threads!.includes(id))).toBe(false);
 expect(JSON.parse(readFileSync(counter,'utf8'))).toEqual({edit:3,review:2});expect(usage.snapshot().held.model_calls).toBe(5);for(const args of phases)expect(readRuntimeContractPhase(...args).status).toBe('Observed');expect(JSON.parse(readFileSync(counter,'utf8'))).toEqual({edit:3,review:2});
 const file=join(root,'e','files','input.txt');renameSync(file,file+'.retained');writeFileSync(file,'after\n');expect(readRuntimeContractPhase(...phases[0]!).status).toBe('Unknown');expect(readRuntimeContractPhase(...phases[1]!).status).toBe('Observed');
 }finally{origin.close();}
},360000);
