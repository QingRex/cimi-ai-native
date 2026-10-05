// Explicit public read-tool rehearsal. Old gateway framing remains unchanged.
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Collections.Generic;
using System.IO.Pipes;

partial class AppContainer {
  partial class ProbePipe {
    bool conversationEnabled=false;
    string conversationRoot,conversationNonce,conversationPolicy,conversationProof;
    public void EnableConversation(string root,string nonce,string policy) {
      if(policy==null||policy.Length!=64||policy.Trim("0123456789abcdef".ToCharArray()).Length!=0) throw new Exception("Invalid conversation policy");
      conversationRoot=Path.Combine(Path.GetDirectoryName(root),"conversation"); Ordinary(conversationRoot);
      conversationNonce=nonce; conversationPolicy=policy; conversationProof=Path.Combine(Path.GetDirectoryName(root),"conversation-transport-proof.json"); conversationEnabled=true;
    }
    void ConversationSave(string phase) {
      lock(gate) Atomic(conversationProof,IpcJson().Serialize(new {
        format="cimiloop/conversation-transport-proof/1.0.0",scope="isolated_conversation_rehearsal",operation_key=operation,phase=phase,
        transport="windows_named_pipe",runtime_pid=expected["pid"],client_identity_enforcement="pid_creation_image",remote_clients_rejected=true,
        policy_digest=conversationPolicy,request_limit_bytes=65536,response_limit_bytes=294912,accepted_requests=accepted,attempts=attempts,
        failure_reason=failure,external_model_requests=0,formal_execution_enabled=false }));
    }
    bool ConversationRequestValid(Dictionary<string,object> request,out Guid id) {
      id=Guid.Empty;
      return request!=null&&request.Count==10&&request.ContainsKey("format")&&request["format"] as string=="cimiloop/model-conversation-request/1.0.0"&&
        request.ContainsKey("request_id")&&Guid.TryParseExact(request["request_id"] as string,"D",out id)&&request.ContainsKey("operation_key")&&request["operation_key"] as string==operation&&
        request.ContainsKey("model_id")&&request["model_id"] as string=="cimiloop-public-tools"&&request.ContainsKey("policy_digest")&&request["policy_digest"] as string==conversationPolicy&&
        request.ContainsKey("messages")&&request.ContainsKey("tools")&&request.ContainsKey("response_mode")&&request.ContainsKey("input_tokens")&&request.ContainsKey("max_output_tokens");
    }
    object ConversationReply(string id,string hash,byte[] bytes) {
      // Re-read the bounded host reply on duplicate frames. The host's atomic
      // format-3 cache, not a second unbounded controller cache, owns completion.
      string input=Path.Combine(conversationRoot,"requests",id+".json"),output=Path.Combine(conversationRoot,"responses",id+".json"); Ordinary(input); Ordinary(output);
      if(!File.Exists(input)) Atomic(input,IpcJson().Serialize(new { format="cimiloop/ipc-conversation-mailbox/1.0.0",nonce=conversationNonce,operation_key=operation,
        native_pid=Process.GetCurrentProcess().Id,runtime_pid=expected["pid"],policy_digest=conversationPolicy,request_id=id,request_digest=hash,frame_base64=Convert.ToBase64String(bytes) }));
      var watch=Stopwatch.StartNew();
      while(!closed&&watch.ElapsedMilliseconds<20000) {
        if(File.Exists(output)) {
          Ordinary(output); if(new FileInfo(output).Length>393216) throw new InvalidDataException("conversation_reply_limit");
          var reply=IpcJson(393216).Deserialize<Dictionary<string,object>>(File.ReadAllText(output,new UTF8Encoding(false,true)));
          if(reply==null||reply.Count!=3||reply["format"] as string!="cimiloop/ipc-conversation-reply/1.0.0"||reply["nonce"] as string!=conversationNonce||!(reply["reply"] is Dictionary<string,object>)) throw new InvalidDataException("conversation_reply_identity_unproven");
          var value=(Dictionary<string,object>)reply["reply"];
          if(value.Count!=12||value["format"] as string!="cimiloop/model-conversation-reply/1.0.0"||value["scope"] as string!="isolated_conversation_rehearsal"||
            value["operation_key"] as string!=operation||value["request_id"] as string!=id||value["request_digest"] as string!=hash||value["policy_digest"] as string!=conversationPolicy||
            !(value["formal_execution_enabled"] is bool)||(bool)value["formal_execution_enabled"]||!(value["replay"] is bool)||
            !((value["outcome"] as string=="completed"&&value["response"] is Dictionary<string,object>&&value["receipt"] is Dictionary<string,object>&&value["reason"]==null)||
              (value["outcome"] as string=="denied"&&value["response"]==null&&value["receipt"]==null&&value["reason"] is string))) throw new InvalidDataException("conversation_reply_identity_unproven");
          return value;
        }
        Thread.Sleep(20);
      }
      throw new InvalidDataException("conversation_host_unavailable");
    }
  }
  static int ConversationClient(string operation,string scenario) {
    string name=Environment.GetEnvironmentVariable("CIMILOOP_IPC_PIPE"),policy=Environment.GetEnvironmentVariable("CIMILOOP_PUBLIC_CONVERSATION_POLICY"),canary=Environment.GetEnvironmentVariable("CIMILOOP_PUBLIC_CONVERSATION_CANARY");
    if(name==null||policy==null) return 2;
    if(scenario=="private_acl") {
      bool readDenied=false,writeDenied=false,directoryDenied=false;
      try { File.ReadAllText(canary); } catch(UnauthorizedAccessException) { readDenied=true; }
      try { using(var stream=new FileStream(canary,FileMode.Open,FileAccess.Write)) { } } catch(UnauthorizedAccessException) { writeDenied=true; }
      try { File.WriteAllText(Path.Combine(Path.GetDirectoryName(canary),"requests","forged.json"),"forged"); } catch(UnauthorizedAccessException) { directoryDenied=true; }
      Console.WriteLine(IpcJson().Serialize(new { event_type="conversation.private_canary",read_denied=readDenied,write_denied=writeDenied,directory_write_denied=directoryDenied }));
      if(!readDenied||!writeDenied||!directoryDenied) return 14;
    }
    string id=Guid.NewGuid().ToString("D"); int calls=scenario=="duplicate"||scenario=="conflict"?2:1;
    for(int i=0;i<calls;i++) {
      using(var client=new NamedPipeClientStream(".",name.Substring("\\\\.\\pipe\\".Length),PipeDirection.InOut)) {
        client.Connect(3000);
        if(scenario=="oversize") { client.Write(BitConverter.GetBytes(65537),0,4); client.Flush(); }
        else WriteFrame(client,new { format="cimiloop/model-conversation-request/1.0.0",request_id=id,operation_key=operation,model_id="cimiloop-public-tools",policy_digest=scenario=="wrong_policy"?new string('0',64):policy,
          messages=new object[] { new { role="user",content=scenario=="conflict"?"public"+i:"public" } },
          tools=new object[] { new { type="function",function=new { name="read",description="public",parameters=new { type="object",properties=new { filePath=new { type="string" } },required=new string[] { "filePath" },additionalProperties=false } } } },
          response_mode="json",input_tokens=65536,max_output_tokens=128 },65536);
        try { Console.WriteLine(Encoding.UTF8.GetString(ReadFrame(client,294912))); }
        catch(EndOfStreamException) { Console.WriteLine("{\"event_type\":\"conversation.fixture_rejected\"}"); }
      }
    }
    return 0;
  }
}
