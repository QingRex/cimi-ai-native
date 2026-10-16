using System;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

// Reads the NTFS file write generation. It never hashes, prints a path, or
// writes. A missing journal or an unreadable file is "none", not a proof.
public static class FileWriteGeneration {
  private const uint FSCTL_READ_FILE_USN_DATA = 0x000900EBu;
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool DeviceIoControl(SafeFileHandle handle, uint code, IntPtr input, uint inputSize, byte[] output, uint outputSize, out uint returned, IntPtr overlapped);

  private static string Generation(string path) {
    try {
      if (path.Length == 0 || path.IndexOf('\0') >= 0) return "none";
      using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 1, FileOptions.None)) {
        var buffer = new byte[1024];
        uint returned;
        if (!DeviceIoControl(stream.SafeFileHandle, FSCTL_READ_FILE_USN_DATA, IntPtr.Zero, 0, buffer, (uint)buffer.Length, out returned, IntPtr.Zero) || returned < 32) return "none";
        var major = BitConverter.ToUInt16(buffer, 4);
        var offset = major == 2 ? 24 : major == 3 ? 40 : -1;
        if (offset < 0 || returned < offset + 8) return "none";
        var usn = BitConverter.ToInt64(buffer, offset);
        if (usn < 0) return "none";
        return usn.ToString(CultureInfo.InvariantCulture);
      }
    } catch { return "none"; }
  }

  public static int Main(string[] args) {
    try {
      if (args.Length != 1 || args[0] != "query") return 2;
      Console.InputEncoding = Encoding.UTF8;
      Console.OutputEncoding = Encoding.UTF8;
      var text = Console.In.ReadToEnd() ?? "";
      if (text.Length > 0 && text[text.Length - 1] == '\n') text = text.Substring(0, text.Length - 1);
      if (text.Length > 0 && text[text.Length - 1] == '\r') text = text.Substring(0, text.Length - 1);
      var paths = text.Length == 0 ? new string[0] : text.Split('\n');
      if (paths.Length > 128) return 2;
      for (var i = 0; i < paths.Length; i++) {
        var path = paths[i];
        if (path.Length > 0 && path[path.Length - 1] == '\r') path = path.Substring(0, path.Length - 1);
        Console.Write(i.ToString(CultureInfo.InvariantCulture));
        Console.Write('\t');
        Console.WriteLine(Generation(path));
      }
      return 0;
    } catch { return 2; }
  }
}
