import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { AgentWorkspaceToolIpc, agentWorkspaceIpcInvocation, agentWorkspaceIpcScopeDigest } from "../src/agent-workspace-ipc.js";
import { parseAgentWorkspaceToolScope } from "../src/agent-workspace-authority.js";
import { digest } from "../src/files.js";
const moduleUrl = new URL("../transport/agent-workspace-ipc-client.mjs", import.meta.url).href;
const { exchangeAgentWorkspaceToolFrame, createAgentWorkspaceToolClient } = await import(moduleUrl) as {
  exchangeAgentWorkspaceToolFrame: (pipe: string, request: unknown, signal?: AbortSignal) => Promise<any>;
  createAgentWorkspaceToolClient: (endpoint: { pipe: string; scope_digest: string }) => { execute(args: unknown, signal?: AbortSignal): Promise<any> };
};
const scope = () => parseAgentWorkspaceToolScope({ project_id: createInternalId(), run_id: createInternalId(), operation_key: createInternalId(), executor_actor_id: createInternalId(), context_digest: digest("constructed context"),
  runtime_binding: { binding_ref: { object_type: "provider_binding", id: createInternalId() }, digest: digest("binding") }, skill_bindings: [],
  host_admission_ref: { provider: "local_content", resource_type: "agent_host_admission", locator: digest("admission").value, digest: digest("admission") } });
