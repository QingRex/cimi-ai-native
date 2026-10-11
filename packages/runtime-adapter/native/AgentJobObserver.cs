// Read-only OS resource witness. No filesystem/tool/model effect or Job creation.
using System;using System.IO;using System.Text;using System.Diagnostics;using System.Collections.Generic;using System.Runtime.InteropServices;using System.Web.Script.Serialization;
class AgentJobObserver {
 [StructLayout(LayoutKind.Sequential)] struct FT{public uint low,high;}
 [StructLayout(LayoutKind.Sequential)] struct Basic{public long perProcess,perJob;public uint flags;public UIntPtr min,max;public uint active;public UIntPtr affinity;public uint priority,scheduling;}
 [StructLayout(LayoutKind.Sequential)] struct IO{public ulong readOps,writeOps,otherOps,readBytes,writeBytes,otherBytes;}
 [StructLayout(LayoutKind.Sequential)] struct Limits{public Basic basic;public IO io;public UIntPtr processMem,jobMem,peakProcess,peakJob;}
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",SetLastError=true)]static extern uint WaitForSingleObject(IntPtr handle,uint ms);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetProcessTimes(IntPtr p,out FT c,out FT e,out FT k,out FT u);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool QueryFullProcessImageName(IntPtr p,uint f,StringBuilder image,ref int length);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr OpenJobObject(uint access,bool inherit,string name);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool QueryInformationJobObject(IntPtr job,int kind,out Limits data,int size,IntPtr returned);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool result);
 [DllImport("kernel32.dll")]static extern ulong GetTickCount64();
 static readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=65536,RecursionLimit=16};
 static void Require(bool v){if(!v)throw new InvalidDataException();}
 static void Keys(Dictionary<string,object> v,params string[] keys){Require(v!=null&&v.Count==keys.Length);foreach(string k in keys)Require(v.ContainsKey(k));}
 static Dictionary<string,object> Identity(IntPtr handle,int pid){FT c,e,k,u;var image=new StringBuilder(32768);int n=image.Capacity;Require(GetProcessTimes(handle,out c,out e,out k,out u)&&QueryFullProcessImageName(handle,0,image,ref n));return new Dictionary<string,object>{{"pid",pid},{"creation_ticks",(((ulong)c.high<<32)|c.low).ToString()},{"image",image.ToString()}};}
 static bool SameIdentity(Dictionary<string,object> a,Dictionary<string,object> b){return (int)a["pid"]==(int)b["pid"]&&a["creation_ticks"] as string==b["creation_ticks"] as string&&a["image"] as string==b["image"] as string;}
 static IntPtr Original(Dictionary<string,object> pin){Keys(pin,"pid","creation_ticks","image");Require(pin["pid"] is int&&(int)pin["pid"]>0&&pin["creation_ticks"] is string&&pin["image"] is string&&Path.IsPathRooted((string)pin["image"]));IntPtr h=OpenProcess(0x1000|0x100000,false,(int)pin["pid"]);Require(h!=IntPtr.Zero);try{Require(WaitForSingleObject(h,0)==258&&SameIdentity(Identity(h,(int)pin["pid"]),pin));return h;}catch{CloseHandle(h);throw;}}
 static int Main(string[] args){IntPtr owner=IntPtr.Zero,supervisor=IntPtr.Zero,peer=IntPtr.Zero,job=IntPtr.Zero;try{
  Require(args.Length==1);var cfg=json.Deserialize<Dictionary<string,object>>(args[0]);Keys(cfg,"format","nonce","scope_digest","owner","supervisor","peer","job_name","deadline_uptime_ms");
  Guid nonce;Require(cfg["format"] as string=="cimiloop/agent-job-query/1.0.0"&&Guid.TryParseExact(cfg["nonce"] as string,"D",out nonce)&&System.Text.RegularExpressions.Regex.IsMatch(cfg["scope_digest"] as string??"","^[a-f0-9]{64}$")&&cfg["job_name"] as string=="Local\\CimiLoop.AgentWorkspace."+nonce.ToString("N"));
  ulong deadline=0;if(cfg["deadline_uptime_ms"]!=null){Require(cfg["deadline_uptime_ms"] is int||cfg["deadline_uptime_ms"] is long);long d=Convert.ToInt64(cfg["deadline_uptime_ms"]);Require(d>0&&d<=9007199254740991L);deadline=(ulong)d;}Require(deadline==0||GetTickCount64()<deadline);
  owner=Original((Dictionary<string,object>)cfg["owner"]);supervisor=Original((Dictionary<string,object>)cfg["supervisor"]);peer=Original((Dictionary<string,object>)cfg["peer"]);
  job=OpenJobObject(4,false,(string)cfg["job_name"]);Require(job!=IntPtr.Zero);Limits limits;bool member;Require(QueryInformationJobObject(job,9,out limits,Marshal.SizeOf(typeof(Limits)),IntPtr.Zero)&&IsProcessInJob(peer,job,out member)&&member);
  Require(limits.basic.flags==8712&&limits.basic.active==1&&limits.jobMem.ToUInt64()==2147483648UL&&limits.processMem.ToUInt64()==0);
  ulong sampled=GetTickCount64();Require((deadline==0||sampled<deadline)&&WaitForSingleObject(owner,0)==258&&WaitForSingleObject(supervisor,0)==258&&WaitForSingleObject(peer,0)==258);
  using(var current=Process.GetCurrentProcess()){Console.OutputEncoding=new UTF8Encoding(false);Console.WriteLine(json.Serialize(new{format="cimiloop/agent-job-observation/1.0.0",nonce=cfg["nonce"],scope_digest=cfg["scope_digest"],owner=cfg["owner"],supervisor=cfg["supervisor"],peer=cfg["peer"],observer=Identity(current.Handle,current.Id),job_name=cfg["job_name"],limit_flags=limits.basic.flags,active_process_limit=limits.basic.active,job_memory_limit_bytes=limits.jobMem.ToUInt64(),process_memory_limit_bytes=limits.processMem.ToUInt64(),peer_in_job=true,sampled_uptime_ms=sampled}));}return 0;
 }catch{Console.WriteLine("{\"format\":\"cimiloop/agent-job-query-failure/1.0.0\",\"reason\":\"agent_job_observation_unproven\"}");return 12;}finally{foreach(IntPtr h in new[]{job,peer,supervisor,owner})if(h!=IntPtr.Zero)CloseHandle(h);}}
}
