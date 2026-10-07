// Fixed file-tool client. It has no shell, endpoint selection, credentials,
// model traffic, authority construction or automatic retry after dispatch.
import { createConnection } from "node:net";
import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";

const maximum = 114688, hash = bytes => createHash("sha256").update(bytes).digest("hex");
const exact = (value, keys) => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const sha = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const identity = value => exact(value, ["volume_serial", "file_index"]) && /^[a-f0-9]{8}$/.test(value.volume_serial) && /^[a-f0-9]{16}$/.test(value.file_index);
const worker = value => exact(value, ["pid", "creation_ticks", "image"]) && Number.isSafeInteger(value.pid) && value.pid > 0 && typeof value.creation_ticks === "string" && /^[1-9][0-9]{0,19}$/.test(value.creation_ticks) && typeof value.image === "string";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Bounded scan before JSON.parse, including escaped duplicate property names.
function json(source) {
  if (typeof source !== "string" || !source.isWellFormed() || Buffer.byteLength(source) > maximum) throw Error("invalid");
  let at = 0, nodes = 0;
  const ws = () => { while (/[\x20\t\r\n]/.test(source[at] ?? "!")) at++; };
  const string = () => { const start = at++; while (at < source.length) { const c = source[at++]; if (c === "\\") at++;
    else if (c === '"') { const value = JSON.parse(source.slice(start, at)); if (!value.isWellFormed()) throw Error("invalid"); return value; } } throw Error("invalid"); };
  const visit = depth => {
    if (depth > 16 || ++nodes > 16384) throw Error("invalid"); ws(); const c = source[at]; if (c === '"') { string(); return; }
    if (c === "{" || c === "[") { at++; ws(); const end = c === "{" ? "}" : "]", seen = new Set(); if (source[at] === end) { at++; return; }
      while (at < source.length) { ws(); if (c === "{") { if (source[at] !== '"') throw Error("invalid"); const key = string();
        if (seen.has(key) || ["__proto__", "prototype", "constructor"].includes(key)) throw Error("invalid"); seen.add(key); ws(); if (source[at++] !== ":") throw Error("invalid"); }
        visit(depth + 1); ws(); const separator = source[at++]; if (separator === end) return; if (separator !== ",") throw Error("invalid"); } throw Error("invalid"); }
    for (const literal of ["true", "false", "null"]) if (source.startsWith(literal, at)) { at += literal.length; return; }
    const numeric = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(at)); if (!numeric || !Number.isFinite(Number(numeric[0]))) throw Error("invalid"); at += numeric[0].length;
  };
  visit(0); ws(); if (at !== source.length) throw Error("invalid"); return JSON.parse(source);
}
function receiptValid(value, frame) {
  if (!exact(value, ["format", "scope", "run_id", "call_id", "input_digest", "authority_basis_digest", "native", "formal_agent_execution_enabled"]) ||
    value.format !== "cimiloop/workspace-tool-receipt/1.0.0" || value.scope !== "authorized_workspace" || typeof value.run_id !== "string" || value.call_id !== frame.call_id ||
    !sha(value.input_digest) || !sha(value.authority_basis_digest) || value.formal_agent_execution_enabled !== false) return false;
  const native = value.native;
  return exact(native, ["format", "phase", "nonce", "input_digest", "root_identity", "file_identity", "replacement_identity", "before_digest", "worker", "after_digest", "after_file_identity", "text"]) &&
    native.format === "cimiloop/workspace-native/1.0.0" && native.phase === "completed" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(native.nonce) &&
    native.input_digest === value.input_digest && native.before_digest === frame.expected_digest && identity(native.root_identity) && identity(native.file_identity) && worker(native.worker) && identity(native.after_file_identity) &&
    (frame.tool === "read_file" ? native.replacement_identity === null && typeof native.text === "string" && Buffer.byteLength(native.text) <= 16384 &&
      hash(native.text) === frame.expected_digest && native.after_digest === frame.expected_digest && same(native.file_identity, native.after_file_identity) :
      native.text === null && identity(native.replacement_identity) && same(native.replacement_identity, native.after_file_identity) && native.after_digest === hash(frame.replacement_utf8));
}
export const exchangeAgentWorkspaceToolFrame = (pipe, request, signal) => new Promise((done, fail) => {
  let frame, payload;
  try {
    payload = Buffer.from(JSON.stringify(request)); frame = json(payload.toString("utf8"));
    if (!/^\\\\\.\\pipe\\CimiLoop\.AgentWorkspace\.[a-f0-9-]{36}$/.test(pipe) || payload.length < 1 || payload.length > maximum || signal?.aborted ||
      !exact(frame, ["format", "scope_digest", "call_id", "tool", "path", "expected_digest", ...(frame.tool === "replace_file" ? ["replacement_utf8"] : [])]) ||
      frame.format !== "cimiloop/agent-workspace-tool-request/1.0.0" || !sha(frame.scope_digest) || typeof frame.call_id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(frame.call_id) ||
      !["read_file", "replace_file"].includes(frame.tool) || typeof frame.path !== "string" || !sha(frame.expected_digest) || frame.tool === "replace_file" &&
      (typeof frame.replacement_utf8 !== "string" || Buffer.byteLength(frame.replacement_utf8) > 16384)) throw Error("invalid");
  } catch { fail(Error("agent_ipc_request_denied")); return; }
  const requestDigest = hash(payload); let buffered = Buffer.alloc(0), settled = false;
  const socket = createConnection({ path: pipe });
  const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); socket.destroy(); if (error) fail(error); else done(value); };
  const abort = () => finish(Error("agent_ipc_aborted")), timer = setTimeout(() => finish(Error("agent_ipc_timeout")), 22000);
  signal?.addEventListener("abort", abort, { once: true });
  socket.once("connect", () => { const header = Buffer.alloc(4); header.writeUInt32LE(payload.length); socket.write(Buffer.concat([header, payload])); });
  socket.on("data", bytes => {
    buffered = Buffer.concat([buffered, bytes]); if (buffered.length > maximum + 4) { finish(Error("agent_ipc_reply_limit")); return; }
    if (buffered.length < 4) return; const length = buffered.readUInt32LE();
    if (!length || length > maximum) { finish(Error("agent_ipc_reply_limit")); return; } if (buffered.length < length + 4) return;
    try {
      if (buffered.length !== length + 4) throw Error("invalid"); const reply = json(new TextDecoder("utf-8", { fatal: true }).decode(buffered.subarray(4)));
      if (!exact(reply, ["format", "scope_digest", "request_digest", "call_id", "outcome", "receipt", "replay", "reason", "formal_agent_execution_enabled"]) ||
        reply.format !== "cimiloop/agent-workspace-tool-reply/1.0.0" || reply.scope_digest !== frame.scope_digest || reply.request_digest !== requestDigest || reply.formal_agent_execution_enabled !== false ||
        typeof reply.replay !== "boolean" || !(reply.outcome === "completed" && reply.call_id === frame.call_id && reply.reason === null && receiptValid(reply.receipt, frame) ||
          reply.outcome === "denied" && [null, frame.call_id].includes(reply.call_id) && reply.receipt === null && reply.replay === false && typeof reply.reason === "string" && /^[a-z_]{1,96}$/.test(reply.reason))) throw Error("invalid");
      finish(null, reply);
    } catch { finish(Error("agent_ipc_reply_unproven")); }
  });
  socket.once("end", () => { if (!settled) finish(Error("agent_ipc_reply_missing")); }); socket.once("error", () => finish(Error("agent_ipc_unavailable")));
});

// The admitted Runtime composition pins this module and supplies one immutable
// endpoint. A lost reply leaves the original call ID available for explicit
// reconciliation/replay; generating a fresh ID here could repeat an effect.
export const createAgentWorkspaceToolClient = endpoint => {
  const pipe = endpoint.pipe, scopeDigest = endpoint.scope_digest;
  return Object.freeze({ execute: (args, signal) => {
    if (!exact(args, ["call_id", "tool", "path", "expected_digest", ...(args?.tool === "replace_file" ? ["replacement_utf8"] : [])])) return Promise.reject(Error("agent_ipc_request_denied"));
    return exchangeAgentWorkspaceToolFrame(pipe, { ...args, format: "cimiloop/agent-workspace-tool-request/1.0.0", scope_digest: scopeDigest }, signal);
  } });
};
