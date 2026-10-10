// A separate entry point shares only fixed Windows isolation primitives with
// the public controller. The public Main, probes and persisted formats remain.
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;

class AgentWorkspaceSandbox {
  static int Main(string[] args) {
    if(args.Length==0) return AppContainer.LaunchAgentWorkspace();
    if(args.Length==2&&args[0]=="--recover") return AppContainer.RecoverAgentWorkspace(args[1]);
    return 12;
  }
}
partial class AppContainer {
  [StructLayout(LayoutKind.Sequential)] struct AgentAccounting { public long user,kernel,periodUser,periodKernel; public uint faults,total,active,terminated; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr OpenJobObject(uint access,bool inherit,string name);
  [DllImport("kernel32.dll",EntryPoint="CreateJobObjectW",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr AgentCreateJob(IntPtr attributes,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int kind,out AgentAccounting data,int length,IntPtr returned);
  [DllImport("advapi32.dll",EntryPoint="GetTokenInformation",SetLastError=true)] static extern bool AgentTokenInformation(IntPtr token,int kind,IntPtr data,int length,out int returned);
  [StructLayout(LayoutKind.Sequential)] struct AgentSA { public int length; public IntPtr descriptor; [MarshalAs(UnmanagedType.Bool)] public bool inherit; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateFile(string path,uint access,uint share,ref AgentSA security,uint creation,uint flags,IntPtr template);
  static volatile bool agentParentEnded;
  static Exception agentInputError;
  sealed class AgentInputClosedException : Exception { }
  sealed class AgentCancellationException : Exception { public readonly string operation,digest; public AgentCancellationException(string operation,string digest) { this.operation=operation;this.digest=digest; } }
  static void AgentRequireInput(string line,Exception error) {
    if(AgentTaskExpired()) throw new InvalidDataException();
    if(error!=null) throw error;
    if(line==null) throw new AgentInputClosedException();
    var value=serializer.Deserialize<Dictionary<string,object>>(line);
    if(value!=null&&value.ContainsKey("format")&&value["format"] as string=="cimiloop/agent-workspace-cancel/1.0.0") {
      AgentKeys(value,"format","nonce","scope_digest","operation_id","cancellation_digest");
      string marker=value["cancellation_digest"] as string,operation=value["operation_id"] as string;Guid id;
      if(agentResources==null||value["nonce"] as string!=(string)agentResources["nonce"]||value["scope_digest"] as string!=(string)agentResources["scope_digest"]||
        !Guid.TryParseExact(operation,"D",out id)||operation!=new DirectoryInfo(Path.GetDirectoryName(agentResourcePath)).Name||marker==null||marker.Length!=64)throw new InvalidDataException();
      foreach(char c in marker)if(!(c>='0'&&c<='9'||c>='a'&&c<='f'))throw new InvalidDataException();
      throw new AgentCancellationException(operation,marker);
    }
  }
  static void AgentInterruption(bool resumed) {
    var value=new { format="cimiloop/agent-workspace-interruption/1.0.0",nonce=agentResources["nonce"],scope_digest=agentResources["scope_digest"],config_digest=agentResources["config_digest"],owner=agentResources["owner"],supervisor=agentResources["supervisor"],runtime=agentResources["runtime"],phase=agentResources["phase"],runtime_resumed=resumed,reason="agent_sandbox_parent_ended" };
    byte[] bytes=new UTF8Encoding(false,true).GetBytes(serializer.Serialize(value));
    using(var file=new FileStream(Path.Combine(Path.GetDirectoryName(agentResourcePath),"agent-sandbox-interruption.json"),FileMode.CreateNew,FileAccess.Write,FileShare.None)) { file.Write(bytes,0,bytes.Length); file.Flush(true); }
  }
  static void AgentCancellation(AgentCancellationException stop,bool resumed) {
    var value=new {format="cimiloop/agent-workspace-cancellation/1.0.0",nonce=agentResources["nonce"],operation_id=stop.operation,cancellation_digest=stop.digest,scope_digest=agentResources["scope_digest"],config_digest=agentResources["config_digest"],owner=agentResources["owner"],supervisor=agentResources["supervisor"],runtime=agentResources["runtime"],phase=agentResources["phase"],runtime_resumed=resumed,reason="agent_sandbox_cancel_requested"};
    byte[] bytes=new UTF8Encoding(false,true).GetBytes(serializer.Serialize(value));
    using(var file=new FileStream(Path.Combine(Path.GetDirectoryName(agentResourcePath),"agent-sandbox-cancellation.json"),FileMode.CreateNew,FileAccess.Write,FileShare.None)) {file.Write(bytes,0,bytes.Length);file.Flush(true);}
  }
  [DllImport("kernel32.dll",EntryPoint="GetTickCount64")] static extern ulong AgentTickCount();
  static ulong agentTaskDeadline;
  static bool agentProductionTask;
  // Production control consumes the same frozen Task uptime deadline.
  static bool AgentControlExpired(Stopwatch watch) { return AgentTaskExpired()||(!agentProductionTask&&watch.ElapsedMilliseconds>=10000); }
  static bool AgentTaskExpired() { return agentTaskDeadline!=0&&AgentTickCount()>=agentTaskDeadline; }
  static ulong AgentConfigDeadline(Dictionary<string,object> config) {
    string format=config["format"] as string;
    if(format=="cimiloop/agent-workspace-sandbox-config/1.0.0") { AgentKeys(config,"format","nonce","root","binary","owner","pipe_nonce","scope_digest","elapsed_ms","provider_options"); return 0; }
    if(format=="cimiloop/agent-workspace-sandbox-config/5.0.0") {
      AgentKeys(config,"format","nonce","root","binary","owner","pipe_nonce","scope_digest","elapsed_ms","provider_options","deadline_uptime_ms","prompt","lifetime_policy","binary_original");
      if(!((config["prompt"] is string&&config["lifetime_policy"] as string=="agent_task/1.0.0")||(config["prompt"]==null&&config["lifetime_policy"]==null))) throw new InvalidDataException();
      var binaryProof=config["binary_original"] as Dictionary<string,object>; if(binaryProof==null||binaryProof["path"] as string!=config["binary"] as string||binaryProof["format"] as string!="cimiloop/runtime-binary-original-proof/1.0.0") throw new InvalidDataException();
    }
    else if(format=="cimiloop/agent-workspace-sandbox-config/4.0.0") { AgentKeys(config,"format","nonce","root","binary","owner","pipe_nonce","scope_digest","elapsed_ms","provider_options","deadline_uptime_ms","prompt","lifetime_policy"); if(config["lifetime_policy"] as string!="agent_task/1.0.0") throw new InvalidDataException(); }
    else if(format=="cimiloop/agent-workspace-sandbox-config/3.0.0") AgentKeys(config,"format","nonce","root","binary","owner","pipe_nonce","scope_digest","elapsed_ms","provider_options","deadline_uptime_ms","prompt");
    else if(format=="cimiloop/agent-workspace-sandbox-config/2.0.0") AgentKeys(config,"format","nonce","root","binary","owner","pipe_nonce","scope_digest","elapsed_ms","provider_options","deadline_uptime_ms");
    else throw new InvalidDataException();
    object value=config["deadline_uptime_ms"]; if(value==null) return 0;
    if(!(value is int)&&!(value is long)) throw new InvalidDataException();
    long deadline=Convert.ToInt64(value); if(deadline<=0||deadline>9007199254740991L) throw new InvalidDataException(); return (ulong)deadline;
  }
  static Dictionary<string,object> agentResources;
  static string agentResourcePath;
  static string AgentHash(string value) { using(var hash=System.Security.Cryptography.SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(new UTF8Encoding(false,true).GetBytes(value))).Replace("-","").ToLowerInvariant(); }
  static string AgentLogon() {
    using(var identity=WindowsIdentity.GetCurrent()) {
      IntPtr data=Marshal.AllocHGlobal(256); try { int required; Check(AgentTokenInformation(identity.Token,10,data,256,out required)); if(required<16||required>256) throw new InvalidDataException(); return unchecked((ulong)Marshal.ReadInt64(data,8)).ToString("x16"); }
      finally { Marshal.FreeHGlobal(data); }
    }
  }
  static void AgentResourceSave() { Atomic(agentResourcePath,serializer.Serialize(agentResources)); }
  static void AgentCheckpoint(string phase,IntPtr owner) {
    agentResources["phase"]=phase; AgentResourceSave();
    Console.WriteLine(serializer.Serialize(new { format="cimiloop/agent-workspace-preparation/1.0.0",nonce=agentResources["nonce"],phase=phase,supervisor=agentResources["supervisor"] })); Console.Out.Flush();
    string line=null; Exception inputError=null; var input=new Thread(delegate() { try { line=AgentLine(2048); } catch(Exception error) { inputError=error; } }); input.IsBackground=true; input.Start();
    var watch=Stopwatch.StartNew(); while(!input.Join(25)) if(AgentControlExpired(watch)||WaitForSingleObject(owner,0)!=258) throw new InvalidDataException();
    if(AgentControlExpired(watch)) throw new InvalidDataException();
    AgentRequireInput(line,inputError);
    var reply=serializer.Deserialize<Dictionary<string,object>>(line); AgentKeys(reply,"format","nonce","phase");
    if(reply["format"] as string!="cimiloop/agent-workspace-prepare-continue/1.0.0"||reply["nonce"] as string!=(string)agentResources["nonce"]||reply["phase"] as string!=phase||WaitForSingleObject(owner,0)!=258||AgentTaskExpired()) throw new InvalidDataException();
  }
  static string AgentMap(string root) {
    using(var mutex=new Mutex(false,"Local\\CimiLoop.DriveAllocation")) {
      bool locked=false; try {
        try { locked=mutex.WaitOne(5000); } catch(AbandonedMutexException) { locked=true; }
        if(!locked) throw new InvalidDataException();
        for(char letter='Z';letter>='F';letter--) {
          string name=letter+":"; if(QueryDosDevice(name,new StringBuilder(4096),4096)!=0) continue;
          agentResources["mapping"]=name; AgentResourceSave(); // Original intent precedes the mapping.
          Check(DefineDosDevice(1|8,name,"\\??\\"+root)); return name;
        }
        throw new InvalidDataException();
      } finally { if(locked) mutex.ReleaseMutex(); }
    }
  }
  static string AgentLine(int maximum) {
    var input=Console.OpenStandardInput(); using(var bytes=new MemoryStream()) {
      while(true) { int value=input.ReadByte(); if(value<0) { if(bytes.Length!=0) throw new InvalidDataException(); return null; } if(value==10) break; if(bytes.Length>=maximum) throw new InvalidDataException(); bytes.WriteByte((byte)value); }
      return new UTF8Encoding(false,true).GetString(bytes.ToArray());
    }
  }
  static void AgentKeys(Dictionary<string,object> value,params string[] keys) {
    if(value==null||value.Count!=keys.Length) throw new InvalidDataException(); foreach(string key in keys) if(!value.ContainsKey(key)) throw new InvalidDataException();
  }
  static bool AgentSameIdentity(Dictionary<string,object> left,Dictionary<string,object> right) {
    AgentKeys(left,"pid","creation_ticks","image"); AgentKeys(right,"pid","creation_ticks","image");
    return Convert.ToInt32(left["pid"])==Convert.ToInt32(right["pid"])&&left["creation_ticks"] as string==right["creation_ticks"] as string&&String.Equals(left["image"] as string,right["image"] as string,StringComparison.OrdinalIgnoreCase);
  }
  static bool AgentProfileAbsent(string profile) {
    IntPtr sid; int hr=DeriveAppContainerSidFromAppContainerName(profile,out sid); if(hr!=0) Marshal.ThrowExceptionForHR(hr);
    try { using(var key=Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppContainer\Mappings\"+new SecurityIdentifier(sid).Value)) return key==null; }
    finally { FreeSid(sid); }
  }
  internal static int RecoverAgentWorkspace(string operation) {
    string outcome="unknown",reason="agent_resources_unproven"; bool disposed=false; IntPtr originalJob=IntPtr.Zero;
    try {
      operation=Path.GetFullPath(operation); Ordinary(operation);
      string configPath=Path.Combine(operation,"original-config.json"); Ordinary(configPath); string rawConfig=File.ReadAllText(configPath);
      var config=ObjectAt(configPath); var launch=ObjectAt(Path.Combine(operation,"original-launcher.json")); var ledger=ObjectAt(Path.Combine(operation,"agent-sandbox-resources.json"));
      AgentConfigDeadline(config);
      bool retainedLauncher=launch["format"] as string=="cimiloop/agent-workspace-launcher/2.0.0";
      if(retainedLauncher) AgentKeys(launch,"format","nonce","owner","supervisor","launcher_path","launcher_digest","launcher_original");
      else AgentKeys(launch,"format","nonce","owner","supervisor","launcher_path","launcher_digest");
      AgentKeys(ledger,"format","nonce","root","binary","profile","scope_digest","config_digest","owner","supervisor","runtime","mapping","job_name","job_assignment","phase","profile_intent","profile_was_absent","grants_intent","resources_disposed","user_sid","session_id","logon_luid");
      Guid guid; if(!Guid.TryParseExact(config["nonce"] as string,"D",out guid)) throw new InvalidDataException();
      string nonce=guid.ToString("D"),root=Path.Combine(operation,"sandbox"),binary=Path.GetFullPath((string)config["binary"]),profile="CimiLoop.AgentWorkspace."+guid.ToString("N");
      Ordinary(root); Ordinary(binary);
      if(config["root"] as string!=root||
        !retainedLauncher&&launch["format"] as string!="cimiloop/agent-workspace-launcher/1.0.0"||launch["nonce"] as string!=nonce||
        ledger["format"] as string!="cimiloop/agent-workspace-resources/1.0.0"||ledger["nonce"] as string!=nonce||ledger["root"] as string!=root||ledger["binary"] as string!=binary||
        ledger["profile"] as string!=profile||ledger["scope_digest"] as string!=config["scope_digest"] as string||ledger["config_digest"] as string!=AgentHash(rawConfig)||
        ledger["job_name"] as string!="Local\\"+profile||ledger["job_assignment"] as string!="atomic_on_create"||
        !(ledger["profile_intent"] is bool)||!(ledger["profile_was_absent"] is bool)||!(ledger["grants_intent"] is bool)||!(ledger["resources_disposed"] is bool)||
        !AgentSameIdentity((Dictionary<string,object>)ledger["owner"],(Dictionary<string,object>)config["owner"])||
        !AgentSameIdentity((Dictionary<string,object>)launch["owner"],(Dictionary<string,object>)config["owner"])||
        !AgentSameIdentity((Dictionary<string,object>)launch["supervisor"],(Dictionary<string,object>)ledger["supervisor"])) throw new InvalidDataException();
      string launcher=(string)launch["launcher_path"];
      if(retainedLauncher) {
        var proof=(Dictionary<string,object>)launch["launcher_original"];
        if(proof["format"] as string!="cimiloop/runtime-binary-original-proof/1.0.0"||proof["path"] as string!=launcher||proof["sha"] as string!=launch["launcher_digest"] as string) throw new InvalidDataException();
      }
      if(!String.Equals(Image(Process.GetCurrentProcess().Handle),launcher,StringComparison.OrdinalIgnoreCase)||
        !String.Equals((string)((Dictionary<string,object>)ledger["supervisor"])["image"],launcher,StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException();
      using(var hash=System.Security.Cryptography.SHA256.Create()) {
        string value=BitConverter.ToString(hash.ComputeHash(File.ReadAllBytes(launcher))).Replace("-","").ToLowerInvariant();
        if(value!=launch["launcher_digest"] as string) throw new InvalidDataException();
      }
      // DOS devices are scoped to the original logon; Local jobs to its session.
      // Another logon/session must not mistake its empty namespace for disposal.
      if(ledger["user_sid"] as string!=WindowsIdentity.GetCurrent().User.Value||ledger["logon_luid"] as string!=AgentLogon()||
        !(ledger["session_id"] is int)||(int)ledger["session_id"]!=Process.GetCurrentProcess().SessionId) { reason="agent_original_logon_mismatch"; throw new InvalidDataException(); }
      using(var mutex=new Mutex(false,"Local\\CimiLoop.AgentRecovery."+guid.ToString("N"))) {
        bool locked=false; try {
          try { locked=mutex.WaitOne(5000); } catch(AbandonedMutexException) { locked=true; }
          if(!locked) throw new InvalidDataException();
          // Reload under the original-operation recovery lock.
          var fresh=ObjectAt(Path.Combine(operation,"agent-sandbox-resources.json"));
          if(serializer.Serialize(fresh)!=serializer.Serialize(ledger)) {
            var expected=new Dictionary<string,object>(ledger); expected["resources_disposed"]=true; expected["phase"]="recovered";
            if(serializer.Serialize(fresh)!=serializer.Serialize(expected)) throw new InvalidDataException(); ledger=fresh;
          }
          if((bool)ledger["resources_disposed"]) { disposed=true; outcome="recovered"; reason="agent_resources_already_disposed"; }
          else {
            string ownerState=InspectIdentity((Dictionary<string,object>)ledger["owner"]),nativeState=InspectIdentity((Dictionary<string,object>)ledger["supervisor"]);
            var runtime=ledger["runtime"] as Dictionary<string,object>; string runtimeState=InspectIdentity(runtime);
            if(runtime!=null&&!String.Equals((string)runtime["image"],binary,StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException();
            if(ownerState=="active"||nativeState=="active"||runtimeState=="active") { outcome="active"; reason="agent_owned_process_active"; }
            else if(ownerState!="absent"||nativeState!="absent"||runtimeState!="absent") reason="agent_original_identity_unproven";
            else {
              // Query only: never terminate a job discovered through recovery.
              // Holding it while inspecting closes the create/identity gap.
              originalJob=OpenJobObject(4,false,(string)ledger["job_name"]);
              if(originalJob==IntPtr.Zero&&Marshal.GetLastWin32Error()!=2) throw new InvalidDataException();
              AgentAccounting accounting=new AgentAccounting();
              if(originalJob!=IntPtr.Zero&&!QueryInformationJobObject(originalJob,1,out accounting,Marshal.SizeOf(typeof(AgentAccounting)),IntPtr.Zero)) throw new InvalidDataException();
              if(accounting.active!=0) { outcome="active"; reason="agent_original_job_active"; }
              else {
                string mapping=ledger["mapping"] as string;
                if(mapping!=null) {
                  if(mapping.Length!=2||mapping[0]<'F'||mapping[0]>'Z'||mapping[1]!=':') throw new InvalidDataException();
                  var target=new StringBuilder(4096); uint found=QueryDosDevice(mapping,target,4096);
                  if(found!=0) { if(target.ToString()!="\\??\\"+root) { reason="agent_original_mapping_mismatch"; throw new InvalidDataException(); } Check(DefineDosDevice(1|2|4|8,mapping,"\\??\\"+root)); }
                  else if(Marshal.GetLastWin32Error()!=2) throw new InvalidDataException();
                }
                if((bool)ledger["profile_intent"]) {
                  if(!(bool)ledger["profile_was_absent"]) throw new InvalidDataException();
                  IntPtr sid; int hr=DeriveAppContainerSidFromAppContainerName(profile,out sid); if(hr!=0) Marshal.ThrowExceptionForHR(hr);
                  try {
                    var principal=new SecurityIdentifier(sid);
                    if((bool)ledger["grants_intent"]) {
                      RemoveGrant(root,principal,FileSystemRights.ReadAttributes|FileSystemRights.Traverse,true,false);
                      RemoveGrant(Path.Combine(root,"workspace"),principal,FileSystemRights.ReadAndExecute,true,true);
                      RemoveGrant(Path.Combine(root,"state"),principal,FileSystemRights.Modify,true,true);
                      RemoveGrant(Path.Combine(root,"config"),principal,FileSystemRights.ReadAndExecute|FileSystemRights.WriteAttributes,true,true);
                      RemoveGrant(binary,principal,FileSystemRights.ReadAndExecute,false,false);
                    }
                    int deleted=DeleteAppContainerProfile(profile); if(deleted!=0&&deleted!=unchecked((int)0x80070002)&&deleted!=unchecked((int)0x80070003)) Marshal.ThrowExceptionForHR(deleted);
                  } finally { FreeSid(sid); }
                }
                ledger["resources_disposed"]=true; ledger["phase"]="recovered"; Atomic(Path.Combine(operation,"agent-sandbox-resources.json"),serializer.Serialize(ledger));
                disposed=true; outcome="recovered"; reason="agent_original_resources_disposed";
              }
            }
          }
        } finally { if(locked) mutex.ReleaseMutex(); }
      }
    } catch { }
    finally { if(originalJob!=IntPtr.Zero) CloseHandle(originalJob); }
    Console.WriteLine(serializer.Serialize(new { outcome=outcome,reason=reason,resources_disposed=disposed,completion_proven=false }));
    return outcome=="unknown"?12:0;
  }
  internal static int LaunchAgentWorkspace() {
    Console.OutputEncoding=new UTF8Encoding(false);
    string root=null,binary=null,profile=null,mapping=null,nonce=null; IntPtr sid=IntPtr.Zero,list=IntPtr.Zero,capsMemory=IntPtr.Zero,handles=IntPtr.Zero,job=IntPtr.Zero,jobList=IntPtr.Zero,owner=IntPtr.Zero,nul=IntPtr.Zero;
    PROCESSINFO process=new PROCESSINFO(); bool started=false,profileCreated=false,runtimeResumed=false; int exit=12; ulong? runtimeStoppedUptime=null; string reason="agent_sandbox_unavailable"; var cleanupErrors=new List<string>();
    try {
      string originalConfig=AgentLine(65536); var config=serializer.Deserialize<Dictionary<string,object>>(originalConfig);
      agentTaskDeadline=AgentConfigDeadline(config); if(AgentTaskExpired()) throw new InvalidDataException();
      Guid guid,pipeGuid;
      if(!Guid.TryParseExact(config["nonce"] as string,"D",out guid)||
        !Guid.TryParseExact(config["pipe_nonce"] as string,"D",out pipeGuid)||!System.Text.RegularExpressions.Regex.IsMatch(config["scope_digest"] as string??"","^[a-f0-9]{64}$")) throw new InvalidDataException();
      nonce=guid.ToString("D"); root=Path.GetFullPath((string)config["root"]); binary=Path.GetFullPath((string)config["binary"]); Ordinary(root); Ordinary(binary);
      string workspace=Path.Combine(root,"workspace"),state=Path.Combine(root,"state"),modules=Path.Combine(root,"config"); Ordinary(workspace); Ordinary(state); Ordinary(modules);
      if(!Directory.Exists(workspace)||!Directory.Exists(state)||!Directory.Exists(modules)) throw new InvalidDataException();
      var originalOwner=(Dictionary<string,object>)config["owner"]; AgentKeys(originalOwner,"pid","creation_ticks","image"); int ownerPid=Convert.ToInt32(originalOwner["pid"]);
      owner=OpenProcess(0x1000|0x100000,false,ownerPid); if(owner==IntPtr.Zero||WaitForSingleObject(owner,0)!=258||Creation(owner)!=(string)originalOwner["creation_ticks"]||
        !String.Equals(Image(owner),(string)originalOwner["image"],StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException();
      int elapsed=Convert.ToInt32(config["elapsed_ms"]); bool taskPolicy=config.ContainsKey("lifetime_policy")&&config["lifetime_policy"] as string=="agent_task/1.0.0"; if(elapsed<1000||elapsed>(taskPolicy?3600000:180000)) throw new InvalidDataException();
      agentProductionTask=taskPolicy&&agentTaskDeadline!=0;
      var options=(Dictionary<string,object>)config["provider_options"];
      bool production=taskPolicy||config["format"] as string=="cimiloop/agent-workspace-sandbox-config/3.0.0",checksOnly=options.ContainsKey("check_only");
      if(production) {
        AgentKeys(options,"admission_digest");
        if(!(options["admission_digest"] is string)||!System.Text.RegularExpressions.Regex.IsMatch((string)options["admission_digest"],"^[a-f0-9]{64}$")||agentTaskDeadline==0) throw new InvalidDataException();
        string prompt=config["prompt"] as string;
        if(String.IsNullOrWhiteSpace(prompt)||new UTF8Encoding(false,true).GetByteCount(prompt)>32768||File.ReadAllText(Path.Combine(modules,"task-packet.txt"),new UTF8Encoding(false,true))!=prompt) throw new InvalidDataException();
      } else if(checksOnly) {
        AgentKeys(options,"check_id","check_only"); if(!(options["check_only"] is bool)||!(bool)options["check_only"]) throw new InvalidDataException();
      } else if(options.ContainsKey("check_id")) {
        AgentKeys(options,"path","expectedDigest","replacement","check_id");
      } else AgentKeys(options,"path","expectedDigest","replacement");
      if(options.ContainsKey("check_id")&&(!(options["check_id"] is string)||!System.Text.RegularExpressions.Regex.IsMatch((string)options["check_id"],"^[a-zA-Z0-9_-]{1,128}$"))) throw new InvalidDataException();
      profile="CimiLoop.AgentWorkspace."+guid.ToString("N");
      agentResourcePath=Path.Combine(Path.GetDirectoryName(root),"agent-sandbox-resources.json");
      agentResources=new Dictionary<string,object> {
        {"format","cimiloop/agent-workspace-resources/1.0.0"},{"nonce",nonce},{"root",root},{"binary",binary},{"profile",profile},
        {"scope_digest",config["scope_digest"]},{"config_digest",AgentHash(originalConfig)},{"owner",originalOwner},
        {"supervisor",Identity(Process.GetCurrentProcess().Id)},{"runtime",null},{"mapping",null},
        {"job_name","Local\\"+profile},{"job_assignment","atomic_on_create"},{"phase","registered"},
        {"profile_intent",false},{"profile_was_absent",AgentProfileAbsent(profile)},{"grants_intent",false},{"resources_disposed",false},
        {"user_sid",WindowsIdentity.GetCurrent().User.Value},{"session_id",Process.GetCurrentProcess().SessionId},{"logon_luid",AgentLogon()}
      };
      AgentCheckpoint("registered",owner);
      if(!(bool)agentResources["profile_was_absent"]) throw new InvalidDataException();
      agentResources["profile_intent"]=true; AgentCheckpoint("profile_intent",owner);
      int hr=CreateAppContainerProfile(profile,profile,"CimiLoop fixed workspace tool rehearsal",IntPtr.Zero,0,out sid); if(hr!=0) Marshal.ThrowExceptionForHR(hr); profileCreated=true;
      var principal=new SecurityIdentifier(sid);
      agentResources["grants_intent"]=true; AgentCheckpoint("grants_intent",owner);
      Grant(root,principal,FileSystemRights.ReadAttributes|FileSystemRights.Traverse,true,false);
      Grant(workspace,principal,FileSystemRights.ReadAndExecute,true,true); Grant(state,principal,FileSystemRights.Modify,true,true);
      // Bun requires WriteAttributes on module directories; file content and
      // directory entry writes remain denied. No installed global binary ACE.
      Grant(modules,principal,FileSystemRights.ReadAndExecute|FileSystemRights.WriteAttributes,true,true); Grant(binary,principal,FileSystemRights.ReadAndExecute,false,false);
      AgentCheckpoint("granted",owner);
      mapping=AgentMap(root); AgentCheckpoint("mapped",owner); string privateState=mapping+"\\state";
      foreach(string name in new string[] {"TEMP","TMP","USERPROFILE","HOME","OPENCODE_TEST_HOME"}) Environment.SetEnvironmentVariable(name,privateState);
      Environment.SetEnvironmentVariable("APPDATA",privateState+"\\AppData\\Roaming"); Environment.SetEnvironmentVariable("LOCALAPPDATA",privateState+"\\AppData\\Local");
      foreach(string name in new string[] {"DATA","CONFIG","CACHE","STATE"}) Environment.SetEnvironmentVariable("XDG_"+name+"_HOME",privateState+"\\"+name.ToLower());
      Environment.SetEnvironmentVariable("XDG_CONFIG_HOME",mapping+"\\config\\global");
      Environment.SetEnvironmentVariable("OPENCODE_CONFIG_DIR",mapping+"\\config");
      Environment.SetEnvironmentVariable("npm_config_offline","true"); Environment.SetEnvironmentVariable("npm_config_fetch_retries","0");
      Environment.SetEnvironmentVariable("npm_config_ignore_scripts","true");
      Environment.SetEnvironmentVariable("CIMILOOP_AGENT_WORKSPACE_PIPE","\\\\.\\pipe\\CimiLoop.AgentWorkspace."+pipeGuid.ToString("D"));
      Environment.SetEnvironmentVariable("CIMILOOP_AGENT_WORKSPACE_SCOPE",(string)config["scope_digest"]);
      // One SDK wait ceiling, never renewed per model/tool request. The original
      // Native Task deadline remains authoritative, including JS startup delay.
      if(agentProductionTask) { ulong now=AgentTickCount();Check(now<agentTaskDeadline);Environment.SetEnvironmentVariable("CIMILOOP_AGENT_TASK_WAIT_MS",Math.Min(agentTaskDeadline-now,3600000UL).ToString(System.Globalization.CultureInfo.InvariantCulture)); }
      Environment.SetEnvironmentVariable("CIMILOOP_AGENT_WORKSPACE_PRIVATE_CANARY",Path.Combine(Path.GetDirectoryName(root),"workspace-private-canary.txt"));
      var permission=new Dictionary<string,object> { {"*","deny"} };
      if(!checksOnly) { permission.Add("cimi_read","allow"); permission.Add("cimi_replace","allow"); }
      if(production||options.ContainsKey("check_id")) permission.Add("cimi_check","allow");
      string providerId=production?"cimiloop-host-gateway":"cimiloop-workspace-fixture",modelId=production?"host-approved":"workspace-fixture";
      string modelRoute=providerId+"/"+modelId,providerModule=production?"opencode-host-gateway-provider.mjs":"opencode-workspace-provider-fixture.mjs";
      var model=new { name=production?"Original host-approved model":"Constructed workspace tool responses",tool_call=true,limit=new { context=65536,output=512 } };
      var models=new Dictionary<string,object> { {modelId,model} };
      var providers=new Dictionary<string,object> { {providerId,new { npm="file:///"+mapping+"/config/"+providerModule,options=options,models=models }} };
      Environment.SetEnvironmentVariable("OPENCODE_CONFIG_CONTENT",serializer.Serialize(new { autoupdate=false,share="disabled",snapshot=false,plugin=new string[0],
        enabled_providers=new string[] {providerId},model=modelRoute,small_model=modelRoute,provider=providers,
        permission=permission,agent=new { title=new { disable=true },summary=new { disable=true },compaction=new { disable=true },cimi=new { mode="primary",steps=production?64:4,description=production?"Admitted original Agent workspace execution":"Fixed workspace tool rehearsal",permission=permission } },compaction=new { auto=false,prune=false },default_agent="cimi" }));
      // Runtime cannot consume the supervisor's private resume/cancel input.
      var sa=new AgentSA { length=Marshal.SizeOf(typeof(AgentSA)),inherit=true }; nul=CreateFile("NUL",0x80000000,3,ref sa,3,0,IntPtr.Zero); Check(nul!=new IntPtr(-1));
      var caps=new CAPS { sid=sid }; capsMemory=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(CAPS))); Marshal.StructureToPtr(caps,capsMemory,false);
      IntPtr size=IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero,3,0,ref size); list=Marshal.AllocHGlobal(size); Check(InitializeProcThreadAttributeList(list,3,0,ref size));
      Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x20009),capsMemory,new IntPtr(Marshal.SizeOf(typeof(CAPS))),IntPtr.Zero,IntPtr.Zero));
      var startup=new STARTUPINFOEX(); startup.info.cb=Marshal.SizeOf(typeof(STARTUPINFOEX)); startup.attributes=list; startup.info.flags=0x100; startup.info.input=nul; startup.info.output=GetStdHandle(-11); startup.info.error=GetStdHandle(-12);
      handles=Marshal.AllocHGlobal(IntPtr.Size*3); Marshal.WriteIntPtr(handles,0,nul); Marshal.WriteIntPtr(handles,IntPtr.Size,startup.info.output); Marshal.WriteIntPtr(handles,IntPtr.Size*2,startup.info.error);
      Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles,new IntPtr(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero));
      job=AgentCreateJob(IntPtr.Zero,(string)agentResources["job_name"]); int jobError=Marshal.GetLastWin32Error(); Check(job!=IntPtr.Zero); if(jobError==183) throw new InvalidDataException();
      var limits=new JOBLIMIT(); limits.basic.flags=0x2000|0x8|0x200; limits.basic.active=1; limits.jobMem=new UIntPtr(2147483648UL); Check(SetInformationJobObject(job,9,ref limits,Marshal.SizeOf(typeof(JOBLIMIT))));
      jobList=Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobList,job); Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x2000d),jobList,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
      var arguments=new List<string>(new string[] {"run","--pure","--format","json","--model",modelRoute,"--agent","cimi"});
      if(production) { arguments.Add("--file"); arguments.Add(mapping+"\\config\\task-packet.txt"); arguments.Add("--"); }
      arguments.Add(production?"Execute the original admitted task packet through the fixed tools.":"Execute the fixed workspace tool rehearsal.");
      var command=new StringBuilder(Quote(binary)); foreach(string arg in arguments) command.Append(" ").Append(Quote(arg));
      AgentCheckpoint("process_create_intent",owner);
      Check(CreateProcess(binary,command,IntPtr.Zero,IntPtr.Zero,true,0x80000|0x08000000|0x4,IntPtr.Zero,mapping+"\\workspace",ref startup,out process)); started=true;
      agentResources["runtime"]=new Dictionary<string,object> { {"pid",process.pid},{"creation_ticks",Creation(process.process)},{"image",Image(process.process)} };
      AgentCheckpoint("runtime_created",owner);
      agentResources["phase"]="suspended"; AgentResourceSave();
      string originalProof=serializer.Serialize(new { format="cimiloop/agent-workspace-sandbox/1.0.0",phase="suspended",nonce=nonce,
        supervisor=Identity(Process.GetCurrentProcess().Id),peer=Identity(process.pid),appcontainer_sid=principal.Value,network_capability_sids=new string[0],active_process_limit=1 });
      Atomic(Path.Combine(Path.GetDirectoryName(root),"agent-sandbox-original.json"),originalProof);
      Console.WriteLine(originalProof); Console.Out.Flush();
      string resume=null; Exception resumeError=null; var resumeWorker=new Thread(delegate() { try { resume=AgentLine(1024); } catch(Exception error) { resumeError=error; } }); resumeWorker.IsBackground=true; resumeWorker.Start();
      var watch=Stopwatch.StartNew(); while(!resumeWorker.Join(50)) if(AgentControlExpired(watch)||WaitForSingleObject(owner,0)!=258) throw new InvalidDataException();
      if(AgentControlExpired(watch)) throw new InvalidDataException();
      AgentRequireInput(resume,resumeError);
      var release=serializer.Deserialize<Dictionary<string,object>>(resume); AgentKeys(release,"format","nonce"); if(release["format"] as string!="cimiloop/agent-workspace-resume/1.0.0"||release["nonce"] as string!=nonce) throw new InvalidDataException();
      if(WaitForSingleObject(owner,0)!=258||AgentTaskExpired()) throw new InvalidDataException(); Check(ResumeThread(process.thread)!=0xffffffff); runtimeResumed=true;
      agentResources["phase"]="running"; AgentResourceSave();
      var inputWatcher=new Thread(delegate() { try { AgentRequireInput(AgentLine(2048),null); throw new InvalidDataException(); } catch(Exception error) { agentInputError=error; } finally { agentParentEnded=true; } }); inputWatcher.IsBackground=true; inputWatcher.Start();
      watch.Restart(); while(WaitForSingleObject(process.process,50)==258) {
        if(AgentTaskExpired()||watch.ElapsedMilliseconds>=elapsed) { reason=AgentTaskExpired()?"agent_sandbox_task_deadline":"agent_sandbox_timeout"; Check(TerminateJobObject(job,125)); Check(WaitForSingleObject(process.process,5000)==0); break; }
        if(agentParentEnded) { inputWatcher.Join(); AgentRequireInput(null,agentInputError); }
        if(WaitForSingleObject(owner,0)!=258) { reason="agent_sandbox_parent_ended"; Check(TerminateJobObject(job,125)); Check(WaitForSingleObject(process.process,5000)==0); break; }
      }
      runtimeStoppedUptime=AgentTickCount();
      if(reason=="agent_sandbox_unavailable") { uint code; Check(GetExitCodeProcess(process.process,out code)); exit=(int)code; reason="exited"; }
    } catch(Exception error) {
      bool cancelled=error is AgentCancellationException&&!AgentTaskExpired(),closed=error is AgentInputClosedException&&!AgentTaskExpired();
      if(cancelled) {try {AgentCancellation((AgentCancellationException)error,runtimeResumed);reason="agent_sandbox_cancel_requested";exit=130;}catch(Exception proofError){error=proofError;cancelled=false;}}
      else if(closed) { try { AgentInterruption(runtimeResumed); reason="agent_sandbox_parent_ended"; exit=125; } catch(Exception proofError) { error=proofError; closed=false; } }
      if(!closed&&!cancelled) {
      reason=AgentTaskExpired()?"agent_sandbox_task_deadline":"agent_sandbox_unavailable";
      Console.Error.WriteLine(serializer.Serialize(new {format="cimiloop/agent-workspace-native-failure/1.0.0",phase=agentResources==null?"config":agentResources["phase"],reason=reason,exception_type=error.GetType().Name,native_error=error is System.ComponentModel.Win32Exception?((System.ComponentModel.Win32Exception)error).NativeErrorCode:0}));
      }
    }
    finally {
      if(started) { if(!TerminateJobObject(job,125)||WaitForSingleObject(process.process,5000)!=0) cleanupErrors.Add("process"); else if(!runtimeStoppedUptime.HasValue) runtimeStoppedUptime=AgentTickCount(); }
      if(process.thread!=IntPtr.Zero) CloseHandle(process.thread); if(process.process!=IntPtr.Zero) CloseHandle(process.process); if(job!=IntPtr.Zero) CloseHandle(job); if(owner!=IntPtr.Zero) CloseHandle(owner); if(nul!=IntPtr.Zero&&nul!=new IntPtr(-1)) CloseHandle(nul);
      if(list!=IntPtr.Zero) { DeleteProcThreadAttributeList(list); Marshal.FreeHGlobal(list); } if(capsMemory!=IntPtr.Zero) Marshal.FreeHGlobal(capsMemory); if(handles!=IntPtr.Zero) Marshal.FreeHGlobal(handles); if(jobList!=IntPtr.Zero) Marshal.FreeHGlobal(jobList);
      if(mapping!=null&&!DefineDosDevice(1|2|4|8,mapping,"\\??\\"+root)) cleanupErrors.Add("drive");
      for(int i=grants.Count-1;i>=0;i--) { var grant=grants[i]; try { RemoveGrant(grant.path,new SecurityIdentifier(sid),grant.rule.FileSystemRights,grant.directory,grant.rule.InheritanceFlags!=InheritanceFlags.None); } catch { cleanupErrors.Add("acl"); } }
      if(sid!=IntPtr.Zero) FreeSid(sid); if(profileCreated&&DeleteAppContainerProfile(profile)!=0) cleanupErrors.Add("profile");
      if(agentResources!=null) { try { agentResources["phase"]="ended"; agentResources["resources_disposed"]=cleanupErrors.Count==0; AgentResourceSave(); } catch { cleanupErrors.Add("resource_proof"); } }
      string disposal=serializer.Serialize(new { format="cimiloop/agent-workspace-sandbox/1.0.0",phase="ended",nonce=nonce,reason=reason,exit_code=exit,runtime_stopped_uptime_ms=runtimeStoppedUptime,resources_disposed=cleanupErrors.Count==0,cleanup_errors=cleanupErrors.ToArray(),formal_agent_execution_enabled=false });
      if(root!=null) { try { Atomic(Path.Combine(Path.GetDirectoryName(root),"agent-sandbox-cleanup.json"),disposal); } catch { cleanupErrors.Add("proof"); } }
      Console.WriteLine(disposal); Console.Out.Flush();
    }
    return cleanupErrors.Count==0?exit:12;
  }
}
