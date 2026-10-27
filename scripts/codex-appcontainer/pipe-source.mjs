import {createHash} from 'node:crypto';
import {readFileSync,lstatSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {isAbsolute,dirname,resolve} from 'node:path';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const replace=(text,before,after)=>{if(text.split(before).length!==2)throw Error('Pinned pipe source shape changed');return text.replace(before,after);};
function ordinaryFile(path){if(typeof path!=='string'||!isAbsolute(path))throw Error('Dependency archive path must be absolute');for(let at=resolve(path);;at=dirname(at)){if(lstatSync(at).isSymbolicLink())throw Error('Linked dependency archive refused');if(dirname(at)===at)break;}const info=lstatSync(path);if(!info.isFile()||info.nlink!==1||info.size<1||info.size>4*1024**2)throw Error('Dependency archive unavailable');}

// No extraction to disk. The pinned Cargo checksum authenticates the archive,
// then a bounded regular-file parser refuses links, traversal and duplicates.
function archiveFiles(path,version,checksum){
 ordinaryFile(path);const bytes=readFileSync(path);if(sha(bytes)!==checksum)throw Error('Pinned dependency archive checksum differs');
 const tar=gunzipSync(bytes,{maxOutputLength:16*1024**2}),files=new Map(),prefix='reqwest-'+version+'/';let offset=0,terminated=false;
 const field=(b,at,size)=>decode(b.subarray(at,at+size)).split('\0',1)[0];
 const octal=raw=>{const text=raw.trim();if(!/^[0-7]+$/.test(text))throw Error('Unsupported dependency tar number');return Number.parseInt(text,8);};
 while(offset+512<=tar.length){
  const header=tar.subarray(offset,offset+512);if(header.every(byte=>byte===0)){if(!tar.subarray(offset).every(byte=>byte===0))throw Error('Trailing dependency archive data');terminated=true;break;}
  let sum=0;for(let i=0;i<512;i++)sum+=i>=148&&i<156?32:header[i];if(sum!==octal(field(header,148,8)))throw Error('Dependency tar header checksum differs');
  const name=(field(header,345,155)?field(header,345,155)+'/':'')+field(header,0,100),size=octal(field(header,124,12)),kind=header[156];
  if(!name.startsWith(prefix)||/[\\:\r\n]/.test(name)||name.split('/').some(part=>part==='.'||part==='..')||size>2*1024**2||offset+512+size>tar.length)throw Error('Unsupported dependency archive entry');
  const relative=name.slice(prefix.length);if(kind===0||kind===48){if(!relative||files.has(relative)||files.size>=512)throw Error('Duplicate dependency archive material');files.set(relative,Buffer.from(tar.subarray(offset+512,offset+512+size)));}
  else if(kind!==53||size!==0)throw Error('Linked or special dependency archive material refused');
  offset+=512+Math.ceil(size/512)*512;
 }
 if(!terminated||!files.has('Cargo.toml')||!files.has('src/connect.rs')||!files.has('LICENSE-MIT'))throw Error('Incomplete dependency archive');
 return files;
}

const requested=`["CIMILOOP_CODEX_EGRESS_PIPE", "CIMILOOP_CODEX_EGRESS_POLICY", "CIMILOOP_CODEX_EGRESS_SERVER_PID"].iter().any(|key| std::env::var_os(key).is_some())`;
const rawConnect=`
                use std::os::windows::io::IntoRawHandle;
                let Some(selected) = crate::cimi_pipe::configuration()? else {
                    return ClientOptions::new().open(pipe).map(TokioIo::new);
                };
                if selected.path.as_os_str() != pipe.as_ref() {
                    return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied, "original private pipe changed"));
                }
                let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
                loop {
                    match crate::cimi_pipe::open(&selected, true) {
                        Ok(handle) => {
                            let io = unsafe { tokio::net::windows::named_pipe::NamedPipeClient::from_raw_handle(handle.into_raw_handle()) }?;
                            return Ok(TokioIo::new(io));
                        }
                        Err(error) if error.raw_os_error() == Some(231) && std::time::Instant::now() < deadline => {
                            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                        }
                        Err(error) => return Err(error),
                    }
                }
`;

function patchReqwest(materials,version,helper){
 const text=path=>decode(materials.get(path)??Buffer.alloc(0)).replaceAll('\r\n','\n');
 materials.set('src/lib.rs',replace(text('src/lib.rs'),'mod connect;','mod connect;\n#[cfg(target_os = "windows")]\nmod cimi_pipe;'));
 materials.set('src/cimi_pipe.rs',helper);
 const configuration=`        let mut config = self.config;
        #[cfg(target_os = "windows")]
        if let Some(original_pipe) = crate::cimi_pipe::configuration().map_err(crate::error::builder)? {
            config.windows_named_pipe = Some(original_pipe.path.into());
            config.auto_sys_proxy = false;
            config.proxies.clear();
            config.https_only = true;
            config.connection_verbose = false;
            config.http_version_pref = HttpVersionPref::All;
            #[cfg(feature = "__rustls")]
            {
                config.tls = TlsBackend::Rustls;
                config.hostname_verification = true;
                config.certs_verification = true;
                config.tls_sni = true;
                ${version.startsWith('0.13.')?'config.tls_sslkeylogfile = false;':''}
            }
            #[cfg(not(feature = "__rustls"))]
            return Err(crate::error::builder(std::io::Error::new(std::io::ErrorKind::PermissionDenied, "software TLS unavailable for original private pipe")));
        }`;
 materials.set('src/async_impl/client.rs',replace(text('src/async_impl/client.rs'),'        let config = self.config;',configuration));
 materials.set('src/connect.rs',replace(text('src/connect.rs'),'async move { ClientOptions::new().open(pipe).map(TokioIo::new) }','async move {'+rawConnect+'            }'));
 return materials;
}

const websocketConnect=`    #[cfg(target_os = "windows")]
    if let Some(original_pipe) = crate::cimi_pipe::configuration().map_err(WebSocketError::Io)? {
        use std::os::windows::io::IntoRawHandle;
        let host = websocket_host(&request)?;
        if loopback_direct || request.uri().scheme_str() != Some("wss") || websocket_port(&request)? != 443
            || !["chatgpt.com", "auth.openai.com"].contains(&host) {
            return Err(WebSocketError::Io(io::Error::new(io::ErrorKind::PermissionDenied, "private model WebSocket destination denied")));
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        let pipe = loop {
            match crate::cimi_pipe::open(&original_pipe, true) {
                Ok(handle) => break unsafe { tokio::net::windows::named_pipe::NamedPipeClient::from_raw_handle(handle.into_raw_handle()) }.map_err(WebSocketError::Io)?,
                Err(error) if error.raw_os_error() == Some(231) && Instant::now() < deadline => {
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
                Err(error) => return Err(WebSocketError::Io(error)),
            }
        };
        let tls = build_rustls_client_config_with_custom_ca().map_err(|error| WebSocketError::Io(error.into()))?;
        let (stream, response) = client_async_tls_with_config(request, Box::new(pipe) as Box<dyn AsyncIo>, Some(config), Some(Connector::Rustls(tls))).await?;
        return Ok((ConnectionInner::Right(stream), response));
    }
`;

export function addPrivatePipeSource({files,edit,blob,archives}){
 if(!archives||Object.keys(archives).sort().join(',')!=='0.12.28,0.13.4')throw Error('Both pinned reqwest dependency archives are required');
 const lock=blob('codex-rs/Cargo.lock'),helper=readFileSync(new URL('./pipe_windows.rs',import.meta.url),'utf8').replaceAll('\r\n','\n'),dependencies=[];
 for(const version of ['0.12.28','0.13.4']){
  const block=lock.split('[[package]]').find(body=>new RegExp('^version = "'+version.replaceAll('.','\\.')+'"$','m').test(body)&&/^name = "reqwest"$/m.test(body));
  const checksum=block&&/^checksum = "([a-f0-9]{64})"$/m.exec(block)?.[1];if(!checksum||!block.includes('source = "registry+https://github.com/rust-lang/crates.io-index"'))throw Error('Pinned upstream dependency lock changed');
  const materials=patchReqwest(archiveFiles(archives[version],version,checksum),version,helper),base='codex-rs/vendor/cimiloop-reqwest-'+version+'/';
  for(const [path,body]of materials)files.set(base+path,body);
  dependencies.push({name:'reqwest',version,archive_sha256:checksum});
 }
 const manifest=files.get('codex-rs/Cargo.toml');if(/^exclude\s*=/m.test(manifest)||[...manifest.matchAll(/^members = \[[\s\S]*?\]/gm)].length!==1)throw Error('Pinned workspace membership changed');
 const excluded=manifest.replace(/^members = \[[\s\S]*?\]/m,text=>text+'\nexclude = ["vendor/cimiloop-reqwest-0.12.28", "vendor/cimiloop-reqwest-0.13.4"]');
 files.set('codex-rs/Cargo.toml',replace(excluded,'[patch.crates-io]','[patch.crates-io]\nreqwest_cimiloop_012 = { package = "reqwest", path = "vendor/cimiloop-reqwest-0.12.28" }\nreqwest_cimiloop_013 = { package = "reqwest", path = "vendor/cimiloop-reqwest-0.13.4" }'));
 const blocks=files.get('codex-rs/Cargo.lock').split('[[package]]');for(let i=1;i<blocks.length;i++){if(/^name = "reqwest"$/m.test(blocks[i]))blocks[i]=blocks[i].replace(/^source = "registry\+https:\/\/github.com\/rust-lang\/crates.io-index"\n/m,'').replace(/^checksum = "[a-f0-9]{64}"\n/m,'');}files.set('codex-rs/Cargo.lock',blocks.join('[[package]]'));
 edit('codex-rs/websocket-client/src/lib.rs',text=>replace(text,'mod dialer;','mod dialer;\n#[cfg(target_os = "windows")]\nmod cimi_pipe;'));
 files.set('codex-rs/websocket-client/src/cimi_pipe.rs',helper);
 edit('codex-rs/websocket-client/src/dialer.rs',text=>replace(text,'    let disable_nagle = tcp_nodelay == TcpNodelay::Enabled;',websocketConnect+'    let disable_nagle = tcp_nodelay == TcpNodelay::Enabled;'));
 edit('codex-rs/http-client/src/outbound_proxy.rs',text=>{
  text=replace(text,'    pub fn resolve_proxy_route(&self, request_url: &str) -> OutboundProxyRoute {','    pub fn resolve_proxy_route(&self, request_url: &str) -> OutboundProxyRoute {\n        #[cfg(target_os = "windows")]\n        if '+requested+' { return OutboundProxyRoute::Direct; }');
  return replace(text,'    ) -> io::Result<OutboundProxyRoute> {','    ) -> io::Result<OutboundProxyRoute> {\n        #[cfg(target_os = "windows")]\n        if '+requested+' { return Ok(OutboundProxyRoute::Direct); }');
 });
 edit('codex-rs/cli/src/main.rs',text=>replace(text,'fn main() -> anyhow::Result<()> {','fn main() -> anyhow::Result<()> {\n    if std::env::args_os().count() == 2 && std::env::args_os().nth(1).as_deref() == Some(std::ffi::OsStr::new("--cimiloop-transport-capabilities")) {\n        println!("{}", r#"{"format":"cimiloop/codex-client-transport/1.0.0","version":"0.162.0+cimiloop-lowbox.2","transport":"original_named_pipe_tls/1.0.0","http":true,"websocket":true,"qualification_proven":false}"#);\n        return Ok(());\n    }'));
 return{transport:'original_named_pipe_tls/1.0.0',transport_helper_digest:sha(helper),dependencies};
}
