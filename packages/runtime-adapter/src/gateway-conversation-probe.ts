import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:https";
import { connect as tlsConnect } from "node:tls";
import type { Duplex } from "node:stream";
import { bytesAt, digest, directory, atomicJson, readJson, RuntimeAdapterError } from "./files.js";
import { buildWindowsLauncher, isolatedEnvironment, pinBinary } from "./native.js";
import { defaultExecutionPolicy } from "./execution-policy.js";
import { GatewayNetworkBoundary, DEDICATED_GATEWAY_PATH } from "./gateway-network.js";
import { GatewayCreditLedger, GATEWAY_CONVERSATION_CACHE_SLOT_BYTES, GATEWAY_CONVERSATION_ORIGINAL_SLOT_BYTES, type GatewayCreditPolicy } from "./gateway-credit.js";
import { creditHostDependencies } from "./gateway-credit-owner.js";
import { GatewayConversationHostRehearsal, GatewayConversationOriginalHostRehearsal, GATEWAY_HOST_REHEARSAL_KEY } from "./gateway-host.js";
import { PublicConversationBridge } from "./gateway-conversation-bridge.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import { removePrivateDirectory } from "./private-cleanup.js";
import { skillLoaderConfiguration, validateOperationInput, type ProbeOperationInput } from "./operations.js";
import { validateFixedMethodContext } from "./fixed-method.js";
import type { FixedMethodObservation } from "@cimiloop/protocol/v2";

