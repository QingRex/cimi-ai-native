import { createServer } from "node:net";
import { randomUUID, createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { parseAgentWorkspaceToolScope } from "../src/agent-workspace-authority.js";
import { agentWorkspaceIpcScopeDigest, agentWorkspaceIpcCheckInvocation } from "../src/agent-workspace-ipc.js";
import { parseWorkspaceCheckCatalog } from "../src/workspace-checks.js";
import { digest } from "../src/files.js";
const { createOpenCodeWorkspaceTools } = await import(new URL("../transport/opencode-workspace-tools.js", import.meta.url).href) as any;
const originalScope = () => parseAgentWorkspaceToolScope({ project_id: createInternalId(), run_id: createInternalId(), operation_key: createInternalId(), executor_actor_id: createInternalId(), context_digest: digest("constructed context"),
  runtime_binding: { binding_ref: { object_type: "provider_binding", id: createInternalId() }, digest: digest("binding") }, skill_bindings: [],
  host_admission_ref: { provider: "local_content", resource_type: "agent_host_admission", locator: digest("admission").value, digest: digest("admission") } });
const catalog = (scope: ReturnType<typeof originalScope>) => {
  const body = { format: "cimiloop/workspace-check-catalog/1.0.0", scope_digest: agentWorkspaceIpcScopeDigest(scope), node_digest: digest("constructed node").value, policy_digest: digest("constructed policy").value,
    recipes: [{ check_id: "fixed", profile: "node_test", entry: "src/check.mjs", inputs: [{ path: "src/check.mjs", expected_digest: digest("constructed source").value }], max_elapsed_ms: 30000, max_output_bytes: 32768 }] };
  return parseWorkspaceCheckCatalog({ ...body, catalog_digest: digest(JSON.stringify(body)).value }, scope);
};
const context = () => ({ sessionID: "ses_original", messageID: "msg_original", callID: "sdk_original", abort: new AbortController().signal, ask: async (_input: any) => {} });

describe("fixed check catalog authority boundary", () => {
  it("rejects changed scope, recipes, digests, forbidden paths and model overrides before dispatch", async () => {
    const scope = originalScope(), fixed = catalog(scope), frame = { format: "cimiloop/agent-workspace-tool-request/1.0.0", scope_digest: fixed.scope_digest,
      call_id: "sdk_original", tool: "run_check", check_id: "fixed", check_catalog_digest: fixed.catalog_digest };
    expect(agentWorkspaceIpcCheckInvocation(scope, fixed, frame)).toEqual({ format: "cimiloop/workspace-check-call/1.0.0", call_id: "sdk_original", check_id: "fixed" });
    for (const patch of [{ check_id: "foreign" }, { check_catalog_digest: digest("foreign").value }, { scope_digest: digest("foreign").value }, { argv: [] }, { caller: {} }, { path: "src/check.mjs" }, { max_elapsed_ms: 30000 }])
      expect(() => agentWorkspaceIpcCheckInvocation(scope, fixed, { ...frame, ...patch })).toThrow("agent_ipc_frame_denied");
    const changed = structuredClone(fixed); changed.recipes[0]!.max_elapsed_ms = 100;
    expect(() => parseWorkspaceCheckCatalog(changed, scope)).toThrow("workspace_check_catalog_invalid");
    expect(() => parseWorkspaceCheckCatalog(fixed, { ...scope, run_id: createInternalId() })).toThrow("workspace_check_catalog_invalid");
    changed.recipes[0]!.entry = ".git/config.mjs"; changed.recipes[0]!.inputs[0]!.path = changed.recipes[0]!.entry;
    expect(() => parseWorkspaceCheckCatalog(changed, scope)).toThrow();
    const endpoint = { pipe: `\\\\.\\pipe\\CimiLoop.AgentWorkspace.${randomUUID()}`, scope_digest: fixed.scope_digest }, tools = createOpenCodeWorkspaceTools(endpoint, fixed);
    expect(tools.check.args.check_id.enum).toEqual(["fixed"]);
    for (const args of [{ check_id: "foreign" }, { check_id: "fixed", call_id: "forged" }, { check_id: "fixed", argv: [] }, Object.defineProperty({}, "check_id", { enumerable: true, get() { throw Error("Getter must not run"); } })])
      await expect(tools.check.execute(args, context())).rejects.toThrow("opencode_workspace_call_invalid");
    await expect(tools.check.execute({ check_id: "fixed" }, { ...context(), callID: undefined })).rejects.toThrow("opencode_workspace_call_invalid");
    expect(() => createOpenCodeWorkspaceTools(endpoint, { ...fixed, catalog_digest: digest("foreign").value })).toThrow("opencode_workspace_catalog_invalid");
    expect(createOpenCodeWorkspaceTools(endpoint).check).toBeUndefined();
  });
});

// Constructed reply contracts only; actual SDK/Node effects have a separate
// Windows scenario. These tests do not qualify a host/model or prove a check ran.
describe.runIf(process.platform === "win32")("fixed SDK check reply contracts", () => {
  async function pipe(fixed: ReturnType<typeof catalog>, mode: string) {
    const original = structuredClone(fixed), name = `\\\\.\\pipe\\CimiLoop.AgentWorkspace.${randomUUID()}`, frames: any[] = [];
    const server = createServer(socket => { let bytes = Buffer.alloc(0); socket.on("error", () => socket.destroy());
      socket.on("data", chunk => {
        bytes = Buffer.concat([bytes, chunk]); if (bytes.length < 4 || bytes.length < bytes.readUInt32LE() + 4) return;
        const payload = bytes.subarray(4), frame = JSON.parse(payload.toString()); frames.push(frame);
        if (mode === "lost") { socket.end(); return; }
        const recipe = original.recipes[0]!, receipt: any = { format: "cimiloop/workspace-check-receipt/1.0.0", input_digest: digest("constructed call").value,
          run_id: createInternalId(), call_id: frame.call_id, profile: recipe.profile, entry: recipe.entry, outcome: "failed", exit_code: 1, reason: "exited",
          stdout_digest: digest("constructed stdout").value, stderr_digest: digest("constructed stderr").value,
          source_digest: digest(JSON.stringify(recipe.inputs.map(source => ({ path: source.path, digest: source.expected_digest })))).value, formal_agent_execution_enabled: false };
        if (mode === "pass") Object.assign(receipt, { outcome: "passed", exit_code: 0 });
        if (mode === "false_pass") receipt.outcome = "passed";
        if (mode === "source") receipt.source_digest = digest("foreign source").value;
        if (mode === "entry") receipt.entry = "foreign.mjs";
        const reply = Buffer.from(JSON.stringify({ format: "cimiloop/agent-workspace-tool-reply/1.0.0", scope_digest: frame.scope_digest, request_digest: digest(payload).value,
          call_id: frame.call_id, outcome: "completed", receipt, replay: false, reason: null, formal_agent_execution_enabled: false }));
        const header = Buffer.alloc(4); header.writeUInt32LE(reply.length); socket.end(Buffer.concat([header, reply]));
      });
    });
    await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(name, done); });
    return { name, frames, close: () => new Promise<void>(done => server.close(() => done())) };
  }
  it.each(["pass", "fail"])("retains %s results and original SDK identity across catalog/argument mutation", async mode => {
    const fixed = catalog(originalScope()), f = await pipe(fixed, mode);
    try {
      const tools = createOpenCodeWorkspaceTools({ pipe: f.name, scope_digest: fixed.scope_digest }, fixed), ctx = context(), args = { check_id: "fixed" }, expected = structuredClone(fixed), permissions: any[] = [];
      ctx.ask = async input => { permissions.push(input); args.check_id = "foreign"; fixed.recipes[0]!.entry = "foreign.mjs"; fixed.catalog_digest = digest("foreign").value; };
      const result = JSON.parse((await tools.check.execute(args, ctx)).output);
      const callId = "sdk_" + createHash("sha256").update(JSON.stringify([ctx.sessionID, ctx.messageID, ctx.callID])).digest("hex");
      expect(permissions).toEqual([{ permission: "cimi_check", patterns: ["fixed"], always: [], metadata: {} }]);
      expect(result).toMatchObject({ check_id: "fixed", call_id: callId, check_catalog_digest: expected.catalog_digest, outcome: mode === "pass" ? "passed" : "failed", formal_agent_execution_enabled: false });
      expect(f.frames).toEqual([{ call_id: callId, check_id: "fixed", check_catalog_digest: expected.catalog_digest, tool: "run_check", format: "cimiloop/agent-workspace-tool-request/1.0.0", scope_digest: expected.scope_digest }]);
    } finally { await f.close(); }
  });
  it.each(["false_pass", "source", "entry", "lost"])("refuses %s without changing the call or retrying", async mode => {
    const fixed = catalog(originalScope()), f = await pipe(fixed, mode);
    try {
      const tools = createOpenCodeWorkspaceTools({ pipe: f.name, scope_digest: fixed.scope_digest }, fixed);
      await expect(tools.check.execute({ check_id: "fixed" }, context())).rejects.toThrow(mode === "false_pass" ? "agent_ipc_reply_unproven" : mode === "lost" ? "agent_ipc_reply_missing" : "opencode_workspace_check_unproven");
      expect(f.frames).toHaveLength(1);
      const abort = new AbortController(); await expect(tools.check.execute({ check_id: "fixed" }, { ...context(), abort: abort.signal, ask: async () => abort.abort() })).rejects.toThrow("agent_ipc_request_denied");
      expect(f.frames).toHaveLength(1);
    } finally { await f.close(); }
  });
});
