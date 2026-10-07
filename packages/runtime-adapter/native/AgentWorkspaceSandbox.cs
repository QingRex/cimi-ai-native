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
  static int Main() { return AppContainer.LaunchAgentWorkspace(); }
}
partial class AppContainer {
  [StructLayout(LayoutKind.Sequential)] struct AgentSA { public int length; public IntPtr descriptor; [MarshalAs(UnmanagedType.Bool)] public bool inherit; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateFile(string path,uint access,uint share,ref AgentSA security,uint creation,uint flags,IntPtr template);
  static volatile bool agentParentEnded;
  static string AgentLine(int maximum) {
    var input=Console.OpenStandardInput(); using(var bytes=new MemoryStream()) {
      while(true) { int value=input.ReadByte(); if(value<0) return null; if(value==10) break; if(bytes.Length>=maximum) throw new InvalidDataException(); bytes.WriteByte((byte)value); }
      return new UTF8Encoding(false,true).GetString(bytes.ToArray());
    }
  }
  static void AgentKeys(Dictionary<string,object> value,params string[] keys) {
    if(value==null||value.Count!=keys.Length) throw new InvalidDataException(); foreach(string key in keys) if(!value.ContainsKey(key)) throw new InvalidDataException();
  }
  internal static int LaunchAgentWorkspace() {
    Console.OutputEncoding=new UTF8Encoding(false);
    string root=null,binary=null,profile=null,mapping=null,nonce=null; IntPtr sid=IntPtr.Zero,list=IntPtr.Zero,capsMemory=IntPtr.Zero,handles=IntPtr.Zero,job=IntPtr.Zero,jobList=IntPtr.Zero,owner=IntPtr.Zero,nul=IntPtr.Zero;
    PROCESSINFO process=new PROCESSINFO(); bool started=false; int exit=12; string reason="agent_sandbox_unavailable"; var cleanupErrors=new List<string>();
    try {
      var config=serializer.Deserialize<Dictionary<string,object>>(AgentLine(32768));
      AgentKeys(config,"format","nonce","root","binary","owner","pipe_nonce","scope_digest","elapsed_ms","provider_options");
      Guid guid,pipeGuid;
      if(config["format"] as string!="cimiloop/agent-workspace-sandbox-config/1.0.0"||!Guid.TryParseExact(config["nonce"] as string,"D",out guid)||
        !Guid.TryParseExact(config["pipe_nonce"] as string,"D",out pipeGuid)||!System.Text.RegularExpressions.Regex.IsMatch(config["scope_digest"] as string??"","^[a-f0-9]{64}$")) throw new InvalidDataException();
      nonce=guid.ToString("D"); root=Path.GetFullPath((string)config["root"]); binary=Path.GetFullPath((string)config["binary"]); Ordinary(root); Ordinary(binary);
      string workspace=Path.Combine(root,"workspace"),state=Path.Combine(root,"state"),modules=Path.Combine(root,"config"); Ordinary(workspace); Ordinary(state); Ordinary(modules);
      if(!Directory.Exists(workspace)||!Directory.Exists(state)||!Directory.Exists(modules)) throw new InvalidDataException();
      var originalOwner=(Dictionary<string,object>)config["owner"]; AgentKeys(originalOwner,"pid","creation_ticks","image"); int ownerPid=Convert.ToInt32(originalOwner["pid"]);
      owner=OpenProcess(0x1000|0x100000,false,ownerPid); if(owner==IntPtr.Zero||WaitForSingleObject(owner,0)!=258||Creation(owner)!=(string)originalOwner["creation_ticks"]||
        !String.Equals(Image(owner),(string)originalOwner["image"],StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException();
      int elapsed=Convert.ToInt32(config["elapsed_ms"]); if(elapsed<1000||elapsed>180000) throw new InvalidDataException();
      var options=(Dictionary<string,object>)config["provider_options"]; AgentKeys(options,"path","expectedDigest","replacement");
      profile="CimiLoop.AgentWorkspace."+guid.ToString("N"); int hr=CreateAppContainerProfile(profile,profile,"CimiLoop fixed workspace tool rehearsal",IntPtr.Zero,0,out sid); if(hr!=0) Marshal.ThrowExceptionForHR(hr);
      var principal=new SecurityIdentifier(sid);
      Grant(root,principal,FileSystemRights.ReadAttributes|FileSystemRights.Traverse,true,false);
      Grant(workspace,principal,FileSystemRights.ReadAndExecute,true,true); Grant(state,principal,FileSystemRights.Modify,true,true);
      // Bun requires WriteAttributes on module directories; file content and
      // directory entry writes remain denied. No installed global binary ACE.
      Grant(modules,principal,FileSystemRights.ReadAndExecute|FileSystemRights.WriteAttributes,true,true); Grant(binary,principal,FileSystemRights.ReadAndExecute,false,false);
      mapping=Map(root); string privateState=mapping+"\\state";
      foreach(string name in new string[] {"TEMP","TMP","USERPROFILE","HOME","OPENCODE_TEST_HOME"}) Environment.SetEnvironmentVariable(name,privateState);
      Environment.SetEnvironmentVariable("APPDATA",privateState+"\\AppData\\Roaming"); Environment.SetEnvironmentVariable("LOCALAPPDATA",privateState+"\\AppData\\Local");
      foreach(string name in new string[] {"DATA","CONFIG","CACHE","STATE"}) Environment.SetEnvironmentVariable("XDG_"+name+"_HOME",privateState+"\\"+name.ToLower());
      Environment.SetEnvironmentVariable("XDG_CONFIG_HOME",mapping+"\\config\\global");
      Environment.SetEnvironmentVariable("OPENCODE_CONFIG_DIR",mapping+"\\config");
      Environment.SetEnvironmentVariable("npm_config_offline","true"); Environment.SetEnvironmentVariable("npm_config_fetch_retries","0");
      Environment.SetEnvironmentVariable("npm_config_ignore_scripts","true");
      Environment.SetEnvironmentVariable("CIMILOOP_AGENT_WORKSPACE_PIPE","\\\\.\\pipe\\CimiLoop.AgentWorkspace."+pipeGuid.ToString("D"));
      Environment.SetEnvironmentVariable("CIMILOOP_AGENT_WORKSPACE_SCOPE",(string)config["scope_digest"]);
      Environment.SetEnvironmentVariable("CIMILOOP_AGENT_WORKSPACE_PRIVATE_CANARY",Path.Combine(Path.GetDirectoryName(root),"workspace-private-canary.txt"));
      var permission=new Dictionary<string,object> { {"*","deny"},{"cimi_read","allow"},{"cimi_replace","allow"} };
      var model=new { name="Constructed workspace tool responses",tool_call=true,limit=new { context=65536,output=512 } };
      var models=new Dictionary<string,object> { {"workspace-fixture",model} };
      var providers=new Dictionary<string,object> { {"cimiloop-workspace-fixture",new { npm="file:///"+mapping+"/config/opencode-workspace-provider-fixture.mjs",options=options,models=models }} };
      Environment.SetEnvironmentVariable("OPENCODE_CONFIG_CONTENT",serializer.Serialize(new { autoupdate=false,share="disabled",snapshot=false,plugin=new string[0],
        enabled_providers=new string[] {"cimiloop-workspace-fixture"},model="cimiloop-workspace-fixture/workspace-fixture",small_model="cimiloop-workspace-fixture/workspace-fixture",provider=providers,
        permission=permission,agent=new { cimi=new { mode="primary",steps=4,description="Fixed workspace tool rehearsal",permission=permission } },default_agent="cimi" }));
      // Runtime cannot consume the supervisor's private resume/cancel input.
      var sa=new AgentSA { length=Marshal.SizeOf(typeof(AgentSA)),inherit=true }; nul=CreateFile("NUL",0x80000000,3,ref sa,3,0,IntPtr.Zero); Check(nul!=new IntPtr(-1));
      var caps=new CAPS { sid=sid }; capsMemory=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(CAPS))); Marshal.StructureToPtr(caps,capsMemory,false);
      IntPtr size=IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero,3,0,ref size); list=Marshal.AllocHGlobal(size); Check(InitializeProcThreadAttributeList(list,3,0,ref size));
      Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x20009),capsMemory,new IntPtr(Marshal.SizeOf(typeof(CAPS))),IntPtr.Zero,IntPtr.Zero));
      var startup=new STARTUPINFOEX(); startup.info.cb=Marshal.SizeOf(typeof(STARTUPINFOEX)); startup.attributes=list; startup.info.flags=0x100; startup.info.input=nul; startup.info.output=GetStdHandle(-11); startup.info.error=GetStdHandle(-12);
      handles=Marshal.AllocHGlobal(IntPtr.Size*3); Marshal.WriteIntPtr(handles,0,nul); Marshal.WriteIntPtr(handles,IntPtr.Size,startup.info.output); Marshal.WriteIntPtr(handles,IntPtr.Size*2,startup.info.error);
      Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles,new IntPtr(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero));
      job=CreateJobObject(IntPtr.Zero,null); Check(job!=IntPtr.Zero); var limits=new JOBLIMIT(); limits.basic.flags=0x2000|0x8|0x200; limits.basic.active=1; limits.jobMem=new UIntPtr(2147483648UL); Check(SetInformationJobObject(job,9,ref limits,Marshal.SizeOf(typeof(JOBLIMIT))));
      jobList=Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobList,job); Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x2000d),jobList,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
      var command=new StringBuilder(Quote(binary)); foreach(string arg in new string[] {"run","--pure","--format","json","--model","cimiloop-workspace-fixture/workspace-fixture","--agent","cimi","Execute the fixed workspace tool rehearsal."}) command.Append(" ").Append(Quote(arg));
      Check(CreateProcess(binary,command,IntPtr.Zero,IntPtr.Zero,true,0x80000|0x08000000|0x4,IntPtr.Zero,mapping+"\\workspace",ref startup,out process)); started=true;
      string originalProof=serializer.Serialize(new { format="cimiloop/agent-workspace-sandbox/1.0.0",phase="suspended",nonce=nonce,
        supervisor=Identity(Process.GetCurrentProcess().Id),peer=Identity(process.pid),appcontainer_sid=principal.Value,network_capability_sids=new string[0],active_process_limit=1 });
      Atomic(Path.Combine(Path.GetDirectoryName(root),"agent-sandbox-original.json"),originalProof);
      Console.WriteLine(originalProof); Console.Out.Flush();
      string resume=null; var resumeWorker=new Thread(delegate() { try { resume=AgentLine(1024); } catch { } }); resumeWorker.IsBackground=true; resumeWorker.Start();
      var watch=Stopwatch.StartNew(); while(!resumeWorker.Join(50)) if(watch.ElapsedMilliseconds>10000||WaitForSingleObject(owner,0)!=258) throw new InvalidDataException();
      var release=serializer.Deserialize<Dictionary<string,object>>(resume); AgentKeys(release,"format","nonce"); if(release["format"] as string!="cimiloop/agent-workspace-resume/1.0.0"||release["nonce"] as string!=nonce) throw new InvalidDataException();
      if(WaitForSingleObject(owner,0)!=258) throw new InvalidDataException(); Check(ResumeThread(process.thread)!=0xffffffff);
      var inputWatcher=new Thread(delegate() { try { AgentLine(1024); } catch { } finally { agentParentEnded=true; } }); inputWatcher.IsBackground=true; inputWatcher.Start();
      watch.Restart(); while(WaitForSingleObject(process.process,50)==258) {
        if(agentParentEnded||WaitForSingleObject(owner,0)!=258||watch.ElapsedMilliseconds>=elapsed) { reason=watch.ElapsedMilliseconds>=elapsed?"agent_sandbox_timeout":"agent_sandbox_parent_ended"; Check(TerminateJobObject(job,125)); Check(WaitForSingleObject(process.process,5000)==0); break; }
      }
      if(reason=="agent_sandbox_unavailable") { uint code; Check(GetExitCodeProcess(process.process,out code)); exit=(int)code; reason="exited"; }
    } catch { reason="agent_sandbox_unavailable"; }
    finally {
      if(started) { if(!TerminateJobObject(job,125)||WaitForSingleObject(process.process,5000)!=0) cleanupErrors.Add("process"); }
      if(process.thread!=IntPtr.Zero) CloseHandle(process.thread); if(process.process!=IntPtr.Zero) CloseHandle(process.process); if(job!=IntPtr.Zero) CloseHandle(job); if(owner!=IntPtr.Zero) CloseHandle(owner); if(nul!=IntPtr.Zero&&nul!=new IntPtr(-1)) CloseHandle(nul);
      if(list!=IntPtr.Zero) { DeleteProcThreadAttributeList(list); Marshal.FreeHGlobal(list); } if(capsMemory!=IntPtr.Zero) Marshal.FreeHGlobal(capsMemory); if(handles!=IntPtr.Zero) Marshal.FreeHGlobal(handles); if(jobList!=IntPtr.Zero) Marshal.FreeHGlobal(jobList);
      if(mapping!=null&&!DefineDosDevice(1|2|4|8,mapping,"\\??\\"+root)) cleanupErrors.Add("drive");
      for(int i=grants.Count-1;i>=0;i--) { var grant=grants[i]; try { RemoveGrant(grant.path,new SecurityIdentifier(sid),grant.rule.FileSystemRights,grant.directory,grant.rule.InheritanceFlags!=InheritanceFlags.None); } catch { cleanupErrors.Add("acl"); } }
      if(sid!=IntPtr.Zero) { FreeSid(sid); if(DeleteAppContainerProfile(profile)!=0) cleanupErrors.Add("profile"); }
      string disposal=serializer.Serialize(new { format="cimiloop/agent-workspace-sandbox/1.0.0",phase="ended",nonce=nonce,reason=reason,exit_code=exit,resources_disposed=cleanupErrors.Count==0,cleanup_errors=cleanupErrors.ToArray(),formal_agent_execution_enabled=false });
      if(root!=null) { try { Atomic(Path.Combine(Path.GetDirectoryName(root),"agent-sandbox-cleanup.json"),disposal); } catch { cleanupErrors.Add("proof"); } }
      Console.WriteLine(disposal); Console.Out.Flush();
    }
    return cleanupErrors.Count==0?exit:12;
  }
}
