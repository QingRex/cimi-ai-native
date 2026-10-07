// Original-peer file-tool transport. No model, credentials, shell, worktree
// access or completion cache lives in this controller. Host stdio owns replies.
using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

class AgentWorkspaceTransport {
  const int Maximum=114688,LineMaximum=163840;
  [StructLayout(LayoutKind.Sequential)] struct FT { public uint low,high; }
  [StructLayout(LayoutKind.Sequential)] struct PA { public int length; public IntPtr descriptor; [MarshalAs(UnmanagedType.Bool)] public bool inherit; }
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr process,out FT creation,out FT exit,out FT kernel,out FT user);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder image,ref int size);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr data,int size,out int required);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string value,uint revision,out IntPtr descriptor,out uint size);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafePipeHandle CreateNamedPipe(string name,uint access,uint mode,uint instances,uint output,uint input,uint timeout,ref PA attributes);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe,out uint pid);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CancelIoEx(SafePipeHandle pipe,IntPtr overlapped);
  static readonly JavaScriptSerializer json=new JavaScriptSerializer { MaxJsonLength=LineMaximum,RecursionLimit=32 };
  static readonly BlockingCollection<string> replies=new BlockingCollection<string>(1);
  static NamedPipeServerStream pipe;
  static volatile bool stopped;
  static void Require(bool value,string reason) { if(!value) throw new InvalidDataException(reason); }
  static void Emit(object value) { Console.WriteLine(json.Serialize(value)); Console.Out.Flush(); }
  static void Keys(Dictionary<string,object> value,params string[] names) { Require(value!=null&&value.Count==names.Length,"agent_ipc_contract_invalid"); foreach(string key in names) Require(value.ContainsKey(key),"agent_ipc_contract_invalid"); }
  static string Hash(byte[] bytes) { using(var sha=SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant(); }
  static string Line(int maximum) {
    var input=Console.OpenStandardInput(); using(var bytes=new MemoryStream()) {
      while(true) { int value=input.ReadByte(); if(value<0) return null; if(value==10) break; Require(bytes.Length<maximum,"agent_ipc_frame_limit"); bytes.WriteByte((byte)value); }
      return new UTF8Encoding(false,true).GetString(bytes.ToArray());
    }
  }
  static byte[] Exact(Stream stream,int length) { var bytes=new byte[length]; int at=0; while(at<length) { int count=stream.Read(bytes,at,length-at); if(count==0) throw new EndOfStreamException(); at+=count; } return bytes; }
  static byte[] Frame(Stream stream) { int length=BitConverter.ToInt32(Exact(stream,4),0); Require(length>0&&length<=Maximum,"agent_ipc_frame_limit"); return Exact(stream,length); }
  static Dictionary<string,object> Identity(IntPtr handle,int pid) {
    FT created,ended,kernel,user; var image=new StringBuilder(32768); int size=image.Capacity;
    Require(GetProcessTimes(handle,out created,out ended,out kernel,out user)&&QueryFullProcessImageName(handle,0,image,ref size),"agent_ipc_peer_unproven");
    return new Dictionary<string,object> { {"pid",pid},{"creation_ticks",(((ulong)created.high<<32)|created.low).ToString()},{"image",image.ToString()} };
  }
  static string ContainerSid(IntPtr process) {
    IntPtr token; Require(OpenProcessToken(process,8,out token),"agent_ipc_peer_token_unproven");
    try {
      int required; IntPtr data=Marshal.AllocHGlobal(4);
      try { Require(GetTokenInformation(token,29,data,4,out required),"agent_ipc_peer_token_unproven"); if(Marshal.ReadInt32(data)==0) return null; }
      finally { Marshal.FreeHGlobal(data); }
      GetTokenInformation(token,31,IntPtr.Zero,0,out required); Require(required>=IntPtr.Size&&required<=65536,"agent_ipc_peer_token_unproven"); data=Marshal.AllocHGlobal(required);
      try { Require(GetTokenInformation(token,31,data,required,out required),"agent_ipc_peer_token_unproven"); IntPtr sid=Marshal.ReadIntPtr(data); Require(sid!=IntPtr.Zero,"agent_ipc_peer_token_unproven"); return new SecurityIdentifier(sid).Value; }
      finally { Marshal.FreeHGlobal(data); }
    } finally { CloseHandle(token); }
  }
  static void Stop() {
    stopped=true; replies.CompleteAdding(); var current=pipe; if(current!=null) { try { CancelIoEx(current.SafePipeHandle,IntPtr.Zero); current.Dispose(); } catch { } }
  }
  static int Main() {
    IntPtr peer=IntPtr.Zero,owner=IntPtr.Zero,supervisor=IntPtr.Zero;
    try {
      string first=Line(8192); Require(first!=null,"agent_ipc_parent_ended"); var config=json.Deserialize<Dictionary<string,object>>(first);
      Keys(config,"format","nonce","scope_digest","peer","supervisor","owner_pid");
      Guid nonce=Guid.Empty; Require(config["format"] as string=="cimiloop/agent-workspace-ipc-config/1.0.0"&&Guid.TryParseExact(config["nonce"] as string,"D",out nonce)&&
        config["scope_digest"] is string&&System.Text.RegularExpressions.Regex.IsMatch((string)config["scope_digest"],"^[a-f0-9]{64}$")&&
        config["peer"] is Dictionary<string,object>&&config["supervisor"] is Dictionary<string,object>&&config["owner_pid"] is int,"agent_ipc_contract_invalid");
      var original=(Dictionary<string,object>)config["peer"]; Keys(original,"pid","creation_ticks","image");
      Require(original["pid"] is int&&original["creation_ticks"] is string&&original["image"] is string,"agent_ipc_contract_invalid");
      int peerPid=(int)original["pid"],ownerPid=(int)config["owner_pid"]; Require(peerPid>0&&ownerPid>0&&peerPid!=ownerPid,"agent_ipc_contract_invalid");
      peer=OpenProcess(0x100000|0x1000,false,peerPid); owner=OpenProcess(0x100000|0x1000,false,ownerPid);
      Require(peer!=IntPtr.Zero&&owner!=IntPtr.Zero&&WaitForSingleObject(peer,0)==258&&WaitForSingleObject(owner,0)==258,"agent_ipc_peer_unproven");
      var identity=Identity(peer,peerPid); Require((string)identity["creation_ticks"]==(string)original["creation_ticks"]&&
        String.Equals(Path.GetFullPath((string)identity["image"]),Path.GetFullPath((string)original["image"]),StringComparison.OrdinalIgnoreCase),"agent_ipc_peer_unproven");
      var originalSupervisor=(Dictionary<string,object>)config["supervisor"]; Keys(originalSupervisor,"pid","creation_ticks","image");
      Require(originalSupervisor["pid"] is int&&originalSupervisor["creation_ticks"] is string&&originalSupervisor["image"] is string,"agent_ipc_contract_invalid");
      int supervisorPid=(int)originalSupervisor["pid"]; Require(supervisorPid>0&&supervisorPid!=ownerPid,"agent_ipc_contract_invalid");
      supervisor=OpenProcess(0x100000|0x1000,false,supervisorPid); Require(supervisor!=IntPtr.Zero&&WaitForSingleObject(supervisor,0)==258,"agent_ipc_supervisor_unproven");
      var supervisorIdentity=Identity(supervisor,supervisorPid); Require((string)supervisorIdentity["creation_ticks"]==(string)originalSupervisor["creation_ticks"]&&
        String.Equals(Path.GetFullPath((string)supervisorIdentity["image"]),Path.GetFullPath((string)originalSupervisor["image"]),StringComparison.OrdinalIgnoreCase),"agent_ipc_supervisor_unproven");
      string sid=ContainerSid(peer),name="\\\\.\\pipe\\CimiLoop.AgentWorkspace."+nonce.ToString("D");
      string sddl="D:P(D;;GA;;;NU)(A;;GA;;;SY)(A;;GA;;;"+WindowsIdentity.GetCurrent().User.Value+")"+(sid==null?"":"(A;;GRGW;;;"+sid+")")+"S:(ML;;NW;;;LW)";
      IntPtr descriptor; uint descriptorSize; Require(ConvertStringSecurityDescriptorToSecurityDescriptor(sddl,1,out descriptor,out descriptorSize),"agent_ipc_security_unproven");
      try {
        var attributes=new PA { length=Marshal.SizeOf(typeof(PA)),descriptor=descriptor,inherit=false };
        var handle=CreateNamedPipe(name,3|0x80000|0x40000000,8,1,65536,65536,0,ref attributes);
        Require(!handle.IsInvalid,"agent_ipc_pipe_unavailable"); pipe=new NamedPipeServerStream(PipeDirection.InOut,true,false,handle);
      } finally { LocalFree(descriptor); }
      Emit(new { format="cimiloop/agent-workspace-ipc-native/1.0.0",phase="ready",nonce=nonce.ToString("D"),scope_digest=config["scope_digest"],pipe=name,peer=identity,supervisor=supervisorIdentity,appcontainer_sid=sid });
      var inputWorker=new Thread(delegate() { try { while(!stopped) { string line=Line(LineMaximum); if(line==null) break; if(!replies.TryAdd(line,1000)) break; } } catch { } finally { Stop(); } }); inputWorker.IsBackground=true; inputWorker.Start();
      using(var alive=new Timer(delegate { if(WaitForSingleObject(peer,0)!=258||WaitForSingleObject(owner,0)!=258||WaitForSingleObject(supervisor,0)!=258) Stop(); },null,100,100)) {
        for(int attempt=0;attempt<128&&!stopped;attempt++) {
          pipe.WaitForConnection(); uint pid;
          try {
            Require(GetNamedPipeClientProcessId(pipe.SafePipeHandle,out pid),"agent_ipc_peer_unproven");
            if(pid!=(uint)peerPid||WaitForSingleObject(peer,0)!=258||WaitForSingleObject(owner,0)!=258||WaitForSingleObject(supervisor,0)!=258) {
              Emit(new { format="cimiloop/agent-workspace-ipc-native/1.0.0",phase="rejected",reason="agent_ipc_peer_mismatch" }); continue;
            }
            using(var deadline=new Timer(delegate { Stop(); },null,20000,Timeout.Infinite)) {
              byte[] bytes;
              try { bytes=Frame(pipe); new UTF8Encoding(false,true).GetString(bytes); }
              catch(InvalidDataException) { Emit(new { format="cimiloop/agent-workspace-ipc-native/1.0.0",phase="rejected",reason="agent_ipc_frame_limit" }); continue; }
              catch(DecoderFallbackException) { Emit(new { format="cimiloop/agent-workspace-ipc-native/1.0.0",phase="rejected",reason="agent_ipc_utf8_invalid" }); continue; }
              string hash=Hash(bytes); Require(WaitForSingleObject(peer,0)==258&&WaitForSingleObject(owner,0)==258&&WaitForSingleObject(supervisor,0)==258,"agent_ipc_peer_unproven");
              Emit(new { format="cimiloop/agent-workspace-ipc-native/1.0.0",phase="request",nonce=nonce.ToString("D"),scope_digest=config["scope_digest"],peer=identity,request_digest=hash,frame_base64=Convert.ToBase64String(bytes) });
              string replyLine; Require(replies.TryTake(out replyLine,19000),"agent_ipc_reply_timeout"); var reply=json.Deserialize<Dictionary<string,object>>(replyLine);
              Keys(reply,"format","request_digest","reply_base64"); Require(reply["format"] as string=="cimiloop/agent-workspace-ipc-host/1.0.0"&&reply["request_digest"] as string==hash&&reply["reply_base64"] is string,"agent_ipc_reply_unproven");
              byte[] output=Convert.FromBase64String((string)reply["reply_base64"]); Require(output.Length>0&&output.Length<=Maximum&&Convert.ToBase64String(output)==(string)reply["reply_base64"],"agent_ipc_reply_unproven");
              Require(WaitForSingleObject(peer,0)==258&&WaitForSingleObject(owner,0)==258&&WaitForSingleObject(supervisor,0)==258,"agent_ipc_peer_unproven");
              pipe.Write(BitConverter.GetBytes(output.Length),0,4); pipe.Write(output,0,output.Length); pipe.Flush(); pipe.WaitForPipeDrain();
            }
          } finally { try { if(!stopped&&pipe.IsConnected) pipe.Disconnect(); } catch { if(!stopped) throw; } }
        }
      }
      return 0;
    } catch(Exception ex) {
      if(stopped) return 0;
      Emit(new { format="cimiloop/agent-workspace-ipc-native/1.0.0",phase="failed",reason=ex is InvalidDataException?ex.Message:"agent_ipc_native_unavailable" }); return 12;
    } finally { Stop(); if(peer!=IntPtr.Zero) CloseHandle(peer); if(owner!=IntPtr.Zero) CloseHandle(owner); if(supervisor!=IntPtr.Zero) CloseHandle(supervisor); }
  }
}
