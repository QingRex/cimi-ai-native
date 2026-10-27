using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;

// Original model-process AppContainer. No shared desktop/window-station ACL,
// credential read, old Profile adoption, loopback exemption or UI capability.
// The host's storage capability selects the roots; the worker cannot add any.
public sealed class CodexWriteScope : IDisposable {
  [StructLayout(LayoutKind.Sequential)] struct SidAttributes {public IntPtr Sid;public uint Attributes;}
  [StructLayout(LayoutKind.Sequential)] struct Capabilities {public IntPtr Sid,Values;public uint Count,Reserved;}
  [StructLayout(LayoutKind.Sequential)] struct FileTime {public uint Low,High;public ulong Value {get{return ((ulong)High<<32)|Low;}}}
  [StructLayout(LayoutKind.Sequential)] struct FileInfo {public uint Attributes;public FileTime Created,Access,Write;public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
  [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int CreateAppContainerProfile(string name,string display,string description,IntPtr capabilities,uint count,out IntPtr sid);
  [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int DeleteAppContainerProfile(string name);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSidToSid(string text,out IntPtr sid);
  [DllImport("advapi32.dll")] static extern void FreeSid(IntPtr sid);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateFile(string name,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(IntPtr handle,out FileInfo info);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr buffer,int size,out int returned);
  sealed class Grant {public string Path,Identity;public bool Directory,Inherit;public FileSystemRights Rights;}
  readonly List<Grant> grants=new List<Grant>();readonly List<object> roots=new List<object>();
  IntPtr sid,networkSid,capArray,capabilities;bool created,removed,deleted;
  readonly string profile,network;public static string Stage="scope_input";
  public IntPtr CapabilitiesPointer {get{return capabilities;}}
  public string Sid {get{return new SecurityIdentifier(sid).Value;}}
  static void Need(bool value){if(!value)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}
  static string Ordinary(string raw,bool directory){string path=System.IO.Path.GetFullPath(raw);for(string current=path;current!=null;current=System.IO.Path.GetDirectoryName(current))if((File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException();if(directory?!Directory.Exists(path):!File.Exists(path))throw new InvalidDataException();return path;}
  static string Identity(string path){IntPtr handle=CreateFile(path,0,7,IntPtr.Zero,3,0x02000000,IntPtr.Zero);Need(handle!=new IntPtr(-1));try{FileInfo info;Need(GetFileInformationByHandle(handle,out info));return info.Volume+":"+(((ulong)info.IndexHigh<<32)|info.IndexLow)+":"+info.Created.Value;}finally{CloseHandle(handle);}}
  void GrantPath(string raw,bool directory,FileSystemRights rights,bool inherit){string path=Ordinary(raw,directory);var principal=new SecurityIdentifier(sid);FileSystemSecurity acl=directory?(FileSystemSecurity)Directory.GetAccessControl(path):File.GetAccessControl(path);foreach(FileSystemAccessRule rule in acl.GetAccessRules(true,false,typeof(SecurityIdentifier)))if(rule.IdentityReference.Equals(principal))throw new InvalidDataException();var grant=new Grant{Path=path,Identity=Identity(path),Directory=directory,Inherit=inherit,Rights=rights};grants.Add(grant);acl.AddAccessRule(new FileSystemAccessRule(principal,rights,inherit?InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit:InheritanceFlags.None,PropagationFlags.None,AccessControlType.Allow));if(directory)Directory.SetAccessControl(path,(DirectorySecurity)acl);else File.SetAccessControl(path,(FileSecurity)acl);}
  void VerifyPaths(){foreach(var grant in grants)if(Ordinary(grant.Path,grant.Directory)!=grant.Path||Identity(grant.Path)!=grant.Identity)throw new InvalidDataException();}
  public CodexWriteScope(string[] writableRoots,string binary,string cwd,string nonce,string networkMode){
    if(writableRoots==null||writableRoots.Length<1||writableRoots.Length>2||Guid.Parse(nonce)==Guid.Empty||(networkMode!="deny_all"&&networkMode!="public_internet"))throw new InvalidDataException();network=networkMode;profile="CimiLoop.CodexWrite."+Guid.Parse(nonce).ToString("N");
    try{Stage="scope_profile_create";if(network=="public_internet"){Need(ConvertStringSidToSid("S-1-15-3-1",out networkSid));capArray=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(SidAttributes)));Marshal.StructureToPtr(new SidAttributes{Sid=networkSid,Attributes=4},capArray,false);}int hr=CreateAppContainerProfile(profile,profile,"CimiLoop original model write scope",capArray,network=="deny_all"?0u:1u,out sid);if(hr!=0)Marshal.ThrowExceptionForHR(hr);created=true;
      Stage="scope_profile_storage";AgentProfileStorage.Protect(sid);
      Stage="scope_root_grants";var selected=new List<string>();foreach(string raw in writableRoots){string path=Ordinary(raw,true);foreach(string prior in selected)if(path.Equals(prior,StringComparison.OrdinalIgnoreCase)||path.StartsWith(prior+"\\",StringComparison.OrdinalIgnoreCase)||prior.StartsWith(path+"\\",StringComparison.OrdinalIgnoreCase))throw new InvalidDataException();selected.Add(path);GrantPath(path,true,FileSystemRights.Modify,true);roots.Add(new{path=path,identity=Identity(path)});}
      string current=Ordinary(cwd,true);bool covered=false;foreach(string path in selected)if(current.Equals(path,StringComparison.OrdinalIgnoreCase)||current.StartsWith(path+"\\",StringComparison.OrdinalIgnoreCase))covered=true;if(!covered)GrantPath(current,true,FileSystemRights.ReadAttributes|FileSystemRights.Traverse,false);
      GrantPath(binary,false,FileSystemRights.ReadAndExecute,false);
      var caps=new Capabilities{Sid=sid,Values=capArray,Count=network=="deny_all"?0u:1u,Reserved=0};capabilities=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Capabilities)));Marshal.StructureToPtr(caps,capabilities,false);VerifyPaths();Stage="scope_worker_create";
    }catch{Dispose();throw;}
  }
  public void VerifyProcess(IntPtr process){IntPtr token;Need(OpenProcessToken(process,8,out token));try{IntPtr memory=Marshal.AllocHGlobal(256);try{int returned;Need(GetTokenInformation(token,29,memory,256,out returned));if(Marshal.ReadInt32(memory)!=1)throw new InvalidDataException();Need(GetTokenInformation(token,31,memory,256,out returned));if(!new SecurityIdentifier(Marshal.ReadIntPtr(memory)).Equals(new SecurityIdentifier(sid)))throw new InvalidDataException();}finally{Marshal.FreeHGlobal(memory);}}finally{CloseHandle(token);}AgentProfileStorage.ProtectRegistry(process,sid);VerifyPaths();}
  public object Proof(){VerifyPaths();return new{format="cimiloop/codex-native-write-scope/2.0.0",appcontainer_sid=Sid,profile=profile,roots=roots,network_mode=network,profile_storage="read_only_package_storage/1.0.0"};}
  public void AllowProgram(string path){GrantPath(path,false,FileSystemRights.ReadAndExecute,false);VerifyPaths();}
  public void CompleteAfterEmptyJob(){VerifyPaths();var principal=new SecurityIdentifier(sid);for(int i=grants.Count-1;i>=0;i--){var grant=grants[i];FileSystemSecurity acl=grant.Directory?(FileSystemSecurity)Directory.GetAccessControl(grant.Path):File.GetAccessControl(grant.Path);acl.RemoveAccessRuleSpecific(new FileSystemAccessRule(principal,grant.Rights,grant.Inherit?InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit:InheritanceFlags.None,PropagationFlags.None,AccessControlType.Allow));if(grant.Directory)Directory.SetAccessControl(grant.Path,(DirectorySecurity)acl);else File.SetAccessControl(grant.Path,(FileSecurity)acl);}VerifyPaths();foreach(var grant in grants){FileSystemSecurity remaining=grant.Directory?(FileSystemSecurity)Directory.GetAccessControl(grant.Path):File.GetAccessControl(grant.Path);foreach(FileSystemAccessRule rule in remaining.GetAccessRules(true,true,typeof(SecurityIdentifier)))if(rule.IdentityReference.Equals(principal))throw new InvalidDataException();}removed=true;if(!created)throw new InvalidDataException();int hr=DeleteAppContainerProfile(profile);if(hr!=0)Marshal.ThrowExceptionForHR(hr);deleted=true;created=false;}
  public bool GrantsRemoved {get{return removed;}}public bool ProfileDeleted {get{return deleted;}}
  public void Dispose(){if(capabilities!=IntPtr.Zero){Marshal.FreeHGlobal(capabilities);capabilities=IntPtr.Zero;}if(capArray!=IntPtr.Zero){Marshal.FreeHGlobal(capArray);capArray=IntPtr.Zero;}if(networkSid!=IntPtr.Zero){LocalFree(networkSid);networkSid=IntPtr.Zero;}if(sid!=IntPtr.Zero){FreeSid(sid);sid=IntPtr.Zero;}}
}
