import { spawn } from "node:child_process";
import { createServer, createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { writeFileSync, existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { compileValidator, RuntimeProbeResultSchema, type RuntimeProbeResult, type RuntimeBoundaryProbe, type ExternalReference, type RuntimeDiskLimits, type RuntimeExecutionPolicy } from "@cimiloop/protocol/v2";
import { buildWindowsLauncher, pinBinary, isolatedEnvironment } from "./native.js";
import {nativeHelperProcessOptions} from './native-process-environment.js';
import { directory, bytesAt, rawReference, atomicJson, readJson, RuntimeAdapterError } from "./files.js";
import { IsolatedProbeAdapter, type NativeProof } from "./operations.js";
import { loadModelConnection } from "./connection.js";
import { defaultExecutionPolicy, requireSupportedExecutionPolicy } from "./execution-policy.js";

export const parseRuntimeProbe = compileValidator<RuntimeProbeResult>(RuntimeProbeResultSchema);
function probeAuthority(guard:(()=>void)|undefined){const result:unknown=guard?.();if(result!==undefined){if(result instanceof Promise)void Promise.prototype.then.call(result,undefined,()=>{});throw new RuntimeAdapterError('runtime_probe_authority_changed');}}
export const nativeProbe = async (root: string, launcher: string, binary: string, mode: "write" | "read", args: string[], elapsed = 20_000, beforeNativeEffect?:()=>void): Promise<{ stdout: string; stderr: string; proof: NativeProof; refs: ExternalReference[] }> => {
  probeAuthority(beforeNativeEffect);
  const operation = directory(join(root, "native-probes", randomUUID())), sandbox = directory(join(operation, "sandbox"));
  directory(join(sandbox, "state")); directory(join(sandbox, "workspace"));
  writeFileSync(join(sandbox, "workspace", "input.txt"), "visible");
  const proofPath = join(operation, "proof.json");
  probeAuthority(beforeNativeEffect);
  const native = spawn(launcher, [sandbox, mode, String(elapsed), binary, proofPath, join(operation, "cancel"), "--policy", JSON.stringify(defaultExecutionPolicy()), ...args], {
    ...nativeHelperProcessOptions(launcher,isolatedEnvironment()), windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
  });
  const output: Buffer[] = [], errors: Buffer[] = []; let count = 0;
  native.stdout.on("data", (bytes: Buffer) => { count += bytes.length; if (count <= 1024 * 1024) output.push(bytes); else writeFileSync(join(operation, "cancel"), "bounded probe output exceeded"); });
  native.stderr.on("data", (bytes: Buffer) => { count += bytes.length; if (count <= 1024 * 1024) errors.push(bytes); else writeFileSync(join(operation, "cancel"), "bounded probe output exceeded"); });
  await new Promise<void>((done, fail) => { native.once("error", fail); native.once("close", () => done()); });
  if (!existsSync(proofPath)) throw new RuntimeAdapterError("sandbox_start_unproven");
  const stdout = Buffer.concat(output), stderr = Buffer.concat(errors);
  const refs = [rawReference(root, stdout, "probe_stdout"), rawReference(root, stderr, "probe_stderr"), rawReference(root, bytesAt(proofPath), "sandbox_proof")];
  const policyProof = join(operation, "execution-policy-proof.json");
  if (existsSync(policyProof)) refs.push(rawReference(root, bytesAt(policyProof), "execution_policy_proof"));
  return { stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"), proof: readJson(proofPath) as NativeProof, refs };
};
export const boundaryProbe = async (root: string, launcher: string, mode: "write" | "read",beforeNativeEffect?:()=>void): Promise<RuntimeBoundaryProbe> => {
  probeAuthority(beforeNativeEffect);
  const protectedPath = join(directory(join(root, "protected-canaries")), randomUUID());
  writeFileSync(protectedPath, "synthetic-human-secret-and-authority-file");
  const server = createServer(socket => { socket.on("error", () => socket.destroy()); socket.end("synthetic-human-endpoint"); });
  await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", () => done()); });
  try {
    const address = server.address(); if (!address || typeof address === "string") throw new RuntimeAdapterError("canary_listener_unavailable");
    // A blocked socket is evidence only when the same listener is reachable by
    // the trusted controller; refused connections to an absent service prove nothing.
    await new Promise<void>((done, fail) => { const client = createConnection(address.port, "127.0.0.1"); client.once("connect", () => { client.destroy(); done(); }); client.once("error", fail); });
    const result = await nativeProbe(root, launcher, launcher, mode, ["--canary", "{workspace}", protectedPath, mode, String(address.port)],20000,beforeNativeEffect);
    const line = result.stdout.split(/\r?\n/).find(line => line.includes('"event":"sandbox.canary"'));
    const values = line ? JSON.parse(line) as Record<string, unknown> : {};
    const flags = { outside_read_denied: values.outside_read_denied === true, outside_write_denied: values.outside_write_denied === true,
      subprocess_denied: values.subprocess_denied === true, inside_readable: values.inside_readable === true,
      inside_writable: values.inside_writable === true, loopback_denied: values.loopback_denied === true };
    const passed = result.proof.phase === "ended" && result.proof.reason === "exited" && result.proof.exit_code === 0 && bytesAt(protectedPath).toString() === "synthetic-human-secret-and-authority-file";
    return { mode, passed, ...flags, raw_refs: result.refs };
  } finally { await new Promise<void>(done => server.close(() => done())); }
};
export const waitForOperation = async (adapter: IsolatedProbeAdapter, key: string, maximum: number): Promise<ReturnType<IsolatedProbeAdapter["collect"]>> => {
  const start = Date.now();
  while (Date.now() - start < maximum) {
    const result = adapter.query(key);
    if (existsSync(join(adapter.operationPath(key), "result.json"))) {
      const collected = adapter.collect(key);
      if (!["runtime_observation_read_unavailable", "runtime_raw_collection_unavailable"].includes(collected.reason)) return collected;
    }
    await delay(250);
  }
  adapter.cancel(key);
  return adapter.collect(key);
};
export const runOpenCodeProbe = async (options: { root: string; binary: string; modelProbe?: boolean; maxElapsedMs?: number; connectionFile?: string; diskLimits?: RuntimeDiskLimits; executionPolicy?: RuntimeExecutionPolicy;beforeNativeEffect?:()=>void }): Promise<RuntimeProbeResult> => {
  probeAuthority(options.beforeNativeEffect);
  const connection = options.connectionFile ? loadModelConnection(options.connectionFile) : undefined;
  const executionPolicy = requireSupportedExecutionPolicy(options.executionPolicy ?? defaultExecutionPolicy(), options.modelProbe === true);
  const root = directory(options.root), launcher = await buildWindowsLauncher(root), pinned = pinBinary(root, options.binary);
  const versionProbe = await nativeProbe(root, launcher, pinned.path, "read", ["--version"],20000,options.beforeNativeEffect);
  const version = versionProbe.stdout.split(/\r?\n/).map(line => line.trim()).find(line => /^\d+\.\d+\.\d+$/.test(line));
  if (!version || versionProbe.proof.exit_code !== 0) throw new RuntimeAdapterError("opencode_version_probe_failed");
  const boundaries = [await boundaryProbe(root, launcher, "write",options.beforeNativeEffect), await boundaryProbe(root, launcher, "read",options.beforeNativeEffect)];
  const model = connection?.model ?? "opencode/big-pickle";
  const result: RuntimeProbeResult = { schema_version: "2.0.0", scope: "isolated_provider_probe", observed_at: new Date().toISOString(),
    provider: { name: "opencode", version, binary_digest: pinned.digest, model }, sandbox: "windows_appcontainer_job", boundaries,
    model_operations: [], contract_probe_passed: false, formal_execution_enabled: false, gaps: ["native_provider_binding_and_task_run_integration_pending", "provider_cost_and_network_host_limits_unproven"], evidence_refs: versionProbe.refs };
  if (!boundaries.every(probe => probe.passed)) result.gaps.push("os_permission_boundary_failed");
  else if (options.modelProbe) {
    const maximum = options.maxElapsedMs ?? 90_000;
    const adapter = new IsolatedProbeAdapter(root, { launcher, binary: pinned.path, binary_digest: pinned.digest, kind: "opencode", model, ...(connection ? { connection } : {}) });
    const key = `edit_${randomUUID()}`;
    await adapter.start({ scope: "isolated_provider_probe", operation_key: key, mode: "write", files: [{ path: "input.txt", content: "before\n" }],
      prompt: "Read input.txt and change its full content to exactly after followed by one newline. Use the edit tool. Do not call other tools. Then stop.", max_elapsed_ms: maximum, execution_policy: executionPolicy, ...(options.diskLimits ? { disk_limits: options.diskLimits } : {}) });
    const edited = await waitForOperation(adapter, key, maximum + 20_000); result.model_operations.push(edited);
    const output = edited.outputs.find(ref => ref.version === "input.txt");
    if (edited.status === "Succeeded" && output && bytesAt(output.locator).toString() === "after\n") {
      const reviewKey = `review_${randomUUID()}`;
      await adapter.start({ scope: "isolated_provider_probe", operation_key: reviewKey, mode: "read", files: [{ path: "input.txt", content: bytesAt(output.locator).toString() }],
        prompt: "Independently read input.txt. The acceptance condition is exactly after followed by one newline. Reply PROBE_ACCEPT only if it matches; otherwise PROBE_REJECT. Do not modify files or call other tools.", max_elapsed_ms: maximum, execution_policy: executionPolicy, ...(options.diskLimits ? { disk_limits: options.diskLimits } : {}) });
      const reviewed = await waitForOperation(adapter, reviewKey, maximum + 20_000); result.model_operations.push(reviewed);
      const raw = reviewed.raw_refs.find(ref => ref.version === "stdout.raw");
      const answers = raw ? bytesAt(raw.locator).toString().split(/\r?\n/).flatMap(line => {
        try { const event = JSON.parse(line) as { type?: string; part?: { text?: string } }; return event.type === "text" && typeof event.part?.text === "string" ? [event.part.text.trim()] : []; }
        catch { return []; }
      }) : [];
      result.contract_probe_passed = reviewed.status === "Succeeded" && !!edited.session_id && !!reviewed.session_id && edited.session_id !== reviewed.session_id && answers.at(-1) === "PROBE_ACCEPT";
    }
    if (!result.contract_probe_passed) result.gaps.push("real_edit_and_independent_review_not_completed");
  } else result.gaps.push("real_model_probe_not_requested");
  const validated = parseRuntimeProbe(result); atomicJson(join(root, "probe-result.json"), validated);probeAuthority(options.beforeNativeEffect); return validated;
};
