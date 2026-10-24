import {openCodexRuntimeLoginHome} from './agent-codex-login-home-local.js';
import { lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { CimiLoopKernel, requestDigest } from "@cimiloop/kernel";
import {
  PINNED_CONVERSATION_OPENCODE_SHA, bytesAt, digest, digestRuntimeBinaryFile, loadModelConnection,
  openWindowsAgentStartLedger, openWindowsDedicatedAgentAccountLedger, parseGatewayJson, parseWorkspaceCheckTemplate, validateModelConnection,
} from "@cimiloop/runtime-adapter";
import type { AgentStartLedger, DedicatedAgentAccountAdmission, DedicatedAgentAccountLedger, DedicatedAgentAccountPolicy, DedicatedModelConnection, WorkspaceCheckTemplate } from "@cimiloop/runtime-adapter";
import type { LocalProject } from "./project.js";
import { installedRunVerifier } from "./project.js";
import { LocalProjectError } from "./errors.js";
import type { AgentRuntimeLease, HumanAgentRuntimeFactory } from "./agent-runtime-human-start-local.js";
import { LocalAgentRuntimeComposition } from "./agent-runtime-composition-local.js";
import { LocalAgentStartCustody } from "./agent-start-custody-local.js";
import { LocalAgentCheckAdmission } from "./agent-check-admission-local.js";
import { LocalAgentModelAdmission } from "./agent-model-admission-local.js";
import { LocalEvidenceVerifier } from "./evidence-local.js";
import { LocalProviderVerifier } from "./providers-local.js";
import { readOriginalAgentRunInputs } from "./agent-workspace-tools-local.js";
import { LocalAgentRuntimeAdmission } from './agent-runtime-admission-local.js';
import { hasInstalledCodexAgentRuntime } from './agent-codex-installation-local.js';
import { openInstalledCodexUsageBudget } from './agent-codex-usage-budget-local.js';
import {openCodexRuntimeStorage} from './agent-codex-storage-local.js';

// The installed connection names the model and the https chat-completions
// endpoint. Fee authorization is one OpenCode Go connection: deepseek-v4.1-flash
// at https://opencode.ai/inference/go/openai/v1/chat/completions, with cash at or
// below 5 USD and no credit budget. A plan name, another endpoint, or a higher
// ceiling does not permit a paid call. This module never reads credential bytes.
export const PRODUCTION_ADMISSION_PLAN = "Grok" as const;
export const PRODUCTION_ADMISSION_GAPS = ["固定 Runtime 二进制", "OpenAI 兼容连接", "连接凭据", "原启动账本", "原账户", "固定检查", "费用授权"] as const;
export const PRODUCTION_ADMISSION_MISSING = PRODUCTION_ADMISSION_GAPS;

const admissionDigest = (value: unknown) => ({ algorithm: "sha256" as const, value: requestDigest(value) });
const installName = "production-runtime";
const accountNamespace = "dedicated_agent_account";

const AUTHORIZED_OPENCODE_GO_ENDPOINT = "https://opencode.ai/inference/go/openai/v1/chat/completions";
const AUTHORIZED_OPENCODE_GO_MODEL = "openai-compatible/deepseek-v4.1-flash";
const AUTHORIZED_OPENCODE_GO_CASH_MICROS = 5_000_000;
export function productionModelFeeAuthorized(connection?: DedicatedModelConnection, policy?: Pick<DedicatedAgentAccountPolicy, "cash_limit_micros" | "cash_per_call_upper_micros" | "credit_limit_micro_units" | "credit_per_call_upper_micro_units" | "profile">): boolean {
  if (!connection) return false;
  let fixed: DedicatedModelConnection;
  try { fixed = validateModelConnection(connection); } catch { return false; }
  if (fixed.provider !== "openai-compatible" || fixed.model !== AUTHORIZED_OPENCODE_GO_MODEL || fixed.endpoint !== AUTHORIZED_OPENCODE_GO_ENDPOINT) return false;
  if (!policy) return true;
  return policy.profile.model === "deepseek-v4.1-flash" && policy.profile.thinking === "disabled"
    && policy.cash_limit_micros >= 0 && policy.cash_limit_micros <= AUTHORIZED_OPENCODE_GO_CASH_MICROS
    && policy.cash_per_call_upper_micros >= 0 && policy.cash_per_call_upper_micros <= AUTHORIZED_OPENCODE_GO_CASH_MICROS
    && policy.credit_limit_micro_units === 0 && policy.credit_per_call_upper_micro_units === 0;
}

export function productionRuntimeBinaryPath(): string | undefined {
  const root = process.env.APPDATA;
  return root ? join(root, "npm", "node_modules", "opencode-ai", "node_modules", "opencode-windows-x64", "bin", "opencode.exe") : undefined;
}

export function productionRuntimeLayout(local: LocalProject) {
  const dataDirectory = local.location.dataDirectory, projectId = local.store.getProject()?.id, appData = process.env.LOCALAPPDATA;
  return {
    connectionPath: join(dataDirectory, installName, "model-connection.json"),
    checksPath: join(dataDirectory, installName, "checks.json"),
    startRoot: join(dataDirectory, installName, "start-origin"),
    toolsRoot: join(dataDirectory, installName, "start-tools"),
    accountRoot: projectId && appData ? join(appData, "CimiLoop", "accounts", projectId) : "",
    binary: productionRuntimeBinaryPath(),
  };
}

const outsideRepository = (repository: string, target: string) => {
  const path = relative(resolve(repository), resolve(target));
  return path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
};

const filePresent = (path: string) => {
  try { return !!path && lstatSync(path).isFile(); } catch { return false; }
};

function productionAdmissionError(missing: readonly string[]) {
  return new LocalProjectError(
    `正式 Agent 不能启动。模型请求使用 OpenAI chat completions。模型标识和 https 端点来自已安装连接，不限定智谱 glm。现金上限和积分上限本阶段不作为缺项。缺项：${missing.join("；")}。未读取凭据，未发送模型请求。`,
    "CAPABILITY_UNAVAILABLE", "conflict",
    { production_admission: "unapproved", plan: PRODUCTION_ADMISSION_PLAN, missing: [...missing] },
  );
}
function codexProductionAdmissionError(missing:readonly string[]){
  return new LocalProjectError(`正式 Agent 已选择现有 Codex 登录。缺项：${missing.join('；')}。未读取登录凭据，未发送模型请求。`,'CAPABILITY_UNAVAILABLE','conflict',{production_admission:'unapproved',plan:'Codex login',missing:[...missing]});
}

function readCheckTemplates(path: string): WorkspaceCheckTemplate[] {
  const value = parseGatewayJson(new TextDecoder("utf-8", { fatal: true }).decode(bytesAt(path, 65536)), 65536);
  if (!Array.isArray(value) || !value.length || value.length > 16) throw new Error("workspace_check_template_invalid");
  const templates = value.map(parseWorkspaceCheckTemplate).sort((a, b) => a.check_id < b.check_id ? -1 : a.check_id > b.check_id ? 1 : 0);
  if (new Set(templates.map(template => template.check_id)).size !== templates.length) throw new Error("workspace_check_template_invalid");
  return templates;
}

export function writeProductionCheckCatalog(local: LocalProject, templates: readonly WorkspaceCheckTemplate[]) {
  const parsed = readCheckTemplatesFromValue(templates);
  const path = productionRuntimeLayout(local).checksPath;
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(parsed), { flag: "wx" });
}

