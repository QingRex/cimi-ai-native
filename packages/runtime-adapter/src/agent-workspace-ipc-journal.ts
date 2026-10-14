import {parseAgentParentSkillIpcRequest,parseAgentParentSkillIpcReceipt} from "./agent-parent-skill-ipc.js";
import { mkdirSync, writeFileSync, openSync, fsyncSync, closeSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { assertOrdinaryPath, directory, bytesAt, digest, RuntimeAdapterError } from "./files.js";
import { parseAgentWorkspaceToolScope, type AgentWorkspaceToolScope } from "./agent-workspace-authority.js";
import { validWorkspaceWorkerIdentity } from "./workspace-files.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import { copyToolJson, TOOL_RECORD_BYTES } from "./tool-journal.js";
import type { AgentWorkspaceIpcEndpoint } from "./agent-workspace-ipc.js";
import { rememberOriginalObservation } from "./runtime-binary-originals.js";

const exact = (v: unknown, keys: string[]): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join(",") === [...keys].sort().join(",");
const sha = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const id = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
const scopeDigest = (scope: AgentWorkspaceToolScope) => digest(JSON.stringify(scope)).value;
function fail(): never { throw new RuntimeAdapterError("agent_ipc_originals_unproven"); }
const json = (bytes: Buffer, maximum = TOOL_RECORD_BYTES) => copyToolJson(parseGatewayJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes), maximum));
const save = (path: string, bytes: Buffer) => { if (!bytes.length || bytes.length > TOOL_RECORD_BYTES) fail(); assertOrdinaryPath(path); writeFileSync(path, bytes, { flag: "wx" }); const fd = openSync(path, "r+"); try { fsyncSync(fd); } finally { closeSync(fd); } };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
function location(root: string, scope: AgentWorkspaceToolScope, nonce: string) { if (!uuid(nonce)) fail(); return join(root, "agent-workspace-ipc-originals", scope.project_id, scope.run_id, nonce); }
function endpoint(raw: unknown, scope: AgentWorkspaceToolScope, nonce: string, parent=false): AgentWorkspaceIpcEndpoint {
  const value = copyToolJson(raw);
  if (!exact(value, ["pipe", "scope_digest", "check_catalog_digest", "peer", "supervisor", "appcontainer_sid", ...(value && typeof value === "object" && "model_admission_digest" in value ? ["model_admission_digest"] : []),...(parent?["parent_skill_catalog_digest"]:[])]) || parent&&(!sha(value.parent_skill_catalog_digest)||!sha(value.model_admission_digest)||!sha(value.check_catalog_digest)) || value.model_admission_digest !== undefined && !sha(value.model_admission_digest) || value.pipe !== `\\\\.\\pipe\\CimiLoop.AgentWorkspace.${nonce}` ||
    value.scope_digest !== scopeDigest(scope) || value.check_catalog_digest !== null && !sha(value.check_catalog_digest) || !validWorkspaceWorkerIdentity(value.peer) ||
    !validWorkspaceWorkerIdentity(value.supervisor) || value.peer.pid === value.supervisor.pid && !isDeepStrictEqual(value.peer, value.supervisor) || value.appcontainer_sid !== null &&
    (typeof value.appcontainer_sid !== "string" || !/^S-1-15-2-(?:[0-9]+-)*[0-9]+$/.test(value.appcontainer_sid))) fail();
  return value as unknown as AgentWorkspaceIpcEndpoint;
}

