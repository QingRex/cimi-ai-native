[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[D-Zd-z]$')][string]$DriveLetter,
  [ValidateRange(64,8192)][int]$MaximumMiB=1024,
  [string]$ParentDirectory=(Join-Path $env:ProgramData 'CimiLoopPhysicalQuota'),
  [string]$OwnerSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value,
  [string]$ResumeRoot,
  [switch]$Execute
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
function Assert-PlainPath([string]$Path) {
  $cursor=[IO.Path]::GetFullPath($Path)
  while($cursor) {
    if(Test-Path -LiteralPath $cursor) {
      if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked paths are not allowed.' }
    }
    $parent=[IO.Directory]::GetParent($cursor)
    if($null -eq $parent) { break }
    $cursor=$parent.FullName
  }
}
function Save-NewJson([string]$Path,$Value) {
  $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
  try { $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 8));$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true) } finally { $stream.Dispose() }
}
function ConvertTo-DiskPartScriptBytes([string[]]$Commands,[int]$CodePage) {
  # DiskPart may return 0 without interpreting a UTF-16 script. Use its
  # system ANSI code page without a BOM, and reject lossy path conversion.
  $encoding=[Text.Encoding]::GetEncoding($CodePage,[Text.EncoderFallback]::ExceptionFallback,[Text.DecoderFallback]::ExceptionFallback)
  return ,$encoding.GetBytes(($Commands -join "`r`n")+"`r`n")
}
function Get-DiskPartCodePage {
  if(-not ('CimiLoopQuotaCodePage' -as [type])) {
    Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class CimiLoopQuotaCodePage { [DllImport("kernel32.dll")] public static extern uint GetACP(); }'
  }
  return [int][CimiLoopQuotaCodePage]::GetACP()
}
function Read-UncreatedQuotaPlan([string]$Root,$Expected) {
  Assert-PlainPath $Root
  foreach($name in @('quota.vhdx','prepared.json','resume-before-image-intent.json','resume-diskpart.txt','resume-diskpart-output.txt','resume-diskpart-result.json')) {
    if(Test-Path -LiteralPath (Join-Path $Root $name)) { throw 'An image or original resume already exists; inspect it instead of repeating preparation.' }
  }
  $intent=Join-Path $Root 'prepare-intent.json'
  $commands=Join-Path $Root 'diskpart.txt'
  $output=Join-Path $Root 'diskpart-output.txt'
  foreach($path in @($intent,$commands,$output)) {
    Assert-PlainPath $path
    if(-not(Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Item -LiteralPath $path).Length -gt 65536) { throw 'The original failed preparation materials are unavailable.' }
  }
  $prior=Get-Content -LiteralPath $intent -Raw -Encoding UTF8 | ConvertFrom-Json
  $keys=@('format','root','image','volume_root','maximum_bytes','owner_sid','commands','executes','runtime_scope_proven')
  if((@($prior.PSObject.Properties.Name | Sort-Object) -join ',') -cne (($keys|Sort-Object) -join ',')) { throw 'Original preparation fields changed.' }
  foreach($name in $keys | Where-Object { $_ -ne 'commands' }) {
    if(($prior.$name|ConvertTo-Json -Compress) -cne ($Expected.$name|ConvertTo-Json -Compress)) { throw 'The original preparation identity or limits changed.' }
  }
  # Detect historical UTF-16 BOMs, while decoding new BOM-free scripts with
  # the same native ANSI code page used to write them.
  $encoding=[Text.Encoding]::GetEncoding((Get-DiskPartCodePage),[Text.EncoderFallback]::ExceptionFallback,[Text.DecoderFallback]::ExceptionFallback)
  $reader=[IO.StreamReader]::new($commands,$encoding,$true)
  $lines=@()
  try { while($null -ne ($line=$reader.ReadLine())) { $lines+=@($line) } } finally { $reader.Dispose() }
  if(($prior.commands|ConvertTo-Json -Compress) -cne ($Expected.commands|ConvertTo-Json -Compress) -or
    ($lines|ConvertTo-Json -Compress) -cne ($Expected.commands|ConvertTo-Json -Compress)) { throw 'The original preparation commands changed.' }
  return [ordered]@{original_intent_sha256=(Get-FileHash -LiteralPath $intent -Algorithm SHA256).Hash.ToLowerInvariant();original_commands_sha256=(Get-FileHash -LiteralPath $commands -Algorithm SHA256).Hash.ToLowerInvariant();original_output_sha256=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()}
}
function Set-QuotaAcl([string]$Path,[bool]$WritableOwner) {
  $directory=(Get-Item -LiteralPath $Path -Force).PSIsContainer
  $acl=if($directory){[Security.AccessControl.DirectorySecurity]::new()}else{[Security.AccessControl.FileSecurity]::new()}
  $acl.SetAccessRuleProtection($true,$false)
  $admins=[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
  $acl.SetOwner($admins)
  $inherit=if($directory){[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'}else{[Security.AccessControl.InheritanceFlags]::None}
  foreach($sid in @('S-1-5-18','S-1-5-32-544',$OwnerSid)) {
    $rights=if($sid -eq $OwnerSid){if($WritableOwner){'Modify'}else{'ReadAndExecute'}}else{'FullControl'}
    $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),[Security.AccessControl.FileSystemRights]$rights,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $Path -AclObject $acl
}
function Get-ReplacementRightsMask([bool]$Protected) {
  $danger=[Security.AccessControl.FileSystemRights]'Delete,DeleteSubdirectoriesAndFiles,ChangePermissions,TakeOwnership'
  if($Protected) { $danger=$danger -bor [Security.AccessControl.FileSystemRights]'WriteData,AppendData,WriteExtendedAttributes,WriteAttributes' }
  return $danger
}
function Assert-AdminParent([string]$Path,[bool]$Protected) {
  Assert-PlainPath $Path
  $acl=Get-Acl -LiteralPath $Path
  $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  if($owner -notin @('S-1-5-18','S-1-5-32-544') -or ($Protected -and -not $acl.AreAccessRulesProtected)) { throw 'The quota parent must be owned and protected by administrators or SYSTEM.' }
  # The ProgramData root may allow creating children, but may not allow an
  # unprivileged principal to delete/replace another administrator-owned child.
  $danger=Get-ReplacementRightsMask $Protected
  foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
    if($rule.IdentityReference.Value -notin @('S-1-5-18','S-1-5-32-544') -and $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -eq 0 -and ($rule.FileSystemRights -band $danger) -ne 0) { throw 'The quota parent permits unprivileged replacement or modification.' }
  }
}
if($env:OS -ne 'Windows_NT') { throw 'Windows is required.' }
if($OwnerSid -notmatch '^S-1-[0-9]+(-[0-9]+)+$') { throw 'A Windows owner SID is required.' }
$null=[Security.Principal.SecurityIdentifier]::new($OwnerSid)
if($OwnerSid -in @('S-1-5-18','S-1-5-32-544')) { throw 'Use the ordinary Runtime user SID, not SYSTEM or Administrators.' }
if($ParentDirectory -notmatch '^[A-Za-z]:[\\/]' -or $ParentDirectory -match '["\r\n\x00]') { throw 'Use an absolute local parent directory.' }
$quotaParent=[IO.Path]::GetFullPath($ParentDirectory)
$programDataRoot=[IO.Path]::GetFullPath($env:ProgramData).TrimEnd('\')
if([IO.Path]::GetDirectoryName($quotaParent.TrimEnd('\')) -ine $programDataRoot) { throw 'Use a dedicated direct child of ProgramData for the administrator-owned quota parent.' }
Assert-AdminParent $programDataRoot $false
Assert-PlainPath $quotaParent
if(Test-Path -LiteralPath $quotaParent) { Assert-AdminParent $quotaParent $true }
$resuming=$PSBoundParameters.ContainsKey('ResumeRoot')
$quotaRoot=if($resuming){[IO.Path]::GetFullPath($ResumeRoot)}else{Join-Path $quotaParent ([Guid]::NewGuid().ToString())}
if($resuming -and [IO.Path]::GetDirectoryName($quotaRoot.TrimEnd('\')) -ine $quotaParent) { throw 'Resume only the original direct child of the quota parent.' }
$image=Join-Path $quotaRoot 'quota.vhdx'
$volume=$DriveLetter.ToUpperInvariant()+':\'
if([Environment]::GetLogicalDrives() -contains $volume -or (Get-PSDrive -PSProvider FileSystem).Name -contains $DriveLetter) { throw 'The requested drive letter is already assigned.' }
$commands=@("create vdisk file=`"$image`" maximum=$MaximumMiB type=fixed","select vdisk file=`"$image`"",'attach vdisk','create partition primary','format fs=ntfs quick label="CimiS1Quota"',"assign letter=$DriveLetter",'exit')
$plan=[ordered]@{format='cimiloop/fixed-volume-prepare/1.0.0';root=$quotaRoot;image=$image;volume_root=$volume;maximum_bytes=[long]$MaximumMiB*1048576;owner_sid=$OwnerSid;commands=$commands;executes=[bool]$Execute;runtime_scope_proven=$false}
if(-not $Execute) { $plan|ConvertTo-Json -Depth 8;return }
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this exact reviewed script in an administrator PowerShell. No disk operation was performed.' }
foreach($command in @('Get-DiskImage','Get-Disk','Get-Partition','Get-Volume')) { $null=Get-Command $command -ErrorAction Stop }
$commandBytes=ConvertTo-DiskPartScriptBytes $commands (Get-DiskPartCodePage)
if($resuming) {
  Assert-AdminParent $quotaParent $true
  Assert-AdminParent $quotaRoot $true
  $resumeBasis=Read-UncreatedQuotaPlan $quotaRoot $plan
}
if(-not(Test-Path -LiteralPath $quotaParent)) {
  $null=New-Item -ItemType Directory -Path $quotaParent
  Set-QuotaAcl $quotaParent $false
  Assert-AdminParent $quotaParent $true
  if(@(Get-ChildItem -LiteralPath $quotaParent -Force).Count -ne 0) { throw 'The new quota parent is not empty; retain it and inspect it.' }
}
Assert-AdminParent $quotaParent $true
if($resuming) {
  Save-NewJson (Join-Path $quotaRoot 'resume-before-image-intent.json') ([ordered]@{format='cimiloop/fixed-volume-before-image-resume/1.0.0';original=$plan;basis=$resumeBasis})
} else {
  if(Test-Path -LiteralPath $quotaRoot) { throw 'The new installation root already exists; do not reuse it.' }
  $null=New-Item -ItemType Directory -Path $quotaRoot
  Assert-PlainPath $quotaRoot
  Set-QuotaAcl $quotaRoot $false
  if(@(Get-ChildItem -LiteralPath $quotaRoot -Force).Count -ne 0) { throw 'The new quota root is not empty; retain it and inspect it.' }
  Save-NewJson (Join-Path $quotaRoot 'prepare-intent.json') $plan
}
$prefix=if($resuming){'resume-diskpart'}else{'diskpart'}
$commandFile=Join-Path $quotaRoot ($prefix+'.txt')
$stream=[IO.File]::Open($commandFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
try { $stream.Write($commandBytes,0,$commandBytes.Length);$stream.Flush($true) } finally { $stream.Dispose() }
# No noerr/clean/select-disk fallback. A failed original retains all materials.
$diskpart=Join-Path $env:SystemRoot 'System32\diskpart.exe'
$output=& $diskpart /s $commandFile 2>&1
$result=$LASTEXITCODE
[IO.File]::WriteAllLines((Join-Path $quotaRoot ($prefix+'-output.txt')),[string[]]$output,[Text.UTF8Encoding]::new($false))
Save-NewJson (Join-Path $quotaRoot ($prefix+'-result.json')) ([ordered]@{exit_code=$result;command_sha256=(Get-FileHash -LiteralPath $commandFile -Algorithm SHA256).Hash.ToLowerInvariant()})
if($result -ne 0 -or -not(Test-Path -LiteralPath $image) -or -not(Test-Path -LiteralPath $volume)) { throw 'Disk preparation is incomplete. Retain this root and inspect the original; do not rerun or clean it.' }
# Read the OS relation before touching a volume ACL. Apply the ACL through its
# stable GUID path, so a drive-letter remap cannot target some other volume.
$newImage=Get-DiskImage -ImagePath $image
if(-not $newImage.Attached) { throw 'The original image is not attached; retain all materials.' }
$newDisk=$newImage | Get-Disk
$partition=Get-Partition -DriveLetter $DriveLetter
if(@($newDisk).Count -ne 1 -or @($partition).Count -ne 1 -or $partition.DiskNumber -ne $newDisk.Number -or $newDisk.IsBoot -or $newDisk.IsSystem -or $newDisk.Size -ne $plan.maximum_bytes) { throw 'The assigned volume does not match the new fixed image; no volume ACL was changed.' }
$newVolume=$partition | Get-Volume
$volumeIds=@($partition.AccessPaths | Where-Object { $_ -match '^\\\\\?\\Volume\{[0-9a-fA-F-]{36}\}\\$' })
if(@($newVolume).Count -ne 1 -or $newVolume.FileSystem -ne 'NTFS' -or $newVolume.FileSystemLabel -ne 'CimiS1Quota' -or $volumeIds.Count -ne 1 -or $newVolume.Size -gt $plan.maximum_bytes -or $newVolume.Size -le 0) { throw 'The new NTFS volume identity is unproven; no volume ACL was changed.' }
Set-QuotaAcl $image $false
Set-QuotaAcl $volumeIds[0] $true
Save-NewJson (Join-Path $quotaRoot 'prepared.json') $plan
$plan|ConvertTo-Json -Depth 8
# Deliberately no detach, delete, rollback or automatic continuation.
