import {beforeEach,afterEach,it,expect} from 'vitest';
import {join} from 'node:path';
import {readFileSync,writeFileSync,renameSync,rmSync,readdirSync} from 'node:fs';
import {createInternalId} from '@cimiloop/protocol/v2';
import * as runtime from '../src/index.js';
import {createOriginalFamilyCosts} from './original-family-costs-fixture.js';
import {fixedMethodFixture} from './fixed-method-fixture.js';

// Real immutable Host/account/SQLite/TLS requests and PUBLIC authenticated bills.
// No real provider, credentials, Native, qualification or S1 acceptance.
let x:Awaited<ReturnType<typeof createOriginalFamilyCosts>>;
beforeEach(async()=>{x=await createOriginalFamilyCosts();x.bill(x.relation.child,x.childRoot,'child',17,5);},120000);
afterEach(async()=>{await x?.close();});
function seal(relation:runtime.DedicatedAgentSkillScope){
 const path=join(x.base,relation.child.operation_key+'-dispatch.json');
 const marker={format:'cimiloop/skill-invocation-dispatch-block/1.0.0',ticket:relation.admission_ticket,scope:relation.child,reason:'kernel_cancelled_before_dispatch'};
 writeFileSync(path,JSON.stringify(marker),{flag:'wx'});
 x.origin.claimExclusiveOnce('skill_invocation_dispatch',runtime.digest(JSON.stringify({invocation_key:relation.child.operation_key,project_id:x.parent.project_id})).value,{...marker,anchor_path:path,anchor_identity:runtime.skillDispatchAnchorIdentity(path)});
 return path;
}
type Member={state:'executed'|'not_started';relation:runtime.DedicatedAgentSkillScope};
const executed=():Member=>({state:'executed',relation:x.relation});
const read=(members:Member[])=>{const f=Reflect.get(x.account,'readReconciledRunFamilyCosts');expect(f).toBeTypeOf('function');return f.call(x.account,x.parent,members);};
function foreignAccount(){return runtime.DedicatedAgentAccountLedger.initialize({origin:x.origin,repositoryPath:join(x.base,'repo'),root:join(x.base,'foreign-account'),policy:{...x.policy,account_digest:runtime.digest(x.base+'foreign').value},connection:x.connection,admission:{check:async()=>{},checkSkillScope:async()=>{}},custody:{protect:()=>{},verify:()=>{}},billing:{identity_digest:runtime.digest('PUBLIC verifier').value,currency:'USD',credit_unit:'coding_request_micro_units',verifyOriginal:bytes=>{const p=x.projections.get(runtime.digest(bytes).value);if(!p)throw Error('PUBLIC bill absent');return p;}}});}

it('joins complete parent/child bills and a positively closed unregistered child without creating a registration or another effect',()=>{
 const relation=x.birth();seal(relation);const before=x.account.snapshot(),members=[executed(),{state:'not_started' as const,relation}];
 expect(()=>x.account.readRunFamilyCosts(x.parent,members.map(m=>m.relation.child))).toThrow();
 const result=read(members);expect(result).toMatchObject({format:'cimiloop/reconciled-run-family-costs/1.0.0',holds:2,unresolved:0,closed_zero_scopes:1,costs_reconciled:true,cash_charged_micros:29,credit_charged_micro_units:9,currency:'USD',credit_unit:'coding_request_micro_units',starts_run:false});
 expect(result.scopes).toHaveLength(3);expect(result.zero_costs).toHaveLength(1);expect(read(members)).toEqual(result);expect(x.account.snapshot()).toEqual(before);expect(x.account.readOriginalSkillScopes(x.parent)).toHaveLength(1);expect(x.sends()).toBe(2);
});
it('settles a registered zero-call original only through the explicit new proof and preserves old snapshot semantics',async()=>{
 const relation=await x.register();seal(relation);const old=x.account.readRunFamilyCosts(x.parent,[x.relation.child,relation.child]);expect(old).toMatchObject({unstarted_scopes:1,costs_reconciled:false});
 expect(read([executed(),{state:'not_started',relation}])).toMatchObject({costs_reconciled:true,closed_zero_scopes:1,cash_charged_micros:29});expect(x.account.snapshot().costs_reconciled).toBe(false);
});
it('rejects omitted, duplicate, substituted or wrongly classified original children including an unregistered original birth',()=>{
 const relation=x.birth();seal(relation);const zero:Member={state:'not_started',relation};
 for(const members of [[executed()],[zero],[executed(),zero,zero],[executed(),{...zero,relation:{...relation,child:{...relation.child,context_digest:runtime.digest(createInternalId())}}}],[executed(),{state:'executed' as const,relation}],[{state:'not_started' as const,relation:x.relation},zero]])expect(()=>read(members)).toThrow();
});
it('requires positive permanent closure and rejects a file with the same bytes but another physical identity',()=>{
 const relation=x.birth(),members=[executed(),{state:'not_started' as const,relation}];expect(()=>read(members)).toThrow();const path=seal(relation),held=path+'.retained';renameSync(path,held);writeFileSync(path,readFileSync(held));
 try{expect(()=>read(members)).toThrow();}finally{rmSync(path);renameSync(held,path);}expect(read(members).costs_reconciled).toBe(true);
});
it('rejects closed children with a prior actual model request and hold even with all final bills',()=>{
 seal(x.relation);expect(()=>read([{state:'not_started',relation:x.relation}])).toThrow();expect(x.sends()).toBe(2);
});
it('rejects another account registration for a positively closed zero-call child',async()=>{
 const relation=x.birth(),other=foreignAccount();try{await other.registerSkillScope(relation);seal(relation);expect(()=>read([executed(),{state:'not_started',relation}])).toThrow();}finally{other.close();}
});
it('rejects a foreign account registration for an executed member instead of overlooking cross-account ambiguity',async()=>{
 const other=foreignAccount();try{await other.registerSkillScope(x.relation);expect(()=>read([executed()])).toThrow();}finally{other.close();}
});
it('independently authenticates every final bill and refuses an unbilled parent',()=>{
 const originals=new Map(x.projections);x.projections.clear();try{expect(()=>read([executed()])).toThrow();}finally{for(const[k,v]of originals)x.projections.set(k,v);}expect(read([executed()])).toMatchObject({cash_charged_micros:29});
});

