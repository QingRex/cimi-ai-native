import type { ChildProcess } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { bytesAt, readJson, directory, digest, atomicJson, RuntimeAdapterError } from "./files.js";
import { nativeControl } from "./native.js";
import { GatewayConversationHostRehearsal } from "./gateway-host.js";
import type { GatewayCreditLedger } from "./gateway-credit.js";
import { parseGatewayJson, prepareGatewayConversation } from "./gateway-conversation.js";
import { compileValidator, SkillRuntimeProfileSchema, type SkillRuntimeProfile } from "@cimiloop/protocol/v2";
import { FixedMethodConversationAdapter } from "./fixed-method.js";
import type { FixedMethodProfile, FixedMethodProjection } from "@cimiloop/protocol/v2";

export const CONVERSATION_IPC_REQUEST_BYTES = 65536, CONVERSATION_IPC_REPLY_BYTES = 294912;
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
function fail(reason: string): never { throw new RuntimeAdapterError(reason); }
interface Identity { pid: number; creation_ticks: string; image: string }
interface Context { path: string; nonce: string; operationKey: string; launcher: string; binary: string; policyDigest: string; ledger: GatewayCreditLedger; host: GatewayConversationHostRehearsal; skillProfile?: SkillRuntimeProfile; methodReadPaths?: string[];
  fixedMethod?: { profile: FixedMethodProfile; files: { path: string; content: string }[] } }
