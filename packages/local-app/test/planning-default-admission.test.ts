import { mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CimiLoopKernel } from '@cimiloop/kernel';
import { createIntentProject, planBody } from '../../../tests/fixtures/intent-project.js';
import { flowSuccess, flowTime } from '../../../tests/fixtures/flow-project.js';
import { openLocalProject, executeLocalCommand, writeInstance, LocalPrePlanClarification } from '../src/index.js';
import { createInternalId } from '@cimiloop/protocol/v2';

// Real Kernel/SQLite, explicitly historical manual fixtures. No Matt method,
// model, Native or S1 qualification is supplied by these fixture records.
describe('default Kernel requires original Human and Matt planning admission', () => {
  let f: ReturnType<typeof createIntentProject>;
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cimiloop-default-plan-')); f = createIntentProject(root, { databasePath: join(root, '.cimiloop', 'project.db') });
    writeInstance(join(root, '.cimiloop', 'instance.json'), { schema_version: '1.0.0', instance_id: f.project.instance_id, project_id: f.project.id, actor_id: f.actor.id, created_at: f.project.created_at });
  });
  afterEach(() => f.store.close());
  function base() {
    const change = f.create(); f.prepareContract(change.id);
    const current = f.store.getChange(change.id)!;
    return { change: current, body: planBody(change.id, current.contract_ref!) };
  }
  function defaultKernel() { return new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime }); }
  it('refuses an otherwise valid new Plan proposal without an installed original verifier', () => {
    const x = base(), command = f.changeCommand('SubmitPlanProposal', x.change, { base_version_ref: null, body: x.body }, 'technical_owner');
    const before = f.store.asOfEventSequence(), kernel = defaultKernel(), result = kernel.execute(command);
    expect(result).toHaveProperty('code', 'CAPABILITY_UNAVAILABLE');
    // Rejections have fresh diagnostic records; only successful commands own
    // an immutable Kernel receipt. A repeated denial still creates no effect.
    expect(kernel.execute(command)).toHaveProperty('code', 'CAPABILITY_UNAVAILABLE');
    expect(f.store.listIntentRecords('plan_proposal', x.change.id)).toHaveLength(0);
    expect(f.store.listExecutionObjects('task', x.change.id)).toHaveLength(0);
    expect(f.store.asOfEventSequence()).toBe(before);
  });
  it('refuses confirmation of a historical manual proposal without current original admission', () => {
    const x = base(), proposal = f.submitPlan(x.change.id, x.body), request = f.request(x.change.id, proposal, 'plan'), decision = f.decide(x.change.id, request);
    const before = f.store.asOfEventSequence();
    expect(defaultKernel().execute(f.changeCommand('ConfirmPlan', f.store.getChange(x.change.id)!, f.confirmPayload(request, decision), 'technical_owner'))).toHaveProperty('code', 'CAPABILITY_UNAVAILABLE');
    expect(f.store.listIntentRecords('plan_version', x.change.id)).toHaveLength(0);
    expect(f.store.asOfEventSequence()).toBe(before);
  });
  it('refuses new Tasks for a historical manual Plan without original admission', () => {
    const x = base(); f.preparePlan(x.change.id, x.body);
    const current = f.store.getChange(x.change.id)!, before = f.store.asOfEventSequence();
    expect(defaultKernel().execute(f.changeCommand('InitializePlanTasks', current, { plan_ref: current.plan_ref! }, 'technical_owner'))).toHaveProperty('code', 'CAPABILITY_UNAVAILABLE');
    expect(f.store.listExecutionObjects('task', x.change.id)).toHaveLength(0);
    expect(f.store.asOfEventSequence()).toBe(before);
  });
  it('replays the immutable old successful command without a new verifier or effect', () => {
    const x = base(), proposal = f.submitPlan(x.change.id, x.body), request = f.request(x.change.id, proposal, 'plan'), decision = f.decide(x.change.id, request);
    const command = f.changeCommand('ConfirmPlan', f.store.getChange(x.change.id)!, f.confirmPayload(request, decision), 'technical_owner');
    const original = flowSuccess(f.kernel.execute(command)), before = f.store.asOfEventSequence();
    expect(defaultKernel().execute(command)).toEqual(original);
    expect(f.store.listIntentRecords('plan_version', x.change.id)).toHaveLength(1);
    expect(f.store.asOfEventSequence()).toBe(before);
  });
  it('does not accept a serialized legacy-mode flag in a planning command', () => {
    const x = base();
    const command = f.changeCommand('SubmitPlanProposal', x.change, { base_version_ref: null, body: x.body }, 'technical_owner');
    expect(defaultKernel().execute({ ...command, legacyManualPlanning: true })).toHaveProperty('code', 'PROTOCOL_VALIDATION_FAILED');
    expect(f.store.listIntentRecords('plan_proposal', x.change.id)).toHaveLength(0);
  });
  it('installs original Human and Matt checks by default in the shared local application', () => {
    const x = base(), local = openLocalProject({ projectDir: root });
    try {
      const { schema_version, correlation_id, project_id, actor_id, source, ...command } = f.changeCommand('SubmitPlanProposal', x.change, { base_version_ref: null, body: x.body }, 'technical_owner');
      const before = f.store.asOfEventSequence();
      expect(executeLocalCommand(local, command)).toHaveProperty('code', 'EVIDENCE_MISSING');
      expect(f.store.listIntentRecords('plan_proposal', x.change.id)).toHaveLength(0);
      expect(f.store.asOfEventSequence()).toBe(before);
    } finally { local.store.close(); }
  });
  it('keeps explicitly configured historical manual embedding separate from original admission', () => {
    const x = base(), local = openLocalProject({ projectDir: root, legacyManualPlanning: true });
    try {
      const result = flowSuccess(local.kernel.execute(f.changeCommand('SubmitPlanProposal', x.change, { base_version_ref: null, body: x.body }, 'technical_owner')));
      expect(result.command_type).toBe('SubmitPlanProposal');
      expect(f.store.listIntentRecords('plan_proposal', x.change.id)).toHaveLength(1);
    } finally { local.store.close(); }
  });
  it('refuses ambiguous legacy embedding together with an original verifier', () => {
    expect(() => new CimiLoopKernel({ store: f.store, caller: f.caller, legacyManualPlanning: true, planningClarification: { verifyOriginal() {} } })).toThrow('legacy_manual_planning_with_original_verifier_denied');
    expect(() => openLocalProject({ projectDir: root, legacyManualPlanning: true, planningClarification: {} })).toThrow();
  });
  it('keeps the compiled CLI in required mode after actual Human answers and replays its original refusal', () => {
    const x = base(), local = openLocalProject({ projectDir: root });
    let sessionId: string;
    try {
      const service = new LocalPrePlanClarification(local), session = service.begin(x.change.id, { request_id: createInternalId(), target: 'plan', requirement: 'PUBLIC original requirement', background: 'Current confirmed contract', constraints: ['Same original command'] }).session;
      sessionId = session.id;
      const question = { request_id: createInternalId(), expected_head: 0, kind: 'question', text: 'What proves A1?' };
      service.advance(x.change.id, sessionId, question);
      service.advance(x.change.id, sessionId, { request_id: createInternalId(), expected_head: 1, kind: 'answer', question_id: question.request_id, text: 'Independent original evidence' });
    } finally { local.store.close(); }
    const file = join(root, 'PUBLIC-plan-candidate.json'), candidate = { request_id: createInternalId(), expected_head: 2, kind: 'plan_candidate', requested_at: new Date().toISOString(), body: x.body };
    writeFileSync(file, JSON.stringify(candidate));
    const args = ['apps/cli/dist/bin.js', '--json', '--project-dir', root, 'clarification', 'advance', x.change.id, sessionId!, '--file', file], before = f.store.asOfEventSequence();
    const first = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true });
    const second = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true });
    expect(first.status).toBe(1); expect(second.status).toBe(1);
    expect(JSON.parse(first.stdout).command_result.code).toBe('CAPABILITY_UNAVAILABLE');
    const replay=JSON.parse(second.stdout),original=JSON.parse(first.stdout);expect(replay.session).toEqual(original.session);expect(replay.command_result).toMatchObject({code:'CAPABILITY_UNAVAILABLE',correlation_id:original.command_result.correlation_id});
    expect(f.store.listIntentRecords('plan_proposal', x.change.id)).toHaveLength(0);
    expect(f.store.asOfEventSequence()).toBe(before);
  });
});
