import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { compileValidator, ErrorResultSchema, RuntimeGatewayProbeResultSchema } from "../../packages/protocol/src/v2/index.js";
import { parseRuntimeGatewayProbe } from "../../packages/runtime-adapter/src/gateway-probe.js";
import { parseRuntimeGatewayCreditProbe } from "../../packages/runtime-adapter/src/gateway-credit-probe.js";

const cli = resolve("apps/cli/dist/bin.js"), parse = compileValidator(ErrorResultSchema);
const run = (...args: string[]) => spawnSync(process.execPath, [cli, "--json", "runtime", ...args], { encoding: "utf8" });
describe("Runtime probe CLI", () => {
  it.runIf(process.platform === "win32" && process.arch === "x64")("runs a durable credit rehearsal without granting account or model admission", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-runtime-cli-"));
    try {
      const result = run("gateway-credit-probe", "--output-dir", join(root, "credits")); expect(result.status).toBe(0);
      const value = parseRuntimeGatewayCreditProbe(JSON.parse(result.stdout));
      expect(value).toMatchObject({ credit_budget_probe_passed: true, independent_host_processes: 3, actual_credentials_read: 0, external_model_requests: 0, billing_admission_ready: false, actual_cost_known: false });
      expect(value.checks).toHaveLength(15); expect(value.recoveries.find(r => r.case_name === "crash")).toMatchObject({ verified_ended_owners: 1, reconciled_requests: 1 });
      expect(() => parseRuntimeGatewayCreditProbe({ ...value, billing_admission_ready: true })).toThrow();
      expect(() => parseRuntimeGatewayCreditProbe({ ...value, checks: value.checks.slice(1) })).toThrow("credit_probe_observation_invalid");
      expect(() => parseRuntimeGatewayCreditProbe({ ...value, snapshots: value.snapshots.map(s => ({ ...s, snapshot: { ...s.snapshot, remaining_micro_units: 0 } })) })).toThrow("credit_probe_observation_invalid");
      expect(existsSync(join(root, ".cimiloop", "project.sqlite"))).toBe(false);
    } finally { if (!resolve(root).startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/") + "cimiloop-runtime-cli-")) throw Error("Invalid cleanup target"); rmSync(root, { recursive: true, force: true }); }
  }, 20000);
  it("rejects credential, endpoint, approval and tariff overrides in the credit rehearsal command", () => {
    for (const args of [["--connection-file", "unused.json"], ["--url", "https://example.com"], ["--max-credits", "100"], ["--approved", "true"], ["--binary", "unused.exe"]]) {
      const result = run("gateway-credit-probe", ...args); expect(result.status).toBe(2); expect(parse(JSON.parse(result.stdout))).toMatchObject({ error: { code: "CLI_ARGUMENT_INVALID" } });
    }
  });
  it("requires a runtime binary and rejects endpoint or credential overrides for the IPC gateway bridge", () => {
    for (const args of [[], ["--binary", "unused.exe", "--connection-file", "unused.json"], ["--binary", "unused.exe", "--url", "https://example.com"], ["--binary", "unused.exe", "--execution-policy-file", "unused.json"]]) {
      const result = run("gateway-bridge-probe", ...args); expect(result.status).toBe(2); expect(parse(JSON.parse(result.stdout))).toMatchObject({ error: { code: "CLI_ARGUMENT_INVALID" } });
    }
  });
  it("rejects IPC gateway bridge elapsed limits before creating output artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-runtime-cli-"));
    try { const result = run("gateway-bridge-probe", "--binary", "unused.exe", "--output-dir", join(root, "probe"), "--max-elapsed-ms", "0"); expect(result.status).toBe(2); expect(existsSync(join(root, "probe"))).toBe(false); }
    finally { if (!resolve(root).startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/") + "cimiloop-runtime-cli-")) throw new Error("Invalid cleanup target"); rmSync(root, { recursive: true, force: true }); }
  });
  it("runs the synthetic HTTPS gateway probe with stable, narrowly scoped machine output", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-runtime-cli-"));
    try {
      const result = run("gateway-probe", "--output-dir", join(root, "gateway")); expect(result.status).toBe(0);
      const parsed = parseRuntimeGatewayProbe(JSON.parse(result.stdout));
      expect(parsed).toMatchObject({ scope: "synthetic_gateway_probe", gateway_probe_passed: true, actual_credentials_read: 0, external_model_requests: 0, cost_known: false, ipc_runtime_connected: false, formal_execution_enabled: false });
      expect(parsed.checks).toHaveLength(12); expect(parsed.budgets.every(b => b.snapshot.held_micro_units <= b.snapshot.maximum_micro_units)).toBe(true);
      const validateGateway = compileValidator(RuntimeGatewayProbeResultSchema);
      expect(() => validateGateway({ ...parsed, formal_execution_enabled: true })).toThrow();
      expect(() => validateGateway({ ...parsed, cost_known: true })).toThrow();
      expect(() => parseRuntimeGatewayProbe({ ...parsed, checks: parsed.checks.slice(1) })).toThrow("gateway_probe_observation_invalid");
      expect(() => parseRuntimeGatewayProbe({ ...parsed, gateway_probe_passed: false })).toThrow("gateway_probe_observation_invalid");
      expect(existsSync(join(root, ".cimiloop", "project.sqlite"))).toBe(false);
    } finally {
      if (!resolve(root).startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/") + "cimiloop-runtime-cli-")) throw new Error("Invalid cleanup target"); rmSync(root, { recursive: true, force: true });
    }
  });
  it("does not accept endpoints, credentials, policies or runtime binaries in the synthetic gateway command", () => {
    for (const args of [["--url", "https://example.com"], ["--connection-file", "unused.json"], ["--execution-policy-file", "unused.json"], ["--binary", "unused.exe"]]) {
      const result = run("gateway-probe", ...args); expect(result.status).toBe(2); expect(parse(JSON.parse(result.stdout))).toMatchObject({ error: { code: "CLI_ARGUMENT_INVALID" } });
    }
  });
  it("requires a binary and rejects credentials or network overrides for synthetic transport", () => {
    for (const args of [[], ["--binary", "unused.exe", "--connection-file", "unused.json"], ["--binary", "unused.exe", "--execution-policy-file", "unused.json"]]) {
      const result = run("transport-probe", ...args); expect(result.status).toBe(2); expect(parse(JSON.parse(result.stdout))).toMatchObject({ error: { code: "CLI_ARGUMENT_INVALID" } });
    }
  });
  it("rejects invalid transport elapsed limits before creating any artifact", () => {
    const result = run("transport-probe", "--binary", "unused.exe", "--max-elapsed-ms", "0"); expect(result.status).toBe(2);
    expect(parse(JSON.parse(result.stdout))).toMatchObject({ error: { code: "CLI_ARGUMENT_INVALID" } });
  });
  it.each([
    [{ network: { mode: "host_allowlist", hosts: ["open.bigmodel.cn"] }, cost: { mode: "unmetered_probe_only" } }, "network_host_enforcement_unavailable"],
    [{ network: { mode: "unrestricted_probe_only" }, cost: { mode: "required_cap", max_cost_microusd: 1000 } }, "cost_enforcement_unavailable"],
    [{ network: { mode: "deny_all", enforced: true }, cost: { mode: "unmetered_probe_only" } }, "invalid_execution_policy"]
  ])("rejects unsupported or forged execution policies before creating any probe", (policy, reason) => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-runtime-cli-"));
    try {
      const file = join(root, "policy.json"); writeFileSync(file, JSON.stringify(policy));
      const result = run("probe", "--binary", "missing.exe", "--output-dir", join(root, "probe"), "--execution-policy-file", file);
      expect(result.status).toBe(2); expect(parse(JSON.parse(result.stdout))).toMatchObject({ error: { code: "CLI_ARGUMENT_INVALID", details: { reason } } });
      expect(existsSync(join(root, "probe"))).toBe(false);
    } finally {
      if (!resolve(root).startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/") + "cimiloop-runtime-cli-")) throw new Error("Invalid cleanup target"); rmSync(root, { recursive: true, force: true });
    }
  });
  it("requires explicit broad probe access for a model operation before reading credentials or launching a binary", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-runtime-cli-"));
    try {
      const result = run("probe", "--binary", "missing.exe", "--output-dir", join(root, "probe"), "--model-probe");
      expect(result.status).toBe(2); expect(parse(JSON.parse(result.stdout))).toMatchObject({ error: { details: { reason: "model_network_access_denied" } } });
      expect(existsSync(join(root, "probe"))).toBe(false);
    } finally {
      if (!resolve(root).startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/") + "cimiloop-runtime-cli-")) throw new Error("Invalid cleanup target"); rmSync(root, { recursive: true, force: true });
    }
  });
  it("rejects invalid disk thresholds before starting a binary or creating a project", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-runtime-cli-"));
    try {
      const file = join(root, "limits.json"); writeFileSync(file, JSON.stringify({ max_sandbox_bytes: 65536, max_sandbox_entries: 8, max_file_bytes: 131072, max_output_bytes: 1024 }));
      const result = run("probe", "--binary", "missing.exe", "--output-dir", join(root, "probe"), "--disk-limits-file", file);
      expect(result.status).toBe(2); expect(parse(JSON.parse(result.stdout))).toMatchObject({ error: { code: "CLI_ARGUMENT_INVALID" } });
      expect(existsSync(join(root, "probe"))).toBe(false);
    } finally {
      if (!resolve(root).startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/") + "cimiloop-runtime-cli-")) throw new Error("Invalid cleanup target");
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("rejects plaintext model configuration without echoing its contents or creating a probe", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-runtime-cli-"));
    try {
      const file = join(root, "unsafe.json"); writeFileSync(file, JSON.stringify({ apiKey: "SYNTHETIC-PRIVATE-INPUT" }));
      const result = run("probe", "--binary", "missing.exe", "--output-dir", join(root, "probe"), "--connection-file", file, "--model-probe");
      expect(result.status).toBe(2); expect(result.stdout).not.toContain("SYNTHETIC-PRIVATE-INPUT");
      expect(parse(JSON.parse(result.stdout))).toMatchObject({ error: { code: "CLI_ARGUMENT_INVALID", details: { reason: "invalid_dedicated_model_connection" } } });
      expect(existsSync(join(root, "probe"))).toBe(false);
    } finally {
      if (!resolve(root).startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/") + "cimiloop-runtime-cli-")) throw new Error("Invalid cleanup target");
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("validates arguments before creating a probe or project", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-runtime-cli-"));
    try {
      const result = run("probe", "--binary", "missing.exe", "--output-dir", join(root, "probe"), "--max-elapsed-ms", "wrong");
      expect(result.status).toBe(2);
      expect(parse(JSON.parse(result.stdout))).toMatchObject({ ok: false, error: { code: "CLI_ARGUMENT_INVALID", category: "validation" } });
      expect(existsSync(join(root, "probe"))).toBe(false);
      expect(existsSync(join(root, ".cimiloop"))).toBe(false);
    } finally {
      if (!resolve(root).startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/") + "cimiloop-runtime-cli-")) throw new Error("Invalid cleanup target");
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("reports a missing binary argument with a strict machine error", () => {
    const result = run("probe"); expect(result.status).toBe(2);
    expect(parse(JSON.parse(result.stdout))).toMatchObject({ error: { code: "CLI_ARGUMENT_INVALID" } });
  });
  it.each(["invalid", "999", "30001"])("rejects an invalid public gateway deadline %s before creating resources", deadline => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-runtime-cli-"));
    try {
      const result = run("gateway-network-probe", "--output-dir", join(root, "probe"), "--max-elapsed-ms", deadline);
      expect(result.status).toBe(2); expect(parse(JSON.parse(result.stdout))).toMatchObject({ error: { code: "CLI_ARGUMENT_INVALID" } });
      expect(existsSync(join(root, "probe"))).toBe(false);
    } finally { if (!resolve(root).startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/") + "cimiloop-runtime-cli-")) throw Error("Invalid cleanup target"); rmSync(root, { recursive: true, force: true }); }
  });
  it("reports missing probe operations and denies traversing operation keys", () => {
    const missing = run("show", "absent", "--output-dir", join(tmpdir(), "cimiloop-probe-absent"));
    expect(missing.status).toBe(3); expect(parse(JSON.parse(missing.stdout))).toMatchObject({ error: { code: "OBJECT_NOT_FOUND" } });
    const invalid = run("cancel", "../escape", "--output-dir", tmpdir());
    expect(invalid.status).toBe(2); expect(parse(JSON.parse(invalid.stdout))).toMatchObject({ error: { code: "CLI_ARGUMENT_INVALID" } });
  });
});
