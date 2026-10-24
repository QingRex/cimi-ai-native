import {describe,it,expect} from 'vitest';
import {SKILL_RESULT_CAPTURE_LIMITS,skillResultCaptureLimits,parseSkillResultCaptureBytes} from '../src/skill-invocation-result-local.js';
describe('complete original Skill capture capacity',()=>{
 it('adds exactly one retained Job original to new input capacity while keeping historical limits',()=>{
  expect(skillResultCaptureLimits(false)).toEqual(SKILL_RESULT_CAPTURE_LIMITS);const next=skillResultCaptureLimits(true);expect(next.artifacts).toBe(SKILL_RESULT_CAPTURE_LIMITS.artifacts+1);expect(next.total_bytes).toBe(SKILL_RESULT_CAPTURE_LIMITS.total_bytes+65536);expect(next.proof_bytes).toBe(SKILL_RESULT_CAPTURE_LIMITS.proof_bytes);
 });
 it('covers the reachable25step/24tool ledger and the entire upstream64step/128exchange contract',()=>{
  expect(SKILL_RESULT_CAPTURE_LIMITS.artifacts).toBeGreaterThanOrEqual(584);
  expect(SKILL_RESULT_CAPTURE_LIMITS.artifacts).toBeGreaterThanOrEqual(9+34+256+194+513+643);
  expect(SKILL_RESULT_CAPTURE_LIMITS.total_bytes).toBeGreaterThan(240*1024*1024);
 });
 it('reads complete maximum metadata above1MiB and refuses beyond the content store8MiB ceiling',()=>{
  const artifacts=Array.from({length:1649},(_,i)=>({name:String(i)+'n'.repeat(128),path:'D:/'+('x/'.repeat(250)),digest:'a'.repeat(64),reference:{provider:'local_content',resource_type:'provider_probe_artifact',locator:'a'.repeat(64),digest:{algorithm:'sha256',value:'a'.repeat(64)}}})),bytes=Buffer.from(JSON.stringify({artifacts}));
  expect(bytes.length).toBeGreaterThan(1024*1024);expect(parseSkillResultCaptureBytes(bytes)).toEqual({artifacts});
  expect(()=>parseSkillResultCaptureBytes(Buffer.from(JSON.stringify('x'.repeat(8*1024*1024))))).toThrow();
  expect(()=>parseSkillResultCaptureBytes(Buffer.from('{"status":"unknown","status":"succeeded"}'))).toThrow();
 });
});

it('adds original cancellation marker, proof and bounded incomplete metadata without changing historical success or Job capacity',()=>{
 const old=skillResultCaptureLimits(false);expect(old).toEqual(SKILL_RESULT_CAPTURE_LIMITS);const cancelled=skillResultCaptureLimits(false,true),withJob=skillResultCaptureLimits(true,true);expect(cancelled.artifacts).toBe(old.artifacts+3);expect(cancelled.total_bytes).toBe(old.total_bytes+3*65536);expect(withJob.artifacts).toBe(cancelled.artifacts+1);expect(withJob.total_bytes).toBe(cancelled.total_bytes+65536);expect(cancelled.proof_bytes).toBe(old.proof_bytes);
});

it('covers complete Codex transport originals without expanding the legacy Dedicated bounds',()=>{
 const old=skillResultCaptureLimits(false),codex=skillResultCaptureLimits(true,true,true);expect(old).toEqual(SKILL_RESULT_CAPTURE_LIMITS);expect(codex.artifacts).toBe(old.artifacts+4);expect(codex.total_bytes).toBeGreaterThanOrEqual(old.total_bytes+64*3*8*1024*1024);expect(codex.total_bytes).toBeLessThan(2*1024**3);expect(codex.proof_bytes).toBe(old.proof_bytes);
});
