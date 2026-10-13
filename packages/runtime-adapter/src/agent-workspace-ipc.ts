import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import {AsyncLocalStorage} from 'node:async_hooks';
import type {AgentWorkspaceIpcCurrentRequest} from './agent-ipc-causal-window.js';
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { buildWindowsAgentWorkspaceTransport, isolatedEnvironment } from "./native.js";
import { bytesAt, digest, RuntimeAdapterError } from "./files.js";
import { copyToolJson, TOOL_RECORD_BYTES } from "./tool-journal.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import { parseAgentWorkspaceToolScope, type AgentWorkspaceToolScope } from "./agent-workspace-authority.js";
import { parseWorkspaceToolInvocation, validWorkspaceWorkerIdentity, type WorkspaceToolInvocation } from "./workspace-files.js";
import type { WorkspaceToolReceipt } from "./workspace-tool-journal.js";
import type { CreditProcessIdentity } from "./gateway-credit.js";
import { parseWorkspaceCheckCatalog, parseWorkspaceCheckCall, type WorkspaceCheckCatalog, type WorkspaceCheckCall, type WorkspaceCheckReceipt } from "./workspace-checks.js";
import {captureAgentParentSkillIpcPort,type AgentParentSkillIpcPort,type AgentParentSkillIpcReceipt} from "./agent-parent-skill-ipc.js";
import {isAgentParentSkillToolSet, AgentRuntimeModelHost } from "./agent-runtime-model.js";
import { AgentWorkspaceIpcJournal } from "./agent-workspace-ipc-journal.js";
import { AgentRunBudget } from "./agent-run-budget.js";
import {AgentNamedMethodHost,type AgentNamedMethodReceipt} from "./agent-named-method-host.js";

