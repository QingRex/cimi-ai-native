import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe.runIf(process.platform==='win32')('fixed-volume administrator preparation guards',()=>{
 const script=resolve('scripts/windows/prepare-fixed-volume-quota.ps1');
 const shell=join(process.env.SystemRoot!,'System32/WindowsPowerShell/v1.0/powershell.exe');
 // Node selects only the first case-insensitive Windows environment key.
 const environment={...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toUpperCase()!=='PSMODULEPATH')),PSModulePath:[join(process.env.SystemRoot!,'System32/WindowsPowerShell/v1.0/Modules'),join(process.env.ProgramFiles!,'WindowsPowerShell/Modules')].join(';')};
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
