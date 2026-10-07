// Fixed dependency-free custom tools for the pinned OpenCode 1.18.34 registry.
// No built-in filesystem/shell calls, model credentials or model-selected IDs.
import { createHash } from "node:crypto";
import { createAgentWorkspaceToolClient } from "./agent-workspace-ipc-client.mjs";

const id = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
export function createOpenCodeWorkspaceTools(endpoint) {
  if (!exact(endpoint, ["pipe", "scope_digest"]) || typeof endpoint.pipe !== "string" ||
    !/^\\\\\.\\pipe\\CimiLoop\.AgentWorkspace\.[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(endpoint.pipe) || typeof endpoint.scope_digest !== "string" || !/^[a-f0-9]{64}$/.test(endpoint.scope_digest)) throw Error("opencode_workspace_endpoint_invalid");
  const client = createAgentWorkspaceToolClient(endpoint);
  const definition = tool => ({
    description: tool === "read_file" ? "Read one authorized repository file through CimiLoop; supply its original SHA-256." : "Replace one authorized repository file through CimiLoop; supply its original SHA-256 and complete UTF-8 replacement.",
    args: { path: { type: "string", minLength: 1, maxLength: 240 }, expected_digest: { type: "string", pattern: "^[a-f0-9]{64}$" },
      ...(tool === "replace_file" ? { replacement_utf8: { type: "string", maxLength: 16384 } } : {}) },
    async execute(args, context) {
      // callID is carried by the pinned registry's original toolCtx. It is not
      // an argument. Include session/message so reused IDs cannot collide.
      if (!exact(args, ["path", "expected_digest", ...(tool === "replace_file" ? ["replacement_utf8"] : [])]) ||
        Object.values(Object.getOwnPropertyDescriptors(args)).some(value => !Object.hasOwn(value, "value")) ||
        typeof args.path !== "string" || !args.path.isWellFormed() || !args.path || args.path.length > 240 || typeof args.expected_digest !== "string" || !/^[a-f0-9]{64}$/.test(args.expected_digest) ||
        tool === "replace_file" && (typeof args.replacement_utf8 !== "string" || !args.replacement_utf8.isWellFormed() || Buffer.byteLength(args.replacement_utf8) > 16384) ||
        !context || !id(context.sessionID) || !id(context.messageID) || !id(context.callID) ||
        typeof context.ask !== "function" || !context.abort || typeof context.abort.aborted !== "boolean" || context.abort.aborted) throw Error("opencode_workspace_call_invalid");
      const call_id = "sdk_" + createHash("sha256").update(JSON.stringify([context.sessionID, context.messageID, context.callID])).digest("hex");
      const original = { ...args }, abort = context.abort;
      await context.ask({ permission: tool === "read_file" ? "cimi_read" : "cimi_replace", patterns: [original.path], always: [], metadata: {} });
      const reply = await client.execute({ ...original, call_id, tool }, abort);
      if (reply.outcome !== "completed") throw Error(reply.reason);
      // The full original receipt is retained by the trusted host ledger.
      // This projection is only tool output, never Run/Task completion proof.
      return { title: original.path, output: JSON.stringify({ format: "cimiloop/opencode-workspace-output/1.0.0", call_id, tool, path: original.path,
        before_digest: reply.receipt.native.before_digest, after_digest: reply.receipt.native.after_digest, text: reply.receipt.native.text, replay: reply.replay,
        formal_agent_execution_enabled: false }), metadata: { call_id, tool, replay: reply.replay } };
    }
  });
  return Object.freeze({ read: Object.freeze(definition("read_file")), replace: Object.freeze(definition("replace_file")) });
}
