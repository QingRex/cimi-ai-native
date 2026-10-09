import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId, type AgentToolAuthorityRequest } from "@cimiloop/protocol/v2";
import { parseAgentWorkspaceToolScope } from "../src/agent-workspace-authority.js";
import { AgentWorkspaceToolHost } from "../src/agent-workspace-tool-host.js";
import { digest } from "../src/files.js";
import { pinBinary } from "../src/native.js";
import { parseWorkspaceToolInvocation } from "../src/workspace-files.js";
import { AgentWorkspaceCheckHost, parseWorkspaceCheckRecipe } from "../src/workspace-checks.js";

// Actual event-loop scheduling and retained files, with constructed assessment,
// journal and Native ports. These are not model/Skill/Runtime qualifications.
describe("Agent tools process pending I/O before each fresh authority assessment", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-authority-scheduling-")) throw Error("Unsafe cleanup");
    rmSync(root, { recursive: true, force: true });
  } });
  function fixture() {
    const scope = parseAgentWorkspaceToolScope({ project_id: createInternalId(), run_id: createInternalId(), operation_key: createInternalId(), executor_actor_id: createInternalId(),
      context_digest: digest("constructed context"), runtime_binding: { binding_ref: { object_type: "provider_binding", id: createInternalId() }, digest: digest("binding") }, skill_bindings: [],
      host_admission_ref: { provider: "local_content", resource_type: "agent_host_admission", locator: digest("admission").value, digest: digest("admission") } });
    let revoked = false, assessments = 0;
    const authority = { change_id: createInternalId(), task_id: createInternalId(), work_item_id: createInternalId(), run_record_id: createInternalId(), context_id: createInternalId(),
      host_admission_ref: scope.host_admission_ref, host_validation_digest: digest("constructed current host"), basis_digest: digest("constructed basis") };
    const assess = (request: AgentToolAuthorityRequest) => { assessments++; return { schema_version: "2.0.0", scope: "agent_run_tool_assessment", request,
      assessed_at: "2026-10-10T00:00:00.000Z", as_of_event_sequence: 1, decision: revoked ? "DENY" : "ALLOW", reasons: revoked ? ["Host revoked"] : [], authority: revoked ? null : authority }; };
    return { scope, assess, revoke: () => { revoked = true; }, assessments: () => assessments };
  }
  it.each(["revocation", "close"])("workspace replay observes pending %s before claiming the original operation", async mode => {
    const f = fixture(); let claims = 0;
    const journal = { assertWorkspace() {}, claimAgent() { claims++; return { replay: { constructed: true } }; }, close() {} };
    const host = new AgentWorkspaceToolHost({ scope: f.scope, assess: f.assess, journal: journal as never, files: { scopeDigest: "constructed" } as never });
    const input = parseWorkspaceToolInvocation({ format: "cimiloop/workspace-tool-invocation/1.0.0", project_id: f.scope.project_id, run_id: f.scope.run_id,
      operation_key: f.scope.operation_key, executor_actor_id: f.scope.executor_actor_id, context_digest: f.scope.context_digest,
      call_id: "original", tool: "read_file", path: "src/query.ts", expected_digest: digest("original\n").value });
    const pending = new Promise<void>(resolve => setImmediate(() => { if (mode === "close") void host.close(); else f.revoke(); resolve(); }));
    try {
      await expect(host.execute(input)).rejects.toThrow(mode === "close" ? "workspace_tool_host_closed" : "tool_authority_denied");
      expect(claims).toBe(0); expect(f.assessments()).toBe(mode === "close" ? 0 : 1);
    } finally { await pending; await host.close(); }
  });
  it.each(["revocation", "close"])("fixed check observes pending %s before reserving or preparing a Native effect", async mode => {
    const f = fixture(), root = mkdtempSync(join(tmpdir(), "cimiloop-authority-scheduling-")); roots.push(root);
    const source = join(root, "constructed.exe"); writeFileSync(source, "constructed binary"); const node = pinBinary(root, source);
    const policy = { constructed: "fixed policy" }, policyDigest = digest(JSON.stringify(policy)).value, parent = join(root, "workspace-checks", f.scope.project_id);
    mkdirSync(parent, { recursive: true }); writeFileSync(join(parent, "policy.json"), JSON.stringify({ policy, policy_digest: policyDigest }));
    const recipe = parseWorkspaceCheckRecipe({ check_id: "fixed", profile: "node_syntax", entry: "src/check.mjs",
      inputs: [{ path: "src/check.mjs", expected_digest: digest("constructed source").value }], max_elapsed_ms: 1000, max_output_bytes: 16384 }, f.scope);
    let prepares = 0;
    const files = { prepare() { prepares++; throw Error("Unexpected Native preparation"); } }, owner = { identity: { pid: process.pid, creation_ticks: "1", image: process.execPath } };
    const host: AgentWorkspaceCheckHost = Reflect.construct(AgentWorkspaceCheckHost, [{ scope: f.scope, recipes: [recipe], repositoryPath: root, dataDirectory: root,
      nodeBinary: source, assess: f.assess }, files, source, node, owner, parent, policyDigest, node.digest.value]);
    const pending = new Promise<void>(resolve => setImmediate(() => { if (mode === "close") void host.close(); else f.revoke(); resolve(); }));
    try {
      await expect(host.execute({ format: "cimiloop/workspace-check-call/1.0.0", call_id: "original", check_id: "fixed" })).rejects.toThrow(mode === "close" ? "workspace_check_host_closed" : "tool_authority_denied");
      expect(prepares).toBe(0); expect(existsSync(join(parent, "slots"))).toBe(false); expect(f.assessments()).toBe(mode === "close" ? 0 : 1);
    } finally { await pending; await host.close(); }
  });
  it.each(["revocation", "close"])("workspace handles %s queued during the original assessment before Native preparation", async mode => {
    const f = fixture(); let claims = 0, prepares = 0, stopped = false, pending: Promise<void> | undefined;
    const journal = { assertWorkspace() {}, claimAgent() { claims++; return { permit: { constructed: true } }; }, stop(_permit: unknown, dispatched: boolean) {
      expect(dispatched).toBe(false); stopped = true;
    }, close() {} };
    const host = new AgentWorkspaceToolHost({ scope: f.scope, journal: journal as never, files: { scopeDigest: "constructed", prepare() { prepares++; throw Error("Unexpected Native preparation"); } } as never,
      assess: request => { const result = f.assess(request); if (f.assessments() === 1) pending = new Promise<void>(resolve => setImmediate(() => {
        if (mode === "close") void host.close(); else f.revoke(); resolve();
      })); return result; } });
    const input = { format: "cimiloop/workspace-tool-invocation/1.0.0", project_id: f.scope.project_id, run_id: f.scope.run_id,
      operation_key: f.scope.operation_key, executor_actor_id: f.scope.executor_actor_id, context_digest: f.scope.context_digest,
      call_id: "original", tool: "read_file", path: "src/query.ts", expected_digest: digest("original\n").value };
    try {
      await expect(host.execute(input)).rejects.toThrow(mode === "close" ? "workspace_tool_host_closed" : "tool_authority_denied");
      expect(claims).toBe(1); expect(stopped).toBe(true); expect(prepares).toBe(0); expect(f.assessments()).toBe(mode === "close" ? 1 : 2);
    } finally { await pending; await host.close(); }
  });
  it.each(["revocation", "close"])("fixed check handles %s between source and check authority without reserving", async mode => {
    const f = fixture(), root = mkdtempSync(join(tmpdir(), "cimiloop-authority-scheduling-")); roots.push(root);
    const source = join(root, "constructed.exe"); writeFileSync(source, "constructed binary"); const node = pinBinary(root, source);
    const policy = { constructed: "fixed policy" }, policyDigest = digest(JSON.stringify(policy)).value, parent = join(root, "workspace-checks", f.scope.project_id);
    mkdirSync(parent, { recursive: true }); writeFileSync(join(parent, "policy.json"), JSON.stringify({ policy, policy_digest: policyDigest }));
    const recipe = parseWorkspaceCheckRecipe({ check_id: "fixed", profile: "node_syntax", entry: "src/check.mjs",
      inputs: [{ path: "src/check.mjs", expected_digest: digest("constructed source").value }], max_elapsed_ms: 1000, max_output_bytes: 16384 }, f.scope);
    let prepares = 0, pending: Promise<void> | undefined;
    const host: AgentWorkspaceCheckHost = Reflect.construct(AgentWorkspaceCheckHost, [{ scope: f.scope, recipes: [recipe], repositoryPath: root, dataDirectory: root,
      nodeBinary: source, assess: (request: AgentToolAuthorityRequest) => { const result = f.assess(request); if (f.assessments() === 1) pending = new Promise<void>(resolve => setImmediate(() => {
        if (mode === "close") void host.close(); else f.revoke(); resolve();
      })); return result; } }, { prepare() { prepares++; throw Error("Unexpected Native preparation"); } }, source, node,
      { identity: { pid: process.pid, creation_ticks: "1", image: process.execPath } }, parent, policyDigest, node.digest.value]);
    try {
      await expect(host.execute({ format: "cimiloop/workspace-check-call/1.0.0", call_id: "original", check_id: "fixed" })).rejects.toThrow(mode === "close" ? "workspace_check_host_closed" : "tool_authority_denied");
      expect(prepares).toBe(0); expect(existsSync(join(parent, "slots"))).toBe(false); expect(f.assessments()).toBe(mode === "close" ? 1 : 2);
    } finally { await pending; await host.close(); }
  });
});
