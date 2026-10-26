import {mkdtempSync,writeFileSync,copyFileSync,lstatSync,readdirSync,rmSync,constants} from 'node:fs';
import {join,dirname,basename,resolve,isAbsolute,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile,type ExecFileOptions} from 'node:child_process';
import {promisify} from 'node:util';
import {assertOrdinaryPath,bytesAt,digest,directory,RuntimeAdapterError} from './files.js';
import {privateNativeEnvironment} from './native-process-environment.js';

const fail=():never=>{throw new RuntimeAdapterError('native_compile_projection_unproven');};
const physical=(path:string)=>{const s=lstatSync(assertOrdinaryPath(path),{bigint:true});if(!s.isDirectory())fail();return {device:String(s.dev),inode:String(s.ino),created_ns:String(s.birthtimeNs)};};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const within=(root:string,target:string)=>{const path=relative(resolve(root),resolve(target));return !isAbsolute(path)&&path!=='..'&&!path.startsWith('..\\')&&!path.startsWith('../');};
// Code-only compiler projection, never a workspace/model/tool permission. The
// old compiler rejects long source/output names even with extended spelling.
// Keep canonical original paths and records; execute only frozen source copies
// in a new bounded private invocation directory. A failed projection is retained.
export async function projectWindowsCompiler<T>(compiler:string,rawArgs:readonly string[],execute:(args:string[])=>Promise<T>,temporaryRoot?:string):Promise<T>{
 const args=[...rawArgs];if(process.platform!=='win32'||args.every(arg=>arg.length<=240))return execute(args);
 const outputs=args.filter(arg=>arg.startsWith('/out:')),sources=args.filter(arg=>!arg.startsWith('/'));
 if(outputs.length!==1||!sources.length||sources.length>32||sources.some(p=>!isAbsolute(p)||!p.endsWith('.cs')))fail();
 const output=assertOrdinaryPath(outputs[0]!.slice(5));if(!isAbsolute(output)||!output.endsWith('.exe'))fail();
 const target=dirname(output),targetIdentity=physical(target),compilerDigest=digest(bytesAt(compiler)),frozen=sources.map(path=>({path:assertOrdinaryPath(path),bytes:bytesAt(path,1024*1024)}));
 if(temporaryRoot&&!within(temporaryRoot,target))fail();
 const temporaryParent=directory(temporaryRoot??join(target,'compiler-operations'));if(physical(temporaryParent).device!==targetIdentity.device)fail();
 const temporary=mkdtempSync(join(temporaryParent,'c-')),identity=physical(temporary),candidate=join(temporary,'native.exe');
 if(candidate.length>220)fail();
 const nonce=randomUUID(),prefix=join(target,'compiler-projection-'+nonce),save=(phase:string,value:unknown)=>writeFileSync(prefix+'-'+phase+'.json',JSON.stringify(value),{flag:'wx'});
 const projected=frozen.map((source,index)=>{const path=join(temporary,'source-'+index+'.cs');writeFileSync(path,source.bytes,{flag:'wx'});return path;});
 const prepared={format:'cimiloop/native-compile-projection/2.0.0',temporary_parent:temporaryParent,temporary,temporary_identity:identity,target,target_identity:targetIdentity,compiler,compiler_digest:compilerDigest,args,sources:frozen.map(source=>({path:source.path,digest:digest(source.bytes)}))};
 save('prepared',prepared);
 const verify=()=>{if(!same(physical(target),targetIdentity)||!same(physical(temporary),identity)||digest(bytesAt(compiler)).value!==compilerDigest.value||frozen.some((source,index)=>!bytesAt(source.path,1024*1024).equals(source.bytes)||!bytesAt(projected[index]!,1024*1024).equals(source.bytes)))fail();};
 try{
  verify();const result=await execute([...args.filter(arg=>arg.startsWith('/')&&!arg.startsWith('/out:')),'/out:'+candidate,...projected]);verify();
  const entries=readdirSync(temporary).sort(),expected=['native.exe',...projected.map(path=>basename(path))].sort(),s=lstatSync(assertOrdinaryPath(candidate),{bigint:true});
  if(!same(entries,expected)||!s.isFile()||s.nlink!==1n||s.size<1n||s.size>16n*1024n*1024n)fail();
  const outputDigest=digest(bytesAt(candidate,16*1024*1024));copyFileSync(candidate,output,constants.COPYFILE_EXCL);verify();if(digest(bytesAt(output,16*1024*1024)).value!==outputDigest.value)fail();
  save('completed',{format:prepared.format,prepared_digest:digest(JSON.stringify(prepared)),output,output_digest:outputDigest});
  if(dirname(temporary)!==temporaryParent||!basename(temporary).startsWith('c-')||!same(physical(temporary),identity)||!same(readdirSync(temporary).sort(),expected))fail();
  // Only this invocation's physically bound directory is removed. Original
  // source/output/projection receipts remain under the original build identity.
  rmSync(temporary,{recursive:true});save('disposed',{format:prepared.format,prepared_digest:digest(JSON.stringify(prepared)),temporary,temporary_identity:identity,resources_disposed:true});return result;
 }catch(error){try{save('failed',{format:prepared.format,prepared_digest:digest(JSON.stringify(prepared)),resources_disposed:false});}catch{}throw error;}
}

// Every compiler invocation, including the short-path case, gets its own cwd
// and directory environment beneath the explicit build owner. Never inherit
// the host user's AppData/TEMP and never mutate the parent's environment.
export async function executeWindowsCompiler(compiler:string,args:string[],options:ExecFileOptions,ownedRoot?:string){
 options.signal?.throwIfAborted();
 const outputs=args.filter(arg=>arg.startsWith('/out:'));if(outputs.length!==1||!isAbsolute(outputs[0]!.slice(5)))fail();
 if(ownedRoot&&!within(ownedRoot,outputs[0]!.slice(5)))fail();
 const root=directory(ownedRoot??dirname(outputs[0]!.slice(5))),invocation=mkdtempSync(join(directory(join(root,'compiler-operations')),'c-'));
 const scope=privateNativeEnvironment(join(invocation,'host')),systemRoot=process.env.SystemRoot??'C:\\Windows';
 const environment={SystemRoot:systemRoot,WINDIR:systemRoot,PATH:join(systemRoot,'System32'),...scope.environment};
 const request={format:'cimiloop/native-compiler-invocation/1.0.0',compiler,args,cwd:invocation,environment:scope.basis};
 const record=join(invocation,'request.json'),bytes=Buffer.from(JSON.stringify(request));writeFileSync(record,bytes,{flag:'wx'});
 const verify=()=>{scope.verify();if(!bytesAt(record).equals(bytes))fail();options.signal?.throwIfAborted();};
 try{verify();const result=await projectWindowsCompiler(compiler,args,async projected=>{verify();const output=await promisify(execFile)(compiler,projected,{...options,env:environment,cwd:invocation});verify();return output;},root);verify();writeFileSync(join(invocation,'completed.json'),JSON.stringify({format:request.format,request_digest:digest(bytes)}),{flag:'wx'});return result;}
 catch(error){try{writeFileSync(join(invocation,'failed.json'),JSON.stringify({format:request.format,request_digest:digest(bytes),resources_disposed:false}),{flag:'wx'});}catch{}throw error;}
}
