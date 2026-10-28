using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

// The model and its TCP relay share one deny-network AppContainer and Job.
// Only this original supervisor can bridge the private pipe to fixed public
// TLS destinations. No credential file, HTTP authorization or TLS plaintext
// is inspected, copied or retained. No loopback exemption or firewall edit.
public static partial class CodexProcessJob {
  const string ProxyPolicy="codex_chatgpt_tunnel/1.0.0";
  const int ProxyConnections=32,ProxyBytes=32*1024*1024;
  [StructLayout(LayoutKind.Sequential)] struct ProxyPipeAttributes {public int Length;public IntPtr Descriptor;[MarshalAs(UnmanagedType.Bool)]public bool Inherit;}
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string text,uint revision,out IntPtr descriptor,out uint length);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafePipeHandle CreateNamedPipe(string name,uint access,uint mode,uint instances,uint output,uint input,uint timeout,ref ProxyPipeAttributes attributes);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe,out uint pid);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetNamedPipeServerProcessId(SafePipeHandle pipe,out uint pid);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafePipeHandle CreateFile(string name,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool WaitNamedPipe(string name,uint timeout);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool result);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
  static string ProxyPipeName(string nonce,string purpose){return "\\\\.\\pipe\\CimiLoop.Codex."+purpose+"."+Guid.Parse(nonce).ToString("N");}
  static NamedPipeServerStream ProxyPipe(string name,string sid,bool first,uint instances){
    string owner=WindowsIdentity.GetCurrent().User.Value;
    // The package can read/write, but cannot create a competing server instance.
    string sddl="D:P(D;;GA;;;NU)(A;;GA;;;SY)(A;;GA;;;"+owner+")(A;;0x0012019b;;;"+sid+")S:(ML;;NW;;;LW)";
    IntPtr descriptor;uint length;Need(ConvertStringSecurityDescriptorToSecurityDescriptor(sddl,1,out descriptor,out length));
    try{var attributes=new ProxyPipeAttributes{Length=Marshal.SizeOf(typeof(ProxyPipeAttributes)),Descriptor=descriptor,Inherit=false};var handle=CreateNamedPipe(name,3|0x40000000|(first?0x80000u:0u),8,instances,65536,65536,0,ref attributes);if(handle.IsInvalid){int error=Marshal.GetLastWin32Error();handle.Dispose();throw new System.ComponentModel.Win32Exception(error);}return new NamedPipeServerStream(PipeDirection.InOut,true,false,handle);}finally{LocalFree(descriptor);}
  }
  static NamedPipeClientStream ConnectProxyPipe(string name,bool synchronousControl=false){
    Need(name.StartsWith("\\\\.\\pipe\\CimiLoop.Codex.",StringComparison.Ordinal)&&name.Length<256);
    // Full duplex requires overlapped I/O; a blocking read on a synchronous
    // handle can otherwise prevent the write needed to obtain its reply.
    CodexWriteScope.Stage="proxy_pipe_open";var handle=CreateFile(name,0x0012019b,0,IntPtr.Zero,3,synchronousControl?0u:0x40000000u,IntPtr.Zero);if(handle.IsInvalid){int error=Marshal.GetLastWin32Error();handle.Dispose();throw new System.ComponentModel.Win32Exception(error);}
    CodexWriteScope.Stage="proxy_pipe_stream";
    return new NamedPipeClientStream(PipeDirection.InOut,!synchronousControl,true,handle);
  }
  static byte[] ProxyExact(Stream stream,int count){if(count<0||count>65536)throw new InvalidDataException();var bytes=new byte[count];int position=0;while(position<count){int read;var pipe=stream as PipeStream;if(pipe!=null&&!pipe.IsAsync)read=stream.Read(bytes,position,count-position);else{var pending=stream.BeginRead(bytes,position,count-position,null,null);if(!pending.AsyncWaitHandle.WaitOne(10000)){stream.Dispose();throw new IOException();}read=stream.EndRead(pending);}if(read==0)throw new EndOfStreamException();position+=read;}return bytes;}
  static void ProxyFrame(Stream stream,object value){byte[] bytes=Encoding.UTF8.GetBytes(Json.Serialize(value));Need(bytes.Length>0&&bytes.Length<=65536);stream.Write(BitConverter.GetBytes(bytes.Length),0,4);stream.Write(bytes,0,bytes.Length);stream.Flush();}
  static Dictionary<string,object> ProxyFrame(Stream stream){int length=BitConverter.ToInt32(ProxyExact(stream,4),0);Need(length>0&&length<=65536);return Json.DeserializeObject(new UTF8Encoding(false,true).GetString(ProxyExact(stream,length))) as Dictionary<string,object>;}
  static void WaitProxy(IAsyncResult pending,int timeout,WaitHandle stop){int outcome=WaitHandle.WaitAny(new[]{pending.AsyncWaitHandle,stop},timeout);if(outcome!=0)throw new IOException();}
  static void AcceptProxy(NamedPipeServerStream pipe,int timeout,WaitHandle stop){var pending=pipe.BeginWaitForConnection(null,null);WaitProxy(pending,timeout,stop);pipe.EndWaitForConnection(pending);}

  static int InnerProxy(string controlName,string egressName){
    using(var control=ConnectProxyPipe(controlName,true)){
      BasicProcess basic;int returned;Need(NtQueryInformationProcess(GetCurrentProcess(),0,out basic,Marshal.SizeOf(typeof(BasicProcess)),out returned)==0);uint server;Need(GetNamedPipeServerProcessId(control.SafePipeHandle,out server)&&basic.ParentPid.ToInt64()==server);
      Dictionary<string,object> input=ProxyFrame(control);
      Need(input!=null&&(input.Count==5||input.Count==6&&input.ContainsKey("path_roots")||input.Count==7&&input.ContainsKey("path_roots")&&input.ContainsKey("package_policy"))&&Convert.ToString(input["policy"])==ProxyPolicy);Environment.SetEnvironmentVariable("CIMILOOP_CANONICAL_ROOT_HANDLES",input.ContainsKey("path_roots")?Convert.ToString(input["path_roots"]):null);
      bool explicitPackage=input.ContainsKey("package_policy");if(explicitPackage)Need(Convert.ToString(input["package_policy"])=="explicit_package_access/1.0.0");
      string binary=Path.GetFullPath(Convert.ToString(input["binary"])),cwd=Path.GetFullPath(Convert.ToString(input["cwd"]));Need(Hash(File.ReadAllBytes(binary))==Convert.ToString(input["binary_digest"]));
      var args=input["args"] as object[];Need(args!=null&&args.Length<=512);var command=new StringBuilder(Quote(binary));foreach(var item in args){Need(item is string&&((string)item).IndexOf('\0')<0);command.Append(' ').Append(Quote((string)item));}Need(command.Length<32760);
      TcpListener listener=null;int port=0;
      // LPAC cannot create TCP sockets on all supported Windows builds. Its
      // compatible client opens the original, nonce-bound pipe directly and
      // keeps TLS inside the model process. No network capability is added.
      Environment.SetEnvironmentVariable("CIMILOOP_CONTAINED_CODEX","1");
      Environment.SetEnvironmentVariable("CIMILOOP_CODEX_EGRESS_PIPE",explicitPackage?egressName:null);
      Environment.SetEnvironmentVariable("CIMILOOP_CODEX_EGRESS_POLICY",explicitPackage?"original_named_pipe_tls/1.0.0":null);
      Environment.SetEnvironmentVariable("CIMILOOP_CODEX_EGRESS_SERVER_PID",explicitPackage?server.ToString():null);
      if(!explicitPackage){listener=new TcpListener(IPAddress.Loopback,0);listener.Start(32);port=((IPEndPoint)listener.LocalEndpoint).Port;}
      foreach(string name in new[]{"HTTP_PROXY","HTTPS_PROXY","ALL_PROXY","WS_PROXY","WSS_PROXY"})Environment.SetEnvironmentVariable(name,explicitPackage?null:"http://127.0.0.1:"+port);Environment.SetEnvironmentVariable("NO_PROXY","");
      if(!explicitPackage){
      int accepted=0;var relay=new Thread(()=>{try{while(true){var client=listener.AcceptTcpClient();if(Interlocked.Increment(ref accepted)>ProxyConnections){client.Close();continue;}Task.Factory.StartNew(()=>{
        try{using(client)using(var pipe=ConnectProxyPipe(egressName)){var stream=client.GetStream();var up=Task.Factory.StartNew(()=>{try{stream.CopyTo(pipe,16384);}catch(Exception error){ProxyFailure("inner_uplink",0,error.HResult);}finally{try{pipe.Close();}catch{}}},TaskCreationOptions.LongRunning);try{pipe.CopyTo(stream,16384);}catch(Exception error){ProxyFailure("inner_downlink",0,error.HResult);}finally{try{client.Close();pipe.Close();}catch{}up.Wait(2000);}}}catch{}
      },TaskCreationOptions.LongRunning);}}catch{}});relay.IsBackground=true;relay.Start();}
      var startup=new StartupEx();startup.Startup.Size=Marshal.SizeOf(typeof(Startup));startup.Startup.Flags=0x100;startup.Startup.Input=GetStdHandle(-10);startup.Startup.Output=GetStdHandle(-11);startup.Startup.Error=GetStdHandle(-12);var process=new ProcessInfo();
      IntPtr rootAttributes=IntPtr.Zero,rootHandles=IntPtr.Zero,packagePolicy=IntPtr.Zero;bool rootAttributesReady=false;
      if(input.ContainsKey("path_roots")){var inherited=new List<IntPtr>{startup.Startup.Input,startup.Startup.Output,startup.Startup.Error};string value=Convert.ToString(input["path_roots"]);Need(value.Length>0&&value.Length<=256);var pairs=value.Split(';');Need(pairs.Length>0&&pairs.Length<=8);foreach(string pair in pairs){var fields=pair.Split('=');Need(fields.Length==2&&fields[0].Length==1&&fields[0][0]>='A'&&fields[0][0]<='Z');long number=Int64.Parse(fields[1]);Need(number>0&&number%4==0);var handle=new IntPtr(number);Need(!inherited.Contains(handle));inherited.Add(handle);}IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,explicitPackage?2:1,0,ref size);Need(size.ToInt64()>0);rootAttributes=Marshal.AllocHGlobal(size);Need(InitializeProcThreadAttributeList(rootAttributes,explicitPackage?2:1,0,ref size));rootAttributesReady=true;if(explicitPackage){packagePolicy=Marshal.AllocHGlobal(4);Marshal.WriteInt32(packagePolicy,1);Need(UpdateProcThreadAttribute(rootAttributes,0,new IntPtr(0x2000f),packagePolicy,new IntPtr(4),IntPtr.Zero,IntPtr.Zero));}rootHandles=Marshal.AllocHGlobal(inherited.Count*IntPtr.Size);for(int i=0;i<inherited.Count;i++)Marshal.WriteIntPtr(rootHandles,i*IntPtr.Size,inherited[i]);Need(UpdateProcThreadAttribute(rootAttributes,0,new IntPtr(0x20002),rootHandles,new IntPtr(inherited.Count*IntPtr.Size),IntPtr.Zero,IntPtr.Zero));startup.Startup.Size=Marshal.SizeOf(typeof(StartupEx));startup.Attributes=rootAttributes;}
      try{Need(CreateProcess(binary,command,IntPtr.Zero,IntPtr.Zero,true,0x4|0x08000000|(rootAttributesReady?0x80000u:0u),IntPtr.Zero,cwd,ref startup,out process));ProxyFrame(control,explicitPackage?(object)new{pid=process.Pid,pipe_name=egressName}:new{pid=process.Pid,port=port});var permission=ProxyFrame(control);Need(permission!=null&&permission.Count==1&&Convert.ToString(permission["action"])=="resume");Need(ResumeThread(process.Thread)!=0xffffffff);Need(WaitForSingleObject(process.Process,0xffffffff)==0);uint exit;Need(GetExitCodeProcess(process.Process,out exit));return (int)Math.Min(exit,120);}finally{if(rootAttributesReady)DeleteProcThreadAttributeList(rootAttributes);if(rootHandles!=IntPtr.Zero)Marshal.FreeHGlobal(rootHandles);if(rootAttributes!=IntPtr.Zero)Marshal.FreeHGlobal(rootAttributes);if(packagePolicy!=IntPtr.Zero)Marshal.FreeHGlobal(packagePolicy);if(listener!=null)listener.Stop();if(process.Thread!=IntPtr.Zero)CloseHandle(process.Thread);if(process.Process!=IntPtr.Zero)CloseHandle(process.Process);}
    }
  }

  sealed class ProxyAudit {public string Host,Result="failed",Peer;public bool Sni;public long Sent,Received;public object Proof(){return new{host=Host,result=Result,peer_address=Peer,sni_verified=Sni,sent_bytes=Sent,received_bytes=Received};}}
  sealed class ModelProxy : IDisposable {
    readonly string name,sid;readonly IntPtr job;readonly bool explicitPackage;readonly object gate=new object();readonly ManualResetEvent stop=new ManualResetEvent(false);readonly List<Stream> streams=new List<Stream>();readonly List<TcpClient> sockets=new List<TcpClient>();readonly List<Task> tasks=new List<Task>();readonly List<ProxyAudit> audits=new List<ProxyAudit>();NamedPipeServerStream listener;Task accept;long bytes;bool closed;public volatile bool Violation;volatile bool limitExceeded;
    public ModelProxy(string name,string sid,IntPtr job,bool explicitPackage=false){this.explicitPackage=explicitPackage;this.name=name;this.sid=sid;this.job=job;listener=ProxyPipe(name,sid,true,32);accept=Task.Factory.StartNew(Serve,TaskCreationOptions.LongRunning);}
    void Serve(){try{while(!stop.WaitOne(0)){var pipe=listener;AcceptProxy(pipe,900000,stop);lock(gate){if(stop.WaitOne(0)){pipe.Dispose();return;}if(audits.Count>=ProxyConnections){limitExceeded=true;Violation=true;pipe.Dispose();return;}uint pid;Need(GetNamedPipeClientProcessId(pipe.SafePipeHandle,out pid));IntPtr client=OpenProcess(0x1000|0x100000,false,pid);Need(client!=IntPtr.Zero);try{bool member;Need(IsProcessInJob(client,job,out member)&&member);VerifyProxyToken(client,sid,explicitPackage);}finally{CloseHandle(client);}streams.Add(pipe);var audit=new ProxyAudit();audits.Add(audit);listener=ProxyPipe(name,sid,false,32);tasks.Add(Task.Factory.StartNew(()=>Handle(pipe,audit),TaskCreationOptions.LongRunning));}}}catch{if(!stop.WaitOne(0))Violation=true;}}
    static void Denied(Stream stream){byte[] bytes=Encoding.ASCII.GetBytes("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");stream.Write(bytes,0,bytes.Length);stream.Flush();}
    void Handle(NamedPipeServerStream pipe,ProxyAudit audit){TcpClient client=null;string stage="authority";int headerBytes=0;try{
      byte[] hello;
      if(explicitPackage){stage="sni";string host;hello=ReadHello(pipe,null,out host);if(host!="chatgpt.com"&&host!="auth.openai.com"){audit.Result="denied";return;}audit.Host=host;}
      else{string authority=ReadAuthority(pipe,ref headerBytes);stage="authority_validate";if(authority!="chatgpt.com:443"&&authority!="auth.openai.com:443"){audit.Result="denied";Denied(pipe);return;}audit.Host=authority.Substring(0,authority.Length-4);
        byte[] ok=Encoding.ASCII.GetBytes("HTTP/1.1 200 Connection Established\r\n\r\n");pipe.Write(ok,0,ok.Length);pipe.Flush();stage="sni";hello=ReadHello(pipe,audit.Host);}
      audit.Sni=true;
      stage="dns";var dns=Dns.BeginGetHostAddresses(audit.Host,null,null);WaitProxy(dns,8000,stop);var addresses=Dns.EndGetHostAddresses(dns);Need(addresses.Length>0&&addresses.Length<=32);foreach(var address in addresses)Need(PublicProxyAddress(address));Array.Sort(addresses,(left,right)=>left.AddressFamily==right.AddressFamily?StringComparer.Ordinal.Compare(left.ToString(),right.ToString()):left.AddressFamily==AddressFamily.InterNetwork?-1:1);var selected=addresses[0];
      stage="connect";client=new TcpClient(selected.AddressFamily);client.NoDelay=true;lock(gate){if(stop.WaitOne(0))throw new IOException();sockets.Add(client);}var connect=client.BeginConnect(selected,443,null,null);WaitProxy(connect,8000,stop);client.EndConnect(connect);Need(((IPEndPoint)client.Client.RemoteEndPoint).Address.Equals(selected));audit.Peer=selected.ToString();var stream=client.GetStream();Count(hello.Length);stream.Write(hello,0,hello.Length);audit.Sent+=hello.Length;audit.Result="connected";stage="stream";
      var up=Task.Factory.StartNew(()=>{try{Pump(pipe,stream,audit,true);}catch{}finally{try{client.Close();}catch{}}},TaskCreationOptions.LongRunning);lock(gate)tasks.Add(up);try{Pump(stream,pipe,audit,false);}finally{client.Close();pipe.Close();Need(up.Wait(2000));}
    }catch(Exception error){ProxyFailure(stage,headerBytes,error.HResult);if(audit.Result!="denied"&&audit.Result!="connected")audit.Result="failed";}finally{try{if(client!=null)client.Close();pipe.Dispose();}catch{}}}
    void Count(int size){if(Interlocked.Add(ref bytes,size)>ProxyBytes){limitExceeded=true;Violation=true;throw new IOException();}}
    void Pump(Stream from,Stream to,ProxyAudit audit,bool sending){var buffer=new byte[16384];int size;while(!stop.WaitOne(0)&&(size=from.Read(buffer,0,buffer.Length))>0){Count(size);to.Write(buffer,0,size);if(sending)Interlocked.Add(ref audit.Sent,size);else Interlocked.Add(ref audit.Received,size);}}
    public void Dispose(){if(closed)return;closed=true;stop.Set();lock(gate){try{listener.Dispose();}catch{}foreach(var stream in streams)try{stream.Dispose();}catch{}foreach(var socket in sockets)try{socket.Close();}catch{}}Need(accept.Wait(3000));bool drained=false;for(int round=0;round<3;round++){Task[] pending;lock(gate)pending=tasks.ToArray();Need(Task.WaitAll(pending,3000));lock(gate)if(pending.Length==tasks.Count){drained=true;break;}}Need(drained);}
    public object Proof(){Need(closed&&accept.IsCompleted);lock(gate){foreach(var task in tasks)Need(task.IsCompleted&&!task.IsFaulted&&!task.IsCanceled);int connected=0,denied=0,failed=0;var records=new List<object>();foreach(var audit in audits){if(audit.Result=="connected")connected++;else if(audit.Result=="denied")denied++;else failed++;records.Add(audit.Proof());}return new{format="cimiloop/codex-model-network-end/1.0.0",policy=ProxyPolicy,stopped=true,opened=audits.Count,connected=connected,denied=denied,failed=failed,bytes=bytes,limit_exceeded=limitExceeded,boundary_failed=Violation,requests=records};}}
  }

  static void ProxyFailure(string stage,int observed,int code){try{Console.Error.WriteLine(new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(new{format="cimiloop/codex-proxy-io-failure/1.0.0",stage=stage,observed_header_bytes=observed,hresult=code}));}catch{}}
  static string ReadAuthority(Stream stream,ref int observed){var bytes=new List<byte>();while(bytes.Count<8192){int value=stream.ReadByte();if(value<0)throw new EndOfStreamException();bytes.Add((byte)value);observed=bytes.Count;int n=bytes.Count;if(n>=4&&bytes[n-4]==13&&bytes[n-3]==10&&bytes[n-2]==13&&bytes[n-1]==10)break;}Need(bytes.Count<8192);string header=Encoding.ASCII.GetString(bytes.ToArray());var lines=header.Split(new[]{"\r\n"},StringSplitOptions.None);var first=lines[0].Split(' ');if(first.Length!=3||first[0]!="CONNECT"||first[2]!="HTTP/1.1"||!header.EndsWith("\r\n\r\n",StringComparison.Ordinal))return null;string authority=first[1].ToLowerInvariant();int hosts=0;foreach(string line in lines){if(line.StartsWith("Host:",StringComparison.OrdinalIgnoreCase)){hosts++;if(line.Substring(5).Trim().ToLowerInvariant()!=authority)return null;}if(line.StartsWith("Content-Length:",StringComparison.OrdinalIgnoreCase)||line.StartsWith("Transfer-Encoding:",StringComparison.OrdinalIgnoreCase))return null;}return hosts==1?authority:null;}
  static int U16(byte[] bytes,ref int at){Need(at>=0&&at+2<=bytes.Length);int value=bytes[at]*256+bytes[at+1];at+=2;return value;}
  static void Skip(byte[] bytes,ref int at,int count){Need(count>=0&&at+count<=bytes.Length);at+=count;}
  static byte[] ReadHello(Stream stream,string host){string actual;return ReadHello(stream,host,out actual);}
  static byte[] ReadHello(Stream stream,string host,out string actualHost){actualHost=null;var wire=new MemoryStream();var handshake=new MemoryStream();int expected=0;while(expected==0||handshake.Length<expected){byte[] header=ProxyExact(stream,5);Need(header[0]==22&&header[1]==3);int count=header[3]*256+header[4];Need(count>0&&count<=18432&&wire.Length+count+5<=65536);byte[] body=ProxyExact(stream,count);wire.Write(header,0,5);wire.Write(body,0,body.Length);handshake.Write(body,0,body.Length);var accumulated=handshake.ToArray();if(accumulated.Length>=4){Need(accumulated[0]==1);expected=4+accumulated[1]*65536+accumulated[2]*256+accumulated[3];Need(expected>=40&&expected<=65536);}}byte[] hello=handshake.ToArray();Need(hello.Length==expected);int at=4;Skip(hello,ref at,34);Need(at<hello.Length);int session=hello[at++];Skip(hello,ref at,session);Skip(hello,ref at,U16(hello,ref at));Need(at<hello.Length);int compression=hello[at++];Skip(hello,ref at,compression);int extensionBytes=U16(hello,ref at),end=at+extensionBytes;Need(end==hello.Length);bool found=false;var seen=new HashSet<int>();while(at<end){int kind=U16(hello,ref at),length=U16(hello,ref at),next=at+length;Need(next<=end&&seen.Add(kind)&&kind!=0xfe0d);if(kind==0){Need(!found&&U16(hello,ref at)==length-2&&at<next&&hello[at++]==0);int size=U16(hello,ref at);Need(size>0&&at+size==next);string name=Encoding.ASCII.GetString(hello,at,size).ToLowerInvariant();Need(host==null||name==host);actualHost=name;found=true;}at=next;}Need(found);return wire.ToArray();}
  static bool Prefix(byte[] bytes,byte[] network,int bits){for(int i=0;bits>0;i++,bits-=8){int mask=bits>=8?255:255<<(8-bits)&255;if((bytes[i]&mask)!=(network[i]&mask))return false;}return true;}
  static bool PublicProxyAddress(IPAddress address){if(address.IsIPv4MappedToIPv6||address.AddressFamily==AddressFamily.InterNetworkV6&&address.ScopeId!=0)return false;byte[] bytes=address.GetAddressBytes();if(bytes.Length==4){string[] blocked={"0.0.0.0/8","10.0.0.0/8","100.64.0.0/10","127.0.0.0/8","169.254.0.0/16","172.16.0.0/12","192.0.0.0/24","192.0.2.0/24","192.88.99.0/24","192.168.0.0/16","198.18.0.0/15","198.51.100.0/24","203.0.113.0/24","224.0.0.0/4","240.0.0.0/4"};foreach(string block in blocked){var fields=block.Split('/');if(Prefix(bytes,IPAddress.Parse(fields[0]).GetAddressBytes(),Int32.Parse(fields[1])))return false;}return true;}if(bytes.Length!=16||!Prefix(bytes,IPAddress.Parse("2000::").GetAddressBytes(),3))return false;foreach(string block in new[]{"2001::/23","2001:db8::/32","2002::/16","3fff::/20"}){var fields=block.Split('/');if(Prefix(bytes,IPAddress.Parse(fields[0]).GetAddressBytes(),Int32.Parse(fields[1])))return false;}return true;}
}
