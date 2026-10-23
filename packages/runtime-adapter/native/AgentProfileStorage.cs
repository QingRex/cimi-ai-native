using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;

// Called only after this controller successfully creates its fresh Profile and
// before any child exists. No CLI path/SID input, old Profile adoption or delete.
public static class AgentProfileStorage {
  [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int GetAppContainerFolderPath(string sid,out IntPtr path);
  static readonly FileSystemRights denied=FileSystemRights.WriteData|FileSystemRights.AppendData|FileSystemRights.WriteExtendedAttributes|FileSystemRights.WriteAttributes|FileSystemRights.Delete|FileSystemRights.DeleteSubdirectoriesAndFiles|FileSystemRights.ChangePermissions|FileSystemRights.TakeOwnership;
  static readonly SecurityIdentifier ownerRights=new SecurityIdentifier("S-1-3-4");
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
