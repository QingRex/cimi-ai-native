import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AgentStartLedger, CodexOriginalMethodRuntime, digest } from "@cimiloop/runtime-adapter";
import {createInternalId} from '@cimiloop/protocol/v2';
import { packageGitSkill, type VerifiedSkillPackage } from "@cimiloop/skill-adapter";
import { startWorkbench } from "../../../apps/workbench/src/server.js";
import * as app from "../src/index.js";
import { createIntentProject } from "../../../tests/fixtures/intent-project.js";

// Actual Windows protected Host1 and SQLite, PUBLIC login/source fixtures.
// No user login, model call, approved Skill behavior or full Native acceptance.
describe.runIf(process.platform === "win32")("protected Codex Matt installation", () => {
  let root: string, source: VerifiedSkillPackage, previousAppData: string | undefined;
  const locals: ReturnType<typeof app.openLocalProject>[] = [], fixtures: ReturnType<typeof createIntentProject>[] = [];
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "cimiloop-codex-install-")); previousAppData = process.env.LOCALAPPDATA; process.env.LOCALAPPDATA = join(root, "user-data");
    mkdirSync(join(root, "public-binaries"));
    for (const name of ["codex.exe", "codex-code-mode-host.exe"]) copyFileSync(join(process.env.SystemRoot ?? "C:/Windows", "System32", "whoami.exe"), join(root, "public-binaries", name));
    const repo = join(root, "source"); mkdirSync(repo); const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=disabled-hooks", "-C", repo, ...args], { encoding: "utf8", windowsHide: true, stdio: "pipe" }).trim();
    const write = (path: string, text: string) => { mkdirSync(dirname(join(repo, path)), { recursive: true }); writeFileSync(join(repo, path), text); };
    git("init"); git("config", "user.name", "PUBLIC fixture"); git("config", "user.email", "public@example.test");
    write("LICENSE", "PUBLIC fixture license"); write("skills/grill-me/SKILL.md", "---\nname: grill-me\ndescription: PUBLIC clarification\n---\nAsk questions.\n"); git("add", "."); git("commit", "-m", "PUBLIC source");
    source = packageGitSkill(repo, { format: "cimiloop/skill-import/1.0.0", repository_url: "https://example.test/skills", commit_id: git("rev-parse", "HEAD"), entry_path: "skills/grill-me", license_path: "LICENSE", name: "PUBLIC source", version: "1.0.0", modules: [{ path: "skills/grill-me", dependencies: [] }], capabilities: [{ capability_id: "intent.clarify", version: "1.0.0" }], provider_dependencies: [], required_permissions: { actions: [], resources: [], environment_ids: [], network_hosts: [] }, harness_requirements: ["invoke_skills"], dependency_review: "PUBLIC fixture only" });
  }, 120000);
  afterAll(() => { for (const local of locals) local.store.close(); for (const fixture of fixtures) fixture.store.close(); if (previousAppData === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = previousAppData; });
  function project() {
    const path = mkdtempSync(join(root, "project-")), fixture = createIntentProject(path, { databasePath: join(path, ".cimiloop", "project.db") }); fixtures.push(fixture);
    app.writeInstance(join(path, ".cimiloop", "instance.json"), { schema_version: "1.0.0", instance_id: fixture.project.instance_id, project_id: fixture.project.id, actor_id: fixture.actor.id, created_at: fixture.project.created_at });
    const local = app.openLocalProject({ projectDir: path }); locals.push(local); return local;
  }
  const input = () => ({ source, binary: join(root, "public-binaries", "codex.exe"), model: "gpt-6-luna", disabled_mcp_servers: [] });
  const install = () => { const method = Reflect.get(app, "installCodexMatt"); expect(method).toBeTypeOf("function"); return method; };
  const open = () => { const method = Reflect.get(app, "openInstalledCodexMatt"); expect(method).toBeTypeOf("function"); return method; };
  async function workbenchState(local: ReturnType<typeof app.openLocalProject>) {
    const server = await startWorkbench({ projectDir: local.location.repositoryPath });
    try {
      const login = await fetch(server.origin + "/api/session", { method: "POST", headers: { Origin: server.origin, "Content-Type": "application/json", Connection: "close" }, body: JSON.stringify({ bootstrap: new URL(server.bootstrapUrl).hash.slice(1) }) });
      expect(login.status).toBe(200);
      const response = await fetch(server.origin + "/api/context", { headers: { Cookie: login.headers.get("set-cookie")!.split(";")[0]!, Connection: "close" } });
      expect(response.status).toBe(200); return await response.json();
    } finally { await server.close(); }
  }
  it("does not create an installation or inspect login while opening a missing host", async () => {
    const local = project(); expect(await open()(local)).toBeUndefined();
    expect(existsSync(join(process.env.LOCALAPPDATA!, "CimiLoop", "matt", local.instance.project_id))).toBe(false);
  }, 120000);
  it("keeps a host with no local application data path uninstalled", async () => {
    const local = project(), configured = process.env.LOCALAPPDATA; delete process.env.LOCALAPPDATA;
    try { expect(await open()(local)).toBeUndefined(); } finally { process.env.LOCALAPPDATA = configured; }
  }, 120000);
  it("requires the companion tool host before registering or inspecting a login", async () => {
    const local = project(); let inspections = 0;
    await expect(install()(local, { ...input(), binary: join(process.env.SystemRoot ?? "C:/Windows", "System32", "whoami.exe") }, { async inspectLogin() { inspections++; return { account_digest: "1".repeat(64) }; } })).rejects.toThrow();
    expect(inspections).toBe(0); expect(await open()(local)).toBeUndefined();
  }, 120000);
  it("retains an explicit protected installation and opens it without another login inspection", async () => {
    const local = project(); let inspections = 0;
    const result = await install()(local, input(), { async inspectLogin() { inspections++; return { account_digest: "1".repeat(64) }; } });
    expect(result).toMatchObject({ ok: true, model: "gpt-6-luna", created: true });
    const lease = await open()(local); try { expect(lease?.model).toBe("gpt-6-luna"); expect(lease?.host.prepare).toBeTypeOf("function"); expect(inspections).toBe(1); } finally { lease?.release(); }
    expect(await workbenchState(local)).toMatchObject({ matt_host_available: true, matt_installation_state: "installed" }); expect(inspections).toBe(1);
  }, 120000);
  it('requires ordinary permission in both default Matt and its actual delegated fact transport',async()=>{
    const local=project(),fixture=fixtures.at(-1)!;
    await install()(local,{...input(),facts:{source_identity:digest('PUBLIC frozen source snapshot').value,files:[{path:'src/source.ts',content:'export const value=1;'}]}},{async inspectLogin(){return{account_digest:'1'.repeat(64)};}});
    const observed:{policy:string|undefined;key:string}[]=[];
    const execute=vi.spyOn(CodexOriginalMethodRuntime.prototype,'execute').mockImplementation(async function(this:CodexOriginalMethodRuntime,request,tool,beforeEffect){
      observed.push({policy:this.originalConfiguration.usage_policy,key:request.operation_key});beforeEffect();
      if(observed.length>1)throw Error('PUBLIC stop before any real model');
      const context=Object.freeze({call_id:'PUBLIC_delegate',thread_id:'PUBLIC_parent',turn_id:'PUBLIC_turn',model:request.model,account_digest:'1'.repeat(64),signal:new AbortController().signal,beforeEffect});
      const names=JSON.parse(JSON.stringify(request.tools.find(t=>t.name==='invoke_skill')!.inputSchema)).properties.name.enum;
      for(const name of names)await tool('invoke_skill',{name},context);
      const paths=JSON.parse(JSON.stringify(request.tools.find(t=>t.name==='read_method_resource')!.inputSchema)).properties.path.enum;
      for(const path of paths)await tool('read_method_resource',{path},context);
      await tool('read_clarification_context',{},context);
      await tool('delegate_facts',{question:'Which fixed source declares the value?'},context);
      throw Error('PUBLIC expected a delegated child');
    });
    let lease:Awaited<ReturnType<typeof app.openInstalledCodexMatt>>;
    try{
      lease=await open()(local);if(!lease)throw Error('PUBLIC installed host required');
      const service=new app.LocalPrePlanClarification(local,lease.host),change=fixture.create(),before=local.store.asOfEventSequence();
      const session=service.begin(change.id,{request_id:createInternalId(),requirement:'PUBLIC review fixed source before Plan',background:'PUBLIC complete Human instruction',constraints:['Preserve original identity']}).session;
      await expect(service.advanceAsync(change.id,session.id,{request_id:createInternalId(),expected_head:0,kind:'matt'})).rejects.toMatchObject({code:'RECOVERY_CONDITIONS_UNMET'});
      expect(observed).toHaveLength(2);expect(observed.map(row=>row.policy)).toEqual(['require_ordinary_permission/1.0.0','require_ordinary_permission/1.0.0']);expect(new Set(observed.map(row=>row.key)).size).toBe(2);
      expect(service.show(change.id,session.id).session.pending).toBe(true);expect(local.store.asOfEventSequence()).toBe(before);
    }finally{lease?.release();execute.mockRestore();}
  },120000);
  it("replays the same install and rejects a changed approved model", async () => {
    let inspections = 0;
    const local = project(), services = { async inspectLogin() { inspections++; return { account_digest: "2".repeat(64) }; } };
    const first = await install()(local, input(), services), second = await install()(local, input(), services);
    expect(second).toMatchObject({ created: false, installation_digest: first.installation_digest });
    await expect(install()(local, { ...input(), model: "gpt-6.1-sol" }, services)).rejects.toThrow();
    expect(inspections).toBe(1);
    const lease = await open()(local); try { expect(lease?.model).toBe("gpt-6-luna"); } finally { lease?.release(); }
  }, 120000);
  it.each(["skill-package.json", "codex-code-mode-host.exe"])("rejects same-byte physical replacement of installed materials: %s", async name => {
    const local = project(); await install()(local, input(), { async inspectLogin() { return { account_digest: "3".repeat(64) }; } });
    const path = join(process.env.LOCALAPPDATA!, "CimiLoop", "matt", local.instance.project_id, local.instance.actor_id, name), bytes = readFileSync(path);
    renameSync(path, path + ".retained-original"); writeFileSync(path, bytes);
    await expect(open()(local)).rejects.toThrow();
    expect(await workbenchState(local)).toMatchObject({ matt_host_available: false, matt_installation_state: "unavailable" });
  }, 120000);
  it.each(["unchanged", "material", "originals"] as const)("resumes a request-only install only with the original physical materials: %s", async mode => {
    const local = project(); let inspections = 0;
    const services = { async inspectLogin() { inspections++; return { account_digest: "5".repeat(64) }; } };
    const originalClaim = AgentStartLedger.prototype.claimExclusiveOnce;
    const crash = vi.spyOn(AgentStartLedger.prototype, "claimExclusiveOnce").mockImplementation(function (this: AgentStartLedger, namespace, id, basis) {
      if (namespace === "codex_matt_installation") throw Error("PUBLIC crash after immutable installation request");
      return originalClaim.call(this, namespace, id, basis);
    });
    try { await expect(install()(local, input(), services)).rejects.toThrow(); } finally { crash.mockRestore(); }
    const root = join(process.env.LOCALAPPDATA!, "CimiLoop", "matt", local.instance.project_id, local.instance.actor_id);
    if (mode === "material") { const path = join(root, "skill-package.json"), bytes = readFileSync(path); renameSync(path, path + ".retained-original"); writeFileSync(path, bytes); }
    if (mode === "originals") { const path = join(root, "originals"); renameSync(path, path + ".retained-original"); mkdirSync(path); }
    if (mode === "unchanged") expect(await install()(local, input(), services)).toMatchObject({ ok: true, created: true });
    else { await expect(install()(local, input(), services)).rejects.toThrow(); await expect(open()(local)).rejects.toThrow(); }
    expect(inspections).toBe(1);
  }, 120000);
  it("never repairs a missing originals directory during replay or default opening", async () => {
    const local = project(); let inspections = 0;
    const services = { async inspectLogin() { inspections++; return { account_digest: "4".repeat(64) }; } };
    await install()(local, input(), services);
    const path = join(process.env.LOCALAPPDATA!, "CimiLoop", "matt", local.instance.project_id, local.instance.actor_id, "originals");
    renameSync(path, path + ".retained-original");
    await expect(open()(local)).rejects.toThrow();
    await expect(install()(local, input(), services)).rejects.toThrow();
    expect(existsSync(path)).toBe(false); expect(inspections).toBe(1);
  }, 120000);
});
