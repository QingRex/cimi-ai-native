import {readDatabaseFormat} from '../../store-sqlite/src/database-format.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as localApp from '../src/index.js';
import { CimiLoopKernel } from '../../kernel/src/index.js';
import { contentDigest } from '../../kernel/src/intent.js';
import { AgentStartLedger } from '@cimiloop/runtime-adapter';
import { createSkillInvocationProject } from '../../../tests/fixtures/skill-invocation-project.js';
import { flowSuccess, flowTime } from '../../../tests/fixtures/flow-project.js';
// Constructed method/qualification/runtime only; actual Kernel and SQLite.
// No Native/SDK/model/bill or real named Skill qualification is established.
describe('original child Skill execution', () => {
 let root: string, f: ReturnType<typeof createSkillInvocationProject>, invocation: ReturnType<ReturnType<typeof createSkillInvocationProject>['reserveSkill']>['invocation'];
 let ledger: AgentStartLedger, local: any, request: any, port: any, inputs: any;
 const qualify = vi.fn(), prepare = vi.fn(), launch = vi.fn(), dispose = vi.fn();
 beforeEach(() => {
  vi.resetAllMocks(); root = mkdtempSync(join(tmpdir(), 'cimiloop-child-execution-')); f = createSkillInvocationProject(root);
  ledger = AgentStartLedger.initialize(join(dirname(f.path), 'child-host'), { machine_digest: contentDigest('constructed child machine').value, principal_digest: contentDigest('constructed child principal').value });
  const custody=new localApp.LocalSkillInvocationStartCustody(root,dirname(f.path),ledger),originalPrepare=f.runPort.agent.skills!.prepare.bind(f.runPort.agent.skills);
  f.runPort.agent.skills!.prepare=(project,record,context,binding,input)=>custody.bindPreparation(project,record,context,binding,input,originalPrepare(project,record,context,binding,input));
  invocation=f.reserveSkill().invocation;
  const record = f.store.getRuntimeRecord('run_record', invocation.run_ref.id === f.currentRun().id ? f.currentRun().record_ref.id : '')!;
  if (record.run_kind !== 'agent') throw Error('Agent required');
  const parent = { project_id: f.project.id, run_id: f.currentRun().id, operation_key: record.operation_key, executor_actor_id: f.agent.id,
   context_digest: record.input_digest, runtime_binding: record.runtime_binding, skill_bindings: record.skill_bindings, host_admission_ref: record.host_admission_ref };
  request = { parent, invocation_ref: { object_type: 'skill_invocation', id: invocation.id }, input_digest: invocation.input_digest };
  qualify.mockImplementation((_project, input) => contentDigest({ constructed: true, input }));
  (f.runPort.agent.skills as any).checkExecutionAuthority = qualify;
  local = { store: f.store, caller: f.caller, kernel: new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, runVerifier: f.runPort }),
   location: { repositoryKind: 'git', repositoryPath: root, dataDirectory: dirname(f.path), databasePath: f.path, instancePath: join(dirname(f.path), 'instance.json'), suggestedName: 'Child fixture' } };

  inputs = { readInvocation: vi.fn(() => ({ request: invocation.request, package_ref: invocation.package_ref, input_schema_ref: invocation.input_schema_ref,
   output_schema_ref: invocation.output_schema_ref, input_ref: invocation.input_ref, harness_requirements: [], files: [], profile: { constructed: true } })) };
  prepare.mockImplementation(async () => ({ launch, dispose })); port = { ledger, custody, inputs, prepare };
 }, 120000);
 afterEach(() => { ledger?.close(); f?.store.close(); if (root) { if (dirname(root) !== tmpdir() || !basename(root).startsWith('cimiloop-child-execution-')) throw Error('Unsafe cleanup'); rmSync(root, { recursive: true, force: true }); } });
 const assess = () => typeof local.kernel.assessSkillInvocationExecution === 'function' ? local.kernel.assessSkillInvocationExecution(request) : { decision: 'NOT_IMPLEMENTED' };
 const service = (context=local, options=port) => new (localApp as any).LocalSkillInvocationExecution(context, options);
 it('grants the exact child while parent launch/model remain denied and assessment is read only', () => {
  const sequence = f.store.asOfEventSequence(); expect(assess()).toMatchObject({ decision: 'ALLOW', authority: { invocation_id: invocation.id, invocation_key: invocation.invocation_key } });
  expect(local.kernel.assessAgentRunLaunch(request.parent)).toMatchObject({ decision: 'DENY', reasons: expect.arrayContaining(['SKILL_TOOL_CONTEXT_UNAVAILABLE']) });
  expect(local.kernel.assessAgentRunModel(request.parent)).toMatchObject({ decision: 'DENY', reasons: expect.arrayContaining(['SKILL_TOOL_CONTEXT_UNAVAILABLE']) });
  expect(qualify).toHaveBeenCalledTimes(1); expect(f.store.asOfEventSequence()).toBe(sequence); expect(readDatabaseFormat(f.path)).toBe(10);
 });
 it('does not replace required live method/Native/model/account proof with reservation admission', () => {
  delete (f.runPort.agent.skills as any).checkExecutionAuthority; expect(assess()).toMatchObject({ decision: 'DENY', reasons: ['SKILL_EXECUTION_HOST_UNAVAILABLE'] });
  (f.runPort.agent.skills as any).checkExecutionAuthority = () => { throw Error('private credential detail'); };
  expect(JSON.stringify(assess())).not.toContain('private credential'); expect(assess()).toMatchObject({ decision: 'DENY', reasons: ['SKILL_EXECUTION_HOST_PROOF_UNPROVEN'] });
 });
 it('rejects substituted child digest and extra serialized admission fields before host verification', () => {
  request.input_digest = contentDigest('different input'); expect(assess()).toMatchObject({ decision: 'DENY' }); expect(qualify).not.toHaveBeenCalled();
  request.input_digest = invocation.input_digest; request.approved = true; expect(assess()).toMatchObject({ code: 'PROTOCOL_VALIDATION_FAILED' }); expect(qualify).not.toHaveBeenCalled();
 });
 it('denies effects after parent cancellation', () => {
  flowSuccess(f.humanKernel.execute(f.humanCommand('CancelRun', 'run', f.currentRun().id, { reason: 'controlled cancellation' }, 'technical_owner')));
  expect(assess()).toMatchObject({ decision: 'DENY', reasons: expect.arrayContaining(['RUN_NOT_ACTIVE']) }); expect(qualify).not.toHaveBeenCalled();
 });
 it('denies a settled original child without opening the broad parent gate', () => {
  flowSuccess(f.observeSkill(invocation,'succeeded')); expect(assess()).toMatchObject({ decision:'DENY', reasons:expect.arrayContaining(['SKILL_INVOCATION_NOT_ACTIVE']) }); expect(qualify).not.toHaveBeenCalled();
 });
 it('refuses an asynchronous or malformed host proof without granting child effects', () => {
  qualify.mockReturnValueOnce(Promise.resolve(contentDigest('not synchronous original proof'))); expect(assess()).toMatchObject({decision:'DENY',reasons:['SKILL_EXECUTION_HOST_PROOF_UNPROVEN']});
  qualify.mockReturnValueOnce(Promise.reject(Error('private asynchronous host detail'))); expect(assess()).toMatchObject({decision:'DENY',reasons:['SKILL_EXECUTION_HOST_PROOF_UNPROVEN']});
  qualify.mockReturnValueOnce({ algorithm:'sha256', value:'not a hash' }); expect(assess()).toMatchObject({decision:'DENY',reasons:['SKILL_EXECUTION_HOST_PROOF_UNPROVEN']});
 });
 it('does not execute with absent factory or an impersonated Human', async () => {
  await expect(service(local, null).start(invocation.id)).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' });
  await expect(service({ ...local, caller: { kind: 'human', project_id: f.project.id, actor_id: f.actor.id } }).start(invocation.id)).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' });
  expect(prepare).not.toHaveBeenCalled(); expect(launch).not.toHaveBeenCalled();
 });
 it('dispatches once across concurrent service instances and replays after reopening the protected host ledger', async () => {
  const sequence = f.store.asOfEventSequence(), results = await Promise.all([service().start(invocation.id), service().start(invocation.id)]);
  expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ invocation_id: invocation.id, outcome: 'original', completion_proven: false })]));
  expect(launch).toHaveBeenCalledTimes(1); expect(dispose).toHaveBeenCalledTimes(prepare.mock.calls.length);
  const launched = prepare.mock.calls[0]![0]; expect(launched.invocation).toEqual(invocation); expect(launched.request.parent).toEqual(request.parent);
  const reopened = AgentStartLedger.open(join(dirname(f.path), 'child-host'), { machine_digest: contentDigest('constructed child machine').value, principal_digest: contentDigest('constructed child principal').value });
  try { const repeated = await service(local, { ...port, ledger: reopened, custody:new localApp.LocalSkillInvocationStartCustody(root,dirname(f.path),reopened), prepare: () => { throw Error('must not reopen runtime'); } }).start(invocation.id); expect(repeated.outcome).toBe('original'); } finally { reopened.close(); }
  expect(launch).toHaveBeenCalledTimes(1); expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.store.listRuns(f.change.id)).toHaveLength(1);
 });
 it('retains Unknown after dispatch response loss and never calls the factory again on retry', async () => {
  launch.mockRejectedValueOnce(Error('private account connection text')); const first = await service().start(invocation.id);
  expect(first).toMatchObject({ outcome: 'unknown', completion_proven: false }); expect(JSON.stringify(first)).not.toContain('private account');
  const repeated = await service().start(invocation.id); expect(repeated).toMatchObject({ outcome: 'unknown', completion_proven: false }); expect(prepare).toHaveBeenCalledTimes(1); expect(launch).toHaveBeenCalledTimes(1); expect(dispose).toHaveBeenCalledTimes(1);
 });
 it('rechecks Kernel after delayed preparation and disposes without dispatch after revocation', async () => {
  prepare.mockImplementationOnce(async () => { flowSuccess(f.humanKernel.execute(f.humanCommand('CancelRun', 'run', f.currentRun().id, { reason: 'controlled cancellation' }, 'technical_owner'))); return { launch, dispose }; });
  await expect(service().start(invocation.id)).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' }); expect(launch).not.toHaveBeenCalled(); expect(dispose).toHaveBeenCalledTimes(1);
  expect(ledger.listExclusive('skill_invocation_dispatch')).toHaveLength(0);
 });
 it('passes a live child effect guard into the prepared Runtime and refuses broadened parent effects', async () => {
  let guard: any; prepare.mockImplementationOnce(async (_input, current) => { guard = current; return { launch: async () => {
   flowSuccess(f.humanKernel.execute(f.humanCommand('CancelRun', 'run', f.currentRun().id, { reason: 'controlled cancellation' }, 'technical_owner'))); await guard(); launch();
  }, dispose }; });
  expect(await service().start(invocation.id)).toMatchObject({ outcome: 'unknown' }); expect(typeof guard).toBe('function'); expect(launch).not.toHaveBeenCalled(); expect(dispose).toHaveBeenCalledTimes(1);
 });
 it('cannot redispatch an original by selecting a new host root while the old original remains intact', async () => {
  await service().start(invocation.id);const alternate=AgentStartLedger.initialize(join(dirname(f.path),'alternate-host'),{machine_digest:contentDigest('constructed child machine').value,principal_digest:contentDigest('constructed child principal').value});
  try { const C=(localApp as any).LocalSkillInvocationStartCustody;
   const alternatePort={...port,ledger:alternate,...(C?{custody:new C(root,dirname(f.path),alternate)}:{})};
   await expect(service(local,alternatePort).start(invocation.id)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(launch).toHaveBeenCalledTimes(1);
  } finally {alternate.close();}
 });
 it('keeps Unknown if dispatch and returned rows disappear while the independent original anchor remains', async () => {
  await service().start(invocation.id);const db=new DatabaseSync(join(dirname(f.path),'child-host','starts.sqlite'));
  try {db.exec('DROP TRIGGER tickets_delete');db.exec("DELETE FROM tickets WHERE json_extract(body,'$.namespace') IN ('skill_invocation_dispatch','skill_invocation_returned')");db.exec("CREATE TRIGGER tickets_delete BEFORE DELETE ON tickets BEGIN SELECT RAISE(ABORT, 'immutable start record'); END");} finally {db.close();}
  expect(await service().start(invocation.id)).toMatchObject({outcome:'unknown',completion_proven:false});expect(launch).toHaveBeenCalledTimes(1);expect(prepare).toHaveBeenCalledTimes(1);
 });
 it('keeps the dispatch Unknown after loss of only the independent marker and refuses a missing original birth ticket', async () => {
  await service().start(invocation.id);const marker=join(dirname(f.path),'skill-invocation-start-originals',f.project.id,invocation.invocation_key,'dispatch.json');renameSync(marker,marker+'.retained');
  expect(service().query(invocation.id)).toMatchObject({outcome:'unknown'});expect(await service().start(invocation.id)).toMatchObject({outcome:'unknown'});expect(launch).toHaveBeenCalledTimes(1);
  const db=new DatabaseSync(join(dirname(f.path),'child-host','starts.sqlite'));try {db.exec('DROP TRIGGER tickets_delete');db.exec("DELETE FROM tickets WHERE json_extract(body,'$.namespace')='skill_invocation_admission'");db.exec("CREATE TRIGGER tickets_delete BEFORE DELETE ON tickets BEGIN SELECT RAISE(ABORT, 'immutable start record'); END");} finally {db.close();}
  await expect(service().start(invocation.id)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(launch).toHaveBeenCalledTimes(1);
 });
 it('preserves an anchor-only interruption without repairing or dispatching on retry', async () => {
  vi.spyOn(ledger,'claimExclusiveOnce').mockImplementationOnce(()=>{throw Error('private writer interruption');});
  await expect(service().start(invocation.id)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(launch).not.toHaveBeenCalled();expect(dispose).toHaveBeenCalledTimes(1);
  expect(await service().start(invocation.id)).toMatchObject({outcome:'unknown',completion_proven:false});expect(prepare).toHaveBeenCalledTimes(1);expect(launch).not.toHaveBeenCalled();expect(ledger.listExclusive('skill_invocation_dispatch')).toHaveLength(0);
 });
 it('replays and queries an original from custody alone without a Runtime factory', async () => {
  await service().start(invocation.id);const readOnly={custody:port.custody};expect(service(local,readOnly).query(invocation.id)).toMatchObject({outcome:'original'});
  expect(await service(local,readOnly).start(invocation.id)).toMatchObject({outcome:'original'});expect(prepare).toHaveBeenCalledTimes(1);expect(launch).toHaveBeenCalledTimes(1);
 });
 it('does not stage or claim on method input drift and hides installer exceptions', async () => {
  inputs.readInvocation.mockImplementationOnce(() => { throw Error('secret method source path'); });
  await expect(service().start(invocation.id)).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' }); expect(prepare).not.toHaveBeenCalled(); expect(ledger.listExclusive('skill_invocation_dispatch')).toHaveLength(0);
  prepare.mockRejectedValueOnce(Error('secret account path')); await expect(service().start(invocation.id)).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' }); expect(ledger.listExclusive('skill_invocation_dispatch')).toHaveLength(0);
 });
});
