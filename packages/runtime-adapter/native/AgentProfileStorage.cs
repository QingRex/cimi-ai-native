using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;

// Called only for this controller's fresh Profile: files before child creation,
// registry before child resume. No CLI paths, old Profile adoption or delete.
public static class AgentProfileStorage {
  [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int GetAppContainerFolderPath(string sid,out IntPtr path);
  [DllImport("userenv.dll")] static extern int GetAppContainerRegistryLocation(uint access,out IntPtr key);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr buffer,int length,out int returned);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static readonly FileSystemRights denied=FileSystemRights.WriteData|FileSystemRights.AppendData|FileSystemRights.WriteExtendedAttributes|FileSystemRights.WriteAttributes|FileSystemRights.Delete|FileSystemRights.DeleteSubdirectoriesAndFiles|FileSystemRights.ChangePermissions|FileSystemRights.TakeOwnership;
  static readonly SecurityIdentifier ownerRights=new SecurityIdentifier("S-1-3-4");
  static readonly RegistryRights registryDenied=RegistryRights.SetValue|RegistryRights.CreateSubKey|RegistryRights.Delete|RegistryRights.ChangePermissions|RegistryRights.TakeOwnership;
  static void RestrictRegistry(RegistryKey key,SecurityIdentifier sid) {
    var acl=key.GetAccessControl(AccessControlSections.Access);acl.SetAccessRuleProtection(true,true);
    var remove=new List<SecurityIdentifier>();
    foreach(RegistryAccessRule rule in acl.GetAccessRules(true,false,typeof(SecurityIdentifier))){var principal=(SecurityIdentifier)rule.IdentityReference;if(Package(principal))remove.Add(principal);}
    foreach(var principal in remove)acl.PurgeAccessRules(principal);
    acl.AddAccessRule(new RegistryAccessRule(sid,RegistryRights.ReadKey,InheritanceFlags.ContainerInherit,PropagationFlags.None,AccessControlType.Allow));
    acl.PurgeAccessRules(ownerRights);acl.AddAccessRule(new RegistryAccessRule(ownerRights,RegistryRights.ReadPermissions,InheritanceFlags.ContainerInherit,PropagationFlags.None,AccessControlType.Allow));
    key.SetAccessControl(acl);VerifyRegistry(key,sid);
  }
  static void VerifyRegistry(RegistryKey key,SecurityIdentifier sid) {
    var acl=key.GetAccessControl(AccessControlSections.Access);if(!acl.AreAccessRulesProtected)throw new InvalidDataException();bool read=false,owner=false;
    foreach(RegistryAccessRule rule in acl.GetAccessRules(true,true,typeof(SecurityIdentifier))){var principal=(SecurityIdentifier)rule.IdentityReference;
      if((Package(principal)||principal.Equals(ownerRights))&&rule.AccessControlType==AccessControlType.Allow&&(rule.RegistryRights&registryDenied)!=0)throw new InvalidDataException();
      if(principal.Equals(sid)&&rule.AccessControlType==AccessControlType.Allow&&(rule.RegistryRights&RegistryRights.ReadKey)==RegistryRights.ReadKey&&rule.InheritanceFlags==InheritanceFlags.ContainerInherit&&rule.PropagationFlags==PropagationFlags.None)read=true;
      if(principal.Equals(ownerRights)&&rule.AccessControlType==AccessControlType.Allow&&(rule.RegistryRights&RegistryRights.ReadPermissions)!=0)owner=true;
    }
    if(!read||!owner)throw new InvalidDataException();
  }
  // Called only for the just-created, still suspended child. Ask Windows for
  // that token's actual registry root, never construct a user hive path from a
  // caller SID. Revert impersonation before changing ACLs; the handle is never
  // inherited by the child and is closed before the controller can resume it.
  public static void ProtectRegistry(IntPtr process,IntPtr rawSid) {
    if(process==IntPtr.Zero||rawSid==IntPtr.Zero)throw new InvalidDataException();var sid=new SecurityIdentifier(rawSid);
    if(!sid.Value.StartsWith("S-1-15-2-",StringComparison.Ordinal))throw new InvalidDataException();
    IntPtr token;if(!OpenProcessToken(process,10,out token))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    RegistryKey root=null;
    try {
      IntPtr kind=Marshal.AllocHGlobal(4);int returned;
      try{if(!GetTokenInformation(token,29,kind,4,out returned)||returned!=4||Marshal.ReadInt32(kind)!=1)throw new InvalidDataException();}finally{Marshal.FreeHGlobal(kind);}
      int length;GetTokenInformation(token,31,IntPtr.Zero,0,out length);if(length<IntPtr.Size||length>4096)throw new InvalidDataException();
      IntPtr info=Marshal.AllocHGlobal(length);
      try{if(!GetTokenInformation(token,31,info,length,out length)||Marshal.ReadIntPtr(info)==IntPtr.Zero||!new SecurityIdentifier(Marshal.ReadIntPtr(info)).Equals(sid))throw new InvalidDataException();}finally{Marshal.FreeHGlobal(info);}
      using(WindowsIdentity.Impersonate(token)){
        IntPtr handle;int hr=GetAppContainerRegistryLocation(0x60019,out handle);if(hr!=0)Marshal.ThrowExceptionForHR(hr);
        var safe=new SafeRegistryHandle(handle,true);try{root=RegistryKey.FromHandle(safe);}catch{safe.Dispose();throw;}
      }
    }finally{CloseHandle(token);}
    using(root){
      var paths=new List<string>();var pending=new Stack<string>();pending.Push("");
      while(pending.Count>0){string path=pending.Pop();if(paths.Count>=256)throw new InvalidDataException();paths.Add(path);
        using(var child=path==""?null:root.OpenSubKey(path,RegistryKeyPermissionCheck.ReadWriteSubTree,RegistryRights.ReadKey|RegistryRights.ChangePermissions)){
          var key=path==""?root:child;if(key==null)throw new InvalidDataException();RestrictRegistry(key,sid);
          foreach(string name in key.GetSubKeyNames())pending.Push(path==""?name:path+"\\"+name);
        }
      }
      foreach(string path in paths)using(var child=path==""?null:root.OpenSubKey(path,RegistryKeyPermissionCheck.ReadSubTree,RegistryRights.ReadKey)){var key=path==""?root:child;if(key==null)throw new InvalidDataException();VerifyRegistry(key,sid);}
    }
  }
  static void Ordinary(string path) {
    for(string current=Path.GetFullPath(path);current!=null;current=Path.GetDirectoryName(current))if((File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException();
  }
  static FileSystemAccessRule Rule(SecurityIdentifier sid,bool directory){return new FileSystemAccessRule(sid,FileSystemRights.ReadAndExecute,directory?InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit:InheritanceFlags.None,PropagationFlags.None,AccessControlType.Allow);}
  static bool Package(SecurityIdentifier sid){return sid.Value.StartsWith("S-1-15-2-",StringComparison.Ordinal)||sid.Value.StartsWith("S-1-15-3-",StringComparison.Ordinal);}
  static void Restrict(FileSystemSecurity acl,SecurityIdentifier sid,bool directory){
    // The native profile's package grant is a critical Allow ACE. Do not rely
    // on a regular deny ACE to override it: replace the package-side grant.
    acl.SetAccessRuleProtection(true,true);var remove=new List<SecurityIdentifier>();
    foreach(FileSystemAccessRule rule in acl.GetAccessRules(true,false,typeof(SecurityIdentifier))){var principal=(SecurityIdentifier)rule.IdentityReference;if(Package(principal))remove.Add(principal);}
    foreach(var principal in remove)acl.PurgeAccessRules(principal);acl.AddAccessRule(Rule(sid,directory));
    // Explicit OWNER RIGHTS suppresses implicit owner WRITE_DAC. The ordinary
    // host's existing user/system grants remain; the package grant is read-only.
    acl.PurgeAccessRules(ownerRights);acl.AddAccessRule(new FileSystemAccessRule(ownerRights,FileSystemRights.ReadPermissions,directory?InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit:InheritanceFlags.None,PropagationFlags.None,AccessControlType.Allow));
  }
  static void Verify(FileSystemSecurity acl,SecurityIdentifier sid,bool directory){
    if(!acl.AreAccessRulesProtected)throw new InvalidDataException();bool read=false,owner=false;
    foreach(FileSystemAccessRule rule in acl.GetAccessRules(true,true,typeof(SecurityIdentifier))){var principal=(SecurityIdentifier)rule.IdentityReference;if((Package(principal)||principal.Equals(ownerRights))&&rule.AccessControlType==AccessControlType.Allow&&(rule.FileSystemRights&denied)!=0)throw new InvalidDataException();if(principal.Equals(sid)&&rule.AccessControlType==AccessControlType.Allow&&(rule.FileSystemRights&FileSystemRights.ReadAndExecute)==FileSystemRights.ReadAndExecute&&rule.InheritanceFlags==(directory?InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit:InheritanceFlags.None)&&rule.PropagationFlags==PropagationFlags.None)read=true;if(principal.Equals(ownerRights)&&rule.AccessControlType==AccessControlType.Allow&&(rule.FileSystemRights&FileSystemRights.ReadPermissions)!=0)owner=true;}
    if(!read||!owner)throw new InvalidDataException();
  }
  public static void Protect(IntPtr rawSid) {
    if(rawSid==IntPtr.Zero)throw new InvalidDataException();var sid=new SecurityIdentifier(rawSid);if(!sid.Value.StartsWith("S-1-15-2-",StringComparison.Ordinal))throw new InvalidDataException();
    IntPtr pointer;int hr=GetAppContainerFolderPath(sid.Value,out pointer);if(hr!=0)Marshal.ThrowExceptionForHR(hr);
    string root;try{root=Path.GetFullPath(Marshal.PtrToStringUni(pointer));}finally{Marshal.FreeCoTaskMem(pointer);}
    Ordinary(root);if(!Directory.Exists(root))throw new InvalidDataException();
    var pending=new Stack<string>();pending.Push(root);var paths=new List<string>();
    while(pending.Count>0){string path=pending.Pop();Ordinary(path);if(paths.Count>=256)throw new InvalidDataException();paths.Add(path);
      bool directory=Directory.Exists(path);
      if(directory){var acl=Directory.GetAccessControl(path);Restrict(acl,sid,true);Directory.SetAccessControl(path,acl);Verify(Directory.GetAccessControl(path),sid,true);foreach(string child in Directory.GetFileSystemEntries(path))pending.Push(child);}
      else {var acl=File.GetAccessControl(path);Restrict(acl,sid,false);File.SetAccessControl(path,acl);Verify(File.GetAccessControl(path),sid,false);}
    }
    foreach(string path in paths){Ordinary(path);if(Directory.Exists(path))Verify(Directory.GetAccessControl(path),sid,true);else Verify(File.GetAccessControl(path),sid,false);}
  }
}
