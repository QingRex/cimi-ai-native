// Own test process only: actual Native/Git/file/process effects, explicitly
// constructed controlled qualification and host proof, no credentials/network.
import { openAgentWorkspaceToolHost } from '../dist/index.js';
import { CimiLoopKernel, requestDigest } from '../../kernel/dist/index.js';
import { SqliteProjectStore } from '../../store-sqlite/dist/index.js';
import { LocalRunVerifier } from '../../local-app/dist/index.js';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [repositoryPath,dataDirectory,database,callerJson,scopeJson,inputJson,phase]=process.argv.slice(2);
if(!['forced_native_prepared','forced_dispatch'].includes(phase))throw Error('Unknown owned fixture phase');
const store=new SqliteProjectStore(database),caller=JSON.parse(callerJson),scope=JSON.parse(scopeJson);
const verifier=Object.assign(new LocalRunVerifier(repositoryPath,dataDirectory),{agent:{
 admitContext(){throw Error('This owned test process cannot create admission');},readRunResult(){throw Error('This owned test process cannot produce an Agent result');},
 checkToolAuthority(project,input){return {algorithm:'sha256',value:requestDigest({constructed:true,project_id:project.id,request:input.request,epoch:1})};}
}});
const kernel=new CimiLoopKernel({store,caller,now:()=> '2026-10-03T00:00:00.000Z',runVerifier:verifier});
const execution=await openAgentWorkspaceToolHost({repositoryPath,dataDirectory,scope,assess:request=>kernel.assessAgentRunTool(request),phase:current=>{
 if(phase==='forced_native_prepared'&&current==='native_prepared'||phase==='forced_dispatch'&&current==='dispatch_committed'){
  const journal=new DatabaseSync(join(dataDirectory,'workspace-tools',scope.project_id+'.sqlite'),{readOnly:true});let original;
  try{original=journal.prepare('SELECT preparation,owner FROM workspace_tool_calls').get();}finally{journal.close();}
  const preparation=JSON.parse(original.preparation);writeFileSync(join(dataDirectory,'agent-forced-original.json'),JSON.stringify({preparation,owner:JSON.parse(original.owner)}));
  process.kill(preparation.worker.pid,'SIGKILL');process.exit(73);
 }
}});
try{await execution.host.execute(JSON.parse(inputJson));throw Error('Owned fixture phase was not reached');}
finally{await execution.host.close();store.close();}
