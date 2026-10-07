// Actual owned startup/controller crash, before any SDK model/provider call.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runOpenCodeWorkspaceToolRehearsal} from '../dist/opencode-workspace-rehearsal.js';
import {isolatedEnvironment} from '../dist/native.js';
const [optionsJson,phase,pointer]=process.argv.slice(2),options=JSON.parse(optionsJson);let injecting=false;
const pending=runOpenCodeWorkspaceToolRehearsal({...options,connect:async()=>{throw Error('Fixture must never resume Runtime');},prepare:async original=>{
 if(original.phase!==phase)return;
 injecting=true;
 writeFileSync(pointer,JSON.stringify({operation:original.operation,phase,supervisor:original.supervisor}),{flag:'wx'});
 const script="$ErrorActionPreference='Stop'; $owned=[Diagnostics.Process]::GetProcessById([int]$env:CIMILOOP_FIXTURE_PID); try { $held=$owned.Handle; if($owned.HasExited){throw 'Original native already ended'}; if($owned.StartTime.ToUniversalTime().ToFileTimeUtc().ToString() -ne $env:CIMILOOP_FIXTURE_CREATED -or $owned.MainModule.FileName -ne $env:CIMILOOP_FIXTURE_IMAGE){throw 'Original native identity changed'}; $owned.Kill(); if(-not $owned.WaitForExit(5000)){throw 'Original native did not end'} } finally { $owned.Dispose() }";
 try { await promisify(execFile)(join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),
  ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000,
   env:{...isolatedEnvironment(),CIMILOOP_FIXTURE_PID:String(original.supervisor.pid),CIMILOOP_FIXTURE_CREATED:original.supervisor.creation_ticks,CIMILOOP_FIXTURE_IMAGE:original.supervisor.image}}); } catch { process.exit(74); }
 process.exit(73);
}});void pending.catch(()=>{});
try { await pending; } catch(error) { if(injecting)await new Promise(()=>{});throw error; }
throw Error('Original startup phase not reached');
