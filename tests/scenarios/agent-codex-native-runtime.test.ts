import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CimiLoopKernel } from "../../packages/kernel/src/index.js";
import { LocalAgentRuntimeComposition, LocalAgentCheckAdmission, LocalAgentStartCustody, LocalAgentModelAdmission, writeInstance } from "../../packages/local-app/dist/index.js";
import { CodexOriginalMethodRuntime, inspectCodexMethodLogin, createCodexAgentRuntimeModel, readCodexAgentModelOriginals, collectAgentRuntimeOperation, verifyCollectedCodexAgentModelOriginals, verifyOriginalTaskExecutionResult, readAgentRuntimeOriginalIdentity, readWorkspaceFileRunOriginals, initializeWindowsAgentStartLedger, digest, bytesAt, parseGatewayJson, parseAgentWorkspaceToolScope, type WorkspaceCheckTemplate } from "../../packages/runtime-adapter/dist/index.js";
import { startWorkbench } from "../../apps/workbench/src/server.js";
import { createInternalId } from "../../packages/protocol/src/v2/index.js";
import { createAgentRunProject } from "../fixtures/agent-run-project.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import { flowSuccess } from "../fixtures/flow-project.js";

// Explicit opt-in spends the user's already authorized Codex quota. Config is
// outside Git and contains native binary/model/MCP names, NEVER login tokens.
// Qualification, domain setup and budgets remain PUBLIC fixture contracts.
// Actual model, Windows/AppContainer, SDK, tool/check effects are reverified.
const configPath = process.env.CIMILOOP_CODEX_NATIVE_TEST_CONFIG;
describe.runIf(process.platform === "win32" && process.arch === "x64" && !!configPath)("original Native SDK with actual Codex login model", () => {
  it("joins real model suggestions, original Native read/check and unchanged Run replay", async () => {
    const config = JSON.parse(JSON.stringify(parseGatewayJson(bytesAt(configPath!, 65536).toString("utf8"), 65536))) as { binary: string; model: string; disabled_mcp_servers: string[] };
    expect(config.model).toBe("gpt-6-luna");
    const parent = process.env.CIMILOOP_NATIVE_TEST_ROOT ?? join(process.env.LOCALAPPDATA!, "CimiS1"); mkdirSync(parent, { recursive: true });
    const root = mkdtempSync(join(parent, "codex-native-")), command = { file: config.binary, args: [], sha256: digest(bytesAt(config.binary, 512 * 1024 * 1024)).value };
    const helper = join(dirname(config.binary), "codex-code-mode-host.exe"), helperDigest = digest(bytesAt(helper, 512 * 1024 * 1024)).value;
    const binaryGuard = () => { if (digest(bytesAt(config.binary, 512 * 1024 * 1024)).value !== command.sha256 || digest(bytesAt(helper, 512 * 1024 * 1024)).value !== helperDigest) throw Error("Approved Codex bundle changed"); };
    const f = createAgentRunProject(root, "task_execution", 100, [{ provider: "cimiloop_workspace", resource_type: "repository_path", locator: "src/**", version: "1.0.0" }], ["read_files", "run_checks"], ["src/**"], undefined, 600000), dataDirectory = dirname(f.path);
    let ledger: Awaited<ReturnType<typeof initializeWindowsAgentStartLedger>> | undefined;
    const startedAt = new Date().toISOString();
    writeFileSync(join(dataDirectory, "test-origin.json"), JSON.stringify({ startedAt, root, model: config.model, qualification: "PUBLIC domain/account/budget fixture; real Native and Codex model only", oldOperationRestarted: false }), { flag: "wx" });
    try {
      const login = await inspectCodexMethodLogin({ root: join(dataDirectory, "codex-inspection"), command, disabled_mcp_servers: config.disabled_mcp_servers, usage_policy:'require_ordinary_permission/1.0.0' }, binaryGuard);
      expect(login.quota_snapshot).toMatchObject({ordinary_usage_allowed:true,account_id_digest:expect.stringMatching(/^[a-f0-9]{64}$/)});
      const script = "import {query} from './query.ts'; if(query()!==1)throw Error('actual query check');\n"; writeFileSync(join(root, "src/check.mjs"), script); f.git("add", "src/check.mjs"); f.git("commit", "--quiet", "-m", "Actual fixed check source"); const source = f.capture();
      const template: WorkspaceCheckTemplate = { check_id: "query_test", profile: "node_test", entry: "src/check.mjs", inputs: [{ path: "src/check.mjs", expected_digest: digest(script).value }, { path: "src/query.ts" }], max_elapsed_ms: 4000, max_output_bytes: 32768 };
      const checks = await LocalAgentCheckAdmission.open({ repositoryPath: root, dataDirectory, nodeBinary: process.execPath, projectId: f.project.id, templates: [template], custody: { admit: f.runPort.agent.admitContext, verify: (_project, input, original) => contentDigest({ PUBLIC_fixture: true, input, original }) } });
      ledger = await initializeWindowsAgentStartLedger(join(dataDirectory, "start-origin"), join(dataDirectory, "start-tools"));
      const transport = new CodexOriginalMethodRuntime({ root: join(dataDirectory, "codex-model"), command, account_digest: login.account_digest, disabled_mcp_servers: config.disabled_mcp_servers, timeout_ms: 180000,state_policy:'private_operation_state/1.0.0',process_custody:'owner_job/1.0.0',process_root:join(dataDirectory,'codex-processes') },false,ledger);
      const custody = new LocalAgentStartCustody(root, dataDirectory, ledger, { admit: checks.admit.bind(checks), verifyLaunch: (_project, input, original) => contentDigest({ PUBLIC_fixture: true, input, original }), verifyModel: (_project, input, original) => contentDigest({ PUBLIC_fixture: true, input, original }) });
      f.runPort.agent.admitContext = (project, input) => { try { return custody.admit(project, input); } catch (error) { writeFileSync(join(dataDirectory, "admission-failure.json"), JSON.stringify({ message: String(error), stack: error instanceof Error ? error.stack : null })); throw error; } }; f.runPort.agent.checkRunAuthority = custody.checkRunAuthority.bind(custody); f.runPort.agent.checkToolAuthority = (project, input) => checks.validateTool(project, input, custody);
      const modelAdmission = new LocalAgentModelAdmission(root, dataDirectory, custody, checks); f.runPort.agent.checkModelAuthority = modelAdmission.checkModelAuthority.bind(modelAdmission);
      const kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => new Date().toISOString(), runVerifier: f.runPort });
      const prepare = f.prepareCommand(), prepared = flowSuccess(kernel.execute({ ...prepare, payload: { ...f.pins, source_snapshot_ref: { object_type: "source_snapshot", id: source.id } } }));
      if (prepared.command_type !== "PrepareRunContext" || !("runtime_binding" in prepared.data.context)) throw Error("Agent Context expected");
      const reserved = flowSuccess(kernel.execute(f.reserveCommand({ ...prepared.data, context: prepared.data.context }, 100))); if (reserved.command_type !== "ReserveRun" || reserved.data.record.run_kind !== "agent") throw Error("Agent Run expected");
      const scope = parseAgentWorkspaceToolScope({ project_id: f.project.id, run_id: reserved.data.run.id, operation_key: reserved.data.record.operation_key, executor_actor_id: f.agent.id, context_digest: reserved.data.record.input_digest, ...f.pins, host_admission_ref: reserved.data.record.host_admission_ref });
      const authority = () => { const assessment = kernel.assessAgentRunModel(scope); if (!("decision" in assessment) || assessment.decision !== "ALLOW") throw Error("Current original Kernel model authority denied"); binaryGuard(); };
      const model = createCodexAgentRuntimeModel({ root: dataDirectory, scope, runtime: transport, model: config.model, account_digest: login.account_digest,quota_account_digest:login.quota_snapshot!.account_id_digest!, admission_digest: digest(JSON.stringify({qualification:'PUBLIC Native qualification and budget only',output_profile:'bounded_2048/1.0.0',usage_policy:'require_ordinary_permission/1.0.0',state_policy:'private_operation_state/1.0.0'})).value, permitted_tools:['cimi_read','cimi_check'],output_profile:'bounded_2048/1.0.0', usage_policy:'require_ordinary_permission/1.0.0', origin: "external_model", authority: { async check(current) { expect(current).toEqual(scope); authority(); }, beforeEffect: authority } });
      const local = { caller: f.caller, store: f.store, kernel, location: { repositoryKind: "git" as const, repositoryPath: root, dataDirectory, databasePath: f.path, instancePath: join(dataDirectory, "instance.json"), suggestedName: "Actual Codex/Native; PUBLIC qualification" } };
      // Bound this real-model test to six SDK dispatches. This is a test quota
      // guard, not a provider invoice or production budget approval.
      let modelDispatches=0;
      const boundedModel={...model,async execute(...args:Parameters<typeof model.execute>){if(modelDispatches>=6)throw Error('Actual Native test model dispatch limit reached');modelDispatches++;return model.execute(...args);}};
      const runtime = LocalAgentRuntimeComposition.open({ local, binary: join(process.env.APPDATA!, "npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe"), custody, checks, model:boundedModel });
      writeFileSync(join(dataDirectory, "original-run.json"), JSON.stringify({ scope, record: reserved.data.record, context: prepared.data.context }), { flag: "wx" });
      console.error("Retain actual Codex Native original: " + root);
      expect(await runtime.start(scope.run_id)).toMatchObject({ outcome: "original" });
      const original = readCodexAgentModelOriginals(dataDirectory, scope), collected = await collectAgentRuntimeOperation(dataDirectory, scope, { project: f.project, record: reserved.data.record });
      expect(original.status).toBe("Observed");
      const modelHeader=JSON.parse(bytesAt(join(dataDirectory,'agent-codex-model-originals',scope.project_id,scope.run_id,'header.json'),262144).toString('utf8'));
      expect(modelHeader).toMatchObject({format:'cimiloop/codex-agent-model/18.0.0',permitted:['cimi_read','cimi_check']});
      for(const call of original.calls){expect(call.original?.tool_calls).toHaveLength(1);expect(['cimi_read','cimi_check','cimiloop_task_result']).toContain(call.original!.tool_calls[0]!.tool);expect(JSON.parse(call.original!.tool_calls[0]!.output)).toMatchObject({sdk_effect_executed:false,response_submitted:true});}
      expect(original.real_model_turns).toBeGreaterThanOrEqual(2); expect(collected.codex_model).toMatchObject({ status: "Observed", output_profile:'bounded_2048/1.0.0',usage_policy:'require_ordinary_permission/1.0.0', original_requirement_pinned: true, costs_reconciled: false });
      for(const call of original.calls){const operation=dirname(call.original!.original_ref.locator),start=JSON.parse(bytesAt(join(operation,'start.json'),65536).toString('utf8'));expect(start).toMatchObject({format:'cimiloop/codex-method-start/10.0.0',state_policy:'private_operation_state/1.0.0',process_custody:'owner_job/1.0.0',config:{sqlite_home:join(operation,'state','sqlite'),log_dir:join(operation,'state','log'),history:{persistence:'none'}}});}
      expect(original.artifacts.some(file=>file.name.endsWith('/process-job/ended.json'))).toBe(true);
      expect(ledger.listExclusive('codex_process_job_complete')).toHaveLength(original.calls.length);
      for(const call of original.calls){expect(call.original).toMatchObject({ordinary_quota:{before:{ordinary_usage_allowed:true,account_id_digest:login.quota_snapshot!.account_id_digest},after:{account_id_digest:login.quota_snapshot!.account_id_digest},costs_reconciled:false}});}
      const identity=readAgentRuntimeOriginalIdentity(dataDirectory,scope),nativeConfig=JSON.parse(bytesAt(join(identity.operation,'original-config.json'),65536).toString('utf8'));
      expect(nativeConfig).toMatchObject({format:'cimiloop/agent-workspace-sandbox-config/17.0.0',writable_storage_profile:'private_state_only/2.0.0',provider_options:{model_output_profile:'bounded_2048/1.0.0',workspace_tool_names:['cimi_read','cimi_check']}});
      expect(collected.native).toMatchObject({ status: "Verified", native_effect_reverified: true }); expect(collected.ipc).toMatchObject({ status: "Observed", correlation: { uncorrelated_exchanges: 0, unmatched_sdk_calls: 0 } });
      verifyCollectedCodexAgentModelOriginals(dataDirectory, scope, collected);
      expect(readWorkspaceFileRunOriginals(dataDirectory, f.project, reserved.data.record).calls).toEqual(expect.arrayContaining([expect.objectContaining({ input: expect.objectContaining({ tool: "read_file", path: "src/query.ts" }), state: "completed" })]));
      const domain = { definition: f.store.getExecutionRecord("task_definition", reserved.data.record.definition_ref.id)!, contract: f.store.getIntentRecord("contract_version", reserved.data.record.contract_ref.id)!, plan: f.store.getIntentRecord("plan_version", reserved.data.record.plan_ref.id)! };
      const executionResult=verifyOriginalTaskExecutionResult(dataDirectory, f.project, reserved.data.record, prepared.data.context, identity, collected, domain);
      expect(executionResult).toMatchObject({ run_id: scope.run_id, native_effect_reverified: true, required_checks: [{ check_id: "query_test" }], task_acceptance_proven: false, costs_reconciled: false });
      expect(await runtime.start(scope.run_id)).toMatchObject({ outcome: "original" }); expect(readCodexAgentModelOriginals(dataDirectory, scope)).toEqual(original);
      writeInstance(join(dataDirectory, "instance.json"), { schema_version: "1.0.0", instance_id: f.project.instance_id, project_id: f.project.id, actor_id: f.actor.id, created_at: f.project.created_at });
      const server = await startWorkbench({ projectDir: root });
      let workbenchObservation:unknown;
      try {
        const session = await fetch(server.origin + "/api/session", { method: "POST", headers: { Origin: server.origin, "Content-Type": "application/json" }, body: JSON.stringify({ bootstrap: new URL(server.bootstrapUrl).hash.slice(1) }) }); expect(session.status).toBe(200);
        const cookie = session.headers.get("set-cookie")!.split(";")[0]!, csrf = (await session.json() as { csrf: string }).csrf;
        const request = { command_id: createInternalId(), requested_at: new Date().toISOString(), acting_role: "technical_owner", command_type: "RecordRunObservation", target: { object_type: "run", id: scope.run_id }, expected_revision: f.store.getRun(scope.run_id)!.revision, payload: {} };
        const observe = async () => { const response = await fetch(server.origin + "/api/agent-runs/" + scope.run_id + "/observe", { method: "POST", headers: { Origin: server.origin, Cookie: cookie, "Content-Type": "application/json", "X-CimiLoop-CSRF": csrf, Connection: "close" }, body: JSON.stringify(request) }); const body = await response.json(); expect({ status: response.status, body }).toMatchObject({ status: 200 }); return body; };
        const sequence = f.store.asOfEventSequence(), first = await observe(); expect(first).toMatchObject({ command_type: "RecordRunObservation", data: { observation: { report: { status: "unknown", usage: { cost_known: false } } } } }); expect(await observe()).toEqual(first); expect(f.store.asOfEventSequence()).toBe(sequence + 1);
        workbenchObservation={request,eventSequenceBefore:sequence,eventSequenceAfter:f.store.asOfEventSequence(),reply:first,replayAddedEvents:0};
        expect(f.task().usage).toMatchObject({ pending_reconciliation: true, cost_reserved_micros: 100 }); expect(readCodexAgentModelOriginals(dataDirectory, scope)).toEqual(original);
      } finally { await server.close(); }
      writeFileSync(join(dataDirectory, "summary.json"), JSON.stringify({ ok: true, startedAt, finishedAt: new Date().toISOString(), root, runId: scope.run_id, model: config.model, modelDispatches, dispatchLimit:6, processCustody:'owner_job/1.0.0', realModelTurns: original.real_model_turns, native: collected.native, ipc: collected.ipc, codex: collected.codex_model, executionResult, workbenchObservation, replayAddedModelTurns: 0, productionQualification: false, costsReconciled: false }, null, 2), { flag: "wx" });
    } finally { ledger?.close(); f.store.close(); console.error("Preserve all original Native resources and evidence: " + root); }
  }, 780000);
});
