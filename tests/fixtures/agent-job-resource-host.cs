// Owned test-only Job and process allocation. No AppContainer or model claims.
using System;using System.IO;using System.Text;using System.Diagnostics;using System.Runtime.InteropServices;using System.Collections.Generic;using System.Web.Script.Serialization;
class AgentJobResourceHost{
 [StructLayout(LayoutKind.Sequential)]struct Basic{public long perProcess,perJob;public uint flags;public UIntPtr min,max;public uint active;public UIntPtr affinity;public uint priority,scheduling;}
 [StructLayout(LayoutKind.Sequential)]struct IO{public ulong a,b,c,d,e,f;}
 [StructLayout(LayoutKind.Sequential)]struct Limits{public Basic basic;public IO io;public UIntPtr processMem,jobMem,peakProcess,peakJob;}
 [StructLayout(LayoutKind.Sequential)]struct FT{public uint low,high;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr CreateJobObject(IntPtr attributes,string name);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(IntPtr job,int kind,ref Limits data,int size);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll")]static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll")]static extern bool GetProcessTimes(IntPtr p,out FT c,out FT e,out FT k,out FT u);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool QueryFullProcessImageName(IntPtr p,uint f,StringBuilder s,ref int n);
 [DllImport("kernel32.dll")]static extern IntPtr VirtualAlloc(IntPtr address,UIntPtr bytes,uint allocation,uint protect);
 [DllImport("kernel32.dll")]static extern bool VirtualFree(IntPtr address,UIntPtr bytes,uint kind);
 static readonly JavaScriptSerializer json=new JavaScriptSerializer();
 static object Identity(Process p){FT c,e,k,u;var s=new StringBuilder(32768);int n=s.Capacity;if(!GetProcessTimes(p.Handle,out c,out e,out k,out u)||!QueryFullProcessImageName(p.Handle,0,s,ref n))throw new Exception();return new{pid=p.Id,creation_ticks=(((ulong)c.high<<32)|c.low).ToString(),image=s.ToString()};}
 static int StartupFailure(string stage,int code,string errorType=null){Console.Error.WriteLine(json.Serialize(new{format="cimiloop/job-fixture-startup-failure/1.0.0",stage=stage,win32_error=code,error_type=errorType}));Console.Error.Flush();return 12;}
 static int Main(string[] args){if(args.Length==1&&args[0]=="--worker"){if(Console.ReadLine()!="allocate")return 0;IntPtr memory=VirtualAlloc(IntPtr.Zero,new UIntPtr(64UL*1024*1024),0x1000|0x2000,4);Console.WriteLine(json.Serialize(new{allocation_succeeded=memory!=IntPtr.Zero}));if(memory!=IntPtr.Zero)VirtualFree(memory,UIntPtr.Zero,0x8000);return 0;}
 IntPtr job=IntPtr.Zero;Process peer=null;string stage="validate_mode";try{
  if(args.Length!=2||!new List<string>{"normal","wide","foreign","small"}.Contains(args[1]))return StartupFailure(stage,0);
  Guid nonce=Guid.ParseExact(args[0],"D");string mode=args[1],name="Local\\CimiLoop.AgentWorkspace."+nonce.ToString("N");
  stage="create_job";job=CreateJobObject(IntPtr.Zero,name);int error=Marshal.GetLastWin32Error();if(job==IntPtr.Zero||error==183)return StartupFailure(stage,error);
  var limits=new Limits();limits.basic.flags=8712;limits.basic.active=1;limits.jobMem=new UIntPtr(mode=="small"?32UL*1024*1024:mode=="wide"?4294967296UL:2147483648UL);
  stage="configure_job";if(!SetInformationJobObject(job,9,ref limits,Marshal.SizeOf(typeof(Limits))))return StartupFailure(stage,Marshal.GetLastWin32Error());
  stage="start_peer";var start=new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"--worker"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};peer=Process.Start(start);
  stage="assign_peer";if(mode!="foreign"&&!AssignProcessToJobObject(job,peer.Handle))return StartupFailure(stage,Marshal.GetLastWin32Error());
  stage="read_identity";Console.WriteLine(json.Serialize(new{supervisor=Identity(Process.GetCurrentProcess()),peer=Identity(peer),job_name=name}));Console.Out.Flush();
  stage="await_control";string line=Console.ReadLine();if(line=="allocate"){peer.StandardInput.WriteLine("allocate");peer.StandardInput.Flush();Console.WriteLine(peer.StandardOutput.ReadLine());Console.Out.Flush();}return 0;
 }catch(Exception error){return StartupFailure(stage,Marshal.GetLastWin32Error(),error.GetType().Name);}finally{if(job!=IntPtr.Zero){TerminateJobObject(job,125);CloseHandle(job);}if(peer!=null){if(!peer.HasExited){peer.StandardInput.Close();if(!peer.WaitForExit(2000))peer.Kill();}peer.Dispose();}}}
}