export const conversationProbeModule = () => {
  const path = fileURLToPath(new URL("../transport/opencode-conversation-probe.mjs", import.meta.url)); return { path, digest: digest(bytesAt(path, 65536)) };
};
export const PINNED_CONVERSATION_OPENCODE_SHA = "5283c2cd5b4285855daa97e6f7d17bf48146227cdf2a940e79e0f2b7869fd06e";
const publicText = "CIMILOOP_PUBLIC_READ_RESULT", finalText = "CIMILOOP_CONVERSATION_OK";
// Internal, explicitly synthetic entry point. No serialized endpoint/key/budget
// option and no CLI admission. The Windows binary digest is fixed to 1.18.34.
export const runOpenCodeConversationProbe = (options: { root: string; binary: string; maxElapsedMs?: number }) => runConversationProbe(options);
// Synthetic replies exercise the actual pinned Skill tool and loader. This is
// not model behavior, Provider qualification, or a formal Task invocation.
export const runOpenCodeSkillLoaderProbe = (options: { root: string; binary: string; input: ProbeOperationInput; maxElapsedMs?: number }) => {
  validateOperationInput(options.input);
  if (!options.input.skill_profile || options.input.skill_profile.skill_names.length > 3) throw new RuntimeAdapterError("invalid_skill_loader_rehearsal");
  return runConversationProbe(options, options.input);
};
// Alternative loader feasibility only. Actual SDK read effects do not satisfy
// the existing Skill-tool evidence rule or complete a method invocation.
export const runOpenCodeFixedMethodReadProbe = (options: { root: string; binary: string; input: ProbeOperationInput; maxElapsedMs?: number }) => {
  validateOperationInput(options.input);
  if (!options.input.skill_profile || options.input.skill_profile.skill_names.length > 3) throw new RuntimeAdapterError("invalid_skill_loader_rehearsal");
  return runConversationProbe(options, options.input, true);
};
// Explicit named invocation is still a public synthetic rehearsal. Repeated
// identities return the original immutable evidence, never start another child.
export const runOpenCodeNamedMethodProbe = async (options: { root: string; binary: string; input: ProbeOperationInput }) => {
  validateOperationInput(options.input);
  if (!options.input.fixed_method_profile || options.input.fixed_method_profile.resources.length > 7) throw new RuntimeAdapterError("invalid_named_method_rehearsal");
  if (options.input.max_elapsed_ms < 1000 || options.input.max_elapsed_ms > 90000 || digest(bytesAt(options.binary, 512 * 1024 * 1024)).value !== PINNED_CONVERSATION_OPENCODE_SHA) throw new RuntimeAdapterError("invalid_named_method_rehearsal");
  const path = join(options.root, "conversation-probes", options.input.operation_key), inputDigest = digest(JSON.stringify(options.input));
  const evidenceNames = ["result.json", "fixed-method-proof.json", "stdout.raw", "stderr.raw", "native-proof.json", "native-ownership.json", "execution-policy-proof.json", "conversation-host-proof.json", "conversation-transport-proof.json"];
  if (existsSync(path)) {
    if (!existsSync(join(path, "named-invocation-replay.json"))) throw new RuntimeAdapterError("named_method_original_completion_unproven");
    const original = readJson(join(path, "named-invocation-replay.json")) as { input_digest: unknown; binary_digest: unknown; artifacts: { name: string; digest: unknown }[] };
    if (JSON.stringify(original.input_digest) !== JSON.stringify(inputDigest) || JSON.stringify(original.binary_digest) !== JSON.stringify(digest(bytesAt(options.binary, 512 * 1024 * 1024))) ||
      original.artifacts.length !== evidenceNames.length || original.artifacts.some((artifact, i) => artifact.name !== evidenceNames[i] || JSON.stringify(artifact.digest) !== JSON.stringify(digest(bytesAt(join(path, artifact.name)))))) throw new RuntimeAdapterError("named_method_original_evidence_conflict");
    return readJson(join(path, "result.json")) as Awaited<ReturnType<typeof runConversationProbe>>;
  }
  directory(dirname(path));
  try { mkdirSync(path); } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") throw new RuntimeAdapterError("named_method_original_completion_unproven"); throw error;
  }
  atomicJson(join(path, "named-invocation-owner.json"), { format: "cimiloop/named-invocation-owner/1.0.0", input_digest: inputDigest, binary_digest: { algorithm: "sha256", value: PINNED_CONVERSATION_OPENCODE_SHA } });
  const result = await runConversationProbe({ ...options, maxElapsedMs: options.input.max_elapsed_ms }, options.input, true, true);
  atomicJson(join(path, "named-invocation-replay.json"), { format: "cimiloop/named-invocation-replay/1.0.0", input_digest: inputDigest, binary_digest: result.binary_digest,
    artifacts: evidenceNames.map(name => ({ name, digest: digest(bytesAt(join(path, name))) })) });
  return result;
};
const runConversationProbe = async (options: { root: string; binary: string; maxElapsedMs?: number }, method?: ProbeOperationInput, fixedRead = false, named = false) => {
  const elapsed = options.maxElapsedMs ?? 30000;
  if (!Number.isSafeInteger(elapsed) || elapsed < 1000 || elapsed > 90000) throw new RuntimeAdapterError("invalid_conversation_probe_elapsed");
  if (digest(bytesAt(options.binary, 512 * 1024 * 1024)).value !== PINNED_CONVERSATION_OPENCODE_SHA) throw new RuntimeAdapterError("conversation_opencode_digest_unproven");
  const launcher = await buildWindowsLauncher(options.root), pinned = pinBinary(options.root, options.binary), module = conversationProbeModule();
  const nonce = randomUUID(), operationKey = named ? method!.operation_key : "conversation_" + nonce.replaceAll("-", ""), path = directory(join(options.root, "conversation-probes", operationKey));
  const sandbox = directory(join(path, "sandbox")), workspace = directory(join(sandbox, "workspace")); directory(join(sandbox, "state"));
  writeFileSync(join(workspace, "public.txt"), publicText, { flag: "wx" });
  if (method) for (const file of method.files) { const target = join(workspace, file.path); directory(dirname(target)); writeFileSync(target, file.content, { flag: "wx" }); }
  const definitions = method?.skill_profile?.skill_names.map(name => ({ name, body: method.files.find(file => file.path === `skill-source/${name}/SKILL.md`)!.content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").trim() })) ?? [];
  const namedContext = named ? validateFixedMethodContext(method!.fixed_method_profile, method!.files, operationKey) : undefined;
  const orderedModules: NonNullable<typeof namedContext>["profile"]["modules"] = [];
  const orderModule = (name: string) => {
    if (orderedModules.some(module => module.name === name)) return;
    const module = namedContext!.profile.modules.find(module => module.name === name)!; orderedModules.push(module); module.dependencies.forEach(orderModule);
  };
  if (namedContext) orderModule(namedContext.profile.entry_name);
  const namedResources = namedContext ? [...orderedModules.map(module => namedContext.profile.resources.find(resource => resource.path === module.definition_path)!),
    ...namedContext.profile.resources.filter(resource => resource.kind !== "definition")] : [];
  const methodReadPaths = fixedRead && !named ? definitions.map(definition => `skill-source/${definition.name}/SKILL.md`) : undefined;
  // The pinned read tool prefixes content lines with their number. Preserve
  // the source body while removing only that native presentation prefix.
  const bodyPresent = (output: string, body: string) => (fixedRead ? output.replace(/^\d+: /gm, "") : output).includes(body);
  const expectedRequests = named ? namedResources.length + 1 : definitions.length ? definitions.length + 1 : 2;
  const purpose = namedContext?.request.input.purpose ?? method?.skill_profile?.purpose;
  const expectedText = !method ? finalText : JSON.stringify(purpose === "review" ? { purpose: "review", findings: [], limitations: ["Synthetic loader rehearsal only."] } : { purpose: "clarification", questions: [], unresolved: ["Synthetic loader rehearsal only."] });
  copyFileSync(module.path, join(directory(join(sandbox, "transport")), "provider.mjs"));
  if (digest(bytesAt(join(sandbox, "transport", "provider.mjs"), 65536)).value !== module.digest.value) throw new RuntimeAdapterError("conversation_module_changed");
  const policyDigest = digest(JSON.stringify({ format: "cimiloop/public-conversation-probe/1.0.0", module_digest: module.digest.value, binary_digest: pinned.digest.value,
    network: "deny_all", tool: method && !fixedRead ? "skill" : "read", file: "public.txt", ...(method ? { method_input_digest: digest(JSON.stringify(method)).value, loader: named ? "named_fixed_method" : fixedRead ? "fixed_method_read" : "builtin_skill" } : {}), input_tokens: 65536, output_tokens: 128, maximum_requests: 8, real_credential: false, formal_execution_enabled: false })).value;
  const sockets = new Set<Duplex>(), observations: { input_digest: string; authenticated: boolean; mode: string; tool_result_verified: boolean }[] = [];
  const cert = bytesAt(fileURLToPath(new URL("../fixtures/gateway-http-tls/cert.pem", import.meta.url)));
  const key = bytesAt(fileURLToPath(new URL("../fixtures/gateway-http-tls/key.pem", import.meta.url)));
  const server = createServer({ key, cert }, (request, response) => {
    let count = 0; const chunks: Buffer[] = []; request.on("error", () => request.destroy());
    request.on("data", (bytes: Buffer) => { count += bytes.length; if (count > 65536) request.destroy(); else chunks.push(bytes); });
    request.on("end", () => {
      try {
        const bytes = Buffer.concat(chunks), body = parseGatewayJson(bytes.toString("utf8"), 65536) as { request_id: string; stream: boolean; messages: { role: string; content: string; tool_call_id?: string }[] };
        const authenticated = request.headers.authorization === `Bearer ${GATEWAY_HOST_REHEARSAL_KEY}`;
        if (!authenticated || request.url !== DEDICATED_GATEWAY_PATH || request.method !== "POST" || request.headers.host !== "open.bigmodel.cn") { response.writeHead(403); response.end(); return; }
        const results = body.messages.filter(message => message.role === "tool"), validResults = named ? results.length <= namedResources.length && results.every((result, i) => result.tool_call_id === `named_method_${i}` && bodyPresent(result.content, method!.files.find(file => file.path === namedResources[i]!.path)!.content.trim())) : definitions.length ? results.length <= definitions.length && results.every((result, i) => result.tool_call_id === `skill_load_${i}` && bodyPresent(result.content, definitions[i]!.body)) : results.length === 1 && results[0]!.tool_call_id === "public_read_1" && results[0]!.content.includes(publicText);
        const verified = validResults && results.length === expectedRequests - 1;
        if (results.length && !validResults) { response.writeHead(422); response.end(); return; }
        const ownership = readJson(join(path, "native-ownership.json")) as { mapping: string };
        const selected = definitions[results.length];
        const resource = namedResources[results.length], namedModule = namedContext?.profile.modules.find(module => module.definition_path === resource?.path);
        const calls = named && !verified ? [{ id: `named_method_${results.length}`, type: "function", function: namedModule ? { name: "invoke_skill", arguments: JSON.stringify({ name: namedModule.name }) } : { name: "read_method_resource", arguments: JSON.stringify({ path: resource!.path }) } }] : definitions.length && !verified ? [{ id: `skill_load_${results.length}`, type: "function", function: fixedRead ? { name: "read", arguments: JSON.stringify({ filePath: ownership.mapping + "\\workspace\\" + methodReadPaths![results.length]!.replaceAll("/", "\\") }) } : { name: "skill", arguments: JSON.stringify({ name: selected!.name }) } }] : [{ id: "public_read_1", type: "function", function: { name: "read", arguments: JSON.stringify({ filePath: ownership.mapping + "\\workspace\\public.txt" }) } }];
        const finish = verified ? "stop" : "tool_calls", message = verified ? { role: "assistant", content: expectedText } : { role: "assistant", content: null, tool_calls: calls };
        const usage = { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 };
        observations.push({ input_digest: digest(bytes).value, authenticated, mode: body.stream ? "sse" : "json", tool_result_verified: verified });
        if (body.stream) {
          response.setHeader("content-type", "text/event-stream"); const base = { id: "public-completion", model: "glm-5.3", request_id: body.request_id, object: "chat.completion.chunk" };
          response.end([{ ...base, choices: [{ index: 0, delta: { role: "assistant", ...(verified ? { content: expectedText } : { tool_calls: [{ index: 0, ...calls[0] }] }) }, finish_reason: null }] },
            { ...base, choices: [{ index: 0, delta: {}, finish_reason: finish }], usage }, "[DONE]"].map(event => "data: " + (typeof event === "string" ? event : JSON.stringify(event)) + "\n\n").join(""));
        } else { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ id: "public-completion", object: "chat.completion", model: "glm-5.3", request_id: body.request_id, choices: [{ index: 0, message, finish_reason: finish }], usage })); }
      } catch { response.destroy(); }
    });
  });
  server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); }); server.on("tlsClientError", () => {});
  let bridge: PublicConversationBridge | undefined, host: GatewayConversationHostRehearsal | undefined, ledger: GatewayCreditLedger | undefined, child: ReturnType<typeof spawn> | undefined, childEnded = false;
  let output = "", errorOutput = "", overflow = false, stateCleanup = false;
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new RuntimeAdapterError("conversation_fixture_unavailable");
    // Public test CA, loopback dial and synthetic public peer only. No real DNS
    // or Provider certificate acceptance is claimed by this rehearsal.
    const boundary = new GatewayNetworkBoundary({ resolve: async () => [{ address: "8.8.8.8", family: 4, ttl_seconds: 60 }], connect: config => {
      const socket = tlsConnect({ ...config, host: "127.0.0.1", port: address.port, ca: cert }); Object.defineProperty(socket, "remoteAddress", { get: () => "8.8.8.8" }); return socket;
    } });
    const policy: GatewayCreditPolicy = { format: "cimiloop/gateway-credit-rehearsal/1.0.0", scope: "credit_budget_rehearsal", account_scope_digest: digest("public conversation probe " + nonce).value,
      unit: "ZHIPU_CODING_PLAN_CREDIT", model: "glm-5.3", maximum_micro_units: 368000000 };
    ledger = new GatewayCreditLedger(join(path, "conversation", "credit.sqlite"), policy, await creditHostDependencies(launcher, { now: () => Date.parse("2026-10-05T00:00:00Z") }),
      namedContext ? { conversation_original_cache: { maximum_entries: 8, maximum_bytes: 8 * GATEWAY_CONVERSATION_ORIGINAL_SLOT_BYTES, operation_key: operationKey,
        profile_digest: digest(JSON.stringify(namedContext.profile)).value } } : { conversation_cache: { maximum_entries: 8, maximum_bytes: 8 * GATEWAY_CONVERSATION_CACHE_SLOT_BYTES } }); ledger.registerBudget("public_probe", policy.maximum_micro_units);
    host = namedContext ? new GatewayConversationOriginalHostRehearsal({ ledger, boundary }) : new GatewayConversationHostRehearsal({ ledger, boundary }); bridge = new PublicConversationBridge({ path, nonce, operationKey, launcher, binary: pinned.path, policyDigest, ledger, host, ...(method?.skill_profile ? { skillProfile: method.skill_profile } : {}), ...(methodReadPaths ? { methodReadPaths } : {}),
      ...(namedContext ? { fixedMethod: { profile: namedContext.profile, files: namedContext.files } } : {}) });
    const loader = method ? skillLoaderConfiguration(method, workspace) : { permission: { "*": "deny", read: "allow" } }, permission = loader.permission;
    if (fixedRead && "skill" in permission) permission.skill = { "*": "deny" };
    const config = { autoupdate: false, share: "disabled", snapshot: false, enabled_providers: ["cimiloop-conversation"], model: "cimiloop-conversation/cimiloop-public-tools", small_model: "cimiloop-conversation/cimiloop-public-tools", ...loader,
      provider: { "cimiloop-conversation": { npm: "file:///CIMILOOP_TRANSPORT/provider.mjs", options: { operationKey, policyDigest,
        ...(namedContext ? { fixedMethod: { format: "cimiloop/fixed-method-transport/1.0.0", invocation_key: operationKey,
          source_digest: namedContext.profile.source_digest.value, request_digest: namedContext.profile.request_digest.value, profile_digest: digest(JSON.stringify(namedContext.profile)).value } } : {}) },
        models: { "cimiloop-public-tools": { name: "Public isolated read-tool fixture", limit: { context: 65536, output: 128 }, tool_call: true } } } },
      agent: { cimi: { description: "Public CimiLoop tool rehearsal", mode: "primary", steps: expectedRequests + 1, permission }, title: { disable: true }, summary: { disable: true }, compaction: { disable: true } }, default_agent: "cimi" };
    const limits = { max_sandbox_bytes: 64 * 1024 * 1024, max_sandbox_entries: 256, max_file_bytes: 8 * 1024 * 1024, max_output_bytes: 1024 * 1024 };
    atomicJson(join(path, "probe-owner.json"), { format: "cimiloop/public-conversation-owner/1.0.0", nonce, operation_key: operationKey, launcher, binary: pinned.path, binary_digest: pinned.digest, module_digest: module.digest, policy_digest: policyDigest });
    child = spawn(launcher, [sandbox, "read", String(elapsed), pinned.path, join(path, "native-proof.json"), join(path, "cancel"), "--managed", nonce, JSON.stringify(limits), "--policy", JSON.stringify(defaultExecutionPolicy()),
      ...(namedContext ? ["--ipc-conversation-method", operationKey, policyDigest, digest(JSON.stringify(namedContext.profile)).value] : ["--ipc-conversation", operationKey, policyDigest]), "run", "--pure", "--format", "json", "--model", "cimiloop-conversation/cimiloop-public-tools", "--agent", "cimi", method?.prompt ?? "Read public.txt with the read tool, then return the fixture's final response."],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...isolatedEnvironment(), OPENCODE_CONFIG_CONTENT: JSON.stringify(config) } });
    const append = (bytes: Buffer, error = false) => {
      if (Buffer.byteLength(output) + Buffer.byteLength(errorOutput) + bytes.length > limits.max_output_bytes) {
        overflow = true; if (!existsSync(join(path, "cancel"))) writeFileSync(join(path, "cancel"), "output budget exhausted", { flag: "wx" }); return;
      }
      if (error) errorOutput += bytes.toString("utf8"); else output += bytes.toString("utf8");
    };
    child.stdout!.on("data", append); child.stderr!.on("data", bytes => append(bytes, true));
    const ended = new Promise<void>((resolve, reject) => { child!.once("error", reject); child!.once("close", () => { childEnded = true; resolve(); }); }); if (child.pid) bridge.start(child);
    await ended; await bridge.finish(); bridge = undefined; host = undefined;
    writeFileSync(join(path, "stdout.raw"), output, { flag: "wx" }); writeFileSync(join(path, "stderr.raw"), errorOutput, { flag: "wx" });
    if (digest(bytesAt(join(sandbox, "transport", "provider.mjs"), 65536)).value !== module.digest.value) throw new RuntimeAdapterError("conversation_module_changed");
    removePrivateDirectory(path, "state"); stateCleanup = true;
    const native = readJson(join(path, "native-proof.json")) as { phase: string; reason: string; exit_code: number };
    const ownership = readJson(join(path, "native-ownership.json")) as { nonce: string; resources_disposed: boolean; runtime_identity: { pid: number } };
    const policyProof = readJson(join(path, "execution-policy-proof.json")) as { network_mode: string; enforcement: string; capability_sids: unknown[]; pid: number };
    const transport = readJson(join(path, "conversation-transport-proof.json")) as { phase: string; accepted_requests: number; failure_reason: string | null };
    const hostProof = readJson(join(path, "conversation-host-proof.json")) as { failure_reason: string | null; budget: { completed: number; unknown: number }; attempts: { outcome: string }[] };
    const events = output.split(/\r?\n/).filter(line => line.startsWith("{")).map(line => JSON.parse(line) as { type?: string; part?: { text?: string; tool?: string; callID?: string; state?: { status?: string; input?: { name?: string; filePath?: string }; output?: string; error?: string }; reason?: string } });
    const namedProof = named ? readJson(join(path, "fixed-method-proof.json")) as FixedMethodObservation : undefined;
    const tool = named ? namedProof!.status === "Succeeded" && namedProof!.calls.every(call => events.some(event => event.type === "tool_use" && event.part?.tool === "read" && event.part.callID === call.call_id && event.part.state?.status === "completed" && event.part.state.input?.filePath === call.sdk_file_path && typeof event.part.state.output === "string" && digest(event.part.state.output).value === call.output_digest?.value)) : definitions.length ? definitions.every((definition, i) => events.some(event => event.type === "tool_use" && event.part?.tool === (fixedRead ? "read" : "skill") && event.part.state?.status === "completed" && (fixedRead ? event.part.state.input?.filePath?.replaceAll("\\", "/").endsWith(`/workspace/${methodReadPaths![i]}`) : event.part.state.input?.name === definition.name) && typeof event.part.state.output === "string" && bodyPresent(event.part.state.output, definition.body))) : events.some(event => event.type === "tool_use" && event.part?.tool === "read" && event.part.state?.status === "completed" && event.part.state.output?.includes(publicText));
    const final = events.some(event => event.type === "text" && event.part?.text === expectedText), finish = events.some(event => event.type === "step_finish" && event.part?.reason === "stop");
    const passed = native.phase === "ended" && native.reason === "exited" && native.exit_code === 0 && ownership.nonce === nonce && ownership.resources_disposed === true &&
      policyProof.network_mode === "deny_all" && policyProof.enforcement === "appcontainer_no_network_capabilities" && policyProof.capability_sids.length === 0 && policyProof.pid === ownership.runtime_identity.pid &&
      bytesAt(join(workspace, "public.txt")).toString("utf8") === publicText && (!method || method.files.every(file => bytesAt(join(workspace, file.path), 256 * 1024).toString("utf8") === file.content)) && !events.some(event => event.type === "error") && transport.phase === "ended" && transport.failure_reason === null && transport.accepted_requests === expectedRequests &&
      hostProof.failure_reason === null && hostProof.budget.completed === expectedRequests && hostProof.budget.unknown === 0 && hostProof.attempts.length === expectedRequests && hostProof.attempts.every(attempt => attempt.outcome === "completed") &&
      observations.length === expectedRequests && observations.every(o => o.authenticated && o.mode === "sse") && observations.at(-1)!.tool_result_verified && tool && final && finish && !overflow;
    const result = { format: "cimiloop/public-conversation-probe-result/1.0.0", scope: "isolated_conversation_rehearsal", outcome: passed ? "Passed" : "Failed", operation_key: operationKey, path,
      opencode_version: "1.18.34", binary_digest: pinned.digest, module_digest: module.digest, policy_digest: policyDigest, native, transport, host: hostProof, upstream: observations, execution_policy: policyProof,
      tool_result_verified: tool, final_text_verified: final, final_finish_verified: finish, private_state_removed: stateCleanup, actual_credentials_read: 0, external_model_requests: 0,
      ...(method ? { method_profile: method.fixed_method_profile ?? method.skill_profile, skill_loader_verified: !fixedRead && tool, method_read_verified: fixedRead && tool, method_input_digest: digest(JSON.stringify(method)), rehearsal_kind: named ? "synthetic_named_method" : fixedRead ? "synthetic_fixed_method_read" : "synthetic_skill_loader",
        loader_failure: events.some(event => event.type === "tool_use" && event.part?.tool === "skill" && event.part.state?.status === "error" && event.part.state.error === "ripgrep execution failed") ? "skill_tool_subprocess_denied" : null } : {}),
      actual_cost_known: false, billing_admission_ready: false, formal_execution_enabled: false };
    atomicJson(join(path, "result.json"), result); return result;
  } finally {
    try {
      if (child && !childEnded) {
        if (!existsSync(join(path, "cancel"))) writeFileSync(join(path, "cancel"), "conversation probe cleanup", { flag: "wx" });
        await new Promise<void>((resolve, reject) => {
          const closed = () => { clearTimeout(timer); childEnded = true; resolve(); };
          const timer = setTimeout(() => { child!.removeListener("close", closed); reject(new RuntimeAdapterError("conversation_child_close_unproven")); }, 10000); child!.once("close", closed);
        });
      }
    } finally {
      try { if (bridge) await bridge.finish(); else if (host) await host.close(); else ledger?.close(); }
      finally { for (const socket of sockets) socket.destroy(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); }
      if (childEnded && !stateCleanup) removePrivateDirectory(path, "state");
    }
  }
};
