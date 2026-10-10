import{createAccountBillingEntry}from'./agent-account-billing-entry.js';
import{AgentRuntimeModelHost,parseAgentRuntimeModelRequest}from'../../packages/runtime-adapter/src/agent-runtime-model.js';
import{createDedicatedAgentRuntimeModel,readDedicatedAgentModelOriginals}from'../../packages/runtime-adapter/src/agent-dedicated-model.js';
import{digest}from'../../packages/runtime-adapter/src/files.js';
import{claimAgentRuntimeOperation}from'../../packages/runtime-adapter/src/agent-runtime-operation.js';
import{httpFixture,HTTP_FIXTURE_KEY}from'../../packages/runtime-adapter/test/gateway-http-fixture.js';
import{initializeWindowsAgentStartLedger,initializeWindowsDedicatedAgentAccountLedger}from'../../packages/runtime-adapter/dist/index.js';
// Actual Kernel/SQLite/TLS and model request/account/bill originals. Public
// constructed credential, provider reply, admission and bill authentication.
// No actual OpenCode/Native process, real provider/model/Skill/S1 qualification.
export async function createAgentRunCostObservation(currency='USD',options:{windowsCustody?:boolean}={}){
 const x=createAccountBillingEntry({currency,credentialOutside:true}),root=x.local.location.dataDirectory;
 let account=x.account,policy=x.policy,origin=x.origin,accountRoot=x.accountRoot;
 if(options.windowsCustody){
  const toolsRoot=x.base+'/native-tools';origin=await initializeWindowsAgentStartLedger(x.base+'/native-host',toolsRoot);accountRoot=x.base+'/native-account';
  policy={...x.policy,host_identity_digest:origin.identityDigest,account_digest:digest(x.root+' public protected model account').value};
  account=await initializeWindowsDedicatedAgentAccountLedger({origin,repositoryPath:x.root,root:accountRoot,toolsRoot,policy,connection:x.connection,admission:{check:async()=>{}},billing:{identity_digest:digest('public verifier').value,currency,credit_unit:'coding_request_micro_units',verifyOriginal:bytes=>{const p=x.projections.get(digest(bytes).value);if(!p)throw Error('Public bill unproven');return p;}}});
 }
 const tls=await httpFixture({reply:body=>({content_type:'application/json',chunks:[Buffer.from(JSON.stringify({id:'PUBLIC-costed-provider-1',model:'glm-fixture',request_id:(body as {request_id:string}).request_id,choices:[{index:0,message:{role:'assistant',content:'PUBLIC constructed result',reasoning_content:'PUBLIC reasoning'},finish_reason:'stop'}],usage:{prompt_tokens:5,completion_tokens:5,total_tokens:10}}))]})});let credentials=0;
 const model=createDedicatedAgentRuntimeModel({root,repositoryPath:x.root,scope:x.scope,connection:x.connection,account},{boundary:tls.boundary,readCredential:async()=>{credentials++;return HTTP_FIXTURE_KEY;}});
 // Preserve the exact approved connection digest; the absent credential path
 // is already a public constructed identity outside this test repository.
 // Account's original connection must be the one passed to its model.
 const host=await AgentRuntimeModelHost.initialize(root,x.scope,model,['cimi_read']);
 claimAgentRuntimeOperation(root,x.scope,{purpose:'agent_runtime',model_original_binding:host.originalBinding},{pid:1234,creation_ticks:'123456',image:process.execPath});
 const request=parseAgentRuntimeModelRequest(x.scope,{format:'cimiloop/agent-runtime-model-request/1.0.0',scope_digest:digest(JSON.stringify(x.scope)).value,admission_digest:account.admission_digest,call_id:'model_0001',tool:'model_step',prompt:[{role:'user',content:'PUBLIC constructed Task'}],tools:[],max_output_tokens:512},['cimi_read']);
 const execute=()=>host.execute(request);
 const addBill=()=>{const hold=readDedicatedAgentModelOriginals(root,x.scope).calls[0]!.hold!;const bytes=Buffer.from('PUBLIC CONSTRUCTED model-matched final bill');x.projections.set(digest(bytes).value,{format:'cimiloop/dedicated-account-bill/1.0.0',bill_id:'public-sdk-final-1',account_digest:policy.account_digest,approval_digest:policy.approval_digest,package_digest:policy.package_digest,tariff_digest:policy.tariff_digest,connection_digest:policy.connection_digest,currency,credit_unit:'coding_request_micro_units',items:[{request_id:hold.request_id,scope_digest:hold.scope_digest,call_id:hold.call_id,request_digest:hold.request_digest,hold_digest:digest(JSON.stringify(hold)).value,cash_charged_micros:12,credit_charged_micro_units:4}]});account.observeBill(bytes);};
 return{...x,account,policy,origin,accountRoot,windowsCustody:options.windowsCustody===true,modelRoot:root,tls,execute,addMatchedBill:addBill,credentialReads:()=>credentials,async closeAll(){await tls.close();if(account!==x.account){account.close();origin.close();}x.close();}};
}
