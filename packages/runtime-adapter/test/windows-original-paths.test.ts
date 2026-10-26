import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,renameSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe,it,expect} from 'vitest';
import {pinBinary,compileOriginalAgentSandbox,buildWindowsLauncher,buildWindowsAgentWorkspaceTransport,assertAgentRuntimeNativeRoot} from '../src/native.js';
import {digest} from '../src/files.js';
import {spawnSync} from 'node:child_process';
import {readRuntimeBinaryOriginal} from '../src/runtime-binary-originals.js';
import {retainAgentSandboxBuild} from '../src/agent-sandbox-build-originals.js';

// Actual Windows files/SQLite, constructed executable/compile output only.
// These current owned originals remain retained; no old Unknown is repaired.
describe.runIf(process.platform==='win32')('Windows long original database paths',()=>{
 const fixture=()=>{const parent=resolve('.cimiloop/new-host-s1/d270-path-fixtures');mkdirSync(parent,{recursive:true});const outer=mkdtempSync(join(parent,'original-')),root=join(outer,...Array.from({length:4},(_,i)=>'public_'+i+'_'+'x'.repeat(32)));mkdirSync(root,{recursive:true});const source=join(outer,'PUBLIC-constructed.exe');writeFileSync(source,'Constructed public executable');return {outer,root,source};};
 it('retains and independently reads the same physical binary beyond ordinary SQLite path limits',()=>{
  const f=fixture(),first=pinBinary(f.root,f.source);expect(first.path.length).toBeGreaterThan(260);
  const proof=readRuntimeBinaryOriginal(f.root,first.path,first.digest.value);expect(pinBinary(f.root,f.source)).toEqual(first);expect(readRuntimeBinaryOriginal(f.root,first.path,first.digest.value)).toEqual(proof);
  const marker=JSON.parse(readFileSync(join(f.root,'runtime-binary-original-registry.json'),'utf8'));expect(marker.root).toBe(f.root);expect(marker.root.startsWith('\\\\?\\')).toBe(false);
  renameSync(first.path,first.path+'.PUBLIC-retained');expect(()=>pinBinary(f.root,f.source)).toThrow();
 });
 it('elects one original build at a long root and refuses reconstruction after its receipt is lost',async()=>{
  const f=fixture(),recipe={constructed:'long Windows retained build'},compile=async()=>f.source,first=await retainAgentSandboxBuild(f.root,recipe,compile);
  expect(await retainAgentSandboxBuild(f.root,recipe,async()=>{throw Error('Must not compile again');})).toEqual(first);
  const proof=readRuntimeBinaryOriginal(f.root,first.path,first.digest.value);expect(proof.path).toBe(first.path);
  const registry=join(f.root,'agent-sandbox-build-registry.json');renameSync(registry,registry+'.PUBLIC-retained');await expect(retainAgentSandboxBuild(f.root,recipe,compile)).rejects.toThrow();
 });
 it('compiles frozen public CSharp at a long original destination without shortening the stored identity',async()=>{
  const f=fixture(),source=join(f.root,'PublicMain.cs'),output=join(f.root,'PUBLIC-compiled.exe');writeFileSync(source,'class PublicMain { public static void Main() {} }');
  await compileOriginalAgentSandbox(join(process.env.SystemRoot!,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/out:'+output,source],undefined,f.outer);
  expect(readFileSync(output).subarray(0,2).toString()).toBe('MZ');
 });
 it('refuses an unsupported CLR executable root before creating a controller or replacing its identity',async()=>{
  const f=fixture();expect(()=>assertAgentRuntimeNativeRoot(f.root)).toThrow('native_executable_path_unsupported');
  await expect(buildWindowsLauncher(f.root)).rejects.toThrow('native_executable_path_unsupported');
 });
 it('loads the independently retained IPC helper within the CLR executable-and-config filename budget',async()=>{
  const f=fixture(),root=join(f.outer,'p'.repeat(134-f.outer.length-1));mkdirSync(root);
  const binary=await buildWindowsAgentWorkspaceTransport(root),result=spawnSync(binary.path,[],{input:'{}\n',windowsHide:true,encoding:'utf8',timeout:5000});
  expect(result.status).toBe(12);expect(JSON.parse(result.stdout)).toMatchObject({phase:'failed',reason:'agent_ipc_native_unavailable'});
  expect(await buildWindowsAgentWorkspaceTransport(root)).toEqual(binary);
  renameSync(binary.path,binary.path+'.PUBLIC-retained');await expect(buildWindowsAgentWorkspaceTransport(root)).rejects.toThrow('agent_ipc_build_original_unproven');
 });
 it('preserves a partial legacy IPC build instead of producing a replacement version2 build',async()=>{
  const f=fixture(),source=fileURLToPath(new URL('../native/AgentWorkspaceTransport.cs',import.meta.url)),root=f.outer;
  mkdirSync(join(root,'tools','agent-workspace-ipc-'+digest(readFileSync(source)).value),{recursive:true});
  await expect(buildWindowsAgentWorkspaceTransport(root)).rejects.toThrow('agent_ipc_build_original_unproven');
 });
});
