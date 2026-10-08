import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, unlinkSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { AgentWorkspaceIpcJournal, readAgentWorkspaceIpcOriginals, correlateAgentWorkspaceSdkOriginals } from "../src/agent-workspace-ipc-journal.js";
import { parseAgentWorkspaceToolScope } from "../src/agent-workspace-authority.js";
import { agentWorkspaceIpcScopeDigest } from "../src/agent-workspace-ipc.js";
import { digest } from "../src/files.js";

// Constructed byte contracts only; actual OS/SDK cases are separate.
describe("original IPC bytes and SDK correlation", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) { if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-ipc-originals-")) throw Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true }); } });
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-ipc-originals-")); roots.push(root);
    const scope = parseAgentWorkspaceToolScope({ project_id: createInternalId(), run_id: createInternalId(), operation_key: createInternalId(), executor_actor_id: createInternalId(), context_digest: digest("constructed context"),
      runtime_binding: { binding_ref: { object_type: "provider_binding", id: createInternalId() }, digest: digest("constructed binding") }, skill_bindings: [],
      host_admission_ref: { provider: "local_content", resource_type: "agent_host_admission", locator: digest("constructed admission").value, digest: digest("constructed admission") } });
    const nonce = randomUUID(), endpoint = { pipe: `\\\\.\\pipe\\CimiLoop.AgentWorkspace.${nonce}`, scope_digest: agentWorkspaceIpcScopeDigest(scope), check_catalog_digest: null,
      peer: { pid: 123, creation_ticks: "1", image: process.execPath }, supervisor: { pid: 124, creation_ticks: "2", image: process.execPath }, appcontainer_sid: null };
    const journal = AgentWorkspaceIpcJournal.create(root, scope, endpoint, nonce, digest("constructed transport").value), identity = { sessionID: "ses_original", messageID: "msg_original", callID: "call_original" };
    const callId = "sdk_" + digest(JSON.stringify([identity.sessionID, identity.messageID, identity.callID])).value;
    const input = { path: "src/query.ts", expected_digest: digest("constructed file").value }, request = { format: "cimiloop/agent-workspace-tool-request/1.0.0", scope_digest: endpoint.scope_digest, call_id: callId, tool: "read_file", ...input };
    const native = { before_digest: input.expected_digest, after_digest: input.expected_digest, text: "constructed file" }, receipt = { run_id: scope.run_id, call_id: callId, native };
    const reply = { format: "cimiloop/agent-workspace-tool-reply/1.0.0", scope_digest: endpoint.scope_digest, request_digest: digest(JSON.stringify(request)).value,
      call_id: callId, outcome: "completed", receipt, replay: false, reason: null, formal_agent_execution_enabled: false };
    const projection = { format: "cimiloop/opencode-workspace-output/1.0.0", call_id: callId, tool: "read_file", path: input.path, ...native, replay: false, formal_agent_execution_enabled: false };
    const event = { type: "tool_use", sessionID: identity.sessionID, part: { ...identity, tool: "cimi_read", state: { status: "completed", input, output: JSON.stringify(projection) } } };
    const capture = () => journal.request(Buffer.from(JSON.stringify(request)), reply.request_digest);
    const read = () => readAgentWorkspaceIpcOriginals(root, scope, nonce);
    return { root, scope, nonce, endpoint, journal, request, reply, event, projection, capture, read, correlate: (eventInput: unknown = event) => correlateAgentWorkspaceSdkOriginals(read(), Buffer.from(JSON.stringify(eventInput) + "\n")) };
  }
  it("saves request bytes before reply and refuses replacing original channel/reply", () => {
    const f = fixture(), ticket = f.capture(); expect(f.read()).toMatchObject({ status: "Observed", unresolved: 1, formal_agent_execution_enabled: false });
    expect(readFileSync(join(ticket.path, "request.raw"))).toEqual(Buffer.from(JSON.stringify(f.request)));
    expect(() => AgentWorkspaceIpcJournal.create(f.root, f.scope, f.endpoint, f.nonce, digest("constructed transport").value)).toThrow();
    f.journal.reply(ticket, Buffer.from(JSON.stringify(f.reply))); expect(f.read().unresolved).toBe(0);
    expect(() => f.journal.reply(ticket, Buffer.from(JSON.stringify(f.reply)))).toThrow("agent_ipc_originals_unproven");
  });
  it("retains partial request/reply without inventing completion or delivery", () => {
    const f = fixture(), ticket = f.capture(); writeFileSync(join(ticket.path, "reply.raw"), JSON.stringify(f.reply));
    expect(f.read()).toMatchObject({ unresolved: 1, exchanges: [{ state: "unknown", reply: null }] });
    expect(f.read().artifacts.some(artifact => artifact.name === "0001/reply.raw")).toBe(true);
    unlinkSync(join(ticket.path, "reply.raw")); unlinkSync(join(ticket.path, "request.json"));
    expect(f.read()).toMatchObject({ unresolved: 1, exchanges: [{ state: "unknown", request: null }] }); expect(f.correlate().uncorrelated_exchanges).toBe(1);
  });
  it("rejects corrupt bytes, Scope, reply linkage and sequence holes", () => {
    const f = fixture(), ticket = f.capture(); f.journal.reply(ticket, Buffer.from(JSON.stringify(f.reply)));
    writeFileSync(join(ticket.path, "request.raw"), JSON.stringify({ ...f.request, path: "src/foreign.ts" })); expect(f.read).toThrow("agent_ipc_originals_unproven");
    writeFileSync(join(ticket.path, "request.raw"), JSON.stringify(f.request));
    const reply = Buffer.from(JSON.stringify({ ...f.reply, request_digest: digest("foreign").value }));
    writeFileSync(join(ticket.path, "reply.raw"), reply); writeFileSync(join(ticket.path, "reply.json"), JSON.stringify({ ordinal: "0001", digest: digest(reply).value }));
    expect(f.read).toThrow("agent_ipc_originals_unproven");
    expect(() => readAgentWorkspaceIpcOriginals(f.root, { ...f.scope, context_digest: digest("foreign") }, f.nonce)).toThrow("agent_ipc_originals_unproven");
    mkdirSync(join(f.journal.path, "0003")); expect(f.read).toThrow("agent_ipc_originals_unproven");
  });
  it("correlates exact SDK identities/input/output without qualifying model or native effects", () => {
    const f = fixture(); f.journal.reply(f.capture(), Buffer.from(JSON.stringify(f.reply)));
    expect(f.correlate()).toMatchObject({ uncorrelated_exchanges: 0, unmatched_sdk_calls: 0, model_account_custody_proven: false, native_effect_reverified: false, formal_agent_execution_enabled: false,
      links: [{ correlated: true, sdk: { session_id: "ses_original", message_id: "msg_original", call_id: "call_original" } }] });
    for (const event of [
      { ...f.event, part: { ...f.event.part, callID: "foreign" } },
      { ...f.event, part: { ...f.event.part, state: { ...f.event.part.state, input: { ...f.event.part.state.input, path: "src/foreign.ts" } } } },
      { ...f.event, part: { ...f.event.part, state: { ...f.event.part.state, output: JSON.stringify({ ...f.projection, after_digest: digest("foreign").value }) } } }
    ]) expect(f.correlate(event).uncorrelated_exchanges).toBe(1);
    expect(() => correlateAgentWorkspaceSdkOriginals(f.read(), Buffer.from(JSON.stringify(f.event) + "\n" + JSON.stringify(f.event)))).toThrow("agent_ipc_originals_unproven");
  });
  it("correlates original denial and keeps missing registration Unknown", () => {
    const f = fixture(); f.journal.reply(f.capture(), Buffer.from(JSON.stringify({ ...f.reply, outcome: "denied", receipt: null, reason: "tool_authority_denied" })));
    expect(f.correlate({ ...f.event, part: { ...f.event.part, state: { status: "error", input: f.event.part.state.input, error: "tool_authority_denied" } } }).uncorrelated_exchanges).toBe(0);
    expect(readAgentWorkspaceIpcOriginals(f.root, f.scope, randomUUID())).toMatchObject({ status: "Unknown", header: null });
  });
  it("refuses damaged metadata and forged tickets before recording another request/reply", () => {
    const f = fixture(), original = readFileSync(join(f.journal.path, "header.json"));
    writeFileSync(join(f.journal.path, "header.json"), "{}"); expect(f.capture).toThrow("agent_ipc_originals_unproven");
    writeFileSync(join(f.journal.path, "header.json"), original); const ticket = f.capture(); expect(ticket.ordinal).toBe("0001");
    expect(() => f.journal.reply({ ...ticket }, Buffer.from(JSON.stringify(f.reply)))).toThrow("agent_ipc_originals_unproven");
  });
  it("rejects truncated SDK JSON and invalid UTF-8 without pretending correlation", () => {
    const f = fixture(); f.journal.reply(f.capture(), Buffer.from(JSON.stringify(f.reply)));
    expect(() => correlateAgentWorkspaceSdkOriginals(f.read(), Buffer.from('{"type":"tool_use"'))).toThrow();
    expect(() => correlateAgentWorkspaceSdkOriginals(f.read(), Buffer.from([0xc3, 0x28]))).toThrow();
    expect(f.read().unresolved).toBe(0);
  });
  it("preserves one original process registered as both supervisor and peer, but refuses inconsistent identities", () => {
    const f = fixture(), nonce = randomUUID(), endpoint = { ...f.endpoint, pipe: `\\\\.\\pipe\\CimiLoop.AgentWorkspace.${nonce}`, peer: { ...f.endpoint.supervisor } };
    AgentWorkspaceIpcJournal.create(f.root, f.scope, endpoint, nonce, digest("constructed transport").value);
    expect(readAgentWorkspaceIpcOriginals(f.root, f.scope, nonce).header?.endpoint).toEqual(endpoint);
    const invalidNonce = randomUUID();
    expect(() => AgentWorkspaceIpcJournal.create(f.root, f.scope, { ...endpoint, pipe: `\\\\.\\pipe\\CimiLoop.AgentWorkspace.${invalidNonce}`, peer: { ...endpoint.peer, creation_ticks: "3" } }, invalidNonce, digest("constructed transport").value)).toThrow("agent_ipc_originals_unproven");
  });
});
