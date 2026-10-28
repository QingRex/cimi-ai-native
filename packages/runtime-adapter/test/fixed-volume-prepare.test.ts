import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe.runIf(process.platform==='win32')('fixed-volume administrator preparation guards',()=>{
 const script=resolve('scripts/windows/prepare-fixed-volume-quota.ps1');
 const shell=join(process.env.SystemRoot!,'System32/WindowsPowerShell/v1.0/powershell.exe');
 // Node selects only the first case-insensitive Windows environment key.
 const environment={...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toUpperCase()!=='PSMODULEPATH')),PSModulePath:[join(process.env.SystemRoot!,'System32/WindowsPowerShell/v1.0/Modules'),join(process.env.ProgramFiles!,'WindowsPowerShell/Modules')].join(';')};
 const functions=`
  $ErrorActionPreference='Stop'
  $errors=$null;$tokens=$null
  $ast=[Management.Automation.Language.Parser]::ParseFile($env:CIMILOOP_QUOTA_SCRIPT,[ref]$tokens,[ref]$errors)
  if($errors.Count){throw 'Invalid preparation syntax'}
  foreach($definition in $ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst]},$true)){. ([scriptblock]::Create($definition.Extent.Text))}
 `;
 function invokeFunctions(body:string,extra:Record<string,string>={}){return execFileSync(shell,['-NoProfile','-NonInteractive','-Command',functions+body],{encoding:'utf8',windowsHide:true,timeout:15000,env:{...environment,CIMILOOP_QUOTA_SCRIPT:script,...extra}});}
 it('encodes native command paths without a BOM or silent replacement',()=>{
  const result=invokeFunctions(`
   $commands=@(('select vdisk file="C:\\quota\\'+[char]0x5377+'.vhdx"'),'exit')
   $bytes=ConvertTo-DiskPartScriptBytes $commands 936
   $text=[Text.Encoding]::GetEncoding(936).GetString($bytes)
   if($text -cne (($commands -join "\r\n")+"\r\n")){throw 'Command text changed'}
   $rejected=$false
   try {$null=ConvertTo-DiskPartScriptBytes $commands 1252} catch {$rejected=$true}
   if(-not $rejected){throw 'Unrepresentable path was silently replaced'}
   [Convert]::ToBase64String($bytes)
  `);
  const bytes=Buffer.from(result.trim(),'base64');expect(bytes.subarray(0,6).toString()).toBe('select');expect(bytes.includes(0)).toBe(false);expect(bytes.subarray(-8).toString()).toBe('\r\nexit\r\n');
 });
 function originalPlan(nonAscii=false){
  const root=mkdtempSync(join(tmpdir(),nonAscii?'cimi-quota-卷-':'cimi-quota-resume-')),image=join(root,'quota.vhdx');
  const plan={format:'cimiloop/fixed-volume-prepare/1.0.0',root,image,volume_root:'R:\\',maximum_bytes:4096*1024**2,owner_sid:'S-1-5-21-1-2-3-1001',commands:[`create vdisk file="${image}" maximum=4096 type=fixed`,'exit'],executes:true,runtime_scope_proven:false};
  writeFileSync(join(root,'prepare-intent.json'),JSON.stringify(plan));writeFileSync(join(root,'diskpart.txt'),Buffer.from('\ufeff'+plan.commands.join('\r\n'),'utf16le'));writeFileSync(join(root,'diskpart-output.txt'),'PUBLIC original empty-command output');
  return{root,plan};
 }
 it.each([{nonAscii:false,ansi:false},{nonAscii:true,ansi:false},{nonAscii:true,ansi:true}])('recovers the same uncreated image intent while preserving failed original bytes ($nonAscii, ANSI: $ansi)',({nonAscii,ansi})=>{
  const {root,plan}=originalPlan(nonAscii),before=JSON.stringify(plan),result=invokeFunctions(`
   $expected=$env:CIMILOOP_QUOTA_EXPECTED|ConvertFrom-Json
   if($env:CIMILOOP_QUOTA_ANSI -eq 'true'){[IO.File]::WriteAllBytes((Join-Path $env:CIMILOOP_QUOTA_ORIGINAL 'diskpart.txt'),(ConvertTo-DiskPartScriptBytes $expected.commands (Get-DiskPartCodePage)))}
   $proof=Read-UncreatedQuotaPlan $env:CIMILOOP_QUOTA_ORIGINAL $expected
   $proof|ConvertTo-Json -Compress
  `,{CIMILOOP_QUOTA_ORIGINAL:root,CIMILOOP_QUOTA_EXPECTED:before,CIMILOOP_QUOTA_ANSI:String(ansi)});
  expect(JSON.parse(result)).toMatchObject({original_intent_sha256:expect.stringMatching(/^[a-f0-9]{64}$/),original_commands_sha256:expect.stringMatching(/^[a-f0-9]{64}$/),original_output_sha256:expect.stringMatching(/^[a-f0-9]{64}$/)});
  expect(existsSync(join(root,'quota.vhdx'))).toBe(false);expect(existsSync(join(root,'resume-before-image-intent.json'))).toBe(false);
 });
 it.each(['changed_owner','changed_commands','existing_image','existing_resume','extra_field'])('rejects %s instead of silently repeating disk preparation',mode=>{
  const {root,plan}=originalPlan();
  if(mode==='changed_owner')writeFileSync(join(root,'prepare-intent.json'),JSON.stringify({...plan,owner_sid:'S-1-5-21-1-2-3-1002'}));
  if(mode==='changed_commands')writeFileSync(join(root,'diskpart.txt'),'PUBLIC different image commands');
  if(mode==='existing_image')writeFileSync(join(root,'quota.vhdx'),'PUBLIC existing image');
  if(mode==='existing_resume')writeFileSync(join(root,'resume-before-image-intent.json'),'PUBLIC original resume');
  if(mode==='extra_field')writeFileSync(join(root,'prepare-intent.json'),JSON.stringify({...plan,other_image:'PUBLIC different image'}));
  const result=invokeFunctions(`
   $expected=$env:CIMILOOP_QUOTA_EXPECTED|ConvertFrom-Json
   $null=Get-Command Read-UncreatedQuotaPlan -ErrorAction Stop
   try {$null=Read-UncreatedQuotaPlan $env:CIMILOOP_QUOTA_ORIGINAL $expected} catch {'refused';exit 0}
   throw 'Original preparation was accepted'
  `,{CIMILOOP_QUOTA_ORIGINAL:root,CIMILOOP_QUOTA_EXPECTED:JSON.stringify(plan)});
  expect(result.trim()).toBe('refused');
 });
 it('distinguishes read-only ACL rights from actual replacement/write rights',()=>{
  const result=execFileSync(shell,['-NoProfile','-NonInteractive','-Command',`
   $errors=$null;$tokens=$null
   $ast=[Management.Automation.Language.Parser]::ParseFile($env:CIMILOOP_QUOTA_SCRIPT,[ref]$tokens,[ref]$errors)
   if($errors.Count){throw 'Invalid preparation syntax'}
   $definition=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Get-ReplacementRightsMask'},$true)
   . ([scriptblock]::Create($definition.Extent.Text))
   $mask=Get-ReplacementRightsMask $true
   $read=[Security.AccessControl.FileSystemRights]'ReadAndExecute,Synchronize'
   if(($mask -band $read) -ne 0){throw 'Read-only rights were denied'}
   foreach($name in @('WriteData','AppendData','WriteExtendedAttributes','WriteAttributes','Delete','DeleteSubdirectoriesAndFiles','ChangePermissions','TakeOwnership')){if(($mask -band [Security.AccessControl.FileSystemRights]$name) -eq 0){throw 'Dangerous right was allowed'}}
   $base=Get-ReplacementRightsMask $false
   if(($base -band [Security.AccessControl.FileSystemRights]::CreateDirectories) -ne 0){throw 'ProgramData child creation was denied'}
   'read-only-accepted;writes-denied'
  `],{encoding:'utf8',windowsHide:true,timeout:15000,env:{...environment,CIMILOOP_QUOTA_SCRIPT:script}});
  expect(result.trim()).toBe('read-only-accepted;writes-denied');
 });
 it('renders a plan without creating the protected parent or issuing disk effects',()=>{
  const parent=join(process.env.ProgramData!,'CimiLoopQuotaDryRun-'+process.pid),before=existsSync(parent);
  const result=execFileSync(shell,['-NoProfile','-NonInteractive','-File',script,'-DriveLetter','Z','-MaximumMiB','64','-ParentDirectory',parent],{encoding:'utf8',windowsHide:true,timeout:15000,env:environment});
  expect(JSON.parse(result)).toMatchObject({executes:false,runtime_scope_proven:false,maximum_bytes:64*1024**2,volume_root:'Z:\\'});expect(existsSync(parent)).toBe(before);
 });
});