// Only the trusted public probe runner constructs this bridge. It is not wired
// into operation admission or the CLI, and cannot construct a real-key host.
export class PublicConversationBridge {
  private readonly context: Readonly<Context>;
  private readonly abort = new AbortController();
  private readonly seen = new Set<string>();
  private readonly attempts: { request_id: string; frame_digest: string; outcome: string; reason: string | null; replay: boolean }[] = [];
  private nativePid = 0;
  private runtimePid = 0;
  private stopping = false;
  private worker: Promise<void> | undefined;
  private failure: string | null = null;
  private child: ChildProcess | undefined;
  private closePromise: Promise<void> | undefined;
  private readonly fixedMethod: FixedMethodConversationAdapter | undefined;
  private readonly ended = () => this.abort.abort();
  constructor(context: Context) {
    if (context.ledger.storageFormat !== 3 || !/^[a-f0-9]{64}$/.test(context.policyDigest) || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(context.nonce) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(context.operationKey)) fail("conversation_bridge_profile_invalid");
    const profile = context.skillProfile && compileValidator<SkillRuntimeProfile>(SkillRuntimeProfileSchema)(structuredClone(context.skillProfile));
    if (profile) { if (profile.skill_names.length > 3) fail("conversation_bridge_profile_invalid"); Object.freeze(profile.skill_names); Object.freeze(profile.source_digest); Object.freeze(profile); }
    const paths = context.methodReadPaths && [...context.methodReadPaths];
    if (paths && (!profile || paths.length !== profile.skill_names.length || new Set(paths).size !== paths.length || profile.skill_names.some(name => !paths.includes(`skill-source/${name}/SKILL.md`)))) fail("conversation_bridge_profile_invalid");
    if (paths) Object.freeze(paths);
    if (context.fixedMethod && (profile || paths)) fail("conversation_bridge_profile_invalid");
    this.fixedMethod = context.fixedMethod && new FixedMethodConversationAdapter(context.fixedMethod.profile, context.fixedMethod.files, context.operationKey,
      existsSync(join(context.path, "fixed-method-proof.json")) ? readJson(join(context.path, "fixed-method-proof.json")) : undefined);
    this.context = Object.freeze({ ...context, ...(profile ? { skillProfile: profile } : {}), ...(paths ? { methodReadPaths: paths } : {}) });
    directory(join(context.path, "conversation", "requests")); directory(join(context.path, "conversation", "responses"));
    this.saveMethod();
  }
  start(child: ChildProcess): void {
    if (this.worker || !child.pid) fail("conversation_bridge_start_invalid");
    this.child = child; this.nativePid = child.pid; child.once("close", this.ended); this.worker = this.serve();
  }
  private save(phase: string): void {
    this.saveMethod();
    atomicJson(join(this.context.path, "conversation-host-proof.json"), { format: "cimiloop/conversation-host-proof/1.0.0", scope: "isolated_conversation_rehearsal",
      operation_key: this.context.operationKey, phase, native_pid: this.nativePid, runtime_pid: this.runtimePid, policy_digest: this.context.policyDigest,
      budget: this.context.ledger.snapshot(), cache: this.context.ledger.cacheSnapshot(), attempts: this.attempts, failure_reason: this.failure,
      actual_credentials_read: 0, external_model_requests: 0, formal_execution_enabled: false });
  }
  private saveMethod(): void { if (this.fixedMethod) atomicJson(join(this.context.path, "fixed-method-proof.json"), this.fixedMethod.snapshot()); }
  private async process(file: string): Promise<void> {
    const c = this.context, mailbox = parseGatewayJson(new TextDecoder("utf-8", { fatal: true }).decode(bytesAt(file, 98304)), 98304), id = basename(file, ".json");
    if (!exact(mailbox, ["format", "nonce", "operation_key", "native_pid", "runtime_pid", "policy_digest", "request_id", "request_digest", "frame_base64"]) || mailbox.format !== "cimiloop/ipc-conversation-mailbox/1.0.0" ||
      mailbox.nonce !== c.nonce || mailbox.operation_key !== c.operationKey || mailbox.policy_digest !== c.policyDigest || mailbox.native_pid !== this.nativePid || mailbox.request_id !== id ||
      typeof mailbox.frame_base64 !== "string" || mailbox.frame_base64.length > 87384 || !/^[A-Za-z0-9+/]*={0,2}$/.test(mailbox.frame_base64)) fail("conversation_mailbox_identity_unproven");
    const bytes = Buffer.from(mailbox.frame_base64, "base64");
    if (!bytes.length || bytes.length > CONVERSATION_IPC_REQUEST_BYTES || bytes.toString("base64") !== mailbox.frame_base64 || digest(bytes).value !== mailbox.request_digest) fail("conversation_mailbox_frame_unproven");
    const ownership = readJson(join(c.path, "native-ownership.json")) as { nonce: string; root: string; binary: string; mode: string; mapping: string; network_mode: string; native_identity: Identity; runtime_identity: Identity };
    const current = (await nativeControl(c.launcher, ["--identity", String(this.nativePid)])).value as Identity;
    if (ownership.nonce !== c.nonce || ownership.native_identity.pid !== this.nativePid || current.pid !== this.nativePid || current.creation_ticks !== ownership.native_identity.creation_ticks ||
      resolve(current.image).toLowerCase() !== resolve(c.launcher).toLowerCase() || resolve(ownership.native_identity.image).toLowerCase() !== resolve(current.image).toLowerCase() ||
      ownership.network_mode !== "deny_all" || ownership.mode !== "read" || resolve(ownership.root).toLowerCase() !== resolve(join(c.path, "sandbox")).toLowerCase() ||
      resolve(ownership.binary).toLowerCase() !== resolve(c.binary).toLowerCase() || resolve(ownership.runtime_identity.image).toLowerCase() !== resolve(c.binary).toLowerCase() ||
      mailbox.runtime_pid !== ownership.runtime_identity.pid || !/^[F-Z]:$/.test(ownership.mapping)) fail("conversation_mailbox_identity_unproven");
    this.runtimePid = ownership.runtime_identity.pid;
    let response: unknown = null, receipt: unknown = null, reason: string | null = null, replay = false, methodProjection: FixedMethodProjection | undefined;
    try {
      const frame = parseGatewayJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes), CONVERSATION_IPC_REQUEST_BYTES);
      if (!exact(frame, ["format", "request_id", "operation_key", "model_id", "policy_digest", "messages", "tools", "response_mode", "input_tokens", "max_output_tokens"]) ||
        frame.format !== "cimiloop/model-conversation-request/1.0.0" || frame.request_id !== id || frame.operation_key !== c.operationKey || frame.model_id !== "cimiloop-public-tools" || frame.policy_digest !== c.policyDigest ||
        frame.input_tokens !== 65536 || !Number.isSafeInteger(frame.max_output_tokens) || Number(frame.max_output_tokens) < 1 || Number(frame.max_output_tokens) > 128) fail("conversation_frame_denied");
      const input = { request_id: frame.request_id, messages: frame.messages, tools: frame.tools, response_mode: frame.response_mode, input_tokens: frame.input_tokens, max_output_tokens: frame.max_output_tokens };
      const prepared = prepareGatewayConversation(input);
      // Trusted synthetic profiles only; tool names and proposed arguments are
      // checked independently. The original public read profile is unchanged.
      if (!prepared.tools.length || prepared.tools.some(tool => tool.function.name !== "read" && !(c.skillProfile && !c.methodReadPaths && tool.function.name === "skill"))) fail("conversation_fixture_tools_denied");
      const projection = this.fixedMethod?.project(input, ownership.mapping); this.saveMethod();
      const result = await c.host.execute(projection?.input ?? input, "public_probe", this.abort.signal);
      const acceptedResponse = projection ? this.fixedMethod!.accept(result.response, projection) : result.response;
      // Persist original named calls and exact SDK effects before publishing them.
      this.saveMethod();
      for (const call of acceptedResponse.tool_calls) {
        const args = parseGatewayJson(call.function.arguments, 16384);
        if (c.skillProfile && !c.methodReadPaths && call.function.name === "skill") {
          if (!exact(args, ["name"]) || !c.skillProfile.skill_names.includes(String(args.name))) fail("conversation_fixture_skill_denied");
        } else if (call.function.name !== "read" || !exact(args, ["filePath"]) || !(this.fixedMethod?.profile.resources.map(resource => resource.path) ?? c.methodReadPaths ?? ["public.txt"]).some(path => args.filePath === ownership.mapping + "\\workspace\\" + path.replaceAll("/", "\\"))) fail("conversation_fixture_path_denied");
      }
      response = acceptedResponse; receipt = result.receipt; replay = result.replay;
      if (projection) methodProjection = { format: "cimiloop/fixed-method-projection/1.0.0", invocation_key: c.operationKey,
        source_digest: this.fixedMethod!.profile.source_digest, request_digest: this.fixedMethod!.profile.request_digest, profile_digest: digest(JSON.stringify(this.fixedMethod!.profile)),
        sdk_input_digest: { algorithm: "sha256", value: projection.sdk_input_digest }, upstream_input_digest: { algorithm: "sha256", value: projection.upstream_input_digest },
        upstream_response_digest: { algorithm: "sha256", value: result.response.response_digest }, mapped_response_digest: digest(JSON.stringify(acceptedResponse)) };
    } catch (error) { reason = error instanceof RuntimeAdapterError && /^[a-z_]{1,96}$/.test(error.reason) ? error.reason : "conversation_frame_denied"; }
    const reply = { format: "cimiloop/model-conversation-reply/1.0.0", scope: "isolated_conversation_rehearsal", operation_key: c.operationKey, request_id: id, request_digest: digest(bytes).value,
      policy_digest: c.policyDigest, outcome: reason ? "denied" : "completed", response, receipt, reason, replay, ...(methodProjection ? { method_projection: methodProjection } : {}), formal_execution_enabled: false };
    if (Buffer.byteLength(JSON.stringify(reply)) > CONVERSATION_IPC_REPLY_BYTES) fail("conversation_reply_limit");
    this.attempts.push({ request_id: id, frame_digest: digest(bytes).value, outcome: reason ? "denied" : "completed", reason, replay }); this.save("running");
    atomicJson(join(c.path, "conversation", "responses", id + ".json"), { format: "cimiloop/ipc-conversation-reply/1.0.0", nonce: c.nonce, reply });
  }
  private async serve(): Promise<void> {
    const cancel = setInterval(() => { if (existsSync(join(this.context.path, "cancel"))) this.abort.abort(); }, 25);
    try {
      while (!this.stopping && !this.abort.signal.aborted) {
        for (const name of readdirSync(join(this.context.path, "conversation", "requests"))) {
          if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.json$/.test(name) || this.seen.has(name)) continue;
          if (this.seen.size >= 8) fail("conversation_mailbox_request_limit"); this.seen.add(name); await this.process(join(this.context.path, "conversation", "requests", name));
        }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    } catch (error) {
      this.failure = error instanceof RuntimeAdapterError ? error.reason : "conversation_host_unproven"; this.abort.abort();
      try { writeFileSync(join(this.context.path, "cancel"), "conversation host unavailable", { flag: "wx" }); } catch { /* Preserve earlier cancellation. */ }
    } finally { clearInterval(cancel); }
  }
  finish(): Promise<void> {
    if (!this.closePromise) {
      this.stopping = true; this.abort.abort();
      this.closePromise = Promise.resolve(this.worker).then(async () => {
        this.fixedMethod?.interrupt();
        this.child?.removeListener("close", this.ended); try { this.save("ended"); } finally { await this.context.host.close(); }
      });
    }
    return this.closePromise;
  }
}
