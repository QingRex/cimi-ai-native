import {isDeepStrictEqual as same} from 'node:util';
import {assertFixedVolumeRuntimePaths,readWindowsDedicatedAgentAccountWritablePaths,withStartCustodyVerifyTurn,type DedicatedAgentAccountLedger,type FixedVolumeRuntimeStorage} from '@cimiloop/runtime-adapter';
import {dedicatedRuntimeInstallationWritablePaths,type InstalledDedicatedAgentRuntime} from './agent-dedicated-installation-local.js';
import type {LocalProject} from './project.js';
import {LocalProjectError} from './errors.js';
type Context=Pick<LocalProject,'location'|'store'>;
const fail=():never=>{throw new LocalProjectError('本地兼容 Runtime全部可写范围尚未绑定同一原物理配额；安装、账户及实际辅助器目录均须核对','CAPABILITY_UNAVAILABLE','conflict');};
// Sources choose actual roots. This does not create a disk, grant execution,
// approve a bill, or accept caller-supplied writable path projections.
export function assertDedicatedRuntimeWritableStorage(local:Context,installed:InstalledDedicatedAgentRuntime,account:DedicatedAgentAccountLedger,storage:FixedVolumeRuntimeStorage){
 return withStartCustodyVerifyTurn(()=>{try{
  const scope=()=>{const project=local.store.getProject();if(!project)return fail();return{project_id:project.id,repository_path:local.location.repositoryPath,data_directory:local.location.dataDirectory};};
  installed.guard();const binding=scope();
  const paths=()=>{const roots=readWindowsDedicatedAgentAccountWritablePaths(account,installed.origin);if(roots[0]!==installed.account_root)fail();return[...new Set([...dedicatedRuntimeInstallationWritablePaths(installed),...roots])];};
  const selected=paths(),proof=assertFixedVolumeRuntimePaths(storage,binding,selected);
  if(proof.runtime_ticket.identity_digest!==installed.origin.identityDigest)fail();installed.guard();if(!same(binding,scope())||!same(selected,paths()))fail();
  return{proof,paths:selected};
 }catch{fail();}});
}
