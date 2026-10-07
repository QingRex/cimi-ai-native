import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";
import { runOpenCodeSkillLoaderProbe } from "../src/gateway-conversation-probe.js";
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
