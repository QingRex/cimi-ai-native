import {isDeepStrictEqual} from 'node:util';
import {join} from 'node:path';
import type {Digest,NamedSkillMethodEvidence,NamedSkillMethodSample,Project,ProviderDescriptor} from '@cimiloop/protocol/v2';
import {bytesAt,digest,parseGatewayJson,parseAgentWorkspaceToolScope,readAgentRuntimeNamedMethodResult,readAgentRuntimeOriginalIdentity,readCodexAgentModelOriginals,withRuntimeBinaryProofTurn,type AgentWorkspaceToolScope} from '@cimiloop/runtime-adapter';
import {LocalSkillMethodInputs,type LocalSkillMethodPlan} from './skill-methods-local.js';

const format='cimiloop/native-named-method-sample/1.0.0';
const childFormat='cimiloop/native-named-method-sample/2.0.0';
const probeFormat='cimiloop/native-named-method-sample/3.0.0';
type Layout='original'|'skill_invocation'|'skill_method_probe';
const same=(a:unknown,b:unknown)=>isDeepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
const fail=():never=>{throw Error('Native named method original sample unavailable or changed');};
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const json=(bytes:Buffer,max=65536)=>structuredClone(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes),max));
interface Marker {format:typeof format|typeof childFormat|typeof probeFormat;layout?:'skill_invocation'|'skill_method_probe';scope:AgentWorkspaceToolScope;profile_digest:Digest;original_identity_digest:Digest;result_digest:Digest;artifacts_digest:Digest}
type Input=Pick<NamedSkillMethodSample,'input_ref'|'invocation_key'>&{method_name:string};

