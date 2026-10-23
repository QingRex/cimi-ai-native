using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

// Read-only OS facts. No create/attach/resize/format/delete API is imported.
class FixedVolumeQuota {
  [StructLayout(LayoutKind.Sequential)] struct StorageType { public uint Device; public Guid Vendor; }
  [StructLayout(LayoutKind.Sequential)] struct OpenParameters { public uint Version; public int GetInfoOnly, ReadOnly; public Guid Resiliency; }
  [StructLayout(LayoutKind.Explicit, Size=32)] struct DiskInfo {
    [FieldOffset(0)] public uint Version;
    [FieldOffset(8)] public ulong VirtualBytes;
    [FieldOffset(16)] public ulong PhysicalBytes;
    [FieldOffset(8)] public Guid Identifier;
    [FieldOffset(8)] public uint Subtype;
  }
  [StructLayout(LayoutKind.Sequential)] struct FileInformation {
    public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Created, Accessed, Written;
    public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
  }
  [DllImport("virtdisk.dll", CharSet=CharSet.Unicode)] static extern uint OpenVirtualDisk(ref StorageType type,string path,uint access,uint flags,ref OpenParameters parameters,out SafeFileHandle handle);
  [DllImport("virtdisk.dll")] static extern uint GetVirtualDiskInformation(SafeFileHandle handle,ref uint size,ref DiskInfo information,out uint used);
  [DllImport("virtdisk.dll", CharSet=CharSet.Unicode)] static extern uint GetVirtualDiskPhysicalPath(SafeFileHandle handle,ref uint size,StringBuilder path);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetVolumeNameForVolumeMountPoint(string root,StringBuilder name,uint length);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetVolumeInformation(string root,StringBuilder name,uint nameLength,out uint serial,out uint component,out uint flags,StringBuilder fs,uint fsLength);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetDiskFreeSpaceEx(string root,out ulong available,out ulong total,out ulong free);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFile(string path,uint access,uint share,IntPtr security,uint disposition,uint attributes,IntPtr template);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool DeviceIoControl(SafeFileHandle handle,uint code,IntPtr input,uint inputBytes,byte[] output,uint outputBytes,out uint returned,IntPtr overlapped);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle,out FileInformation info);
  static void Need(bool condition){if(!condition)throw new InvalidDataException();}
  static bool SameFile(FileInformation a,FileInformation b){return a.Volume==b.Volume&&a.IndexHigh==b.IndexHigh&&a.IndexLow==b.IndexLow&&a.Created.dwHighDateTime==b.Created.dwHighDateTime&&a.Created.dwLowDateTime==b.Created.dwLowDateTime&&a.Links==1&&b.Links==1&&a.Attributes==b.Attributes;}
  static void Ordinary(string path){for(string current=Path.GetFullPath(path);;current=Path.GetDirectoryName(current)){Need((File.GetAttributes(current)&FileAttributes.ReparsePoint)==0);if(current==Path.GetPathRoot(current))break;}}
  static string Volume(string root){var name=new StringBuilder(128);Need(GetVolumeNameForVolumeMountPoint(root,name,128));Need(Regex.IsMatch(name.ToString(),@"^\\\\\?\\Volume\{[0-9a-fA-F-]{36}\}\\$"));return name.ToString();}
  static DiskInfo Info(SafeFileHandle handle,uint version){uint size=32,used;var info=new DiskInfo{Version=version};Need(GetVirtualDiskInformation(handle,ref size,ref info,out used)==0);return info;}
  static Dictionary<string,object> Inspect(string image,string root,ulong maximum){
    Need(Regex.IsMatch(image,@"^[A-Za-z]:\\")&&image.EndsWith(".vhdx",StringComparison.OrdinalIgnoreCase));
    Need(Regex.IsMatch(root,@"^[D-Z]:\\$",RegexOptions.IgnoreCase)&&maximum>=64UL*1024*1024&&maximum<=8UL*1024*1024*1024&&maximum%(1024*1024)==0);
    image=Path.GetFullPath(image);root=root.ToUpperInvariant();Ordinary(image);
    Need((File.GetAttributes(image)&(FileAttributes.SparseFile|FileAttributes.Compressed|FileAttributes.Encrypted))==0);
    using(var file=new FileStream(image,FileMode.Open,FileAccess.Read,FileShare.ReadWrite)){
      FileInformation physical;Need(GetFileInformationByHandle(file.SafeFileHandle,out physical)&&physical.Links==1);
      var type=new StorageType();var parameters=new OpenParameters{Version=2,GetInfoOnly=1,ReadOnly=1};SafeFileHandle disk;
      Need(OpenVirtualDisk(ref type,image,0,0,ref parameters,out disk)==0);
      using(disk){
        var size=Info(disk,1);Need(size.VirtualBytes==maximum&&Info(disk,7).Subtype==2&&size.PhysicalBytes>=maximum&&size.PhysicalBytes<=maximum+64UL*1024*1024);
        Guid id=Info(disk,2).Identifier;Need(id!=Guid.Empty);
        uint pathBytes=512;var path=new StringBuilder(256);Need(GetVirtualDiskPhysicalPath(disk,ref pathBytes,path)==0);
        var match=Regex.Match(path.ToString(),@"^\\\\\.\\PhysicalDrive([0-9]+)$");Need(match.Success);uint device=UInt32.Parse(match.Groups[1].Value);
        string volume=Volume(root);Need(!String.Equals(volume,Volume(Path.GetPathRoot(Environment.SystemDirectory)),StringComparison.OrdinalIgnoreCase));
        Need(!String.Equals(volume,Volume(Path.GetPathRoot(image)),StringComparison.OrdinalIgnoreCase));
        uint serial,component,flags;var name=new StringBuilder(256);var fs=new StringBuilder(64);
        Need(GetVolumeInformation(root,name,256,out serial,out component,out flags,fs,64)&&fs.ToString()=="NTFS"&&(flags&0x80000)==0);
        ulong available,total,free;Need(GetDiskFreeSpaceEx(root,out available,out total,out free)&&total>0&&total<=maximum);
        byte[] extents=new byte[64];uint returned=0;
        using(var handle=CreateFile(volume.TrimEnd('\\'),0,7,IntPtr.Zero,3,0,IntPtr.Zero)){
          Need(!handle.IsInvalid&&DeviceIoControl(handle,0x00560000,IntPtr.Zero,0,extents,64,out returned,IntPtr.Zero));
          Need(returned>=32&&BitConverter.ToUInt32(extents,0)==1&&BitConverter.ToUInt32(extents,8)==device);
        }
        long start=BitConverter.ToInt64(extents,16),length=BitConverter.ToInt64(extents,24);
        Need(start>=0&&length>0&&(ulong)start<=maximum&&(ulong)length<=maximum-(ulong)start&&total<=(ulong)length);
        Need(file.Length>=(long)maximum&&file.Length<=(long)(maximum+64UL*1024*1024));
        // Reclose the named image and mount after the independent OS queries.
        // Keeping both file handles without delete sharing prevents a file swap;
        // the second handle also detects replacement of a containing directory.
        Ordinary(image);
        using(var currentFile=new FileStream(image,FileMode.Open,FileAccess.Read,FileShare.ReadWrite)){
          FileInformation current;Need(GetFileInformationByHandle(currentFile.SafeFileHandle,out current)&&SameFile(physical,current));
          var finalSize=Info(disk,1);Need(finalSize.VirtualBytes==size.VirtualBytes&&finalSize.PhysicalBytes==size.PhysicalBytes&&Info(disk,2).Identifier==id&&Info(disk,7).Subtype==2);
          uint finalPathBytes=512;var finalPath=new StringBuilder(256);Need(GetVirtualDiskPhysicalPath(disk,ref finalPathBytes,finalPath)==0&&finalPath.ToString()==path.ToString());
          Need(String.Equals(Volume(root),volume,StringComparison.OrdinalIgnoreCase));
          uint finalSerial,finalComponent,finalFlags;var finalName=new StringBuilder(256);var finalFs=new StringBuilder(64);
          Need(GetVolumeInformation(volume,finalName,256,out finalSerial,out finalComponent,out finalFlags,finalFs,64)&&finalSerial==serial&&finalFs.ToString()=="NTFS"&&(finalFlags&0x80000)==0);
          byte[] finalExtents=new byte[64];uint finalReturned=0;
          using(var finalVolume=CreateFile(volume.TrimEnd('\\'),0,7,IntPtr.Zero,3,0,IntPtr.Zero)){
            Need(!finalVolume.IsInvalid&&DeviceIoControl(finalVolume,0x00560000,IntPtr.Zero,0,finalExtents,64,out finalReturned,IntPtr.Zero));
            Need(finalReturned>=32&&BitConverter.ToUInt32(finalExtents,0)==1&&BitConverter.ToUInt32(finalExtents,8)==device&&BitConverter.ToInt64(finalExtents,16)==start&&BitConverter.ToInt64(finalExtents,24)==length);
          }
        }
        return new Dictionary<string,object>{
          {"format","cimiloop/fixed-volume-os-observation/1.0.0"},{"image_path",image},{"volume_root",root},
          {"image_identity",new Dictionary<string,object>{{"volume",physical.Volume.ToString()},{"index",(((ulong)physical.IndexHigh<<32)|physical.IndexLow).ToString()},{"created",(((ulong)(uint)physical.Created.dwHighDateTime<<32)|(uint)physical.Created.dwLowDateTime).ToString()}}},
          {"virtual_disk_id",id.ToString()},{"volume_id",volume},{"volume_serial",serial.ToString()},
          {"virtual_bytes",maximum},{"volume_bytes",total},{"physical_bytes",size.PhysicalBytes},{"provider_subtype",2},{"filesystem","NTFS"},
          {"physical_device",path.ToString()},{"extent_bytes",length}
        };
      }
    }
  }
  static int Main(string[] args){try{Need(args.Length==3);var result=Inspect(args[0],args[1],UInt64.Parse(args[2]));Console.Write(new JavaScriptSerializer().Serialize(result));return 0;}catch{Console.Error.Write("fixed_volume_original_unproven");return 2;}}
}
