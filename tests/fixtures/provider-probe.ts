import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProviderRegistration, RuntimeProbeResult, ExternalReference } from "../../packages/protocol/src/v2/index.js";
import { LocalProviderVerifier } from "../../apps/cli/src/providers-local.js";
import { flowTime } from "./flow-project.js";

// Synthetic bytes only: these fixtures test governance and never run a model or
// claim to establish actual OS enforcement on the test host.
export const createProviderProbe = (root: string, dataDirectory: string) => {
  const blobs = join(root, "fixture-blobs"); mkdirSync(blobs);
  const port = new LocalProviderVerifier(root, dataDirectory), binary = join(root, "opencode-fixture.exe");
  const source = Buffer.from("SYNTHETIC executable bytes; never executed\n"); writeFileSync(binary, source);
  const hash = (bytes: Buffer) => ({ algorithm: "sha256" as const, value: createHash("sha256").update(bytes).digest("hex") });
  const artifact = (content: string, type: string, version?: string): ExternalReference => {
    const bytes = Buffer.from(content), digest = hash(bytes); writeFileSync(join(blobs, digest.value), bytes);
    return { provider: "fixture", resource_type: type, locator: `fixture-blobs/${digest.value}`, digest, ...(version ? { version } : {}) };
  };
  const proof = (profile: string) => JSON.stringify({ pid: 42, profile: `CimiLoop.${profile}`, phase: "ended", reason: "exited", exit_code: 0 });
  const snapshot: RuntimeProbeResult = { schema_version: "2.0.0", scope: "isolated_provider_probe", observed_at: flowTime,
    provider: { name: "opencode", version: "1.0.0", binary_digest: hash(source), model: "fixture/glm-synthetic" }, sandbox: "windows_appcontainer_job",
    boundaries: ["write", "read"].map(mode => {
      const flags = { outside_read_denied: true, outside_write_denied: true, subprocess_denied: true, inside_readable: true, inside_writable: mode === "write", loopback_denied: true };
      return { mode: mode as "write" | "read", passed: true, ...flags, raw_refs: [artifact(JSON.stringify({ event: "sandbox.canary", ...flags }), "probe_stdout"),
        artifact("", "probe_stderr"), artifact(proof(mode), "sandbox_proof")] };
    }),
    model_operations: ["edit", "review"].map(mode => {
      const session = `ses_fixture${mode}`, stdout = [JSON.stringify({ event: "sandbox.started" }),
        JSON.stringify({ sessionID: session, type: "text", part: { text: mode === "review" ? "PROBE_ACCEPT" : "done" } }),
        JSON.stringify({ sessionID: session, type: "step_finish", part: { reason: "stop" } })].join("\n") + "\n";
      return { schema_version: "2.0.0", scope: "isolated_provider_probe", operation_key: mode, input_digest: hash(Buffer.from(mode)), status: "Succeeded",
        cancel_requested: false, observed_at: flowTime, session_id: session, exit_code: 0, reason: "provider_completed_probe", usage: { cost_known: false },
        raw_refs: [artifact(stdout, "probe_raw", "stdout.raw"), artifact("", "probe_raw", "stderr.raw"), artifact(proof(mode), "probe_raw", "native-proof.json")],
        outputs: [artifact("after\n", "probe_workspace_file", "input.txt")] };
    }), contract_probe_passed: true, formal_execution_enabled: false, gaps: [],
    evidence_refs: [artifact("1.0.0\n", "probe_stdout"), artifact("", "probe_stderr"), artifact(proof("version"), "sandbox_proof")] };
  const snapshotFile = join(root, "probe.json");
  const save = () => { writeFileSync(snapshotFile, JSON.stringify(snapshot)); return port.importProbe(snapshotFile, root); };
  const registration: ProviderRegistration = { provider_kind: "runtime", name: "opencode", version: "1.0.0",
    source_ref: { provider: "local_file", resource_type: "executable", locator: binary, version: "1.0.0", digest: snapshot.provider.binary_digest },
    capabilities: [{ capability_id: "runtime.probe", version: "1.0.0" }], dependencies: [],
    required_permissions: { actions: ["read_files", "edit_files"], resources: [], environment_ids: [], network_hosts: ["fixture.example.test"] },
    input_schema_ref: { schema_id: "RuntimeOperationResult", digest: port.schemaDigest("RuntimeOperationResult") },
    output_schema_ref: { schema_id: "RuntimeProbeResult", digest: port.schemaDigest("RuntimeProbeResult") } };
  return { port, binary, snapshot, snapshotFile, registration, artifact, save };
};
