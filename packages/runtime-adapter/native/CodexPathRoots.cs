using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Collections.Generic;
using System.Runtime.InteropServices;

// Inherited handles have desired access=0. They allow querying the original
// volume identity/name, not file reads, enumeration, writes or ACL changes.
public sealed class CodexPathRoots : IDisposable {
  [StructLayout(LayoutKind.Sequential)] struct Time {public uint Low,High;public ulong Value {get{return ((ulong)High<<32)|Low;}}}
  [StructLayout(LayoutKind.Sequential)] struct Info {public uint Attributes;public Time Created,Access,Write;public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateFile(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(IntPtr handle,out Info info);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandle(IntPtr handle,StringBuilder path,uint size,uint flags);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool DuplicateHandle(IntPtr from,IntPtr handle,IntPtr to,out IntPtr copy,uint access,bool inherit,uint options);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  sealed class Root {public string Path,Identity,Nt;public IntPtr Handle;}
  readonly List<Root> roots=new List<Root>();bool closed;
  static void Need(bool value){if(!value)throw new InvalidDataException("codex_volume_metadata_unproven");}
  static IntPtr Open(string path){IntPtr handle=CreateFile(path,0,7,IntPtr.Zero,3,0x02000000,IntPtr.Zero);Need(handle!=new IntPtr(-1));return handle;}
  static string Identity(IntPtr handle){Info info;Need(GetFileInformationByHandle(handle,out info)&&(info.Attributes&0x10)!=0&&(info.Attributes&0x400)==0);return info.Volume+":"+(((ulong)info.IndexHigh<<32)|info.IndexLow)+":"+info.Created.Value;}
  static string Nt(IntPtr handle){var path=new StringBuilder(32768);uint size=GetFinalPathNameByHandle(handle,path,32768,2);Need(size>0&&size<32768);string name=path.ToString().TrimEnd('\\');Need(System.Text.RegularExpressions.Regex.IsMatch(name,@"^\\Device\\HarddiskVolume[0-9]+$"));return name;}
  public static string[] Select(IEnumerable<string> paths){var selected=new SortedSet<string>(StringComparer.Ordinal);foreach(string path in paths){string root=System.IO.Path.GetPathRoot(System.IO.Path.GetFullPath(path)).ToUpperInvariant();Need(System.Text.RegularExpressions.Regex.IsMatch(root,@"^[A-Z]:\\$"));selected.Add(root);}Need(selected.Count>0&&selected.Count<=8);return selected.ToArray();}
  public CodexPathRoots(string[] paths){try{foreach(string path in paths){IntPtr source=Open(path),copy=IntPtr.Zero;try{Need(DuplicateHandle(GetCurrentProcess(),source,GetCurrentProcess(),out copy,0,true,2));roots.Add(new Root{Path=path,Handle=copy,Identity=Identity(source),Nt=Nt(source)});copy=IntPtr.Zero;}finally{CloseHandle(source);if(copy!=IntPtr.Zero)CloseHandle(copy);}}Verify();}catch{Dispose();throw;}}
  public IntPtr[] Handles {get{Need(!closed);return roots.Select(root=>root.Handle).ToArray();}}
  public string EnvironmentValue {get{Verify();return String.Join(";",roots.Select(root=>root.Path.Substring(0,1)+"="+root.Handle.ToInt64()).ToArray());}}
  public void Verify(){Need(!closed);foreach(var root in roots){Need(Identity(root.Handle)==root.Identity&&Nt(root.Handle)==root.Nt);IntPtr current=Open(root.Path);try{Need(Identity(current)==root.Identity&&Nt(current)==root.Nt);}finally{CloseHandle(current);}}}
  public object Proof(){Verify();return new{format="cimiloop/codex-volume-metadata/1.0.0",desired_access=0,roots=roots.Select(root=>new{path=root.Path,identity=root.Identity,nt_name=root.Nt,handle_value=root.Handle.ToInt64().ToString()}).ToArray()};}
  public void Complete(){Verify();foreach(var root in roots){Need(CloseHandle(root.Handle));root.Handle=IntPtr.Zero;}closed=true;}
  public void Dispose(){foreach(var root in roots)if(root.Handle!=IntPtr.Zero){CloseHandle(root.Handle);root.Handle=IntPtr.Zero;}}
}
