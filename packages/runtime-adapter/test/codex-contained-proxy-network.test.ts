import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {describe,it,expect} from 'vitest';
import {compileOriginalAgentSandbox,isolatedEnvironment} from '../src/native.js';
import {prepareCodexProcessJob,spawnCodexProcessJob,readCompletedCodexProcessJob} from '../src/codex-process-job.js';
import {digest} from '../src/files.js';

// Opt-in PUBLIC TLS handshake only: no HTTP/application request, credential,
// login, model or bill. A skipped case does not prove network acceptance.
describe.runIf(process.platform==='win32'&&process.arch==='x64'&&process.env.CIMILOOP_PUBLIC_TLS_ACCEPTANCE==='1')('contained proxy public TLS acceptance',()=>{
 it('reaches only the fixed public TLS host through the original deny-network model Job',async()=>{
  const root=mkdtempSync(join(tmpdir(),'ct-')),allowed=join(root,'allowed');mkdirSync(allowed);const source=join(root,'Public.cs'),binary=join(root,'Public.exe');
  writeFileSync(source,String.raw`using System;using System.IO;using System.Net.Sockets;using System.Net.Security;using System.Security.Authentication;using System.Text;class Public{static void Main(){var proxy=new Uri(Environment.GetEnvironmentVariable("HTTPS_PROXY"));using(var client=new TcpClient()){client.ReceiveTimeout=15000;client.SendTimeout=15000;client.Connect(proxy.Host,proxy.Port);var stream=client.GetStream();byte[] request=Encoding.ASCII.GetBytes("CONNECT chatgpt.com:443 HTTP/1.1\r\nHost: chatgpt.com:443\r\n\r\n");stream.Write(request,0,request.Length);var header=new StringBuilder();while(header.Length<8192&&!header.ToString().EndsWith("\r\n\r\n")){int value=stream.ReadByte();if(value<0)throw new IOException();header.Append((char)value);}if(!header.ToString().StartsWith("HTTP/1.1 200"))throw new IOException();using(var tls=new SslStream(stream,false)){tls.AuthenticateAsClient("chatgpt.com",null,SslProtocols.Tls12,false);if(!tls.IsAuthenticated||!tls.IsEncrypted)throw new IOException();Console.WriteLine("{\"tls_authenticated\":true,\"application_requests\":0}");}}}}`);
  await compileOriginalAgentSandbox(join(process.env.SystemRoot!,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/out:'+binary,source],undefined,root);
  const command={file:binary,args:[],sha256:digest(readFileSync(binary)).value},job=join(root,'job'),helper=join(root,'helpers'),launch=await prepareCodexProcessJob(job,helper,command,[],root,{roots:[allowed]},{policy:'codex_chatgpt_tunnel/1.0.0',timeout_ms:60000}),child=spawnCodexProcessJob(launch,{cwd:root,env:{...isolatedEnvironment(),HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:''}}),chunks:Buffer[]=[];child.stdout.on('data',(bytes:Buffer)=>chunks.push(bytes));
  const exit=await new Promise<number|null>((done,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('PUBLIC TLS observation timeout; retain '+root));},75000);child.once('close',code=>{clearTimeout(timer);done(code);});child.once('error',error=>{clearTimeout(timer);reject(error);});});
  expect(exit,'PUBLIC retained root: '+root).toBe(0);expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual({tls_authenticated:true,application_requests:0});expect(readCompletedCodexProcessJob(job,helper,command,[],root)).toBeDefined();
  const end=JSON.parse(readFileSync(join(job,'ended.json'),'utf8'));expect(end.network).toMatchObject({stopped:true,opened:1,connected:1,denied:0,limit_exceeded:false,boundary_failed:false,requests:[{host:'chatgpt.com',sni_verified:true}]});expect(end.network.bytes).toBeGreaterThan(0);
 },120000);
});
