// Developer-only build runner. It never loads Codex login/configuration,
// installs an execution provider, or creates a production qualification.
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,openSync,closeSync,writeSync,lstatSync,statfsSync,realpathSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join,dirname,isAbsolute,relative} from 'node:path';
import {prepareSource} from './prepare-source.mjs';
import {preparePipeModuleSource,verifyPipeModuleSource} from './prepare-pipe-modules.mjs';
import {fileURLToPath} from 'node:url';

const [rawRoot,stage,action,toolsFlag,toolsPath]=process.argv.slice(2);
if(process.platform!=='win32'||process.arch!=='x64'||![5,7].includes(process.argv.length)||process.argv.length===7&&(toolsFlag!=='--tools'||!isAbsolute(toolsPath??''))||!rawRoot||!isAbsolute(rawRoot)||!/^[a-z0-9-]{1,48}$/.test(stage??'')||!['msvc-env','rust-version','fetch','test-paths','build','pipe-acceptance','check-pipe-modules'].includes(action))throw Error('Usage: node run-build-stage.mjs <absolute-private-build-root> <new-stage-id> <msvc-env|rust-version|fetch|test-paths|build|pipe-acceptance|check-pipe-modules> [--tools <absolute-private-tools-file>]');
function ordinary(path){path=resolve(path);for(let current=path;;current=dirname(current)){if(lstatSync(current).isSymbolicLink())throw Error('Linked build path refused');if(dirname(current)===current)break;}return path;}
const root=realpathSync.native(ordinary(rawRoot)),configPath=ordinary(toolsPath??join(root,'build-tools.json'));
const configRelative=relative(root,configPath);if(isAbsolute(configRelative)||configRelative==='..'||configRelative.startsWith('..\\'))throw Error('Build tools file must be in the private build root');
const config=JSON.parse(readFileSync(configPath,'utf8'));
const pipeSource=config.format==='cimiloop/private-codex-build-tools/2.0.0',keys=['format','git','python','visual_studio','msvc_environment',...(pipeSource?['source_policy','reqwest_archives']:[])];
if(Object.keys(config).sort().join(',')!==keys.sort().join(',')||!pipeSource&&config.format!=='cimiloop/private-codex-build-tools/1.0.0'||pipeSource&&config.source_policy!=='original_named_pipe_tls/1.0.0')throw Error('Invalid private build tool configuration');
for(const key of ['git','python','visual_studio','msvc_environment'])if(typeof config[key]!=='string'||!isAbsolute(config[key]))throw Error('Build tool paths must be absolute');
const sourceOptions=pipeSource?{privatePipe:true,reqwestArchives:config.reqwest_archives}:{};
if(action==='check-pipe-modules'&&!pipeSource)throw Error('Pipe module check requires explicit source policy2');
if(pipeSource){if(!config.reqwest_archives||Object.keys(config.reqwest_archives).sort().join(',')!=='0.12.28,0.13.4')throw Error('Pinned dependency archives required');for(const path of Object.values(config.reqwest_archives)){if(typeof path!=='string'||!isAbsolute(path))throw Error('Dependency archive must be absolute');const child=relative(root,ordinary(path));if(isAbsolute(child)||child==='..'||child.startsWith('..\\'))throw Error('Dependency archives must be in the private build root');}}
for(const key of ['git','python'])if(!lstatSync(ordinary(config[key])).isFile())throw Error('Build tool must be an ordinary file');
const vs=ordinary(config.visual_studio),vsCommand=join(vs,'Common7/Tools/VsDevCmd.bat');
if(!existsSync(vsCommand)||/["%\r\n&|<>!]/.test(vsCommand))throw Error('Unsupported Visual Studio path');
const envRelative=relative(root,config.msvc_environment);if(isAbsolute(envRelative)||envRelative==='..'||envRelative.startsWith('..\\'))throw Error('MSVC environment must be in the private build root');
const system=process.env.SystemRoot??'C:\\Windows',env={SystemRoot:system,WINDIR:system,ComSpec:join(system,'System32/cmd.exe'),PATH:join(system,'System32')+';'+dirname(config.git),HOME:join(root,'home'),USERPROFILE:join(root,'home'),LOCALAPPDATA:join(root,'local'),APPDATA:join(root,'roaming'),TEMP:join(root,'temp'),TMP:join(root,'temp'),CARGO_HOME:join(root,'cargo'),RUSTUP_HOME:join(root,'rustup'),CARGO_TARGET_DIR:join(root,'target'),RUSTUP_TOOLCHAIN:'1.95.0',CARGO_INCREMENTAL:'0',CARGO_BUILD_JOBS:'2',CARGO_PROFILE_DEV_DEBUG:'0',CARGO_PROFILE_TEST_DEBUG:'0',CARGO_PROFILE_RELEASE_DEBUG:'0',CARGO_PROFILE_RELEASE_LTO:'false',CARGO_PROFILE_RELEASE_OPT_LEVEL:'1',CARGO_PROFILE_RELEASE_CODEGEN_UNITS:'16',CARGO_PROFILE_RELEASE_STRIP:'debuginfo',GIT_TERMINAL_PROMPT:'0',VSCMD_SKIP_SENDTELEMETRY:'1',DOTNET_CLI_TELEMETRY_OPTOUT:'1',PYTHON:config.python,PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1'};
if(action==='check-pipe-modules')env.CARGO_BUILD_JOBS='1';
for(const key of ['HOME','LOCALAPPDATA','APPDATA','TEMP','CARGO_HOME','RUSTUP_HOME','CARGO_TARGET_DIR'])mkdirSync(env[key],{recursive:true});
// Discard keys/tokens, user Cargo/Git settings, Python paths, and Codex homes.
for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,env);
mkdirSync(join(root,'stages'),{recursive:true});
const directory=join(root,'stages',stage);mkdirSync(directory,{recursive:false});
let sourceBefore;
if(['fetch','test-paths','build'].includes(action)){sourceBefore=prepareSource(join(root,'source'),{...sourceOptions,verify:true});writeFileSync(join(directory,'source-before.json'),JSON.stringify(sourceBefore,null,2),{flag:'wx'});}
if(['test-paths','build','pipe-acceptance','check-pipe-modules'].includes(action)){
 const allowed=new Set(['path','include','lib','libpath','vctoolsinstalldir','vctoolsversion','vsinstalldir','vcinstalldir','windowssdkdir','windowssdkversion','universalcrtsdkdir','ucrtversion','windowssdkbinpath','windowssdkverbinpath','vscmd_arg_tgt_arch','vscmd_arg_host_arch','visualstudioversion']);
 for(const line of readFileSync(ordinary(config.msvc_environment),'utf8').split(/\r?\n/)){const at=line.indexOf('=');if(at<1)continue;const key=line.slice(0,at);if(allowed.has(key.toLowerCase())){for(const prior of Object.keys(env))if(prior.toLowerCase()===key.toLowerCase())delete env[prior];env[key]=line.slice(at+1);}}
 const pathKey=Object.keys(env).find(key=>key.toLowerCase()==='path');env[pathKey]+=';'+dirname(config.python)+';'+join(vs,'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin')+';'+join(vs,'Common7/IDE/CommonExtensions/Microsoft/CMake/Ninja');
 env.CARGO_NET_OFFLINE='true';
}
let file=join(root,'cargo/bin/cargo.exe'),args,cwd=root,fixtureBefore,moduleBefore;
const fingerprint=path=>{ordinary(path);const value=lstatSync(path,{bigint:true});if(!value.isFile()||value.nlink!==1n||value.size>512n*1024n**2n)throw Error('Original fixture material unavailable');return{path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),identity:{dev:String(value.dev),ino:String(value.ino),birth:String(value.birthtimeNs)}};};
if(action==='msvc-env'){
 const script=join(directory,'msvc-env.cmd');if(/["%\r\n&|<>!]/.test(script))throw Error('Unsupported private build path');
 writeFileSync(script,'@echo off\r\ncall "'+vsCommand+'" -no_logo -arch=x64 -host_arch=x64 >nul\r\nif errorlevel 1 exit /b %errorlevel%\r\nset\r\n',{flag:'wx'});file=env.ComSpec;args=['/d','/c',script];
}else if(action==='rust-version'){file=join(root,'cargo/bin/rustc.exe');args=['+1.95.0','--version','--verbose'];}
else if(action==='check-pipe-modules'){
 cwd=join(directory,'modules');moduleBefore=preparePipeModuleSource(join(root,'source'),cwd,sourceOptions);
 writeFileSync(join(directory,'module-before.json'),JSON.stringify(moduleBefore,null,2),{flag:'wx'});
 args=['+1.95.0','check','--release','--offline','--target','x86_64-pc-windows-msvc','-p','cimiloop-private-pipe-module-check','--lib'];
}
else if(action==='pipe-acceptance'){
 // A small direct-rustc harness reuses already-built, original dependency
 // libraries. It does not run Cargo or rebuild the Codex workspace.
 const dependencies=join(root,'target/x86_64-pc-windows-msvc/release/deps'),names=readdirSync(ordinary(dependencies)),source=fileURLToPath(new URL('./pipe_acceptance.rs',import.meta.url)),helper=fileURLToPath(new URL('./pipe_windows.rs',import.meta.url)),output=join(directory,'bin');mkdirSync(output);
 file=join(root,'rustup/toolchains/1.95.0-x86_64-pc-windows-msvc/bin/rustc.exe');
 args=[source,'--crate-name','cimiloop_pipe_acceptance','--crate-type','bin','--edition=2024','--target','x86_64-pc-windows-msvc','-C','opt-level=1','-C','debuginfo=0','-C','target-feature=+crt-static','--out-dir',output,'-L','dependency='+dependencies,'-L','dependency='+ordinary(join(root,'target/release/deps'))];
 const libraries=[];for(const name of ['rustls','rustls_native_certs','codex_utils_rustls_provider']){const found=names.filter(file=>file.startsWith('lib'+name+'-')&&file.endsWith('.rlib'));if(found.length!==1)throw Error('Cached acceptance dependency missing or ambiguous: '+name);const path=join(dependencies,found[0]);libraries.push(path);args.push('--extern',name+'='+path);}
 const nativeBuild=join(root,'target/x86_64-pc-windows-msvc/release/build');for(const name of readdirSync(ordinary(nativeBuild))){if(/^(?:aws-lc-sys|ring)-/.test(name)){const path=join(nativeBuild,name,'out');if(existsSync(path))args.push('-L','native='+ordinary(path));}}
 fixtureBefore={format:'cimiloop/private-pipe-acceptance-source/1.0.0',scope:'transport_module_fixture_only',materials:[source,helper,...libraries].map(fingerprint),codex_client_build_proven:false};writeFileSync(join(directory,'fixture-before.json'),JSON.stringify(fixtureBefore,null,2),{flag:'wx'});
}
else{
 cwd=join(root,'source/codex-rs');
 args=action==='fetch'?['+1.95.0','fetch','--locked','--target','x86_64-pc-windows-msvc']:action==='test-paths'?['+1.95.0','test','--locked','--offline','--target','x86_64-pc-windows-msvc','-p','codex-utils-absolute-path','-p','codex-utils-home-dir','--lib']:['+1.95.0','build','--release','--locked','--offline','--target','x86_64-pc-windows-msvc','-p','codex-cli','--bin','codex','-p','codex-code-mode-host','--bin','codex-code-mode-host'];
}
const freeFloor=['pipe-acceptance','check-pipe-modules'].includes(action)?512*1024**2:2*1024**3;
ordinary(file);const sha256=createHash('sha256').update(readFileSync(file)).digest('hex'),free=()=>{const value=statfsSync(root);return value.bavail*value.bsize;};if(free()<freeFloor)throw Error('Build free-space floor reached before launch');
const {prepareCodexProcessJob,spawnCodexProcessJob,readStartedCodexProcessJob,readCompletedCodexProcessJob,readCodexProcessJobResources,requestCodexProcessJobCancellation}=await import(new URL('../../packages/runtime-adapter/dist/codex-process-job.js',import.meta.url));
// Build tools run in a developer Job (launch2), not in the model AppContainer.
// The Job owns the entire process tree and kills it if this runner disappears.
const command={file,sha256,args:[]},helpers=join(root,'helpers'),job=join(directory,'job'),launch=await prepareCodexProcessJob(job,helpers,command,args,cwd),out=openSync(join(directory,'stdout.log'),'wx'),err=openSync(join(directory,'stderr.log'),'wx');
let stopped=false,child;
try{child=spawnCodexProcessJob(launch,{cwd,env});}catch(error){closeSync(out);closeSync(err);throw error;}
child.stdout.on('data',bytes=>{writeSync(out,bytes);process.stdout.write(bytes);});child.stderr.on('data',bytes=>{writeSync(err,bytes);process.stderr.write(bytes);});child.stdin.end();
const timer=setInterval(()=>{if(free()<freeFloor&&!stopped){stopped=true;requestCodexProcessJobCancellation(launch);process.stderr.write('PUBLIC build stopped at free-space floor; retain the original Job\n');}},1000);
const code=await new Promise((done,reject)=>{child.once('close',done);child.once('error',reject);}).finally(()=>{clearInterval(timer);closeSync(out);closeSync(err);});
const started=readStartedCodexProcessJob(job,helpers,command,args,cwd),resources=readCodexProcessJobResources(started);if(code===0&&!stopped)readCompletedCodexProcessJob(job,helpers,command,args,cwd);
let sourceAfter,sourceError,fixtureAfter,moduleAfter;
try{if(sourceBefore){sourceAfter=prepareSource(join(root,'source'),{...sourceOptions,verify:true});if(JSON.stringify(sourceAfter)!==JSON.stringify(sourceBefore))throw Error('Original build source changed during stage');}if(fixtureBefore){fixtureAfter={...fixtureBefore,materials:fixtureBefore.materials.map(value=>fingerprint(value.path))};if(JSON.stringify(fixtureBefore)!==JSON.stringify(fixtureAfter))throw Error('Original pipe acceptance source changed during stage');}if(moduleBefore)moduleAfter=verifyPipeModuleSource(moduleBefore);}catch(error){sourceError=String(error);}
writeFileSync(join(directory,'result.json'),JSON.stringify({format:'cimiloop/portable-codex-build-stage/2.0.0',stage,action,code,stopped,command:{file,sha256,args},resources,source_before:sourceBefore,source_after:sourceAfter,fixture_before:fixtureBefore,fixture_after:fixtureAfter,module_before:moduleBefore,module_after:moduleAfter,source_error:sourceError,free_bytes:free(),free_floor_bytes:freeFloor,model_requests:0,credentials_read:false},null,2),{flag:'wx'});
if(code!==0||stopped||sourceError||resources.status!=='disposed')process.exitCode=1;
