import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId, type ToolAuthorityAssessment, type ToolAuthorityRequest } from "@cimiloop/protocol/v2";
import { digest } from "../src/files.js";
import { withRuntimeBinaryProofTurn } from "../src/runtime-binary-originals.js";
import { readWorkspaceFileRunOriginals } from "../src/workspace-tool-host.js";
import { parseWorkspaceToolInvocation, type WorkspaceNativePreparation } from "../src/workspace-files.js";
import { WorkspaceToolJournal, WORKSPACE_TOOL_SLOT_BYTES, workspaceToolAuthorityRequest, type WorkspaceToolPolicy } from "../src/workspace-tool-journal.js";

// Constructed authority/process seams exercise the durable journal only. Actual
// Kernel/Git/native-process effects are covered by workspace-tool-runtime.test.
describe("workspace journal original ownership and effect barriers", () => {
  const roots: string[] = [], journals: WorkspaceToolJournal[] = [];
  afterEach(() => { while (journals.length) journals.pop()!.close(); while (roots.length) { const root = roots.pop()!;
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-workspace-journal-")) throw Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true }); } });
  const owner = { pid: process.pid, creation_ticks: "1", image: process.execPath };
  function setup(entries = 8) {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-workspace-journal-")); roots.push(root);
    const input = parseWorkspaceToolInvocation({ format: "cimiloop/workspace-tool-invocation/1.0.0", project_id: createInternalId(), run_id: createInternalId(), operation_key: createInternalId(),
      executor_actor_id: createInternalId(), context_digest: digest("constructed original context"), call_id: "original", tool: "read_file", path: "src/ς.ts", expected_digest: digest("original\n").value });
    const policy: WorkspaceToolPolicy = { format: "cimiloop/workspace-tool-journal/1.0.0", scope: "authorized_workspace", project_id: input.project_id, repository_path_digest: digest(root).value,
      root_identity: { volume_serial: "12345678", file_index: "0000000000000001" }, scope_digest: digest("constructed workspace scope").value, maximum_entries: entries, maximum_bytes: entries * WORKSPACE_TOOL_SLOT_BYTES };
    const authority = { change_id: createInternalId(), task_id: createInternalId(), work_item_id: createInternalId(), run_record_id: createInternalId(), context_id: createInternalId(), basis_digest: digest("constructed authority") };
    const assess = (request: ToolAuthorityRequest): ToolAuthorityAssessment => ({ schema_version: "2.0.0", scope: "human_run_tool_assessment", request, assessed_at: "2026-10-07T00:00:00.000Z",
      as_of_event_sequence: 1, formal_agent_execution_enabled: false, decision: "ALLOW", reasons: [], authority });
    const proof = (value = input): WorkspaceNativePreparation => ({ format: "cimiloop/workspace-native/1.0.0", phase: "prepared", nonce: randomUUID(), input_digest: digest(JSON.stringify(value)).value,
      root_identity: { ...policy.root_identity }, file_identity: { volume_serial: "12345678", file_index: "0000000000000002" }, replacement_identity: null, before_digest: value.expected_digest, worker: { ...owner, creation_ticks: "2" } });
    const path = join(root, "tools.sqlite"), open = (observeOwner?: ConstructorParameters<typeof WorkspaceToolJournal>[2]["observeOwner"], reclaimStaging?: ConstructorParameters<typeof WorkspaceToolJournal>[2]["reclaimStaging"]) => {
      const journal = new WorkspaceToolJournal(path, policy, { identity: owner, ...(observeOwner ? { observeOwner } : {}), ...(reclaimStaging ? { reclaimStaging } : {}) }); journals.push(journal); return journal;
    };
    const claim = (journal: WorkspaceToolJournal, value = input) => { const result = journal.claim(value, assess(workspaceToolAuthorityRequest(value))); if (!result.permit) throw Error("Expected new permit"); return result.permit; };
    return { input, policy, assess, proof, path, open, claim };
  }
  it.each(["reserved", "executing"] as const)("keeps %s while either original owner is active or unproven", async state => {
    const f = setup(), first = f.open(), permit = f.claim(first); first.prepare(permit, f.proof()); if (state === "executing") first.dispatch(permit); first.close();
    for (const [host, native] of [["active", "absent"], ["absent", "active"], ["unknown", "absent"], ["absent", "unknown"]] as const) {
      const next = f.open(async identity => identity.creation_ticks === "1" ? host : native);
      expect((await next.reconcileOwners()).reconciled).toBe(0); expect(next.facts().states[state]).toBe(1); next.close();
    }
    const next = f.open(async () => "absent"); expect((await next.reconcileOwners()).reconciled).toBe(1);
    expect(next.facts()).toMatchObject(state === "reserved" ? { unresolved: 0, has_effect: false, states: { not_started: 1 } } : { unresolved: 1, has_effect: true, states: { unknown: 1 } });
  });
  it("uses native file identity across different runs and Unicode path aliases to retain Unknown", () => {
    const f = setup(), journal = f.open(), original = f.claim(journal); journal.prepare(original, f.proof()); journal.dispatch(original); journal.stop(original, true);
    // NTFS may compare aliases differently from JavaScript's toLowerCase. The
    // trusted native preparation pins the same volume/file ID regardless.
    const alias = parseWorkspaceToolInvocation({ ...f.input, run_id: createInternalId(), call_id: "alias", path: "src/σ.ts" }), next = f.claim(journal, alias);
    expect(() => journal.prepare(next, f.proof(alias))).toThrow("workspace_tool_file_in_flight"); journal.stop(next, false);
    expect(journal.facts()).toMatchObject({ unresolved: 1, states: { unknown: 1, not_started: 1 } });
  });
  it("cannot borrow a copied permit or reclaim a lost completion slot", () => {
    const f = setup(1), one = f.open(), two = f.open(), permit = f.claim(one);
    expect(() => one.dispatch({ ...permit })).toThrow("workspace_tool_permit_unowned"); expect(() => two.prepare(permit, f.proof())).toThrow("workspace_tool_permit_unowned");
    one.prepare(permit, f.proof()); one.dispatch(permit); one.stop(permit, true);
    expect(() => f.claim(two, { ...f.input, run_id: createInternalId(), call_id: "new", path: "src/other.ts" })).toThrow("workspace_tool_capacity_exhausted");
    expect(two.facts()).toMatchObject({ invocations: 1, unresolved: 1, states: { unknown: 1 } });
  });
  it("retains the pre-recorded replacement inode across a lost install receipt", () => {
    const f = setup(), journal = f.open(), input = parseWorkspaceToolInvocation({ ...f.input, tool: "replace_file", replacement_utf8: "replacement\n" }), permit = f.claim(journal, input);
    const replacement = { volume_serial: "12345678", file_index: "0000000000000003" }; journal.prepare(permit, { ...f.proof(input), replacement_identity: replacement }); journal.dispatch(permit); journal.stop(permit, true);
    const alias = parseWorkspaceToolInvocation({ ...f.input, run_id: createInternalId(), call_id: "installed_alias", path: "src/other.ts", expected_digest: digest("replacement\n").value }), next = f.claim(journal, alias);
    expect(() => journal.prepare(next, { ...f.proof(alias), file_identity: replacement })).toThrow("workspace_tool_file_in_flight"); journal.stop(next, false);
    expect(journal.facts().states.unknown).toBe(1);
  });
  it("reads original facts without authority but rejects foreign Run or project bindings", () => {
    const f = setup(), journal = f.open(), permit = f.claim(journal); journal.prepare(permit, f.proof()); journal.dispatch(permit); journal.stop(permit, true); journal.close();
    const record = { run_id: f.input.run_id, operation_key: f.input.operation_key, executor_ref: { id: f.input.executor_actor_id }, input_digest: f.input.context_digest }, policyDigest = digest(JSON.stringify(f.policy)).value;
    const read = (current = record, projectId = f.input.project_id, pathDigest = f.policy.repository_path_digest) => WorkspaceToolJournal.readRunFacts(f.path, projectId, pathDigest, current, policyDigest);
    expect(read()).toEqual({ invocations: 1, unresolved: 1, has_effect: true });
    expect(() => read({ ...record, operation_key: createInternalId() })).toThrow("workspace_tool_run_binding_mismatch");
    expect(() => read({ ...record, executor_ref: { id: createInternalId() } })).toThrow("workspace_tool_run_binding_mismatch");
    expect(() => read({ ...record, input_digest: digest("foreign") })).toThrow("workspace_tool_run_binding_mismatch");
    expect(() => read(record, createInternalId())).toThrow("workspace_tool_scope_mismatch"); expect(() => read(record, f.input.project_id, digest("foreign root").value)).toThrow("workspace_tool_scope_mismatch");
  });
  it("does not reuse file originals for the same ids and a different verified repository", () => {
    const repository = mkdtempSync(join(tmpdir(), "cimiloop-workspace-journal-")); roots.push(repository);
    const foreign = join(repository, "PUBLIC-foreign-repository"); mkdirSync(foreign);
    const data = mkdtempSync(join(tmpdir(), "cimiloop-workspace-journal-")); roots.push(data);
    const projectId = createInternalId(), tools = join(data, "workspace-tools"); mkdirSync(tools);
    const repositoryPathDigest = digest(realpathSync(repository).toLowerCase()).value;
    const policy: WorkspaceToolPolicy = { format: "cimiloop/workspace-tool-journal/1.0.0", scope: "authorized_workspace", project_id: projectId, repository_path_digest: repositoryPathDigest,
      root_identity: { volume_serial: "12345678", file_index: "0000000000000001" }, scope_digest: digest("PUBLIC file scope").value, maximum_entries: 8, maximum_bytes: 8 * WORKSPACE_TOOL_SLOT_BYTES };
    const runId = createInternalId(), operationKey = createInternalId(), actorId = createInternalId(), inputDigest = digest("PUBLIC file context");
    const input = parseWorkspaceToolInvocation({ format: "cimiloop/workspace-tool-invocation/1.0.0", project_id: projectId, run_id: runId, operation_key: operationKey, executor_actor_id: actorId, context_digest: inputDigest, call_id: "original", tool: "read_file", path: "src/public.ts", expected_digest: digest("original\n").value });
    const authority = { change_id: createInternalId(), task_id: createInternalId(), work_item_id: createInternalId(), run_record_id: createInternalId(), context_id: createInternalId(), basis_digest: digest("PUBLIC authority") };
    const assessed = (request: ToolAuthorityRequest): ToolAuthorityAssessment => ({ schema_version: "2.0.0", scope: "human_run_tool_assessment", request, assessed_at: "2026-10-07T00:00:00.000Z", as_of_event_sequence: 1, formal_agent_execution_enabled: false, decision: "ALLOW", reasons: [], authority });
    const proof: WorkspaceNativePreparation = { format: "cimiloop/workspace-native/1.0.0", phase: "prepared", nonce: randomUUID(), input_digest: digest(JSON.stringify(input)).value, root_identity: { ...policy.root_identity }, file_identity: { volume_serial: "12345678", file_index: "0000000000000002" }, replacement_identity: null, before_digest: input.expected_digest, worker: { ...owner, creation_ticks: "2" } };
    const journal = new WorkspaceToolJournal(join(tools, projectId + ".sqlite"), policy, { identity: owner }); journals.push(journal);
    const permit = journal.claim(input, assessed(workspaceToolAuthorityRequest(input))); if (!permit.permit) throw Error("Expected permit");
    journal.prepare(permit.permit, proof); journal.dispatch(permit.permit); journal.stop(permit.permit, true); journal.close();
    writeFileSync(join(tools, projectId + ".json"), JSON.stringify({ format: "cimiloop/workspace-tool-anchor/1.0.0", project_id: projectId, repository_path_digest: repositoryPathDigest, journal_policy_digest: digest(JSON.stringify(policy)).value }));
    const project = { id: projectId, repository_path: repository }, bad = { id: projectId, repository_path: foreign };
    const record = { run_id: runId, operation_key: operationKey, executor_ref: { object_type: "actor" as const, id: actorId }, input_digest: inputDigest };
    const read = (current = project, next = record) => readWorkspaceFileRunOriginals(data, current, next);
    expect(read().facts).toEqual({ invocations: 1, unresolved: 1, has_effect: true });
    expect(() => read(bad)).toThrow(/workspace_tool_anchor_unproven/);
    expect(() => withRuntimeBinaryProofTurn(() => { read(); return read(bad); })).toThrow(/workspace_tool_anchor_unproven/);
    const other = { ...record, executor_ref: { object_type: "actor" as const, id: createInternalId() } };
    expect(() => read(project, other)).toThrow(/workspace_tool_run_binding_mismatch/);
    expect(() => withRuntimeBinaryProofTurn(() => { read(); return read(project, other); })).toThrow(/workspace_tool_run_binding_mismatch/);
    const replay = withRuntimeBinaryProofTurn(() => { const first = read(); expect(read()).toEqual(first); return first; });
    expect(replay.facts.invocations).toBe(1);
  });
  it("independently reads the original input and Native receipt without issuing a permit", () => {
    const f = setup(), journal = f.open(), permit = f.claim(journal), proof = f.proof();
    journal.prepare(permit, proof); journal.dispatch(permit);
    const receipt = journal.complete(permit, { ...proof, phase: "completed", after_digest: f.input.expected_digest,
      after_file_identity: proof.file_identity, text: "original\n" });
    const record = { run_id: f.input.run_id, operation_key: f.input.operation_key, executor_ref: { id: f.input.executor_actor_id }, input_digest: f.input.context_digest };
    const read = () => WorkspaceToolJournal.readRunOriginals(f.path, f.input.project_id, f.policy.repository_path_digest, record, digest(JSON.stringify(f.policy)).value);
    expect(read()).toEqual({ facts: { invocations: 1, unresolved: 0, has_effect: true }, calls: [{ input: f.input, state: "completed", receipt }] });
    const copy = read(); copy.calls[0]!.receipt!.native.after_digest = "0".repeat(64);
    expect(read().calls[0]!.receipt).toEqual(receipt); expect(journal.facts().states.completed).toBe(1);
  });
  it("never calls resource deletion while either original owner is active or unproven", async () => {
    const f = setup(), first = f.open(), input = parseWorkspaceToolInvocation({ ...f.input, tool: "replace_file", replacement_utf8: "replacement\n" }), permit = f.claim(first, input);
    first.prepare(permit, { ...f.proof(input), replacement_identity: { volume_serial: "12345678", file_index: "0000000000000003" } }); first.dispatch(permit); first.stop(permit, true); first.close();
    for (const [host, native] of [["active", "absent"], ["absent", "active"], ["unknown", "absent"], ["absent", "unknown"]] as const) {
      let calls = 0; const next = f.open(async identity => identity.creation_ticks === "1" ? host : native, async () => { calls++; return "removed"; });
      const facts = next.facts(), recovered = await next.reclaimResources(); expect(calls).toBe(0); expect(recovered).toMatchObject({ examined: 1, removed: 0, unproven: 0 });
      expect(recovered.active + recovered.unknown_owners).toBe(1); expect(next.facts()).toEqual(facts); next.close();
    }
  });
  it("keeps Unknown and its permanent slot across removal, repeated absence and failed cleanup", async () => {
    const f = setup(1), input = parseWorkspaceToolInvocation({ ...f.input, tool: "replace_file", replacement_utf8: "replacement\n" });
    const statuses = ["removed", "absent", "denied"];
    const journal = f.open(async () => "absent", async (proof, originalOwner) => {
      expect(originalOwner).toEqual(owner); proof.replacement_identity!.file_index = "0".repeat(16); originalOwner.image = "modified callback copy";
      const outcome = statuses.shift(); if (outcome === "denied") throw Error("identity changed"); return outcome as "removed" | "absent";
    });
    const permit = f.claim(journal, input); journal.prepare(permit, { ...f.proof(input), replacement_identity: { volume_serial: "12345678", file_index: "0000000000000003" } }); journal.dispatch(permit); journal.stop(permit, true);
    const facts = journal.facts();
    for (const expected of [{ removed: 1, unproven: 0 }, { absent: 1, unproven: 0 }, { removed: 0, absent: 0, unproven: 1 }]) {
      expect(await journal.reclaimResources()).toMatchObject(expected); expect(journal.facts()).toEqual(facts);
    }
    expect(() => f.claim(journal, { ...f.input, run_id: createInternalId(), path: "other.ts", call_id: "fresh" })).toThrow("workspace_tool_capacity_exhausted");
  });
  it("skips unfinalized preparations and treats read-only resource outcomes separately", async () => {
    const f = setup(), calls: string[] = [], journal = f.open(async () => "absent", async proof => { calls.push(proof.nonce); return "not_applicable"; });
    const permit = f.claim(journal); journal.prepare(permit, f.proof()); expect(await journal.reclaimResources()).toMatchObject({ examined: 0 }); expect(calls).toHaveLength(0);
    journal.stop(permit, false); expect(await journal.reclaimResources()).toMatchObject({ examined: 1, not_applicable: 1, removed: 0 }); expect(journal.facts()).toMatchObject({ unresolved: 0, states: { not_started: 1 } });
    const wrong = f.open(async () => "absent", async () => "removed"); expect(await wrong.reclaimResources()).toMatchObject({ examined: 1, removed: 0, unproven: 1 });
  });
});
