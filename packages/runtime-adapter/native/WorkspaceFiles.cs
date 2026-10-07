// Trusted host file broker. Never granted to the AppContainer or selected by
// Runtime input. Existing files only; no shell, creation, rename or network.
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using System.Text.RegularExpressions;
using System.Security.AccessControl;
using Microsoft.Win32.SafeHandles;

class WorkspaceFiles {
  [StructLayout(LayoutKind.Sequential)] struct FILETIME { public uint low,high; }
  [StructLayout(LayoutKind.Sequential)] struct FILEINFO { public uint attributes; public FILETIME creation,access,write; public uint volume,sizeHigh,sizeLow,links,indexHigh,indexLow; }
  [StructLayout(LayoutKind.Sequential)] struct OVERLAPPED { public IntPtr Internal,InternalHigh; public uint Offset,OffsetHigh; public IntPtr Event; }
  [StructLayout(LayoutKind.Sequential)] struct DISPOSITION { public byte deleteFile; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFile(string path,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle,out FILEINFO info);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandle(SafeFileHandle handle,StringBuilder path,uint size,uint flags);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint GetFileType(SafeFileHandle handle);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern uint GetDriveType(string root);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetVolumeInformation(string root,StringBuilder volume,uint volumeSize,out uint serial,out uint maxComponent,out uint flags,StringBuilder filesystem,uint filesystemSize);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr process,out FILETIME creation,out FILETIME exit,out FILETIME kernel,out FILETIME user);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool LockFileEx(SafeFileHandle file,uint flags,uint reserved,uint low,uint high,ref OVERLAPPED overlapped);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ReplaceFile(string target,string replacement,string backup,uint flags,IntPtr exclude,IntPtr reserved);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle handle,int kind,ref DISPOSITION information,uint size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder image,ref int size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
  static readonly JavaScriptSerializer json=new JavaScriptSerializer { MaxJsonLength=262144,RecursionLimit=32 };
  class Denied : Exception { public readonly string reason; public Denied(string value) { reason=value; } }
  static void Require(bool value,string reason) { if(!value) throw new Denied(reason); }
  static string Sha(byte[] bytes) { using(var hash=SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-","").ToLowerInvariant(); }
  static string Frame(int maximum) {
    var input=Console.OpenStandardInput(); using(var bytes=new MemoryStream()) {
      while(true) { int value=input.ReadByte(); if(value<0) throw new Denied("workspace_parent_ended"); if(value==10) break;
        Require(bytes.Length<maximum,"workspace_frame_limit"); bytes.WriteByte((byte)value); }
      return new UTF8Encoding(false,true).GetString(bytes.ToArray());
    }
  }
  static void Emit(object value) { Console.WriteLine(json.Serialize(value)); Console.Out.Flush(); }
  static Dictionary<string,object> Obj(object value) { var result=value as Dictionary<string,object>; Require(result!=null,"workspace_contract_invalid"); return result; }
  static string Str(Dictionary<string,object> value,string key) { Require(value.ContainsKey(key)&&value[key] is string,"workspace_contract_invalid"); return (string)value[key]; }
  static void Keys(Dictionary<string,object> value,params string[] names) { Require(value.Count==names.Length,"workspace_contract_invalid"); foreach(string name in names) Require(value.ContainsKey(name),"workspace_contract_invalid"); }
  static string Hex(Dictionary<string,object> value,string key,int length) { string result=Str(value,key); Require(Regex.IsMatch(result,"^[a-f0-9]{"+length+"}$"),"workspace_contract_invalid"); return result; }
  static Dictionary<string,object> Id(FILEINFO info) { return new Dictionary<string,object> { {"volume_serial",info.volume.ToString("x8")},{"file_index",(((ulong)info.indexHigh<<32)|info.indexLow).ToString("x16")} }; }
  static bool SameId(Dictionary<string,object> a,Dictionary<string,object> b) { Keys(a,"volume_serial","file_index"); return Hex(a,"volume_serial",8)==(string)b["volume_serial"]&&Hex(a,"file_index",16)==(string)b["file_index"]; }
  static string Final(SafeFileHandle handle) { var path=new StringBuilder(32768); uint count=GetFinalPathNameByHandle(handle,path,(uint)path.Capacity,0);
    Require(count>0&&count<path.Capacity,"workspace_handle_path_unproven"); string result=path.ToString(); Require(result.StartsWith("\\\\?\\",StringComparison.Ordinal),"workspace_handle_path_unproven"); return result.Substring(4); }
  static FILEINFO Info(SafeFileHandle handle,bool directory) { FILEINFO info=new FILEINFO();
    Require(GetFileType(handle)==1&&GetFileInformationByHandle(handle,out info),"workspace_handle_unproven");
    Require((info.attributes&0x400)==0&&((info.attributes&0x10)!=0)==directory,"workspace_link_or_type_denied"); return info; }
  static SafeFileHandle Open(string path,bool directory,bool write,uint share=1) {
    // OPEN_REPARSE_POINT + BACKUP_SEMANTICS; no write/delete sharing. Hold each
    // ancestor until the operation ends, preventing a directory rename/swap.
    var handle=CreateFile(path,directory?0x80u:write?0xc0000000u:0x80000000u,share,IntPtr.Zero,3,0x00200000|0x02000000,IntPtr.Zero);
    if(handle.IsInvalid) { handle.Dispose(); throw new Denied("workspace_handle_open_denied"); }
    try { Info(handle,directory); Require(String.Equals(Final(handle),path,StringComparison.OrdinalIgnoreCase),"workspace_handle_path_unproven"); return handle; }
    catch { handle.Dispose(); throw; }
  }
  static List<SafeFileHandle> Anchor(string root) {
    Require(Regex.IsMatch(root,"^[A-Za-z]:\\\\")&&!root.StartsWith("\\\\")&&Path.GetFullPath(root)==root,"workspace_root_invalid");
    string volume=Path.GetPathRoot(root); Require(GetDriveType(volume)==3,"workspace_volume_unsupported");
    uint serial,maxComponent,flags; var fs=new StringBuilder(32);
    Require(GetVolumeInformation(volume,null,0,out serial,out maxComponent,out flags,fs,(uint)fs.Capacity)&&fs.ToString()=="NTFS","workspace_volume_unsupported");
    var handles=new List<SafeFileHandle>();
    try { handles.Add(Open(volume,true,false)); string current=volume;
      foreach(string part in root.Substring(volume.Length).Split(new char[] {'\\'},StringSplitOptions.RemoveEmptyEntries)) { current=Path.Combine(current,part); handles.Add(Open(current,true,false)); }
      return handles;
    } catch { foreach(var handle in handles) handle.Dispose(); throw; }
  }
  static string[] Parts(string path) {
    Require(path.Length>0&&path.Length<=1024&&!Regex.IsMatch(path,"[\\\\:%*?\\x00-\\x1f]"),"workspace_resource_invalid"); var parts=path.Split('/');
    foreach(string part in parts) Require(part.Length>0&&part!="."&&part!=".."&&part==part.Trim()&&!part.EndsWith(".")&&part.ToLowerInvariant()!=".git"&&part.ToLowerInvariant()!=".cimiloop"&&
      !Regex.IsMatch(part,"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\.|$)",RegexOptions.IgnoreCase),"workspace_resource_invalid"); return parts;
  }
  static byte[] Read(FileStream stream) { Require(stream.Length<=16384,"workspace_file_limit"); stream.Position=0; var bytes=new byte[(int)stream.Length]; int at=0;
    while(at<bytes.Length) { int count=stream.Read(bytes,at,bytes.Length-at); Require(count>0,"workspace_read_incomplete"); at+=count; }
    new UTF8Encoding(false,true).GetString(bytes); return bytes;
  }
  static Dictionary<string,object> Worker() { var process=Process.GetCurrentProcess(); FILETIME created,exit,kernel,user;
    Require(GetProcessTimes(process.Handle,out created,out exit,out kernel,out user),"workspace_worker_identity_unproven");
    return new Dictionary<string,object> { {"pid",process.Id},{"creation_ticks",(((ulong)created.high<<32)|created.low).ToString()},{"image",process.MainModule.FileName} }; }
  static string OwnerState(Dictionary<string,object> owner) {
    Keys(owner,"pid","creation_ticks","image"); int pid=Convert.ToInt32(owner["pid"]); string ticks=Str(owner,"creation_ticks"),image=Str(owner,"image");
    Require(pid>0&&Regex.IsMatch(ticks,"^[1-9][0-9]{0,19}$")&&Path.IsPathRooted(image),"workspace_recovery_owner_unproven");
    var process=OpenProcess(0x1000|0x100000,false,pid);
    if(process==IntPtr.Zero) return Marshal.GetLastWin32Error()==87?"absent":"unknown";
    try { FILETIME created,exit,kernel,user;
      if(!GetProcessTimes(process,out created,out exit,out kernel,out user)) return "unknown";
      if((((ulong)created.high<<32)|created.low).ToString()!=ticks) return "absent";
      uint state=WaitForSingleObject(process,0); if(state==0) return "absent"; if(state!=0x102) return "unknown";
      var actual=new StringBuilder(32768); int size=actual.Capacity;
      if(!QueryFullProcessImageName(process,0,actual,ref size)||!String.Equals(Path.GetFullPath(actual.ToString()),Path.GetFullPath(image),StringComparison.OrdinalIgnoreCase)) return "unknown";
      return "active";
    } finally { CloseHandle(process); }
  }
  static void OwnersAbsent(Dictionary<string,object> owner,Dictionary<string,object> worker) {
    string host=OwnerState(owner),native=OwnerState(worker);
    Require(host!="active"&&native!="active","workspace_recovery_owner_active");
    Require(host=="absent"&&native=="absent","workspace_recovery_owner_unproven");
  }
  static void Reclaim(Dictionary<string,object> config,string nonce,List<SafeFileHandle> handles) {
    string root=Str(config,"root"); handles.AddRange(Anchor(root));
    byte[] bytes=Convert.FromBase64String(Str(config,"preparation_base64")); Require(bytes.Length<=114688,"workspace_frame_limit");
    var proof=Obj(json.DeserializeObject(new UTF8Encoding(false,true).GetString(bytes)));
    Keys(proof,"format","phase","nonce","input_digest","root_identity","file_identity","replacement_identity","before_digest","worker");
    Require(Str(proof,"format")=="cimiloop/workspace-native/1.0.0"&&Str(proof,"phase")=="prepared","workspace_recovery_contract_invalid");
    string originalNonce=Str(proof,"nonce"); Require(Regex.IsMatch(originalNonce,"^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$"),"workspace_recovery_contract_invalid");
    var owner=Obj(config["owner"]); var worker=Obj(proof["worker"]); OwnersAbsent(owner,worker);
    object identity=proof["replacement_identity"]; string status="not_applicable";
    if(identity!=null) {
      var expected=Obj(identity); Hex(expected,"volume_serial",8); Hex(expected,"file_index",16); Keys(expected,"volume_serial","file_index");
      string image=Str(worker,"image"),build=Path.GetDirectoryName(image);
      Require(String.Equals(Path.GetFullPath(image),image,StringComparison.OrdinalIgnoreCase)&&Path.GetFileName(image)=="WorkspaceFiles.exe"&&
        String.Equals(Path.GetDirectoryName(build),root,StringComparison.OrdinalIgnoreCase)&&Regex.IsMatch(Path.GetFileName(build),"^workspace-[a-f0-9]{64}$"),"workspace_recovery_scope_denied");
      // Only the original source-addressed private build directory and nonce
      // name are eligible. Missing paths are observed; nothing is recreated.
      var directory=CreateFile(build,0x80,1,IntPtr.Zero,3,0x00200000|0x02000000,IntPtr.Zero);
      if(directory.IsInvalid) { int error=Marshal.GetLastWin32Error(); directory.Dispose(); Require(error==2||error==3,"workspace_recovery_directory_denied"); status="absent"; }
      else {
        handles.Add(directory); Info(directory,true); Require(String.Equals(Final(directory),build,StringComparison.OrdinalIgnoreCase),"workspace_recovery_scope_denied");
        string target=Path.Combine(build,"workspace-"+originalNonce+".tmp");
        var file=CreateFile(target,0x10000|0x80,1,IntPtr.Zero,3,0x00200000|0x02000000,IntPtr.Zero);
        if(file.IsInvalid) { int error=Marshal.GetLastWin32Error(); file.Dispose(); Require(error==2||error==3,"workspace_recovery_file_denied"); status="absent"; }
        else using(file) {
          var info=Info(file,false);
          Require(info.links==1&&SameId(expected,Id(info))&&info.volume==Info(handles[handles.Count-1],true).volume&&
            String.Equals(Final(file),target,StringComparison.OrdinalIgnoreCase),"workspace_recovery_identity_denied");
          OwnersAbsent(owner,worker); var disposition=new DISPOSITION { deleteFile=1 };
          Require(SetFileInformationByHandle(file,4,ref disposition,1),"workspace_recovery_delete_denied"); status="removed";
        }
      }
    }
    Emit(new { format="cimiloop/workspace-native/1.0.0",phase="reclaimed",nonce=nonce,preparation_digest=Sha(bytes),replacement_identity=identity,status=status });
  }
  static int Main() {
    Console.OutputEncoding=new UTF8Encoding(false); string nonce=null,candidatePath=null; bool installed=false; var handles=new List<SafeFileHandle>();
    try {
      var config=Obj(json.DeserializeObject(Frame(262144))); string mode=Str(config,"mode");
      Keys(config,mode=="inspect"?new string[] {"mode","nonce","root"}:mode=="reclaim"?new string[] {"mode","nonce","root","preparation_base64","owner"}:new string[] {"mode","nonce","root","root_identity","request_base64"});
      nonce=Str(config,"nonce"); Require(Regex.IsMatch(nonce,"^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$"),"workspace_contract_invalid");
      if(mode=="reclaim") { Reclaim(config,nonce,handles); return 0; }
      string root=Str(config,"root"); handles=Anchor(root); var rootId=Id(Info(handles[handles.Count-1],true));
      if(mode=="inspect") { Emit(new { format="cimiloop/workspace-native/1.0.0",phase="root",nonce=nonce,root_identity=rootId }); return 0; }
      Require(mode=="prepare"&&SameId(Obj(config["root_identity"]),rootId),"workspace_root_identity_changed");
      byte[] inputBytes=Convert.FromBase64String(Str(config,"request_base64")); Require(inputBytes.Length<=114688,"workspace_frame_limit");
      var input=Obj(json.DeserializeObject(new UTF8Encoding(false,true).GetString(inputBytes))); string tool=Str(input,"tool"),path=Str(input,"path"),expected=Hex(input,"expected_digest",64);
      Require(Str(input,"format")=="cimiloop/workspace-tool-invocation/1.0.0"&&(tool=="read_file"||tool=="replace_file"),"workspace_contract_invalid");
      Keys(input,tool=="read_file"?new string[] {"format","project_id","run_id","operation_key","executor_actor_id","context_digest","call_id","tool","path","expected_digest"}:
        new string[] {"format","project_id","run_id","operation_key","executor_actor_id","context_digest","call_id","tool","path","expected_digest","replacement_utf8"});
      var parts=Parts(path); string current=root;
      for(int i=0;i<parts.Length-1;i++) { current=Path.Combine(current,parts[i]); handles.Add(Open(current,true,false)); }
      string target=Path.Combine(current,parts[parts.Length-1]); bool replacing=tool=="replace_file";
      // Replacement never writes the original inode. ReplaceFile needs delete
      // sharing; a shared byte-range lock denies ordinary competing data writes.
      var file=Open(target,false,false,replacing?7u:1u); handles.Add(file); FILEINFO info=Info(file,false);
      if(replacing) { var range=new OVERLAPPED(); Require(LockFileEx(file,1,0,uint.MaxValue,0,ref range),"workspace_data_lock_denied"); }
      Require(info.links==1&&info.sizeHigh==0&&info.sizeLow<=16384,"workspace_file_identity_denied");
      var fileId=Id(info); Require(fileId["volume_serial"].Equals(rootId["volume_serial"]),"workspace_volume_changed");
      using(var stream=new FileStream(new SafeFileHandle(file.DangerousGetHandle(),false),FileAccess.Read)) {
        byte[] before=Read(stream); Require(Sha(before)==expected,"workspace_preimage_changed"); byte[] replacement=null;
        SafeFileHandle candidate=null; Dictionary<string,object> candidateId=null;
        if(replacing) {
          replacement=new UTF8Encoding(false,true).GetBytes(Str(input,"replacement_utf8")); Require(replacement.Length<=16384,"workspace_file_limit");
          string privateRoot=Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName); handles.AddRange(Anchor(privateRoot));
          candidatePath=Path.Combine(privateRoot,"workspace-"+nonce+".tmp"); candidate=CreateFile(candidatePath,0xc0000000u,1,IntPtr.Zero,1,0x00200000|0x02000000,IntPtr.Zero);
          Require(!candidate.IsInvalid,"workspace_candidate_denied"); handles.Add(candidate); FILEINFO candidateInfo=Info(candidate,false);
          Require(candidateInfo.links==1&&candidateInfo.volume==info.volume,"workspace_candidate_denied"); candidateId=Id(candidateInfo);
          // The empty staging file must not inherit a broader access policy
          // before content is written. ReplaceFile preserves target metadata.
          var security=File.GetAccessControl(target,AccessControlSections.Access); security.SetAccessRuleProtection(true,true); File.SetAccessControl(candidatePath,security);
        }
        var proof=new Dictionary<string,object> { {"format","cimiloop/workspace-native/1.0.0"},{"phase","prepared"},{"nonce",nonce},{"input_digest",Sha(inputBytes)},
          {"root_identity",rootId},{"file_identity",fileId},{"replacement_identity",candidateId},{"before_digest",expected},{"worker",Worker()} };
        Emit(proof); Require(Frame(128)=="commit:"+nonce,"workspace_commit_denied");
        Require(Sha(Read(stream))==expected&&SameId(fileId,Id(Info(file,false)))&&Info(file,false).links==1&&String.Equals(Final(file),target,StringComparison.OrdinalIgnoreCase),"workspace_preimage_changed");
        byte[] after; Dictionary<string,object> afterId;
        if(replacing) {
          // The candidate is host-private and its identity is durable before
          // dispatch. Closing it is required by ReplaceFile's sharing mode.
          using(var staged=new FileStream(new SafeFileHandle(candidate.DangerousGetHandle(),false),FileAccess.ReadWrite)) {
            Require(Info(candidate,false).links==1&&SameId(candidateId,Id(Info(candidate,false))),"workspace_candidate_denied");
            staged.Write(replacement,0,replacement.Length); staged.SetLength(replacement.Length); staged.Flush(true);
            Require(Sha(Read(staged))==Sha(replacement),"workspace_postimage_unproven");
          }
          candidate.Dispose();
          using(var currentFile=Open(target,false,false,7)) Require(SameId(fileId,Id(Info(currentFile,false))),"workspace_preimage_changed");
          Require(ReplaceFile(target,candidatePath,null,0,IntPtr.Zero,IntPtr.Zero),"workspace_replace_denied"); installed=true;
          using(var installedFile=Open(target,false,false)) using(var installedStream=new FileStream(new SafeFileHandle(installedFile.DangerousGetHandle(),false),FileAccess.Read)) {
            Require(Info(installedFile,false).links==1&&SameId(candidateId,Id(Info(installedFile,false))),"workspace_postimage_unproven"); afterId=Id(Info(installedFile,false)); after=Read(installedStream);
          }
        } else { after=Read(stream); afterId=fileId; }
        Require(replacement==null?Sha(after)==expected:Sha(after)==Sha(replacement),"workspace_postimage_unproven");
        proof["phase"]="completed"; proof["after_digest"]=Sha(after); proof["after_file_identity"]=afterId; proof["text"]=replacement==null?(object)new UTF8Encoding(false,true).GetString(after):null;
        Emit(proof); return 0;
      }
    } catch(Denied ex) { Emit(new { format="cimiloop/workspace-native/1.0.0",phase="denied",nonce=nonce,reason=ex.reason }); return 21; }
    catch { Emit(new { format="cimiloop/workspace-native/1.0.0",phase="denied",nonce=nonce,reason="workspace_native_unproven" }); return 21; }
    finally { foreach(var handle in handles) handle.Dispose(); if(candidatePath!=null&&!installed) { try { File.Delete(candidatePath); } catch { /* Keep an unproven private residue, never alter the worktree. */ } } }
  }
}
