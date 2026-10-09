import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CimiLoopKernel, type AgentRunLaunchRequest, type AgentRunVerifierPort } from "../../kernel/src/index.js";
import { contentDigest } from "../../kernel/src/intent.js";
import { createAgentRunProject } from "../../../tests/fixtures/agent-run-project.js";
import { flowTime, flowSuccess } from "../../../tests/fixtures/flow-project.js";
vi.setConfig({ testTimeout: 60000 });
// Constructed host/qualification only; these queries prove no model or billing admission.
describe("fresh original Agent launch authority", () => {
  const roots: string[] = [], stores: { close(): void }[] = [];
  afterEach(() => { for (const store of stores.splice(0)) store.close(); for (const root of roots.splice(0)) {
    if (dirname(root) !== tmpdir() || !basename(root).startsWith("cimiloop-agent-launch-")) throw Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true });
  } });
  function setup() {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-agent-launch-")); roots.push(root);
    const f = createAgentRunProject(root); stores.push(f.store); const prepared = f.prepareAgent(), reserved = f.reserveAgent(prepared);
    const request: AgentRunLaunchRequest = { project_id: f.project.id, run_id: reserved.run.id, operation_key: reserved.record.operation_key,
      executor_actor_id: f.agent.id, context_digest: prepared.context.input_digest, ...f.pins, host_admission_ref: prepared.context.host_admission_ref };
    let calls = 0, epoch = 1;
    const checkRunAuthority = vi.fn((_project, input) => { calls++; expect(input.record).toEqual(reserved.record);
      const proof = contentDigest({ constructed: true, epoch, input }); input.record.operation_key = "mutated copy"; return proof; });
    const port: AgentRunVerifierPort = { ...f.runPort.agent, checkRunAuthority };
    const host = Object.assign(f.runPort, { agent: port });
    const kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, runVerifier: host });
    return { ...f, root, prepared, reserved, request, host, kernel, checkRunAuthority, calls: () => calls, nextEpoch: () => epoch++ };
  }
  it("reads current canonical facts, separates launch from tool permission, and changes no events or budget", () => {
    const f = setup(), sequence = f.store.asOfEventSequence(), before = f.task();
    const first = f.kernel.assessAgentRunLaunch(f.request);
    expect(first).toMatchObject({ scope: "agent_run_launch_assessment", decision: "ALLOW", as_of_event_sequence: sequence });
    expect(f.kernel.assessAgentRunLaunch(f.request)).toEqual(first); f.nextEpoch();
    const next = f.kernel.assessAgentRunLaunch(f.request); expect(next).toMatchObject({ decision: "ALLOW" });
    if (!("authority" in first) || !first.authority || !("authority" in next) || !next.authority) throw Error("Expected authority");
    expect(next.authority.basis_digest).not.toEqual(first.authority.basis_digest);
    expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task()).toEqual(before);
    expect(f.store.getRuntimeRecord("run_record", f.reserved.record.id)).toEqual(f.reserved.record);
    expect(f.kernel.assessAgentRunTool({ ...f.request, action: "read_files", resource: "src/query.ts" })).toMatchObject({ decision: "DENY", reasons: ["AGENT_TOOL_HOST_UNAVAILABLE"] });
  });
  it("requires separate fresh host proof and exact unforgeable original pins", () => {
    const f = setup(); delete (f.host.agent as { checkRunAuthority?: unknown }).checkRunAuthority;
    expect(f.kernel.assessAgentRunLaunch(f.request)).toMatchObject({ decision: "DENY", reasons: ["AGENT_LAUNCH_HOST_UNAVAILABLE"] });
    f.host.agent.checkRunAuthority = () => { throw Error("Missing original model/account proof"); };
    expect(f.kernel.assessAgentRunLaunch(f.request)).toMatchObject({ decision: "DENY", reasons: ["AGENT_LAUNCH_HOST_PROOF_UNPROVEN"] });
    f.host.agent.checkRunAuthority = () => ({ algorithm: "sha256", value: "invalid" });
    expect(f.kernel.assessAgentRunLaunch(f.request)).toMatchObject({ decision: "DENY", reasons: ["AGENT_LAUNCH_HOST_PROOF_UNPROVEN"] });
    for (const extra of [{ approved: true }, { action: "read_files" }, { resource: "src/query.ts" }, { caller: f.caller }])
      expect(f.kernel.assessAgentRunLaunch({ ...f.request, ...extra })).toMatchObject({ code: "PROTOCOL_VALIDATION_FAILED" });
    expect(f.humanKernel.assessAgentRunLaunch(f.request)).toMatchObject({ decision: "DENY", reasons: ["CALLER_IDENTITY_MISMATCH"] });
    expect(f.kernel.assessAgentRunLaunch({ ...f.request, operation_key: "019a0000-0000-7000-8000-000000000000" })).toMatchObject({ decision: "DENY", reasons: ["RUN_BINDING_MISMATCH"] });
  });
  it("denies first launch after workspace changes without calling the host", () => {
    const f = setup(); writeFileSync(join(f.root, "src/query.ts"), "// Changed after reservation\n");
    expect(f.kernel.assessAgentRunLaunch(f.request)).toMatchObject({ decision: "DENY", reasons: expect.arrayContaining(["LAUNCH_SOURCE_OR_WORKSPACE_CHANGED"]) });
    expect(f.calls()).toBe(0);
  });
  it("denies launch after cancellation and leaves pending reconciliation untouched", () => {
    const f = setup(); flowSuccess(f.humanKernel.execute(f.humanCommand("CancelRun", "run", f.reserved.run.id, { reason: "Stop before launch" }, "technical_owner")));
    const sequence = f.store.asOfEventSequence();
    expect(f.kernel.assessAgentRunLaunch(f.request)).toMatchObject({ decision: "DENY", reasons: ["RUN_NOT_ACTIVE"] });
    expect(f.calls()).toBe(0); expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage.pending_reconciliation).toBe(true);
  });
});