function readCheckTemplatesFromValue(value: readonly WorkspaceCheckTemplate[]) {
  if (!value.length || value.length > 16) throw new LocalProjectError("固定检查尚未安装", "CAPABILITY_UNAVAILABLE", "conflict");
  const templates = value.map(parseWorkspaceCheckTemplate).sort((a, b) => a.check_id < b.check_id ? -1 : a.check_id > b.check_id ? 1 : 0);
  if (new Set(templates.map(template => template.check_id)).size !== templates.length) throw new LocalProjectError("固定检查尚未安装", "CAPABILITY_UNAVAILABLE", "conflict");
  return templates;
}

export function productionAccountAdmission(origin: AgentStartLedger): DedicatedAgentAccountAdmission {
  return { check: async (_scope, connection, policy) => {
    const fixed = validateModelConnection(connection);
    if (digest(JSON.stringify(fixed)).value !== policy.connection_digest || policy.host_identity_digest !== origin.identityDigest || fixed.model !== `${fixed.provider}/${policy.profile.model}`) throw new Error("agent_account_admission_unproven");
    if (!productionModelFeeAuthorized(fixed, policy)) throw productionAdmissionError(["费用授权"]);
  } };
}

export async function inspectProductionRuntime(local: LocalProject): Promise<string[]> {
  const layout = productionRuntimeLayout(local), missing: string[] = [];
  try {
    if (!layout.binary || !filePresent(layout.binary) || digestRuntimeBinaryFile(layout.binary) !== PINNED_CONVERSATION_OPENCODE_SHA) missing.push("固定 Runtime 二进制");
  } catch { missing.push("固定 Runtime 二进制"); }
  let connection: DedicatedModelConnection | undefined;
  try { connection = loadModelConnection(layout.connectionPath); }
  catch { missing.push("OpenAI 兼容连接"); }
  if (connection && !filePresent(connection.credential_file)) missing.push("连接凭据");
  if (!filePresent(join(layout.startRoot, "starts.sqlite"))) missing.push("原启动账本");
  if (!layout.accountRoot || !outsideRepository(local.location.repositoryPath, layout.accountRoot) || !filePresent(join(layout.accountRoot, "account.sqlite"))) missing.push("原账户");
  try { readCheckTemplates(layout.checksPath); }
  catch { missing.push("固定检查"); }
  return missing;
}

export function readProductionAccountDigest(origin: AgentStartLedger, accountRoot: string) {
  const root = resolve(accountRoot);
  const rows = origin.listExclusive(accountNamespace).filter(row => {
    const basis = row.basis;
    return !!basis && typeof basis === "object" && "root" in basis && "policy" in basis && resolve(String((basis as { root: unknown }).root)) === root &&
      typeof (basis as { policy?: { account_digest?: unknown } }).policy?.account_digest === "string";
  });
  if (rows.length !== 1) throw productionAdmissionError(["原账户"]);
  return (rows[0]!.basis as { policy: { account_digest: string } }).policy.account_digest;
}

