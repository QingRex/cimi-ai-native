import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";
import { runOpenCodeSkillLoaderProbe, runOpenCodeFixedMethodReadProbe } from "../src/gateway-conversation-probe.js";
import { PublicConversationBridge } from "../src/gateway-conversation-bridge.js";
import type { GatewayCreditLedger } from "../src/gateway-credit.js";
import type { GatewayConversationHostRehearsal } from "../src/gateway-host.js";
import { randomUUID } from "node:crypto";
import { digest, readJson } from "../src/files.js";
import type { ProbeOperationInput } from "../src/operations.js";

it.runIf(process.platform === "win32" && process.arch === "x64")("retains actual OpenCode 1.18.34 Skill loading counterevidence under the subprocess boundary without claiming successful behavior", async () => {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-skill-loader-test-")), binary = join(process.env.APPDATA!, "npm", "node_modules", "opencode-ai", "bin", "opencode.exe");
  const input: ProbeOperationInput = { scope: "isolated_provider_probe", operation_key: "skill_loader_fixture", mode: "read", max_elapsed_ms: 30000,
    skill_profile: { version: "cimiloop/skill-method/1.0.0", source_digest: digest("synthetic fixed modules"), purpose: "clarification", skill_names: ["fixed-method", "fixed-dependency"] },
    prompt: "Load fixed-method and its fixed-dependency via the skill tool, then return the fixture reply.", files: [
      { path: "skill-source/fixed-method/SKILL.md", content: "---\nname: fixed-method\ndescription: A fixed method\nallowed-tools: Bash\n---\nCall fixed-dependency. This is a synthetic loader fixture.\n" },
      { path: "skill-source/fixed-dependency/SKILL.md", content: "---\nname: fixed-dependency\ndescription: A fixed dependency\n---\nReturn questions; approval belongs to the human.\n" }
    ] };
  let completed: Awaited<ReturnType<typeof runOpenCodeSkillLoaderProbe>> | undefined;
  try {
    completed = await runOpenCodeSkillLoaderProbe({ root, binary, input });
    expect(completed).toMatchObject({ outcome: "Failed", skill_loader_verified: false, loader_failure: "skill_tool_subprocess_denied", final_text_verified: false, final_finish_verified: false, private_state_removed: true,
      actual_credentials_read: 0, external_model_requests: 0, formal_execution_enabled: false, rehearsal_kind: "synthetic_skill_loader", method_profile: input.skill_profile });
    expect(completed.host.budget).toMatchObject({ unknown: 1 });
    const raw = readFileSync(join(completed.path, "stdout.raw"), "utf8"); expect(raw).toContain('"tool":"skill"'); expect(raw).toContain('"status":"error"'); expect(raw).toContain("ripgrep execution failed"); expect(raw).not.toContain('"tool":"bash"');
    expect((readJson(join(completed.path, "native-ownership.json")) as { resources_disposed: boolean }).resources_disposed).toBe(true);
  } finally {
    // A missing completion retains controller evidence for manual recovery.
    if (completed && existsSync(join(completed.path, "native-ownership.json")) && (readJson(join(completed.path, "native-ownership.json")) as { resources_disposed: boolean }).resources_disposed) {
      if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("cimiloop-skill-loader-test-")) throw new Error("Unsafe skill loader cleanup");
      rmSync(root, { recursive: true, force: true });
    }
  }
}, 60000);

it.each(["../secret", "public.txt", "skill-source/undeclared/SKILL.md"])("refuses undeclared method read path %s before creating bridge artifacts", path => {
  const root = join(tmpdir(), "cimiloop-method-path-" + randomUUID());
  expect(() => new PublicConversationBridge({ path: root, nonce: randomUUID(), operationKey: "method_read", launcher: "unexecuted", binary: "unexecuted", policyDigest: "a".repeat(64),
    ledger: { storageFormat: 3 } as GatewayCreditLedger, host: {} as GatewayConversationHostRehearsal,
    skillProfile: { version: "cimiloop/skill-method/1.0.0", source_digest: digest("fixed"), skill_names: ["fixed-method"], purpose: "clarification" }, methodReadPaths: [path] })).toThrow("conversation_bridge_profile_invalid");
  expect(existsSync(root)).toBe(false);
});

it.runIf(process.platform === "win32" && process.arch === "x64")("reads every fixed method definition with actual read effects while preserving the difference from Skill-tool qualification", async () => {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-method-read-test-")), binary = join(process.env.APPDATA!, "npm", "node_modules", "opencode-ai", "bin", "opencode.exe");
  const input: ProbeOperationInput = { scope: "isolated_provider_probe", operation_key: "method_read_fixture", mode: "read", max_elapsed_ms: 30000,
    skill_profile: { version: "cimiloop/skill-method/1.0.0", source_digest: digest("fixed read method"), skill_names: ["fixed-method", "fixed-dependency"], purpose: "clarification" },
    files: [{ path: "skill-source/fixed-method/SKILL.md", content: "---\nname: fixed-method\ndescription: Fixed\n---\nFirst method line.\n\nRead fixed-dependency.\n" }, { path: "skill-source/fixed-dependency/SKILL.md", content: "---\nname: fixed-dependency\ndescription: Dependency\n---\nFirst dependency line.\nAnother dependency line.\n" }], prompt: "Read the fixed method definitions; this is a loader feasibility rehearsal only." };
  let result: Awaited<ReturnType<typeof runOpenCodeFixedMethodReadProbe>> | undefined;
  try {
    result = await runOpenCodeFixedMethodReadProbe({ root, binary, input });
    expect(result).toMatchObject({ outcome: "Passed", method_read_verified: true, skill_loader_verified: false, rehearsal_kind: "synthetic_fixed_method_read", formal_execution_enabled: false, actual_credentials_read: 0, external_model_requests: 0, private_state_removed: true });
    const raw = readFileSync(join(result.path, "stdout.raw"), "utf8"); expect(raw).toContain('"tool":"read"'); expect(raw).not.toContain('"tool":"skill"');
    expect(result.host.budget).toMatchObject({ completed: 3, unknown: 0 });
  } finally {
    if (result && (readJson(join(result.path, "native-ownership.json")) as { resources_disposed: boolean }).resources_disposed) {
      if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("cimiloop-method-read-test-")) throw new Error("Unsafe method read cleanup"); rmSync(root, { recursive: true, force: true });
    }
  }
}, 60000);
