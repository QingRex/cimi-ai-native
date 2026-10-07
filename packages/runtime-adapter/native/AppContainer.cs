// Trusted Windows controller. Never compiled or loaded from model output.
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Collections.Generic;
using System.Net.Sockets;
using System.Net;
using System.Threading;
using System.Web.Script.Serialization;

partial class AppContainer {
  [StructLayout(LayoutKind.Sequential)] struct STARTUPINFO { public int cb; public IntPtr reserved,desktop,title; public int x,y,xSize,ySize,xChars,yChars,fill,flags; public short show,reserved2; public IntPtr reservedPtr,input,output,error; }
  [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO info; public IntPtr attributes; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESSINFO { public IntPtr process,thread; public int pid,tid; }
  [StructLayout(LayoutKind.Sequential)] struct SIDATTR { public IntPtr sid; public int attributes; }
  [StructLayout(LayoutKind.Sequential)] struct CAPS { public IntPtr sid,capabilities; public int count,reserved; }
  [StructLayout(LayoutKind.Sequential)] struct BASICLIMIT { public long perProcess,perJob; public uint flags; public UIntPtr min,max; public uint active; public UIntPtr affinity; public uint priority,scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct IOCOUNTERS { public ulong readOps,writeOps,otherOps,readBytes,writeBytes,otherBytes; }
  [StructLayout(LayoutKind.Sequential)] struct JOBLIMIT { public BASICLIMIT basic; public IOCOUNTERS io; public UIntPtr processMem,jobMem,peakProcess,peakJob; }
  [DllImport("userenv.dll", CharSet=CharSet.Unicode)] static extern int CreateAppContainerProfile(string name,string display,string desc,IntPtr caps,uint count,out IntPtr sid);
  [DllImport("userenv.dll", CharSet=CharSet.Unicode)] static extern int DeleteAppContainerProfile(string name);
  [DllImport("advapi32.dll")] static extern IntPtr FreeSid(IntPtr sid);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool ConvertStringSidToSid(string text,out IntPtr sid);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr pointer);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder command,IntPtr processAttr,IntPtr threadAttr,bool inherit,uint flags,IntPtr env,string cwd,ref STARTUPINFOEX startup,out PROCESSINFO process);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int type,ref JOBLIMIT info,int size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateJobObject(IntPtr job,uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int number);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool DefineDosDevice(uint flags,string name,string target);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern uint QueryDosDevice(string name,StringBuilder target,int size);
  [StructLayout(LayoutKind.Sequential)] struct FILETIME { public uint low,high; }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr process,out FILETIME creation,out FILETIME exit,out FILETIME kernel,out FILETIME user);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder image,ref int size);
  [DllImport("userenv.dll", CharSet=CharSet.Unicode)] static extern int DeriveAppContainerSidFromAppContainerName(string name,out IntPtr sid);
  static JavaScriptSerializer serializer=new JavaScriptSerializer();
  static string ownershipPath,ownershipNonce,ownedRoot,ownedBinary,ownedMode,ownedProfile,ownedMapping,ownedNetworkMode;
  static Dictionary<string,object> nativeIdentity,runtimeIdentity;
  static bool resourcesDisposed=false;
  static void Atomic(string path,string content) {
    using(var stream=new FileStream(path+".new",FileMode.Create,FileAccess.Write,FileShare.None)) { byte[] bytes=new UTF8Encoding(false).GetBytes(content); stream.Write(bytes,0,bytes.Length); stream.Flush(true); }
    if(File.Exists(path)) File.Replace(path+".new",path,null); else File.Move(path+".new",path);
  }
  static string Creation(IntPtr handle) { FILETIME created,ended,kernel,user; Check(GetProcessTimes(handle,out created,out ended,out kernel,out user)); return (((ulong)created.high<<32)|created.low).ToString(); }
  static string Image(IntPtr handle) { var buffer=new StringBuilder(32768); int size=buffer.Capacity; Check(QueryFullProcessImageName(handle,0,buffer,ref size)); return buffer.ToString(); }
  static Dictionary<string,object> Identity(int pid) {
    var handle=OpenProcess(0x1000|0x100000,false,pid); if(handle==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    try { return new Dictionary<string,object> { {"pid",pid},{"creation_ticks",Creation(handle)},{"image",Image(handle)} }; } finally { CloseHandle(handle); }
  }
  static string InspectIdentity(Dictionary<string,object> identity) {
    if(identity==null) return "absent";
    int pid=Convert.ToInt32(identity["pid"]); if(pid<=0) throw new Exception("Invalid identity");
    var handle=OpenProcess(0x1000|0x100000,false,pid);
    if(handle==IntPtr.Zero) return Marshal.GetLastWin32Error()==87?"absent":"unknown";
    try {
      if(Creation(handle)!=(string)identity["creation_ticks"]) return "absent";
      // A retained kernel process object remains queryable after exit, while its
      // image query can fail. A signalled handle with the original creation time
      // proves that original process ended; query the image only while active.
      uint state=WaitForSingleObject(handle,0);
      if(state==0) return "absent";
      if(state!=0x102) return "unknown";
      if(!String.Equals(Path.GetFullPath(Image(handle)),Path.GetFullPath((string)identity["image"]),StringComparison.OrdinalIgnoreCase)) return "unknown";
      return "active";
    } finally { CloseHandle(handle); }
  }
  static void SaveOwnership() {
    if(ownershipPath==null) return;
    Atomic(ownershipPath,serializer.Serialize(new Dictionary<string,object> {
      {"format","cimiloop/native-ownership/1.0.0"},{"nonce",ownershipNonce},{"root",ownedRoot},{"binary",ownedBinary},{"mode",ownedMode},
      {"profile",ownedProfile},{"mapping",ownedMapping},{"native_identity",nativeIdentity},{"runtime_identity",runtimeIdentity},
      {"job_assignment","atomic_on_create"},{"resources_disposed",resourcesDisposed},{"network_mode",ownedNetworkMode},{"transport_granted",ownedTransportGranted},{"transport_write_attributes",ownedTransportWriteAttributes} }));
  }
  static void Ordinary(string path) {
    for(string current=Path.GetFullPath(path);current!=null;current=Path.GetDirectoryName(current))
      if((File.Exists(current)||Directory.Exists(current))&&(File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0) throw new Exception("Linked path");
  }
  static Dictionary<string,object> ObjectAt(string path) { Ordinary(path); var file=new FileInfo(path); if(!file.Exists||file.Length>65536) throw new Exception("Invalid owner file"); return serializer.Deserialize<Dictionary<string,object>>(File.ReadAllText(path)); }
  static void RemoveGrant(string path,SecurityIdentifier principal,FileSystemRights rights,bool directory,bool inherit) {
    Ordinary(path); var rule=new FileSystemAccessRule(principal,rights,inherit?InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit:InheritanceFlags.None,PropagationFlags.None,AccessControlType.Allow);
    if(directory) { if(!Directory.Exists(path)) return; var acl=Directory.GetAccessControl(path); acl.RemoveAccessRuleSpecific(rule); Directory.SetAccessControl(path,acl); }
    else { if(!File.Exists(path)) return; var acl=File.GetAccessControl(path); acl.RemoveAccessRuleSpecific(rule); File.SetAccessControl(path,acl); }
  }
  static int Recover(string root,string ledgerPath,string nonce,string binary,string mode,string launcher) {
    Guid guid; if(!Guid.TryParseExact(nonce,"D",out guid)) { Console.WriteLine("{\"outcome\":\"unknown\",\"reason\":\"ownership_nonce_invalid\",\"resources_disposed\":false}"); return 12; }
    using(var mutex=new Mutex(false,"Local\\CimiLoop.Recovery."+guid.ToString("N"))) {
      bool locked=false;
      try {
        try { locked=mutex.WaitOne(5000); } catch(AbandonedMutexException) { locked=true; }
        if(!locked) { Console.WriteLine("{\"outcome\":\"unknown\",\"reason\":\"recovery_busy\",\"resources_disposed\":false}"); return 12; }
        return RecoverOwned(root,ledgerPath,nonce,binary,mode,launcher);
      } finally { if(locked) mutex.ReleaseMutex(); }
    }
  }
  static int RecoverOwned(string root,string ledgerPath,string nonce,string binary,string mode,string launcher) {
    string outcome="unknown",reason="ownership_record_invalid"; bool disposed=false;
    try {
      root=Path.GetFullPath(root); binary=Path.GetFullPath(binary); Ordinary(root); Ordinary(binary);
      if(Path.GetFullPath(ledgerPath)!=Path.Combine(Path.GetDirectoryName(root),"native-ownership.json")) throw new Exception("Invalid ledger path");
      var ledger=ObjectAt(ledgerPath); Guid guid; if(!Guid.TryParseExact(nonce,"D",out guid)) throw new Exception("Invalid nonce");
      string profile="CimiLoop."+guid.ToString("N");
      if((string)ledger["format"]!="cimiloop/native-ownership/1.0.0"||(string)ledger["nonce"]!=nonce||(string)ledger["root"]!=root||
        (string)ledger["binary"]!=binary||(string)ledger["profile"]!=profile||(string)ledger["job_assignment"]!="atomic_on_create"||
        (string)ledger["mode"]!=mode||(mode!="read"&&mode!="write")) throw new Exception("Ownership mismatch");
      var native=(Dictionary<string,object>)ledger["native_identity"];
      if(!String.Equals((string)native["image"],launcher,StringComparison.OrdinalIgnoreCase)) throw new Exception("Launcher mismatch");
      var supervisor=ObjectAt(Path.Combine(Path.GetDirectoryName(root),"supervisor.json"));
      if((string)supervisor["nonce"]!=nonce) throw new Exception("Supervisor mismatch");
      var runtime=ledger["runtime_identity"] as Dictionary<string,object>;
      if(runtime!=null&&!String.Equals((string)runtime["image"],binary,StringComparison.OrdinalIgnoreCase)) throw new Exception("Runtime mismatch");
      string nativeState=InspectIdentity(native),supervisorState=InspectIdentity((Dictionary<string,object>)supervisor["identity"]),runtimeState=InspectIdentity(runtime);
      if(nativeState=="active"||supervisorState=="active"||runtimeState=="active") { outcome="active"; reason="owned_process_still_active"; }
      else if(nativeState!="absent"||supervisorState!="absent"||runtimeState!="absent") reason="process_identity_unproven";
      else if(ledger["resources_disposed"] is bool && (bool)ledger["resources_disposed"]) {
        // The original controller already disposed the mapping. Its old drive
        // letter can now belong to another operation and must remain untouched.
        disposed=true; outcome="recovered"; reason="owned_resources_already_disposed";
      }
      else {
        string mapping=ledger["mapping"] as string;
        if(mapping!=null) {
          if(mapping.Length!=2||mapping[0]<'F'||mapping[0]>'Z'||mapping[1]!=':') throw new Exception("Invalid mapping");
          var target=new StringBuilder(4096); uint found=QueryDosDevice(mapping,target,target.Capacity);
          if(found!=0) {
            if(target.ToString()!="\\??\\"+root) { reason="drive_ownership_mismatch"; throw new Exception("Other drive owner"); }
            Check(DefineDosDevice(1|2|4|8,mapping,"\\??\\"+root));
          } else if(Marshal.GetLastWin32Error()!=2) throw new Exception("Mapping observation failed");
        }
        IntPtr sid; int hr=DeriveAppContainerSidFromAppContainerName(profile,out sid); if(hr!=0) Marshal.ThrowExceptionForHR(hr);
        try {
          var principal=new SecurityIdentifier(sid);
          RemoveGrant(root,principal,FileSystemRights.ReadAttributes|FileSystemRights.Traverse,true,false);
          RemoveGrant(Path.Combine(root,"workspace"),principal,(string)ledger["mode"]=="write"?FileSystemRights.Modify:FileSystemRights.ReadAndExecute,true,true);
          RemoveGrant(Path.Combine(root,"state"),principal,FileSystemRights.Modify,true,true);
          RemoveGrant(binary,principal,FileSystemRights.ReadAndExecute,false,false);
          if(ledger.ContainsKey("transport_granted")&&ledger["transport_granted"] is bool&&(bool)ledger["transport_granted"])
            RemoveGrant(Path.Combine(root,"transport"),principal,FileSystemRights.ReadAndExecute|(ledger.ContainsKey("transport_write_attributes")&&ledger["transport_write_attributes"] is bool&&(bool)ledger["transport_write_attributes"]?FileSystemRights.WriteAttributes:0),true,true);
          int deleted=DeleteAppContainerProfile(profile); if(deleted!=0&&deleted!=unchecked((int)0x80070002)&&deleted!=unchecked((int)0x80070003)) Marshal.ThrowExceptionForHR(deleted);
        } finally { FreeSid(sid); }
        ledger["resources_disposed"]=true; Atomic(ledgerPath,serializer.Serialize(ledger)); disposed=true; outcome="recovered"; reason="owned_resources_disposed";
      }
    } catch { if(reason=="ownership_record_invalid") reason="ownership_or_cleanup_unproven"; }
    Console.WriteLine(serializer.Serialize(new { outcome=outcome,reason=reason,resources_disposed=disposed })); return outcome=="unknown"?12:0;
  }
  class Usage { public long bytes,entries,largest; public string reason="within_limits"; }
  static Usage ObserveDisk(string root,Dictionary<string,object> limits) {
    var usage=new Usage(); var pending=new Stack<string>(); pending.Push(Path.Combine(root,"state")); pending.Push(Path.Combine(root,"workspace"));
    try {
      while(pending.Count>0) {
        string dir=pending.Pop(); if((File.GetAttributes(dir)&FileAttributes.ReparsePoint)!=0) throw new Exception("Linked output");
        foreach(string entry in Directory.EnumerateFileSystemEntries(dir)) {
          if((File.GetAttributes(entry)&FileAttributes.ReparsePoint)!=0) throw new Exception("Linked output");
          usage.entries++;
          if(usage.entries>Convert.ToInt64(limits["max_sandbox_entries"])) { usage.reason="sandbox_entries"; return usage; }
          if(Directory.Exists(entry)) pending.Push(entry);
          else { long size=new FileInfo(entry).Length; usage.bytes=checked(usage.bytes+size); usage.largest=Math.Max(usage.largest,size); }
          if(usage.largest>Convert.ToInt64(limits["max_file_bytes"])) { usage.reason="file_bytes"; return usage; }
          if(usage.bytes>Convert.ToInt64(limits["max_sandbox_bytes"])) { usage.reason="sandbox_bytes"; return usage; }
        }
      }
    } catch { usage.reason="observation_unavailable"; }
    return usage;
  }
  static void ResourceProof(string root,Dictionary<string,object> limits,Usage usage) {
    Atomic(Path.Combine(Path.GetDirectoryName(root),"resource-proof.json"),serializer.Serialize(new {
      schema_version="2.0.0",scope="isolated_provider_probe",operation_key=Path.GetFileName(Path.GetDirectoryName(root)),
      enforcement="sampled_job_termination",sample_interval_ms=100,limits=limits,sandbox_bytes=usage.bytes,sandbox_entries=usage.entries,largest_file_bytes=usage.largest,reason=usage.reason }));
  }

  class GrantRecord { public string path; public bool directory; public FileSystemAccessRule rule; }
  static List<GrantRecord> grants=new List<GrantRecord>();
  static void Grant(string path,SecurityIdentifier sid,FileSystemRights rights,bool directory,bool inherit) {
    var rule=new FileSystemAccessRule(sid,rights,inherit?InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit:InheritanceFlags.None,PropagationFlags.None,AccessControlType.Allow);
    grants.Add(new GrantRecord { path=path,directory=directory,rule=rule });
    if(directory) { var acl=Directory.GetAccessControl(path); acl.AddAccessRule(rule); Directory.SetAccessControl(path,acl); }
    else { var acl=File.GetAccessControl(path); acl.AddAccessRule(rule); File.SetAccessControl(path,acl); }
  }
  static string Quote(string arg) {
    var value=new StringBuilder("\""); int slashes=0;
    foreach(char c in arg) { if(c=='\\') { slashes++; continue; } value.Append('\\',c=='"'?slashes*2+1:slashes).Append(c); slashes=0; }
    return value.Append('\\',slashes*2).Append('"').ToString();
  }
  static string Json(string arg) { return "\""+arg.Replace("\\","\\\\").Replace("\"","\\\"").Replace("\r","\\r").Replace("\n","\\n").Replace("\t","\\t")+"\""; }
  static void Check(bool success) { if(!success) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  static void Proof(string path,int pid,string profile,string phase,string reason,int code) {
    var content="{\"pid\":"+pid+",\"profile\":"+Json(profile)+",\"phase\":"+Json(phase)+",\"reason\":"+Json(reason)+",\"exit_code\":"+code+"}";
    Atomic(path,content);
  }
  static string Map(string root) {
    using(var mutex=new Mutex(false,"Local\\CimiLoop.DriveAllocation")) {
      bool locked=false;
      try {
        try { locked=mutex.WaitOne(5000); } catch(AbandonedMutexException) { locked=true; }
        if(!locked) throw new Exception("Drive allocation busy");
        for(char letter='Z';letter>='F';letter--) {
          string name=letter+":"; if(QueryDosDevice(name,new StringBuilder(4096),4096)!=0) continue;
          if(ownershipPath!=null) { ownedMapping=name; SaveOwnership(); }
          Check(DefineDosDevice(1|8,name,"\\??\\"+root)); return name;
        }
        throw new Exception("No dedicated drive available");
      } finally { if(locked) mutex.ReleaseMutex(); }
    }
  }
  static int Canary(string workspace,string protectedFile,string mode,int port) {
    bool readDenied=false,writeDenied=false,childDenied=false,insideReadable=false,insideWritable=false,loopbackDenied=false;
    try { File.ReadAllText(protectedFile); } catch(UnauthorizedAccessException) { readDenied=true; }
    try { File.WriteAllText(protectedFile,"forbidden"); } catch(UnauthorizedAccessException) { writeDenied=true; }
    try { var p=Process.Start(new ProcessStartInfo("cmd.exe","/c exit 0") { UseShellExecute=false,CreateNoWindow=true }); p.WaitForExit(); } catch(Win32Exception) { childDenied=true; }
    try { insideReadable=File.ReadAllText(Path.Combine(workspace,"input.txt"))=="visible"; } catch {}
    try { File.WriteAllText(Path.Combine(workspace,"output.txt"),"inside"); insideWritable=true; } catch(UnauthorizedAccessException) {}
    try { using(var client=new TcpClient()) { var pending=client.BeginConnect("127.0.0.1",port,null,null); if(!pending.AsyncWaitHandle.WaitOne(1500)) loopbackDenied=true; else client.EndConnect(pending); } } catch(SocketException) { loopbackDenied=true; }
    Console.WriteLine("{\"event\":\"sandbox.canary\",\"outside_read_denied\":"+readDenied.ToString().ToLower()+",\"outside_write_denied\":"+writeDenied.ToString().ToLower()+",\"subprocess_denied\":"+childDenied.ToString().ToLower()+",\"inside_readable\":"+insideReadable.ToString().ToLower()+",\"inside_writable\":"+insideWritable.ToString().ToLower()+",\"loopback_denied\":"+loopbackDenied.ToString().ToLower()+"}");
    return readDenied&&writeDenied&&childDenied&&insideReadable&&loopbackDenied&&(insideWritable==(mode=="write"))?0:10;
  }
  static int NetworkCanary(string input) {
    var cases=serializer.Deserialize<List<Dictionary<string,object>>>(input); bool passed=true;
    foreach(var item in cases) {
      string id=(string)item["id"],address=(string)item["address"],protocol=(string)item["protocol"]; int port=Convert.ToInt32(item["port"]),error=0; bool connected=false;
      var ip=IPAddress.Parse(address);
      using(var socket=new Socket(ip.AddressFamily,protocol=="udp"?SocketType.Dgram:SocketType.Stream,protocol=="udp"?ProtocolType.Udp:ProtocolType.Tcp)) {
        try {
          if(protocol=="udp") { socket.SendTo(new byte[] { 0 },new IPEndPoint(ip,port)); connected=true; }
          else {
            var pending=socket.BeginConnect(new IPEndPoint(ip,port),null,null);
            using(var wait=pending.AsyncWaitHandle) { if(!wait.WaitOne(1500)) error=10060; else { socket.EndConnect(pending); connected=true; } }
          }
        } catch(SocketException ex) { error=ex.NativeErrorCode; }
        catch { error=-1; }
      }
      bool denied=!connected&&error==10013;
      // Datagram send acceptance does not prove delivery. The trusted listener
      // independently verifies that no sandbox packet arrived.
      if(protocol=="tcp"&&(connected||(error!=10013&&error!=10060))) passed=false;
      Console.WriteLine(serializer.Serialize(new { event_type="sandbox.network_canary",id=id,address=address,port=port,protocol=protocol,denied=denied,send_or_connect_returned=connected,error_code=error }));
    }
    return passed?0:1;
  }
  static int Main(string[] args) {
    Console.OutputEncoding=new UTF8Encoding(false);
    if(args.Length==2&&args[0]=="--identity") { try { Console.WriteLine(serializer.Serialize(Identity(int.Parse(args[1])))); return 0; } catch { return 12; } }
    if(args.Length==2&&args[0]=="--inspect-identity") {
      string identityState="unknown";
      try {
        var identity=serializer.Deserialize<Dictionary<string,object>>(args[1]);
        if(identity==null||identity.Count!=3||!identity.ContainsKey("pid")||!identity.ContainsKey("creation_ticks")||!identity.ContainsKey("image")||
          !(identity["creation_ticks"] is string)||!(identity["image"] is string)||!Path.IsPathRooted((string)identity["image"])) throw new Exception("Invalid identity");
        identityState=InspectIdentity(identity);
      } catch { }
      Console.WriteLine(serializer.Serialize(new { state=identityState })); return identityState=="unknown"?12:0;
    }
    if(args.Length==7&&args[0]=="--recover") return Recover(args[1],args[2],args[3],args[4],args[5],args[6]);
    if(args.Length==4&&args[0]=="--ipc-client") { try { return IpcClient(args[1],args[2],int.Parse(args[3])); } catch(Exception ex) { Console.Error.WriteLine("IPC fixture failed: "+ex.GetType().Name+" "+ex.HResult); return 13; } }
    if(args.Length==4&&args[0]=="--gateway-client") { try { return GatewayClient(args[1],args[2],int.Parse(args[3])); } catch(Exception ex) { Console.Error.WriteLine("Gateway fixture failed: "+ex.GetType().Name); return 13; } }
    if(args.Length==3&&args[0]=="--conversation-client") { try { return ConversationClient(args[1],args[2]); } catch(Exception ex) { Console.Error.WriteLine("Conversation fixture failed: "+ex.GetType().Name); return 13; } }
    if(args.Length==2&&args[0]=="--pipe-attempt") return PipeAttempt(args[1]);
    if(args.Length==2&&args[0]=="--network-canary") return NetworkCanary(args[1]);
    // Synthetic resource fixtures remain inside the same AppContainer and job.
    if(args.Length==3&&args[0]=="--fixture") {
      if(args[1]=="disk") { using(var file=new FileStream("large.bin",FileMode.Create)) file.SetLength(4*1024*1024); Thread.Sleep(int.Parse(args[2])); return 0; }
      if(args[1]=="total") { File.WriteAllBytes("first.bin",new byte[48*1024]); File.WriteAllBytes("second.bin",new byte[48*1024]); Thread.Sleep(int.Parse(args[2])); return 0; }
      if(args[1]=="entries") { for(int i=0;i<20;i++) File.WriteAllText("entry"+i,"x"); Thread.Sleep(int.Parse(args[2])); return 0; }
      if(args[1]=="output") { for(int i=0;i<512;i++) Console.WriteLine(new string('x',4096)); Thread.Sleep(int.Parse(args[2])); return 0; }
      return 2;
    }
    if(args.Length==5&&args[0]=="--canary") return Canary(args[1],args[2],args[3],int.Parse(args[4]));
    if(args.Length==3&&args[0]=="--hold") { Console.WriteLine(Json(args[1])); Thread.Sleep(int.Parse(args[2])); return 0; }
    // private-root, write|read, elapsed-ms, native-binary, proof-file, cancel-file, argv...
    if(args.Length<6||(args[1]!="write"&&args[1]!="read")) return 2;
    string root=Path.GetFullPath(args[0]),workspace=Path.Combine(root,"workspace"),state=Path.Combine(root,"state"),profile="CimiLoop."+Guid.NewGuid().ToString("N"),binary=Path.GetFullPath(args[3]),mapping=null;
    int argvStart=6; Dictionary<string,object> diskLimits=null;
    if(args.Length>8&&args[6]=="--managed") {
      Guid guid; if(!Guid.TryParseExact(args[7],"D",out guid)) return 2;
      ownershipNonce=args[7]; profile="CimiLoop."+guid.ToString("N"); ownershipPath=Path.Combine(Path.GetDirectoryName(root),"native-ownership.json");
      ownedRoot=root; ownedBinary=binary; ownedMode=args[1]; ownedProfile=profile; nativeIdentity=Identity(Process.GetCurrentProcess().Id);
      diskLimits=serializer.Deserialize<Dictionary<string,object>>(args[8]); argvStart=9; SaveOwnership();
    }
    // Older persisted operations retain their original internetClient behavior.
    // New callers explicitly supply a policy; no capability is the safe default.
    string networkMode="unrestricted_probe_only";
    bool policySupplied=args.Length>argvStart+1&&args[argvStart]=="--policy";
    if(policySupplied) {
      var policy=serializer.Deserialize<Dictionary<string,object>>(args[argvStart+1]);
      networkMode=(string)((Dictionary<string,object>)policy["network"])["mode"];
      if((networkMode!="deny_all"&&networkMode!="unrestricted_probe_only")||(string)((Dictionary<string,object>)policy["cost"])["mode"]!="unmetered_probe_only") return 2;
      argvStart+=2;
    }
    ownedNetworkMode=networkMode; SaveOwnership();
    string ipcOperation=null,gatewayPolicy=null,conversationPolicy=null,conversationMethodProfile=null;
    if(args.Length>argvStart+1&&args[argvStart]=="--ipc-probe") {
      if(!policySupplied||networkMode!="deny_all"||ownershipPath==null) return 2;
      ipcOperation=args[argvStart+1]; argvStart+=2;
    }
    else if(args.Length>argvStart+2&&args[argvStart]=="--ipc-gateway") {
      if(!policySupplied||networkMode!="deny_all"||ownershipPath==null) return 2;
      ipcOperation=args[argvStart+1]; gatewayPolicy=args[argvStart+2]; argvStart+=3;
    }
    else if(args.Length>argvStart+3&&args[argvStart]=="--ipc-conversation-method") {
      if(!policySupplied||networkMode!="deny_all"||ownershipPath==null||args[1]!="read") return 2;
      ipcOperation=args[argvStart+1]; conversationPolicy=args[argvStart+2]; conversationMethodProfile=args[argvStart+3]; argvStart+=4;
    }
    else if(args.Length>argvStart+2&&args[argvStart]=="--ipc-conversation") {
      if(!policySupplied||networkMode!="deny_all"||ownershipPath==null||args[1]!="read") return 2;
      ipcOperation=args[argvStart+1]; conversationPolicy=args[argvStart+2]; argvStart+=3;
    }
    int capabilityCount=networkMode=="deny_all"?0:1;
    IntPtr sid=IntPtr.Zero,list=IntPtr.Zero,capsMemory=IntPtr.Zero,networkSid=IntPtr.Zero,capArray=IntPtr.Zero,handles=IntPtr.Zero,job=IntPtr.Zero,jobList=IntPtr.Zero;
    PROCESSINFO process=new PROCESSINFO(); bool started=false,assigned=false; string reason="unavailable"; int exit=11; var cleanupErrors=new List<string>();
    try {
      // No ancestor ACLs, elevation or loopback exemptions.
      if(capabilityCount>0) { Check(ConvertStringSidToSid("S-1-15-3-1",out networkSid)); capArray=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(SIDATTR))); Marshal.StructureToPtr(new SIDATTR { sid=networkSid,attributes=4 },capArray,false); }
      int hr=CreateAppContainerProfile(profile,profile,"CimiLoop isolated runtime",capArray,(uint)capabilityCount,out sid); if(hr!=0) Marshal.ThrowExceptionForHR(hr);
      var principal=new SecurityIdentifier(sid);
      Grant(root,principal,FileSystemRights.ReadAttributes|FileSystemRights.Traverse,true,false);
      Grant(workspace,principal,args[1]=="write"?FileSystemRights.Modify:FileSystemRights.ReadAndExecute,true,true);
      Grant(state,principal,FileSystemRights.Modify,true,true); Grant(binary,principal,FileSystemRights.ReadAndExecute,false,false);
      if(ipcOperation!=null) {
        string transport=Path.Combine(root,"transport"); Ordinary(transport);
        ownedTransportGranted=Directory.Exists(transport); ownedTransportWriteAttributes=ownedTransportGranted; SaveOwnership();
        if(ownedTransportGranted) Grant(transport,principal,FileSystemRights.ReadAndExecute|FileSystemRights.WriteAttributes,true,true);
        ipcPipe=new ProbePipe(ownershipNonce,ipcOperation,principal,root,Path.GetFullPath(args[5]));
        if(conversationPolicy!=null) ipcPipe.EnableConversation(root,ownershipNonce,conversationPolicy,conversationMethodProfile);
        if(gatewayPolicy!=null) {
          ipcPipe.EnableGateway(root,ownershipNonce,gatewayPolicy);
          if(args.Length>argvStart&&args[argvStart]=="--gateway-client") Environment.SetEnvironmentVariable("CIMILOOP_GATEWAY_PRIVATE_CANARY",Path.Combine(Path.GetDirectoryName(root),"gateway","private-canary.json"));
        }
      }
      mapping=Map(root);
      if(ipcOperation!=null) {
        Environment.SetEnvironmentVariable("CIMILOOP_IPC_PIPE",ipcPipe.name);
        string content=Environment.GetEnvironmentVariable("OPENCODE_CONFIG_CONTENT");
        if(content!=null) Environment.SetEnvironmentVariable("OPENCODE_CONFIG_CONTENT",content.Replace("file:///CIMILOOP_TRANSPORT/provider.mjs","file:///"+mapping+"/transport/provider.mjs"));
      }
      string privateState=mapping+"\\state";
      foreach(string item in new string[] { "TEMP","TMP","USERPROFILE","HOME","OPENCODE_TEST_HOME" }) Environment.SetEnvironmentVariable(item,privateState);
      Environment.SetEnvironmentVariable("APPDATA",privateState+"\\AppData\\Roaming");
      Environment.SetEnvironmentVariable("LOCALAPPDATA",privateState+"\\AppData\\Local");
      foreach(string item in new string[] { "DATA","CONFIG","CACHE","STATE" }) Environment.SetEnvironmentVariable("XDG_"+item+"_HOME",privateState+"\\"+item.ToLower());
      Environment.SetEnvironmentVariable("OPENCODE_CONFIG_DIR",privateState+"\\config");
      var caps=new CAPS { sid=sid,capabilities=capArray,count=capabilityCount }; capsMemory=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(CAPS))); Marshal.StructureToPtr(caps,capsMemory,false);
      IntPtr size=IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero,3,0,ref size); list=Marshal.AllocHGlobal(size); Check(InitializeProcThreadAttributeList(list,3,0,ref size));
      Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x20009),capsMemory,new IntPtr(Marshal.SizeOf(typeof(CAPS))),IntPtr.Zero,IntPtr.Zero));
      var startup=new STARTUPINFOEX(); startup.info.cb=Marshal.SizeOf(typeof(STARTUPINFOEX)); startup.attributes=list; startup.info.flags=0x100; startup.info.input=GetStdHandle(-10); startup.info.output=GetStdHandle(-11); startup.info.error=GetStdHandle(-12);
      handles=Marshal.AllocHGlobal(IntPtr.Size*3); Marshal.WriteIntPtr(handles,0,startup.info.input); Marshal.WriteIntPtr(handles,IntPtr.Size,startup.info.output); Marshal.WriteIntPtr(handles,IntPtr.Size*2,startup.info.error);
      Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles,new IntPtr(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero));
      job=CreateJobObject(IntPtr.Zero,null); if(job==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
      var limits=new JOBLIMIT(); limits.basic.flags=0x2000|0x8|0x200; limits.basic.active=1; limits.jobMem=new UIntPtr(2147483648UL); Check(SetInformationJobObject(job,9,ref limits,Marshal.SizeOf(typeof(JOBLIMIT))));
      // Assign at CreateProcess, closing the suspended-child crash window.
      jobList=Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobList,job);
      Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x2000d),jobList,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
      var command=new StringBuilder(Quote(binary)); for(int i=argvStart;i<args.Length;i++) command.Append(" ").Append(Quote(args[i].Replace("{workspace}",mapping+"\\workspace")));
      Check(CreateProcess(binary,command,IntPtr.Zero,IntPtr.Zero,true,0x80000|0x08000000|0x4,IntPtr.Zero,mapping+"\\workspace",ref startup,out process)); started=true;
      assigned=true; if(ownershipPath!=null) { runtimeIdentity=Identity(process.pid); SaveOwnership(); }
      if(ipcPipe!=null) ipcPipe.Start(runtimeIdentity);
      if(policySupplied) Atomic(Path.Combine(Path.GetDirectoryName(root),"execution-policy-proof.json"),serializer.Serialize(new {
        schema_version="2.0.0",scope="isolated_provider_probe",operation_key=Path.GetFileName(Path.GetDirectoryName(root)),pid=process.pid,
        network_mode=networkMode,enforcement=capabilityCount==0?"appcontainer_no_network_capabilities":"appcontainer_internet_client",
        capability_sids=capabilityCount==0?new string[0]:new string[] { "S-1-15-3-1" },cost_mode="unmetered_probe_only",formal_execution_enabled=false }));
      Proof(args[4],process.pid,profile,"running","",259);
      Console.WriteLine("{\"event\":\"sandbox.started\",\"pid\":"+process.pid+",\"profile\":"+Json(profile)+"}"); Console.Out.Flush();
      Check(ResumeThread(process.thread)!=0xffffffff);
      var watch=Stopwatch.StartNew(); long maximum=long.Parse(args[2]);
      while(WaitForSingleObject(process.process,100)==0x102) {
        if(diskLimits!=null) {
          Usage usage=ObserveDisk(root,diskLimits);
          if(usage.reason!="within_limits") {
            reason=usage.reason=="observation_unavailable"?"disk_observation_unavailable":"disk_limit"; exit=reason=="disk_limit"?122:11;
            Check(TerminateJobObject(job,(uint)exit)); Check(WaitForSingleObject(process.process,5000)==0); ResourceProof(root,diskLimits,usage); break;
          }
        }
        if(File.Exists(args[5])||watch.ElapsedMilliseconds>=maximum) {
          reason=File.Exists(args[5])?"cancelled":"timeout"; exit=reason=="cancelled"?130:124;
          if(reason=="cancelled"&&File.ReadAllText(args[5])=="output budget exhausted") { reason="output_limit"; exit=122; }
          Check(TerminateJobObject(job,(uint)exit)); Check(WaitForSingleObject(process.process,5000)==0); break;
        }
      }
      if(reason=="unavailable") { uint code; Check(GetExitCodeProcess(process.process,out code)); exit=(int)code; reason="exited"; }
      // The host can abort a gateway request and deliver its error before this
      // 100ms watcher sees the cancellation file. Do not call that quick child
      // exit successful when cancellation had already been requested.
      if(reason=="exited"&&File.Exists(args[5])) {
        reason=File.ReadAllText(args[5])=="output budget exhausted"?"output_limit":"cancelled"; exit=reason=="cancelled"?130:122;
      }
      if(diskLimits!=null&&!File.Exists(Path.Combine(Path.GetDirectoryName(root),"resource-proof.json"))) {
        Usage usage=ObserveDisk(root,diskLimits); ResourceProof(root,diskLimits,usage);
        if(usage.reason!="within_limits") { reason=usage.reason=="observation_unavailable"?"disk_observation_unavailable":"disk_limit"; exit=122; }
      }
    } catch(Exception ex) { reason="unavailable"; exit=11; Console.Error.WriteLine("AppContainer unavailable: "+ex.GetType().Name+" "+ex.Message); }
    finally {
      if(started) { if(assigned) TerminateJobObject(job,125); else TerminateProcess(process.process,125); }
      if(ipcPipe!=null) { try { ipcPipe.Dispose(); } catch { cleanupErrors.Add("ipc"); } }
      if(process.thread!=IntPtr.Zero) CloseHandle(process.thread); if(process.process!=IntPtr.Zero) CloseHandle(process.process); if(job!=IntPtr.Zero) CloseHandle(job);
      if(list!=IntPtr.Zero) { DeleteProcThreadAttributeList(list); Marshal.FreeHGlobal(list); } if(capsMemory!=IntPtr.Zero) Marshal.FreeHGlobal(capsMemory); if(capArray!=IntPtr.Zero) Marshal.FreeHGlobal(capArray); if(handles!=IntPtr.Zero) Marshal.FreeHGlobal(handles); if(jobList!=IntPtr.Zero) Marshal.FreeHGlobal(jobList); if(networkSid!=IntPtr.Zero) LocalFree(networkSid);
      if(mapping!=null&&!DefineDosDevice(1|2|4|8,mapping,"\\??\\"+root)) cleanupErrors.Add("drive");
      for(int i=grants.Count-1;i>=0;i--) {
        var grant=grants[i];
        try { if(grant.directory) { var acl=Directory.GetAccessControl(grant.path); acl.RemoveAccessRuleSpecific(grant.rule); Directory.SetAccessControl(grant.path,acl); }
          else { var acl=File.GetAccessControl(grant.path); acl.RemoveAccessRuleSpecific(grant.rule); File.SetAccessControl(grant.path,acl); }
        } catch { cleanupErrors.Add("acl"); }
      }
      if(sid!=IntPtr.Zero) { FreeSid(sid); if(DeleteAppContainerProfile(profile)!=0) cleanupErrors.Add("profile"); }
      if(cleanupErrors.Count>0) { reason="cleanup_failed"; exit=11; Console.Error.WriteLine("AppContainer cleanup failed: "+string.Join(",",cleanupErrors.ToArray())); }
      if(ownershipPath!=null) { resourcesDisposed=cleanupErrors.Count==0; try { SaveOwnership(); } catch { reason="cleanup_failed"; exit=11; } }
      try { Proof(args[4],process.pid,profile,"ended",reason,exit); } catch { exit=11; }
    }
    return exit;
  }
}