// Trusted OS-authenticated host only. Durability precedes tool dispatch and
// reply transmission; stored replies do not assert Runtime receipt/delivery.
export class AgentWorkspaceIpcJournal {
  private ordinal = 0;
  private readonly tickets = new Set<object>();
  private readonly header: Buffer;
  private constructor(readonly path: string, header: unknown) { this.header = encode(header); save(join(path, "header.json"), this.header); }
  static create(root: string, rawScope: unknown, rawEndpoint: unknown, nonce: string, transportDigest: string) {
    const scope = parseAgentWorkspaceToolScope(rawScope),copiedEndpoint=copyToolJson(rawEndpoint),parent=!!copiedEndpoint&&typeof copiedEndpoint==="object"&&"parent_skill_catalog_digest" in copiedEndpoint, original = endpoint(copiedEndpoint, scope, nonce,parent);
    if (!sha(transportDigest)) fail();
    root = directory(root); directory(join(root, "agent-workspace-ipc-originals", scope.project_id, scope.run_id));
    const path = assertOrdinaryPath(location(root, scope, nonce)); mkdirSync(path);
    return new AgentWorkspaceIpcJournal(path, { format: parent?"cimiloop/agent-workspace-ipc-originals/2.0.0":"cimiloop/agent-workspace-ipc-originals/1.0.0", scope, endpoint: original, nonce,
      transport_digest: transportDigest, maximum_exchanges: 128, formal_agent_execution_enabled: false });
  }
  private original() { if (!bytesAt(join(this.path, "header.json"), TOOL_RECORD_BYTES).equals(this.header)) fail(); }
  request(raw: Buffer, requestDigest: string) {
    this.original(); const bytes = Buffer.from(raw);
    if (++this.ordinal > 128 || digest(bytes).value !== requestDigest) fail();
    const ordinal = String(this.ordinal).padStart(4, "0"), path = assertOrdinaryPath(join(this.path, ordinal)); mkdirSync(path);
    save(join(path, "request.raw"), bytes);
    save(join(path, "request.json"), encode({ ordinal, digest: requestDigest }));
    const ticket = Object.freeze({ ordinal, path, request_digest: requestDigest }); this.tickets.add(ticket); return ticket;
  }
  // Only a ticket minted by this original journal and still awaiting its reply
  // may be read in the host's current request window. Bind complete immutable
  // header bytes, not just a repeated nonce/scope in a substituted header.
  readPendingRequest(ticket:ReturnType<AgentWorkspaceIpcJournal['request']>):unknown {
    this.original();if(!this.tickets.has(ticket))fail();
    const bytes=bytesAt(join(ticket.path,'request.raw'),TOOL_RECORD_BYTES),metadata=json(bytesAt(join(ticket.path,'request.json'),1024),1024);
    if(!exact(metadata,['ordinal','digest'])||metadata.ordinal!==ticket.ordinal||metadata.digest!==ticket.request_digest||digest(bytes).value!==ticket.request_digest)fail();
    const value=json(bytes);this.original();if(!this.tickets.has(ticket))fail();return value;
  }
  reply(ticket: ReturnType<AgentWorkspaceIpcJournal["request"]>, raw: Buffer) {
    this.original(); if (!this.tickets.has(ticket)) fail(); const bytes = Buffer.from(raw);
    save(join(ticket.path, "reply.raw"), bytes); save(join(ticket.path, "reply.json"), encode({ ordinal: ticket.ordinal, digest: digest(bytes).value }));
    this.tickets.delete(ticket);
  }
}

