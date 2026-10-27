import {assertCodexProgramBundle,readCodexProgramBundle,type CodexProgramBundle,type CodexProgramBundleSnapshot} from './codex-program-bundle.js';
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, realpathSync, writeFileSync } from "node:fs";
import { dirname,isAbsolute,join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { ExternalReference } from "@cimiloop/protocol/v2";
import { assertOrdinaryPath, bytesAt, digest, directory, RuntimeAdapterError } from "./files.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import {parseCodexUsagePolicy,parseCodexOrdinaryQuota,CODEX_QUOTA_READ_PARAMS,type CodexOrdinaryUsagePolicy,type CodexOrdinaryQuotaSnapshot} from './codex-ordinary-quota.js';
import { AgentStartLedger,captureAgentStartOriginReference,readAgentStartOriginalReference,type AgentStartOriginReference } from './agent-start-ledger.js';
import {prepareCodexProcessJob,readCodexProcessLaunch,spawnCodexProcessJob,readCompletedCodexProcessJob,readStartedCodexProcessJob,readCodexProcessJobResources,requestCodexProcessJobCancellation,codexProcessLayout,CODEX_CONTAINED_PROXY_POLICY} from './codex-process-job.js';
import {CODEX_PRIVATE_USER_ENVIRONMENT_POLICY,codexPrivateUserEnvironment,codexPrivateUserDirectories,codexPrivateAppContainerTemp} from './codex-private-environment.js';
import {assertOwnedFixedVolumeRuntimePaths,type FixedVolumeRuntimeStorage,type FixedVolumeRuntimeScope} from './fixed-volume-quota.js';
import type {AgentStartTicket} from './agent-start-ledger.js';

const MAX_BYTES = 8 * 1024 * 1024, MAX_LINE = 1024 * 1024, MAX_CALLS = 128, MAX_FRAMES = 8192;
const fail: (reason?:string)=>never = (reason = "codex_original_unproven") => { throw new RuntimeAdapterError(reason); };
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
const directoryIdentity = (path: string) => {
  const stat = lstatSync(assertOrdinaryPath(path), { bigint: true });
  if (!stat.isDirectory() || stat.ino <= 0n) fail();
  return { dev: String(stat.dev), ino: String(stat.ino), birth: String(stat.birthtimeNs) };
};
const policyNamespace = 'codex_method_transport';
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
  reasoning_effort?: "low" | "medium";
  usage_policy?: CodexOrdinaryUsagePolicy;
  quota_account_digest?: string;
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
  ordinary_quota?:{before:CodexOrdinaryQuotaSnapshot;after:CodexOrdinaryQuotaSnapshot;costs_reconciled:false};
}
export interface CodexOriginalMethodOptions {
  root: string;
  // A trusted launcher supplies a pinned executable and fixed prefix arguments.
  // This is NOT a serialized install/qualification or a model-supplied command.
  command: { file: string; args: string[]; sha256: string };
  account_digest?: string;
  timeout_ms?: number;
  disabled_mcp_servers?: string[];
  // Prospective Agent policy; the existing login home remains untouched.
  state_policy?: 'private_operation_state/1.0.0'|'private_login_home/2.0.0';
  environment_policy?:typeof CODEX_PRIVATE_USER_ENVIRONMENT_POLICY;
  login_home?:CodexLoginHome;
  process_custody?:'owner_job/1.0.0';
  process_origin?:AgentStartOriginReference;
  process_root?:string;
  // Recorded data alone is read-only. New effects additionally require the
  // code-owned FixedVolumeRuntimeStorage supplied to the constructor.
  write_confinement?:CodexWriteConfinement;
  network_policy?:typeof CODEX_CONTAINED_PROXY_POLICY;
  program_bundle?:CodexProgramBundleSnapshot;
  // Every new delegated method uses this trusted transport policy. Legacy
  // sealed originals keep their recorded policy during read-only replay.
  usage_policy?: CodexOrdinaryUsagePolicy;
}
export interface CodexWriteConfinement {
 format:'cimiloop/codex-fixed-volume-confinement/1.0.0';
 scope:FixedVolumeRuntimeScope;quota_ticket:AgentStartTicket;runtime_ticket:AgentStartTicket;
 network_mode:'deny_all';
}
function confinementBinding(proof:ReturnType<typeof assertOwnedFixedVolumeRuntimePaths>):CodexWriteConfinement {
 return{format:'cimiloop/codex-fixed-volume-confinement/1.0.0',scope:proof.scope,quota_ticket:proof.policy_ticket,runtime_ticket:proof.runtime_ticket,network_mode:'deny_all'};
}
function checkedConfinement(raw:unknown):CodexWriteConfinement {
 const value=raw as CodexWriteConfinement;
 if(!value||Object.keys(value).sort().join(',')!=='format,network_mode,quota_ticket,runtime_ticket,scope'||value.format!=='cimiloop/codex-fixed-volume-confinement/1.0.0'||value.network_mode!=='deny_all'||!value.scope||Object.keys(value.scope).sort().join(',')!=='data_directory,project_id,repository_path'||typeof value.scope.project_id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.scope.project_id)||[value.scope.repository_path,value.scope.data_directory].some(path=>typeof path!=='string'||!isAbsolute(path))||[value.quota_ticket,value.runtime_ticket].some(ticket=>!ticket||typeof ticket!=='object'||!Object.keys(ticket).length))fail('codex_write_confinement_unproven');
 for(const ticket of [value.quota_ticket,value.runtime_ticket])if(Object.keys(ticket).sort().join(',')!=='basis_digest,format,identity_digest,ticket_id'||ticket.format!=='cimiloop/agent-start-ticket/1.0.0'||![ticket.basis_digest,ticket.identity_digest].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))||typeof ticket.ticket_id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(ticket.ticket_id))fail('codex_write_confinement_unproven');
 if(value.quota_ticket.identity_digest!==value.runtime_ticket.identity_digest)fail('codex_write_confinement_unproven');return structuredClone(value);
}
export interface CodexLoginHome {path:string;identity:{dev:string;ino:string;birth:string}}
export function captureCodexLoginHome(path:string):CodexLoginHome{return{path:resolve(assertOrdinaryPath(path)),identity:directoryIdentity(path)};}
function checkedLoginHome(raw:unknown):CodexLoginHome {
 const value=raw as CodexLoginHome;
 if(!value||Object.keys(value).sort().join(',')!=='identity,path'||typeof value.path!=='string'||!isAbsolute(value.path)||resolve(value.path)!==value.path||!value.identity||Object.keys(value.identity).sort().join(',')!=='birth,dev,ino'||Object.values(value.identity).some(v=>typeof v!=='string'||!/^\d+$/.test(v))||BigInt(value.identity.ino)<=0n)fail('codex_installation_denied');
 return structuredClone(value);
}
type StartVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
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
  if (!value || Object.keys(value).sort().join(",") !== ["instructions","model","operation_key","output_schema","prompt","tools",...(Object.hasOwn(value,'reasoning_effort')?['reasoning_effort']:[]),...(Object.hasOwn(value,'usage_policy')?['usage_policy']:[]),...(Object.hasOwn(value,'quota_account_digest')?['quota_account_digest']:[])].sort().join(',') ||
    Object.hasOwn(value,'quota_account_digest')&&(!value.usage_policy||typeof value.quota_account_digest!=='string'||!/^[a-f0-9]{64}$/.test(value.quota_account_digest)) ||
    Object.hasOwn(value,'usage_policy')&&!parseCodexUsagePolicy(value.usage_policy) ||
    Object.hasOwn(value, "reasoning_effort") && !["low", "medium"].includes(String(value.reasoning_effort)) ||
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
const version2Config = (disabled: string[]) => ({ ...legacyConfig(),
  mcp_servers: Object.fromEntries(disabled.map(name => [name, { enabled: false }])),
  // The built-in host dispatches the explicitly supplied dynamic client tools;
  // disabling it also disables those tools. It is not an external MCP server.
  features: { ...legacyConfig().features, code_mode_host: true, code_mode: false, computer_use: false, browser_use: false,
    browser_use_external: false, browser_use_full_cdp_access: false, browser_annotation_api: false, in_app_browser: false,
    plugins: false, plugin_sharing: false, skill_mcp_dependency_install: false, goals: false }
});
const config = (disabled: string[]) => ({ ...version2Config(disabled), features: { ...version2Config(disabled).features, sleep_tool: false } });
const privateState=(cwd:string)=>{const root=join(dirname(cwd),'state');return{sqlite:join(root,'sqlite'),log:join(root,'log'),temp:join(root,'temp')};};
const stateConfig=(disabled:string[],cwd:string,login=false)=>({...config(disabled),sqlite_home:privateState(cwd).sqlite,log_dir:privateState(cwd).log,history:{persistence:'none'},...(login?{cli_auth_credentials_store:'file'}:{})});
const quietMcpCatalog = (value: any, disabled: string[]) => value && Array.isArray(value.data) && value.data.length <= 128 && value.nextCursor === null &&
  value.data.every((server: any) => disabled.includes(server.name) && server.runtimeStatus === "disabled" && server.tools && Object.keys(server.tools).length === 0 &&
    Array.isArray(server.resources) && server.resources.length === 0 && Array.isArray(server.resourceTemplates) && server.resourceTemplates.length === 0 && server.toolsError === null);
function toml(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) return "{" + Object.entries(value).map(([key, item]) => JSON.stringify(key) + "=" + toml(item)).join(",") + "}";
  return JSON.stringify(value);
}
const startParams = (request: CodexMethodRequest, cwd: string,ephemeral=false) => ({ model: request.model, modelProvider: "openai", allowProviderModelFallback: false,...(ephemeral?{ephemeral:true}:{}),
  cwd, runtimeWorkspaceRoots: [cwd], approvalPolicy: "never", permissions: "cimiloop-method", baseInstructions: request.instructions,
  developerInstructions: "Only client dynamic tools are available. Do not access credentials, commands, arbitrary files, plugins, or business commands. Never claim a Human decision or domain completion.",
  dynamicTools: request.tools, selectedCapabilityRoots: [], environments: [] });
