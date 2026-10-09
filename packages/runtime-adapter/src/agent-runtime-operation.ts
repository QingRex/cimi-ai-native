import { readAgentRuntimeModelOriginals } from "./agent-runtime-model.js";
import {readRuntimeBinaryOriginal} from "./runtime-binary-originals.js";
import { mkdirSync, writeFileSync, openSync, fsyncSync, closeSync, existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { parseAgentWorkspaceToolScope, type AgentWorkspaceToolScope } from "./agent-workspace-authority.js";
import { agentWorkspaceIpcScopeDigest } from "./agent-workspace-ipc.js";
import { validWorkspaceWorkerIdentity } from "./workspace-files.js";
import { bytesAt, digest, directory, assertOrdinaryPath, rawReference, RuntimeAdapterError } from "./files.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import { copyToolJson } from "./tool-journal.js";
import { buildWindowsLauncher, nativeControl } from "./native.js";
import { recoverOpenCodeWorkspaceToolRehearsal, readOriginalAgentWorkspaceOperation } from "./agent-workspace-sandbox-recovery.js";
import type { CreditProcessIdentity } from "./gateway-credit.js";
import { readAgentWorkspaceIpcOriginals, correlateAgentWorkspaceSdkOriginals } from "./agent-workspace-ipc-journal.js";
import type { Project, AgentRunRecord } from "@cimiloop/protocol/v2";
import { readAgentRuntimeNativeResult } from "./agent-runtime-result.js";

interface Claim { format: "cimiloop/agent-runtime-operation-claim/1.0.0"; scope: AgentWorkspaceToolScope; input_digest: string; operation_id: string; owner: CreditProcessIdentity; synthetic_model_responses: true | null; formal_agent_execution_enabled: false }
const exact = (raw: unknown, keys: string[]): raw is Record<string, unknown> => !!raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).sort().join(",") === [...keys].sort().join(",");
const sha = (raw: unknown): raw is string => typeof raw === "string" && /^[a-f0-9]{64}$/.test(raw);
const uuid = (raw: unknown): raw is string => typeof raw === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(raw);
const fail = (reason: string): never => { throw new RuntimeAdapterError(reason); };
const read = (path: string) => copyToolJson(parseGatewayJson(bytesAt(path, 65536).toString("utf8"), 65536));
const save = (path: string, value: unknown) => { writeFileSync(path, JSON.stringify(value), { flag: "wx" }); const fd = openSync(path, "r+"); try { fsyncSync(fd); } finally { closeSync(fd); } };
function paths(root: string, scope: AgentWorkspaceToolScope) {
  return { run: join(root, "agent-runtime-claims", scope.project_id, "runs", scope.run_id), key: join(root, "agent-runtime-claims", scope.project_id, "keys", scope.operation_key) };
}
function load(root: string, rawScope: unknown) {
  root = assertOrdinaryPath(root);
  const scope = parseAgentWorkspaceToolScope(rawScope), location = paths(root, scope), raw = read(join(location.run, "claim.json"));
  if (!exact(raw, ["format", "scope", "input_digest", "operation_id", "owner", "synthetic_model_responses", "formal_agent_execution_enabled"]) ||
    raw.format !== "cimiloop/agent-runtime-operation-claim/1.0.0" || !sha(raw.input_digest) || !uuid(raw.operation_id) || !validWorkspaceWorkerIdentity(raw.owner) ||
    (raw.synthetic_model_responses !== true && raw.synthetic_model_responses !== null) || raw.formal_agent_execution_enabled !== false || !isDeepStrictEqual(parseAgentWorkspaceToolScope(raw.scope), scope)) fail("agent_runtime_claim_unproven");
  const claim = raw as unknown as Claim, key = read(join(location.key, "original.json"));
  if (digest(bytesAt(join(location.run, "input.json"), 65536)).value !== claim.input_digest) fail("agent_runtime_input_unproven");
  const input=read(join(location.run,"input.json")) as Record<string,unknown>,configPath=join(root,"workspace-tool-rehearsals",claim.operation_id,"original-config.json");
  if(input&&typeof input==="object"&&"binary_original" in input&&existsSync(configPath)){
    const config=read(configPath) as Record<string,unknown>,proof=input.binary_original as ReturnType<typeof readRuntimeBinaryOriginal>;
    if(!proof||config.binary!==proof.path||!isDeepStrictEqual(config.binary_original,proof))fail("agent_runtime_binary_original_unproven");
  }
  if (!exact(key, ["run_id", "operation_id", "scope_digest", "input_digest"]) || key.run_id !== scope.run_id || key.operation_id !== claim.operation_id ||
    key.scope_digest !== agentWorkspaceIpcScopeDigest(scope) || key.input_digest !== claim.input_digest) fail("agent_runtime_key_unproven");
  return { claim, location, operation: join(root, "workspace-tool-rehearsals", claim.operation_id) };
}
// No Run is started here. This original claim precedes native process creation.
// Incomplete or conflicting claims are retained; there is no reset/restart API.
// Read-only identity for an original observation. It grants no live process,
// tool, model or billing authority, and never repairs a partial claim.
export function readAgentRuntimeOriginalIdentity(root: string, rawScope: unknown) {
  const original = load(root, rawScope), input = read(join(original.location.run, "input.json"));
  if(input&&typeof input==="object"&&"binary_original" in input){
    const proof=input.binary_original as ReturnType<typeof readRuntimeBinaryOriginal>;
    if(!proof||!isDeepStrictEqual(readRuntimeBinaryOriginal(root,proof.path,proof.sha),proof))fail("agent_runtime_binary_original_unproven");
  }
  const value = { scope: original.claim.scope, operation: original.operation, operation_id: original.claim.operation_id, claim: original.claim, input };
  if (!isDeepStrictEqual(load(root, rawScope).claim, original.claim)) fail("agent_runtime_claim_changed");
  return structuredClone({ ...value, identity_digest: digest(JSON.stringify(value)) });
}
// Only an explicit ENOENT for BOTH original identities permits a first claim.
// Unreadable/partial/foreign registrations remain Unknown, never "not found".
export function inspectAgentRuntimeOriginalRegistration(root: string, rawScope: unknown) {
  const scope = parseAgentWorkspaceToolScope(rawScope);
  try {
    root = assertOrdinaryPath(root); const location = paths(root, scope);
    const present = (path: string) => {
      assertOrdinaryPath(path);
      try { lstatSync(path); return true; }
      catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false; throw error; }
    };
    if (!present(location.run) && !present(location.key)) return { status: "absent" as const };
    return { status: "original" as const, identity: readAgentRuntimeOriginalIdentity(root, scope) };
  } catch { return { status: "unknown" as const, reason: "agent_runtime_registration_unproven" }; }
}
export function claimAgentRuntimeOperation(root: string, rawScope: unknown, input: unknown, owner: CreditProcessIdentity) {
  const scope = parseAgentWorkspaceToolScope(rawScope), originalInput = copyToolJson(input), inputDigest = digest(JSON.stringify(originalInput)).value;
  if (Buffer.byteLength(JSON.stringify(originalInput)) > 65536) fail("agent_runtime_input_limit");
  if (!validWorkspaceWorkerIdentity(owner)) fail("agent_runtime_owner_unproven");
  root = directory(root); const location = paths(root, scope);
  directory(join(root, "agent-runtime-claims", scope.project_id, "runs")); directory(join(root, "agent-runtime-claims", scope.project_id, "keys"));
  try { mkdirSync(location.run); } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
    if (!existsSync(join(location.run, "claim.json"))) fail("agent_runtime_claim_incomplete");
    const original = load(root, scope); if (original.claim.input_digest !== inputDigest) fail("agent_runtime_input_conflict");
    fail("agent_runtime_already_claimed");
  }
  // A duplicate key on another Run must not allocate another Runtime. Retain the
  // new incomplete Run claim for explicit reconciliation rather than deleting it.
  try { mkdirSync(location.key); } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
    fail("agent_runtime_operation_key_conflict");
  }
  const claim: Claim = { format: "cimiloop/agent-runtime-operation-claim/1.0.0", scope, input_digest: inputDigest, operation_id: randomUUID(), owner: { ...owner }, synthetic_model_responses: (input as Record<string, unknown>).purpose === "agent_runtime" ? null : true, formal_agent_execution_enabled: false };
  save(join(location.key, "original.json"), { run_id: scope.run_id, operation_id: claim.operation_id, scope_digest: agentWorkspaceIpcScopeDigest(scope), input_digest: inputDigest });
  save(join(location.run, "input.json"), originalInput); save(join(location.run, "claim.json"), claim);
  return { operation: join(root, "workspace-tool-rehearsals", claim.operation_id), claimDirectory: location.run, operationId: claim.operation_id };
}
export function agentRuntimeCancellationRequested(root: string, rawScope: unknown): boolean {
  const original = load(root, rawScope), path = join(original.location.run, "cancel.json"); if (!existsSync(path)) return false;
  const marker = read(path);
  if (!exact(marker, ["format", "operation_id", "scope_digest"]) || marker.format !== "cimiloop/agent-runtime-cancel/1.0.0" ||
    marker.operation_id !== original.claim.operation_id || marker.scope_digest !== agentWorkspaceIpcScopeDigest(original.claim.scope)) fail("agent_runtime_cancellation_unproven");
  return true;
}
export function requestAgentRuntimeCancellation(root: string, rawScope: unknown) {
  const original = load(root, rawScope), path = join(original.location.run, "cancel.json");
  try { save(path, { format: "cimiloop/agent-runtime-cancel/1.0.0", operation_id: original.claim.operation_id, scope_digest: agentWorkspaceIpcScopeDigest(original.claim.scope) }); }
  catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error; }
  if (!agentRuntimeCancellationRequested(root, rawScope)) fail("agent_runtime_cancellation_unproven");
  return { requested: true as const, operation: original.operation, stopped_proven: false as const, formal_agent_execution_enabled: false as const };
}
export async function queryAgentRuntimeOperation(root: string, rawScope: unknown) {
  const original = load(root, rawScope), scopeDigest = agentWorkspaceIpcScopeDigest(original.claim.scope), launcherPath = join(original.operation, "original-launcher.json"), resourcesPath = join(original.operation, "agent-sandbox-resources.json");
  const summary = { operation: original.operation, input_digest: original.claim.input_digest, cancellation_requested: agentRuntimeCancellationRequested(root, rawScope),
    completion_proven: false as const, formal_agent_execution_enabled: false as const, synthetic_model_responses: original.claim.synthetic_model_responses };
  if (!existsSync(launcherPath) || !existsSync(resourcesPath)) return { ...summary, status: "Unknown" as const, reason: "agent_original_registration_missing", resources_disposed: false };
  const checked = readOriginalAgentWorkspaceOperation({ root, operation: original.operation, scope: original.claim.scope });
  if (!checked.launch || !checked.resources) return { ...summary, status: "Unknown" as const, reason: "agent_original_registration_missing", resources_disposed: false };
  const launcher = checked.launch, resources = checked.resources;
  if (!exact(launcher, ["format", "nonce", "owner", "supervisor", "launcher_path", "launcher_digest"]) || launcher.format !== "cimiloop/agent-workspace-launcher/1.0.0" ||
    !validWorkspaceWorkerIdentity(launcher.supervisor) || !isDeepStrictEqual(launcher.owner, original.claim.owner) || !sha(launcher.launcher_digest) ||
    typeof launcher.launcher_path !== "string" || !uuid(launcher.nonce) || !resources || typeof resources !== "object" || Array.isArray(resources)) fail("agent_runtime_original_unproven");
  const ledger = resources as Record<string, unknown>, config = read(join(original.operation, "original-config.json")) as Record<string, unknown>;
  if (ledger.format !== "cimiloop/agent-workspace-resources/1.0.0" || ledger.nonce !== launcher.nonce || ledger.scope_digest !== scopeDigest || config.scope_digest !== scopeDigest ||
    ledger.config_digest !== digest(bytesAt(join(original.operation, "original-config.json"), 65536)).value || !isDeepStrictEqual(ledger.supervisor, launcher.supervisor) ||
    !isDeepStrictEqual(ledger.owner, original.claim.owner) || config.nonce !== launcher.nonce || !isDeepStrictEqual(config.owner, original.claim.owner) ||
    ledger.resources_disposed !== false && ledger.resources_disposed !== true) fail("agent_runtime_original_unproven");
  // OS observation uses the independent pinned identity reader. Persisted phase,
  // heartbeat or a cancellation marker cannot establish that a process is alive.
  const observer = await buildWindowsLauncher(root), inspect = async (identity: CreditProcessIdentity) => {
    const value = (await nativeControl(observer, ["--inspect-identity", JSON.stringify(identity)])).value;
    if (!exact(value, ["state"]) || !["active", "absent", "unknown"].includes(String(value.state))) fail("agent_runtime_identity_unproven"); return (value as Record<string, unknown>).state;
  };
  const supervisorState = await inspect(launcher.supervisor as CreditProcessIdentity), peer = ledger.runtime;
  if (peer !== null && !validWorkspaceWorkerIdentity(peer)) fail("agent_runtime_original_unproven");
  const runtimeState = peer === null ? "unknown" : await inspect(peer as CreditProcessIdentity);
  if (supervisorState === "active" && runtimeState === "active") return { ...summary, status: ledger.phase === "running" ? "Running" as const : "Preparing" as const, reason: "agent_original_processes_active", resources_disposed: false };
  if (ledger.resources_disposed === true && supervisorState === "absent" && (runtimeState === "absent" || peer === null)) {
    const path = join(original.operation, "agent-sandbox-cleanup.json");
    if (existsSync(path)) {
      const cleanup = read(path) as Record<string, unknown>;
      if (cleanup?.format === "cimiloop/agent-workspace-sandbox/1.0.0" && cleanup.phase === "ended" && cleanup.nonce === launcher.nonce && cleanup.resources_disposed === true &&
        Array.isArray(cleanup.cleanup_errors) && cleanup.cleanup_errors.length === 0) return { ...summary, status: "Stopped" as const, reason: "agent_original_resources_disposed", resources_disposed: true };
    }
  }
  return { ...summary, status: "Unknown" as const, reason: "agent_original_state_unproven", resources_disposed: false };
}
export async function recoverAgentRuntimeOperation(root: string, rawScope: unknown) {
  const original = load(root, rawScope);
  if (!existsSync(join(original.operation, "original-config.json"))) return { outcome: "unknown" as const, reason: "agent_original_registration_missing", resources_disposed: false, completion_proven: false as const };
  return recoverOpenCodeWorkspaceToolRehearsal({ root, operation: original.operation, scope: original.claim.scope });
}
export async function collectAgentRuntimeOperation(root: string, rawScope: unknown, nativeInputs?: { project: Project; record: AgentRunRecord }) {
  const original = load(root, rawScope), status = await queryAgentRuntimeOperation(root, rawScope), artifacts = [], missing = [];
  let stdout: Buffer | undefined;
  let native: ReturnType<typeof readAgentRuntimeNativeResult> = { status: "Unknown", reason: "agent_native_original_inputs_missing", matched_calls: 0,
    unmatched_native_calls: 0, unresolved_native_calls: 0, native_effect_reverified: false, model_account_custody_proven: false, formal_agent_execution_enabled: false };
  const files = ["original-config.json", "original-launcher.json", "agent-sandbox-resources.json", "agent-sandbox-original.json", "agent-sandbox-cleanup.json", "stdout.raw", "stderr.raw", "result.json", "incomplete.json"];
  for (const name of files) {
    const path = join(original.operation, name);
    if (!existsSync(path)) { missing.push(name); continue; }
    const bytes = bytesAt(path, 4 * 1024 * 1024);
    if (name === "stdout.raw") stdout = bytes;
    artifacts.push({ name, reference: rawReference(root, bytes, "agent_runtime_original_bytes", name) });
  }
  let ipc: { status: string; reason: string; exchanges: number; unresolved: number; correlation_reason: string; correlation: ReturnType<typeof correlateAgentWorkspaceSdkOriginals> | null } =
    { status: "Unknown", reason: "agent_ipc_original_registration_missing", exchanges: 0, unresolved: 0, correlation_reason: "agent_sdk_originals_missing", correlation: null };
  const configPath = join(original.operation, "original-config.json");
  if (existsSync(configPath)) {
    const config = read(configPath) as Record<string, unknown>;
    if (typeof config.pipe_nonce !== "string") fail("agent_runtime_ipc_original_unproven");
    const originals = readAgentWorkspaceIpcOriginals(root, original.claim.scope, config.pipe_nonce as string);
    if (originals.header) {
      const native = read(join(original.operation, "agent-sandbox-original.json")) as Record<string, unknown>, launch = read(join(original.operation, "original-launcher.json")) as Record<string, unknown>;
      if (native.nonce !== config.nonce || native.phase !== "suspended" || native.appcontainer_sid !== originals.header.endpoint.appcontainer_sid ||
        !isDeepStrictEqual(native.peer, originals.header.endpoint.peer) || !isDeepStrictEqual(native.supervisor, originals.header.endpoint.supervisor) ||
        !isDeepStrictEqual(launch.supervisor, originals.header.endpoint.supervisor)) fail("agent_runtime_ipc_original_unproven");
    }
    for (const artifact of originals.artifacts) {
      const bytes = bytesAt(artifact.path, 4 * 1024 * 1024); if (digest(bytes).value !== artifact.digest) fail("agent_runtime_ipc_original_unproven");
      artifacts.push({ name: "ipc/" + artifact.name, reference: rawReference(root, bytes, "agent_runtime_original_bytes", "ipc/" + artifact.name) });
    }
    let correlation: ReturnType<typeof correlateAgentWorkspaceSdkOriginals> | null = null;
    if (stdout) { try { correlation = correlateAgentWorkspaceSdkOriginals(originals, stdout); } catch { /* Retain bounded raw bytes even if the interrupted SDK stream is incomplete. */ } }
    ipc = { status: originals.status, reason: originals.reason, exchanges: originals.exchanges.length, unresolved: originals.unresolved, correlation,
      correlation_reason: correlation && correlation.links.length > 0 && !correlation.uncorrelated_exchanges && !correlation.unmatched_sdk_calls ? "agent_sdk_originals_correlated" : "agent_sdk_original_correlation_unproven" };
    if (nativeInputs) {
      let catalog: unknown;
      const input = read(join(original.location.run, "input.json")) as Record<string, unknown>;
      try {
        if (input.check_catalog_digest !== null && input.check_catalog_digest !== undefined) {
          const bytes = bytesAt(join(original.operation, "sandbox", "config", "check-catalog.json"), 262144);
          catalog = copyToolJson(parseGatewayJson(bytes.toString("utf8"), 262144));
          if (!catalog || (catalog as Record<string, unknown>).catalog_digest !== input.check_catalog_digest) throw Error("Original check catalog changed");
          artifacts.push({ name: "check-catalog.json", reference: rawReference(root, bytes, "agent_runtime_original_bytes", "check-catalog.json") });
        }
        native = readAgentRuntimeNativeResult(root, nativeInputs.project, nativeInputs.record, original.claim.scope, originals, catalog);
      } catch { native.reason = "agent_native_check_catalog_unproven"; }
    }
  }
  let model: {status:string; reason:string; calls:number; unresolved:number; model_account_custody_proven:false; costs_reconciled:false; formal_agent_execution_enabled:false} | undefined;
  if(original.claim.synthetic_model_responses===null){
    model={status:"Unknown",reason:"agent_model_originals_unproven",calls:0,unresolved:0,model_account_custody_proven:false,costs_reconciled:false,formal_agent_execution_enabled:false};
    try {
      const originals=readAgentRuntimeModelOriginals(root,original.claim.scope);
      const input=read(join(original.location.run,"input.json")) as Record<string,unknown>,config=read(configPath) as Record<string,unknown>;
      const admitted=(input.provider_options as Record<string,unknown>)?.admission_digest;
      const pipe=readAgentWorkspaceIpcOriginals(root,original.claim.scope,String(config.pipe_nonce));
      if(typeof input.prompt!=="string"||originals.task_packet_digest!==digest(input.prompt).value||config.prompt!==input.prompt)fail("agent_model_task_packet_mismatch");
      if(!sha(admitted)||originals.admission_digest!==admitted||(config.provider_options as Record<string,unknown>)?.admission_digest!==admitted||pipe.header?.endpoint.model_admission_digest!==admitted)fail("agent_model_admission_mismatch");
      const steps=pipe.exchanges.filter(exchange=>exchange.request&&typeof exchange.request==="object"&&"tool" in exchange.request&&exchange.request.tool==="model_step");
      const matched=new Set<string>();
      for(const exchange of steps){const request=exchange.request as Record<string,unknown>,reply=exchange.reply as Record<string,unknown>|null;
        const call=originals.calls.find(call=>call.call_id===request.call_id);
        if(!call||!isDeepStrictEqual(call.request,request)||reply?.outcome==="completed"&&!isDeepStrictEqual(call.response,reply.receipt))fail("agent_model_ipc_original_mismatch");matched.add(call!.call_id);
      }
      if(originals.calls.some(call=>!matched.has(call.call_id)))fail("agent_model_ipc_original_mismatch");
      for(const artifact of originals.artifacts){const bytes=bytesAt(artifact.path,114688);if(digest(bytes).value!==artifact.digest)fail("agent_model_original_unproven");artifacts.push({name:"model/"+artifact.name,reference:rawReference(root,bytes,"agent_runtime_original_bytes","model/"+artifact.name)});}
      model={...model,status:originals.status,reason:"agent_model_original_bytes_read",calls:originals.calls.length,unresolved:originals.calls.filter(c=>c.state==="unknown").length};
    } catch { /* Missing originals remain Unknown, never reinitialized here. */ }
  }
  const fresh = load(root, rawScope);
  if (!isDeepStrictEqual(fresh.claim, original.claim)) fail("agent_runtime_claim_changed");
  return { format: "cimiloop/agent-runtime-originals/1.0.0" as const, scope_digest: agentWorkspaceIpcScopeDigest(original.claim.scope), status, artifacts, missing, ipc, native, ...(model ? {model} : {}),
    domain_observation_produced: false as const, formal_agent_execution_enabled: false as const, synthetic_model_responses: original.claim.synthetic_model_responses };
}
