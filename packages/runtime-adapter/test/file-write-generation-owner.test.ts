import {mkdtempSync,writeFileSync,existsSync,readdirSync,readFileSync,renameSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,sep} from 'node:path';
import {describe,it,expect,vi} from 'vitest';
import {readFileWriteGenerations} from '../src/file-write-generation.js';
import {withRuntimeBinaryProofTurn,digestRuntimeBinaryFile,snapshotRuntimeBinaryProofIdentities,withRetainedBinaryRecheck} from '../src/runtime-binary-originals.js';

// Actual Windows compiler/NTFS query. A generation is optional and is never
// model, billing, quota or S1 evidence. All new roots are retained.
describe.runIf(process.platform==='win32')('write generation helper has an explicit owner',()=>{
 it('does not build or query a global helper without an owned root',()=>{
  const root=mkdtempSync(join(tmpdir(),'usn-unowned-')),file=join(root,'PUBLIC.exe');writeFileSync(file,Buffer.alloc(1024*1024,7));
  expect(readFileWriteGenerations([file])).toBeUndefined();expect(readdirSync(root)).toEqual(['PUBLIC.exe']);
 });
 it('never recreates a missing owner root',()=>{
  const root=mkdtempSync(join(tmpdir(),'usn-missing-')),file=join(root,'PUBLIC.exe'),missing=join(root,'lost-owner');writeFileSync(file,Buffer.alloc(1024*1024,7));
  expect(readFileWriteGenerations([file],missing)).toBeUndefined();expect(existsSync(missing)).toBe(false);
 });
 it('compiles and queries only under the selected owner and preserves missing original helpers',()=>{
  const root=mkdtempSync(join(tmpdir(),'usn-owned-')),file=join(root,'PUBLIC.exe');writeFileSync(file,Buffer.alloc(1024*1024,7));
  const result=readFileWriteGenerations([file],root);expect(result).toBeInstanceOf(Map);
  const entries=readdirSync(root,{recursive:true}).map(String),binary=entries.find(path=>path.endsWith('FileWriteGeneration.exe'));expect(binary).toBeDefined();
  const invocation=entries.find(path=>path.startsWith('compiler-operations'+sep)&&path.endsWith('request.json'));expect(invocation).toBeDefined();
  const request=JSON.parse(readFileSync(join(root,invocation!),'utf8'));for(const path of Object.values(request.environment.environment))expect(String(path).toLowerCase().startsWith((root+sep).toLowerCase())).toBe(true);
  const path=join(root,binary!);renameSync(path,path+'.retained');expect(readFileWriteGenerations([file],root)).toBeUndefined();expect(existsSync(path)).toBe(false);expect(existsSync(path+'.retained')).toBe(true);
 },60000);
 it('reopens its exact original read-only and refuses a lost bound directory across a module restart',async()=>{
  const root=mkdtempSync(join(tmpdir(),'usn-reopen-')),file=join(root,'PUBLIC.exe');writeFileSync(file,Buffer.alloc(1024*1024,7));
  expect(readFileWriteGenerations([file],root)).toBeInstanceOf(Map);const entries=readdirSync(root,{recursive:true}).map(String).sort();
  vi.resetModules();const reopened=await import('../src/file-write-generation.js');expect(reopened.readFileWriteGenerations([file],root)).toBeInstanceOf(Map);expect(readdirSync(root,{recursive:true}).map(String).sort()).toEqual(entries);
  const environment=entries.find(path=>path.endsWith(join('host-environment','temp')))!;expect(environment).toBeDefined();const path=join(root,environment);renameSync(path,path+'.retained');
  vi.resetModules();const missing=await import('../src/file-write-generation.js');expect(missing.readFileWriteGenerations([file],root)).toBeUndefined();expect(existsSync(path)).toBe(false);
 },60000);
 it('keeps sealed-byte rechecks effective when the owned helper is unavailable',()=>{
  const root=mkdtempSync(join(tmpdir(),'usn-proof-')),file=join(root,'PUBLIC.exe');writeFileSync(file,Buffer.alloc(1024*1024,7));
  const hits=withRuntimeBinaryProofTurn(()=>{digestRuntimeBinaryFile(file);return snapshotRuntimeBinaryProofIdentities(root);});
  expect(withRetainedBinaryRecheck(hits,()=>digestRuntimeBinaryFile(file),root)).toBe(hits[0]!.bytes_sha);
  const binary=readdirSync(root,{recursive:true}).map(String).find(path=>path.endsWith('FileWriteGeneration.exe'))!;expect(binary).toBeDefined();renameSync(join(root,binary),join(root,binary+'.retained'));
  const body=readFileSync(file);body[0]=8;writeFileSync(file,body);
  expect(()=>withRetainedBinaryRecheck(hits,()=>digestRuntimeBinaryFile(file),root)).toThrow('runtime_binary_original_unproven');
 },60000);
 it('refuses a same-byte replacement of the original helper',()=>{
  const root=mkdtempSync(join(tmpdir(),'usn-physical-')),file=join(root,'PUBLIC.exe');writeFileSync(file,Buffer.alloc(1024*1024,7));expect(readFileWriteGenerations([file],root)).toBeInstanceOf(Map);
  const binary=readdirSync(root,{recursive:true}).map(String).find(path=>path.endsWith('FileWriteGeneration.exe'))!,path=join(root,binary);renameSync(path,path+'.retained');copyFileSync(path+'.retained',path);
  expect(readFileSync(path)).toEqual(readFileSync(path+'.retained'));expect(readFileWriteGenerations([file],root)).toBeUndefined();
 },60000);
});