function childEnvironment(cwd?:string,home?:CodexLoginHome,policy?:typeof CODEX_PRIVATE_USER_ENVIRONMENT_POLICY) {
  const allowed = new Set(["SYSTEMROOT", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "PROGRAMDATA", "TEMP", "TMP", "CODEX_HOME", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "SSL_CERT_FILE", "SSL_CERT_DIR"]);
  const privateNames=policy&&cwd&&home?new Set(Object.keys(codexPrivateUserEnvironment(cwd,home.path))):undefined;
  const env=Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toUpperCase())&&(!cwd||!['TEMP','TMP'].includes(key.toUpperCase()))&&(!home||key.toUpperCase()!=='CODEX_HOME')&&!privateNames?.has(key.toUpperCase())));
  return {...env,...(cwd?{TEMP:privateState(cwd).temp,TMP:privateState(cwd).temp}:{}),...(home?{CODEX_HOME:home.path}:{}),...(policy&&cwd&&home?codexPrivateUserEnvironment(cwd,home.path):{})};
}

// Local explicit installation reads public login metadata only. No thread,
// model turn, auth.json, token conversion, tools or model context are involved.
export async function inspectCodexMethodLogin(options: Pick<CodexOriginalMethodOptions, "root" | "command" | "disabled_mcp_servers" | "login_home"> & {usage_policy?:CodexOrdinaryUsagePolicy}, beforeEffect: () => void): Promise<{ account_digest: string;quota_snapshot?:CodexOrdinaryQuotaSnapshot }> {
  const fixed = structuredClone(options), binary = resolve(assertOrdinaryPath(fixed.command.file));
  const home=fixed.login_home?checkedLoginHome(fixed.login_home):undefined;
  let state:{path:string;identity:ReturnType<typeof directoryIdentity>}[]=[];
  const guard=()=>{guardNow(beforeEffect);try{if(home&&!same(captureCodexLoginHome(home.path),home)||state.some(v=>!same(directoryIdentity(v.path),v.identity)))fail();}catch{fail('codex_login_home_changed');}};
  const usagePolicy=parseCodexUsagePolicy(fixed.usage_policy);
  if (!/^[a-f0-9]{64}$/.test(fixed.command.sha256) || digest(bytesAt(binary, 512 * 1024 * 1024)).value !== fixed.command.sha256) fail("codex_binary_changed");
  guard();
  const cwd = directory(resolve(fixed.root)), disabled = fixed.disabled_mcp_servers ?? [];
  if (disabled.length > 64 || disabled.some(name => !/^[A-Za-z0-9_-]{1,64}$/.test(name) || ["__proto__", "constructor", "prototype"].includes(name))) fail("codex_installation_denied");
  if(home){state=Object.values(privateState(cwd)).map(path=>({path:directory(path),identity:directoryIdentity(path)}));}guard();
  const child = spawn(binary, [...fixed.command.args, "app-server", "--stdio", ...Object.entries(home?stateConfig(disabled,cwd,true):config(disabled)).flatMap(([key, value]) => ["-c", key + "=" + toml(value)])], { cwd, windowsHide: true, stdio: "pipe", env: childEnvironment(home?cwd:undefined,home) });
  let next = 0, buffered = Buffer.alloc(0), total = 0, stopping = false, failed = false, childDidClose = false;
  const pending = new Map<number, { resolve(value: any): void; reject(error: unknown): void }>();
  let closed!: () => void; const childClosed = new Promise<void>(resolve => { closed = resolve; });
  let rejectFailure!: (error: unknown) => void;
  const failure = new Promise<never>((_resolve, reject) => { rejectFailure = reject; }); void failure.catch(() => {});
  const rejectAll = () => { failed = true; const error = new RuntimeAdapterError("codex_login_inspection_failed"); for (const p of pending.values()) p.reject(error); pending.clear(); rejectFailure(error); child.kill(); };
  const timer = setTimeout(rejectAll, 15000);
  const send = (value: unknown) => { if (failed) fail("codex_login_inspection_failed"); guard(); child.stdin.write(Buffer.concat([encode(value), Buffer.from("\n")])); };
  const rpc = (method: string, params: unknown) => new Promise<any>((resolve, reject) => { const id = ++next; pending.set(id, { resolve, reject }); try { send({ id, method, params }); } catch (e) { pending.delete(id); reject(e); } });
  child.on("error", rejectAll); child.stdin.on("error", rejectAll);
  child.stderr.on("data", (data: Buffer) => { total += data.length; if (total > MAX_LINE) rejectAll(); });
  child.stdout.on("data", (data: Buffer) => {
    try {
      total += data.length; if (total > MAX_LINE) fail(); buffered = Buffer.concat([buffered, data]);
      for (;;) { const end = buffered.indexOf(10); if (end < 0) break; const value = parse(buffered.subarray(0, end + 1)); buffered = buffered.subarray(end + 1);
        if (value.id !== undefined) { const p = pending.get(value.id); if (!p || value.method || value.error) fail(); pending.delete(value.id); p!.resolve(value.result); }
      }
    } catch { rejectAll(); }
  });
  child.on("close", () => { childDidClose = true; closed(); if (!stopping) rejectAll(); });
  try {
    await rpc("initialize", { clientInfo: { name: "cimiloop_s1_install", version: "0.1.0" }, capabilities: { experimentalApi: true } });
    send({ method: "initialized" });
    const account_digest = codexChatGptAccountDigest(await rpc("account/read", { refreshToken: false }));
    const quota_snapshot=usagePolicy?parseCodexOrdinaryQuota(await rpc('account/rateLimits/read',CODEX_QUOTA_READ_PARAMS)):undefined;
    if(usagePolicy&&codexChatGptAccountDigest(await rpc('account/read',{refreshToken:false}))!==account_digest)fail('codex_account_changed');
    guard(); if (digest(bytesAt(binary, 512 * 1024 * 1024)).value !== fixed.command.sha256) fail("codex_binary_changed");
    stopping = true; child.stdin.end(); child.kill(); await Promise.race([childClosed, failure]);
    if (failed || buffered.length) fail("codex_login_inspection_failed"); guard();
    return { account_digest,...(quota_snapshot?{quota_snapshot}:{}) };
  } finally {
    clearTimeout(timer); stopping = true; child.stdin.destroy(); child.kill(); rejectAll();
    if (!childDidClose) { let stopTimer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([childClosed, new Promise<void>(resolve => { stopTimer = setTimeout(resolve, 3000); })]); if (stopTimer) clearTimeout(stopTimer);
    }
  }
}

