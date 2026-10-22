import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { ExternalReference } from "@cimiloop/protocol/v2";
import { assertOrdinaryPath, bytesAt, digest, directory, RuntimeAdapterError } from "./files.js";
import { parseGatewayJson } from "./gateway-conversation.js";

const MAX_BYTES = 8 * 1024 * 1024, MAX_LINE = 1024 * 1024, MAX_CALLS = 128;
const fail = (reason = "codex_original_unproven"): never => { throw new RuntimeAdapterError(reason); };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
const same = (left: unknown, right: unknown) => isDeepStrictEqual(JSON.parse(JSON.stringify(left)), JSON.parse(JSON.stringify(right)));
const parse = (bytes: Buffer) => parseGatewayJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes), MAX_BYTES) as any;
const guardNow = (guard: () => void) => {
  const result: unknown = guard();
  if (result !== undefined) { if (result instanceof Promise) void result.catch(() => {}); fail("codex_effect_denied"); }
};
const fileIdentity = (path: string) => {
  const stat = lstatSync(assertOrdinaryPath(path), { bigint: true });
  if (!stat.isFile() || stat.nlink !== 1n || stat.ino <= 0n) fail();
  return { dev: String(stat.dev), ino: String(stat.ino), birth: String(stat.birthtimeNs) };
};
const save = (path: string, value: unknown) => {
  const bytes = encode(value); if (bytes.length > MAX_BYTES) fail("codex_capacity_exhausted");
  const fd = openSync(assertOrdinaryPath(path), "wx");
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
};

export interface CodexMethodTool {
  type: "function"; name: string; description: string; inputSchema: unknown;
}
export interface CodexMethodRequest {
  operation_key: string; model: string; prompt: string; instructions: string;
  tools: CodexMethodTool[]; output_schema: unknown;
}
export interface CodexMethodToolCall {
  call_id: string; tool: string; arguments: unknown; output: string;
}
export interface CodexMethodToolContext {
  readonly call_id: string; readonly thread_id: string; readonly turn_id: string;
  readonly model: string; readonly account_digest: string;
  readonly signal: AbortSignal;
  readonly beforeEffect: () => void;
}
export interface CodexMethodAdmission { readonly model: string; readonly account_digest: string }
export interface CodexMethodOriginal {
  format: "cimiloop/codex-method-original/1.0.0";
  operation_key: string; input_digest: string; thread_id: string; turn_id: string;
  model: string; account_digest: string; output_text: string; tool_calls: CodexMethodToolCall[];
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number; totalTokens: number; reasoningOutputTokens: number; cacheWriteInputTokens: number };
  original_ref: ExternalReference;
}
export interface CodexOriginalMethodOptions {
  root: string;
  // A trusted launcher supplies a pinned executable and fixed prefix arguments.
  // This is NOT a serialized install/qualification or a model-supplied command.
  command: { file: string; args: string[]; sha256: string };
  account_digest?: string;
  timeout_ms?: number;
  disabled_mcp_servers?: string[];
}
type Frame = { direction: "in" | "out"; bytes: string };

// Non-secret account metadata supplied by the CLI itself. Never read auth.json,
// accept tokens, or forward an email/account response into model context.
export function codexChatGptAccountDigest(raw: unknown): string {
  const value = raw as { account?: { type?: string; email?: string }; workspaceRouting?: unknown };
  const email = value?.account?.email;
  if (value?.account?.type !== "chatgpt" || typeof email !== "string" || !email.trim() || email.length > 500) fail("codex_chatgpt_login_required");
  return digest(encode({ format: "cimiloop/codex-account/1.0.0", type: "chatgpt", email: email!.trim().toLowerCase(), workspace: value.workspaceRouting ?? null })).value;
}