const frame = (scopeDigest = digest("constructed scope").value) => ({ format: "cimiloop/agent-workspace-tool-request/1.0.0", scope_digest: scopeDigest, call_id: "original_call", tool: "read_file", path: "src/query.ts", expected_digest: digest("constructed read\n").value });
describe("fixed original Agent file frames", () => {
  it("rejects an invalid suspended-start nonce before accessing source, scope, processes or the filesystem", async () => {
    await expect(AgentWorkspaceToolIpc.open({ nonce: "foreign", toolsDirectory: "unused" } as any)).rejects.toThrow("agent_ipc_nonce_invalid");
  });
  it("installs original authority pins and only accepts bounded exact file arguments", () => {
    const original = scope(), request = frame(agentWorkspaceIpcScopeDigest(original)), input = agentWorkspaceIpcInvocation(original, request);
    expect(input).toMatchObject({ project_id: original.project_id, run_id: original.run_id, operation_key: original.operation_key, executor_actor_id: original.executor_actor_id, context_digest: original.context_digest });
    for (const fields of [{ scope_digest: digest("foreign").value }, { caller: {} }, { run_id: createInternalId() }, { host_admission_ref: original.host_admission_ref }, { replacement_utf8: "unwanted" }, { path: ".git/config" }, { tool: "shell" }])
      expect(() => agentWorkspaceIpcInvocation(original, { ...request, ...fields })).toThrow("agent_ipc_frame_denied");
    const executable = Object.defineProperty({}, "tool", { enumerable: true, get() { throw Error("Do not execute input"); } });
    expect(() => agentWorkspaceIpcInvocation(original, executable)).toThrow("agent_ipc_frame_denied");
    expect(() => agentWorkspaceIpcInvocation(original, { ...request, tool: "replace_file", replacement_utf8: "a".repeat(16385) })).toThrow("agent_ipc_frame_denied");
  });
});
// Constructed client reply contracts only. Actual identities and file facts
// are independently covered by the Windows scenario; no host is qualified here.
describe.runIf(process.platform === "win32")("bounded original Agent pipe client", () => {
  async function server(mode: string) {
    const pipe = `\\\\.\\pipe\\CimiLoop.AgentWorkspace.${randomUUID()}`; let connections = 0;
    const listener = createServer(socket => {
      connections++; socket.on("error", () => socket.destroy()); let input = Buffer.alloc(0);
      socket.on("data", bytes => {
        input = Buffer.concat([input, bytes]); if (input.length < 4 || input.length < input.readUInt32LE() + 4) return;
        const payload = input.subarray(4), request = JSON.parse(payload.toString()), fileIdentity = { volume_serial: "12345678", file_index: "1234567890123456" }, inputDigest = digest("constructed invocation").value;
        const receipt = { format: "cimiloop/workspace-tool-receipt/1.0.0", scope: "authorized_workspace", run_id: createInternalId(), call_id: request.call_id,
          input_digest: inputDigest, authority_basis_digest: digest("constructed authority").value, formal_agent_execution_enabled: false,
          native: { format: "cimiloop/workspace-native/1.0.0", phase: "completed", nonce: randomUUID(), input_digest: inputDigest, root_identity: fileIdentity, file_identity: fileIdentity,
            replacement_identity: null, before_digest: request.expected_digest, worker: { pid: process.pid, creation_ticks: "1", image: process.execPath }, after_digest: request.expected_digest, after_file_identity: fileIdentity, text: "constructed read\n" } };
        const reply: any = { format: "cimiloop/agent-workspace-tool-reply/1.0.0", scope_digest: request.scope_digest, request_digest: digest(payload).value, call_id: request.call_id, outcome: "completed", receipt, replay: false, reason: null, formal_agent_execution_enabled: false };
        if (mode === "scope") reply.scope_digest = digest("foreign").value;
        if (mode === "request") reply.request_digest = digest("foreign").value;
        if (mode === "receipt") receipt.native.after_digest = digest("foreign").value;
        if (mode === "input") receipt.native.input_digest = digest("foreign").value;
        if (mode === "formal") reply.formal_agent_execution_enabled = true;
        if (mode === "denied") Object.assign(reply, { outcome: "denied", receipt: null, reason: "tool_authority_denied" });
        if (mode === "lost") { socket.end(); return; }
        let text = JSON.stringify(reply); if (mode === "duplicate") text = text.replace('"outcome":"completed"', '"outcome":"completed","outcome":"completed"');
        const output = Buffer.from(text), header = Buffer.alloc(4); header.writeUInt32LE(output.length); const body = Buffer.concat([header, output]);
        socket.write(body.subarray(0, 2)); setTimeout(() => socket.end(body.subarray(2)), 5);
      });
    });
    await new Promise<void>((done, fail) => { listener.once("error", fail); listener.listen(pipe, done); });
    return { pipe, connections: () => connections, close: () => new Promise<void>(done => listener.close(() => done())) };
  }
  it.each(["valid", "denied"])("accepts a fragmented exact %s reply", async mode => {
    const f = await server(mode); try { expect((await exchangeAgentWorkspaceToolFrame(f.pipe, frame())).outcome).toBe(mode === "valid" ? "completed" : "denied"); }
    finally { await f.close(); }
  });
  it.each(["scope", "request", "receipt", "input", "formal", "duplicate"])("rejects a forged %s reply without retry", async mode => {
    const f = await server(mode); try { await expect(exchangeAgentWorkspaceToolFrame(f.pipe, frame())).rejects.toThrow("agent_ipc_reply_unproven"); expect(f.connections()).toBe(1); }
    finally { await f.close(); }
  });
  it("preserves reply loss without retry and rejects extra/aborted inputs before connecting", async () => {
    const f = await server("lost"); try {
      await expect(exchangeAgentWorkspaceToolFrame(f.pipe, frame())).rejects.toThrow("agent_ipc_reply_missing"); expect(f.connections()).toBe(1);
      await expect(exchangeAgentWorkspaceToolFrame(f.pipe, frame(), AbortSignal.abort())).rejects.toThrow("agent_ipc_request_denied");
      await expect(exchangeAgentWorkspaceToolFrame(f.pipe, { ...frame(), caller: {} })).rejects.toThrow("agent_ipc_request_denied");
      const client = createAgentWorkspaceToolClient({ pipe: f.pipe, scope_digest: frame().scope_digest });
      await expect(client.execute(frame())).rejects.toThrow("agent_ipc_request_denied"); expect(f.connections()).toBe(1);
    } finally { await f.close(); }
  });
});
