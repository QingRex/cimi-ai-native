using System;
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
  public static int Main(string[] args) {
    try {
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
