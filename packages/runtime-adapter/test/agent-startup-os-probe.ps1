param([ValidateSet('inspect','reserve','release')][string]$Mode, [string]$Operation)
$ErrorActionPreference = 'Stop'
$originalOperation = [IO.Path]::GetFullPath($Operation)
$fixturePrefix = [IO.Path]::Combine([IO.Path]::GetTempPath(), 'cimiloop-opencode-startup-')
if (-not $originalOperation.StartsWith($fixturePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Not an owned startup fixture' }
for ($originalPath = $originalOperation; $originalPath; $originalPath = [IO.Path]::GetDirectoryName($originalPath)) {
  if ((Test-Path -LiteralPath $originalPath) -and ((Get-Item -LiteralPath $originalPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Linked fixture path' }
}
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices; using System.Security.Principal;
public static class StartupFixtureOs {
 [StructLayout(LayoutKind.Sequential)] struct Accounting { public long user,kernel,periodUser,periodKernel; public uint faults,total,active,terminated; }
 [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int DeriveAppContainerSidFromAppContainerName(string name,out IntPtr sid);
 [DllImport("advapi32.dll")] static extern IntPtr FreeSid(IntPtr sid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint QueryDosDevice(string name,StringBuilder target,int size);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool DefineDosDevice(uint flags,string name,string target);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr OpenJobObject(uint access,bool inherit,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int kind,out Accounting data,int size,IntPtr returned);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 public static string Sid(string profile) { IntPtr sid; int hr=DeriveAppContainerSidFromAppContainerName(profile,out sid); if(hr!=0)Marshal.ThrowExceptionForHR(hr); try{return new SecurityIdentifier(sid).Value;}finally{FreeSid(sid);} }
 public static string Target(string name) { var target=new StringBuilder(4096); if(QueryDosDevice(name,target,4096)!=0)return target.ToString(); if(Marshal.GetLastWin32Error()!=2)throw new InvalidOperationException("Mapping observation failed"); return null; }
 public static void Create(string name,string root) { if(!DefineDosDevice(1|8,name,"\\??\\"+root))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
 public static void Remove(string name,string root) { if(!DefineDosDevice(1|2|4|8,name,"\\??\\"+root))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
 public static int Active(string name) { IntPtr job=OpenJobObject(4,false,name); if(job==IntPtr.Zero){if(Marshal.GetLastWin32Error()!=2)throw new InvalidOperationException("Job observation failed");return -1;} try{Accounting data;if(!QueryInformationJobObject(job,1,out data,Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero))throw new InvalidOperationException("Job accounting failed");return (int)data.active;}finally{CloseHandle(job);} }
}
'@
$originalResources = Get-Content -LiteralPath (Join-Path $originalOperation 'agent-sandbox-resources.json') -Raw | ConvertFrom-Json
$originalConfig = Get-Content -LiteralPath (Join-Path $originalOperation 'original-config.json') -Raw | ConvertFrom-Json
if ($originalResources.root -ne (Join-Path $originalOperation 'sandbox') -or $originalConfig.root -ne $originalResources.root) { throw 'Original root mismatch' }
$originalSid = [StartupFixtureOs]::Sid($originalResources.profile)
$foreignRoot = Join-Path $originalOperation 'foreign-map'
$foreignAnchor = Join-Path $originalOperation 'foreign-mapping.json'
if ($Mode -eq 'reserve') {
  New-Item -ItemType Directory -Path $foreignRoot | Out-Null
  $allocator = New-Object Threading.Mutex($false, 'Local\CimiLoop.DriveAllocation')
  $heldAllocator = $false
  try {
    try { $heldAllocator = $allocator.WaitOne(5000) } catch [Threading.AbandonedMutexException] { $heldAllocator = $true }
    if (-not $heldAllocator) { throw 'Allocator busy' }
    foreach ($letter in 90..70) {
      $fixtureDrive = [string][char]$letter + ':'
      if ($null -ne [StartupFixtureOs]::Target($fixtureDrive)) { continue }
      $anchor = @{ mapping=$fixtureDrive; root=$foreignRoot }
      [IO.File]::WriteAllText($foreignAnchor, ($anchor | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
      [StartupFixtureOs]::Create($fixtureDrive,$foreignRoot)
      $anchor | ConvertTo-Json -Compress
      exit 0
    }
    throw 'No fixture drive'
  } finally { if ($heldAllocator) { $allocator.ReleaseMutex() }; $allocator.Dispose() }
}
if ($Mode -eq 'release') {
  $anchor = Get-Content -LiteralPath $foreignAnchor -Raw | ConvertFrom-Json
  if ($anchor.root -ne $foreignRoot -or $anchor.mapping -notmatch '^[F-Z]:$') { throw 'Foreign fixture original anchor mismatch' }
  $target = [StartupFixtureOs]::Target($anchor.mapping)
  if ($null -ne $target) { if ($target -ne ('\??\' + $foreignRoot)) { throw 'Other drive owner' }; [StartupFixtureOs]::Remove($anchor.mapping,$foreignRoot) }
  @{ released=$true } | ConvertTo-Json -Compress
  exit 0
}
$ownGrants = 0
foreach ($originalPath in @($originalResources.root, (Join-Path $originalResources.root 'workspace'), (Join-Path $originalResources.root 'state'), (Join-Path $originalResources.root 'config'), $originalResources.binary)) {
  $ownGrants += @((Get-Acl -LiteralPath $originalPath).Access | Where-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $originalSid }).Count
}
$mapped = $false
if ($originalResources.mapping) { $mapped = [StartupFixtureOs]::Target($originalResources.mapping) -eq ('\??\' + $originalResources.root) }
$foreignMappingPresent = $false
if (Test-Path -LiteralPath $foreignAnchor) { $anchor = Get-Content -LiteralPath $foreignAnchor -Raw | ConvertFrom-Json; $foreignMappingPresent = [StartupFixtureOs]::Target($anchor.mapping) -eq ('\??\' + $foreignRoot) }
@{ original_grants=$ownGrants; original_mapping_present=$mapped; original_profile_present=(Test-Path -LiteralPath ('HKCU:\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppContainer\Mappings\' + $originalSid)); original_job_active=[StartupFixtureOs]::Active($originalResources.job_name); foreign_mapping_present=$foreignMappingPresent } | ConvertTo-Json -Compress