const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
function fail(reason: string): never { throw new RuntimeAdapterError(reason); }
interface OriginalRequestContext {scope:AgentWorkspaceToolScope;nonce:string;ticket:ReturnType<AgentWorkspaceIpcJournal['request']>;journal:AgentWorkspaceIpcJournal;active:boolean;available:()=>boolean}
const originalRequestContext=new AsyncLocalStorage<OriginalRequestContext>();
// Getter only: no public setter or JSON field can install a current request.
// Inherited late async work retains the revoked context and fails closed.
export function readAgentWorkspaceIpcCurrentRequest():AgentWorkspaceIpcCurrentRequest|null {
 const current=originalRequestContext.getStore();if(!current)return null;
 if(!current.active||!current.available())fail('agent_ipc_current_request_expired');
 const frame=copyToolJson(current.journal.readPendingRequest(current.ticket));
 if(!frame||typeof frame!=='object'||Array.isArray(frame)||!('call_id'in frame)||!('tool'in frame)||!('scope_digest'in frame)||typeof frame.call_id!=='string'||typeof frame.tool!=='string'||frame.scope_digest!==agentWorkspaceIpcScopeDigest(current.scope))fail('agent_ipc_current_request_unproven');
 if(!current.active||!current.available())fail('agent_ipc_current_request_expired');
 return{nonce:current.nonce,scope_digest:agentWorkspaceIpcScopeDigest(current.scope),ordinal:current.ticket.ordinal,request_digest:current.ticket.request_digest,call_id:frame.call_id,tool:frame.tool};
}
export const agentWorkspaceIpcScopeDigest = (raw: unknown): string => digest(JSON.stringify(parseAgentWorkspaceToolScope(raw))).value;
// Only file arguments and the stable original SDK call ID cross this channel.
// Project/Run/actor/operation/context/Binding/admission come from its host scope.
export function agentWorkspaceIpcInvocation(scope: AgentWorkspaceToolScope, raw: unknown): WorkspaceToolInvocation {
  try {
    const original = parseAgentWorkspaceToolScope(scope), frame = copyToolJson(raw), keys = ["format", "scope_digest", "call_id", "tool", "path", "expected_digest"];
    if (!exact(frame, [...keys, ...(frame && typeof frame === "object" && "tool" in frame && frame.tool === "replace_file" ? ["replacement_utf8"] : [])]) ||
      frame.format !== "cimiloop/agent-workspace-tool-request/1.0.0" || frame.scope_digest !== agentWorkspaceIpcScopeDigest(original)) fail("agent_ipc_frame_denied");
    return parseWorkspaceToolInvocation({ format: "cimiloop/workspace-tool-invocation/1.0.0", project_id: original.project_id, run_id: original.run_id,
      operation_key: original.operation_key, executor_actor_id: original.executor_actor_id, context_digest: original.context_digest,
      call_id: frame.call_id, tool: frame.tool, path: frame.path, expected_digest: frame.expected_digest,
      ...(frame.tool === "replace_file" ? { replacement_utf8: frame.replacement_utf8 } : {}) });
  } catch { fail("agent_ipc_frame_denied"); }
}
export function agentWorkspaceIpcCheckInvocation(scope: AgentWorkspaceToolScope, catalog: WorkspaceCheckCatalog, raw: unknown): WorkspaceCheckCall {
  try {
    const original = parseWorkspaceCheckCatalog(catalog, scope), frame = copyToolJson(raw);
    if (!exact(frame, ["format", "scope_digest", "call_id", "tool", "check_id", "check_catalog_digest"]) ||
      frame.format !== "cimiloop/agent-workspace-tool-request/1.0.0" || frame.scope_digest !== original.scope_digest ||
      frame.tool !== "run_check" || frame.check_catalog_digest !== original.catalog_digest ||
      !original.recipes.some(recipe => recipe.check_id === frame.check_id)) fail("agent_ipc_frame_denied");
    return parseWorkspaceCheckCall({ format: "cimiloop/workspace-check-call/1.0.0", call_id: frame.call_id, check_id: frame.check_id });
  } catch { fail("agent_ipc_frame_denied"); }
}
interface Options {
  toolsDirectory: string; scope: AgentWorkspaceToolScope; supervisor: ChildProcess; originalSupervisor: CreditProcessIdentity; originalPeer: CreditProcessIdentity;
  // Trusted suspended-start composition chooses this before creating the peer.
  // It grants no authority; FIRST_PIPE_INSTANCE and original OS identity remain required.
  nonce?: string; signal?: AbortSignal | undefined;
  runBudget?: AgentRunBudget;
  execute: (input: WorkspaceToolInvocation) => Promise<{ receipt: WorkspaceToolReceipt; replay: boolean }>;
  checks?: { catalog: WorkspaceCheckCatalog; execute: (input: WorkspaceCheckCall) => Promise<{ receipt: WorkspaceCheckReceipt; replay: boolean }> };
  model?: AgentRuntimeModelHost;
  method?: AgentNamedMethodHost;
  parentSkill?: AgentParentSkillIpcPort;
  cancel: () => Promise<void>;
}
export interface AgentWorkspaceIpcEndpoint { pipe: string; scope_digest: string; check_catalog_digest: string | null; peer: CreditProcessIdentity; supervisor: CreditProcessIdentity; appcontainer_sid: string | null; model_admission_digest?: string; parent_skill_catalog_digest?: string }
// Separate native controller, never installed by the public probe or Human CLI.
// Held original process handles and the pipe's OS client PID establish the peer.
export class AgentWorkspaceToolIpc {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly nonce: string;
  private readonly scope: AgentWorkspaceToolScope;
  private readonly ready: Promise<AgentWorkspaceIpcEndpoint>;
  private readonly ended: Promise<void>;
  private readonly attempts: { outcome: string; reason: string | null }[] = [];
  private endpoint?: AgentWorkspaceIpcEndpoint;
  private originals?: AgentWorkspaceIpcJournal;
  private pending: Promise<void> | undefined;
  private closing: Promise<void> | undefined;
  private stopped = false;
  private readonly stopping=new AbortController();
  private failure: string | null = null;
  private readonly peerEnded = () => { void this.close(); };
  private readonly aborted = () => { this.failure ??= "agent_ipc_aborted"; void this.close(); };
  private constructor(private readonly options: Options, binary: string, binaryDigest: string, taskDeadline?: number) {
    this.nonce = options.nonce ?? randomUUID();
    this.scope = parseAgentWorkspaceToolScope(options.scope);
    this.child = spawn(binary, [], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: isolatedEnvironment() });
    let readyResolve!: (value: AgentWorkspaceIpcEndpoint) => void, readyReject!: (error: unknown) => void;
    this.ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; }); void this.ready.catch(() => {});
    const stop = (reason: string) => { this.failure ??= reason; readyReject(new RuntimeAdapterError(reason)); void this.close(); };
    let buffer = Buffer.alloc(0), lines = 0;
    const timer = setTimeout(() => stop("agent_ipc_start_timeout"), 10000);
    this.child.stdout.on("data", (bytes: Buffer) => {
      buffer = Buffer.concat([buffer, bytes]); if (buffer.length > 163840) { stop("agent_ipc_native_output_limit"); return; }
      while (buffer.includes(10)) {
        const at = buffer.indexOf(10), line = buffer.subarray(0, at); buffer = buffer.subarray(at + 1);
        try {
          if (++lines > 130) fail("agent_ipc_attempt_limit");
          const event = parseGatewayJson(new TextDecoder("utf-8", { fatal: true }).decode(line).trim(), 163840) as Record<string, unknown>;
          if (!event || typeof event !== "object" || Array.isArray(event) || event.format !== "cimiloop/agent-workspace-ipc-native/1.0.0") fail("agent_ipc_native_unproven");
          if (event.phase === "ready") {
            if (this.endpoint || lines !== 1 || !exact(event, ["format", "phase", "nonce", "scope_digest", "check_catalog_digest", "pipe", "peer", "supervisor", "appcontainer_sid"]) ||
              event.check_catalog_digest !== (options.checks?.catalog.catalog_digest ?? null) ||
              event.nonce !== this.nonce || event.scope_digest !== agentWorkspaceIpcScopeDigest(this.scope) || event.pipe !== `\\\\.\\pipe\\CimiLoop.AgentWorkspace.${this.nonce}` ||
              !validWorkspaceWorkerIdentity(event.peer) || !isDeepStrictEqual({ ...event.peer }, options.originalPeer) ||
              !validWorkspaceWorkerIdentity(event.supervisor) || !isDeepStrictEqual({ ...event.supervisor }, options.originalSupervisor) || event.appcontainer_sid !== null &&
              (typeof event.appcontainer_sid !== "string" || !/^S-1-15-2-(?:[0-9]+-)*[0-9]+$/.test(event.appcontainer_sid))) fail("agent_ipc_native_unproven");
            this.endpoint = { pipe: event.pipe, scope_digest: event.scope_digest, check_catalog_digest: event.check_catalog_digest as string | null, peer: { ...event.peer }, supervisor: { ...event.supervisor }, appcontainer_sid: event.appcontainer_sid, ...(options.model ? {model_admission_digest: options.model.admissionDigest} : {}), ...(options.parentSkill ? {parent_skill_catalog_digest:options.parentSkill.sdkCatalog.catalog_digest} : {}) };
            this.originals = AgentWorkspaceIpcJournal.create(options.toolsDirectory, this.scope, this.endpoint, this.nonce, binaryDigest);
            clearTimeout(timer); readyResolve(structuredClone(this.endpoint));
          } else if (event.phase === "request") {
            if (!this.endpoint || this.pending || this.stopped || !exact(event, ["format", "phase", "nonce", "scope_digest", "peer", "request_digest", "frame_base64"]) ||
              event.nonce !== this.nonce || event.scope_digest !== this.endpoint.scope_digest || !validWorkspaceWorkerIdentity(event.peer) || !isDeepStrictEqual({ ...event.peer }, this.endpoint.peer) ||
              typeof event.frame_base64 !== "string" || event.frame_base64.length > 152920 || typeof event.request_digest !== "string") fail("agent_ipc_native_unproven");
            const frame = Buffer.from(event.frame_base64, "base64"); if (!frame.length || frame.length > TOOL_RECORD_BYTES || frame.toString("base64") !== event.frame_base64 ||
              digest(frame).value !== event.request_digest) fail("agent_ipc_native_unproven");
            const operation = this.respond(frame, event.request_digest); this.pending = operation;
            void operation.then(() => { if (this.pending === operation) this.pending = undefined; }, () => stop("agent_ipc_reply_unproven"));
          } else if (event.phase === "rejected" && exact(event, ["format", "phase", "reason"]) && ["agent_ipc_peer_mismatch", "agent_ipc_frame_limit", "agent_ipc_utf8_invalid"].includes(String(event.reason))) {
            this.attempts.push({ outcome: "rejected", reason: String(event.reason) });
          } else if (event.phase === "failed" && exact(event, ["format", "phase", "reason"]) && typeof event.reason === "string" && /^agent_ipc_[a-z_]{1,80}$/.test(event.reason)) {
            fail(event.reason);
          } else { fail("agent_ipc_native_unproven"); }
        } catch (error) { stop(error instanceof RuntimeAdapterError ? error.reason : "agent_ipc_native_unproven"); }
      }
    });
    this.child.stderr.on("data", () => stop("agent_ipc_native_stderr_unproven"));
    this.child.stdin.on("error", () => { if (!this.stopped) stop("agent_ipc_native_input_unproven"); });
    this.child.once("error", () => stop("agent_ipc_native_start_failed"));
    this.ended = new Promise(resolve => this.child.once("close", (code, signal) => {
      clearTimeout(timer); if (buffer.length || code !== 0 || signal) this.failure ??= "agent_ipc_native_exit_unproven";
      readyReject(new RuntimeAdapterError(this.failure ?? "agent_ipc_peer_ended")); resolve(); void this.close();
    }));
    options.supervisor.once("close", this.peerEnded);
    options.signal?.addEventListener("abort", this.aborted, { once: true });
    if (options.signal?.aborted) this.aborted();
    this.child.stdin.write(JSON.stringify({ format: taskDeadline===undefined?"cimiloop/agent-workspace-ipc-config/1.0.0":"cimiloop/agent-workspace-ipc-config/2.0.0", ...(taskDeadline===undefined?{}:{deadline_uptime_ms:taskDeadline}), nonce: this.nonce, scope_digest: agentWorkspaceIpcScopeDigest(this.scope),
      check_catalog_digest: options.checks?.catalog.catalog_digest ?? null, peer: options.originalPeer, supervisor: options.originalSupervisor, owner_pid: process.pid }) + "\n");
  }
  static async open(options: Options): Promise<AgentWorkspaceToolIpc> {
    if (options.signal?.aborted) fail("agent_ipc_aborted");
    if (options.nonce !== undefined && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(options.nonce)) fail("agent_ipc_nonce_invalid");
    if(options.runBudget!==undefined&&!(options.runBudget instanceof AgentRunBudget))fail("agent_ipc_task_budget_invalid");
    const scope = parseAgentWorkspaceToolScope(options.scope), originalPeer = copyToolJson(options.originalPeer), originalSupervisor = copyToolJson(options.originalSupervisor);
    if(options.parentSkill!==undefined&&(options.method!==undefined||!options.checks||!(options.model instanceof AgentRuntimeModelHost)||!isAgentParentSkillToolSet(options.model.toolNames))||options.model instanceof AgentRuntimeModelHost&&isAgentParentSkillToolSet(options.model.toolNames)&&options.parentSkill===undefined)fail("agent_parent_skill_ipc_unproven");
    const parentSkill=options.parentSkill===undefined?undefined:captureAgentParentSkillIpcPort(scope,options.parentSkill);
    if(options.method!==undefined&&(!(options.method instanceof AgentNamedMethodHost)||options.checks||!(options.model instanceof AgentRuntimeModelHost)||JSON.stringify(options.model.toolNames)!==JSON.stringify(["cimi_invoke_skill","cimi_read_method_resource"])))fail("agent_method_scope_denied");options.method?.assertScope(scope);
    const budget=options.runBudget;budget?.assertScope(scope);const taskDeadline=budget?.nativeDeadlineUptimeMs;
    if(taskDeadline!==undefined&&(!Number.isSafeInteger(taskDeadline)||taskDeadline<=0))fail("agent_ipc_task_budget_invalid");
    if (!validWorkspaceWorkerIdentity(originalPeer) || originalPeer.pid === process.pid || !validWorkspaceWorkerIdentity(originalSupervisor) ||
      originalSupervisor.pid !== options.supervisor.pid || options.supervisor.pid === process.pid || options.supervisor.exitCode !== null ||
      options.supervisor.signalCode !== null || options.supervisor.killed) fail("agent_ipc_peer_unproven");
    // Copy original protected pins before asynchronous build/start. A caller's
    // later mutation cannot substitute the admitted scope or captured process.
    const captured: Options = { ...options, scope, originalPeer: { ...originalPeer }, originalSupervisor: { ...originalSupervisor },
      ...(options.checks ? { checks: { catalog: parseWorkspaceCheckCatalog(options.checks.catalog, scope), execute: options.checks.execute.bind(options.checks) } } : {}),
      ...(parentSkill?{parentSkill:{get sdkCatalog(){parentSkill.assertScope(scope);return parentSkill.catalog;},invoke:parentSkill.invoke}}:{}) };
    if(parentSkill){parentSkill.assertScope(scope);await captured.model!.check(scope,captured.signal);}
    const binary = await buildWindowsAgentWorkspaceTransport(captured.toolsDirectory, captured.signal);
    if (captured.signal?.aborted) fail("agent_ipc_aborted");
    parentSkill?.assertScope(scope);if(parentSkill)await captured.model!.check(scope,captured.signal);
    captured.method?.assertScope(scope);budget?.assertScope(scope);if(budget?.nativeDeadlineUptimeMs!==taskDeadline)fail("agent_ipc_task_budget_changed");
    if (captured.supervisor.exitCode !== null || captured.supervisor.signalCode !== null || captured.supervisor.killed) fail("agent_ipc_peer_unproven");
    if (digest(bytesAt(binary.path)).value !== binary.digest.value) fail("agent_ipc_binary_changed");
    const host = new AgentWorkspaceToolIpc(captured, binary.path, binary.digest.value, taskDeadline);
    try { await host.ready; return host; } catch (error) { await host.close(); throw error; }
  }
  private async respond(bytes: Buffer, requestDigest: string) {
    if (!this.originals) fail("agent_ipc_originals_unproven");
    const originals=this.originals,ticket = originals.request(bytes, requestDigest);
    const current:OriginalRequestContext={scope:structuredClone(this.scope),nonce:this.nonce,ticket,journal:originals,active:true,available:()=>!this.stopped&&!this.stopping.signal.aborted};
    return originalRequestContext.run(current,async()=>{try{
    let receipt: AgentParentSkillIpcReceipt | AgentNamedMethodReceipt | WorkspaceToolReceipt | WorkspaceCheckReceipt | Awaited<ReturnType<AgentRuntimeModelHost["execute"]>>["receipt"] | null = null, replay = false, reason: string | null = null, callId: string | null = null;
    try {
      const frame = parseGatewayJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes), TOOL_RECORD_BYTES) as Record<string, unknown>;
      if (this.stopped) fail("agent_ipc_closed");
      if (frame && frame.tool === "model_step") {
        if (!(this.options.model instanceof AgentRuntimeModelHost)) fail("agent_model_admission_unavailable");
        callId = typeof frame.call_id === "string" ? frame.call_id : null;
        const result = await this.options.model.execute(frame, this.options.signal); receipt = result.receipt; replay = result.replay;
      } else if(frame&&frame.tool==='run_skill'){
        if(!this.options.parentSkill)fail('agent_parent_skill_ipc_unproven');
        callId=typeof frame.call_id==='string'?frame.call_id:null;
        await this.options.model!.check(this.scope,this.stopping.signal);
        if(this.options.runBudget)await this.options.runBudget.remaining(this.stopping.signal);
        const result=await this.options.parentSkill.invoke(frame,this.stopping.signal);
        await this.options.model!.check(this.scope,this.stopping.signal);
        if(this.options.runBudget)await this.options.runBudget.remaining(this.stopping.signal);
        this.stopping.signal.throwIfAborted();receipt=result.receipt;replay=result.replay;
      } else if (frame && ['invoke_skill','read_method_resource'].includes(String(frame.tool))) {
        if(!(this.options.method instanceof AgentNamedMethodHost))fail('agent_method_effect_denied');
        callId=typeof frame.call_id==='string'?frame.call_id:null;
        if(this.options.runBudget)await this.options.runBudget.remaining(this.options.signal);
        const result=await this.options.method.execute(frame,this.options.signal);receipt=result.receipt;replay=result.replay;
      } else if (this.options.method) {
        fail("agent_method_scope_denied");
      } else if (frame && frame.tool === "run_check") {
        if (!this.options.checks) fail("agent_ipc_frame_denied");
        const input = agentWorkspaceIpcCheckInvocation(this.scope, this.options.checks.catalog, frame); callId = input.call_id;
        const result = await this.options.checks.execute(input); receipt = result.receipt; replay = result.replay;
      } else {
        const input = agentWorkspaceIpcInvocation(this.scope, frame); callId = input.call_id;
        const result = await this.options.execute(input); receipt = result.receipt; replay = result.replay;
      }
    } catch (error) { receipt=null;replay=false;reason = error instanceof RuntimeAdapterError && /^[a-z_]{1,96}$/.test(error.reason) ? error.reason : "agent_ipc_frame_denied"; }
    this.attempts.push({ outcome: reason ? "denied" : "completed", reason });
    const reply = Buffer.from(JSON.stringify({ format: "cimiloop/agent-workspace-tool-reply/1.0.0", scope_digest: agentWorkspaceIpcScopeDigest(this.scope), request_digest: requestDigest,
      call_id: callId, outcome: reason ? "denied" : "completed", receipt, replay, reason, formal_agent_execution_enabled: false }));
    if (reply.length > TOOL_RECORD_BYTES) fail("agent_ipc_reply_limit");
    originals.reply(ticket, reply);
    if (!this.stopped) this.child.stdin.write(JSON.stringify({ format: "cimiloop/agent-workspace-ipc-host/1.0.0", request_digest: requestDigest, reply_base64: reply.toString("base64") }) + "\n");
    }finally{current.active=false;}});
  }
  getEndpoint(): AgentWorkspaceIpcEndpoint { if (!this.endpoint || this.stopped) fail("agent_ipc_closed"); return structuredClone(this.endpoint); }
  snapshot() { return { attempts: structuredClone(this.attempts), closed: this.stopped, failure_reason: this.failure, formal_agent_execution_enabled: false as const }; }
  close(): Promise<void> {
    if (!this.closing) {
      this.stopped = true;this.stopping.abort(new RuntimeAdapterError("agent_parent_skill_ipc_aborted")); this.options.supervisor.removeListener("close", this.peerEnded); this.options.signal?.removeEventListener("abort", this.aborted); this.child.stdin.end();
      this.closing = (async () => { const timer = setTimeout(() => this.child.kill(), 5000);
        try { await this.options.cancel(); } finally { await Promise.allSettled([this.pending, this.ended]); clearTimeout(timer); } })();
    }
    return this.closing;
  }
}