function closedInput(){
 const relation=x.birth();seal(relation);const inputs=fixedMethodFixture(),key=relation.child.operation_key;
 inputs.request.invocation_key=key;inputs.profile.invocation_key=key;inputs.profile.request_digest=runtime.digest(JSON.stringify(inputs.request));
 inputs.files.find(f=>f.path==='skill-request.json')!.content=JSON.stringify(inputs.request,null,2);
 for(const resource of inputs.profile.resources)resource.digest=runtime.digest(inputs.files.find(f=>f.path===resource.path)!.content);
 const root=join(x.root,'skill-runtime-originals',x.parent.project_id,key);
 return{state:'not_started' as const,relation,root,inputs};
}
function family(children:unknown[]){const f=Reflect.get(runtime,'readOriginalReconciledAgentRunFamilyCosts');expect(f).toBeTypeOf('function');return Reflect.apply(f,undefined,[x.root,x.parent,x.account,children]);}
const executedInput=()=>({state:'executed' as const,relation:x.relation,root:x.childRoot});
it('independently reads mixed original model requests/final bills and positive zero effects through a new family proof',()=>{
 const zero=closedInput(),children=[executedInput(),zero],before=x.account.snapshot();
 const proof=family(children);expect(proof).toMatchObject({format:'cimiloop/agent-run-family-cost-evidence/2.0.0',costs:{holds:2,closed_zero_scopes:1,costs_reconciled:true,cash_charged_micros:29,credit_charged_micro_units:9},starts_run:false,kernel_costs_reconciled:false});
 expect(proof.members).toHaveLength(3);expect(proof.members.filter((m:any)=>m.state==='not_started')).toHaveLength(1);expect(family(children)).toEqual(proof);expect(x.account.snapshot()).toEqual(before);expect(x.sends()).toBe(2);
});
it('reads actual original method preparation with zero calls and rejects a later actual method call',async()=>{
 const zero=closedInput(),method=runtime.AgentNamedMethodHost.initialize(zero.root,zero.relation.child,zero.inputs.profile,zero.inputs.files,()=>{});
 const member=family([executedInput(),zero]).members.find((m:any)=>m.state==='not_started');expect(member).toBeDefined();expect(member.preparation.artifacts.length).toBeGreaterThan(0);
 await method.execute({format:'cimiloop/agent-runtime-method-request/1.0.0',scope_digest:runtime.digest(JSON.stringify(zero.relation.child)).value,profile_digest:method.profileDigest,call_id:'sdk_original',tool:'invoke_skill',argument:'entry'});
 expect(()=>family([executedInput(),zero])).toThrow();
});
it('rejects any unexpected original Native effect and refuses substituted empty roots or another child model root',()=>{
 const zero=closedInput();const path=join(zero.root,'workspace-tool-rehearsals');runtime.directory(path);writeFileSync(join(path,'retained'),'PUBLIC original effect');
 expect(()=>family([executedInput(),zero])).toThrow();expect(()=>family([executedInput(),{...zero,root:join(x.base,'substituted-empty')}])).toThrow();expect(()=>family([{...executedInput(),root:x.root},zero])).toThrow();
});
it('rejects missing provider originals or forged zero-kind classification despite known final bills',()=>{
 const zero=closedInput(),path=join(x.childRoot,'agent-dedicated-model-originals',x.parent.project_id,x.parent.run_id,'model_0001/provider-response.json'),original=readFileSync(path);writeFileSync(path,'{}');
 try{expect(()=>family([executedInput(),zero])).toThrow();}finally{writeFileSync(path,original);}expect(family([executedInput(),zero]).costs.cash_charged_micros).toBe(29);
 expect(()=>family([{state:'not_started',relation:x.relation,root:x.childRoot,inputs:zero.inputs},zero])).toThrow();
});
it.each(['missing_relation','substituted_relation'])('does not overlook %s in another original account file-only registration intent',async corruption=>{
 const relation=x.birth(),other=foreignAccount();try{
  let calls=0;await expect(other.registerSkillScope(relation,()=>{if(++calls===3)throw Error('PUBLIC interruption before Host intent');})).rejects.toThrow();
  const root=join(x.base,'foreign-account'),name=readdirSync(root).find(n=>n.startsWith('skill-scope-intent-'))!;expect(name).toBeDefined();const path=join(root,name),original=JSON.parse(readFileSync(path,'utf8'));
  writeFileSync(path,JSON.stringify(corruption==='missing_relation'?{}:{...original,relation:{...relation,child:{...relation.child,operation_key:createInternalId()}}}));seal(relation);
  expect(()=>x.account.readOriginalSkillZeroCosts(relation)).toThrow();expect(()=>read([executed(),{state:'not_started',relation}])).toThrow();
 }finally{other.close();}
});
