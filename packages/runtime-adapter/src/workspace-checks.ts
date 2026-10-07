import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readdirSync, realpathSync, unlinkSync, rmdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { AgentToolAuthorityRequest, Project, RunRecord } from "@cimiloop/protocol/v2";
import { parseAgentWorkspaceToolScope, parseAgentToolAssessment, type AgentWorkspaceToolScope } from "./agent-workspace-authority.js";
import { WindowsWorkspaceFileBroker, parseWorkspaceToolInvocation, validWorkspaceWorkerIdentity, validWorkspaceFileIdentity } from "./workspace-files.js";
import { buildWindowsLauncher, pinBinary, isolatedEnvironment, nativeControl } from "./native.js";
import { creditHostDependencies } from "./gateway-credit-owner.js";
import { copyToolJson } from "./tool-journal.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import { directory, bytesAt, digest, atomicJson, RuntimeAdapterError, assertOrdinaryPath } from "./files.js";

export interface WorkspaceCheckRecipe {
  check_id: string; profile: "node_syntax" | "node_test"; entry: string;
  inputs: { path: string; expected_digest: string }[]; max_elapsed_ms: number; max_output_bytes: number;
}
export interface WorkspaceCheckCall { format: "cimiloop/workspace-check-call/1.0.0"; call_id: string; check_id: string }
export interface WorkspaceCheckCatalog {
  format: "cimiloop/workspace-check-catalog/1.0.0"; scope_digest: string; node_digest: string; policy_digest: string;
  recipes: WorkspaceCheckRecipe[]; catalog_digest: string;
}
export interface WorkspaceCheckReceipt {
  format: "cimiloop/workspace-check-receipt/1.0.0"; input_digest: string; run_id: string; call_id: string;
  profile: WorkspaceCheckRecipe["profile"]; entry: string; outcome: "passed" | "failed"; exit_code: number;
  reason: string; stdout_digest: string; stderr_digest: string; source_digest: string;
  formal_agent_execution_enabled: false;
}
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const id = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function fail(reason: string): never { throw new RuntimeAdapterError(reason); }
export function parseWorkspaceCheckCall(raw: unknown): WorkspaceCheckCall {
  const value = copyToolJson(raw);
  if (!exact(value, ["format", "call_id", "check_id"]) || value.format !== "cimiloop/workspace-check-call/1.0.0" || !id(value.call_id) || !id(value.check_id)) fail("workspace_check_call_invalid");
  return value as unknown as WorkspaceCheckCall;
}
export function parseWorkspaceCheckRecipe(raw: unknown, scope: AgentWorkspaceToolScope): WorkspaceCheckRecipe {
  const value = copyToolJson(raw);
  if (!exact(value, ["check_id", "profile", "entry", "inputs", "max_elapsed_ms", "max_output_bytes"]) || !id(value.check_id) ||
    !["node_syntax", "node_test"].includes(String(value.profile)) || typeof value.entry !== "string" || !/\.(?:js|mjs|cjs)$/.test(value.entry) ||
    !Array.isArray(value.inputs) || !value.inputs.length || value.inputs.length > 32 || !Number.isSafeInteger(value.max_elapsed_ms) ||
    Number(value.max_elapsed_ms) < 100 || Number(value.max_elapsed_ms) > 30000 || !Number.isSafeInteger(value.max_output_bytes) ||
    Number(value.max_output_bytes) < 1024 || Number(value.max_output_bytes) > 131072) fail("workspace_check_recipe_invalid");
  const seen = new Set<string>();
  for (const source of value.inputs) {
    if (!exact(source, ["path", "expected_digest"]) || typeof source.path !== "string" || !sha(source.expected_digest) || seen.has(source.path.toLowerCase())) fail("workspace_check_recipe_invalid");
    parseWorkspaceToolInvocation({ format: "cimiloop/workspace-tool-invocation/1.0.0", ...scopeFields(scope), call_id: "check-source", tool: "read_file", ...source });
    seen.add(source.path.toLowerCase());
  }
  if (!value.inputs.some(source => source.path === value.entry)) fail("workspace_check_entry_missing");
  return value as unknown as WorkspaceCheckRecipe;
}
const scopeFields = (scope: AgentWorkspaceToolScope) => ({ project_id: scope.project_id, run_id: scope.run_id, operation_key: scope.operation_key,
  executor_actor_id: scope.executor_actor_id, context_digest: scope.context_digest });