function requestCopy(raw: CodexMethodRequest): CodexMethodRequest {
  const value = structuredClone(raw);
  if (!value || Object.keys(value).sort().join(",") !== "instructions,model,operation_key,output_schema,prompt,tools" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.operation_key) || !/^[a-zA-Z0-9._-]{1,128}$/.test(value.model) ||
    typeof value.prompt !== "string" || !value.prompt.trim() || typeof value.instructions !== "string" || !value.instructions.trim() ||
    !Array.isArray(value.tools) || value.tools.length > 16 || new Set(value.tools.map(t => t.name)).size !== value.tools.length ||
    value.tools.some(t => t.type !== "function" || !/^[a-z][a-z0-9_]{0,63}$/.test(t.name)) || encode(value).length > 384 * 1024) fail("codex_request_denied");
  return value;
}
const legacyConfig = () => ({
  model_provider: "openai", forced_login_method: "chatgpt", mcp_servers: {},
  features: { shell_tool: false, apps: false, hooks: false, memories: false, multi_agent: false, remote_plugin: false, shell_snapshot: false },
  web_search: "disabled", project_doc_max_bytes: 0, notify: [], tools: { view_image: false },
  default_permissions: "cimiloop-method",
  permissions: { "cimiloop-method": { filesystem: { ":root": "deny", ":minimal": "read" }, network: { enabled: false } } }
});
const config = (disabled: string[]) => ({ ...legacyConfig(),
  mcp_servers: Object.fromEntries(disabled.map(name => [name, { enabled: false }])),
  // The built-in host dispatches the explicitly supplied dynamic client tools;
  // disabling it also disables those tools. It is not an external MCP server.
  features: { ...legacyConfig().features, code_mode_host: true, code_mode: false, computer_use: false, browser_use: false,
    browser_use_external: false, browser_use_full_cdp_access: false, browser_annotation_api: false, in_app_browser: false,
    plugins: false, plugin_sharing: false, skill_mcp_dependency_install: false, goals: false }
});
const quietMcpCatalog = (value: any, disabled: string[]) => value && Array.isArray(value.data) && value.data.length <= 128 && value.nextCursor === null &&
  value.data.every((server: any) => disabled.includes(server.name) && server.runtimeStatus === "disabled" && server.tools && Object.keys(server.tools).length === 0 &&
    Array.isArray(server.resources) && server.resources.length === 0 && Array.isArray(server.resourceTemplates) && server.resourceTemplates.length === 0 && server.toolsError === null);
function toml(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) return "{" + Object.entries(value).map(([key, item]) => JSON.stringify(key) + "=" + toml(item)).join(",") + "}";
  return JSON.stringify(value);
}
const startParams = (request: CodexMethodRequest, cwd: string) => ({ model: request.model, modelProvider: "openai", allowProviderModelFallback: false,
  cwd, runtimeWorkspaceRoots: [cwd], approvalPolicy: "never", permissions: "cimiloop-method", baseInstructions: request.instructions,
  developerInstructions: "Only client dynamic tools are available. Do not access credentials, commands, arbitrary files, plugins, or business commands. Never claim a Human decision or domain completion.",
  dynamicTools: request.tools, selectedCapabilityRoots: [], environments: [] });
function childEnvironment() {
  const allowed = new Set(["SYSTEMROOT", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "PROGRAMDATA", "TEMP", "TMP", "CODEX_HOME", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "SSL_CERT_FILE", "SSL_CERT_DIR"]);
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toUpperCase())));
}

