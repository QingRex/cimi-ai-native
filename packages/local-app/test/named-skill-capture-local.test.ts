import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import * as app from '../src/index.js';
import {AgentStartLedger} from '@cimiloop/runtime-adapter';
import {contentDigest} from '../../kernel/src/intent.js';
import {createSkillInvocationProject} from '../../../tests/fixtures/skill-invocation-project.js';
import {flowTime} from '../../../tests/fixtures/flow-project.js';
const source=vi.hoisted(()=>({installed:undefined as any}));
vi.mock('../src/agent-codex-installation-local.js',async load=>({...await load<typeof import('../src/agent-codex-installation-local.js')>(),openInstalledCodexAgentRuntime:async()=>source.installed}));

// Real Kernel/SQLite/Host admission and dispatch. Native capture is a PUBLIC
// projection here; the original reader is tested separately, never S1 evidence.
let root:string,f:ReturnType<typeof createSkillInvocationProject>,local:any,invocation:any,custody:app.LocalSkillInvocationStartCustody,ledger:AgentStartLedger;
const release=vi.fn(),factory=vi.fn();
beforeAll(()=>{
 root=mkdtempSync(join(tmpdir(),'cimiloop-method-capture-'));f=createSkillInvocationProject(root);
 ledger=AgentStartLedger.initialize(join(dirname(f.path),'method-host'),{machine_digest:contentDigest('PUBLIC machine').value,principal_digest:contentDigest('PUBLIC principal').value});
 custody=new app.LocalSkillInvocationStartCustody(root,dirname(f.path),ledger);
 const prepare=f.runPort.agent.skills!.prepare.bind(f.runPort.agent.skills);
 f.runPort.agent.skills!.prepare=(p,r,c,b,i)=>custody.bindPreparation(p,r,c,b,i,prepare(p,r,c,b,i));invocation=f.reserveSkill().invocation;
 const record=f.store.getRuntimeRecord('run_record',f.currentRun().record_ref.id)!;if(record.run_kind!=='agent')throw Error('Agent required');
 const parent={project_id:f.project.id,run_id:record.run_id,operation_key:record.operation_key,executor_actor_id:f.agent.id,context_digest:record.input_digest,runtime_binding:record.runtime_binding,skill_bindings:record.skill_bindings,host_admission_ref:record.host_admission_ref};
 custody.claim(f.project,invocation,parent,record.id,contentDigest('PUBLIC staged plan').value,()=>{});
 local={store:f.store,kernel:f.humanKernel,instance:{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:flowTime},location:{repositoryKind:'git',repositoryPath:root,dataDirectory:dirname(f.path),databasePath:f.path,instancePath:join(dirname(f.path),'instance.json'),suggestedName:'PUBLIC original'}};
 factory.mockImplementation(async()=>({custody,release}));
},120000);
afterAll(()=>{ledger?.close();f?.store.close();if(root){if(dirname(root)!==resolve(tmpdir())||!basename(root).startsWith('cimiloop-method-capture-'))throw Error('Unsafe cleanup');rmSync(root,{recursive:true,force:true});}});
function service(source=factory,context=local){const Type=Reflect.get(app,'LocalHumanNamedSkillCapture');expect(Type).toBeTypeOf('function');return new Type(context,source);}
it('captures an existing child by original identity, repeats the same evidence and creates no domain event',async()=>{
 const reader=Reflect.get(app.LocalNativeNamedMethodSamples.prototype,'captureChild');expect(reader).toBeTypeOf('function');
 const content=new app.LocalEvidenceVerifier(root,dirname(f.path)),artifact=(text:string)=>({...content.storeContent(Buffer.from(text),'provider_probe_artifact'),version:'PUBLIC'});
 const sample={invocation_key:invocation.invocation_key,input_ref:invocation.input_ref,transcript_ref:artifact('PUBLIC transcript'),stdout_ref:artifact('PUBLIC stdout'),native_proof_ref:artifact('PUBLIC proof')};
 const captured=vi.spyOn(app.LocalNativeNamedMethodSamples.prototype,'captureChild').mockImplementation((project,descriptor,input,scope)=>{
  expect(project.id).toBe(f.project.id);expect(descriptor.id).toBe(f.store.getProviderBinding(invocation.skill_binding.binding_ref.id)!.descriptor_ref.id);expect(input).toEqual({invocation_key:invocation.invocation_key,input_ref:invocation.input_ref,method_name:invocation.request.method_name});
  expect(scope).toMatchObject({run_id:invocation.run_ref.id,operation_key:invocation.invocation_key,context_digest:invocation.input_digest});return sample;
 });
 try{const before=f.store.asOfEventSequence(),first=await service().capture([invocation.id]);expect(first).toMatchObject({starts_run:false,provider_qualification_proven:false,evidence:{observed_at:invocation.created_at,samples:[sample]}});expect(await service().capture([invocation.id])).toEqual(first);expect(f.store.asOfEventSequence()).toBe(before);expect(release).toHaveBeenCalledTimes(2);}finally{captured.mockRestore();}
});
it('rejects repeated IDs and Agent identities before opening any source',async()=>{
 const before=factory.mock.calls.length;await expect(service().capture([invocation.id,invocation.id])).rejects.toMatchObject({code:'INVALID_COMMAND'});
 await expect(service(factory,{...local,instance:{...local.instance,actor_id:f.agent.id}}).capture([invocation.id])).rejects.toMatchObject({code:'CALLER_IDENTITY_MISMATCH'});expect(factory).toHaveBeenCalledTimes(before);
});
it('checks the current Human session after source-open await and releases the borrowed source',async()=>{
 let expired=false;const freed=vi.fn(),guard=()=>{if(expired)throw new app.LocalProjectError('expired','CAPABILITY_UNAVAILABLE','forbidden');};
 await expect(service(vi.fn(async()=>{expired=true;return{custody,release:freed};})).capture([invocation.id],guard)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(freed).toHaveBeenCalledTimes(1);
});
it('opens the original installed Host for default child control without model or qualification factories',async()=>{
 const released=vi.fn(),checked=vi.fn(),query=vi.fn(async(_root:string,_scope:unknown)=>({status:'PUBLIC observed'}));source.installed={origin:ledger,guard:checked,release:released};
 try{const before=f.store.asOfEventSequence(),control=new app.LocalHumanSkillInvocationControl(local,undefined,{query,collect:vi.fn(),requestCancellation:vi.fn(),recover:vi.fn()});
  expect(await control.query(invocation.id)).toMatchObject({operation:{outcome:'observed',result:{status:'PUBLIC observed'}},starts_run:false});
  expect(query.mock.calls[0]?.[0]).toBe(join(dirname(f.path),'skill-runtime-originals',f.project.id,invocation.invocation_key));expect(released).toHaveBeenCalledTimes(1);expect(checked.mock.calls.length).toBeGreaterThan(1);expect(f.store.asOfEventSequence()).toBe(before);
 }finally{source.installed=undefined;}
});
it('does not use a missing or foreign installed Host to repair original child custody',async()=>{
 const before=f.store.asOfEventSequence();source.installed=undefined;await expect(app.productionSkillRuntimeOriginals(invocation.id,local)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});
 const other=AgentStartLedger.initialize(join(dirname(f.path),'foreign-host'),{machine_digest:contentDigest('PUBLIC other machine').value,principal_digest:contentDigest('PUBLIC other principal').value}),released=vi.fn();source.installed={origin:other,guard(){},release:released};
 try{await expect(app.productionSkillRuntimeOriginals(invocation.id,local)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(released).toHaveBeenCalledTimes(1);expect(other.listExclusive('skill_invocation_admission')).toHaveLength(0);expect(other.listExclusive('skill_invocation_dispatch')).toHaveLength(0);expect(f.store.asOfEventSequence()).toBe(before);}finally{source.installed=undefined;other.close();}
});
