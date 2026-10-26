import {isDeepStrictEqual as same} from 'node:util';
import {assertFixedVolumeRuntimePaths,type FixedVolumeRuntimeStorage} from '@cimiloop/runtime-adapter';
import {codexRuntimeInstallationWritablePaths} from './agent-codex-installation-local.js';
import {codexUsageBudgetWritablePaths,type InstalledCodexUsageBudget} from './agent-codex-usage-budget-local.js';
import {assertCodexRuntimeLoginHome,type CodexRuntimeLoginHome} from './agent-codex-login-home-local.js';
import type {LocalProject} from './project.js';
import {LocalProjectError} from './errors.js';
type Context={location:Pick<LocalProject['location'],'repositoryPath'|'dataDirectory'>;store:Pick<LocalProject['store'],'getProject'>};
const fail=():never=>{throw new LocalProjectError('Codex Runtime全部可写范围尚未绑定同一物理配额；安装、账户、注册账本、工具与登录目录均须在原配额卷内','CAPABILITY_UNAVAILABLE','conflict');};
// Real source leases choose these roots, never command JSON. Project/data cover
// Native, checks, model originals, process supervision and private operation
// state. Installation/account helpers and shared registry are additional roots.
export function assertCodexRuntimeWritableStorage(local:Context,account:InstalledCodexUsageBudget,storage:FixedVolumeRuntimeStorage,loginHome:CodexRuntimeLoginHome){
 try{
  account.guard();const project=local.store.getProject();if(!project)fail();const scope={project_id:project!.id,repository_path:local.location.repositoryPath,data_directory:local.location.dataDirectory};
  const paths=()=>[...codexRuntimeInstallationWritablePaths(account.installation),...codexUsageBudgetWritablePaths(account),assertCodexRuntimeLoginHome(loginHome,local,account.installation,storage).path];
  const selected=paths(),proof=assertFixedVolumeRuntimePaths(storage,scope,selected);
  if(proof.runtime_ticket.identity_digest!==account.installation.origin.identityDigest)fail();account.guard();if(!same(selected,paths()))fail();
  return {proof,paths:selected};
 }catch{fail();}
}
