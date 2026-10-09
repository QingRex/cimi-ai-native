using System;
using System.Collections.Generic;
using System.Threading;
using System.Globalization;
using System.Diagnostics;
using System.Management;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Win32;

// Read-only host helper. No Runtime credentials, process control or workspace effects.
public static class AgentRunClock {
  [DllImport("kernel32.dll")] private static extern ulong GetTickCount64();
  private static string Stamp(DateTime value) { return value.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture); }
  [DllImport("kernel32.dll")] private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  private static string ReadBoundedLine() {
    var line=new StringBuilder();
    for(;;){int c=Console.In.Read();if(c<0){if(line.Length==0)return null;throw new InvalidOperationException();}if(c==10)return line.ToString();if(line.Length>=1024)throw new InvalidOperationException();line.Append((char)c);}
  }
  private static string Boot() {
    string boot=null;
    using(var query=new ManagementObjectSearcher("SELECT LastBootUpTime FROM Win32_OperatingSystem"))
    using(var rows=query.Get())foreach(ManagementObject row in rows)using(row){if(boot!=null)throw new InvalidOperationException();boot=Stamp(ManagementDateTimeConverter.ToDateTime((string)row["LastBootUpTime"]));}
    if(boot==null)throw new InvalidOperationException();return boot;
  }
  private static object Reading(string boot) {
    string machine;
    using(var root=RegistryKey.OpenBaseKey(RegistryHive.LocalMachine,RegistryView.Registry64))
    using(var key=root.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography",false)){machine=key==null?null:key.GetValue("MachineGuid") as string;}
    Guid parsed;if(!Guid.TryParse(machine,out parsed))throw new InvalidOperationException();
    string identity;
    using(var hash=SHA256.Create()){identity=BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(parsed.ToString("D")))).Replace("-","").ToLowerInvariant();}
    return new {format="cimiloop/agent-run-clock/1.0.0",utc=Stamp(DateTime.UtcNow),boot_utc=boot,uptime_ms=GetTickCount64(),machine_digest=identity};
  }
  private static int Stream() {
    var json=new JavaScriptSerializer(){MaxJsonLength=4096};
    var config=json.Deserialize<Dictionary<string,object>>(ReadBoundedLine());
    int pid;Guid nonce;
    if(config.Count!=3||(string)config["format"]!="cimiloop/agent-run-clock-channel-open/1.0.0"||
      !(config["owner_pid"] is int)||!Int32.TryParse(Convert.ToString(config["owner_pid"],CultureInfo.InvariantCulture),out pid)||pid<=0||
      !Guid.TryParse((string)config["nonce"],out nonce)||(string)config["nonce"]!=nonce.ToString("D"))return 2;
    using(var owner=Process.GetProcessById(pid))
    using(var done=new ManualResetEvent(false)){
      var handle=owner.Handle;if(WaitForSingleObject(handle,0)!=258)return 2;
      var monitor=new Thread(delegate(){while(!done.WaitOne(25)){if(WaitForSingleObject(handle,0)!=258)Environment.Exit(2);}}){IsBackground=true};
      monitor.Start();
      try {
        string boot=Boot(),ticks=owner.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture);
        Console.WriteLine(json.Serialize(new {format="cimiloop/agent-run-clock-channel/1.0.0",nonce=nonce.ToString("D"),owner_pid=pid,owner_creation_ticks=ticks,reading=Reading(boot)}));Console.Out.Flush();
        int sequence=0;
        for(;;){
          string line=ReadBoundedLine();if(line==null)return 0;
          var request=json.Deserialize<Dictionary<string,object>>(line);
          if(request.Count!=3||(string)request["format"]!="cimiloop/agent-run-clock-read/1.0.0"||(string)request["nonce"]!=nonce.ToString("D")||
            !(request["sequence"] is int)||(int)request["sequence"]!=sequence+1||sequence>=8192||WaitForSingleObject(handle,0)!=258)return 2;
          sequence++;
          Console.WriteLine(json.Serialize(new {format="cimiloop/agent-run-clock-reply/1.0.0",nonce=nonce.ToString("D"),sequence=sequence,reading=Reading(boot)}));Console.Out.Flush();
        }
      }finally{done.Set();monitor.Join();}
    }
  }
  public static int Main(string[] args) {
    try {
      if(args.Length==1&&args[0]=="--stream")return Stream();
      bool anchor=args.Length==2&&args[0]=="--anchor",continuous=args.Length==4&&args[0]=="--continuous";
      if (args.Length!=0&&!anchor&&!continuous) return 2;
      string ownerTicks=null; if(anchor||continuous){int pid;if(!Int32.TryParse(args[1],out pid)||pid<=0)return 2;using(var owner=Process.GetProcessById(pid)){if(owner.HasExited)return 2;ownerTicks=owner.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture);if(continuous&&ownerTicks!=args[2])return 2;}}
      string boot = null, machine = null;
      if(continuous){DateTime original;if(!DateTime.TryParseExact(args[3],"yyyy-MM-ddTHH:mm:ss.fffZ",CultureInfo.InvariantCulture,DateTimeStyles.AssumeUniversal|DateTimeStyles.AdjustToUniversal,out original)||original>DateTime.UtcNow)return 2;boot=Stamp(original);}
      else using (var query = new ManagementObjectSearcher("SELECT LastBootUpTime FROM Win32_OperatingSystem"))
      using (var rows = query.Get()) {
        foreach (ManagementObject row in rows) {
          using (row) { if (boot != null) return 2; boot = Stamp(ManagementDateTimeConverter.ToDateTime((string)row["LastBootUpTime"])); }
        }
      }
      using (var root = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64))
      using (var key = root.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography", false)) { machine = key == null ? null : key.GetValue("MachineGuid") as string; }
      Guid parsed;
      if (boot == null || !Guid.TryParse(machine, out parsed)) return 2;
      string identity;
      using (var hash = SHA256.Create()) { identity = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(parsed.ToString("D")))).Replace("-", "").ToLowerInvariant(); }
      ulong uptime = GetTickCount64();
      var reading=new { format = "cimiloop/agent-run-clock/1.0.0", utc = Stamp(DateTime.UtcNow), boot_utc = boot, uptime_ms = uptime, machine_digest = identity };
      Console.WriteLine(new JavaScriptSerializer().Serialize(anchor?(object)new {format="cimiloop/agent-run-clock-owner-anchor/1.0.0",reading=reading,owner_creation_ticks=ownerTicks}:(object)reading));
      return 0;
    } catch { return 2; }
  }
}