// Interpret retained *actual app-server stdio*, independently of the final model
// message. This does not assert HTTP wire bytes, Skill behavior qualification,
// native isolation acceptance, provider bills, or Kernel business completion.
function originalFromFrames(request: CodexMethodRequest, cwd: string, frames: Frame[], reference: ExternalReference, expectedAccount?: string, version: 1 | 2 = 1, disabled: string[] = []): CodexMethodOriginal {
  const sent = new Map<number | string, any>(), incoming = new Map<number | string, any>();
  let thread = "", turn = "", account = false, complete = false, output = "", usage: any, accountDigest = "", finalAccountRead = false;
  const earlyThreadIds = new Set<string>();
  let accountDirty = false, turnSent = false, mcpVerified = version === 1;
  const calls = new Map<string, CodexMethodToolCall>(), completedCalls = new Set<string>();
  for (const frame of frames) {
    const bytes = Buffer.from(frame.bytes, "base64");
    if (bytes.toString("base64") !== frame.bytes || bytes.length > MAX_LINE || bytes.at(-1) !== 10) fail();
    const value = parse(bytes);
    const accountRpc = frame.direction === "out" ? value.method === "account/read" : value.id !== undefined && !value.method && sent.get(value.id)?.method === "account/read";
    if (complete && !accountRpc && (frame.direction === "out" || value.id !== undefined || !["thread/tokenUsage/updated", "thread/status/changed"].includes(value.method))) fail("codex_post_terminal_effect");
    if (frame.direction === "out") {
      if (value.method) {
        if (!["initialize", "initialized", "account/read", "thread/start", "turn/start", "mcpServerStatus/list"].includes(value.method)) fail();
        if (value.id !== undefined) { if (sent.has(value.id)) fail(); sent.set(value.id, value); }
        if (value.method === "thread/start" && (!account || !same(value.params, startParams(request, cwd)))) fail();
        if (value.method === "turn/start" && (!thread || turn || accountDirty || !mcpVerified || value.params.threadId !== thread || value.params.model !== request.model ||
          !same(value.params.input, [{ type: "text", text: request.prompt, text_elements: [] }]) || !same(value.params.outputSchema, request.output_schema))) fail();
        if (value.method === "turn/start") turnSent = true;
        if (value.method === "mcpServerStatus/list" && (turnSent || !thread || !same(value.params, { threadId: thread, limit: 100, detail: "toolsAndAuthOnly" }))) fail();
      } else {
        const call = incoming.get(value.id), result = value.result;
        if (!call || call.method !== "item/tool/call" || call.params.threadId !== thread || call.params.turnId !== turn || call.params.namespace !== null ||
          !request.tools.some(t => t.name === call.params.tool) || !result?.success || result.contentItems?.length !== 1 || result.contentItems[0]?.type !== "inputText" ||
          typeof result.contentItems[0]?.text !== "string" || calls.has(call.params.callId)) fail();
        calls.set(call.params.callId, { call_id: call.params.callId, tool: call.params.tool, arguments: call.params.arguments, output: result.contentItems[0].text });
      }
      continue;
    }
    if (frame.direction !== "in") fail();
    if (value.id !== undefined && value.method) {
      if (incoming.has(value.id) || value.method !== "item/tool/call") fail();
      incoming.set(value.id, value); continue;
    }
    if (value.id !== undefined) {
      const rpc = sent.get(value.id); if (!rpc || value.error) fail();
      const result = value.result;
      if (rpc.method === "account/read") {
        const current = codexChatGptAccountDigest(result);
        if (expectedAccount && current !== expectedAccount || accountDigest && current !== accountDigest) fail("codex_account_changed");
        accountDigest = current; account = true; accountDirty = false; if (complete) finalAccountRead = true;
      }
      if (rpc.method === "mcpServerStatus/list") { if (!quietMcpCatalog(result, disabled)) fail("codex_external_tools_available"); mcpVerified = true; }
      if (rpc.method === "thread/start") {
        if (thread || result?.model !== request.model || result.modelProvider !== "openai" || result.approvalPolicy !== "never" ||
          result.activePermissionProfile?.id !== "cimiloop-method" || result.instructionSources?.length !== 0 || typeof result.thread?.id !== "string") fail("codex_thread_binding_denied");
        thread = result.thread.id; if ([...earlyThreadIds].some(id => id !== thread)) fail("codex_event_identity_denied");
      }
      if (rpc.method === "turn/start") { if (turn || typeof result?.turn?.id !== "string") fail(); turn = result.turn.id; }
      continue;
    }
    const p = value.params;
    if (value.method === "account/updated" && account) {
      if (turnSent || p?.authMode !== "chatgpt") fail("codex_account_changed"); accountDirty = true;
    }
    if (version === 2 && value.method === "mcpServer/startupStatus/updated" && ["starting", "ready"].includes(p?.status)) fail("codex_external_tools_available");
    if (p?.threadId !== undefined && !thread && !turn && ["warning", "thread/status/changed"].includes(value.method) && [...sent.values()].some(rpc => rpc.method === "thread/start")) {
      earlyThreadIds.add(p.threadId); continue;
    }
    if (p?.threadId !== undefined && p.threadId !== thread) fail();
    if (p?.turnId !== undefined && p.turnId !== turn) fail();
    if (value.method === "turn/completed") { if (!turn || p.turn?.id !== turn || p.turn.status !== "completed" || p.turn.error || complete) fail(); complete = true; }
    if (["item/started", "item/completed"].includes(value.method)) {
      const item = p?.item;
      if (!item || !["agentMessage", "reasoning", "userMessage", "dynamicToolCall"].includes(item.type)) fail("codex_unapproved_effect");
      if (value.method === "item/completed" && item.type === "agentMessage" && [null, "final_answer"].includes(item.phase ?? null)) {
        if (typeof item.text !== "string" || Buffer.byteLength(item.text) > 65536) fail(); output = item.text;
      }
      if (value.method === "item/completed" && item.type === "dynamicToolCall") {
        const call = calls.get(item.id);
        if (!call || item.namespace !== null || item.status !== "completed" || item.success !== true || item.tool !== call.tool ||
          !same(item.arguments, call.arguments) || !same(item.contentItems, [{ type: "inputText", text: call.output }])) fail("codex_tool_original_unproven");
        completedCalls.add(item.id);
      }
    }
    if (value.method === "thread/tokenUsage/updated") usage = p.tokenUsage?.total;
  }
  if (!account || !finalAccountRead || !thread || !turn || !complete || !output || calls.size !== completedCalls.size || !usage ||
    !["inputTokens", "cachedInputTokens", "outputTokens", "totalTokens", "reasoningOutputTokens", "cacheWriteInputTokens"].every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0) ||
    usage.totalTokens !== usage.inputTokens + usage.outputTokens || usage.cachedInputTokens > usage.inputTokens || usage.reasoningOutputTokens > usage.outputTokens) fail();
  return { format: "cimiloop/codex-method-original/1.0.0", operation_key: request.operation_key, input_digest: digest(encode(request)).value,
    thread_id: thread, turn_id: turn, model: request.model, account_digest: accountDigest, output_text: output, tool_calls: [...calls.values()], usage, original_ref: reference };
}

