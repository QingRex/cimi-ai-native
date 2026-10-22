import { closeSync, existsSync, fsyncSync, lstatSync, openSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { requestDigest } from "@cimiloop/kernel";
import { verifySkillPackageBytes, type VerifiedSkillPackage } from "@cimiloop/skill-adapter";
import { AgentStartLedger, CodexOriginalMethodRuntime, CodexFactInvestigator, assertOrdinaryPath, bytesAt, digest, directory,
  initializeWindowsAgentStartLedger, openWindowsAgentStartLedger, inspectCodexMethodLogin, parseGatewayJson } from "@cimiloop/runtime-adapter";
import { CodexMattClarificationHost } from "./clarification-codex-host-local.js";
import type { MattClarificationHost } from "./clarification-matt-local.js";
import type { LocalProject } from "./project.js";
import { readInstance } from "./instance.js";
import { LocalProjectError } from "./errors.js";

const namespace = "codex_matt_installation", requestNamespace = "codex_matt_install_request";
const fail = (): never => { throw new LocalProjectError("Codex Matt 安装资料尚不可核对；保留原登记和原操作", "CAPABILITY_UNAVAILABLE", "conflict"); };
const identity = (path: string, folder = false) => {
  const stat = lstatSync(assertOrdinaryPath(path), { bigint: true });
  if ((folder ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1n) || stat.ino <= 0n) fail();
  return { dev: String(stat.dev), ino: String(stat.ino), birth: String(stat.birthtimeNs) };
};
function binding(local: LocalProject) {
  const project = local.store.getProject(), actor = local.store.getActor(local.instance.actor_id);
  if (!project || project.id !== local.instance.project_id || project.instance_id !== local.instance.instance_id ||
    !actor || actor.actor_type !== "human" || actor.project_id !== project.id || !isDeepStrictEqual(readInstance(local.location.instancePath), local.instance)) fail();
  return { instance: structuredClone(local.instance), repository: local.location.repositoryPath, data_directory: local.location.dataDirectory, repository_identity: identity(local.location.repositoryPath, true) };
}
function layout(local: LocalProject) {
  const appData = process.env.LOCALAPPDATA; if (!appData || !isAbsolute(appData)) fail();
  const root = assertOrdinaryPath(join(appData!, "CimiLoop", "matt", local.instance.project_id, local.instance.actor_id)), tools = join(appData!, "CimiLoop", "matt-tools");
  for (const path of [root, tools]) { const rel = relative(resolve(local.location.repositoryPath), resolve(path)); if (!(isAbsolute(rel) || rel === ".." || rel.startsWith(".." + sep))) fail(); }
  return { root, tools };
}
type Facts = { source_identity: string; files: { path: string; content: string }[] };
export interface CodexMattInstallInput { source: VerifiedSkillPackage; binary: string; model: string; disabled_mcp_servers?: string[]; facts?: Facts }
interface Material { name: "codex.exe" | "codex-code-mode-host.exe" | "skill-package.json" | "facts.json"; digest: string; identity: ReturnType<typeof identity> }
interface InstallRequest { format: "cimiloop/codex-matt-install-request/2.0.0"; binding: ReturnType<typeof binding>; model: string; account_digest: string; binary_digest: string; source_digest: string; package_digest: string; disabled_mcp_servers: string[]; facts_digest: string | null; materials: Material[]; originals_identity: ReturnType<typeof identity> }
interface Installed { format: "cimiloop/codex-matt-installation/2.0.0"; request: InstallRequest; materials: Material[]; originals_identity: ReturnType<typeof identity> }
export interface InstalledCodexMatt { host: MattClarificationHost; model: string; installation_digest: string; release(): void }

function material(root: string, name: Material["name"], bytes?: Buffer): Material {
  const path = join(root, name), max = name.endsWith(".exe") ? 512 * 1024 * 1024 : 4 * 1024 * 1024;
  if (bytes) {
    if (!existsSync(path)) { const fd = openSync(assertOrdinaryPath(path), "wx"); try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); } }
    if (!bytesAt(path, max).equals(bytes)) fail();
  }
  const before = identity(path), value = digest(bytesAt(path, max)).value;
  if (!isDeepStrictEqual(before, identity(path))) fail();
  return { name, digest: value, identity: before };
}
function decodeRequest(raw: unknown): InstallRequest {
  const value = JSON.parse(JSON.stringify(parseGatewayJson(JSON.stringify(raw), 65536))) as InstallRequest;
  if (Object.keys(value).sort().join(",") !== "account_digest,binary_digest,binding,disabled_mcp_servers,facts_digest,format,materials,model,originals_identity,package_digest,source_digest" ||
    value.format !== "cimiloop/codex-matt-install-request/2.0.0" || !["gpt-6.1-sol", "gpt-6-luna"].includes(value.model) ||
    ![value.account_digest, value.binary_digest, value.package_digest, value.source_digest].every(s => typeof s === "string" && /^[a-f0-9]{64}$/.test(s)) ||
    !(value.facts_digest === null || typeof value.facts_digest === "string" && /^[a-f0-9]{64}$/.test(value.facts_digest)) ||
    !Array.isArray(value.disabled_mcp_servers) || value.disabled_mcp_servers.length > 64 || new Set(value.disabled_mcp_servers).size !== value.disabled_mcp_servers.length ||
    value.disabled_mcp_servers.some(s => typeof s !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(s) || ["__proto__", "constructor", "prototype"].includes(s)) ||
    !Array.isArray(value.materials) || ![3, 4].includes(value.materials.length) || new Set(value.materials.map(m => m.name)).size !== value.materials.length ||
    !["codex.exe", "codex-code-mode-host.exe", "skill-package.json"].every(name => value.materials.some(m => m.name === name)) ||
    value.materials.some(m => !["codex.exe", "codex-code-mode-host.exe", "skill-package.json", "facts.json"].includes(m.name))) fail();
  return value;
}
function decode(raw: unknown): Installed {
  // The strict parser uses null prototypes. Normalize only after its duplicate
  // key/property checks so physical JSON records compare with local bindings.
  const value = JSON.parse(JSON.stringify(parseGatewayJson(JSON.stringify(raw), 65536))) as Installed;
  if (Object.keys(value).sort().join(",") !== "format,materials,originals_identity,request" || value.format !== "cimiloop/codex-matt-installation/2.0.0" ||
    !isDeepStrictEqual(value.materials, value.request.materials) || !isDeepStrictEqual(value.originals_identity, value.request.originals_identity)) fail();
  decodeRequest(value.request);
  return value;
}
function installedRead(origin: AgentStartLedger, local: LocalProject, root: string, originalBinding: ReturnType<typeof binding>) {
  if (!isDeepStrictEqual(binding(local), originalBinding)) fail();
  const row = origin.readExclusive(namespace, requestDigest(originalBinding)); if (!row) fail();
  const installed = decode(row!.basis);
  if (!isDeepStrictEqual(installed.request.binding, originalBinding) || !isDeepStrictEqual(origin.readExclusive(requestNamespace, requestDigest(originalBinding))?.basis, installed.request) ||
    !isDeepStrictEqual(installed.materials, installed.materials.map(m => material(root, m.name))) || !isDeepStrictEqual(installed.originals_identity, identity(join(root, "originals"), true))) fail();
  const pkg = installed.materials.find(m => m.name === "skill-package.json"), binary = installed.materials.find(m => m.name === "codex.exe"), facts = installed.materials.find(m => m.name === "facts.json");
  if (pkg?.digest !== installed.request.package_digest || binary?.digest !== installed.request.binary_digest || (facts?.digest ?? null) !== installed.request.facts_digest) fail();
  return installed;
}
// Explicit trusted local installer only. Default readers never initialize Host1,
// write approval files, read login metadata or repair a partial registration.
export async function installCodexMatt(local: LocalProject, raw: CodexMattInstallInput,
  services: { inspectLogin?: typeof inspectCodexMethodLogin } = {}) {
  const originalBinding = binding(local), where = layout(local), input = structuredClone(raw);
  if (!["gpt-6.1-sol", "gpt-6-luna"].includes(input.model)) fail();
  const source = verifySkillPackageBytes(Buffer.from(JSON.stringify(input.source.package)), input.source.source_digest), packageBytes = Buffer.from(JSON.stringify(source.package)), binaryBytes = bytesAt(input.binary, 512 * 1024 * 1024);
  // Dynamic tools require the real companion executable beside codex.exe.
  // Pin the bounded bundle before any login/model use; never fall back to PATH.
  const hostBytes = bytesAt(join(dirname(input.binary), "codex-code-mode-host.exe"), 512 * 1024 * 1024);
  const disabled = [...(input.disabled_mcp_servers ?? [])].sort();
  if (disabled.length > 64 || new Set(disabled).size !== disabled.length || disabled.some(s => !/^[A-Za-z0-9_-]{1,64}$/.test(s) || ["__proto__", "constructor", "prototype"].includes(s))) fail();
  let factsBytes: Buffer | undefined;
  if (input.facts) {
    new CodexFactInvestigator({ async execute() { throw Error("No model during installation"); }, readOriginal() { return null; } }, input.model, input.facts.files, input.facts.source_identity).snapshot();
    factsBytes = Buffer.from(JSON.stringify(input.facts)); if (factsBytes.length > 1024 * 1024) fail();
  }
  directory(join(where.root, ".."));
  const origin = existsSync(where.root) ? await openWindowsAgentStartLedger(where.root, where.tools) : await initializeWindowsAgentStartLedger(where.root, where.tools);
  try {
    const guard = () => { if (!isDeepStrictEqual(binding(local), originalBinding)) fail(); };
    const assertInput = (request: InstallRequest) => {
      if (!isDeepStrictEqual(request.binding, originalBinding) || request.model !== input.model || request.binary_digest !== digest(binaryBytes).value || request.source_digest !== source.source_digest.value ||
        request.package_digest !== digest(packageBytes).value || request.materials.find(m => m.name === "codex-code-mode-host.exe")?.digest !== digest(hostBytes).value ||
        !isDeepStrictEqual(request.disabled_mcp_servers, disabled) || request.facts_digest !== (factsBytes ? digest(factsBytes).value : null)) fail();
    };
    guard();
    if (origin.readExclusive(namespace, requestDigest(originalBinding))) {
      const prior = installedRead(origin, local, where.root, originalBinding), request = prior.request; assertInput(request);
      return { ok: true as const, created: false, model: request.model, installation_digest: requestDigest(prior), qualification: "unqualified_method_execution" as const };
    }
    const pending = origin.readExclusive(requestNamespace, requestDigest(originalBinding));
    if (pending) {
      const request = decodeRequest(pending.basis); assertInput(request);
      if (!isDeepStrictEqual(request.materials, request.materials.map(m => material(where.root, m.name))) || !isDeepStrictEqual(request.originals_identity, identity(join(where.root, "originals"), true))) fail();
      const activated: Installed = { format: "cimiloop/codex-matt-installation/2.0.0", request, materials: request.materials, originals_identity: request.originals_identity };
      const result = origin.claimExclusiveOnce(namespace, requestDigest(originalBinding), activated);
      const checked = installedRead(origin, local, where.root, originalBinding);
      return { ok: true as const, created: result.created, model: request.model, installation_digest: requestDigest(checked), qualification: "unqualified_method_execution" as const };
    }
    const materials = [material(where.root, "codex.exe", binaryBytes), material(where.root, "codex-code-mode-host.exe", hostBytes), material(where.root, "skill-package.json", packageBytes), ...(factsBytes ? [material(where.root, "facts.json", factsBytes)] : [])];
    const originalsIdentity = identity(directory(join(where.root, "originals")), true);
    const account = await (services.inspectLogin ?? inspectCodexMethodLogin)({ root: join(where.root, "inspection"), command: { file: join(where.root, "codex.exe"), args: [], sha256: digest(binaryBytes).value }, disabled_mcp_servers: disabled }, guard);
    guard(); if (!/^[a-f0-9]{64}$/.test(account.account_digest) || !isDeepStrictEqual(materials, materials.map(m => material(where.root, m.name))) || !isDeepStrictEqual(originalsIdentity, identity(join(where.root, "originals"), true))) fail();
    const request: InstallRequest = { format: "cimiloop/codex-matt-install-request/2.0.0", binding: originalBinding, model: input.model, account_digest: account.account_digest,
      binary_digest: digest(binaryBytes).value, source_digest: source.source_digest.value, package_digest: digest(packageBytes).value, disabled_mcp_servers: disabled, facts_digest: factsBytes ? digest(factsBytes).value : null,
      materials, originals_identity: originalsIdentity };
    origin.issueExclusive(requestNamespace, requestDigest(originalBinding), request);
    const activated: Installed = { format: "cimiloop/codex-matt-installation/2.0.0", request, materials, originals_identity: originalsIdentity };
    const result = origin.claimExclusiveOnce(namespace, requestDigest(originalBinding), activated);
    const checked = installedRead(origin, local, where.root, originalBinding);
    return { ok: true as const, created: result.created, model: input.model, installation_digest: requestDigest(checked), qualification: "unqualified_method_execution" as const };
  } catch { return fail(); } finally { origin.close(); }
}

