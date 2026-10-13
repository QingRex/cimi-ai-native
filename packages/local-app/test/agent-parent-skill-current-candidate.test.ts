import {describe,it,expect,vi} from 'vitest';
import {mkdtempSync,readFileSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import * as app from '../src/index.js';
import {originalAgentWorkspaceScope} from '../src/agent-workspace-tools-local.js';
import {digest} from '../../runtime-adapter/src/files.js';
import {createSkillInvocationProject} from '../../../tests/fixtures/skill-invocation-project.js';
import {flowTime} from '../../../tests/fixtures/flow-project.js';
import type {SkillInvocation} from '../../protocol/src/v2/index.js';
vi.setConfig({testTimeout:120000});
type Service={reserve(raw:unknown):{invocation:SkillInvocation;replay:boolean}};
const factory=()=>Reflect.get(app,'LocalAgentParentSkillCalls') as {open(options:unknown):Service};
function setup(){
 const directory=mkdtempSync(join(tmpdir(),'cimiloop-parent-candidate-')),f=createSkillInvocationProject(directory),dataDirectory=dirname(f.path);
 const local={caller:f.caller,store:f.store,kernel:f.kernel,location:{repositoryKind:'git' as const,repositoryPath:directory,dataDirectory,databasePath:f.path,instancePath:join(dataDirectory,'instance.json'),suggestedName:'PUBLIC candidate reservation contract'}};
 const scope=originalAgentWorkspaceScope(local,f.reserved.run.id),recipe={format:'cimiloop/original-run-candidate/1.0.0',goal:'Review the exact current proposed change',spec:'Fixed original Task specification',standards:'Fixed original repository standards',required_check_ids:['query_test']};
 const body={format:'cimiloop/agent-parent-skill-catalog/2.0.0',scope_digest:digest(JSON.stringify(scope)).value,entries:[{skill_alias:'review',method_name:'review',input_alias:'current',skill_binding:scope.skill_bindings[0],input_recipe:recipe}]},catalog={...body,catalog_digest:digest(JSON.stringify(body)).value};
 const frame={format:'cimiloop/agent-parent-skill-request/1.0.0',scope_digest:body.scope_digest,catalog_digest:catalog.catalog_digest,call_id:'sdk_current_candidate',tool:'run_skill',skill_alias:'review',method_name:'review',input_alias:'current'};
 const methodInput={...f.methodInput,goal:recipe.goal,spec:recipe.spec,standards:recipe.standards},input_ref=f.runPort.content.storeContent(Buffer.from(JSON.stringify(methodInput)),'skill_method_input');
 const count={resolve:0,read:0};
 const candidates={resolveOriginal(input:{scope:unknown;command_id:string;recipe:unknown}){
   count.resolve++;expect(input.scope).toEqual(scope);expect(input.recipe).toEqual(recipe);
   const proof_ref=f.runPort.content.storeContent(Buffer.from(JSON.stringify({format:'PUBLIC constructed candidate originals',scope,command_id:input.command_id,recipe})),'skill_invocation_proof');
   const candidate={format:'cimiloop/agent-parent-skill-candidate/1.0.0',scope_digest:body.scope_digest,command_id:input.command_id,recipe_digest:digest(JSON.stringify(recipe)).value,input_ref,proof_ref};
   return {...candidate,candidate_digest:digest(JSON.stringify(candidate)).value};
 },readOriginal(input:{scope:unknown;command_id:string;recipe:unknown;candidate:unknown}){count.read++;expect(input.scope).toEqual(scope);expect(input.recipe).toEqual(recipe);return structuredClone(input.candidate);}};
 Reflect.set(f.runPort.agent.skills!,'verifyParentCandidate',(project:unknown,input:unknown)=>digest(JSON.stringify({format:'PUBLIC CONSTRUCTED candidate applicability only',project,input})));
 const options={local,runId:f.reserved.run.id,catalog,candidates,now:()=>flowTime,beforeReservation:()=>{}};
 const requestPath=()=>join(dataDirectory,'agent-parent-skill-call-originals',f.project.id,f.reserved.run.id,frame.call_id,'request.json');
 return {f,local,scope,recipe,catalog,frame,input_ref,count,candidates,options,requestPath,calls:()=>f.store.listRuntimeRecords('skill_invocation',f.change.id),close:()=>f.store.close()};
}
// PUBLIC controlled candidate readers below exercise actual Kernel reservations.
// They do not prove Native applicability, real qualification/model/Skill or S1.
describe('explicit current-candidate input survives original SDK reservation recovery',()=>{
 it('resolves once before one Kernel reservation and saves explicit intent2 with the exact resolved input',()=>{
  const s=setup();try{const first=factory().open(s.options).reserve(s.frame),intent=JSON.parse(readFileSync(s.requestPath(),'utf8'));
   expect(first.invocation.input_ref).toEqual(s.input_ref);if(first.invocation.request.input.purpose!=='review')throw Error('Original candidate review expected');expect(first.invocation.request.input.goal).toBe(s.recipe.goal);expect(s.calls()).toHaveLength(1);expect(s.count.resolve).toBe(1);
   expect(intent).toMatchObject({format:'cimiloop/agent-parent-skill-reservation-intent/2.0.0',frame:s.frame,input_candidate:{format:'cimiloop/agent-parent-skill-candidate/1.0.0',command_id:intent.command.command_id,input_ref:s.input_ref}});
  }finally{s.close();}
 });
 it('replays the identical saved candidate after a lost reply and restart without resolving newer input',()=>{
  const s=setup();try{expect(()=>factory().open({...s.options,beforeReply:()=>{throw Error('PUBLIC response lost');}}).reserve(s.frame)).toThrow('PUBLIC response lost');
   s.candidates.resolveOriginal=()=>{throw Error('Original retry cannot refresh candidate');};const before=s.f.store.asOfEventSequence(),replay=factory().open(s.options).reserve(s.frame);
   expect(replay.replay).toBe(true);expect(replay.invocation.input_ref).toEqual(s.input_ref);expect(s.f.store.asOfEventSequence()).toBe(before);expect(s.calls()).toHaveLength(1);expect(s.count.resolve).toBe(1);
  }finally{s.close();}
 });
 it('refuses a missing saved intent without resolving or reserving a replacement candidate',()=>{
  const s=setup();try{factory().open(s.options).reserve(s.frame);renameSync(s.requestPath(),s.requestPath()+'.PUBLIC-retained-original');
   expect(()=>factory().open(s.options).reserve(s.frame)).toThrow();expect(s.count.resolve).toBe(1);expect(s.calls()).toHaveLength(1);
  }finally{s.close();}
 });
 it('refuses all lost call records before another resolution when the original Kernel receipt already exists',()=>{
  const s=setup();try{const first=factory().open(s.options).reserve(s.frame);expect(s.f.observeSkill(first.invocation,'succeeded')).toMatchObject({ok:true});
   const root=dirname(dirname(s.requestPath()));renameSync(root,root+'.PUBLIC-retained-original');expect(()=>factory().open(s.options).reserve(s.frame)).toThrow();
   expect(s.count.resolve).toBe(1);expect(s.calls()).toHaveLength(1);expect(s.f.skillState.prepare_calls).toBe(1);
  }finally{s.close();}
 });
 it('refuses a trusted resolver that changes the original data root before a Kernel effect',()=>{
  const s=setup(),root=s.local.location.dataDirectory;try{const resolve=s.candidates.resolveOriginal;s.candidates.resolveOriginal=input=>{const result=resolve(input);s.local.location.dataDirectory=join(root,'PUBLIC-drift');return result;};
   expect(()=>factory().open(s.options).reserve(s.frame)).toThrow();expect(s.calls()).toHaveLength(0);expect(s.f.skillState.prepare_calls).toBe(0);
  }finally{s.local.location.dataDirectory=root;s.close();}
 });
 it('never resolves the same SDK call again after a post-resolution guard refusal and loss of the whole call root',()=>{
  const s=setup();try{
   const before=s.f.store.asOfEventSequence(),run=s.f.currentRun();
   expect(()=>factory().open({...s.options,beforeReservation:()=>{if(s.count.resolve)throw Error('PUBLIC original guard refused');}}).reserve(s.frame)).toThrow('PUBLIC original guard refused');
   expect(s.count.resolve).toBe(1);expect(s.calls()).toHaveLength(0);expect(s.f.skillState.prepare_calls).toBe(0);
   const root=dirname(dirname(s.requestPath()));renameSync(root,root+'.PUBLIC-retained-original');
   expect(()=>factory().open(s.options).reserve(s.frame)).toThrow();
   expect(s.count.resolve).toBe(1);expect(s.calls()).toHaveLength(0);expect(s.f.skillState.prepare_calls).toBe(0);
   expect(s.f.store.asOfEventSequence()).toBe(before);expect(s.f.currentRun()).toEqual(run);
  }finally{s.close();}
 });
 it('never refreshes a rejected Kernel candidate after the original qualification recovers and the whole call root is lost',()=>{
  const s=setup();try{
   const before=s.f.store.asOfEventSequence(),run=s.f.currentRun(),verify=s.f.runPort.agent.skills!.verifyParentCandidate;
   Reflect.set(s.f.runPort.agent.skills!,'verifyParentCandidate',()=>{throw Error('PUBLIC candidate qualification refused');});
   expect(()=>factory().open(s.options).reserve(s.frame)).toThrow();
   expect(s.count.resolve).toBe(1);expect(s.calls()).toHaveLength(0);expect(s.f.skillState.prepare_calls).toBe(0);
   const intent=JSON.parse(readFileSync(s.requestPath(),'utf8'));expect(s.f.store.transaction(reader=>reader.getCommandReceipt(intent.command.command_id))).toBeUndefined();
   const root=dirname(dirname(s.requestPath()));renameSync(root,root+'.PUBLIC-retained-original');
   Reflect.set(s.f.runPort.agent.skills!,'verifyParentCandidate',verify);
   expect(()=>factory().open(s.options).reserve(s.frame)).toThrow();
   expect(s.count.resolve).toBe(1);expect(s.calls()).toHaveLength(0);expect(s.f.skillState.prepare_calls).toBe(0);
   expect(s.f.store.asOfEventSequence()).toBe(before);expect(s.f.currentRun()).toEqual(run);
  }finally{s.close();}
 });
 it('rechecks the complete original intent after candidate readback before any Kernel reservation',()=>{
  const s=setup();try{
   const before=s.f.store.asOfEventSequence(),run=s.f.currentRun(),read=s.candidates.readOriginal;
   s.candidates.readOriginal=input=>{const result=read(input);if(s.count.read===2)renameSync(s.requestPath(),s.requestPath()+'.PUBLIC-retained-original');return result;};
   expect(()=>factory().open(s.options).reserve(s.frame)).toThrow();
   expect(s.calls()).toHaveLength(0);expect(s.f.skillState.prepare_calls).toBe(0);expect(s.f.store.asOfEventSequence()).toBe(before);expect(s.f.currentRun()).toEqual(run);
  }finally{s.close();}
 });
 it('rechecks the original call anchor after the final live guard before any Kernel reservation',()=>{
  const s=setup();try{
   const before=s.f.store.asOfEventSequence(),run=s.f.currentRun();let guards=0;
   expect(()=>factory().open({...s.options,beforeReservation:()=>{if(++guards===3){const path=join(dirname(dirname(s.requestPath())),s.frame.call_id+'.anchor.json');renameSync(path,path+'.PUBLIC-retained-original');}}}).reserve(s.frame)).toThrow();
   expect(guards).toBe(3);expect(s.calls()).toHaveLength(0);expect(s.f.skillState.prepare_calls).toBe(0);expect(s.f.store.asOfEventSequence()).toBe(before);expect(s.f.currentRun()).toEqual(run);
  }finally{s.close();}
 });
 it('rejects a fixed input_ref mixed into a directory2 recipe instead of choosing either interpretation',()=>{
  const s=setup();try{const body={format:s.catalog.format,scope_digest:s.catalog.scope_digest,entries:[{...s.catalog.entries[0],input_ref:s.f.inputRef}]};
   expect(()=>factory().open({...s.options,catalog:{...body,catalog_digest:digest(JSON.stringify(body)).value}})).toThrow();expect(s.count.resolve).toBe(0);expect(s.calls()).toHaveLength(0);
  }finally{s.close();}
 });
});
