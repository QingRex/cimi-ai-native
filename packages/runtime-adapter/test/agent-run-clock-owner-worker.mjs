import {openWindowsAgentRunClock} from '../dist/agent-run-clock.js';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {digest} from '../dist/files.js';
import {isolatedEnvironment} from '../dist/native.js';
const root=process.argv[2],compiled=await openWindowsAgentRunClock(root);await compiled.close();
const binary=join(root,'tools','agent-run-clock-'+digest(readFileSync(fileURLToPath(new URL('../native/AgentRunClock.cs',import.meta.url)))).value,'AgentRunClock.exe');
// The separate fixture holder keeps .NET's redirected stdin writer open when
// the separate original owner exits. This proves owner monitoring without EOF.
const script="$ErrorActionPreference='Stop'; $info=New-Object Diagnostics.ProcessStartInfo; $info.FileName=$env:CIMILOOP_CLOCK_TEST_BINARY; $info.Arguments='--stream'; $info.UseShellExecute=$false; $info.CreateNoWindow=$true; $info.RedirectStandardInput=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true; $clock=[Diagnostics.Process]::Start($info); try { $writer=$clock.StandardInput; $writer.WriteLine($env:CIMILOOP_CLOCK_TEST_CONFIG); $writer.Flush(); $header=$clock.StandardOutput.ReadLine(); if(-not $header){throw 'Clock header missing'}; [IO.File]::WriteAllText($env:CIMILOOP_CLOCK_TEST_HEADER,$header); [Console]::Out.WriteLine('{'+[char]34+'pid'+[char]34+':'+$clock.Id+'}'); [Console]::Out.Flush(); if(-not $clock.WaitForExit(12000)){ $clock.Kill(); $clock.WaitForExit(); throw 'Clock owner was not observed' } } finally { $writer.Close(); $clock.Dispose() }";
const holder=spawn(join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),
 ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
 {windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...isolatedEnvironment(),CIMILOOP_CLOCK_TEST_BINARY:binary,CIMILOOP_CLOCK_TEST_HEADER:join(root,'native-header.json'),CIMILOOP_CLOCK_TEST_CONFIG:JSON.stringify({format:'cimiloop/agent-run-clock-channel-open/1.0.0',nonce:randomUUID(),owner_pid:Number(process.argv[3])})}});
holder.stdout.on('data',chunk=>process.stdout.write(chunk));
holder.once('error',()=>process.exit(75));
holder.once('close',code=>process.exit(code??76));