export function readAgentWorkspaceIpcOriginals(root: string, rawScope: unknown, nonce: string) {
  return rememberOriginalObservation("ipc\0"+root+"\0"+nonce+"\0"+JSON.stringify(rawScope),()=>readAgentWorkspaceIpcOriginalsNow(root,rawScope,nonce));
}
function readAgentWorkspaceIpcOriginalsNow(root: string, rawScope: unknown, nonce: string) {
  root = assertOrdinaryPath(root); const scope = parseAgentWorkspaceToolScope(rawScope), path = assertOrdinaryPath(location(root, scope, nonce));
  if (!existsSync(path)) return { status: "Unknown" as const, reason: "agent_ipc_original_registration_missing", path, header: null, exchanges: [], unresolved: 0, artifacts: [], formal_agent_execution_enabled: false as const };
  const headerBytes = bytesAt(join(path, "header.json"), TOOL_RECORD_BYTES), header = json(headerBytes);
  if (!exact(header, ["format", "scope", "endpoint", "nonce", "transport_digest", "maximum_exchanges", "formal_agent_execution_enabled"]) ||
    !["cimiloop/agent-workspace-ipc-originals/1.0.0","cimiloop/agent-workspace-ipc-originals/2.0.0"].includes(String(header.format)) || !isDeepStrictEqual(parseAgentWorkspaceToolScope(header.scope), scope) || header.nonce !== nonce ||
    !sha(header.transport_digest) || header.maximum_exchanges !== 128 || header.formal_agent_execution_enabled !== false) fail();
  const originalEndpoint = endpoint(header.endpoint, scope, nonce,header.format==="cimiloop/agent-workspace-ipc-originals/2.0.0"), names = readdirSync(path).filter(name => name !== "header.json").sort();
  if (names.length > 128 || names.some((name, i) => name !== String(i + 1).padStart(4, "0"))) fail();
  const artifacts = [{ name: "header.json", path: join(path, "header.json"), digest: digest(headerBytes).value }];
  const exchanges: { ordinal: string; request_digest: string | null; reply_digest: string | null; request: unknown; reply: unknown; state: "reply_recorded" | "unknown" }[] = [];
  for (const ordinal of names) {
    const slot = assertOrdinaryPath(join(path, ordinal)), files = readdirSync(slot);
    if (files.some(file => !["request.raw", "request.json", "reply.raw", "reply.json"].includes(file)) || files.includes("reply.json") && !files.includes("request.json") ||
      files.includes("reply.raw") && !files.includes("request.json")) fail();
    const readBody = (kind: "request" | "reply") => {
      const raw = join(slot, kind + ".raw"), meta = join(slot, kind + ".json");
      if (!existsSync(meta)) { if (existsSync(raw)) { const bytes = bytesAt(raw, TOOL_RECORD_BYTES); artifacts.push({ name: ordinal + "/" + kind + ".raw", path: raw, digest: digest(bytes).value }); } return null; }
      const bytes = bytesAt(raw, TOOL_RECORD_BYTES), metadataBytes = bytesAt(meta, 1024), metadata = json(metadataBytes, 1024);
      if (!exact(metadata, ["ordinal", "digest"]) || metadata.ordinal !== ordinal || metadata.digest !== digest(bytes).value) fail();
      artifacts.push({ name: ordinal + "/" + kind + ".raw", path: raw, digest: digest(bytes).value }, { name: ordinal + "/" + kind + ".json", path: meta, digest: digest(metadataBytes).value });
      return { bytes, digest: metadata.digest as string };
    };
    const requestBody = readBody("request"), replyBody = readBody("reply"); let request: unknown = null, reply: unknown = null;
    if (requestBody) { try { request = json(requestBody.bytes); } catch { /* Original rejected input is retained as bytes. */ } }
    if (replyBody) {
      reply = json(replyBody.bytes);
      const frame = request as Record<string, unknown> | null;
      if (!requestBody || !exact(reply, ["format", "scope_digest", "request_digest", "call_id", "outcome", "receipt", "replay", "reason", "formal_agent_execution_enabled"]) ||
        reply.format !== "cimiloop/agent-workspace-tool-reply/1.0.0" || reply.scope_digest !== originalEndpoint.scope_digest || reply.request_digest !== requestBody.digest ||
        reply.formal_agent_execution_enabled !== false || typeof reply.replay !== "boolean" || !(reply.outcome === "completed" && frame && id(frame.call_id) &&
          reply.call_id === frame.call_id && reply.reason === null && reply.receipt && typeof reply.receipt === "object" ||
          reply.outcome === "denied" && reply.receipt === null && reply.replay === false && (reply.call_id === null || frame && reply.call_id === frame.call_id) &&
          typeof reply.reason === "string" && /^[a-z_]{1,96}$/.test(reply.reason))) fail();
    }
    if(replyBody&&request&&typeof request==="object"&&"tool" in request&&request.tool==="run_skill"&&(reply as Record<string,unknown>).outcome==="completed"){
      const frame=request as Record<string,unknown>;
      const catalogDigest=originalEndpoint.parent_skill_catalog_digest;
      if(header.format!=="cimiloop/agent-workspace-ipc-originals/2.0.0"||!sha(catalogDigest)||frame.catalog_digest!==catalogDigest)fail();
      const call=parseAgentParentSkillIpcRequest(frame,{scope_digest:originalEndpoint.scope_digest,catalog_digest:catalogDigest,entries:[{skill_alias:String(frame.skill_alias),method_name:String(frame.method_name),input_alias:String(frame.input_alias)}]});
      parseAgentParentSkillIpcReceipt((reply as Record<string,unknown>).receipt,call);
    }
    exchanges.push({ ordinal, request_digest: requestBody?.digest ?? null, reply_digest: replyBody?.digest ?? null, request, reply, state: requestBody && replyBody ? "reply_recorded" : "unknown" });
  }
  if (!bytesAt(join(path, "header.json"), TOOL_RECORD_BYTES).equals(headerBytes) || !isDeepStrictEqual(readdirSync(path).filter(name => name !== "header.json").sort(), names)) fail();
  return { status: "Observed" as const, reason: "agent_ipc_original_bytes_read", path, header: { ...header, format:String(header.format) as "cimiloop/agent-workspace-ipc-originals/1.0.0"|"cimiloop/agent-workspace-ipc-originals/2.0.0", scope, endpoint: originalEndpoint }, exchanges,
    unresolved: exchanges.filter(exchange => exchange.state === "unknown").length, artifacts, formal_agent_execution_enabled: false as const };
}

