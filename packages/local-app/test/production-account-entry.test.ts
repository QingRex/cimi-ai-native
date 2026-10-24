import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { digest, initializeWindowsAgentStartLedger, initializeWindowsDedicatedAgentAccountLedger } from "@cimiloop/runtime-adapter";
import type { HumanAgentAccountFactory } from "../src/agent-account-billing-entry-local.js";
import * as production from "../src/agent-production-admission-local.js";
import { LocalHumanAgentAccountBilling, openLocalProject, writeInstance } from "../src/index.js";
import { readHumanOriginalAgentRunInputs } from "../src/agent-runtime-control-local.js";
import { createAgentRunProject } from "../../../tests/fixtures/agent-run-project.js";
import { createInternalId } from "@cimiloop/protocol/v2";
import * as localApp from "../src/index.js";
import { spawnSync } from "node:child_process";
import { startWorkbench } from "../../../apps/workbench/src/server.js";
import { executeLocalCommand } from "../src/project.js";

// Real Windows Host custody and SQLite; public policy and no credentials/model.
// Originals are retained. This is account-read integration, not S1 acceptance.
describe("installed production historical account entry", () => {
  let local: ReturnType<typeof openLocalProject>, fixture: ReturnType<typeof createAgentRunProject>;
  let runId: string, connectionPath: string, root: string;
  const factory = (): HumanAgentAccountFactory => {
    const value: unknown = Reflect.get(localApp, "productionAgentAccount");
    expect(value, "default production historical account factory").toBeTypeOf("function");
    return value as HumanAgentAccountFactory;
  };
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "cimiloop-production-account-"));
    fixture = createAgentRunProject(root);
    runId = fixture.reserveAgent(fixture.prepareAgent()).run.id;
    writeInstance(join(dirname(fixture.path), "instance.json"), { schema_version: "1.0.0", instance_id: fixture.project.instance_id,
      project_id: fixture.project.id, actor_id: fixture.actor.id, created_at: fixture.project.created_at });
    local = openLocalProject({ projectDir: root });
    const layout = production.productionRuntimeLayout(local);
    mkdirSync(dirname(layout.connectionPath), { recursive: true });
    mkdirSync(dirname(layout.accountRoot), { recursive: true });
    connectionPath = layout.connectionPath;
    const connection = { format: "cimiloop/dedicated-model/1.0.0" as const, provider: "openai-compatible" as const,
      model: "openai-compatible/public-historical-model", endpoint: "https://public.example/v1/chat/completions",
      credential_file: join(dirname(layout.accountRoot), fixture.project.id + ".ABSENT-CREDENTIAL"), credential_digest: digest("PUBLIC absent credential") };
    writeFileSync(connectionPath, JSON.stringify(connection), { flag: "wx" });
    const origin = await initializeWindowsAgentStartLedger(layout.startRoot, layout.toolsRoot);
    try {
      const account = await initializeWindowsDedicatedAgentAccountLedger({ origin, root: layout.accountRoot, repositoryPath: root,
        toolsRoot: layout.toolsRoot, connection, admission: { check: async () => { throw Error("No model admission in read fixture"); } },
        policy: { format: "cimiloop/dedicated-agent-account/1.0.0", host_identity_digest: origin.identityDigest,
          account_digest: digest(root + " account").value, approval_digest: digest("PUBLIC historical approval").value,
          package_digest: digest("PUBLIC historical package").value, tariff_digest: digest("PUBLIC historical tariff").value,
          admission_digest: digest("PUBLIC historical admission").value, connection_digest: digest(JSON.stringify(connection)).value,
          profile: { model: "public-historical-model", thinking: "disabled" }, cash_limit_micros: 60, credit_limit_micro_units: 0,
          cash_per_call_upper_micros: 30, credit_per_call_upper_micro_units: 0, input_token_limit: 10000, output_token_limit: 512 } });
      account.close();
    } finally { origin.close(); }
  }, 120_000);
  afterAll(() => { local?.store.close(); fixture?.store.close(); });

  it("reads installed historical costs without a credential, binary, checks or paid authorization", async () => {
    const before = fixture.store.asOfEventSequence();
    const service = new LocalHumanAgentAccountBilling(local, factory());
    const first = await service.query(runId);
    expect(first).toMatchObject({ outcome: "observed", costs: { holds: 0, costs_reconciled: false }, starts_run: false, kernel_costs_reconciled: false });
    expect(await service.query(runId)).toEqual(first);
    expect(fixture.store.asOfEventSequence()).toBe(before);
  });

  it("returns an idempotently releasable read lease that cannot reserve new model funds", async () => {
    const lease = await factory()(runId, local);
    try {
      const scope = readHumanOriginalAgentRunInputs(local, runId).scope;
      expect(lease.account.readRunCosts(scope)).toMatchObject({ holds: 0, costs_reconciled: false });
      await expect(lease.account.check(scope, JSON.parse(readFileSync(connectionPath, "utf8")))).rejects.toThrow();
      const body = Buffer.from("PUBLIC read lease cannot send");
      await expect(lease.account.reserve(scope, { scope_digest: digest(JSON.stringify(scope)).value,
        admission_digest: lease.account.admission_digest, connection_digest: digest(JSON.stringify(JSON.parse(readFileSync(connectionPath, "utf8")))).value,
        call_id: "model_0001", request_id: digest("PUBLIC denied hold").value, request_digest: digest(body).value,
        input_bytes: body.length, max_output_tokens: 512 }, body)).rejects.toThrow();
      expect(lease.account.readRunCosts(scope).holds).toBe(0);
    } finally { await lease.release(); await lease.release(); }
  });

  it("checks Human and original Run identity before opening an account", async () => {
    await expect(factory()(createInternalId(), local)).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    const human = local.instance.actor_id;
    local.instance.actor_id = fixture.agent.id;
    try { await expect(factory()(runId, local)).rejects.toMatchObject({ code: "CALLER_IDENTITY_MISMATCH" }); }
    finally { local.instance.actor_id = human; }
  });

  it("uses the installed account from the ordinary compiled CLI without an injected launcher", () => {
    const before = fixture.store.asOfEventSequence();
    const result = spawnSync(process.execPath, [resolve("apps/cli/dist/bin.js"), "run", "costs", runId, "--json", "--project-dir", root],
      { encoding: "utf8", windowsHide: true, timeout: 120_000 });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome: "observed", costs: { holds: 0, costs_reconciled: false }, starts_run: false });
    expect(fixture.store.asOfEventSequence()).toBe(before);
  }, 120_000);

  it("exposes the installed account in the default workbench and reads it over authenticated HTTP", async () => {
    const workbench = await startWorkbench({ projectDir: root }), before = fixture.store.asOfEventSequence();
    try {
      const login = await fetch(workbench.origin + "/api/session", { method: "POST", headers: { Origin: workbench.origin, "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify({ bootstrap: new URL(workbench.bootstrapUrl).hash.slice(1) }) });
      const headers = { Cookie: login.headers.get("set-cookie")!.split(";")[0]!, Connection: "close" };
      const context = await fetch(workbench.origin + "/api/context", { headers });
      expect(await context.json()).toMatchObject({ agent_costs_available: true });
      const result = await fetch(workbench.origin + `/api/agent-runs/${runId}/costs`, { headers });
      expect(result.status).toBe(200);
      expect(await result.json()).toMatchObject({ outcome: "observed", costs: { holds: 0, costs_reconciled: false }, starts_run: false });
      expect(fixture.store.asOfEventSequence()).toBe(before);
    } finally { await workbench.close(); }
  }, 120_000);

  it("does not recreate a missing original account or return financial data", async () => {
    const path = join(production.productionRuntimeLayout(local).accountRoot, "account.sqlite");
    renameSync(path, path + ".RETAINED-ORIGINAL");
    try {
      const result = await new LocalHumanAgentAccountBilling(local, factory()).query(runId);
      expect(result).toMatchObject({ outcome: "unknown", reason: "agent_account_original_unavailable" });
      expect(result).not.toHaveProperty("costs");
      expect(existsSync(path)).toBe(false);
    } finally { renameSync(path + ".RETAINED-ORIGINAL", path); }
  });

  it("keeps historical reads available after Kernel cancellation without settling the Run", async () => {
    const result = executeLocalCommand(local, { command_id: createInternalId(), requested_at: new Date().toISOString(),
      acting_role: "technical_owner", command_type: "CancelRun", target: { object_type: "run", id: runId },
      expected_revision: fixture.store.getRun(runId)!.revision, payload: { reason: "PUBLIC cancellation before historical query" } });
    expect(result).not.toHaveProperty("code");
    const before = fixture.store.asOfEventSequence();
    expect(await new LocalHumanAgentAccountBilling(local, factory()).query(runId)).toMatchObject({ outcome: "observed", kernel_costs_reconciled: false });
    expect(fixture.store.asOfEventSequence()).toBe(before);
    expect(resolve(root)).toBe(local.location.repositoryPath);
  });
  it('keeps a pre-existing Dedicated Run on its original account after a Codex installation in the same project',async()=>{
    const binaries=join(root,'PUBLIC-codex-binaries');mkdirSync(binaries);for(const name of ['codex.exe','codex-code-mode-host.exe','opencode.exe','node.exe'])copyFileSync(join(process.env.SystemRoot??'C:/Windows','System32','whoami.exe'),join(binaries,name));
    await localApp.installCodexAgentRuntime(local,{binary:join(binaries,'codex.exe'),native_binary:join(binaries,'opencode.exe'),node_binary:join(binaries,'node.exe'),model:'gpt-6-luna',checks:[{check_id:'query_test',profile:'node_test',entry:'src/check.mjs',inputs:[{path:'src/check.mjs',expected_digest:'4'.repeat(64)},{path:'src/query.ts'}],max_elapsed_ms:4000,max_output_bytes:32768}]},{async inspectLogin(){return{account_digest:digest(root+' PUBLIC Codex').value,quota_snapshot:{format:'cimiloop/codex-ordinary-quota/1.0.0',ordinary_usage_allowed:true,account_id_digest:digest(root+' PUBLIC quota').value,primary:null,secondary:null,credits:null}};}});
    await localApp.installCodexUsageBudget(local,{model_calls:2,output_tokens:4096});const before=fixture.store.asOfEventSequence();
    expect(await new LocalHumanAgentAccountBilling(local,localApp.productionAgentCosts).query(runId)).toMatchObject({outcome:'observed',costs:{holds:0,costs_reconciled:false}});expect(localApp.hasProductionAgentBillAccount(local,runId)).toBe(true);
    const result=spawnSync(process.execPath,[resolve('apps/cli/dist/bin.js'),'run','costs',runId,'--json','--project-dir',root],{encoding:'utf8',windowsHide:true,timeout:120000});expect(result.status).toBe(0);expect(JSON.parse(result.stdout)).toMatchObject({outcome:'observed',costs:{holds:0,costs_reconciled:false}});expect(fixture.store.asOfEventSequence()).toBe(before);
  },120000);
});
