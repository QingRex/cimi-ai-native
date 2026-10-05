// The runtime never opens this host directory. Only this controller writes
// authenticated frames after the existing kernel client identity check.
using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

partial class AppContainer {
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool PeekNamedPipe(SafePipeHandle pipe,IntPtr buffer,uint length,IntPtr read,out uint available,IntPtr left);
  partial class ProbePipe {
    bool gatewayEnabled=false;
    string gatewayRoot,gatewayNonce,gatewayPolicy,gatewayProof;
    readonly Dictionary<string,object> gatewayReplies=new Dictionary<string,object>();
    public void EnableGateway(string root,string nonce,string policy) {
      if(policy==null||policy.Length!=64||policy.Trim("0123456789abcdef".ToCharArray()).Length!=0) throw new Exception("Invalid gateway policy");
      gatewayRoot=Path.Combine(Path.GetDirectoryName(root),"gateway"); Ordinary(gatewayRoot);
      gatewayNonce=nonce; gatewayPolicy=policy; gatewayProof=Path.Combine(Path.GetDirectoryName(root),"gateway-transport-proof.json"); gatewayEnabled=true;
    }
    void GatewaySave(string phase) {
      lock(gate) Atomic(gatewayProof,IpcJson().Serialize(new {
        schema_version="2.0.0",scope="isolated_provider_probe",operation_key=operation,phase=phase,transport="windows_named_pipe",
        runtime_pid=expected["pid"],client_identity_enforcement="pid_creation_image",remote_clients_rejected=true,
        gateway_policy_digest=new { algorithm="sha256",value=gatewayPolicy },frame_limit_bytes=16384,
        accepted_requests=accepted,attempts=attempts,failure_reason=failure,external_model_requests=0,formal_execution_enabled=false }));
    }
    bool GatewayRequestValid(Dictionary<string,object> request,out Guid id) {
      id=Guid.Empty;
      return request!=null&&request.Count==6&&request.ContainsKey("format")&&request["format"] as string=="cimiloop/model-gateway/1.0.0"&&
        request.ContainsKey("request_id")&&Guid.TryParseExact(request["request_id"] as string,"D",out id)&&request.ContainsKey("operation_key")&&request["operation_key"] as string==operation&&
        request.ContainsKey("model_id")&&request["model_id"] as string=="cimiloop-synthetic-text"&&request.ContainsKey("messages")&&request.ContainsKey("max_output_tokens");
    }
    object GatewayReply(string id,string hash,byte[] bytes) {
      object cached; if(gatewayReplies.TryGetValue(id,out cached)) return cached;
      string input=Path.Combine(gatewayRoot,"requests",id+".json"),output=Path.Combine(gatewayRoot,"responses",id+".json"); Ordinary(input); Ordinary(output);
      Atomic(input,IpcJson().Serialize(new { format="cimiloop/ipc-gateway-mailbox/1.0.0",nonce=gatewayNonce,operation_key=operation,
        native_pid=Process.GetCurrentProcess().Id,runtime_pid=expected["pid"],policy_digest=gatewayPolicy,request_id=id,request_digest=hash,frame_base64=Convert.ToBase64String(bytes) }));
      var watch=Stopwatch.StartNew();
      while(!closed&&watch.ElapsedMilliseconds<20000) {
        if(File.Exists(output)) {
          var file=new FileInfo(output); if(file.Length>32768) throw new InvalidDataException("gateway_reply_limit");
          var reply=IpcJson().Deserialize<Dictionary<string,object>>(File.ReadAllText(output));
          if(reply==null||reply.Count!=10||(string)reply["format"]!="cimiloop/ipc-gateway-reply/1.0.0"||(string)reply["nonce"]!=gatewayNonce||
            (string)reply["operation_key"]!=operation||(string)reply["request_id"]!=id||(string)reply["request_digest"]!=hash||(string)reply["policy_digest"]!=gatewayPolicy)
            throw new InvalidDataException("gateway_reply_identity_unproven");
          object value;
          if((string)reply["outcome"]=="completed"&&reply["response"] is Dictionary<string,object>&&reply["reason"]==null) value=reply["response"];
          else if((string)reply["outcome"]=="denied"&&reply["response"]==null&&reply["reason"] is string)
            value=new { format="cimiloop/model-gateway-error/1.0.0",request_id=id,request_digest=hash,reason=reply["reason"] };
          else throw new InvalidDataException("gateway_reply_unproven");
          gatewayReplies.Add(id,value); return value;
        }
        Thread.Sleep(20);
      }
      throw new InvalidDataException("gateway_host_unavailable");
    }
  }
  static int GatewayClient(string operation,string scenario,int hold) {
    string name=Environment.GetEnvironmentVariable("CIMILOOP_IPC_PIPE"); if(name==null) return 2;
    if(scenario=="paused") Thread.Sleep(3000);
    if(scenario=="cancel_race") { while(!File.Exists("cancel-trigger.txt")) Thread.Sleep(1); return 0; }
    if(scenario=="private_acl") {
      string path=Environment.GetEnvironmentVariable("CIMILOOP_GATEWAY_PRIVATE_CANARY"); bool readDenied=false,writeDenied=false,directoryDenied=false;
      try { File.ReadAllText(path); } catch(UnauthorizedAccessException) { readDenied=true; }
      try { using(var stream=new FileStream(path,FileMode.Open,FileAccess.Write)) { } } catch(UnauthorizedAccessException) { writeDenied=true; }
      try { File.WriteAllText(Path.Combine(Path.GetDirectoryName(path),"requests","forged.json"),"forged"); } catch(UnauthorizedAccessException) { directoryDenied=true; }
      Console.WriteLine(IpcJson().Serialize(new { event_type="gateway.private_canary",read_denied=readDenied,write_denied=writeDenied,mailbox_write_denied=directoryDenied }));
      if(!readDenied||!writeDenied||!directoryDenied) return 14;
    }
    string id=Guid.NewGuid().ToString("D"); int calls=scenario=="duplicate"||scenario=="conflict"||scenario=="budget"?2:1;
    for(int i=0;i<calls;i++) {
      using(var client=new NamedPipeClientStream(".",name.Substring("\\\\.\\pipe\\".Length),PipeDirection.InOut)) {
        client.Connect(3000); if(scenario=="budget") id=Guid.NewGuid().ToString("D");
        WriteFrame(client,new { format="cimiloop/model-gateway/1.0.0",request_id=id,operation_key=operation,model_id="cimiloop-synthetic-text",
          messages=new[] { new { role="user",content=scenario=="conflict"?"fixture "+i:"Synthetic input" } },max_output_tokens=scenario=="invalid"?129:16 });
        if(scenario=="cancel_drain") {
          // Leave a real reply unread so the controller is blocked in drain
          // when its host cancels the job. This is a synthetic regression only.
          var wait=Stopwatch.StartNew(); uint available=0;
          while(wait.ElapsedMilliseconds<10000) {
            Check(PeekNamedPipe(client.SafePipeHandle,IntPtr.Zero,0,IntPtr.Zero,out available,IntPtr.Zero));
            if(available>0) break; Thread.Sleep(10);
          }
          if(available==0) return 15;
          Console.WriteLine("{\"event_type\":\"gateway.cancel_drain_ready\"}"); Console.Out.Flush();
          Thread.Sleep(hold); return 0;
        }
        try { Console.WriteLine(Encoding.UTF8.GetString(ReadFrame(client))); }
        catch(EndOfStreamException) { Console.WriteLine("{\"event_type\":\"gateway.fixture_rejected\"}"); }
      }
    }
    if(scenario=="hold") Thread.Sleep(hold); return 0;
  }
}
