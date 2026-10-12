using System;
using System.IO;
using System.Reflection;
using System.Collections.Generic;
using System.Web.Script.Serialization;
public class ParentSkillConfigContract {
 public static int Main(string[] args) {
  var json=new JavaScriptSerializer(){MaxJsonLength=65536};
  try {
   var input=json.Deserialize<Dictionary<string,object>>(Console.ReadLine());
   var type=Assembly.LoadFrom(args[0]).GetType("AppContainer",true);
   string mode=(string)input["mode"];
   var config=(Dictionary<string,object>)input["config"];
   var method=type.GetMethod(mode=="config"?"AgentConfigDeadline":mode=="catalog"?"AgentParentSkillCatalog":"AgentWorkspacePermissions",BindingFlags.NonPublic|BindingFlags.Static);
   if(method==null){Console.Write(json.Serialize(new {accepted=false,reason="missing_original_method"}));return 0;}
   object result=method.Invoke(null,mode=="config"?new object[]{config}:mode=="catalog"?new object[]{config,(string)input["modules"]}:new object[]{config,(bool)input["production"],(bool)input["checks_only"]});
   Console.Write(json.Serialize(new {accepted=true,result=result}));return 0;
  } catch(Exception error) {
   var cause=error is TargetInvocationException?error.InnerException:error;
   Console.Write(json.Serialize(new {accepted=false,reason=cause.GetType().Name}));return 0;
  }
 }
}
