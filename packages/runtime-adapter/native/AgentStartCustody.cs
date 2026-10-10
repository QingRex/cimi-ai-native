using System;
using System.IO;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Text;

// Fixed host-only custody helper. Never reads credentials or emits a SID/path.
// Existing original host directory/SQLite ACL rules are retained byte-for-rule.
public static class AgentStartCustody {
  private static bool Ordinary(string path) {
    for(var current=new DirectoryInfo(Path.GetFullPath(path));current!=null;current=current.Parent)
      if(current.Exists&&(current.Attributes&FileAttributes.ReparsePoint)!=0)return false;
    return true;
  }
  public static int Main(string[] args) {
    try {
      if(args.Length!=2||(args[0]!="identity"&&args[0]!="protect"&&args[0]!="verify"))return 2;
      string root=Path.GetFullPath(args[1]);if(!Ordinary(root))return 2;
      using(var user=WindowsIdentity.GetCurrent()){
        var sid=user.User;if(sid==null)return 2;
        if(args[0]=="protect"){
          var acl=new DirectorySecurity();acl.SetAccessRuleProtection(true,false);acl.SetOwner(sid);
          acl.AddAccessRule(new FileSystemAccessRule(sid,FileSystemRights.FullControl,
            InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
          Directory.SetAccessControl(root,acl);
        }
        if(args[0]!="identity"){
          if(!Directory.Exists(root))return 2;
          var acl=Directory.GetAccessControl(root);
          var rules=acl.GetAccessRules(true,true,typeof(SecurityIdentifier));
          if(!acl.AreAccessRulesProtected||acl.GetOwner(typeof(SecurityIdentifier)).Value!=sid.Value||rules.Count!=1)return 2;
          var rule=rules[0] as FileSystemAccessRule;
          if(rule==null||rule.IdentityReference.Value!=sid.Value||rule.AccessControlType!=AccessControlType.Allow||
            rule.FileSystemRights!=FileSystemRights.FullControl||rule.InheritanceFlags!=(InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit)||
            rule.PropagationFlags!=PropagationFlags.None||rule.IsInherited)return 2;
          foreach(string name in new[]{"starts.sqlite","starts.sqlite-wal","starts.sqlite-shm","starts.sqlite-journal",
            "account.sqlite","account.sqlite-wal","account.sqlite-shm","account.sqlite-journal", "billing.sqlite", "billing.sqlite-wal", "billing.sqlite-shm", "billing.sqlite-journal"}){
            string path=Path.Combine(root,name);
            if(!File.Exists(path))continue;
            if((File.GetAttributes(path)&FileAttributes.ReparsePoint)!=0)return 2;
            var file=File.GetAccessControl(path);rules=file.GetAccessRules(true,true,typeof(SecurityIdentifier));
            if(file.AreAccessRulesProtected||file.GetOwner(typeof(SecurityIdentifier)).Value!=sid.Value||rules.Count!=1)return 2;
            rule=rules[0] as FileSystemAccessRule;
            if(rule==null||!rule.IsInherited||rule.IdentityReference.Value!=sid.Value||rule.AccessControlType!=AccessControlType.Allow||
              rule.FileSystemRights!=FileSystemRights.FullControl)return 2;
          }
        }
        using(var hash=SHA256.Create())
          Console.Write(BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(sid.Value))).Replace("-","").ToLowerInvariant());
        return 0;
      }
    }catch{return 2;}
  }
}