export async function openInstalledCodexMatt(local: LocalProject): Promise<InstalledCodexMatt | undefined> {
  if (!process.env.LOCALAPPDATA) return undefined;
  const where = layout(local); if (!existsSync(where.root)) return undefined;
  let origin: AgentStartLedger | undefined;
  try {
    const originalBinding = binding(local); origin = await openWindowsAgentStartLedger(where.root, where.tools);
    const fixed = installedRead(origin, local, where.root, originalBinding), seal = requestDigest(fixed); let released = false;
    const guard = () => { if (released || requestDigest(installedRead(origin!, local, where.root, originalBinding)) !== seal) fail(); };
    const source = verifySkillPackageBytes(bytesAt(join(where.root, "skill-package.json")), { algorithm: "sha256", value: fixed.request.source_digest });
    const runtime = new CodexOriginalMethodRuntime({ root: join(where.root, "originals"), command: { file: join(where.root, "codex.exe"), args: [], sha256: fixed.request.binary_digest },
      account_digest: fixed.request.account_digest, disabled_mcp_servers: fixed.request.disabled_mcp_servers, timeout_ms: 180000 });
    const facts = fixed.request.facts_digest ? parseGatewayJson(new TextDecoder("utf-8", { fatal: true }).decode(bytesAt(join(where.root, "facts.json"))), 1024 * 1024) as Facts : undefined;
    const concrete = new CodexMattClarificationHost({ source, runtime, model: fixed.request.model, origin: "external_model", ...(facts ? { facts: new CodexFactInvestigator(runtime, fixed.request.model, facts.files, facts.source_identity) } : {}) });
    const host: MattClarificationHost = {
      prepare(input) { guard(); concrete.prepare(input); guard(); },
      async invoke(input, beforeEffect) { guard(); await concrete.invoke(input, () => { guard(); beforeEffect(); guard(); }); guard(); },
      async readOriginal(input) { guard(); const result = await concrete.readOriginal(input); guard(); return result; },
      verifyOriginal(input, original) { guard(); concrete.verifyOriginal(input, original); guard(); }
    };
    return { host: Object.freeze(host), model: fixed.request.model, installation_digest: seal, release() { if (!released) { released = true; origin!.close(); } } };
  } catch { origin?.close(); return fail(); }
}
