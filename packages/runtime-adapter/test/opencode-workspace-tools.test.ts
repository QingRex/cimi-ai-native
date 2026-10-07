import { createServer } from "node:net";
import { randomUUID, createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { digest } from "../src/files.js";
const url = new URL("../transport/opencode-workspace-tools.js", import.meta.url).href;
const { createOpenCodeWorkspaceTools } = await import(url) as { createOpenCodeWorkspaceTools(endpoint: unknown): { read: any; replace: any } };
const args = () => ({ path: "src/query.ts", expected_digest: digest("original").value });
const context = () => ({ sessionID: "ses_original", messageID: "msg_original", callID: "sdk_original", abort: new AbortController().signal, ask: async (_input: unknown) => {} });

describe("pinned OpenCode tool boundary", () => {
  it("rejects absent SDK IDs, forged model IDs, executable arguments and oversized UTF-8 before any pipe request", async () => {
    const tools = createOpenCodeWorkspaceTools({ pipe: `\\\\.\\pipe\\CimiLoop.AgentWorkspace.${randomUUID()}`, scope_digest: digest("scope").value });
    for (const patch of [{ callID: undefined }, { sessionID: "" }, { abort: AbortSignal.abort() }, { ask: undefined }])
      await expect(tools.read.execute(args(), { ...context(), ...patch })).rejects.toThrow("opencode_workspace_call_invalid");
    for (const patch of [{ call_id: "forged" }, { scope_digest: digest("foreign").value }, { expected_digest: "bad" }])
      await expect(tools.read.execute({ ...args(), ...patch }, context())).rejects.toThrow("opencode_workspace_call_invalid");
    const executable = Object.defineProperty(args(), "path", { get() { throw Error("Getter must not run"); }, enumerable: true });
    await expect(tools.read.execute(executable, context())).rejects.toThrow("opencode_workspace_call_invalid");
    await expect(tools.replace.execute({ ...args(), replacement_utf8: "界".repeat(5500) }, context())).rejects.toThrow("opencode_workspace_call_invalid");
    expect(() => createOpenCodeWorkspaceTools({ pipe: "arbitrary", scope_digest: digest("scope").value })).toThrow("opencode_workspace_endpoint_invalid");
  });
});
describe.runIf(process.platform === "win32")("original SDK IDs across the fixed pipe client", () => {
  async function deniedPipe() {
    const pipe = `\\\\.\\pipe\\CimiLoop.AgentWorkspace.${randomUUID()}`, received: any[] = [];
    const server = createServer(socket => { socket.on("error", () => socket.destroy()); let bytes = Buffer.alloc(0);
      socket.on("data", chunk => { bytes = Buffer.concat([bytes, chunk]); if (bytes.length < 4 || bytes.length < bytes.readUInt32LE() + 4) return;
        const payload = bytes.subarray(4), frame = JSON.parse(payload.toString("utf8")); received.push(frame);
        const reply = Buffer.from(JSON.stringify({ format: "cimiloop/agent-workspace-tool-reply/1.0.0", scope_digest: frame.scope_digest, request_digest: digest(payload).value,
          call_id: frame.call_id, outcome: "denied", receipt: null, replay: false, reason: "tool_authority_denied", formal_agent_execution_enabled: false }));
        const header = Buffer.alloc(4); header.writeUInt32LE(reply.length); socket.end(Buffer.concat([header, reply]));
      });
    });
    await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(pipe, done); });
    return { pipe, received, close: () => new Promise<void>(done => server.close(() => done())) };
  }
  it("derives stable IDs from actual context and detaches arguments before a permission wait", async () => {
    const f = await deniedPipe(); try {
      const endpoint = { pipe: f.pipe, scope_digest: digest("original scope").value }, tools = createOpenCodeWorkspaceTools(endpoint);
      endpoint.pipe = `\\\\.\\pipe\\CimiLoop.AgentWorkspace.${randomUUID()}`; endpoint.scope_digest = digest("foreign").value;
      const original = args(), ctx = context(); ctx.ask = async () => { original.path = "foreign.txt"; };
      await expect(tools.read.execute(original, ctx)).rejects.toThrow("tool_authority_denied");
      await expect(tools.read.execute(args(), context())).rejects.toThrow("tool_authority_denied");
      await expect(tools.read.execute(args(), { ...context(), messageID: "msg_next" })).rejects.toThrow("tool_authority_denied");
      const key = "sdk_" + createHash("sha256").update(JSON.stringify([ctx.sessionID, ctx.messageID, ctx.callID])).digest("hex");
      expect(f.received).toHaveLength(3); expect(f.received[0]).toMatchObject({ path: "src/query.ts", call_id: key, scope_digest: digest("original scope").value });
      expect(f.received[1].call_id).toBe(key); expect(f.received[2].call_id).not.toBe(key);
    } finally { await f.close(); }
  });
  it("does not contact the host if the SDK permission request fails or cancellation occurs during that wait", async () => {
    const f = await deniedPipe(); try {
      const tools = createOpenCodeWorkspaceTools({ pipe: f.pipe, scope_digest: digest("scope").value });
      await expect(tools.read.execute(args(), { ...context(), ask: async () => { throw Error("permission_denied"); } })).rejects.toThrow("permission_denied");
      const abort = new AbortController(); await expect(tools.read.execute(args(), { ...context(), abort: abort.signal, ask: async () => abort.abort() })).rejects.toThrow("agent_ipc_request_denied");
      expect(f.received).toEqual([]);
    } finally { await f.close(); }
  });
});
