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