// Interpret retained *actual app-server stdio*, independently of the final model
// message. This does not assert HTTP wire bytes, Skill behavior qualification,
// native isolation acceptance, provider bills, or Kernel business completion.
function originalFromFrames(request: CodexMethodRequest, cwd: string, frames: Frame[], reference: ExternalReference, expectedAccount?: string, version: StartVersion = 1, disabled: string[] = []): CodexMethodOriginal {
  const sent = new Map<number | string, any>(), incoming = new Map<number | string, any>();
  let thread = "", turn = "", account = false, complete = false, output = "", usage: any, accountDigest = "", finalAccountRead = false;
  const earlyThreadIds = new Set<string>();
  let accountDirty = false, turnSent = false, mcpVerified = version === 1;
  let quotaDirty=false,quotaAccountReady=false;const quotas:CodexOrdinaryQuotaSnapshot[]=[],answered=new Set<number|string>();
  const accountReadStages=new Map<number|string,{ready:boolean;final:boolean}>();
  const calls = new Map<string, CodexMethodToolCall>(), completedCalls = new Set<string>();
  for (const frame of frames) {
    const bytes = Buffer.from(frame.bytes, "base64");
    if (bytes.toString("base64") !== frame.bytes || bytes.length > MAX_LINE || bytes.at(-1) !== 10) fail();
    const value = parse(bytes);
    const accountRpc = frame.direction === "out" ? value.method === "account/read"||version>=5&&value.method==='account/rateLimits/read' : value.id !== undefined && !value.method && (sent.get(value.id)?.method === "account/read"||version>=5&&sent.get(value.id)?.method==='account/rateLimits/read');
    if (complete && !accountRpc && (frame.direction === "out" || value.id !== undefined || !["thread/tokenUsage/updated", "thread/status/changed",...(version>=5?['account/rateLimits/updated']:[])].includes(value.method))) fail("codex_post_terminal_effect");
    if (frame.direction === "out") {
      if (value.method) {
        if (!["initialize", "initialized", "account/read", "thread/start", "turn/start", "mcpServerStatus/list",...(version>=5?['account/rateLimits/read']:[])].includes(value.method)) fail();
        if(version>=5&&value.method==='account/read'){
          if(!same(value.params,{refreshToken:false}))fail('codex_ordinary_quota_unproven');
          accountReadStages.set(value.id,{ready:!!thread&&mcpVerified&&!turnSent,final:complete});
        }
        if(value.method==='account/rateLimits/read'&&(!account||!thread||!mcpVerified||accountDirty||!(complete?finalAccountRead:quotaAccountReady)||!same(value.params,CODEX_QUOTA_READ_PARAMS)||turnSent&&!complete||quotas.length!==(complete?1:0)))fail('codex_ordinary_quota_unproven');
        if (value.id !== undefined) { if (sent.has(value.id)) fail(); sent.set(value.id, value); }
        if (value.method === "thread/start" && (!account || !same(value.params, startParams(request, cwd,version>=8)))) fail();
        if (value.method === "turn/start" && (!thread || turn || accountDirty || version>=5&&(quotaDirty||quotas.length!==1||quotas[0]!.ordinary_usage_allowed!==true||quotas[0]!.account_id_digest===null) || !mcpVerified || value.params.threadId !== thread || value.params.model !== request.model || value.params.effort !== (request.reasoning_effort ?? "medium") ||
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
      if(version>=5){if(answered.has(value.id))fail('codex_rpc_identity_denied');answered.add(value.id);}
      const result = value.result;
      if (rpc.method === "account/read") {
        const current = codexChatGptAccountDigest(result);
        if (expectedAccount && current !== expectedAccount || accountDigest && current !== accountDigest) fail("codex_account_changed");
        accountDigest = current; account = true; accountDirty = false;
        if(complete&&(version<5||accountReadStages.get(value.id)?.final===true))finalAccountRead=true;
        if(version>=5&&thread&&mcpVerified&&!turnSent&&accountReadStages.get(value.id)?.ready===true)quotaAccountReady=true;
      }
      if(rpc.method==='account/rateLimits/read'){
        const snapshot=parseCodexOrdinaryQuota(result);if(quotas.length>=2||snapshot.account_id_digest===null||request.quota_account_digest&&snapshot.account_id_digest!==request.quota_account_digest||quotas.length===0&&(turnSent||snapshot.ordinary_usage_allowed!==true)||quotas.length===1&&(!complete||snapshot.account_id_digest!==quotas[0]!.account_id_digest))fail('codex_ordinary_quota_unproven');quotas.push(snapshot);quotaDirty=false;
      }
      if (rpc.method === "mcpServerStatus/list") { if (!quietMcpCatalog(result, disabled)) fail("codex_external_tools_available"); mcpVerified = true; }
      if (rpc.method === "thread/start") {
        if (thread || result?.model !== request.model || result.modelProvider !== "openai" || result.approvalPolicy !== "never" ||
          result.activePermissionProfile?.id !== "cimiloop-method" || result.instructionSources?.length !== 0 || typeof result.thread?.id !== "string" || version>=8&&result.thread.ephemeral!==true) fail("codex_thread_binding_denied");
        thread = result.thread.id; if ([...earlyThreadIds].some(id => id !== thread)) fail("codex_event_identity_denied");
      }
      if (rpc.method === "turn/start") { if (turn || typeof result?.turn?.id !== "string") fail(); turn = result.turn.id; }
      continue;
    }
    const p = value.params;
    if (value.method === "account/updated" && account) {
      if (turnSent || p?.authMode !== "chatgpt") fail("codex_account_changed"); accountDirty = true;
    }
    if(version>=5&&value.method==='account/rateLimits/updated'&&!turnSent)quotaDirty=true;
    if (version >= 2 && value.method === "mcpServer/startupStatus/updated" && ["starting", "ready"].includes(p?.status)) fail("codex_external_tools_available");
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
  if(version>=5&&quotas.length!==2)fail('codex_ordinary_quota_unproven');
  return { format: "cimiloop/codex-method-original/1.0.0",...(version>=5?{ordinary_quota:{before:quotas[0]!,after:quotas[1]!,costs_reconciled:false as const}}:{}), operation_key: request.operation_key, input_digest: digest(encode(request)).value,
    thread_id: thread, turn_id: turn, model: request.model, account_digest: accountDigest, output_text: output, tool_calls: [...calls.values()], usage, original_ref: reference };
}

export class CodexOriginalMethodRuntime {
  private readonly options: CodexOriginalMethodOptions;
  constructor(raw: CodexOriginalMethodOptions, private readonly readOnly = false, private readonly policyOrigin?: AgentStartLedger, private readonly writeStorage?:FixedVolumeRuntimeStorage,private readonly programs?:CodexProgramBundle) {
    this.options = structuredClone(raw);
    if(programs!==undefined||Object.hasOwn(raw,'program_bundle')){
      if(raw.network_policy!==CODEX_CONTAINED_PROXY_POLICY)fail('codex_program_bundle_unproven');
      const bundle=readOnly?readCodexProgramBundle(raw.program_bundle,raw.command):assertCodexProgramBundle(programs,raw.command);
      if(raw.program_bundle&&!same(raw.program_bundle,bundle))fail('codex_program_bundle_unproven');this.options.program_bundle=bundle;
    }
    if(Object.hasOwn(raw,'network_policy')&&(raw.network_policy!==CODEX_CONTAINED_PROXY_POLICY||!readOnly&&!writeStorage||readOnly&&!raw.write_confinement))fail('codex_network_boundary_unproven');
    if(writeStorage!==undefined||Object.hasOwn(raw,'write_confinement')){
      try{
        if(raw.environment_policy!==CODEX_PRIVATE_USER_ENVIRONMENT_POLICY||raw.state_policy!=='private_login_home/2.0.0'||!raw.login_home||raw.process_custody!=='owner_job/1.0.0')fail();
        if(readOnly)this.options.write_confinement=checkedConfinement(raw.write_confinement);
        else{
          const binding=confinementBinding(assertOwnedFixedVolumeRuntimePaths(writeStorage,[raw.root,raw.login_home.path,...(raw.process_root?[raw.process_root]:[])]));
          if(!policyOrigin||binding.runtime_ticket.identity_digest!==policyOrigin.identityDigest||raw.write_confinement&&!same(raw.write_confinement,binding))fail();
          this.options.write_confinement=binding;
        }
      }catch{fail('codex_write_confinement_unproven');}
    }
    if(Object.hasOwn(raw,'process_custody')){
      if(raw.process_custody!=='owner_job/1.0.0'||!raw.state_policy||!readOnly&&!(policyOrigin instanceof AgentStartLedger))fail('codex_process_custody_unproven');
      const origin=policyOrigin?captureAgentStartOriginReference(policyOrigin):raw.process_origin;
      if(!origin||raw.process_origin&&!same(origin,raw.process_origin))fail('codex_process_custody_unproven');
      readAgentStartOriginalReference(origin,[]);this.options.process_origin=origin;
      if(this.options.write_confinement){
        const binding=checkedConfinement(this.options.write_confinement),rows=readAgentStartOriginalReference(origin,['fixed_volume_quota','fixed_volume_runtime']);
        if(!rows.some(row=>row.namespace==='fixed_volume_quota'&&same(row.ticket,binding.quota_ticket))||!rows.some(row=>row.namespace==='fixed_volume_runtime'&&same(row.ticket,binding.runtime_ticket)&&same(row.basis,{format:'cimiloop/fixed-volume-runtime/1.0.0',scope:binding.scope,quota_ticket:binding.quota_ticket})))fail('codex_write_confinement_unproven');
      }
      if(raw.process_root!==undefined){if(typeof raw.process_root!=='string'||!isAbsolute(raw.process_root))fail('codex_process_custody_unproven');this.options.process_root=resolve(assertOrdinaryPath(raw.process_root));}
    }else if(Object.hasOwn(raw,'process_origin')||Object.hasOwn(raw,'process_root'))fail('codex_process_custody_unproven');
    if(Object.hasOwn(raw,'state_policy')&&(!['private_operation_state/1.0.0','private_login_home/2.0.0'].includes(String(raw.state_policy))||raw.usage_policy!==undefined)||(raw.state_policy==='private_login_home/2.0.0')!==Object.hasOwn(raw,'login_home'))fail('codex_installation_denied');
    if(raw.login_home)this.options.login_home=checkedLoginHome(raw.login_home);
    if(Object.hasOwn(raw,'environment_policy')&&(raw.environment_policy!==CODEX_PRIVATE_USER_ENVIRONMENT_POLICY||raw.state_policy!=='private_login_home/2.0.0'||!raw.login_home||raw.process_custody!=='owner_job/1.0.0'))fail('codex_installation_denied');
    if(Object.hasOwn(raw,'usage_policy')&&!parseCodexUsagePolicy(raw.usage_policy))fail('codex_installation_denied');
    if (raw.usage_policy && !(policyOrigin instanceof AgentStartLedger)) fail('codex_transport_origin_required');
    const disabled = raw.disabled_mcp_servers ?? [];
    if (!Array.isArray(disabled) || disabled.length > 64 || new Set(disabled).size !== disabled.length || disabled.some(name =>
      typeof name !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(name) || ["__proto__", "constructor", "prototype"].includes(name))) fail("codex_installation_denied");
    this.options.disabled_mcp_servers = [...disabled].sort();
    if (!/^[0-9a-f]{64}$/.test(raw.command.sha256) || !Array.isArray(raw.command.args) || raw.command.args.some(v => typeof v !== "string") ||
      raw.account_digest !== undefined && !/^[0-9a-f]{64}$/.test(raw.account_digest) ||
      !Number.isSafeInteger(raw.timeout_ms ?? 180000) || (raw.timeout_ms ?? 180000) <= 0 || (raw.timeout_ms ?? 180000) > 900000) fail("codex_installation_denied");
    this.options.root = readOnly ? resolve(assertOrdinaryPath(raw.root)) : directory(resolve(raw.root));
    if (readOnly && !lstatSync(this.options.root).isDirectory()) fail("codex_original_unproven");
    this.options.command.file = resolve(assertOrdinaryPath(raw.command.file));
  }
  get originalConfiguration(): CodexOriginalMethodOptions { return structuredClone(this.options); }
  static readRetained(options: CodexOriginalMethodOptions, request: CodexMethodRequest, policyOrigin?: AgentStartLedger): CodexMethodOriginal | null {
    return new CodexOriginalMethodRuntime(options, true, policyOrigin).readOriginal(request);
  }
  static readProcessResourcesRetained(options:CodexOriginalMethodOptions,raw:CodexMethodRequest){return new CodexOriginalMethodRuntime(options,true).readProcessResources(raw);}
  private paths(request: CodexMethodRequest) {
    const root = assertOrdinaryPath(join(this.options.root, request.operation_key));
    return { root, cwd: join(root, "workspace"), claim: join(root, "start.json"), transcript: join(root, "stdio.jsonl"), seal: join(root, "seal.json") };
  }
  private startVersion(request:CodexMethodRequest):StartVersion{return this.options.program_bundle?14:this.options.network_policy?13:this.options.write_confinement?12:this.options.environment_policy?11:this.options.process_custody?10:this.options.state_policy==='private_login_home/2.0.0'?9:this.options.state_policy?8:this.options.usage_policy?7:request.quota_account_digest?6:request.usage_policy?5:request.reasoning_effort===undefined?3:4;}
  private processArgs(request:CodexMethodRequest){const cwd=this.paths(request).cwd,configValue=stateConfig(this.options.disabled_mcp_servers!,cwd,!!this.options.login_home);return[...this.options.command.args,'app-server','--stdio',...Object.entries(configValue).flatMap(([key,value])=>['-c',key+'='+toml(value)])];}
  private processLayout(request:CodexMethodRequest){return codexProcessLayout(this.options.root,request.operation_key,this.options.process_root);}
  private processRows(request:CodexMethodRequest){return readAgentStartOriginalReference(this.options.process_origin!,['codex_process_job_intent','codex_process_job_complete','codex_process_job_prepared','codex_process_job_started']).filter(row=>row.id===this.policyKey(request));}
  private processBasis(request:CodexMethodRequest){return{format:'cimiloop/codex-process-job-intent/1.0.0',request_digest:digest(encode(request)).value,claim_digest:digest(encode(this.claim(request))).value,root_identity:directoryIdentity(this.options.root),operation_identity:directoryIdentity(this.paths(request).root),...(this.options.process_root?{process_root_identity:directoryIdentity(this.processLayout(request).helperRoot)}:{})};}
  private writeRoots(request:CodexMethodRequest){return[join(this.paths(request).root,'state'),this.options.login_home!.path];}
  private assertConfinement(request:CodexMethodRequest){
    if(this.options.program_bundle&&!same(this.options.program_bundle,assertCodexProgramBundle(this.programs,this.options.command)))fail('codex_program_bundle_unproven');
    if(!this.options.write_confinement)return;
    try{
      const layout=this.processLayout(request),proof=assertOwnedFixedVolumeRuntimePaths(this.writeStorage,[this.options.root,this.paths(request).cwd,...this.writeRoots(request),layout.helperRoot,layout.operationRoot]);
      if(!same(confinementBinding(proof),this.options.write_confinement))fail();
    }catch{fail('codex_write_confinement_unproven');}
  }
  private assertProcessConfinement(request:CodexMethodRequest,launch:ReturnType<typeof readCodexProcessLaunch>){
    if(this.options.program_bundle&&!same(launch.config.program_bundle,this.options.program_bundle))fail('codex_program_bundle_unproven');
    if(this.options.write_confinement&&(launch.config.format!==(this.options.program_bundle?'cimiloop/codex-process-launch/6.0.0':this.options.network_policy?'cimiloop/codex-process-launch/5.0.0':'cimiloop/codex-process-launch/4.0.0')||this.options.network_policy&&!same(launch.config.proxy,{policy:this.options.network_policy,timeout_ms:this.options.timeout_ms??180000})||!same(launch.config.write_scope,{format:'cimiloop/codex-write-roots/2.0.0',roots:this.writeRoots(request),network_mode:this.options.write_confinement.network_mode})))fail('codex_write_confinement_unproven');
  }
  private policyKey(request: CodexMethodRequest) {
    // Real Windows long names collapse 8.3 aliases; case folding also keeps the
    // logical slot stable after its original directory has gone missing.
    const root = realpathSync.native(assertOrdinaryPath(this.options.root));
    return digest(encode({ root: process.platform === 'win32' ? root.toUpperCase() : root,
      operation_key: process.platform === 'win32' ? request.operation_key.toUpperCase() : request.operation_key })).value;
  }
  private policyBasis(request: CodexMethodRequest) {
    return { format: 'cimiloop/codex-method-transport/1.0.0', root: this.options.root,
      root_identity: directoryIdentity(this.options.root), operation_key: request.operation_key,
      operation_identity: directoryIdentity(this.paths(request).root), claim_digest: digest(encode(this.claim(request, 7))).value };
  }
  private claim(request: CodexMethodRequest, version: StartVersion = this.startVersion(request)) {
    const login=version===9||version>=10&&this.options.state_policy==='private_login_home/2.0.0';
    if((version>=10)!==!!this.options.process_custody||(version>=10)!==!!this.options.process_origin||(version>=11)!==Object.hasOwn(this.options,'environment_policy')||(version>=12)!==Object.hasOwn(this.options,'write_confinement')||(version>=14)!==Object.hasOwn(this.options,'program_bundle')||(version>=13)!==Object.hasOwn(this.options,'network_policy')||(version>=8)!==Object.hasOwn(this.options,'state_policy')||login!==Object.hasOwn(this.options,'login_home')||version>=8&&this.options.state_policy!==(login?'private_login_home/2.0.0':'private_operation_state/1.0.0')||(version>=8?!parseCodexUsagePolicy(request.usage_policy):version===7?this.options.usage_policy!=='require_ordinary_permission/1.0.0':(version >= 5)!==!!parseCodexUsagePolicy(request.usage_policy)||(version===6)!==Object.hasOwn(request,'quota_account_digest')||version<5&&(version === 4) !== (request.reasoning_effort !== undefined))) fail("codex_original_input_changed");
    return { format: `cimiloop/codex-method-start/${version}.0.0`,...(version>=12?{write_confinement:this.options.write_confinement,write_roots:this.writeRoots(request)}:{}),...(version>=13?{network_policy:this.options.network_policy}:{}),...(version>=14?{program_bundle:this.options.program_bundle}:{}),...(version>=11?{environment_policy:this.options.environment_policy,environment:codexPrivateUserEnvironment(this.paths(request).cwd,this.options.login_home!.path)}:{}),...(version>=8?{state_policy:this.options.state_policy}:{}),...(login?{login_home:this.options.login_home}:{}),...(version>=10?{process_custody:this.options.process_custody,process_origin:this.options.process_origin,...(this.options.process_root?{process_root:this.options.process_root}:{})}:{}),...(version===7?{transport_usage_policy:this.options.usage_policy}:{}), request, command: this.options.command,
    account_digest: this.options.account_digest ?? null, config: version >= 8 ? stateConfig(this.options.disabled_mcp_servers!,this.paths(request).cwd,login) : version === 1 ? legacyConfig() : version === 2 ? version2Config(this.options.disabled_mcp_servers!) : config(this.options.disabled_mcp_servers!),
    ...(version >= 2 ? { disabled_mcp_servers: this.options.disabled_mcp_servers } : {}) }; }
  private readProcessResources(raw:CodexMethodRequest){
    const request=requestCopy(raw),paths=this.paths(request),unknown={status:'unknown' as const,resources_disposed:false,completion_proven:false as const,costs_reconciled:false as const};
    if(!this.options.process_custody)return{...unknown,reason:'codex_original_process_policy_unavailable'};
    const rows=this.processRows(request),intent=rows.find(row=>row.namespace==='codex_process_job_intent');
    if(!intent||!existsSync(paths.claim))return{...unknown,reason:'codex_original_process_registration_unavailable'};
    if(!same(intent.basis,this.processBasis(request))||!same(parse(bytesAt(paths.claim)),this.claim(request)))fail('codex_process_custody_unproven');
    const layout=this.processLayout(request),completed=rows.find(row=>row.namespace==='codex_process_job_complete');
    if(completed){this.assertProcessConfinement(request,readCodexProcessLaunch(layout.operationRoot,layout.helperRoot,this.options.command,this.processArgs(request),paths.cwd));const original=readCompletedCodexProcessJob(layout.operationRoot,layout.helperRoot,this.options.command,this.processArgs(request),paths.cwd);if(!same(completed.basis,{format:'cimiloop/codex-process-job-complete/1.0.0',intent_ticket:intent.ticket,original})||!same(rows,this.processRows(request)))fail('codex_process_custody_unproven');
      return{status:'disposed' as const,resources_disposed:true,completion_proven:false as const,costs_reconciled:false as const,reason:'codex_original_process_end_pinned',basis_digest:digest(encode(completed)).value};}
    const prepared=rows.find(row=>row.namespace==='codex_process_job_prepared'),started=rows.find(row=>row.namespace==='codex_process_job_started');
    if(!prepared||!started)return{...unknown,reason:'codex_original_process_observation_unavailable'};
    const start=readStartedCodexProcessJob(layout.operationRoot,layout.helperRoot,this.options.command,this.processArgs(request),paths.cwd),launch=start.launch;
    this.assertProcessConfinement(request,launch);
    if(!same(prepared.basis,{format:'cimiloop/codex-process-job-prepared/1.0.0',intent_ticket:intent.ticket,original:{header_original:launch.header_original,config_original:launch.config_original}})||!same(started.basis,{format:'cimiloop/codex-process-job-started/1.0.0',prepared_ticket:prepared.ticket,original:start.original}))fail('codex_process_custody_unproven');
    const result=readCodexProcessJobResources(start);if(!same(rows,this.processRows(request)))fail('codex_process_custody_unproven');
    return{status:result.status,resources_disposed:result.resources_disposed,completion_proven:false as const,costs_reconciled:false as const,reason:result.status==='disposed'?'codex_original_process_resources_disposed':'codex_original_process_state_unproven',basis_digest:digest(encode({intent,prepared,started,basis:result.basis})).value};
  }
  readOriginal(raw: CodexMethodRequest): CodexMethodOriginal | null {
    const request = requestCopy(raw), paths = this.paths(request);
    if (!existsSync(paths.claim)) return null;
    const claimBytes = bytesAt(paths.claim);
    const claim = parse(claimBytes), version = claim.format === "cimiloop/codex-method-start/1.0.0" ? 1 : claim.format === "cimiloop/codex-method-start/2.0.0" ? 2 : claim.format === "cimiloop/codex-method-start/3.0.0" ? 3 : claim.format === "cimiloop/codex-method-start/4.0.0" ? 4 : claim.format === 'cimiloop/codex-method-start/5.0.0'?5:claim.format==='cimiloop/codex-method-start/6.0.0'?6:claim.format==='cimiloop/codex-method-start/7.0.0'?7:claim.format==='cimiloop/codex-method-start/8.0.0'?8:claim.format==='cimiloop/codex-method-start/9.0.0'?9:claim.format==='cimiloop/codex-method-start/10.0.0'?10:claim.format==='cimiloop/codex-method-start/11.0.0'?11:claim.format==='cimiloop/codex-method-start/12.0.0'?12:claim.format==='cimiloop/codex-method-start/13.0.0'?13:claim.format==='cimiloop/codex-method-start/14.0.0'?14:fail();
    const policy = this.policyOrigin?.readExclusive(policyNamespace, this.policyKey(request));
    if (policy ? version !== 7 || !same(policy.basis, this.policyBasis(request)) : version === 7) fail('codex_original_input_changed');
    if (!same(claim, this.claim(request, version))) fail("codex_original_input_changed");
    let processIntent:ReturnType<CodexOriginalMethodRuntime['processRows']>[number]|undefined;
    if(version>=10){processIntent=this.processRows(request).find(row=>row.namespace==='codex_process_job_intent');if(!processIntent||!same(processIntent.basis,this.processBasis(request)))fail('codex_process_custody_unproven');}
    if (!existsSync(paths.seal)) return null;
    const seal = parse(bytesAt(paths.seal)), transcript = bytesAt(paths.transcript, MAX_BYTES);
    if (seal.format !== "cimiloop/codex-method-seal/1.0.0" || seal.claim_digest !== digest(claimBytes).value || seal.transcript_digest !== digest(transcript).value ||
      !same(seal.claim_identity, fileIdentity(paths.claim)) || !same(seal.transcript_identity, fileIdentity(paths.transcript))) fail();
    if(version>=10){const layout=this.processLayout(request);this.assertProcessConfinement(request,readCodexProcessLaunch(layout.operationRoot,layout.helperRoot,this.options.command,this.processArgs(request),paths.cwd));const original=readCompletedCodexProcessJob(layout.operationRoot,layout.helperRoot,this.options.command,this.processArgs(request),paths.cwd),completed=this.processRows(request).find(row=>row.namespace==='codex_process_job_complete');if(!completed||!same(completed.basis,{format:'cimiloop/codex-process-job-complete/1.0.0',intent_ticket:processIntent!.ticket,original})||!same(seal.process_job,original))fail('codex_process_custody_unproven');}
    const lines = transcript.toString("utf8").split("\n"); if (lines.pop() !== "" || lines.length > MAX_FRAMES) fail();
    const frames = lines.map(line => parse(Buffer.from(line)) as Frame);
    const ref = { provider: "codex_app_server", resource_type: "skill_invocation_proof", locator: paths.transcript, digest: digest(transcript) };
    return originalFromFrames(request, paths.cwd, frames, ref, this.options.account_digest, version, this.options.disabled_mcp_servers);
  }
  async execute(raw: CodexMethodRequest, tool: (name: string, args: unknown, original: CodexMethodToolContext) => string | Promise<string>, beforeEffect: () => void, signal?: AbortSignal, parentAdmission?: CodexMethodAdmission): Promise<CodexMethodOriginal> {
    if (this.readOnly) fail("codex_read_only_original");
    const request = requestCopy(raw), paths = this.paths(request), admission = parentAdmission ? structuredClone(parentAdmission) : undefined;
    const usagePolicy=parseCodexUsagePolicy(this.options.usage_policy??request.usage_policy);
    if (admission && (Object.keys(admission).sort().join(",") !== "account_digest,model" || admission.model !== request.model ||
      !/^[0-9a-f]{64}$/.test(admission.account_digest) || this.options.account_digest && this.options.account_digest !== admission.account_digest)) fail("codex_parent_admission_denied");
    const previous = this.readOriginal(request);
    if (previous) {
      if (admission && previous.account_digest !== admission.account_digest) fail("codex_parent_admission_denied");
      return previous;
    }
    if (existsSync(paths.claim)) fail("codex_original_pending");
    if (this.policyOrigin?.readExclusive(policyNamespace, this.policyKey(request))) fail('codex_original_pending');
    if(this.policyOrigin?.readExclusive('codex_process_job_intent',this.policyKey(request)))fail('codex_original_pending');
    if(this.options.process_custody&&this.processRows(request).length)fail('codex_original_pending');
    if (signal?.aborted) fail("codex_original_cancelled");
    const assertHome=()=>{if(this.options.login_home){try{if(!same(captureCodexLoginHome(this.options.login_home.path),this.options.login_home))fail();}catch{fail('codex_login_home_changed');}}};
    guardNow(beforeEffect);assertHome();this.assertConfinement(request);
    const binary = bytesAt(this.options.command.file, 512 * 1024 * 1024);
    if (digest(binary).value !== this.options.command.sha256) fail("codex_binary_changed");
    if (signal?.aborted) fail("codex_original_cancelled");
    directory(paths.cwd);
    if(this.options.write_confinement){for(const path of [...Object.values(privateState(paths.cwd)),...codexPrivateUserDirectories(paths.cwd)])directory(path);this.assertConfinement(request);}
    let processLaunch:Awaited<ReturnType<typeof prepareCodexProcessJob>>|undefined;
    if(this.options.process_custody){
      const layout=this.processLayout(request);if(this.options.process_root)directory(layout.helperRoot);
      if(!this.policyOrigin!.claimExclusiveOnce('codex_process_job_intent',this.policyKey(request),this.processBasis(request)).created)fail('codex_original_pending');
      processLaunch=await prepareCodexProcessJob(layout.operationRoot,layout.helperRoot,this.options.command,this.processArgs(request),paths.cwd,this.options.write_confinement?{roots:this.writeRoots(request),network_mode:'deny_all'}:undefined,this.options.network_policy?{policy:this.options.network_policy,timeout_ms:this.options.timeout_ms??180000}:undefined,this.programs);guardNow(beforeEffect);assertHome();this.assertConfinement(request);this.assertProcessConfinement(request,processLaunch);signal?.throwIfAborted();
      const intent=this.processRows(request).find(row=>row.namespace==='codex_process_job_intent');if(!intent||!same(intent.basis,this.processBasis(request)))fail('codex_process_custody_unproven');
      this.policyOrigin!.issueExclusive('codex_process_job_prepared',this.policyKey(request),{format:'cimiloop/codex-process-job-prepared/1.0.0',intent_ticket:intent.ticket,original:{header_original:processLaunch.header_original,config_original:processLaunch.config_original}});
    }
    // The independent Host1 writer elects one sender BEFORE creating a new
    // start or spawning. A crash after this commit leaves an Unknown operation;
    // later readers never fill missing originals or downgrade its policy.
    if (this.options.usage_policy && !this.policyOrigin!.claimExclusiveOnce(policyNamespace, this.policyKey(request), this.policyBasis(request)).created) fail('codex_original_pending');
    save(paths.claim, this.claim(request));
    // The exclusive durable start is deliberately never rolled back, including
    // a crash before spawn. A retry may inspect originals, never start again.
    const fd = openSync(assertOrdinaryPath(paths.transcript), "wx");
    let reservedBytes = 0, reservedFrames = 0, closed = false, stopping = false, terminal = false, active = true, childDidClose = false, child: ChildProcessWithoutNullStreams | undefined;
    const controller = new AbortController(), deadline = performance.now() + (this.options.timeout_ms ?? 180000);
    let privateDirectories:{path:string;identity:ReturnType<typeof directoryIdentity>}[]|undefined;
    const effectGuard = () => {
      if (!active || controller.signal.aborted || performance.now() >= deadline) fail("codex_effect_closed");
      guardNow(beforeEffect);assertHome();this.assertConfinement(request);
      if(privateDirectories)for(const item of privateDirectories){try{if(!same(directoryIdentity(item.path),item.identity))fail('codex_runtime_state_changed');}catch{fail('codex_runtime_state_changed');}}
      if (!active || controller.signal.aborted || performance.now() >= deadline) fail("codex_effect_closed");
    };
    const reserve = (direction: Frame["direction"], bytes: Buffer) => {
      if (bytes.length > MAX_LINE) fail("codex_capacity_exhausted");
      const frame = Buffer.concat([encode({ direction, bytes: bytes.toString("base64") }), Buffer.from("\n")]);
      if (reservedBytes + frame.length > MAX_BYTES || reservedFrames >= MAX_FRAMES) fail("codex_capacity_exhausted");
      // Reserve queued input before retaining another promise/line, including
      // base64 envelope bytes and outbound frames. Dequeue never refunds the
      // immutable transcript capacity while an asynchronous tool is waiting.
      reservedBytes += frame.length; reservedFrames++;
      return frame;
    };
    const append = (direction: Frame["direction"], bytes: Buffer) => { writeFileSync(fd, reserve(direction, bytes)); fsyncSync(fd); };
    let next = 0, thread = "", turn = "", buffered = Buffer.alloc(0), errors = 0, toolCalls = 0;
    const serverIds = new Set<string | number>(), callIds = new Set<string>();
    const earlyThreadIds = new Set<string>(); let startingThread = false;
    let admittedAccount = "", turnSent = false, accountDirty = false,quotaDirty=false;
    const pending = new Map<number, { method: string; resolve(value: any): void; reject(error: unknown): void }>();
    let finish!: () => void, rejectFinished!: (error: unknown) => void;
    const finished = new Promise<void>((resolve, reject) => { finish = resolve; rejectFinished = reject; });
    void finished.catch(() => {});
    let rejectFailure!: (error: unknown) => void, childClose!: () => void;
    const failure = new Promise<never>((_resolve, reject) => { rejectFailure = reject; }); void failure.catch(() => {});
    const childClosed = new Promise<void>(resolve => { childClose = resolve; });
    const rejectAll = (error: unknown) => { active = false; controller.abort(); for (const p of pending.values()) p.reject(error); pending.clear(); rejectFinished(error); rejectFailure(error);if(child&&!childDidClose&&processLaunch){try{requestCodexProcessJobCancellation(processLaunch);}catch{child.kill();}}else child?.kill(); };
    const onAbort = () => rejectAll(new RuntimeAdapterError("codex_original_cancelled"));
    const send = (value: unknown) => { effectGuard(); const bytes = Buffer.concat([encode(value), Buffer.from("\n")]); append("out", bytes); child!.stdin.write(bytes); };
    const rpc = (method: string, params: unknown) => new Promise<any>((resolve, reject) => {
      const id = ++next; pending.set(id, { method, resolve, reject });
      try { send({ id, method, params }); } catch (error) { pending.delete(id); reject(error); }
    });
    let queue = Promise.resolve();
    const accept = async (line: Buffer, frame: Buffer) => {
      if (closed) fail("codex_effect_closed");
      writeFileSync(fd, frame); fsyncSync(fd); const value = parse(line);
      const accountRpc = value.id !== undefined && !value.method && (pending.get(value.id)?.method === "account/read"||usagePolicy&&pending.get(value.id)?.method==='account/rateLimits/read');
      if (terminal && !accountRpc && (value.id !== undefined || !["thread/tokenUsage/updated", "thread/status/changed",...(usagePolicy?['account/rateLimits/updated']:[])].includes(value.method))) fail("codex_post_terminal_effect");
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
      if(usagePolicy&&value.method==='account/rateLimits/updated'&&!turnSent)quotaDirty=true;
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
      const privateRuntime=this.options.state_policy!==undefined;
      if(privateRuntime){const directories=[...Object.values(privateState(paths.cwd)),...(this.options.environment_policy?codexPrivateUserDirectories(paths.cwd):[]),...(this.options.write_confinement&&processLaunch?[codexPrivateAppContainerTemp(paths.cwd,String(processLaunch.config.nonce))]:[])];for(const path of directories)directory(path);privateDirectories=[...new Set(directories)].map(path=>({path,identity:directoryIdentity(path)}));}
      const launchConfig=privateRuntime?stateConfig(this.options.disabled_mcp_servers!,paths.cwd,!!this.options.login_home):config(this.options.disabled_mcp_servers!);
      effectGuard();
      const childOptions={cwd:paths.cwd,windowsHide:true,env:childEnvironment(privateRuntime?paths.cwd:undefined,this.options.login_home,this.options.environment_policy)};
      if(processLaunch){const layout=this.processLayout(request),fresh=readCodexProcessLaunch(layout.operationRoot,layout.helperRoot,this.options.command,this.processArgs(request),paths.cwd);if(!same(fresh,processLaunch))fail('codex_process_custody_unproven');child=spawnCodexProcessJob(fresh,childOptions);}
      else child = spawn(this.options.command.file, [...this.options.command.args, "app-server", "--stdio", ...Object.entries(launchConfig).flatMap(([key, value]) => ["-c", key + "=" + toml(value)])],{...childOptions,stdio:'pipe'});
      child.on("error", rejectAll); child.stdin.on("error", rejectAll);
      child.stdout.on("data", (chunk: Buffer) => {
        if (!active) return;
        try {
          buffered = Buffer.concat([buffered, chunk]);
          for (;;) { const end = buffered.indexOf(10); if (end < 0) break;
            const line = Buffer.from(buffered.subarray(0, end + 1)), frame = reserve("in", line); buffered = buffered.subarray(end + 1);
            queue = queue.then(() => accept(line, frame)); void queue.catch(rejectAll);
          }
          if (buffered.length > MAX_LINE) fail("codex_capacity_exhausted");
        } catch (error) { rejectAll(error); }
      });
      // Never expose server diagnostics (which may include local configuration)
      // to method context or product error messages. Bound them in memory only.
      child.stderr.on("data", (bytes: Buffer) => { errors += bytes.length; if (errors > MAX_LINE) rejectAll(new RuntimeAdapterError("codex_capacity_exhausted")); });
      child.on("close", () => { childDidClose = true; childClose(); if (!closed && !stopping) void queue.then(() => { if (!terminal) rejectAll(new RuntimeAdapterError("codex_original_response_lost")); }).catch(rejectAll); });
      if(processLaunch){
        await Promise.race([failure,(async()=>{while(!existsSync(processLaunch!.paths.started)){controller.signal.throwIfAborted();await new Promise<void>(done=>setTimeout(done,25));}})()]);effectGuard();
        const layout=this.processLayout(request),started=readStartedCodexProcessJob(layout.operationRoot,layout.helperRoot,this.options.command,this.processArgs(request),paths.cwd),prepared=this.processRows(request).find(row=>row.namespace==='codex_process_job_prepared');
        if(!prepared||started.identities.supervisor.pid!==child.pid||!same(started.launch,processLaunch))fail('codex_process_custody_unproven');
        this.policyOrigin!.issueExclusive('codex_process_job_started',this.policyKey(request),{format:'cimiloop/codex-process-job-started/1.0.0',prepared_ticket:prepared.ticket,original:started.original});effectGuard();
      }
      await rpc("initialize", { clientInfo: { name: "cimiloop_s1", title: "CimiLoop", version: "0.1.0" }, capabilities: { experimentalApi: true } });
      send({ method: "initialized" });
      const account = await rpc("account/read", { refreshToken: false });
      admittedAccount = codexChatGptAccountDigest(account);
      if (this.options.account_digest && admittedAccount !== this.options.account_digest || admission && admittedAccount !== admission.account_digest) fail("codex_account_changed");
      startingThread = true;
      const start = await rpc("thread/start", startParams(request, paths.cwd,privateRuntime));
      if (start?.model !== request.model || start.modelProvider !== "openai" || start.instructionSources?.length !== 0 || start.approvalPolicy !== "never" || start.activePermissionProfile?.id !== "cimiloop-method" || typeof start.thread?.id !== "string" || privateRuntime&&start.thread.ephemeral!==true) fail("codex_thread_binding_denied");
      thread = start.thread.id; startingThread = false;
      if ([...earlyThreadIds].some(id => id !== thread)) fail("codex_event_identity_denied");
      const inventory = await rpc("mcpServerStatus/list", { threadId: thread, limit: 100, detail: "toolsAndAuthOnly" });
      if (!quietMcpCatalog(inventory, this.options.disabled_mcp_servers!)) fail("codex_external_tools_available");
      const readyAccount = await rpc("account/read", { refreshToken: false });
      if (codexChatGptAccountDigest(readyAccount) !== admittedAccount) fail("codex_account_changed");
      let quotaBefore:CodexOrdinaryQuotaSnapshot|undefined;
      if(usagePolicy){quotaBefore=parseCodexOrdinaryQuota(await rpc('account/rateLimits/read',CODEX_QUOTA_READ_PARAMS));if(quotaBefore.ordinary_usage_allowed!==true||quotaBefore.account_id_digest===null||request.quota_account_digest&&quotaBefore.account_id_digest!==request.quota_account_digest)fail('codex_ordinary_permission_unavailable');quotaDirty=false;}
      // Drain notifications already received alongside the account response.
      // Resolving the RPC wakes this continuation before subsequent queue jobs.
      await queue;
      if (accountDirty) fail("codex_account_changed");if(usagePolicy&&quotaDirty)fail('codex_ordinary_quota_changed');turnSent = true;
      const started = await rpc("turn/start", { threadId: thread, model: request.model, effort: request.reasoning_effort ?? "medium", input: [{ type: "text", text: request.prompt, text_elements: [] }], outputSchema: request.output_schema });
      if (typeof started?.turn?.id !== "string") fail(); turn = started.turn.id;
      await finished; await queue;
      const finalAccount = await rpc("account/read", { refreshToken: false });
      if (codexChatGptAccountDigest(finalAccount) !== admittedAccount) fail("codex_account_changed");
      if(usagePolicy){const after=parseCodexOrdinaryQuota(await rpc('account/rateLimits/read',CODEX_QUOTA_READ_PARAMS));if(after.account_id_digest!==quotaBefore!.account_id_digest)fail('codex_ordinary_quota_account_changed');}
      stopping = true; child.stdin.end(); if(!processLaunch)child.kill();
      await Promise.race([childClosed, failure]); await queue;
      if (buffered.length) { append("in", buffered); fail("codex_truncated_original"); }
      effectGuard();
      const transcript = bytesAt(paths.transcript, MAX_BYTES);
      const ref = { provider: "codex_app_server", resource_type: "skill_invocation_proof", locator: paths.transcript, digest: digest(transcript) };
      const frames = transcript.toString("utf8").trimEnd().split("\n").map(line => parse(Buffer.from(line)) as Frame);
      originalFromFrames(request, paths.cwd, frames, ref, this.options.account_digest, this.startVersion(request), this.options.disabled_mcp_servers);
      const layout=processLaunch?this.processLayout(request):undefined,processJob=layout?readCompletedCodexProcessJob(layout.operationRoot,layout.helperRoot,this.options.command,this.processArgs(request),paths.cwd):undefined;
      if(processJob){const intent=this.processRows(request).find(row=>row.namespace==='codex_process_job_intent');if(!intent||!same(intent.basis,this.processBasis(request)))fail('codex_process_custody_unproven');this.policyOrigin!.issueExclusive('codex_process_job_complete',this.policyKey(request),{format:'cimiloop/codex-process-job-complete/1.0.0',intent_ticket:intent.ticket,original:processJob});}
      save(paths.seal, { format: "cimiloop/codex-method-seal/1.0.0", claim_digest: digest(bytesAt(paths.claim)).value, transcript_digest: digest(transcript).value,
        claim_identity: fileIdentity(paths.claim), transcript_identity: fileIdentity(paths.transcript),...(processJob?{process_job:processJob}:{}) });
      return this.readOriginal(request) ?? fail();
    } finally {
      signal?.removeEventListener("abort", onAbort);
      closed = true; active = false; stopping=true;controller.abort(); clearTimeout(timer);
      // Let the original supervisor end and seal its entire Job on abort. A
      // force-kill fallback never becomes a resource-disposal or model proof.
      if(child&&!childDidClose&&processLaunch){try{requestCodexProcessJobCancellation(processLaunch);}catch{/* Preserve Unknown; fallback stops only this owned child. */}}
      else{child?.stdin.destroy();child?.kill();}
      for (const p of pending.values()) p.reject(new RuntimeAdapterError("codex_connection_closed")); pending.clear();
      if (child && !childDidClose) {
        // A failed/aborted tool may still be awaiting its own cancellation.
        // Stop and wait for the owned server, without waiting forever for that
        // tool. Missing shutdown proof retains pending originals, never success.
        let stopTimer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([childClosed, new Promise<void>(resolve => { stopTimer = setTimeout(resolve, 3000); })]);
        if (stopTimer) clearTimeout(stopTimer);
      }
      child?.stdin.destroy();if(child&&!childDidClose)child.kill();
      closeSync(fd);
    }
  }
}
