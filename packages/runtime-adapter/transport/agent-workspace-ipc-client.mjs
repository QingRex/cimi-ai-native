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
  if(frame.tool==='run_skill')return exact(value,['format','scope_digest','catalog_digest','call_id','request_digest','invocation_id','invocation_key','observation_id','report_digest','status','output','output_digest','formal_agent_execution_enabled'])&&value.format==='cimiloop/agent-parent-skill-receipt/1.0.0'&&value.scope_digest===frame.scope_digest&&value.catalog_digest===frame.catalog_digest&&value.call_id===frame.call_id&&value.request_digest===hash(JSON.stringify(frame))&&['invocation_id','invocation_key','observation_id'].every(key=>typeof value[key]==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value[key]))&&sha(value.report_digest)&&sha(value.output_digest)&&value.output_digest===hash(JSON.stringify(value.output))&&((value.status==='succeeded'&&value.output&&typeof value.output==='object'&&!Array.isArray(value.output))||(value.status==='failed'&&value.output===null))&&value.formal_agent_execution_enabled===false;

  if (['invoke_skill','read_method_resource'].includes(frame.tool)) return exact(value,['format','scope_digest','profile_digest','call_id','request_digest','function_name','argument','resource_path','resource_digest','text','formal_agent_execution_enabled']) && value.format==='cimiloop/agent-named-method-receipt/1.0.0' && value.scope_digest===frame.scope_digest && value.profile_digest===frame.profile_digest && value.call_id===frame.call_id && value.request_digest===hash(JSON.stringify(frame)) && value.function_name===frame.tool && value.argument===frame.argument && typeof value.resource_path==='string' && sha(value.resource_digest) && typeof value.text==='string' && value.text.isWellFormed() && Buffer.byteLength(value.text)<=50*1024 && hash(value.text)===value.resource_digest && value.formal_agent_execution_enabled===false;
  if (frame.tool === "model_step") return exact(value, ["content", "usage", "finish"]) && Array.isArray(value.content) && value.content.length > 0 && value.content.length <= 8 &&
    exact(value.usage, ["input_tokens", "output_tokens"]) && [value.usage.input_tokens, value.usage.output_tokens].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000) &&
    value.usage.output_tokens <= frame.max_output_tokens && ["stop", "tool_calls"].includes(value.finish);
  if (frame.tool === "run_check") return exact(value, ["format", "input_digest", "run_id", "call_id", "profile", "entry", "outcome", "exit_code", "reason", "stdout_digest", "stderr_digest", "source_digest", "formal_agent_execution_enabled",...(value?.format==="cimiloop/workspace-check-receipt/2.0.0"?["source_basis_digest"]:[])]) &&
    ["cimiloop/workspace-check-receipt/1.0.0","cimiloop/workspace-check-receipt/2.0.0"].includes(value.format) && (value.format!=="cimiloop/workspace-check-receipt/2.0.0"||sha(value.source_basis_digest)) && typeof value.run_id === "string" && value.call_id === frame.call_id &&
    [value.input_digest, value.stdout_digest, value.stderr_digest, value.source_digest].every(sha) && value.formal_agent_execution_enabled === false &&
    ["node_syntax", "node_test"].includes(value.profile) && typeof value.entry === "string" && /\.(?:js|mjs|cjs)$/.test(value.entry) &&
    Number.isSafeInteger(value.exit_code) && ["exited", "timeout", "cancelled", "output_limit"].includes(value.reason) &&
    value.outcome === (value.reason === "exited" && value.exit_code === 0 ? "passed" : "failed");
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
const originalTaskWait=process.env.CIMILOOP_AGENT_TASK_WAIT_MS;
if(originalTaskWait!==undefined&&(!/^[1-9][0-9]*$/.test(originalTaskWait)||!Number.isSafeInteger(Number(originalTaskWait))||Number(originalTaskWait)>3600000))throw Error("agent_ipc_task_deadline_invalid");
const taskWaitDeadline=originalTaskWait===undefined?null:performance.now()+Number(originalTaskWait);
const exchangeFrame = (pipe, request, signal, model, outputProfile) => new Promise((done, fail) => {
  const parentModel=model==='parent_model',parentSkill=model==='parent_skill',method=model==='method'; model=model===true||parentModel;
  let frame, payload;
  try {
    if(outputProfile!==undefined&&(!model||outputProfile!=='bounded_2048/1.0.0'))throw Error('invalid');
    payload = Buffer.from(JSON.stringify(request)); frame = json(payload.toString("utf8"));
    const parentSubset=parentModel&&outputProfile==='bounded_2048/1.0.0'&&frame.format==='cimiloop/agent-runtime-model-request/5.0.0';
    if (!/^\\\\\.\\pipe\\CimiLoop\.AgentWorkspace\.[a-f0-9-]{36}$/.test(pipe) || payload.length < 1 || payload.length > maximum || signal?.aborted ||
      !exact(frame, ["format", "scope_digest", "call_id", "tool", ...(parentSkill ? ["catalog_digest","skill_alias","method_name","input_alias"] : method ? ["profile_digest","argument"] : model ? ["admission_digest", "prompt", "tools", "max_output_tokens"] : frame.tool === "run_check" ? ["check_id", "check_catalog_digest"] : ["path", "expected_digest", ...(frame.tool === "replace_file" ? ["replacement_utf8"] : [])])]) ||
      frame.format !== (parentSkill ? "cimiloop/agent-parent-skill-request/1.0.0" : method ? "cimiloop/agent-runtime-method-request/1.0.0" : model ? `cimiloop/agent-runtime-model-request/${parentSubset?5:outputProfile?(parentModel?4:3):(parentModel?2:1)}.0.0` : "cimiloop/agent-workspace-tool-request/1.0.0") || !sha(frame.scope_digest) || typeof frame.call_id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(frame.call_id) ||
      !(parentSkill ? sha(frame.catalog_digest)&&frame.tool==='run_skill'&&[frame.skill_alias,frame.method_name,frame.input_alias].every(v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(v)) : method ? sha(frame.profile_digest) && ["invoke_skill","read_method_resource"].includes(frame.tool) && typeof frame.argument==='string' && frame.argument.isWellFormed() && frame.argument.length>0 && frame.argument.length<=240 : model ? sha(frame.admission_digest) && frame.tool === "model_step" && Array.isArray(frame.prompt) && Array.isArray(frame.tools) && (parentModel?parentSubset?frame.tools.length>=1&&frame.tools.length<=3&&new Set(frame.tools.map(t=>t?.name)).size===frame.tools.length&&frame.tools.some(t=>t?.name==="cimi_run_skill")&&frame.tools.every(t=>["cimi_read","cimi_replace","cimi_check","cimi_run_skill"].includes(t?.name)):frame.tools.length===4&&new Set(frame.tools.map(t=>t?.name)).size===4&&["cimi_read","cimi_replace","cimi_check","cimi_run_skill"].every(n=>frame.tools.some(t=>t?.name===n)):frame.tools.length<=3&&!frame.tools.some(t=>t?.name==="cimi_run_skill")) && Number.isSafeInteger(frame.max_output_tokens) && frame.max_output_tokens > 0 && frame.max_output_tokens <= (outputProfile?2048:512) : frame.tool === "run_check" ? typeof frame.check_id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(frame.check_id) && sha(frame.check_catalog_digest) :
        ["read_file", "replace_file"].includes(frame.tool) && typeof frame.path === "string" && sha(frame.expected_digest) && (frame.tool !== "replace_file" ||
          typeof frame.replacement_utf8 === "string" && Buffer.byteLength(frame.replacement_utf8) <= 16384))) throw Error("invalid");
  } catch { fail(Error("agent_ipc_request_denied")); return; }
  const wait=taskWaitDeadline===null?125000:Math.ceil(taskWaitDeadline-performance.now());
  if(wait<=0){fail(Error("agent_ipc_task_deadline_exhausted"));return;}
  const requestDigest = hash(payload); let buffered = Buffer.alloc(0), settled = false;
  const socket = createConnection({ path: pipe });
  const finish = (error, value) => { if (settled) return; if(!error&&(signal?.aborted||taskWaitDeadline!==null&&performance.now()>=taskWaitDeadline))error=Error(signal?.aborted?"agent_ipc_aborted":"agent_ipc_task_deadline_exhausted"); settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); socket.destroy(); if (error) fail(error); else done(value); };
  const abort = () => finish(Error("agent_ipc_aborted")), timer = setTimeout(() => finish(Error("agent_ipc_timeout")), wait);
  signal?.addEventListener("abort", abort, { once: true });
  socket.once("connect", () => { if(settled)return;if(signal?.aborted||taskWaitDeadline!==null&&performance.now()>=taskWaitDeadline){finish(Error(signal?.aborted?"agent_ipc_aborted":"agent_ipc_task_deadline_exhausted"));return;}const header = Buffer.alloc(4); header.writeUInt32LE(payload.length); socket.write(Buffer.concat([header, payload])); });
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
  }, check: (args, signal) => {
    if (!exact(args, ["call_id", "check_id", "check_catalog_digest"])) return Promise.reject(Error("agent_ipc_request_denied"));
    return exchangeAgentWorkspaceToolFrame(pipe, { ...args, tool: "run_check", format: "cimiloop/agent-workspace-tool-request/1.0.0", scope_digest: scopeDigest }, signal);
  } });
};

export const exchangeAgentWorkspaceToolFrame = (pipe, request, signal) => exchangeFrame(pipe, request, signal, false);
export const exchangeAgentWorkspaceModelFrame = (pipe, request, signal, outputProfile) => exchangeFrame(pipe, request, signal, true, outputProfile);
export const exchangeAgentParentSkillModelFrame=(pipe,request,signal,outputProfile)=>exchangeFrame(pipe,request,signal,"parent_model",outputProfile);

export const exchangeAgentNamedMethodFrame = (pipe,request,signal)=>exchangeFrame(pipe,request,signal,'method');

// Explicit parent child-call frame; older file/model/named-method parsers keep their meaning.
export const exchangeAgentParentSkillFrame=(pipe,request,signal)=>exchangeFrame(pipe,request,signal,'parent_skill');