export class CodexOriginalMethodRuntime {
  private readonly options: CodexOriginalMethodOptions;
  constructor(raw: CodexOriginalMethodOptions) {
    this.options = structuredClone(raw);
    const disabled = raw.disabled_mcp_servers ?? [];
    if (!Array.isArray(disabled) || disabled.length > 64 || new Set(disabled).size !== disabled.length || disabled.some(name =>
      typeof name !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(name) || ["__proto__", "constructor", "prototype"].includes(name))) fail("codex_installation_denied");
    this.options.disabled_mcp_servers = [...disabled].sort();
    if (!/^[0-9a-f]{64}$/.test(raw.command.sha256) || !Array.isArray(raw.command.args) || raw.command.args.some(v => typeof v !== "string") ||
      raw.account_digest !== undefined && !/^[0-9a-f]{64}$/.test(raw.account_digest) ||
      !Number.isSafeInteger(raw.timeout_ms ?? 180000) || (raw.timeout_ms ?? 180000) <= 0 || (raw.timeout_ms ?? 180000) > 900000) fail("codex_installation_denied");
    this.options.root = directory(resolve(raw.root));
    this.options.command.file = resolve(assertOrdinaryPath(raw.command.file));
  }
  private paths(request: CodexMethodRequest) {
    const root = assertOrdinaryPath(join(this.options.root, request.operation_key));
    return { root, cwd: join(root, "workspace"), claim: join(root, "start.json"), transcript: join(root, "stdio.jsonl"), seal: join(root, "seal.json") };
  }
  private claim(request: CodexMethodRequest, version: 1 | 2 = 2) { return { format: `cimiloop/codex-method-start/${version}.0.0`, request, command: this.options.command,
    account_digest: this.options.account_digest ?? null, config: version === 1 ? legacyConfig() : config(this.options.disabled_mcp_servers!),
    ...(version === 2 ? { disabled_mcp_servers: this.options.disabled_mcp_servers } : {}) }; }
  readOriginal(raw: CodexMethodRequest): CodexMethodOriginal | null {
    const request = requestCopy(raw), paths = this.paths(request);
    if (!existsSync(paths.claim)) return null;
    const claimBytes = bytesAt(paths.claim);
    const claim = parse(claimBytes), version = claim.format === "cimiloop/codex-method-start/1.0.0" ? 1 : 2;
    if (!same(claim, this.claim(request, version))) fail("codex_original_input_changed");
    if (!existsSync(paths.seal)) return null;
    const seal = parse(bytesAt(paths.seal)), transcript = bytesAt(paths.transcript, MAX_BYTES);
    if (seal.format !== "cimiloop/codex-method-seal/1.0.0" || seal.claim_digest !== digest(claimBytes).value || seal.transcript_digest !== digest(transcript).value ||
      !same(seal.claim_identity, fileIdentity(paths.claim)) || !same(seal.transcript_identity, fileIdentity(paths.transcript))) fail();
    const lines = transcript.toString("utf8").split("\n"); if (lines.pop() !== "" || lines.length > 8192) fail();
    const frames = lines.map(line => parse(Buffer.from(line)) as Frame);
    const ref = { provider: "codex_app_server", resource_type: "skill_invocation_proof", locator: paths.transcript, digest: digest(transcript) };
    return originalFromFrames(request, paths.cwd, frames, ref, this.options.account_digest, version, this.options.disabled_mcp_servers);
  }
  async execute(raw: CodexMethodRequest, tool: (name: string, args: unknown, original: CodexMethodToolContext) => string | Promise<string>, beforeEffect: () => void, signal?: AbortSignal, parentAdmission?: CodexMethodAdmission): Promise<CodexMethodOriginal> {
    const request = requestCopy(raw), paths = this.paths(request), admission = parentAdmission ? structuredClone(parentAdmission) : undefined;
    if (admission && (Object.keys(admission).sort().join(",") !== "account_digest,model" || admission.model !== request.model ||
      !/^[0-9a-f]{64}$/.test(admission.account_digest) || this.options.account_digest && this.options.account_digest !== admission.account_digest)) fail("codex_parent_admission_denied");
    const previous = this.readOriginal(request);
    if (previous) {
      if (admission && previous.account_digest !== admission.account_digest) fail("codex_parent_admission_denied");
      return previous;
    }
    if (existsSync(paths.claim)) fail("codex_original_pending");
    if (signal?.aborted) fail("codex_original_cancelled");
    guardNow(beforeEffect);
    const binary = bytesAt(this.options.command.file, 512 * 1024 * 1024);
    if (digest(binary).value !== this.options.command.sha256) fail("codex_binary_changed");
    if (signal?.aborted) fail("codex_original_cancelled");
    directory(paths.cwd); save(paths.claim, this.claim(request));
    // The exclusive durable start is deliberately never rolled back, including
    // a crash before spawn. A retry may inspect originals, never start again.
    const fd = openSync(assertOrdinaryPath(paths.transcript), "wx");
    let total = 0, closed = false, stopping = false, terminal = false, active = true, childDidClose = false, child: ChildProcessWithoutNullStreams | undefined;
    const controller = new AbortController(), deadline = performance.now() + (this.options.timeout_ms ?? 180000);
    const effectGuard = () => {
      if (!active || controller.signal.aborted || performance.now() >= deadline) fail("codex_effect_closed");
      guardNow(beforeEffect);
      if (!active || controller.signal.aborted || performance.now() >= deadline) fail("codex_effect_closed");
    };
    const append = (direction: Frame["direction"], bytes: Buffer) => {
      const frame = Buffer.concat([encode({ direction, bytes: bytes.toString("base64") }), Buffer.from("\n")]);
      if (bytes.length > MAX_LINE || total + frame.length > MAX_BYTES) fail("codex_capacity_exhausted");
      writeFileSync(fd, frame); fsyncSync(fd); total += frame.length;
    };
    let next = 0, thread = "", turn = "", buffered = Buffer.alloc(0), errors = 0, toolCalls = 0;
    const serverIds = new Set<string | number>(), callIds = new Set<string>();
    const earlyThreadIds = new Set<string>(); let startingThread = false;
    let admittedAccount = "", turnSent = false, accountDirty = false;
    const pending = new Map<number, { method: string; resolve(value: any): void; reject(error: unknown): void }>();
    let finish!: () => void, rejectFinished!: (error: unknown) => void;
    const finished = new Promise<void>((resolve, reject) => { finish = resolve; rejectFinished = reject; });
    void finished.catch(() => {});
    let rejectFailure!: (error: unknown) => void, childClose!: () => void;
    const failure = new Promise<never>((_resolve, reject) => { rejectFailure = reject; }); void failure.catch(() => {});
    const childClosed = new Promise<void>(resolve => { childClose = resolve; });
    const rejectAll = (error: unknown) => { active = false; controller.abort(); for (const p of pending.values()) p.reject(error); pending.clear(); rejectFinished(error); rejectFailure(error); child?.kill(); };
    const onAbort = () => rejectAll(new RuntimeAdapterError("codex_original_cancelled"));
    const send = (value: unknown) => { effectGuard(); const bytes = Buffer.concat([encode(value), Buffer.from("\n")]); append("out", bytes); child!.stdin.write(bytes); };
    const rpc = (method: string, params: unknown) => new Promise<any>((resolve, reject) => {
      const id = ++next; pending.set(id, { method, resolve, reject });
      try { send({ id, method, params }); } catch (error) { pending.delete(id); reject(error); }
    });
    let queue = Promise.resolve();
    const accept = async (line: Buffer) => {
      if (closed) fail("codex_effect_closed");
      append("in", line); const value = parse(line);
      const accountRpc = value.id !== undefined && !value.method && pending.get(value.id)?.method === "account/read";
      if (terminal && !accountRpc && (value.id !== undefined || !["thread/tokenUsage/updated", "thread/status/changed"].includes(value.method))) fail("codex_post_terminal_effect");
      if (value.method && value.id !== undefined) {
        const p = value.params;
        if (value.method !== "item/tool/call" || !thread || !turn || p?.threadId !== thread || p.turnId !== turn || p.namespace !== null ||
          !request.tools.some(t => t.name === p.tool) || ++toolCalls > MAX_CALLS || typeof p.callId !== "string" ||
          serverIds.has(value.id) || callIds.has(p.callId)) fail("codex_tool_denied");
        // Reserve both original call identities BEFORE calling a potentially
        // effectful client tool. Duplicate/conflicting delivery never re-enters it.
        serverIds.add(value.id); callIds.add(p.callId);
        effectGuard();
        const callGuard = () => { if (terminal) fail("codex_effect_closed"); effectGuard(); };
        const output = await tool(p.tool, structuredClone(p.arguments), Object.freeze({ call_id: p.callId, thread_id: thread, turn_id: turn, model: request.model, account_digest: admittedAccount, signal: controller.signal, beforeEffect: callGuard }));
        callGuard();
        if (typeof output !== "string" || Buffer.byteLength(output) > 256 * 1024) fail("codex_tool_output_denied");
        send({ id: value.id, result: { contentItems: [{ type: "inputText", text: output }], success: true } }); return;
      }
      if (value.id !== undefined) {
        const p = pending.get(value.id); if (!p) fail("codex_rpc_identity_denied");
        if (p!.method === "account/read" && !value.error) {
          const current = codexChatGptAccountDigest(value.result);
          if (admittedAccount && current !== admittedAccount || admission && current !== admission.account_digest || this.options.account_digest && current !== this.options.account_digest) fail("codex_account_changed");
          accountDirty = false;
        }
        pending.delete(value.id);
        value.error ? p!.reject(new RuntimeAdapterError("codex_rpc_failed")) : p!.resolve(value.result); return;
      }
      const p = value.params;
      if (value.method === "account/updated" && admittedAccount) {
        if (turnSent || p?.authMode !== "chatgpt") fail("codex_account_changed"); accountDirty = true;
      }
      if (value.method === "mcpServer/startupStatus/updated" && ["starting", "ready"].includes(p?.status)) fail("codex_external_tools_available");
      if (p?.threadId !== undefined && !thread && !turn && startingThread && ["warning", "thread/status/changed"].includes(value.method)) {
        earlyThreadIds.add(p.threadId); return;
      }
      if (["item/started", "item/completed"].includes(value.method) && !["agentMessage", "reasoning", "userMessage", "dynamicToolCall"].includes(p?.item?.type)) fail("codex_unapproved_effect");
      if (p?.threadId !== undefined && p.threadId !== thread || p?.turnId !== undefined && p.turnId !== turn) fail("codex_event_identity_denied");
      if (value.method === "turn/completed") {
        if (p?.turn?.id !== turn || p.turn.status !== "completed" || p.turn.error) fail("codex_turn_incomplete"); terminal = true; finish();
      }
    };
    const timer = setTimeout(() => rejectAll(new RuntimeAdapterError("codex_original_timeout")), this.options.timeout_ms ?? 180000);
    try {
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
      effectGuard();
      child = spawn(this.options.command.file, [...this.options.command.args, "app-server", "--stdio", ...Object.entries(config(this.options.disabled_mcp_servers!)).flatMap(([key, value]) => ["-c", key + "=" + toml(value)])],
        { cwd: paths.cwd, windowsHide: true, stdio: "pipe", env: childEnvironment() });
      child.on("error", rejectAll); child.stdin.on("error", rejectAll);
      child.stdout.on("data", (chunk: Buffer) => {
        buffered = Buffer.concat([buffered, chunk]);
        for (;;) { const end = buffered.indexOf(10); if (end < 0) break; const line = Buffer.from(buffered.subarray(0, end + 1)); buffered = buffered.subarray(end + 1);
          queue = queue.then(() => accept(line)); void queue.catch(rejectAll); }
        if (buffered.length > MAX_LINE) rejectAll(new RuntimeAdapterError("codex_capacity_exhausted"));
      });
      // Never expose server diagnostics (which may include local configuration)
      // to method context or product error messages. Bound them in memory only.
      child.stderr.on("data", (bytes: Buffer) => { errors += bytes.length; if (errors > MAX_LINE) rejectAll(new RuntimeAdapterError("codex_capacity_exhausted")); });
      child.on("close", () => { childDidClose = true; childClose(); if (!closed && !stopping) void queue.then(() => { if (!terminal) rejectAll(new RuntimeAdapterError("codex_original_response_lost")); }).catch(rejectAll); });
      await rpc("initialize", { clientInfo: { name: "cimiloop_s1", title: "CimiLoop", version: "0.1.0" }, capabilities: { experimentalApi: true } });
      send({ method: "initialized" });
      const account = await rpc("account/read", { refreshToken: false });
      admittedAccount = codexChatGptAccountDigest(account);
      if (this.options.account_digest && admittedAccount !== this.options.account_digest || admission && admittedAccount !== admission.account_digest) fail("codex_account_changed");
      startingThread = true;
      const start = await rpc("thread/start", startParams(request, paths.cwd));
      if (start?.model !== request.model || start.modelProvider !== "openai" || start.instructionSources?.length !== 0 || start.approvalPolicy !== "never" || start.activePermissionProfile?.id !== "cimiloop-method" || typeof start.thread?.id !== "string") fail("codex_thread_binding_denied");
      thread = start.thread.id; startingThread = false;
      if ([...earlyThreadIds].some(id => id !== thread)) fail("codex_event_identity_denied");
      const inventory = await rpc("mcpServerStatus/list", { threadId: thread, limit: 100, detail: "toolsAndAuthOnly" });
      if (!quietMcpCatalog(inventory, this.options.disabled_mcp_servers!)) fail("codex_external_tools_available");
      const readyAccount = await rpc("account/read", { refreshToken: false });
      if (codexChatGptAccountDigest(readyAccount) !== admittedAccount) fail("codex_account_changed");
      // Drain notifications already received alongside the account response.
      // Resolving the RPC wakes this continuation before subsequent queue jobs.
      await queue;
      if (accountDirty) fail("codex_account_changed"); turnSent = true;
      const started = await rpc("turn/start", { threadId: thread, model: request.model, effort: "medium", input: [{ type: "text", text: request.prompt, text_elements: [] }], outputSchema: request.output_schema });
      if (typeof started?.turn?.id !== "string") fail(); turn = started.turn.id;
      await finished; await queue;
      const finalAccount = await rpc("account/read", { refreshToken: false });
      if (codexChatGptAccountDigest(finalAccount) !== admittedAccount) fail("codex_account_changed");
      stopping = true; child.stdin.end(); child.kill();
      await Promise.race([childClosed, failure]); await queue;
      if (buffered.length) { append("in", buffered); fail("codex_truncated_original"); }
      effectGuard();
      const transcript = bytesAt(paths.transcript, MAX_BYTES);
      const ref = { provider: "codex_app_server", resource_type: "skill_invocation_proof", locator: paths.transcript, digest: digest(transcript) };
      const frames = transcript.toString("utf8").trimEnd().split("\n").map(line => parse(Buffer.from(line)) as Frame);
      originalFromFrames(request, paths.cwd, frames, ref, this.options.account_digest, 2, this.options.disabled_mcp_servers);
      save(paths.seal, { format: "cimiloop/codex-method-seal/1.0.0", claim_digest: digest(bytesAt(paths.claim)).value, transcript_digest: digest(transcript).value,
        claim_identity: fileIdentity(paths.claim), transcript_identity: fileIdentity(paths.transcript) });
      return this.readOriginal(request) ?? fail();
    } finally {
      signal?.removeEventListener("abort", onAbort);
      closed = true; active = false; controller.abort(); clearTimeout(timer); child?.stdin.destroy(); child?.kill();
      for (const p of pending.values()) p.reject(new RuntimeAdapterError("codex_connection_closed")); pending.clear();
      if (child && !childDidClose) {
        // A failed/aborted tool may still be awaiting its own cancellation.
        // Stop and wait for the owned server, without waiting forever for that
        // tool. Missing shutdown proof retains pending originals, never success.
        let stopTimer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([childClosed, new Promise<void>(resolve => { stopTimer = setTimeout(resolve, 3000); })]);
        if (stopTimer) clearTimeout(stopTimer);
      }
      closeSync(fd);
    }
  }
}
