// Synthetic IPC transport only. This controller does not call a model or hold
// a credential. No caller-supplied endpoint can reach the network from here.
using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

partial class AppContainer {
  static bool ownedTransportGranted=false;
  static bool ownedTransportWriteAttributes=false;
  static ProbePipe ipcPipe;
  [StructLayout(LayoutKind.Sequential)] struct PIPEATTR { public int length; public IntPtr descriptor; [MarshalAs(UnmanagedType.Bool)] public bool inherit; }
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string value,uint revision,out IntPtr descriptor,out uint size);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafePipeHandle CreateNamedPipe(string name,uint access,uint mode,uint instances,uint outSize,uint inSize,uint timeout,ref PIPEATTR attributes);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe,out uint pid);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CancelIoEx(SafePipeHandle handle,IntPtr overlapped);
  const int IpcMaximum=262144;
  static string Sha(byte[] bytes) { using(var sha=SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant(); }
  static byte[] ReadFrame(Stream stream,int maximum=IpcMaximum) {
    var header=ReadExact(stream,4); int length=BitConverter.ToInt32(header,0);
    if(length<1||length>maximum) throw new InvalidDataException("ipc_frame_limit");
    return ReadExact(stream,length);
  }
  static byte[] ReadExact(Stream stream,int length) { var bytes=new byte[length]; int offset=0; while(offset<length) { int count=stream.Read(bytes,offset,length-offset); if(count==0) throw new EndOfStreamException(); offset+=count; } return bytes; }
  static JavaScriptSerializer IpcJson() { return new JavaScriptSerializer { MaxJsonLength=IpcMaximum,RecursionLimit=64 }; }
  static void WriteFrame(Stream stream,object value) { var bytes=Encoding.UTF8.GetBytes(IpcJson().Serialize(value)); if(bytes.Length>IpcMaximum) throw new InvalidDataException("ipc_frame_limit"); stream.Write(BitConverter.GetBytes(bytes.Length),0,4); stream.Write(bytes,0,bytes.Length); stream.Flush(); }

  partial class ProbePipe : IDisposable {
    public readonly string name;
    readonly string operation,path,cancelPath;
    readonly NamedPipeServerStream server;
    readonly List<Dictionary<string,object>> attempts=new List<Dictionary<string,object>>();
    readonly Dictionary<string,string> requests=new Dictionary<string,string>();
    readonly object gate=new object();
    Dictionary<string,object> expected;
    volatile bool closed=false;
    Thread worker;
    string failure;
    int accepted=0;
    public ProbePipe(string nonce,string operation,SecurityIdentifier principal,string root,string cancelPath) {
      this.operation=operation; this.cancelPath=cancelPath; path=Path.Combine(Path.GetDirectoryName(root),"ipc-transport-proof.json"); name="\\\\.\\pipe\\CimiLoop."+nonce;
      string owner=WindowsIdentity.GetCurrent().User.Value;
      // Restrict the DACL to this user, SYSTEM and this exact AppContainer.
      // A low mandatory label permits its writes; remote clients are refused
      // independently, and the handle cannot be inherited by the child.
      string sddl="D:P(D;;GA;;;NU)(A;;GA;;;SY)(A;;GA;;;"+owner+")(A;;GRGW;;;"+principal.Value+")S:(ML;;NW;;;LW)";
      IntPtr descriptor; uint size; Check(ConvertStringSecurityDescriptorToSecurityDescriptor(sddl,1,out descriptor,out size));
      try {
        var attributes=new PIPEATTR { length=Marshal.SizeOf(typeof(PIPEATTR)),descriptor=descriptor,inherit=false };
        // DUPLEX | FIRST_PIPE_INSTANCE | OVERLAPPED; BYTE | REJECT_REMOTE_CLIENTS.
        var handle=CreateNamedPipe(name,3|0x80000|0x40000000,8,1,65536,65536,0,ref attributes);
        if(handle.IsInvalid) { handle.Dispose(); throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
        server=new NamedPipeServerStream(PipeDirection.InOut,true,false,handle);
      } finally { LocalFree(descriptor); }
    }
    void Save(string phase) {
      if(gatewayEnabled) { GatewaySave(phase); return; }
      lock(gate) Atomic(path,IpcJson().Serialize(new {
        schema_version="2.0.0",scope="isolated_provider_probe",operation_key=operation,phase=phase,
        transport="windows_named_pipe",synthetic_response_only=true,remote_clients_rejected=true,
        runtime_pid=expected["pid"],client_identity_enforcement="pid_creation_image",
        frame_limit_bytes=IpcMaximum,accepted_requests=accepted,attempts=attempts,
        failure_reason=failure,external_model_requests=0,formal_execution_enabled=false }));
    }
    void Record(uint pid,string outcome,string reason,int bytes,string digest,bool replay) {
      lock(gate) {
        if(attempts.Count>=32) throw new InvalidDataException("ipc_attempt_limit");
        attempts.Add(new Dictionary<string,object> { {"pid",pid},{"outcome",outcome},{"reason",reason},{"request_bytes",bytes},{"request_digest",digest},{"replay",replay} });
      }
      Save("running");
    }
    public void Start(Dictionary<string,object> identity) {
      if(identity==null) throw new Exception("Missing child identity"); expected=identity; Save("running");
      worker=new Thread(Serve); worker.IsBackground=true; worker.Start();
    }
    bool CancelledPipeIo(Exception ex) {
      // Only host-requested cancellation explains these pipe teardown errors.
      // Mailbox, identity, frame and proof failures still propagate unchanged.
      if(!File.Exists(cancelPath)) return false;
      if(ex is ObjectDisposedException) return true;
      if(!(ex is IOException)||ex is InvalidDataException) return false;
      int code=ex.HResult&0xffff;
      return code==38||code==109||code==232||code==233||code==995;
    }
    void Serve() {
      try {
        while(!closed) {
          try { server.WaitForConnection(); } catch(Exception ex) { if(CancelledPipeIo(ex)) return; throw; }
          uint pid=0;
          try {
            Check(GetNamedPipeClientProcessId(server.SafePipeHandle,out pid));
            if(pid!=Convert.ToUInt32(expected["pid"])||InspectIdentity(expected)!="active") { Record(pid,"rejected","client_identity_mismatch",0,null,false); continue; }
            byte[] bytes;
            try { bytes=ReadFrame(server,gatewayEnabled?16384:IpcMaximum); } catch(InvalidDataException) { Record(pid,"rejected","ipc_frame_limit",0,null,false); continue; }
            catch(Exception ex) { if(CancelledPipeIo(ex)) return; throw; }
            string hash=Sha(bytes); Dictionary<string,object> request;
            try { request=IpcJson().Deserialize<Dictionary<string,object>>(new UTF8Encoding(false,true).GetString(bytes)); }
            catch { Record(pid,"rejected","ipc_request_invalid",bytes.Length,hash,false); continue; }
            Guid requestId;
            if(gatewayEnabled) {
              if(!GatewayRequestValid(request,out requestId)) { Record(pid,"rejected","ipc_request_invalid",bytes.Length,hash,false); continue; }
            } else if(request==null||request.Count!=6||!request.ContainsKey("payload")||!request.ContainsKey("request_id")||!Guid.TryParseExact(request["request_id"] as string,"D",out requestId)||
              !request.ContainsKey("format")||request["format"] as string!="cimiloop/ipc-probe/1.0.0"||!request.ContainsKey("operation_key")||request["operation_key"] as string!=operation||
              !request.ContainsKey("model_id")||request["model_id"] as string!="probe"||!request.ContainsKey("kind")||(request["kind"] as string!="stream"&&request["kind"] as string!="generate")) {
              Record(pid,"rejected","ipc_request_invalid",bytes.Length,hash,false); continue;
            }
            string id=requestId.ToString("D"),previous; bool replay=requests.TryGetValue(id,out previous);
            if(replay&&previous!=hash) { Record(pid,"rejected","request_id_conflict",bytes.Length,hash,false); continue; }
            if(!replay) { if(requests.Count>=8) { Record(pid,"rejected","ipc_request_limit",bytes.Length,hash,false); continue; } requests.Add(id,hash); accepted++; }
            Record(pid,"accepted","runtime_identity_verified",bytes.Length,hash,replay);
            object reply=gatewayEnabled?GatewayReply(id,hash,bytes):new { format="cimiloop/ipc-probe/1.0.0",request_id=id,request_digest=hash,synthetic=true,text="CIMILOOP_IPC_OK" };
            // Disconnect discards unread pipe bytes. Wait until the peer has
            // consumed the reply; disposing the pipe on cancellation unblocks it.
            try { WriteFrame(server,reply); server.WaitForPipeDrain(); }
            catch(Exception ex) { if(CancelledPipeIo(ex)) return; throw; }
          } finally {
            try { if(server.IsConnected) server.Disconnect(); }
            catch(Exception ex) { if(!CancelledPipeIo(ex)) throw; }
          }
        }
      } catch(Exception ex) { if(!closed) { failure=ex is InvalidDataException?ex.Message:"ipc_transport_unavailable"; try { Save("running"); } catch { } } }
    }
    public void Dispose() {
      closed=true; CancelIoEx(server.SafePipeHandle,IntPtr.Zero); server.Dispose();
      if(worker!=null&&!worker.Join(3000)) throw new Exception("IPC worker still active");
      Save("ended");
    }
  }

  static int IpcClient(string operation,string scenario,int hold) {
    string name=Environment.GetEnvironmentVariable("CIMILOOP_IPC_PIPE"); if(name==null) return 2;
    if(scenario=="module_acl") {
      string path=Path.GetFullPath(Path.Combine(Environment.CurrentDirectory,"..","transport","provider.mjs"));
      bool readable=false,writeDenied=false,createDenied=false;
      try { readable=File.ReadAllBytes(path).Length>0; } catch { }
      try { using(var stream=new FileStream(path,FileMode.Open,FileAccess.Write)) { } } catch(UnauthorizedAccessException) { writeDenied=true; }
      try { File.WriteAllText(Path.Combine(Path.GetDirectoryName(path),"write-canary"),"synthetic"); } catch(UnauthorizedAccessException) { createDenied=true; }
      Console.WriteLine(IpcJson().Serialize(new { event_type="ipc.module_canary",readable=readable,write_denied=writeDenied,directory_write_denied=createDenied }));
      if(!readable||!writeDenied||!createDenied) return 14;
    }
    var id=Guid.NewGuid().ToString("D"); int calls=scenario=="duplicate"||scenario=="conflict"?2:1;
    for(int i=0;i<calls;i++) {
      using(var client=new NamedPipeClientStream(".",name.Substring("\\\\.\\pipe\\".Length),PipeDirection.InOut)) {
        client.Connect(3000);
        if(scenario=="oversize") { client.Write(BitConverter.GetBytes(IpcMaximum+1),0,4); client.Flush(); }
        else if(scenario=="malformed") WriteFrame(client,new { format=123,payload="synthetic" });
        else WriteFrame(client,new { format="cimiloop/ipc-probe/1.0.0",request_id=id,operation_key=scenario=="mismatch"?"wrong_operation":operation,model_id="probe",kind="stream",payload=scenario=="conflict"?"payload"+i:"synthetic" });
        try { Console.WriteLine(Encoding.UTF8.GetString(ReadFrame(client))); }
        catch(EndOfStreamException) { Console.WriteLine("{\"event_type\":\"ipc.fixture_rejected\"}"); }
      }
    }
    if(scenario=="hold") Thread.Sleep(hold); return 0;
  }
  static int PipeAttempt(string name) {
    bool connected=false; int error=0;
    try { using(var client=new NamedPipeClientStream(".",name.Substring("\\\\.\\pipe\\".Length),PipeDirection.InOut)) { client.Connect(1500); connected=true; } }
    catch(UnauthorizedAccessException) { error=5; } catch(System.ComponentModel.Win32Exception ex) { error=ex.NativeErrorCode; } catch(TimeoutException) { error=1460; }
    Console.WriteLine(serializer.Serialize(new { event_type="ipc.other_container",connected=connected,error_code=error })); return connected?1:0;
  }
}
