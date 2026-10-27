import {isDeepStrictEqual as same} from 'node:util';
import {requestDigest,type RuntimeControlEvidence} from '@cimiloop/kernel';
import {assertFixedVolumeRuntimePaths,readAgentRuntimeOriginalIdentity,readOriginalAgentWorkspaceOperation,type readCodexAgentModelControlOriginals,type FixedVolumeRuntimeStorage} from '@cimiloop/runtime-adapter';
import type {LocalProject} from './project.js';
import type {InstalledCodexUsageBudget} from './agent-codex-usage-budget-local.js';
import type {CodexRuntimeLoginHome} from './agent-codex-login-home-local.js';
import type {LocalCodexRuntimeSdkOriginals} from './codex-runtime-sdk-originals-local.js';
import {assertCodexRuntimeWritableStorage} from './agent-codex-writable-storage-local.js';
import {runtimeContractPhaseRoot} from './runtime-contract-local.js';

export interface CodexRuntimeDiskSources {account:InstalledCodexUsageBudget;storage:FixedVolumeRuntimeStorage;home:CodexRuntimeLoginHome}
type Context=ReturnType<LocalCodexRuntimeSdkOriginals['readRuntimeControlContext']>;
type Cut=ReturnType<typeof readCodexAgentModelControlOriginals>;
const hash=(value:unknown)=>({algorithm:'sha256' as const,value:requestDigest(value)});
function fail():never{throw Error('Original installed Runtime disk sources unavailable or changed');}

// The source is built from the live code-owned account, volume and login
// capabilities. A serialized path list, retained model claim, or reader method
// on its own cannot install it. It never attaches/formats a disk or prunes history.
export class LocalCodexRuntimeDiskOriginals {
 private readonly identity;private readonly initial;
 constructor(private readonly local:LocalProject,private readonly sources:CodexRuntimeDiskSources){
  this.identity={store:local.store,kernel:local.kernel,location:structuredClone(local.location),instance:structuredClone(local.instance),account:sources.account,guard:sources.account.guard,installation:sources.account.installation,storage:sources.storage,home:sources.home};
  this.initial=this.capture();
 }
 private guard(){const i=this.identity;if(this.local.store!==i.store||this.local.kernel!==i.kernel||!same(this.local.location,i.location)||!same(this.local.instance,i.instance)||this.sources.account!==i.account||this.sources.account.guard!==i.guard||this.sources.account.installation!==i.installation||this.sources.storage!==i.storage||this.sources.home!==i.home)fail();}
 private capture(){this.guard();const value=assertCodexRuntimeWritableStorage(this.local,this.sources.account,this.sources.storage,this.sources.home);if(!value)fail();this.guard();return structuredClone(value);}
 read(eligible:boolean,contexts:Context[],originals:Cut[][]):RuntimeControlEvidence['checks']['disk_limit']{
  const before=this.capture();if(!same(before,this.initial))fail();const proof=before.proof;
  const expected={format:'cimiloop/codex-fixed-volume-confinement/1.0.0',scope:proof.scope,quota_ticket:proof.policy_ticket,runtime_ticket:proof.runtime_ticket,network_mode:'deny_all'};
  const paths:string[]=[];
  const phases=contexts.flatMap(context=>context.phases.map(({phase})=>{
   const root=runtimeContractPhaseRoot(this.local,phase),identity=readAgentRuntimeOriginalIdentity(root,phase.scope),original=readOriginalAgentWorkspaceOperation({root,scope:phase.scope,operation:identity.operation});
   const input=identity.input as Record<string,unknown>,profile=original.config.writable_storage_profile;
   paths.push(root,identity.operation);
   return{scope:phase.scope,private_writes:profile==='private_state_only/2.0.0'&&input.writable_storage_profile===profile};
  }));
  const calls=originals.flat().flatMap(cut=>cut.calls),covered=contexts.every(context=>context.boundary_private_storage)&&calls.length>0&&phases.length>0&&phases.every(phase=>phase.private_writes)&&calls.every(({control})=>{
   if(!same(control.write_confinement,expected))return false;
   const scope=control.write_scope as {profile_storage?:unknown;all_application_packages_opt_out?:unknown;roots?:unknown}|null;
   if(scope?.profile_storage!=='read_only_package_storage/1.0.0'||scope.all_application_packages_opt_out!==true||!Array.isArray(scope.roots)||!scope.roots.length||scope.roots.some(path=>typeof path!=='string'))return false;
   paths.push(...scope.roots as string[]);return true;
  });
  const selected=[...new Set(paths)];for(let offset=0;offset<selected.length;offset+=32){const current=assertFixedVolumeRuntimePaths(this.sources.storage,proof.scope,selected.slice(offset,offset+32));if(!same(current,proof))fail();}
  const after=this.capture();if(!same(before,after))fail();this.guard();
  return{result:eligible&&covered?'supports':'inconclusive',basis_digest:hash({installation_digest:this.identity.installation.installation_digest,current_storage:before,phases,boundaries:contexts.map(context=>({digest:context.boundary_digest,private_storage:context.boundary_private_storage})),model_originals:originals,retained_history_capacity_bytes:proof.maximum_bytes})};
 }
}
