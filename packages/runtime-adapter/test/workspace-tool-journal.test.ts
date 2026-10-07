import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId, type ToolAuthorityAssessment, type ToolAuthorityRequest } from "@cimiloop/protocol/v2";
import { digest } from "../src/files.js";
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
    const path = join(root, "tools.sqlite"), open = (observeOwner?: ConstructorParameters<typeof WorkspaceToolJournal>[2]["observeOwner"]) => {
      const journal = new WorkspaceToolJournal(path, policy, { identity: owner, ...(observeOwner ? { observeOwner } : {}) }); journals.push(journal); return journal;
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
});