export async function openInstalledProductionRuntime(runId: string, local: LocalProject): Promise<AgentRuntimeLease> {
  const missing = await inspectProductionRuntime(local), verifier = installedRunVerifier(local);
  if (missing.length || !verifier) throw productionAdmissionError(missing.length ? missing : ["固定启动核验"]);
  const layout = productionRuntimeLayout(local), connection = loadModelConnection(layout.connectionPath), project = local.store.getProject();
  if (!project || !layout.binary) throw productionAdmissionError(["原账户"]);
  const origin = await openWindowsAgentStartLedger(layout.startRoot, layout.toolsRoot);
  let account: DedicatedAgentAccountLedger | undefined;
  try {
    account = await openWindowsDedicatedAgentAccountLedger({ origin, accountDigest: readProductionAccountDigest(origin, layout.accountRoot), connection, toolsRoot: layout.toolsRoot, admission: productionAccountAdmission(origin) });
    const templates = readCheckTemplates(layout.checksPath);
    const checks = await LocalAgentCheckAdmission.open({ repositoryPath: local.location.repositoryPath, dataDirectory: local.location.dataDirectory, nodeBinary: process.execPath, projectId: project.id, templates, custody: { admit: () => { throw new Error("Agent live admission unavailable"); }, verify: (_project, _input, original) => admissionDigest(original) } });
    const custody = new LocalAgentStartCustody(local.location.repositoryPath, local.location.dataDirectory, origin, {
      admit: checks.admit.bind(checks),
      verifyLaunch: (_project, _input, original) => admissionDigest(original),
      verifyModel: (_project, _input, original) => admissionDigest(original),
    });
    const modelAdmission = new LocalAgentModelAdmission(local.location.repositoryPath, local.location.dataDirectory, custody, checks);
    verifier.agent.checkRunAuthority = custody.checkRunAuthority.bind(custody);
    verifier.agent.checkToolAuthority = (projectInput, input) => checks.validateTool(projectInput, input, custody);
    verifier.agent.checkModelAuthority = (projectInput, input, reader) => reader ? modelAdmission.checkModelAuthority(projectInput, input, reader) : modelAdmission.checkModelAuthority(projectInput, input);
    const identified = readOriginalAgentRunInputs({ location: local.location, store: local.store }, runId);
    if (identified.actor.actor_type !== "agent") throw productionAdmissionError(["原 Agent 身份"]);
    const caller = { kind: "agent" as const, project_id: identified.project.id, actor_id: identified.actor.id, provider_identity_ref: structuredClone(identified.actor.provider_identity_ref) };
    const kernel = new CimiLoopKernel({ store: local.store, caller, evidenceVerifier: new LocalEvidenceVerifier(local.location.repositoryPath, local.location.dataDirectory), runVerifier: verifier, providerVerifier: new LocalProviderVerifier(local.location.repositoryPath, local.location.dataDirectory) });
    const runtime = LocalAgentRuntimeComposition.openDedicatedPersistent({ local: { ...local, caller, kernel }, binary: layout.binary, custody, checks, runId, connection, account });
    let released = false;
    return { runtime, release() { if (released) return; released = true; account?.close(); origin.close(); } };
  } catch (error) {
    account?.close(); origin.close();
    if (error instanceof LocalProjectError && error.details.production_admission === "unapproved") throw error;
    throw error;
  }
}

export const productionAgentRuntime: HumanAgentRuntimeFactory = async (runId, local) => {
  const admission=LocalAgentRuntimeAdmission.current(local);
  if(admission){
    const account=await openInstalledCodexUsageBudget(local);
    if(!account)throw codexProductionAdmissionError(['Codex 原账户容量政策']);
    try{
      admission.guard();account.guard();const storage=await openCodexRuntimeStorage(local,account.installation);
      if(!storage)throw codexProductionAdmissionError(['Codex 原固定卷运行范围']);
      admission.guard();account.guard();const loginHome=await openCodexRuntimeLoginHome(local,account.installation,storage);
      if(!loginHome)throw codexProductionAdmissionError(['Codex 原固定卷登录目录']);
      admission.guard();account.guard();const runtime=admission.runtimeForRun(runId,account,undefined,storage,loginHome);admission.guard();
      let released=false;return{runtime,release(){if(!released){released=true;account.release();}}};
    }catch(error){account.release();throw error;}
  }
  if(hasInstalledCodexAgentRuntime(local))throw codexProductionAdmissionError(['Codex Context 前完整准入']);
  const missing = [...await inspectProductionRuntime(local)];
  let feeConnection: DedicatedModelConnection | undefined;
  try { feeConnection = loadModelConnection(productionRuntimeLayout(local).connectionPath); } catch { feeConnection = undefined; }
  if (!productionModelFeeAuthorized(feeConnection)) missing.push("费用授权");
  if (missing.length) throw productionAdmissionError(missing);
  return openInstalledProductionRuntime(runId, local);
};
