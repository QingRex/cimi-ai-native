import { lstatSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { AgentStartLedger, type AgentStartHostIdentity } from "./agent-start-ledger.js";
import { openWindowsAgentRunClock } from "./agent-run-clock.js";
import { isolatedEnvironment } from "./native.js";
import { assertOrdinaryPath, RuntimeAdapterError } from "./files.js";
const script = `Add-Type -AssemblyName System.Security
$ErrorActionPreference='Stop'
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$root=$env:CIMILOOP_START_CUSTODY_DIRECTORY
if($env:CIMILOOP_START_CUSTODY_ACTION -eq 'protect') {
 $acl=[Security.AccessControl.DirectorySecurity]::new()
 $acl.SetAccessRuleProtection($true,$false)
 $acl.SetOwner($sid)
 $rule=[Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
 $acl.AddAccessRule($rule)
 [IO.Directory]::SetAccessControl($root,$acl)
}
if($env:CIMILOOP_START_CUSTODY_ACTION -ne 'identity') {
 if(-not [IO.Directory]::Exists($root)) { throw 'agent_start_original_missing' }
 $acl=[IO.Directory]::GetAccessControl($root)
 $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
 if(-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or $rules.Count -ne 1 -or $rules[0].IdentityReference.Value -ne $sid.Value -or $rules[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or $rules[0].FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl -or $rules[0].InheritanceFlags -ne [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit' -or $rules[0].PropagationFlags -ne [Security.AccessControl.PropagationFlags]::None -or $rules[0].IsInherited) { throw 'agent_start_directory_custody_unproven' }
 foreach($name in @('starts.sqlite','starts.sqlite-wal','starts.sqlite-shm','starts.sqlite-journal')) {
  $path=[IO.Path]::Combine($root,$name)
  if([IO.File]::Exists($path)) {
   $file=[IO.File]::GetAccessControl($path)
   $rules=@($file.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
   if($file.AreAccessRulesProtected -or $file.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or $rules.Count -ne 1 -or -not $rules[0].IsInherited -or $rules[0].IdentityReference.Value -ne $sid.Value -or $rules[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or $rules[0].FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl) { throw 'agent_start_directory_custody_unproven' }
  }
 }
}
$hash=[Security.Cryptography.SHA256]::Create()
try { [Console]::Out.Write([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($sid.Value))).Replace('-','').ToLowerInvariant()) } finally { $hash.Dispose() }`;
function principal(action: "identity" | "protect" | "verify", root: string): string {
  if (process.platform !== "win32" || process.arch !== "x64") throw new RuntimeAdapterError("windows_x64_start_custody_required");
  const shell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  try {
    const result = execFileSync(shell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
      windowsHide: true, timeout: 15000, maxBuffer: 16384, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...isolatedEnvironment(),
        CIMILOOP_START_CUSTODY_DIRECTORY: assertOrdinaryPath(root), CIMILOOP_START_CUSTODY_ACTION: action } });
    if (!/^[a-f0-9]{64}$/.test(result)) throw Error("Invalid principal proof"); return result;
  } catch (error) {
    // Fixed reason only: no inherited environment, principal name, credential or
    // script stderr is returned to callers/logs/Agent context.
    if (action === "verify") { try { lstatSync(root); } catch (missing) {
      if (missing && typeof missing === "object" && "code" in missing && missing.code === "ENOENT") throw new RuntimeAdapterError("agent_start_original_missing");
    } }
    throw new RuntimeAdapterError("agent_start_directory_custody_unproven");
  }
}
async function host(root: string, toolsRoot: string, signal?: AbortSignal): Promise<AgentStartHostIdentity> {
  signal?.throwIfAborted(); const clock = await openWindowsAgentRunClock(toolsRoot, signal), actual = await clock.read(signal);
  signal?.throwIfAborted(); return { machine_digest: actual.machine_digest, principal_digest: principal("identity", root) };
}
export async function initializeWindowsAgentStartLedger(root: string, toolsRoot: string, signal?: AbortSignal) {
  root = assertOrdinaryPath(root); const identity = await host(root, toolsRoot, signal);
  return AgentStartLedger.initialize(root, identity, path => { if (principal("protect", path) !== identity.principal_digest) throw new RuntimeAdapterError("agent_start_origin_changed"); },
    path => { if (principal("verify", path) !== identity.principal_digest) throw new RuntimeAdapterError("agent_start_origin_changed"); });
}
export async function openWindowsAgentStartLedger(root: string, toolsRoot: string, signal?: AbortSignal) {
  root = assertOrdinaryPath(root); const identity = await host(root, toolsRoot, signal);
  if (principal("verify", root) !== identity.principal_digest) throw new RuntimeAdapterError("agent_start_origin_changed");
  return AgentStartLedger.open(root, identity, path => { if (principal("verify", path) !== identity.principal_digest) throw new RuntimeAdapterError("agent_start_origin_changed"); });
}
