import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect,it} from 'vitest';
import {isolatedEnvironment} from '../../packages/runtime-adapter/src/native.js';

// Actual fresh Windows AppContainer and ACL/token effects. The copied public
// launcher installs the production component before creation/resume;
// it is not the complete Agent SDK or production quota qualification.
it.runIf(process.platform==='win32'&&process.arch==='x64')('denies writes through the OS Profile path while preserving private state writes',()=>{
 const parent=process.env.CIMILOOP_NATIVE_TEST_ROOT??join(process.env.LOCALAPPDATA!,'CimiS1');mkdirSync(parent,{recursive:true});const root=mkdtempSync(join(parent,'profile-')),sandbox=join(root,'sandbox');mkdirSync(join(sandbox,'workspace'),{recursive:true});mkdirSync(join(sandbox,'state'));
 console.error('Retain private Profile Native evidence: '+root);
 const native=fileURLToPath(new URL('../../packages/runtime-adapter/native/',import.meta.url));
 const copied=join(root,'AppContainer.cs'),original=readFileSync(join(native,'AppContainer.cs'),'utf8');
 const needle='int hr=CreateAppContainerProfile(profile,profile,"CimiLoop isolated runtime",capArray,(uint)capabilityCount,out sid); if(hr!=0) Marshal.ThrowExceptionForHR(hr);';expect(original.split(needle)).toHaveLength(2);
 const resume='Check(ResumeThread(process.thread)!=0xffffffff);';expect(original.split(resume)).toHaveLength(2);
 writeFileSync(copied,original.replace(needle,needle+' AgentProfileProbe.Parent(sid);').replace(resume,'AgentProfileProbe.BeforeResume(process.process,sid); '+resume),{flag:'wx'});
 const probe=join(root,'AgentProfileProbe.cs');writeFileSync(probe,String.raw`
using System;using System.IO;using System.Reflection;using System.Runtime.InteropServices;using System.Security.Principal;using System.Web.Script.Serialization;using Microsoft.Win32;using Microsoft.Win32.SafeHandles;using System.Security.AccessControl;
public class AgentProfileProbe {
 [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int GetAppContainerFolderPath(string sid,out IntPtr path);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int kind,out int value,int length,out int returned);
 [DllImport("advapi32.dll",EntryPoint="GetTokenInformation",SetLastError=true)] static extern bool TokenBuffer(IntPtr token,int kind,IntPtr buffer,int length,out int returned);
 [DllImport("userenv.dll")] static extern int GetAppContainerRegistryLocation(uint access,out IntPtr key);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 static RegistryKey Registry(uint access){IntPtr key;int hr=GetAppContainerRegistryLocation(access,out key);if(hr==unchecked((int)0x80070005))throw new UnauthorizedAccessException();if(hr!=0)Marshal.ThrowExceptionForHR(hr);return RegistryKey.FromHandle(new SafeRegistryHandle(key,true));}
 public static void BeforeResume(IntPtr process,IntPtr sid){
  IntPtr token;if(!OpenProcessToken(process,10,out token))throw new System.ComponentModel.Win32Exception();RegistryKey key;
  try{using(WindowsIdentity.Impersonate(token)){key=Registry(0xf003f);}}finally{CloseHandle(token);}
  using(key){key.SetValue("cimiloop-public-sentinel","PUBLIC original");using(var child=key.CreateSubKey("cimiloop-public-existing")){child.SetValue("sentinel","PUBLIC child");}}
  var type=typeof(AgentProfileProbe).Assembly.GetType("AgentProfileStorage");var method=type==null?null:type.GetMethod("ProtectRegistry");
  bool wrongSid=false,hostToken=false;string user=WindowsIdentity.GetCurrent().User.Value;
  if(method!=null){
   var foreign=new SecurityIdentifier("S-1-15-2-999");byte[] bytes=new byte[foreign.BinaryLength];foreign.GetBinaryForm(bytes,0);IntPtr other=Marshal.AllocHGlobal(bytes.Length);
   try{Marshal.Copy(bytes,0,other,bytes.Length);try{method.Invoke(null,new object[]{process,other});}catch(TargetInvocationException ex){wrongSid=ex.InnerException is InvalidDataException;}}finally{Marshal.FreeHGlobal(other);}
   try{method.Invoke(null,new object[]{System.Diagnostics.Process.GetCurrentProcess().Handle,sid});}catch(TargetInvocationException ex){hostToken=ex.InnerException is InvalidDataException;}
   method.Invoke(null,new object[]{process,sid});
  }
  Console.WriteLine(new JavaScriptSerializer().Serialize(new{event_type="profile.registry_scope",wrong_sid_rejected=wrongSid,host_token_rejected=hostToken,host_identity_restored=WindowsIdentity.GetCurrent().User.Value==user}));
 }
 static bool RegistryDenied(uint access,Action<RegistryKey> action){try{return Denied(()=>{using(var key=Registry(access)){action(key);}});}catch(System.Security.SecurityException){return true;}}
 public static void Parent(IntPtr sid){
  IntPtr pointer;int hr=GetAppContainerFolderPath(new SecurityIdentifier(sid).Value,out pointer);if(hr!=0)Marshal.ThrowExceptionForHR(hr);
  string path;try{path=Marshal.PtrToStringUni(pointer);}finally{Marshal.FreeCoTaskMem(pointer);}
  Environment.SetEnvironmentVariable("CIMILOOP_PROFILE_CANARY",path);
  File.WriteAllText(Path.Combine(path,"cimiloop-storage-sentinel.txt"),"PUBLIC original sentinel");
  string child=Path.Combine(path,"cimiloop-storage-existing");Directory.CreateDirectory(child);File.WriteAllText(Path.Combine(child,"sentinel.txt"),"PUBLIC original child");
  var type=typeof(AgentProfileProbe).Assembly.GetType("AgentProfileStorage");if(type!=null)type.GetMethod("Protect").Invoke(null,new object[]{sid});
  Console.WriteLine(new JavaScriptSerializer().Serialize(new{event_type="profile.parent_diagnostic",path=path,package_sid=new SecurityIdentifier(sid).Value,component_installed=type!=null,sddl=Directory.GetAccessControl(path).GetSecurityDescriptorSddlForm(System.Security.AccessControl.AccessControlSections.Access)}));
 }
 static bool Denied(Action action){try{action();return false;}catch(UnauthorizedAccessException){return true;}}
 public static int Main(string[] args){
  if(args.Length==1&&args[0]=="--profile-storage-canary"){
   int app,returned;if(!GetTokenInformation(WindowsIdentity.GetCurrent().Token,29,out app,4,out returned)||app!=1)return 13;
   string profile=Environment.GetEnvironmentVariable("CIMILOOP_PROFILE_CANARY"),state=Environment.GetEnvironmentVariable("TEMP");if(String.IsNullOrEmpty(profile)||String.IsNullOrEmpty(state))return 13;
   string name="cimiloop-"+Guid.NewGuid().ToString("N");
   int size;TokenBuffer(WindowsIdentity.GetCurrent().Token,31,IntPtr.Zero,0,out size);IntPtr info=Marshal.AllocHGlobal(size);string package;try{if(!TokenBuffer(WindowsIdentity.GetCurrent().Token,31,info,size,out size))return 13;package=new SecurityIdentifier(Marshal.ReadIntPtr(info)).Value;}finally{Marshal.FreeHGlobal(info);}
   Console.WriteLine(new JavaScriptSerializer().Serialize(new{event_type="profile.child_diagnostic",path=profile,package_sid=package,sddl=Directory.GetAccessControl(profile).GetSecurityDescriptorSddlForm(System.Security.AccessControl.AccessControlSections.Access)}));
   bool rootDenied=Denied(()=>File.WriteAllText(Path.Combine(profile,name+".txt"),"PUBLIC"));
   bool childDenied=Denied(()=>Directory.CreateDirectory(Path.Combine(profile,name)));
   bool existingDenied=Denied(()=>File.AppendAllText(Path.Combine(profile,"cimiloop-storage-sentinel.txt"),"PUBLIC forbidden"));
   bool nestedDenied=Denied(()=>File.AppendAllText(Path.Combine(profile,"cimiloop-storage-existing","sentinel.txt"),"PUBLIC forbidden"));
   bool deleteDenied=Denied(()=>File.Delete(Path.Combine(profile,"cimiloop-storage-sentinel.txt")));
   bool aclDenied=Denied(()=>{var acl=Directory.GetAccessControl(profile);acl.AddAccessRule(new System.Security.AccessControl.FileSystemAccessRule(new SecurityIdentifier(package),System.Security.AccessControl.FileSystemRights.FullControl,System.Security.AccessControl.InheritanceFlags.ContainerInherit|System.Security.AccessControl.InheritanceFlags.ObjectInherit,System.Security.AccessControl.PropagationFlags.None,System.Security.AccessControl.AccessControlType.Allow));Directory.SetAccessControl(profile,acl);});
   bool registryReadable;using(var key=Registry(0x20019)){registryReadable=String.Equals(key.GetValue("cimiloop-public-sentinel"),"PUBLIC original");}
   bool registryWriteDenied=RegistryDenied(0x2001b,key=>key.SetValue("cimiloop-public-write","PUBLIC forbidden"));
   bool registryCreateDenied=RegistryDenied(0x2001d,key=>{using(var child=key.CreateSubKey("cimiloop-public-new")){child.SetValue("sentinel","PUBLIC forbidden");}});
   bool registryNestedDenied=RegistryDenied(0x20019,key=>{using(var child=key.OpenSubKey("cimiloop-public-existing",true)){child.SetValue("sentinel","PUBLIC forbidden");}});
   bool registryDeleteDenied=RegistryDenied(0x3001d,key=>key.DeleteSubKeyTree("cimiloop-public-existing"));
   bool registryAclDenied=RegistryDenied(0x60019,key=>{var acl=key.GetAccessControl();acl.AddAccessRule(new RegistryAccessRule(new SecurityIdentifier(package),RegistryRights.FullControl,InheritanceFlags.ContainerInherit,PropagationFlags.None,AccessControlType.Allow));key.SetAccessControl(acl);});
   Directory.CreateDirectory(state);string own=Path.Combine(state,name+".txt");File.WriteAllText(own,"PUBLIC private state");bool stateWritable=File.ReadAllText(own)=="PUBLIC private state";
   Console.WriteLine(new JavaScriptSerializer().Serialize(new{format="cimiloop/private-profile-canary/1.0.0",appcontainer=true,profile_root_write_denied=rootDenied,profile_directory_create_denied=childDenied,profile_existing_file_write_denied=existingDenied,profile_nested_file_write_denied=nestedDenied,profile_delete_denied=deleteDenied,profile_acl_change_denied=aclDenied,registry_readable=registryReadable,registry_value_write_denied=registryWriteDenied,registry_subkey_create_denied=registryCreateDenied,registry_nested_value_write_denied=registryNestedDenied,registry_subkey_delete_denied=registryDeleteDenied,registry_acl_change_denied=registryAclDenied,private_state_writable=stateWritable}));return rootDenied&&childDenied&&existingDenied&&nestedDenied&&deleteDenied&&aclDenied&&stateWritable&&registryReadable&&registryWriteDenied&&registryCreateDenied&&registryNestedDenied&&registryDeleteDenied&&registryAclDenied?0:10;
  }
  return (int)typeof(AppContainer).GetMethod("Main",BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,new object[]{args});
 }
}`,{flag:'wx'});
 const binary=join(root,'profile-probe.exe'),sources=['IpcTransport.cs','GatewayTransport.cs','ConversationTransport.cs'].map(name=>join(native,name)),component=join(native,'AgentProfileStorage.cs');
 execFileSync(join(process.env.SystemRoot??'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/main:AgentProfileProbe','/reference:System.Web.Extensions.dll','/out:'+binary,copied,probe,...sources,...(existsSync(component)?[component]:[])],{windowsHide:true,timeout:30000,env:isolatedEnvironment(),maxBuffer:1048576});
 const proof=join(root,'proof.json'),stop=join(root,'stop');let stdout='';try{stdout=execFileSync(binary,[sandbox,'write','10000',binary,proof,stop,'--policy',JSON.stringify({network:{mode:'deny_all'},cost:{mode:'unmetered_probe_only'}}),'--profile-storage-canary'],{windowsHide:true,timeout:20000,encoding:'utf8',env:isolatedEnvironment(),maxBuffer:65536});}catch(error){if(error&&typeof error==='object'&&'stdout'in error)stdout=String(error.stdout);else throw error;}
 writeFileSync(join(root,'stdout-retained.txt'),stdout,{flag:'wx'});const observation=stdout.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).find(value=>value.format==='cimiloop/private-profile-canary/1.0.0');
 expect(stdout.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).find(value=>value.event_type==='profile.registry_scope')).toEqual({event_type:'profile.registry_scope',wrong_sid_rejected:true,host_token_rejected:true,host_identity_restored:true});
 expect(observation,'Retained Native evidence: '+root).toEqual({format:'cimiloop/private-profile-canary/1.0.0',appcontainer:true,profile_root_write_denied:true,profile_directory_create_denied:true,profile_existing_file_write_denied:true,profile_nested_file_write_denied:true,profile_delete_denied:true,profile_acl_change_denied:true,registry_readable:true,registry_value_write_denied:true,registry_subkey_create_denied:true,registry_nested_value_write_denied:true,registry_subkey_delete_denied:true,registry_acl_change_denied:true,private_state_writable:true});
 expect(JSON.parse(readFileSync(proof,'utf8'))).toMatchObject({phase:'ended',reason:'exited',exit_code:0});
},60000);
