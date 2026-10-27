import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {sourcePlan,prepareSource} from './prepare-source.mjs';
import {preparePipeModuleSource,verifyPipeModuleSource} from './prepare-pipe-modules.mjs';

// Fixed upstream source + authenticated dependency archives only. These checks
// do not compile or qualify the actual client, account, TLS or S1 behavior.
const root=process.env.CIMILOOP_PINNED_CODEX_SOURCE;
const archives={'0.12.28':process.env.CIMILOOP_REQWEST_012_ARCHIVE,'0.13.4':process.env.CIMILOOP_REQWEST_013_ARCHIVE};
const options={privatePipe:true,reqwestArchives:archives};
const enabled=!!root&&Object.values(archives).every(Boolean);

test('keeps the historical canonicalization-only source version and exact verifier', {skip:!enabled},()=>{
 const plan=sourcePlan(root);assert.equal(plan.version,'0.162.0+cimiloop-lowbox.1');assert.equal(plan.files.size,6);
 assert.equal(prepareSource(root,{verify:true}).version,plan.version);
});
test('builds a distinct pipe client plan covering both HTTP dependency versions and WebSockets', {skip:!enabled},()=>{
 const plan=sourcePlan(root,options);assert.equal(plan.version,'0.162.0+cimiloop-lowbox.2');
 for(const version of ['0.12.28','0.13.4']){
  const base='codex-rs/vendor/cimiloop-reqwest-'+version+'/';
  assert.ok(plan.files.has(base+'src/cimi_pipe.rs'));
  assert.match(plan.files.get(base+'src/async_impl/client.rs'),/cimi_pipe::configuration/);
  assert.match(plan.files.get(base+'src/connect.rs'),/cimi_pipe::open/);
 }
 assert.match(plan.files.get('codex-rs/websocket-client/src/dialer.rs'),/cimi_pipe::configuration/);
 assert.match(plan.files.get('codex-rs/websocket-client/src/dialer.rs'),/ConnectionInner::Right/);
 const lock=plan.files.get('codex-rs/Cargo.lock');
 for(const block of lock.split('[[package]]').filter(text=>/^\s*name = "reqwest"\s*$/m.test(text)))assert.doesNotMatch(block,/^source = |^checksum = /m);
 assert.equal(plan.files.get('codex-rs/Cargo.toml').match(/package = "reqwest"/g)?.length,2);
 assert.throws(()=>prepareSource(root,{...options,verify:true}),/differs|Unexpected|ENOENT|missing/i);
});
test('rejects dependency bytes that differ from the pinned upstream Cargo lock before changing source', {skip:!enabled},()=>{
 const directory=mkdtempSync(join(tmpdir(),'cimi-pipe-archive-')),path=join(directory,'changed.crate'),bytes=Buffer.from(readFileSync(archives['0.12.28']));bytes[bytes.length-1]^=1;writeFileSync(path,bytes,{flag:'wx'});
 assert.throws(()=>sourcePlan(root,{...options,reqwestArchives:{...archives,'0.12.28':path}}),/archive|checksum|digest/i);
 assert.equal(prepareSource(root,{verify:true}).version,'0.162.0+cimiloop-lowbox.1');
});

test('checks exact module compilation materials and refuses registry dependency drift', {skip:!enabled},()=>{
 const directory=mkdtempSync(join(tmpdir(),'cimi-pipe-modules-')),output=join(directory,'source');
 const basis=preparePipeModuleSource(root,output,options);
 assert.equal(verifyPipeModuleSource(basis).codex_client_build_proven,false);
 const lock=join(output,'Cargo.lock'),original=readFileSync(lock,'utf8');
 writeFileSync(lock,original+'\n[[package]]\nname = "unapproved-dependency"\nversion = "1.0.0"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "'+'a'.repeat(64)+'"\n');
 assert.throws(()=>verifyPipeModuleSource(basis),/pinned upstream dependency/);
 writeFileSync(lock,original);
 writeFileSync(join(output,'websocket-client/src/cimi_pipe.rs'),'// replaced\n');
 assert.throws(()=>verifyPipeModuleSource(basis),/source changed/);
});
