import { existsSync, mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createInternalId } from "../../packages/protocol/src/v2/index.js";
import { openInstalledCodexAgentRuntime, openLocalProject } from "../../packages/local-app/dist/index.js";
import { packageGitSkill, fixedMethodInvocationPlan } from "../../packages/skill-adapter/dist/index.js";
import { AgentNamedMethodHost, AgentRuntimeModelHost, AgentWorkspaceToolIpc, AgentRunBudget,
  openWindowsAgentRunClock, CodexOriginalMethodRuntime, createCodexAgentRuntimeModel,
  runOpenCodeWorkspaceRuntime, readAgentRuntimeNamedMethodResult, readCodexAgentModelOriginals,
  readAgentRuntimeOriginalIdentity, readAgentNamedMethodOriginals, collectAgentRuntimeOperation,
  verifyCollectedCodexAgentModelOriginals, readAgentRuntimeModelOriginals, bytesAt, digest, parseGatewayJson, parseAgentWorkspaceToolScope
} from "../../packages/runtime-adapter/dist/index.js";
import { claimAgentRuntimeOperation } from "../../packages/runtime-adapter/dist/agent-runtime-operation.js";

// Explicit opt-in: actual approved Luna quota, Git-proven upstream Skill bytes,
// Windows/AppContainer and original SDK. Domain scope/budget remain PUBLIC.
// This is neither Skill behavior qualification nor production/S1 acceptance.
const project = process.env.CIMILOOP_CODEX_INSTALLED_TEST_PROJECT;
const sourcePath = process.env.CIMILOOP_MATT_SKILL_SOURCE;
const retainedRoot = process.env.CIMILOOP_CODEX_NAMED_ORIGINAL_TEST_ROOT;
const load = (path: string) => JSON.parse(JSON.stringify(parseGatewayJson(bytesAt(path, 512 * 1024).toString("utf8"), 512 * 1024)));
// Explicit original reconciliation is read-only at model/SDK/effect boundaries.
// It never creates another Run, extends a clock, repairs a claim or sends a turn.
async function reconcileRetainedOriginal(root: string) {
  const packet = load(join(root, "original-method.json")), local = openLocalProject({ projectDir: packet.project });
  let installation: Awaited<ReturnType<typeof openInstalledCodexAgentRuntime>>;
  try {
    installation = await openInstalledCodexAgentRuntime(local); if (!installation) throw Error("Original installation unavailable"); const fixed = installation;
    fixed.guard(); expect(packet.installationDigest).toBe(fixed.installation_digest); expect(fixed.model).toBe("gpt-6-luna"); expect(packet.scope.project_id).toBe(local.instance.project_id);
    const spec = load(resolve("packages/skill-adapter/candidates/matt-clarification.json")), source = packageGitSkill(sourcePath!, spec), plan = fixedMethodInvocationPlan(source, packet.plan.request);
    expect(plan).toEqual(packet.plan); expect(packet.sourceCommit).toBe(spec.commit_id);
    const scope = parseAgentWorkspaceToolScope(packet.scope), identity = readAgentRuntimeOriginalIdentity(root, scope), before = local.store.asOfEventSequence();
    const prompt = JSON.stringify({ format: "cimiloop/agent-runtime-named-method-packet/1.0.0", method_profile: plan.profile, instructions: plan.prompt }, null, 1);
    expect(identity.input).toMatchObject({ prompt });
    const original = readCodexAgentModelOriginals(root, scope), sdk = readAgentRuntimeModelOriginals(root, scope);
    expect(original).toMatchObject({ status: "Observed", origin: "external_model", original_requirement_pinned: true, quota_account_digest: fixed.quota_account_digest, costs_reconciled: false });
    expect(original.real_model_turns).toBeGreaterThanOrEqual(2);
    for (const call of original.calls) expect(call.original).toMatchObject({ account_digest: fixed.account_digest, model: fixed.model, ordinary_quota: { before: { ordinary_usage_allowed: true, account_id_digest: fixed.quota_account_digest }, after: { account_id_digest: fixed.quota_account_digest } } });
    const result = readAgentRuntimeNamedMethodResult(root, scope, { profile: plan.profile, files: plan.files });
    expect(result).toMatchObject({ status: "Observed", method_result_reverified: true, output: { purpose: "clarification" }, costs_reconciled: false });
    if (result.output?.purpose !== "clarification") throw Error("Original clarification unavailable"); expect(result.output.questions).toHaveLength(1); expect(result.output.unresolved.length).toBeGreaterThan(0);
    // Reconcile the saved policy; historical config13 must never acquire config16 authority.
    const config = load(join(identity.operation, "original-config.json"));
    expect(config).toMatchObject(identity.input!==null&&typeof identity.input==='object'&&Object.hasOwn(identity.input,'writable_storage_profile')
      ? {format:"cimiloop/agent-workspace-sandbox-config/16.0.0",writable_storage_profile:'private_state_only/2.0.0'}
      : {format:"cimiloop/agent-workspace-sandbox-config/13.0.0"});
    const methods = readAgentNamedMethodOriginals(root, scope, plan.profile, plan.files, config.method_original_binding);
    const collection = load(join(root, "original-collection.json"));
    expect(collection.named_method).toMatchObject({ status: "Observed", method_result_reverified: true }); expect(collection.ipc).toMatchObject({ status: "Observed", unresolved: 0, correlation: { uncorrelated_exchanges: 0, unmatched_sdk_calls: 0 } }); verifyCollectedCodexAgentModelOriginals(root, scope, collection);
    fixed.guard(); expect(readAgentRuntimeOriginalIdentity(root, scope)).toEqual(identity);
    expect(readCodexAgentModelOriginals(root, scope)).toEqual(original); expect(readAgentRuntimeModelOriginals(root, scope)).toEqual(sdk); expect(readAgentNamedMethodOriginals(root, scope, plan.profile, plan.files, config.method_original_binding)).toEqual(methods); expect(local.store.asOfEventSequence()).toBe(before);
    const summary = { ok: true, root, project: packet.project, startedAt: packet.startedAt, scope, model: fixed.model, sourceCommit: spec.commit_id, realModelTurns: original.real_model_turns, outputTokens: original.calls.map(call => call.original!.usage.outputTokens),
      resultDigest: result.output_digest, result: result.output, matchedCalls: result.matched_calls, originalReconciliation: true, additionalModelTurns: 0, additionalMethodEffects: 0, additionalKernelEvents: 0, productionQualification: false, costsReconciled: false };
    return summary;
  } finally { installation?.release(); local.store.close(); }
}
describe.runIf(process.platform === "win32" && process.arch === "x64" && !!sourcePath && (!!project || !!retainedRoot))("original Codex named Skill Native execution", () => {
  it("invokes real fixed Skill sources through the original SDK and independently verifies the closed result", async () => {
    if (retainedRoot) { console.error("Original Skill reconciliation: " + JSON.stringify(await reconcileRetainedOriginal(resolve(retainedRoot)))); return; }
    const local = openLocalProject({ projectDir: project! });
    let installation: Awaited<ReturnType<typeof openInstalledCodexAgentRuntime>>, budget: AgentRunBudget | undefined;
    const parent = process.env.CIMILOOP_NATIVE_TEST_ROOT ?? join(process.env.LOCALAPPDATA!, "CimiS1"); mkdirSync(parent, { recursive: true });
    const root = mkdtempSync(join(parent, "codex-skill-")), startedAt = new Date().toISOString();
    console.error("Preserve actual Codex/Skill Native original: " + root);
    try {
      installation = await openInstalledCodexAgentRuntime(local); if (!installation) throw Error("Install the approved Codex runtime first");
      const fixed = installation; expect(fixed.model).toBe("gpt-6-luna"); const eventsBefore = local.store.asOfEventSequence();
      const spec = JSON.parse(JSON.stringify(parseGatewayJson(bytesAt(resolve("packages/skill-adapter/candidates/matt-clarification.json"), 65536).toString("utf8"), 65536)));
      const source = packageGitSkill(sourcePath!, spec), key = createInternalId();
      const plan = fixedMethodInvocationPlan(source, { format: "cimiloop/named-skill-method/1.0.0", invocation_key: key,
        method_name: source.modules.find(module => module.path === source.package.spec.entry_path)!.name, source_digest: source.source_digest,
        input: { purpose: "clarification", requirement: "工作台在启动 Agent 前展示尚缺的正式资格和预算条件，并允许按原操作身份查询、停止和恢复。",
          background: "本次只进行真实 Skill 方法澄清；没有 Human 回答、正式 Provider 资格、费用账单或可供调查的业务仓库事实。",
          constraints: ["只问 Human 需要决定的业务问题；不可验证的环境事实保留为 unresolved。", "只返回一条最关键的业务澄清问题；不创建 Plan、Task、Run 或 Decision。", "如真实 Skill 需要委派调查，但本固定宿主不提供委派能力，必须如实记录限制，不冒充已调查。"] } });
      const scope = parseAgentWorkspaceToolScope({ project_id: local.instance.project_id, run_id: createInternalId(), operation_key: key,
        executor_actor_id: createInternalId(), context_digest: digest("PUBLIC named method scope, not a Kernel Run"), skill_bindings: [],
        runtime_binding: { binding_ref: { object_type: "provider_binding", id: createInternalId() }, digest: digest("PUBLIC qualification only") },
        host_admission_ref: { provider: "local_content", resource_type: "agent_host_admission", locator: digest("PUBLIC method admission").value, digest: digest("PUBLIC method admission") } });
      const prompt = JSON.stringify({ format: "cimiloop/agent-runtime-named-method-packet/1.0.0", method_profile: plan.profile, instructions: plan.prompt }, null, 1);
      const admission = digest(JSON.stringify({ scope, installation: fixed.installation_digest, source: source.source_digest, qualification: "PUBLIC only" })).value;
      const guard = () => { fixed.guard(); if (local.store.asOfEventSequence() !== eventsBefore) throw Error("Unexpected business mutation"); };
      const transport = new CodexOriginalMethodRuntime({ root: join(fixed.root, "originals"), command: { file: fixed.binary, args: [], sha256: digest(bytesAt(fixed.binary, 512 * 1024 * 1024)).value }, account_digest: fixed.account_digest, disabled_mcp_servers: fixed.disabled_mcp_servers, timeout_ms: 180000 });
      const port = createCodexAgentRuntimeModel({ root, scope, runtime: transport, model: fixed.model, account_digest: fixed.account_digest, quota_account_digest: fixed.quota_account_digest,
        output_profile: fixed.output_profile, usage_policy: fixed.usage_policy, admission_digest: admission, origin: "external_model", permitted_tools: ["cimi_invoke_skill", "cimi_read_method_resource"],
        authority: { async check(current) { expect(current).toEqual(scope); guard(); }, beforeEffect: guard } });
      const method = AgentNamedMethodHost.initialize(root, scope, plan.profile, plan.files, guard);
      const model = await AgentRuntimeModelHost.initialize(root, scope, port, ["cimi_invoke_skill", "cimi_read_method_resource"], prompt);
      const clock = await openWindowsAgentRunClock(root), taskId = createInternalId();
      try { const now = await clock.read(); budget = await AgentRunBudget.open(root, { basis: () => ({ scope, task_id: taskId, first_started_at: now.utc, max_elapsed_ms: 600000 }), readClock: clock.read, closeClock: clock.close }); }
      catch (error) { await clock.close(); throw error; }
      const originalBudget = budget;
      writeFileSync(join(root, "original-method.json"), JSON.stringify({ startedAt, project, scope, plan, sourceCommit: spec.commit_id, installationDigest: fixed.installation_digest, qualification: "PUBLIC only" }), { flag: "wx" });
      const launch = () => runOpenCodeWorkspaceRuntime({ root, binary: fixed.native_binary, scope, prompt, model, method, runBudget: originalBudget, beforeNativeEffect: guard,
        connect: (supervisor, originalSupervisor, peer, nonce, signal, originalModel) => AgentWorkspaceToolIpc.open({ toolsDirectory: root, scope, supervisor, originalSupervisor, originalPeer: peer, nonce, signal, runBudget: originalBudget, method, model: originalModel,
          execute: async () => { throw Error("No ordinary workspace authority in a fixed Skill method"); }, cancel: async () => {} }) });
      await launch();
      const original = readCodexAgentModelOriginals(root, scope), result = readAgentRuntimeNamedMethodResult(root, scope, { profile: plan.profile, files: plan.files });
      expect(original).toMatchObject({ status: "Observed", quota_account_digest: fixed.quota_account_digest, original_requirement_pinned: true, costs_reconciled: false }); expect(original.real_model_turns).toBeGreaterThanOrEqual(2);
      expect(result).toMatchObject({ status: "Observed", method_result_reverified: true, output: { purpose: "clarification" }, costs_reconciled: false, domain_observation_produced: false });
      if (result.output?.purpose !== "clarification") throw Error("Original clarification result unavailable");
      expect(result.output.questions).toHaveLength(1); expect(result.output.unresolved.length).toBeGreaterThan(0);
      const methods = readAgentNamedMethodOriginals(root, scope, plan.profile, plan.files, method.originalBinding);
      expect(methods.calls.filter(call => call.receipt.function_name === "invoke_skill").map(call => call.receipt.argument)).toEqual(expect.arrayContaining(plan.profile.modules.map(module => module.name)));
      for (const resource of plan.profile.resources) expect(methods.calls.some(call => call.receipt.resource_path === resource.path)).toBe(true);
      const identity = readAgentRuntimeOriginalIdentity(root, scope), config = JSON.parse(bytesAt(join(identity.operation, "original-config.json"), 65536).toString("utf8"));
      expect(config).toMatchObject({ format: "cimiloop/agent-workspace-sandbox-config/16.0.0",writable_storage_profile:'private_state_only/2.0.0', method_tools: "fixed_named_method/1.0.0", provider_options: { model_output_profile: fixed.output_profile } });
      const collection = await collectAgentRuntimeOperation(root, scope, undefined, { profile: plan.profile, files: plan.files });
      writeFileSync(join(root, "original-collection.json"), JSON.stringify(collection), { flag: "wx" });
      expect(collection.named_method).toMatchObject({ status: "Observed", method_result_reverified: true }); expect(collection.ipc).toMatchObject({ status: "Observed", unresolved: 0, correlation: { uncorrelated_exchanges: 0, unmatched_sdk_calls: 0 } });
      verifyCollectedCodexAgentModelOriginals(root, scope, collection);
      const sdk = readAgentRuntimeModelOriginals(root, scope);
      for (const call of sdk.calls) expect(await model.execute(call.request)).toMatchObject({ receipt: call.response, replay: true });
      for (const call of methods.calls) expect(await method.execute(call.request)).toMatchObject({ receipt: call.receipt, replay: true });
      expect(() => claimAgentRuntimeOperation(root, scope, identity.input, identity.claim.owner)).toThrow("agent_runtime_already_claimed");
      expect(readCodexAgentModelOriginals(root, scope)).toEqual(original); expect(readAgentNamedMethodOriginals(root, scope, plan.profile, plan.files, method.originalBinding)).toEqual(methods); expect(local.store.asOfEventSequence()).toBe(eventsBefore);
      // Controlled loss within ONLY this new, ended, owned operation. Retain and
      // restore the same physical originals; a query must create no lost slot.
      const lostGroups = [[join(method.path, methods.calls[0]!.receipt.call_id)], [join(model.path, sdk.calls[0]!.call_id), join(root, "agent-runtime-model-starts", scope.project_id, scope.run_id, sdk.calls[0]!.call_id)]];
      for (const group of lostGroups) {
        const moved: string[] = [];
        try {
          for (const path of group) { if (!resolve(path).startsWith(resolve(root) + "\\") || !existsSync(path)) throw Error("Unsafe own original loss fixture"); renameSync(path, path + ".PUBLIC-retained"); moved.push(path); }
          await expect(reconcileRetainedOriginal(root)).rejects.toThrow(); for (const path of group) expect(existsSync(path)).toBe(false);
        } finally { for (const path of moved.reverse()) renameSync(path + ".PUBLIC-retained", path); }
      }
      expect(await reconcileRetainedOriginal(root)).toMatchObject({ ok: true, additionalModelTurns: 0, additionalMethodEffects: 0 });
      writeFileSync(join(root, "summary.json"), JSON.stringify({ ok: true, root, project, startedAt, finishedAt: new Date().toISOString(), scope, model: fixed.model, sourceCommit: spec.commit_id, sourceDigest: source.source_digest, realModelTurns: original.real_model_turns,
        outputTokens: original.calls.map(call => call.original!.usage.outputTokens), namedMethod: result, ipc: collection.ipc, replayAddedModelTurns: 0, replayAddedMethodCalls: 0, additionalKernelEvents: 0, productionQualification: false, costsReconciled: false }, null, 2), { flag: "wx" });
    } finally { if (budget) await budget.close(); installation?.release(); local.store.close(); }
  }, 780000);
});