export function parseWorkspaceCheckCatalog(raw: unknown, originalScope: AgentWorkspaceToolScope): WorkspaceCheckCatalog {
  const value = copyToolJson(raw), scope = parseAgentWorkspaceToolScope(originalScope);
  if (!exact(value, ["format", "scope_digest", "node_digest", "policy_digest", "recipes", "catalog_digest"]) ||
    value.format !== "cimiloop/workspace-check-catalog/1.0.0" || value.scope_digest !== digest(JSON.stringify(scope)).value ||
    !sha(value.node_digest) || !sha(value.policy_digest) || !sha(value.catalog_digest) || !Array.isArray(value.recipes) ||
    !value.recipes.length || value.recipes.length > 16) fail("workspace_check_catalog_invalid");
  const recipes = value.recipes.map(recipe => parseWorkspaceCheckRecipe(recipe, scope));
  if (recipes.some((recipe, i) => i > 0 && recipes[i - 1]!.check_id >= recipe.check_id)) fail("workspace_check_catalog_invalid");
  const body = { format: value.format, scope_digest: value.scope_digest, node_digest: value.node_digest, policy_digest: value.policy_digest, recipes };
  if (digest(JSON.stringify(body)).value !== value.catalog_digest) fail("workspace_check_catalog_invalid");
  return { ...body, catalog_digest: value.catalog_digest } as WorkspaceCheckCatalog;
}
interface Options {
  repositoryPath: string; dataDirectory: string; nodeBinary: string; scope: AgentWorkspaceToolScope; recipes: WorkspaceCheckRecipe[];
  assess: (request: AgentToolAuthorityRequest) => unknown | Promise<unknown>;
  phase?: (phase: "claimed" | "sources_captured" | "dispatch_committed" | "completion_committed") => void | Promise<void>;
}
// A tool selects only a trusted installed check ID. Fixed native argv, original
// snapshot, executable, cwd, environment and limits never come from its frame.
export class AgentWorkspaceCheckHost {
  private readonly abort = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();
  private closing?: Promise<void>;
  private constructor(private readonly options: Options, private readonly files: WindowsWorkspaceFileBroker, private readonly launcher: string,
    private readonly node: ReturnType<typeof pinBinary>, private readonly owners: Awaited<ReturnType<typeof creditHostDependencies>>,
    private readonly root: string, private readonly policyDigest: string, private readonly launcherDigest: string) {}
  static async open(raw: Options): Promise<AgentWorkspaceCheckHost> {
    const scope = parseAgentWorkspaceToolScope(raw.scope);
    if (!Array.isArray(raw.recipes) || !raw.recipes.length || raw.recipes.length > 16) fail("workspace_check_recipe_invalid");
    const recipes = raw.recipes.map(value => parseWorkspaceCheckRecipe(value, scope));
    if (new Set(recipes.map(value => value.check_id)).size !== recipes.length) fail("workspace_check_recipe_invalid");
    const options = { ...raw, scope, recipes }, binary = raw.nodeBinary;
    const files = await WindowsWorkspaceFileBroker.open(options.repositoryPath, options.dataDirectory), launcher = await buildWindowsLauncher(options.dataDirectory);
    const node = pinBinary(options.dataDirectory, binary), owners = await creditHostDependencies(launcher), launcherDigest = digest(bytesAt(launcher)).value;
    const root = directory(join(options.dataDirectory, "workspace-checks", scope.project_id));
    const policy = { format: "cimiloop/workspace-check-policy/1.0.0", project_id: scope.project_id, repository_path_digest: digest(files.repositoryPath.toLowerCase()).value,
      root_identity: files.rootIdentity, node_digest: node.digest.value, maximum_calls: 128 }, policyDigest = digest(JSON.stringify(policy)).value, marker = join(root, "policy.json");
    // Publish once with exclusive creation; a competing host cannot overwrite
    // the original policy or silently choose another executable/workspace.
    const encoded = JSON.stringify({ policy, policy_digest: policyDigest });
    try { writeFileSync(marker, encoded, { flag: "wx" }); }
    catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error; }
    if (bytesAt(marker, 4096).toString("utf8") !== encoded) fail("workspace_check_policy_conflict");
    return new AgentWorkspaceCheckHost(options, files, launcher, node, owners, root, policyDigest, launcherDigest);
  }
  getCatalog(): WorkspaceCheckCatalog {
    if (this.abort.signal.aborted) fail("workspace_check_host_closed");
    const body = { format: "cimiloop/workspace-check-catalog/1.0.0" as const, scope_digest: digest(JSON.stringify(this.options.scope)).value,
      node_digest: this.node.digest.value, policy_digest: this.policyDigest,
      recipes: structuredClone(this.options.recipes).sort((a, b) => a.check_id < b.check_id ? -1 : a.check_id > b.check_id ? 1 : 0) };
    return parseWorkspaceCheckCatalog({ ...body, catalog_digest: digest(JSON.stringify(body)).value }, this.options.scope);
  }
  private requests(recipe: WorkspaceCheckRecipe): AgentToolAuthorityRequest[] {
    return [...recipe.inputs.map(value => ({ ...this.options.scope, action: "read_files" as const, resource: value.path })),
      { ...this.options.scope, action: "run_checks" as const, resource: recipe.entry }];
  }
  private async authority(recipe: WorkspaceCheckRecipe): Promise<string[]> {
    const result: string[] = [];
    for (const request of this.requests(recipe)) {
      if (this.abort.signal.aborted) fail("workspace_check_host_closed");
      const assessment = parseAgentToolAssessment(await this.options.assess(structuredClone(request)), request);
      if (assessment.decision !== "ALLOW") fail("tool_authority_denied"); result.push(assessment.authority.basis_digest.value);
    }
    if (this.abort.signal.aborted) fail("workspace_check_host_closed"); return result;
  }
  private operation(call: WorkspaceCheckCall): string { return assertOrdinaryPath(join(this.root, digest(JSON.stringify([this.options.scope.run_id, call.call_id])).value)); }
  execute(raw: unknown): Promise<{ receipt: WorkspaceCheckReceipt; replay: boolean; operation: string }> {
    if (this.abort.signal.aborted) return Promise.reject(new RuntimeAdapterError("workspace_check_host_closed"));
    let call: WorkspaceCheckCall;
    try { call = parseWorkspaceCheckCall(raw); } catch (error) { return Promise.reject(error); }
    const operation = this.perform(call); this.pending.add(operation); void operation.finally(() => this.pending.delete(operation)).catch(() => {}); return operation;
  }
  private async perform(call: WorkspaceCheckCall) {
    const marker = AgentWorkspaceCheckHost.record(this.root, "policy.json");
    if (!exact(marker, ["policy", "policy_digest"]) || marker.policy_digest !== this.policyDigest || digest(JSON.stringify(marker.policy)).value !== this.policyDigest) fail("workspace_check_policy_conflict");
    const recipe = this.options.recipes.find(value => value.check_id === call.check_id); if (!recipe) fail("workspace_check_unknown_id");
    const basis = await this.authority(recipe), input = { scope: this.options.scope, call, recipe, policy_digest: this.policyDigest, authority_basis: basis },
      inputDigest = digest(JSON.stringify(input)).value, operation = this.operation(call);
    const current = async () => { if (!isDeepStrictEqual(await this.authority(recipe), basis)) fail("workspace_check_authority_changed"); };
    let existing = existsSync(operation);
    if (!existing) {
      const slots = directory(join(this.root, "slots")); let reserved: string | undefined;
      for (let slot = 0; slot < 128; slot++) {
        const candidate = join(slots, String(slot));
        try { mkdirSync(candidate); reserved = candidate; writeFileSync(join(candidate, "operation"), operation, { flag: "wx" }); break; }
        catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error; }
      }
      if (!reserved) fail("workspace_check_slots_exhausted");
      try { mkdirSync(operation); }
      catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
        // Only our just-created ordinary empty slot, with its original bytes.
        assertOrdinaryPath(reserved);
        if (bytesAt(join(reserved, "operation"), 32768).toString("utf8") !== operation) fail("workspace_check_slot_unproven");
        unlinkSync(join(reserved, "operation")); rmdirSync(reserved); existing = true;
      }
    }
    if (existing) {
      if (!existsSync(join(operation, "request.json"))) fail("workspace_check_outcome_unproven");
      const original = AgentWorkspaceCheckHost.record(operation, "request.json");
      if (original.input_digest !== inputDigest || !isDeepStrictEqual(original.input, input)) fail("workspace_check_call_conflict");
      const receipt = AgentWorkspaceCheckHost.receipt(operation, inputDigest, this.options.scope.run_id); if (!receipt) fail("workspace_check_outcome_unproven");
      return { receipt, replay: true, operation };
    }
    const nonce = randomUUID(), root = directory(join(operation, "sandbox")), workspace = directory(join(root, "workspace")); directory(join(root, "state"));
    atomicJson(join(operation, "request.json"), { format: "cimiloop/workspace-check-request/1.0.0", input, input_digest: inputDigest, nonce,
      owner: this.owners.identity, root, binary: this.node.path, launcher: this.launcher, launcher_digest: this.launcherDigest });
    atomicJson(join(operation, "supervisor.json"), { nonce, identity: this.owners.identity });
    let dispatched = false;
    try {
      await this.options.phase?.("claimed"); await current(); const sources: { path: string; digest: string }[] = [];
      for (const source of recipe.inputs) {
        const invocation = parseWorkspaceToolInvocation({ format: "cimiloop/workspace-tool-invocation/1.0.0", ...scopeFields(this.options.scope),
          call_id: call.call_id, tool: "read_file", ...source }), prepared = await this.files.prepare(invocation, this.abort.signal);
        let committed = false;
        try { await current(); const original = await this.files.commit(prepared); committed = true;
          const target = join(workspace, source.path); directory(dirname(target)); writeFileSync(target, original.text!, { flag: "wx" });
          sources.push({ path: source.path, digest: original.after_digest });
        } finally { if (!committed) await this.files.discard(prepared); }
      }
      const sourceDigest = digest(JSON.stringify(sources)).value; atomicJson(join(operation, "sources.json"), { sources, source_digest: sourceDigest });
      await this.options.phase?.("sources_captured"); await current();
      if (digest(bytesAt(this.launcher)).value !== this.launcherDigest || digest(bytesAt(this.node.path, 512 * 1024 * 1024)).value !== this.node.digest.value) fail("workspace_check_binary_changed");
      // Durable dispatch precedes native start. A crash anywhere afterwards is
      // Unknown, even if an exit/partial TAP stream looks plausible.
      atomicJson(join(operation, "dispatch.json"), { input_digest: inputDigest, nonce }); dispatched = true;
      await this.options.phase?.("dispatch_committed"); await current();
      const proof = join(operation, "native-proof.json"), cancel = join(operation, "cancel.txt");
      const limits = { max_sandbox_bytes: 1048576, max_sandbox_entries: 128, max_file_bytes: 16384, max_output_bytes: recipe.max_output_bytes };
      const argv = recipe.profile === "node_syntax" ? ["--check", "{workspace}/" + recipe.entry] :
        ["--test", "--test-isolation=none", "--test-reporter=tap", "--test-timeout=" + recipe.max_elapsed_ms, "{workspace}/" + recipe.entry];
      const worker = spawn(this.launcher, [root, "read", String(recipe.max_elapsed_ms), this.node.path, proof, cancel,
        "--managed", nonce, JSON.stringify(limits), "--policy", JSON.stringify({ network: { mode: "deny_all" }, cost: { mode: "unmetered_probe_only" } }), ...argv],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: isolatedEnvironment() });
      const stdout: Buffer[] = [], stderr: Buffer[] = []; let total = 0, exceeded = false, started = false;
      const stop = () => { try { writeFileSync(cancel, exceeded ? "output budget exhausted" : "cancelled", { flag: "wx" }); } catch { /* Preserve the first cancellation. */ } };
      const capture = (into: Buffer[], chunk: Buffer) => { total += chunk.length; if (total > recipe.max_output_bytes) { exceeded = true; stop(); } else into.push(chunk); };
      worker.stdout.on("data", (chunk: Buffer) => capture(stdout, chunk)); worker.stderr.on("data", (chunk: Buffer) => capture(stderr, chunk));
      worker.once("spawn", () => { started = true; });
      const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
        worker.once("error", () => resolve({ code: null, signal: null })); worker.once("close", (code, signal) => resolve({ code, signal }));
      });
      this.abort.signal.addEventListener("abort", stop, { once: true }); if (this.abort.signal.aborted) stop();
      const timer = setTimeout(stop, recipe.max_elapsed_ms + 5000), hardStop = setTimeout(() => worker.kill(), recipe.max_elapsed_ms + 15000);
      const exit = await ended; clearTimeout(timer); clearTimeout(hardStop); this.abort.signal.removeEventListener("abort", stop);
      const out = Buffer.concat(stdout), err = Buffer.concat(stderr); writeFileSync(join(operation, "stdout.raw"), out, { flag: "wx" }); writeFileSync(join(operation, "stderr.raw"), err, { flag: "wx" });
      atomicJson(join(operation, "capture.json"), { format: "cimiloop/workspace-check-capture/1.0.0", input_digest: inputDigest,
        total_bytes: total, captured_bytes: out.length + err.length, maximum_bytes: recipe.max_output_bytes, exceeded });
      const native = AgentWorkspaceCheckHost.record(operation, "native-proof.json"), ownership = AgentWorkspaceCheckHost.record(operation, "native-ownership.json"), policy = AgentWorkspaceCheckHost.record(operation, "execution-policy-proof.json");
      if (!started || exceeded || exit.signal || !exact(native, ["pid", "profile", "phase", "reason", "exit_code"]) || exit.code !== native.exit_code || native.phase !== "ended" || native.profile !== "CimiLoop." + nonce.replaceAll("-", "") ||
        !Number.isInteger(native.pid) || Number(native.pid) < 1 || ownership.nonce !== nonce || ownership.root !== root || ownership.binary !== this.node.path ||
        ownership.profile !== native.profile || ownership.mode !== "read" || ownership.job_assignment !== "atomic_on_create" || ownership.resources_disposed !== true ||
        !validWorkspaceWorkerIdentity(ownership.native_identity) || ownership.native_identity.pid !== worker.pid || ownership.native_identity.image.toLowerCase() !== this.launcher.toLowerCase() ||
        !validWorkspaceWorkerIdentity(ownership.runtime_identity) || ownership.runtime_identity.pid !== native.pid || ownership.runtime_identity.image.toLowerCase() !== this.node.path.toLowerCase() || policy.pid !== native.pid ||
        policy.operation_key !== basename(operation) || policy.schema_version !== "2.0.0" || policy.scope !== "isolated_provider_probe" ||
        policy.network_mode !== "deny_all" || policy.enforcement !== "appcontainer_no_network_capabilities" || policy.cost_mode !== "unmetered_probe_only" || policy.formal_execution_enabled !== false ||
        !Array.isArray(policy.capability_sids) || policy.capability_sids.length ||
        !sources.every(source => digest(bytesAt(join(workspace, source.path))).value === source.digest) || !["exited", "timeout", "cancelled", "output_limit"].includes(String(native.reason))) fail("workspace_check_completion_unproven");
      const receipt: WorkspaceCheckReceipt = { format: "cimiloop/workspace-check-receipt/1.0.0", input_digest: inputDigest, run_id: this.options.scope.run_id, call_id: call.call_id,
        profile: recipe.profile, entry: recipe.entry, outcome: native.reason === "exited" && native.exit_code === 0 ? "passed" : "failed",
        exit_code: Number(native.exit_code), reason: String(native.reason), stdout_digest: digest(out).value, stderr_digest: digest(err).value, source_digest: sourceDigest, formal_agent_execution_enabled: false };
      atomicJson(join(operation, "receipt.json"), { receipt, receipt_digest: digest(JSON.stringify(receipt)).value });
      await this.options.phase?.("completion_committed"); return { receipt, replay: false, operation };
    } catch (error) {
      // Never invent a result after dispatch. Resource recovery is separate
      // from proving check completion and never executes the command again.
      if (!dispatched) atomicJson(join(operation, "not-started.json"), { input_digest: inputDigest, nonce }); throw error;
    }
  }
  private static record(operation: string, name: string): Record<string, unknown> {
    const value = copyToolJson(parseGatewayJson(bytesAt(join(operation, name), 262144).toString("utf8"), 262144));
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("workspace_check_record_unproven"); return value as Record<string, unknown>;
  }
  private static receipt(operation: string, inputDigest: string, runId: string): WorkspaceCheckReceipt | undefined {
    if (!existsSync(join(operation, "receipt.json"))) return;
    const value = AgentWorkspaceCheckHost.record(operation, "receipt.json"), receipt = value.receipt;
    if (!exact(value, ["receipt", "receipt_digest"]) || !exact(receipt, ["format", "input_digest", "run_id", "call_id", "profile", "entry", "outcome", "exit_code", "reason", "stdout_digest", "stderr_digest", "source_digest", "formal_agent_execution_enabled"]) ||
      digest(JSON.stringify(receipt)).value !== value.receipt_digest || receipt.format !== "cimiloop/workspace-check-receipt/1.0.0" || receipt.input_digest !== inputDigest || receipt.run_id !== runId ||
      !id(receipt.call_id) || !["node_syntax", "node_test"].includes(String(receipt.profile)) || !["passed", "failed"].includes(String(receipt.outcome)) ||
      !Number.isInteger(receipt.exit_code) || receipt.formal_agent_execution_enabled !== false || !sha(receipt.source_digest) ||
      digest(bytesAt(join(operation, "stdout.raw"), 131072)).value !== receipt.stdout_digest || digest(bytesAt(join(operation, "stderr.raw"), 131072)).value !== receipt.stderr_digest ||
      digest(JSON.stringify(AgentWorkspaceCheckHost.record(operation, "sources.json").sources)).value !== receipt.source_digest) fail("workspace_check_receipt_unproven");
    const request = AgentWorkspaceCheckHost.record(operation, "request.json"), input = request.input as { call?: WorkspaceCheckCall; recipe?: WorkspaceCheckRecipe },
      native = AgentWorkspaceCheckHost.record(operation, "native-proof.json"), ownership = AgentWorkspaceCheckHost.record(operation, "native-ownership.json"), sources = AgentWorkspaceCheckHost.record(operation, "sources.json");
    const capture = AgentWorkspaceCheckHost.record(operation, "capture.json");
    if (!input || !input.recipe || !input.call || receipt.call_id !== input.call.call_id || receipt.profile !== input.recipe.profile || receipt.entry !== input.recipe.entry ||
      receipt.reason !== native.reason || receipt.exit_code !== native.exit_code || native.phase !== "ended" || ownership.resources_disposed !== true ||
      receipt.outcome !== (native.reason === "exited" && native.exit_code === 0 ? "passed" : "failed") ||
      !exact(sources, ["sources", "source_digest"]) || sources.source_digest !== receipt.source_digest ||
      !isDeepStrictEqual(sources.sources, input.recipe.inputs.map(source => ({ path: source.path, digest: source.expected_digest }))) ||
      !input.recipe.inputs.every(source => digest(bytesAt(join(operation, "sandbox", "workspace", source.path), 16384)).value === source.expected_digest) ||
      !exact(capture, ["format", "input_digest", "total_bytes", "captured_bytes", "maximum_bytes", "exceeded"]) || capture.format !== "cimiloop/workspace-check-capture/1.0.0" ||
      capture.input_digest !== inputDigest || capture.exceeded !== false || capture.maximum_bytes !== input.recipe.max_output_bytes ||
      capture.total_bytes !== capture.captured_bytes || Number(capture.total_bytes) > input.recipe.max_output_bytes ||
      capture.captured_bytes !== bytesAt(join(operation, "stdout.raw"), 131072).length + bytesAt(join(operation, "stderr.raw"), 131072).length) fail("workspace_check_receipt_unproven");
    return structuredClone(receipt) as unknown as WorkspaceCheckReceipt;
  }
  async recover(raw: unknown) {
    const call = parseWorkspaceCheckCall(raw), operation = this.operation(call), request = AgentWorkspaceCheckHost.record(operation, "request.json");
    if (!exact(request, ["format", "input", "input_digest", "nonce", "owner", "root", "binary", "launcher", "launcher_digest"]) || request.format !== "cimiloop/workspace-check-request/1.0.0" ||
      request.root !== join(operation, "sandbox") || request.binary !== this.node.path || request.launcher !== this.launcher || request.launcher_digest !== this.launcherDigest ||
      typeof request.nonce !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(request.nonce) ||
      digest(JSON.stringify(request.input)).value !== request.input_digest || !(request.input && typeof request.input === "object" &&
        isDeepStrictEqual((request.input as { scope: unknown }).scope, this.options.scope) && isDeepStrictEqual((request.input as { call: unknown }).call, call))) fail("workspace_check_record_unproven");
    if (!existsSync(join(operation, "native-ownership.json"))) return { outcome: "unknown" as const, reason: "workspace_check_original_native_unproven" };
    if (digest(bytesAt(this.launcher)).value !== this.launcherDigest) fail("workspace_check_binary_changed");
    // Original owner observation stays authoritative even after a new host opens.
    const state = await this.owners.observeOwner(request.owner as Parameters<typeof this.owners.observeOwner>[0]);
    if (state !== "absent") return { outcome: state === "active" ? "active" as const : "unknown" as const, reason: "workspace_check_original_owner_" + state };
    const recovered = (await nativeControl(this.launcher, ["--recover", String(request.root), join(operation, "native-ownership.json"), request.nonce,
      this.node.path, "read", this.launcher])).value as Record<string, unknown>;
    if (!exact(recovered, ["outcome", "reason", "resources_disposed"]) || !["recovered", "active", "unknown"].includes(String(recovered.outcome)) ||
      typeof recovered.reason !== "string" || typeof recovered.resources_disposed !== "boolean" ||
      (recovered.outcome === "recovered") !== recovered.resources_disposed) fail("workspace_check_recovery_unproven");
    const completion = AgentWorkspaceCheckHost.receipt(operation, String(request.input_digest), this.options.scope.run_id);
    return { outcome: recovered.outcome as "recovered" | "active" | "unknown", reason: recovered.reason, resources_disposed: recovered.resources_disposed,
      check_completion: completion ? "recorded" : "unknown" };
  }
  static readRunFacts(dataDirectory: string, project: Project, record: RunRecord) {
    const root = assertOrdinaryPath(join(dataDirectory, "workspace-checks", project.id)), facts = { invocations: 0, unresolved: 0, has_effect: false };
    if (!existsSync(root)) return facts;
    const marker = AgentWorkspaceCheckHost.record(root, "policy.json"), policy = marker.policy as Record<string, unknown>;
    if (!exact(marker, ["policy", "policy_digest"]) || !exact(policy, ["format", "project_id", "repository_path_digest", "root_identity", "node_digest", "maximum_calls"]) ||
      policy.format !== "cimiloop/workspace-check-policy/1.0.0" || policy.project_id !== project.id || policy.maximum_calls !== 128 || !sha(policy.node_digest) || !validWorkspaceFileIdentity(policy.root_identity) ||
      policy.repository_path_digest !== digest(realpathSync(assertOrdinaryPath(project.repository_path)).toLowerCase()).value ||
      digest(JSON.stringify(policy)).value !== marker.policy_digest) fail("workspace_check_policy_conflict");
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (["policy.json", "slots"].includes(entry.name)) continue;
      if (!entry.isDirectory() || !sha(entry.name)) fail("workspace_check_record_unproven");
      const operation = assertOrdinaryPath(join(root, entry.name)), request = AgentWorkspaceCheckHost.record(operation, "request.json"), input = request.input as Record<string, unknown>;
      if (!exact(request, ["format", "input", "input_digest", "nonce", "owner", "root", "binary", "launcher", "launcher_digest"]) ||
        request.format !== "cimiloop/workspace-check-request/1.0.0" || !exact(input, ["scope", "call", "recipe", "policy_digest", "authority_basis"]) ||
        input.policy_digest !== marker.policy_digest || !sha(request.input_digest) || digest(JSON.stringify(input)).value !== request.input_digest ||
        !Array.isArray(input.authority_basis) || !input.authority_basis.every(sha) || !validWorkspaceWorkerIdentity(request.owner) ||
        typeof request.nonce !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(request.nonce)) fail("workspace_check_record_unproven");
      const scope = parseAgentWorkspaceToolScope(input.scope), call = parseWorkspaceCheckCall(input.call), recipe = parseWorkspaceCheckRecipe(input.recipe, scope);
      if (scope.project_id !== project.id || input.authority_basis.length !== recipe.inputs.length + 1 ||
        digest(JSON.stringify([scope.run_id, call.call_id])).value !== entry.name) fail("workspace_check_record_unproven");
      if (scope.run_id !== record.run_id) continue;
      if (record.run_kind !== "agent" || scope.operation_key !== record.operation_key || scope.executor_actor_id !== record.executor_ref.id ||
        !isDeepStrictEqual(scope.context_digest, record.input_digest) || !isDeepStrictEqual(scope.runtime_binding, record.runtime_binding) ||
        !isDeepStrictEqual(scope.skill_bindings, record.skill_bindings) || !isDeepStrictEqual(scope.host_admission_ref, record.host_admission_ref)) fail("workspace_check_run_mismatch");
      facts.invocations++; if (facts.invocations > 128) fail("workspace_check_record_unproven");
      if (AgentWorkspaceCheckHost.receipt(operation, request.input_digest, record.run_id)) { facts.has_effect = true; continue; }
      const dispatched = existsSync(join(operation, "dispatch.json")), notStarted = existsSync(join(operation, "not-started.json"));
      if (dispatched && notStarted) fail("workspace_check_record_unproven");
      if (notStarted) {
        const stopped = AgentWorkspaceCheckHost.record(operation, "not-started.json");
        if (!exact(stopped, ["input_digest", "nonce"]) || stopped.input_digest !== request.input_digest || stopped.nonce !== request.nonce) fail("workspace_check_record_unproven");
      } else { facts.unresolved++; facts.has_effect ||= dispatched; }
    }
    return facts;
  }
  close(): Promise<void> { if (!this.closing) { this.abort.abort(); this.closing = Promise.allSettled([...this.pending]).then(() => undefined); } return this.closing; }
}
