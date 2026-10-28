import {openCodexRuntimeLoginHome} from './agent-codex-login-home-local.js';
import { lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  PINNED_CONVERSATION_OPENCODE_SHA, bytesAt, digestRuntimeBinaryFile, loadModelConnection,
  parseGatewayJson, parseWorkspaceCheckTemplate,
} from "@cimiloop/runtime-adapter";
import type { AgentStartLedger, DedicatedAgentAccountAdmission, DedicatedAgentAccountPolicy, DedicatedModelConnection, WorkspaceCheckTemplate } from "@cimiloop/runtime-adapter";
import type { LocalProject } from "./project.js";
import { LocalProjectError } from "./errors.js";
import type { AgentRuntimeLease, HumanAgentRuntimeFactory } from "./agent-runtime-human-start-local.js";
import { LocalAgentRuntimeAdmission } from './agent-runtime-admission-local.js';
import { hasInstalledCodexAgentRuntime } from './agent-codex-installation-local.js';
import { openInstalledCodexUsageBudget } from './agent-codex-usage-budget-local.js';
import {openCodexRuntimeStorage} from './agent-codex-storage-local.js';
import {openInstalledCodexProductionHost} from './agent-production-host-local.js';
import {hasInstalledDedicatedAgentRuntime,openInstalledDedicatedAgentRuntime} from './agent-dedicated-installation-local.js';

// Legacy projects retain their original Codex route. Explicit local-provider
// installation selects the new route; incomplete local admission cannot fall
// back to a different account. Metadata alone cannot authorize a model call.
export const PRODUCTION_ADMISSION_PLAN = "Codex login" as const;
export const PRODUCTION_ADMISSION_GAPS = ["Codex 原安装", "Codex Context 前完整准入"] as const;
export const PRODUCTION_ADMISSION_MISSING = PRODUCTION_ADMISSION_GAPS;

const installName = "production-runtime";
const accountNamespace = "dedicated_agent_account";

export function productionModelFeeAuthorized(_connection?: DedicatedModelConnection, _policy?: Pick<DedicatedAgentAccountPolicy, "cash_limit_micros" | "cash_per_call_upper_micros" | "credit_limit_micro_units" | "credit_per_call_upper_micro_units" | "profile">): boolean {
  return false;
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

function codexProductionAdmissionError(missing:readonly string[]){
  return new LocalProjectError(`正式 Agent 已选择现有 Codex 登录。缺项：${missing.join('；')}。未读取登录凭据，未发送模型请求。`,'CAPABILITY_UNAVAILABLE','conflict',{production_admission:'unapproved',plan:PRODUCTION_ADMISSION_PLAN,missing:[...missing]});
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

export function productionAccountAdmission(_origin: AgentStartLedger): DedicatedAgentAccountAdmission {
  return { check: async () => { throw codexProductionAdmissionError(["旧 HTTP 连接不再授权新模型请求"]); } };
}

// Historical layout inspection only. This is not the current execution admission.
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
  if (rows.length !== 1) throw new LocalProjectError("历史 HTTP 原账户资料缺失或不唯一", "CAPABILITY_UNAVAILABLE", "conflict");
  return (rows[0]!.basis as { policy: { account_digest: string } }).policy.account_digest;
}

export async function openInstalledProductionRuntime(runId: string, local: LocalProject): Promise<AgentRuntimeLease> {
  if(hasInstalledDedicatedAgentRuntime(local)){
    const missing=['本地兼容原安装'];let installed:Awaited<ReturnType<typeof openInstalledDedicatedAgentRuntime>>;
    try{installed=await openInstalledDedicatedAgentRuntime(local);if(installed){installed.guard();missing.splice(0,missing.length,'本地兼容生产宿主完整控制原件','正式账户预算与账单准入');}}
    catch{/* A damaged selected installation never selects an old account. */}
    finally{installed?.release();}
    throw new LocalProjectError(`已选择本地 OpenAI 兼容连接。缺项：${missing.join('；')}。未读取密钥或发送模型请求。`,'CAPABILITY_UNAVAILABLE','conflict',{production_admission:'unapproved',plan:'local OpenAI-compatible',missing});
  }
  if(!LocalAgentRuntimeAdmission.current(local)&&!hasInstalledCodexAgentRuntime(local))throw codexProductionAdmissionError([...PRODUCTION_ADMISSION_GAPS]);
  const host=await openInstalledCodexProductionHost(local);
  if(host){try{host.guard();const runtime=host.admission.runtimeForRun(runId,host.account,undefined,host.storage,host.home);host.guard();return{runtime,release:()=>host.release()};}catch(error){host.release();throw error;}}
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
  throw codexProductionAdmissionError(hasInstalledCodexAgentRuntime(local)
    ? ['Codex Context 前完整准入'] : [...PRODUCTION_ADMISSION_GAPS]);
}

export const productionAgentRuntime: HumanAgentRuntimeFactory = openInstalledProductionRuntime;