// Correlates actual SDK identities, arguments and output projection to original
// IPC bytes. This does not qualify a model/account or replace the native ledger.
export function correlateAgentWorkspaceSdkOriginals(originals: ReturnType<typeof readAgentWorkspaceIpcOriginals>, stdout: Buffer) {
  if (stdout.length > 4 * 1024 * 1024) fail();
  const parentEnabled=originals.header?.format==="cimiloop/agent-workspace-ipc-originals/2.0.0";
  const parts = new Map<string, Record<string, unknown>>();
  for (const line of new TextDecoder("utf-8", { fatal: true }).decode(stdout).split(/\r?\n/)) {
    if (!line.trim().startsWith("{")) continue;
    const event = json(Buffer.from(line), 2 * 1024 * 1024) as Record<string, unknown>;
    if (!event || event.type !== "tool_use") continue;
    const part = event.part as Record<string, unknown>;
    if (!part || !id(part.sessionID) || part.sessionID !== event.sessionID || !id(part.messageID) || !id(part.callID) || !["cimi_read", "cimi_replace", "cimi_check","cimi_invoke_skill","cimi_read_method_resource",...(parentEnabled?["cimi_run_skill"]:[])].includes(String(part.tool))) fail();
    const callId = "sdk_" + digest(JSON.stringify([part.sessionID, part.messageID, part.callID])).value;
    if (parts.has(callId) || parts.size >= 128) fail(); parts.set(callId, part);
  }
  const links = originals.exchanges.filter(exchange => !(exchange.request && typeof exchange.request === "object" && "tool" in exchange.request && exchange.request.tool === "model_step")).map(exchange => {
    const request = exchange.request as Record<string, unknown> | null, reply = exchange.reply as Record<string, unknown> | null, part = request && parts.get(String(request.call_id));
    let correlated = false;
    if (request && reply && part && request.scope_digest === (originals.header?.endpoint as AgentWorkspaceIpcEndpoint).scope_digest) {
      const state = part.state as Record<string, unknown>, tool = ({ read_file: "cimi_read", replace_file: "cimi_replace", run_check: "cimi_check",invoke_skill:"cimi_invoke_skill",read_method_resource:"cimi_read_method_resource",run_skill:"cimi_run_skill" } as Record<string, string>)[String(request.tool)];
      const named=["invoke_skill","read_method_resource"].includes(String(request.tool));
      const parent=request.tool==="run_skill"&&parentEnabled;
      const args = parent?{skill_alias:request.skill_alias,method_name:request.method_name,input_alias:request.input_alias}:named?{[request.tool==="invoke_skill"?"name":"path"]:request.argument}:request.tool === "run_check" ? { check_id: request.check_id } : { path: request.path, expected_digest: request.expected_digest, ...(request.tool === "replace_file" ? { replacement_utf8: request.replacement_utf8 } : {}) };
      if (state && part.tool === tool && isDeepStrictEqual(state.input, args)) {
        if (reply.outcome === "denied") correlated = state.status === "error" && typeof state.error === "string" && state.error.includes(String(reply.reason));
        else if (state.status === "completed" && typeof state.output === "string") {
          const receipt = reply.receipt as Record<string, unknown>, native = receipt?.native as Record<string, unknown>;
          const expected = parent?{...receipt,format:"cimiloop/opencode-parent-skill-output/1.0.0",replay:reply.replay}:named?{...receipt,replay:reply.replay}:request.tool === "run_check" ? { format: receipt.format==="cimiloop/workspace-check-receipt/2.0.0" ? "cimiloop/opencode-check-output/2.0.0" : "cimiloop/opencode-check-output/1.0.0", ...(receipt.format==="cimiloop/workspace-check-receipt/2.0.0"?{source_basis_digest:receipt.source_basis_digest}:{}), call_id: request.call_id, check_id: request.check_id,
            check_catalog_digest: request.check_catalog_digest, outcome: receipt.outcome, exit_code: receipt.exit_code, reason: receipt.reason, source_digest: receipt.source_digest,
            stdout_digest: receipt.stdout_digest, stderr_digest: receipt.stderr_digest, replay: reply.replay, formal_agent_execution_enabled: false } :
            native ? { format: "cimiloop/opencode-workspace-output/1.0.0", call_id: request.call_id, tool: request.tool, path: request.path, before_digest: native.before_digest,
              after_digest: native.after_digest, text: native.text, replay: reply.replay, formal_agent_execution_enabled: false } : null;
          try { correlated = (parent?receipt?.scope_digest===request.scope_digest&&receipt?.catalog_digest===request.catalog_digest&&request.catalog_digest===originals.header?.endpoint.parent_skill_catalog_digest:named?receipt?.scope_digest===request.scope_digest&&receipt?.profile_digest===request.profile_digest:receipt?.run_id === (originals.header?.scope as AgentWorkspaceToolScope).run_id) && receipt.call_id === request.call_id &&
            isDeepStrictEqual(json(Buffer.from(state.output)), expected); } catch { correlated = false; }
        }
      }
    }
    return { ordinal: exchange.ordinal, call_id: request && id(request.call_id) ? request.call_id : null, correlated,
      sdk: correlated && part ? { session_id: part.sessionID, message_id: part.messageID, call_id: part.callID } : null };
  });
  const used = new Set(links.filter(link => link.correlated).map(link => link.call_id));
  return { format: parentEnabled?"cimiloop/agent-sdk-ipc-correlation/2.0.0" as const:"cimiloop/agent-sdk-ipc-correlation/1.0.0" as const, stdout_digest: digest(stdout).value, links,
    uncorrelated_exchanges: links.filter(link => !link.correlated).length, unmatched_sdk_calls: [...parts.keys()].filter(key => !used.has(key)).length,
    model_account_custody_proven: false as const, native_effect_reverified: false as const, formal_agent_execution_enabled: false as const };
}
