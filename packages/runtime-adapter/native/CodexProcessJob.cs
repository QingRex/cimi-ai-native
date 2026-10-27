using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// Model stdio remains opaque. The optional contained proxy checks CONNECT and
// TLS routing only, never credentials or TLS plaintext. Children enter the
// original private Job and never inherit its handle.
public static partial class CodexProcessJob {
  [StructLayout(LayoutKind.Sequential)] struct Times { public uint Low, High; public ulong Value { get { return ((ulong)High << 32) | Low; } } }
  [StructLayout(LayoutKind.Sequential)] struct BasicProcess { public IntPtr Reserved1,Peb,Reserved2a,Reserved2b,Pid,ParentPid; }
  [StructLayout(LayoutKind.Sequential)] struct BasicLimit { public long PerProcess,PerJob; public uint Flags; public UIntPtr Min,Max; public uint Active; public UIntPtr Affinity; public uint Priority,Scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct Io { public ulong ReadOps,WriteOps,OtherOps,ReadBytes,WriteBytes,OtherBytes; }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimit { public BasicLimit Basic; public Io Io; public UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory; }
  [StructLayout(LayoutKind.Sequential)] struct Accounting { public long User,Kernel,PeriodUser,PeriodKernel; public uint Faults,Total,Active,Terminated; }
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup { public int Size; public string Reserved,Desktop,Title; public int X,Y,XSize,YSize,XChars,YChars,Fill,Flags; public short Show,ReservedSize; public IntPtr Reserved2,Input,Output,Error; }
  [StructLayout(LayoutKind.Sequential)] struct StartupEx { public Startup Startup; public IntPtr Attributes; }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr Process,Thread; public uint Pid,Tid; }
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr p,int kind,out BasicProcess info,int size,out int returned);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr p,out Times creation,out Times exit,out Times kernel,out Times user);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr p,int flags,StringBuilder name,ref int size);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref ExtendedLimit info,int size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int kind,out Accounting info,int size,IntPtr returned);
  [DllImport("kernel32.dll",EntryPoint="QueryInformationJobObject",SetLastError=true)] static extern bool QueryExtendedJob(IntPtr job,int kind,out ExtendedLimit info,int size,IntPtr returned);
  static object BoundedJobProof(IntPtr job){ExtendedLimit limits;Need(QueryExtendedJob(job,9,out limits,Marshal.SizeOf(typeof(ExtendedLimit)),IntPtr.Zero));Need(limits.Basic.Flags==0x2208&&limits.Basic.Active==8&&limits.JobMemory.ToUInt64()==2147483648UL&&limits.ProcessMemory.ToUInt64()==0);return new{policy="codex_memory_process/1.0.0",flags=limits.Basic.Flags,job_memory_bytes=limits.JobMemory.ToUInt64(),active_process_limit=limits.Basic.Active};}
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint exit);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int id);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool DuplicateHandle(IntPtr from,IntPtr handle,IntPtr to,out IntPtr copy,uint access,bool inherit,uint options);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string binary,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr environment,string cwd,ref StartupEx startup,out ProcessInfo process);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint ms);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForMultipleObjects(uint count,IntPtr[] handles,bool all,uint ms);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr p,out uint exit);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer { MaxJsonLength=131072,RecursionLimit=16 };
  static void Need(bool value) { if(!value)throw new InvalidOperationException("codex_process_job_unproven"); }
  static string Hash(byte[] value) { using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(value)).Replace("-","").ToLowerInvariant(); }
  static ulong Created(IntPtr p) { Times c,e,k,u;Need(GetProcessTimes(p,out c,out e,out k,out u));return c.Value; }
  static string Image(IntPtr p) { var text=new StringBuilder(32768);int size=text.Capacity;Need(QueryFullProcessImageName(p,0,text,ref size));return Path.GetFullPath(text.ToString()); }
  static object Identity(IntPtr p,uint pid) { return new {pid=pid,creation_ticks=Created(p).ToString(),image=Image(p)}; }
  static string Quote(string value) { var result=new StringBuilder("\"");int slashes=0;foreach(char c in value){if(c=='\\'){slashes++;continue;}if(c=='\"'){result.Append('\\',slashes*2+1).Append(c);slashes=0;continue;}result.Append('\\',slashes).Append(c);slashes=0;}return result.Append('\\',slashes*2).Append('"').ToString(); }
  static byte[] Save(string path,object value) { byte[] bytes=new UTF8Encoding(false,true).GetBytes(Json.Serialize(value));using(var file=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.Read)){file.Write(bytes,0,bytes.Length);file.Flush(true);}return bytes; }
  static bool Cancelled(string path,string nonce,string digest) {
    if(path==null||!File.Exists(path))return false;
    try {byte[] bytes=File.ReadAllBytes(path);if(bytes.Length>4096)return false;var value=Json.DeserializeObject(new UTF8Encoding(false,true).GetString(bytes)) as Dictionary<string,object>;
      return value!=null&&value.Count==3&&Convert.ToString(value["format"])=="cimiloop/codex-process-cancel/1.0.0"&&Convert.ToString(value["nonce"])==nonce&&Convert.ToString(value["config_digest"])==digest;
    }catch{return false;}
  }
  static int Inspect(string text) {
    Need(text.Length<=4096);var values=Json.DeserializeObject(text) as object[];Need(values!=null&&values.Length>=2&&values.Length<=3);var states=new List<object>();
    foreach(object raw in values){var value=raw as Dictionary<string,object>;Need(value!=null&&value.Count==3);uint pid=Convert.ToUInt32(value["pid"]);ulong created=UInt64.Parse(Convert.ToString(value["creation_ticks"]));string image=Path.GetFullPath(Convert.ToString(value["image"]));Need(pid>0&&created>0);
      string state="unknown";IntPtr handle=OpenProcess(0x100000|0x1000,false,pid);
      if(handle==IntPtr.Zero){if(Marshal.GetLastWin32Error()==87)state="absent";}
      else try{state=WaitForSingleObject(handle,0)==0||Created(handle)!=created||!String.Equals(Image(handle),image,StringComparison.OrdinalIgnoreCase)?"absent":"active";}finally{CloseHandle(handle);}
      states.Add(new {identity=raw,state=state});
    }
    Console.WriteLine(Json.Serialize(new {format="cimiloop/codex-process-identities/1.0.0",states=states}));return 0;
  }
  static int Run(string[] args) {
    Need(args.Length==4);byte[] config=File.ReadAllBytes(args[0]);Need(config.Length<=65536&&Hash(config)==args[1]);
    var input=Json.DeserializeObject(new UTF8Encoding(false,true).GetString(config)) as Dictionary<string,object>;Need(input!=null);string format=Convert.ToString(input["format"]);if(format=="cimiloop/codex-process-launch/5.0.0"||format=="cimiloop/codex-process-launch/6.0.0"||format=="cimiloop/codex-process-launch/7.0.0"||format=="cimiloop/codex-process-launch/8.0.0")return RunProxy(args,input);bool scoped=format=="cimiloop/codex-process-launch/4.0.0",cancellable=scoped||format=="cimiloop/codex-process-launch/2.0.0";Need(scoped?input.Count==9:cancellable?input.Count==8:input.Count==7&&format=="cimiloop/codex-process-launch/1.0.0");
    string[] writeRoots=null;string network=null;if(scoped){var scope=input["write_scope"] as Dictionary<string,object>;Need(scope!=null&&scope.Count==3&&Convert.ToString(scope["format"])=="cimiloop/codex-write-roots/2.0.0");var values=scope["roots"] as object[];Need(values!=null&&values.Length>0&&values.Length<=2);writeRoots=Array.ConvertAll(values,item=>{Need(item is string);return Path.GetFullPath((string)item);});network=Convert.ToString(scope["network_mode"]);}
    uint ownerPid=Convert.ToUInt32(input["owner_pid"]);string binary=Path.GetFullPath(Convert.ToString(input["binary"])),cwd=Path.GetFullPath(Convert.ToString(input["cwd"])),expected=Convert.ToString(input["binary_digest"]),nonce=Convert.ToString(input["nonce"]);
    string cancel=cancellable?Path.GetFullPath(Convert.ToString(input["cancel_path"])):null;Need(!cancellable||String.Equals(cancel,Path.Combine(Path.GetDirectoryName(Path.GetFullPath(args[0])),"cancel.json"),StringComparison.OrdinalIgnoreCase));
    object[] argv=input["args"] as object[];Need(argv!=null&&argv.Length<=512&&expected.Length==64&&Guid.Parse(nonce)!=Guid.Empty);
    var command=new StringBuilder(Quote(binary));foreach(object item in argv){Need(item is string&&((string)item).IndexOf('\0')<0);command.Append(' ').Append(Quote((string)item));}Need(command.Length<32760);
    BasicProcess basic;int returned;Need(NtQueryInformationProcess(GetCurrentProcess(),0,out basic,Marshal.SizeOf(typeof(BasicProcess)),out returned)==0&&basic.ParentPid.ToInt64()==ownerPid);
    IntPtr owner=IntPtr.Zero,job=IntPtr.Zero,attributes=IntPtr.Zero,jobList=IntPtr.Zero,handles=IntPtr.Zero;var std=new IntPtr[3];var process=new ProcessInfo();bool attrsReady=false;CodexWriteScope writeScope=null;
    try {
      owner=OpenProcess(0x100000|0x1000,false,ownerPid);Need(owner!=IntPtr.Zero&&Created(owner)<Created(GetCurrentProcess())&&WaitForSingleObject(owner,0)==258);
      Need(Hash(File.ReadAllBytes(binary))==expected);
      job=CreateJobObject(IntPtr.Zero,null);Need(job!=IntPtr.Zero);var limits=new ExtendedLimit();limits.Basic.Flags=0x2000;Need(SetInformationJobObject(job,9,ref limits,Marshal.SizeOf(typeof(ExtendedLimit))));
      IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,scoped?3:2,0,ref size);Need(size.ToInt64()>0);attributes=Marshal.AllocHGlobal(size);Need(InitializeProcThreadAttributeList(attributes,scoped?3:2,0,ref size));attrsReady=true;
      jobList=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(jobList,job);Need(UpdateProcThreadAttribute(attributes,0,new IntPtr(0x2000d),jobList,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
      handles=Marshal.AllocHGlobal(IntPtr.Size*3);for(int i=0;i<3;i++){Need(DuplicateHandle(GetCurrentProcess(),GetStdHandle(-10-i),GetCurrentProcess(),out std[i],0,true,2));Marshal.WriteIntPtr(handles,i*IntPtr.Size,std[i]);}
      Need(UpdateProcThreadAttribute(attributes,0,new IntPtr(0x20002),handles,new IntPtr(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero));
      var startup=new StartupEx();startup.Startup.Size=Marshal.SizeOf(typeof(StartupEx));startup.Startup.Flags=0x100;startup.Startup.Input=std[0];startup.Startup.Output=std[1];startup.Startup.Error=std[2];startup.Attributes=attributes;
      if(scoped){writeScope=new CodexWriteScope(writeRoots,binary,cwd,nonce,network);Need(UpdateProcThreadAttribute(attributes,0,new IntPtr(0x20009),writeScope.CapabilitiesPointer,new IntPtr(24),IntPtr.Zero,IntPtr.Zero));}
      Need(CreateProcess(binary,command,IntPtr.Zero,IntPtr.Zero,true,0x80000|0x4|0x08000000,IntPtr.Zero,cwd,ref startup,out process));if(scoped)writeScope.VerifyProcess(process.Process);
      Need(String.Equals(Image(process.Process),binary,StringComparison.OrdinalIgnoreCase)&&Hash(File.ReadAllBytes(binary))==expected);
      var start=new Dictionary<string,object>{{"format",scoped?"cimiloop/codex-process-start/3.0.0":"cimiloop/codex-process-start/1.0.0"},{"nonce",nonce},{"config_digest",args[1]},{"owner",Identity(owner,ownerPid)},{"supervisor",Identity(GetCurrentProcess(),(uint)Process.GetCurrentProcess().Id)},{"worker",Identity(process.Process,process.Pid)},{"job_assignment","atomic_on_create"},{"kill_on_close",true}};if(scoped)start.Add("write_scope",writeScope.Proof());byte[] started=Save(args[2],start);
      // The child already belongs to the Job while suspended. If the owner
      // disappeared, kill it without allowing a single worker instruction.
      bool ownerGone=WaitForSingleObject(owner,0)==0;
      if(!ownerGone)Need(ResumeThread(process.Thread)!=0xffffffff);
      uint outcome=ownerGone?0u:258u;
      while(outcome==258){if(Cancelled(cancel,nonce,args[1])){outcome=2;break;}outcome=WaitForMultipleObjects(2,new IntPtr[]{owner,process.Process},false,50);}
      Need(outcome<=2);string reason=outcome==0?"owner_exited":outcome==2?"cancel_requested":"worker_exited";uint exit=125;if(outcome==1)Need(GetExitCodeProcess(process.Process,out exit));
      Need(TerminateJobObject(job,outcome==1?exit:125));
      var clock=Stopwatch.StartNew();Accounting accounting;
      do {Need(QueryInformationJobObject(job,1,out accounting,Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero));if(accounting.Active==0)break;Need(clock.ElapsedMilliseconds<5000);Thread.Sleep(10);}while(true);
      Need(CloseHandle(job));job=IntPtr.Zero;
      var end=new Dictionary<string,object>{{"format",scoped?"cimiloop/codex-process-end/3.0.0":"cimiloop/codex-process-end/1.0.0"},{"nonce",nonce},{"config_digest",args[1]},{"started_digest",Hash(started)},{"reason",reason},{"worker_exit_code",exit},{"active_processes",0},{"job_closed",true}};if(scoped){var proof=writeScope.Proof();writeScope.CompleteAfterEmptyJob();end.Add("write_scope",proof);end.Add("root_grants_removed",writeScope.GrantsRemoved);end.Add("profile_deleted",writeScope.ProfileDeleted);}Save(args[3],end);
      return outcome==1?(int)Math.Min(exit,120):125;
    } catch(Exception error){if(scoped)try{var native=error as System.ComponentModel.Win32Exception;Save(Path.Combine(Path.GetDirectoryName(Path.GetFullPath(args[0])),"write-failure.json"),new{format="cimiloop/codex-write-failure/1.0.0",nonce=nonce,config_digest=args[1],stage=CodexWriteScope.Stage,win32_error=native==null?0:native.NativeErrorCode});}catch{}throw;} finally {
      if(job!=IntPtr.Zero){TerminateJobObject(job,125);CloseHandle(job);}if(writeScope!=null)writeScope.Dispose();if(process.Thread!=IntPtr.Zero)CloseHandle(process.Thread);if(process.Process!=IntPtr.Zero)CloseHandle(process.Process);
      foreach(IntPtr handle in std)if(handle!=IntPtr.Zero)CloseHandle(handle);if(attrsReady)DeleteProcThreadAttributeList(attributes);if(attributes!=IntPtr.Zero)Marshal.FreeHGlobal(attributes);if(handles!=IntPtr.Zero)Marshal.FreeHGlobal(handles);if(jobList!=IntPtr.Zero)Marshal.FreeHGlobal(jobList);if(owner!=IntPtr.Zero)CloseHandle(owner);
    }
  }
  public static int Main(string[] args) { try {if(args.Length==3&&args[0]=="--codex-proxy-inner")return InnerProxy(args[1],args[2]);return args.Length==2&&args[0]=="--inspect-identities"?Inspect(args[1]):Run(args);}catch(Exception error){if(args.Length==3&&args[0]=="--codex-proxy-inner")try{var native=error as System.ComponentModel.Win32Exception;Console.Error.WriteLine(Json.Serialize(new{format="cimiloop/codex-proxy-worker-failure/1.0.0",stage=CodexWriteScope.Stage,win32_error=native==null?Marshal.GetLastWin32Error():native.NativeErrorCode,hresult=error.HResult}));}catch{}return 121;} }
}