// Concrete same-host Native/SDK evidence reader. Markers select an original
// scope under the trusted installation root; they cannot supply a path or a
// verified result. Capturing content never creates a Run or approves a method.
export class LocalNativeNamedMethodSamples {
 private readonly inputs:LocalSkillMethodInputs;
 constructor(repositoryPath:string,dataDirectory:string,private readonly originalsRoot=dataDirectory){this.inputs=new LocalSkillMethodInputs(repositoryPath,dataDirectory);}
 private observe(project:Project,plan:LocalSkillMethodPlan,rawScope:unknown,layout:Layout='original'){return withRuntimeBinaryProofTurn(()=>{
  const scope=parseAgentWorkspaceToolScope(rawScope);
  if(scope.project_id!==project.id||scope.operation_key!==plan.profile.invocation_key)fail();
  // Each layout selects exactly one canonical child/probe, never a supplied path
  // or a fallback after an unreadable/missing legacy original.
  const root=layout==='original'?this.originalsRoot:join(this.originalsRoot,layout==='skill_invocation'?'skill-runtime-originals':'skill-method-probe-originals',scope.project_id,scope.operation_key);
  const before=readAgentRuntimeOriginalIdentity(root,scope),input=before.input as Record<string,unknown>;
  if(typeof input.prompt!=='string')fail();
  const packet=json(Buffer.from(input.prompt as string));
  if(!exact(packet,['format','method_profile','instructions',...(Object.hasOwn(packet as object,'invocation')?['invocation']:[])])||packet.format!=='cimiloop/agent-runtime-named-method-packet/1.0.0'||!same(packet.method_profile,plan.profile)||packet.instructions!==plan.prompt)fail();
  const result=readAgentRuntimeNamedMethodResult(root,scope,{profile:plan.profile,files:plan.files}),codex=readCodexAgentModelOriginals(root,scope);
  if(result.status!=='Observed'||result.method_result_reverified!==true||!result.output||!result.output_digest||result.method_failure_reverified||result.failure)fail();
  const artifact=(name:string,maximum:number)=>{const matches=result.artifacts.filter(a=>a.name===name);if(matches.length!==1)fail();const bytes=bytesAt(matches[0]!.path,maximum);if(digest(bytes).value!==matches[0]!.digest)fail();return bytes;};
  const stdout=artifact('stdout.raw',4*1024*1024),cleanup=artifact('agent-sandbox-cleanup.json',65536),resources=json(artifact('agent-sandbox-resources.json',65536)) as Record<string,unknown>,native=json(artifact('agent-sandbox-original.json',65536)) as {peer?:{pid?:number}};
  const ended=json(cleanup) as Record<string,unknown>;
  if(ended.phase!=='ended'||ended.reason!=='exited'||ended.exit_code!==0||ended.resources_disposed!==true||!same(ended.cleanup_errors,[])||typeof resources.profile!=='string'||!/^CimiLoop\.AgentWorkspace\.[a-f0-9]{32}$/.test(resources.profile)||!Number.isSafeInteger(native.peer?.pid)||Number(native.peer?.pid)<1)fail();
  const events=new TextDecoder('utf-8',{fatal:true}).decode(stdout).split(/\r?\n/).filter(Boolean).map(line=>json(Buffer.from(line),4*1024*1024)) as {type?:string;sessionID?:string}[];
  const sessions=[...new Set(events.filter(event=>event.type).map(event=>event.sessionID))];
  if(sessions.length!==1||typeof sessions[0]!=='string'||!sessions[0])fail();
  const effects={session_id:sessions[0]!,native_pid:native.peer!.pid!,native_profile:resources.profile as string};
  const marker:Marker={format:layout==='original'?format:layout==='skill_invocation'?childFormat:probeFormat,...(layout==='original'?{}:{layout}),scope,profile_digest:digest(JSON.stringify(plan.profile)),original_identity_digest:before.identity_digest,result_digest:result.output_digest!,artifacts_digest:digest(JSON.stringify({native:result.artifacts,codex:codex.artifacts}))};
  if(!same(readAgentRuntimeOriginalIdentity(root,scope),before)||!same(result,readAgentRuntimeNamedMethodResult(root,scope,{profile:plan.profile,files:plan.files}))||!same(codex,readCodexAgentModelOriginals(root,scope)))fail();
  return{marker,effects,stdout,cleanup,originalsRoot:root,native_job_observed:result.artifacts.some(a=>a.name==='agent-job-observation.json')};
 });}
 capture(project:Project,descriptor:ProviderDescriptor,input:Input,scope:unknown):NamedSkillMethodSample{
  return this.captureAt(project,descriptor,input,scope,'original');
 }
 captureChild(project:Project,descriptor:ProviderDescriptor,input:Input,scope:unknown):NamedSkillMethodSample{
  return this.captureAt(project,descriptor,input,scope,'skill_invocation');
 }
 captureProbe(project:Project,descriptor:ProviderDescriptor,input:Input,scope:unknown):NamedSkillMethodSample{return this.captureAt(project,descriptor,input,scope,'skill_method_probe');}
 private captureAt(project:Project,descriptor:ProviderDescriptor,input:Input,scope:unknown,layout:Layout):NamedSkillMethodSample{
  const plan=this.inputs.read(project,descriptor,input),observed=this.observe(project,plan,scope,layout),content=this.inputs.packages.content;
  const artifact=(bytes:Buffer,version:string)=>({...content.storeContent(bytes,'provider_probe_artifact'),version});
  const sample:NamedSkillMethodSample={invocation_key:input.invocation_key,input_ref:structuredClone(input.input_ref),transcript_ref:artifact(Buffer.from(JSON.stringify(observed.marker)),'native-method-sample.json'),stdout_ref:artifact(observed.stdout,'stdout.raw'),native_proof_ref:artifact(observed.cleanup,'agent-sandbox-cleanup.json')};
  if(!same(plan,this.inputs.read(project,descriptor,input))||!same(observed,this.observe(project,plan,scope,layout)))fail();return sample;
 }
 read(project:Project,descriptor:ProviderDescriptor,evidence:NamedSkillMethodEvidence,sample:NamedSkillMethodSample,plan:LocalSkillMethodPlan){
  const content=this.inputs.packages.content,body=content.readContent(sample.transcript_ref),marker=json(body) as unknown as Marker;
  const layout:Layout=marker?.format===childFormat?'skill_invocation':marker?.format===probeFormat?'skill_method_probe':'original';
  if(!exact(marker,['format',...(layout==='original'?[]:['layout']),'scope','profile_digest','original_identity_digest','result_digest','artifacts_digest']))fail();
  if(layout==='original'?marker.format!==format:marker.layout!==layout)fail();
  if(!same(marker.scope.runtime_binding,evidence.runtime_binding)||!same(plan,this.inputs.read(project,descriptor,{...sample,method_name:evidence.method_name})))fail();
  const observed=this.observe(project,plan,marker.scope,layout);
  if(!same(marker,observed.marker)||!observed.stdout.equals(content.readContent(sample.stdout_ref))||!observed.cleanup.equals(content.readContent(sample.native_proof_ref))||!body.equals(content.readContent(sample.transcript_ref)))fail();
  return{marker:observed.marker,effects:observed.effects,originalsRoot:observed.originalsRoot,native_job_observed:observed.native_job_observed};
 }
}
