import {mkdtempSync,writeFileSync,copyFileSync,lstatSync,readdirSync,rmSync,constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {assertOrdinaryPath,bytesAt,digest,RuntimeAdapterError} from './files.js';

const fail=():never=>{throw new RuntimeAdapterError('native_compile_projection_unproven');};
const physical=(path:string)=>{const s=lstatSync(assertOrdinaryPath(path),{bigint:true});if(!s.isDirectory())fail();return {device:String(s.dev),inode:String(s.ino),created_ns:String(s.birthtimeNs)};};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
// Code-only compiler projection, never a workspace/model/tool permission. The
// old compiler rejects long source/output names even with extended spelling.
// Keep canonical original paths and records; execute only frozen source copies
// in a new bounded private invocation directory. A failed projection is retained.
export async function projectWindowsCompiler<T>(compiler:string,rawArgs:readonly string[],execute:(args:string[])=>Promise<T>):Promise<T>{
 const args=[...rawArgs];if(process.platform!=='win32'||args.every(arg=>arg.length<=240))return execute(args);
 const outputs=args.filter(arg=>arg.startsWith('/out:')),sources=args.filter(arg=>!arg.startsWith('/'));
 if(outputs.length!==1||!sources.length||sources.length>32||sources.some(p=>!isAbsolute(p)||!p.endsWith('.cs')))fail();
 const output=assertOrdinaryPath(outputs[0]!.slice(5));if(!isAbsolute(output)||!output.endsWith('.exe'))fail();
 const target=dirname(output),targetIdentity=physical(target),compilerDigest=digest(bytesAt(compiler)),frozen=sources.map(path=>({path:assertOrdinaryPath(path),bytes:bytesAt(path,1024*1024)}));
 const temporaryParent=assertOrdinaryPath(resolve(tmpdir())),temporary=mkdtempSync(join(temporaryParent,'cimiloop-compile-')),identity=physical(temporary),candidate=join(temporary,'native.exe');
 if(candidate.length>220)fail();
 const nonce=randomUUID(),prefix=join(target,'compiler-projection-'+nonce),save=(phase:string,value:unknown)=>writeFileSync(prefix+'-'+phase+'.json',JSON.stringify(value),{flag:'wx'});
 const projected=frozen.map((source,index)=>{const path=join(temporary,'source-'+index+'.cs');writeFileSync(path,source.bytes,{flag:'wx'});return path;});
 const prepared={format:'cimiloop/native-compile-projection/1.0.0',temporary,temporary_identity:identity,target,target_identity:targetIdentity,compiler,compiler_digest:compilerDigest,args,sources:frozen.map(source=>({path:source.path,digest:digest(source.bytes)}))};
 save('prepared',prepared);
 const verify=()=>{if(!same(physical(target),targetIdentity)||!same(physical(temporary),identity)||digest(bytesAt(compiler)).value!==compilerDigest.value||frozen.some((source,index)=>!bytesAt(source.path,1024*1024).equals(source.bytes)||!bytesAt(projected[index]!,1024*1024).equals(source.bytes)))fail();};
 try{
  verify();const result=await execute([...args.filter(arg=>arg.startsWith('/')&&!arg.startsWith('/out:')),'/out:'+candidate,...projected]);verify();
  const entries=readdirSync(temporary).sort(),expected=['native.exe',...projected.map(path=>basename(path))].sort(),s=lstatSync(assertOrdinaryPath(candidate),{bigint:true});
  if(!same(entries,expected)||!s.isFile()||s.nlink!==1n||s.size<1n||s.size>16n*1024n*1024n)fail();
  const outputDigest=digest(bytesAt(candidate,16*1024*1024));copyFileSync(candidate,output,constants.COPYFILE_EXCL);verify();if(digest(bytesAt(output,16*1024*1024)).value!==outputDigest.value)fail();
  save('completed',{format:prepared.format,prepared_digest:digest(JSON.stringify(prepared)),output,output_digest:outputDigest});
  if(dirname(temporary)!==temporaryParent||!basename(temporary).startsWith('cimiloop-compile-')||!same(physical(temporary),identity)||!same(readdirSync(temporary).sort(),expected))fail();
  // Only this invocation's physically bound directory is removed. Original
  // source/output/projection receipts remain under the original build identity.
  rmSync(temporary,{recursive:true});save('disposed',{format:prepared.format,prepared_digest:digest(JSON.stringify(prepared)),temporary,temporary_identity:identity,resources_disposed:true});return result;
 }catch(error){try{save('failed',{format:prepared.format,prepared_digest:digest(JSON.stringify(prepared)),resources_disposed:false});}catch{}throw error;}
}
