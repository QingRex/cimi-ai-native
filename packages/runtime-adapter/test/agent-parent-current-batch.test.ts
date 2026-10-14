import{it,expect}from'vitest';
import{copyAgentParentCurrentBatch}from'../src/agent-runtime-completion.js';
import{copyToolJson}from'../src/tool-journal.js';
import{parseAgentParentSkillIpcReceipt}from'../src/agent-parent-skill-ipc.js';
import{parseAgentParentCurrentInput}from'../src/agent-parent-current-input.js';
import{digest}from'../src/files.js';

// Actual bounded copy/parser contracts only. PUBLIC receipts grant no source,
// model, Skill qualification, Native, bill or Task acceptance authority.
function item(index:number){
 const hash=digest('PUBLIC current batch '+index).value,ref=(resource_type:string)=>({provider:'local_content',resource_type,locator:hash,digest:{algorithm:'sha256',value:hash}}),id='019f0d3b-4000-7000-8000-'+String(index+1).padStart(12,'0');
 const frame={format:'cimiloop/agent-parent-skill-request/1.0.0' as const,scope_digest:hash,catalog_digest:hash,call_id:'sdk_'+hash,tool:'run_skill' as const,skill_alias:'review',method_name:'review',input_alias:'current'};
 const output={purpose:'review',findings:Array.from({length:16},(_,n)=>({axis:'spec',severity:'non_blocking',observation:'PUBLIC source finding '+n,basis_refs:[ref('workspace_file')]})),limitations:[]};
 const receipt={format:'cimiloop/agent-parent-skill-receipt/1.0.0',scope_digest:hash,catalog_digest:hash,call_id:frame.call_id,request_digest:digest(JSON.stringify(frame)).value,invocation_id:id,invocation_key:id,observation_id:id,report_digest:hash,status:'succeeded',output,output_digest:digest(JSON.stringify(output)).value,formal_agent_execution_enabled:false};
 const body={format:'cimiloop/original-parent-current-input/1.0.0',scope_digest:hash,catalog_digest:hash,call_id:frame.call_id,command_id:id,candidate_digest:hash,input_ref:ref('skill_method_input'),proof_ref:ref('skill_invocation_proof'),input_digest:hash,materials_digest:hash,projection_digest:hash};
 return{frame,value:{receipt,current_input:{...body,current_input_digest:digest(JSON.stringify(body)).value}}};
}
it.each([32,64])('copies %i individually valid current Skill results even when the complete batch exceeds a single tool frame',length=>{
 const originals=Array.from({length},(_,i)=>item(i)),values=originals.map(x=>x.value);
 for(const x of originals){expect(copyToolJson(x.value)).toEqual(x.value);expect(parseAgentParentSkillIpcReceipt(x.value.receipt,x.frame).status).toBe('succeeded');expect(parseAgentParentCurrentInput(x.value.current_input,x.frame).call_id).toBe(x.frame.call_id);}
 expect(()=>copyToolJson(values)).toThrow('tool_contract_invalid');
 const copied=copyAgentParentCurrentBatch(values);expect(copied).toEqual(values);expect(copied).not.toBe(values);
 values[0]!.receipt.output.findings[0]!.observation='PUBLIC modified after copied';expect(copied).not.toEqual(values);
});
it('rejects 65 current results independently of the single-item node limit',()=>{expect(()=>copyAgentParentCurrentBatch(Array.from({length:65},()=>null))).toThrow();});
it('retains the individual 4096-node and depth16 limits',()=>{
 expect(()=>copyAgentParentCurrentBatch([{receipt:Array.from({length:4096},()=>null),current_input:null}])).toThrow('tool_contract_invalid');
 let deep:unknown=null;for(let i=0;i<18;i++)deep={next:deep};expect(()=>copyAgentParentCurrentBatch([{receipt:deep,current_input:null}])).toThrow('tool_contract_invalid');
});
it('preserves each original frame allowance independently of its sibling and pair wrapper',()=>{
 const receipt=Array.from({length:4095},()=>null),values=[{receipt,current_input:item(0).value.current_input}];
 expect(copyToolJson(receipt)).toEqual(receipt);expect(()=>copyToolJson(values[0])).toThrow('tool_contract_invalid');
 expect(copyAgentParentCurrentBatch(values)).toEqual(values);
});
it.each(['index','then','toJSON'])('rejects an executable %s getter without evaluating it',key=>{
 const values:unknown[]=[item(0).value];let calls=0;Object.defineProperty(values,key==='index'?'0':key,{enumerable:true,get(){calls++;return item(0).value;}});
 expect(()=>copyAgentParentCurrentBatch(values)).toThrow();expect(calls).toBe(0);
});
it('rejects sparse, extra-key, symbol and custom-prototype arrays',()=>{
 const sparse=new Array(1),extra=Object.assign([item(0).value],{PUBLIC:true}),symbol=[item(0).value],custom=[item(0).value];Reflect.set(symbol,Symbol('PUBLIC'),true);Object.setPrototypeOf(custom,{PUBLIC:true});
 for(const value of[sparse,extra,symbol,custom])expect(()=>copyAgentParentCurrentBatch(value)).toThrow();
});
it('consumes an original Promise rejection without accepting asynchronous current results',async()=>{
 expect(()=>copyAgentParentCurrentBatch(Promise.reject(Error('PUBLIC async current batch')))).toThrow('Async current batch');await Promise.resolve();
});
