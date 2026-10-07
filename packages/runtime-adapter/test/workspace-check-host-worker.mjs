// Owned fault fixture only. No production qualification or model credential.
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {AgentWorkspaceCheckHost} from '../dist/workspace-checks.js';
import {isolatedEnvironment} from '../dist/native.js';
const [optionsJson,callJson,assessmentsJson]=process.argv.slice(2);
const options=JSON.parse(optionsJson),call=JSON.parse(callJson),assessments=JSON.parse(assessmentsJson);
const host=await AgentWorkspaceCheckHost.open({...options,nodeBinary:process.execPath,assess:request=>{
 const original=assessments.find(value=>value.request.action===request.action&&value.request.resource===request.resource);
 if(!original||JSON.stringify(original.request)!==JSON.stringify(request))throw Error('Fixture original request mismatch');
 return original;
}});
const pending=host.execute(call);void pending.catch(()=>{});
const root=join(options.dataDirectory,'workspace-checks',options.scope.project_id),deadline=Date.now()+15000;
while(Date.now()<deadline){
 const name=readdirSync(root).find(value=>/^[a-f0-9]{64}$/.test(value));
 if(name){
  const operation=join(root,name),proof=join(operation,'native-proof.json'),owner=join(operation,'native-ownership.json');
  if(existsSync(proof)&&existsSync(owner)){
   const running=JSON.parse(readFileSync(proof,'utf8')),identity=JSON.parse(readFileSync(owner,'utf8')).native_identity;
   if(running.phase==='running'&&identity){
    // Retain and verify the same OS handle before killing our own controller.
    // A reused PID cannot redirect fault injection to an unrelated process.
    const script="$ErrorActionPreference='Stop'; try { $fixture=[Diagnostics.Process]::GetProcessById([int]$env:CIMILOOP_FIXTURE_PID) } catch [ArgumentException] { exit 0 }; try { $held=$fixture.Handle; if($fixture.HasExited){exit 0}; if($fixture.StartTime.ToUniversalTime().ToFileTimeUtc().ToString() -ne $env:CIMILOOP_FIXTURE_CREATED -or $fixture.MainModule.FileName -ne $env:CIMILOOP_FIXTURE_IMAGE){throw 'Fixture identity changed'}; $fixture.Kill(); $fixture.WaitForExit(5000) | Out-Null } finally { $fixture.Dispose() }";
    await promisify(execFile)(join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),
     ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000,
      env:{...isolatedEnvironment(),CIMILOOP_FIXTURE_PID:String(identity.pid),CIMILOOP_FIXTURE_CREATED:identity.creation_ticks,CIMILOOP_FIXTURE_IMAGE:identity.image}});
    process.exit(73);
   }
  }
 }
 await new Promise(resolve=>setTimeout(resolve,25));
}
await host.close();throw Error('Actual owned native startup not observed');
