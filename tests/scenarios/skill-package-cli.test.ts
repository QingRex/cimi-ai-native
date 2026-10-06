import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInternalId, parseCommandSuccess, compileValidator, SkillPackageInspectionResultSchema,
  type SkillImportSpec, type SkillPackageInspectionResult } from "../../packages/protocol/src/v2/index.js";
import { writeInstance, LocalProviderVerifier, LocalSkillPackageStore } from "../../packages/local-app/src/index.js";
import { createFlowProject } from "../fixtures/flow-project.js";

describe("skill package CLI preserves native candidate authority", () => {
  let root: string, source: string, file: string, spec: SkillImportSpec, f: ReturnType<typeof createFlowProject>;
  const run = (args: string[]) => spawnSync(process.execPath, ["--no-warnings", resolve("apps/cli/dist/bin.js"), "--project-dir", root, "--json", ...args],
    { encoding: "utf8", windowsHide: true, env: { ...process.env, LOCALAPPDATA: join(root, "app-data") } });
  const success = (args: string[]) => { const result = run(args); expect(result.status, result.stderr).toBe(0); return parseCommandSuccess(JSON.parse(result.stdout)); };
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "cimiloop-skill-cli-")); source = join(root, "skill-source"); mkdirSync(join(source, "skills", "clarify"), { recursive: true });
    writeFileSync(join(source, "LICENSE"), "Synthetic local fixture license\n");
    writeFileSync(join(source, "skills", "clarify", "SKILL.md"), "---\nname: clarify\ndescription: A local fixture method\n---\nOnly propose clarification questions.\n");
    const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=disabled-hooks", "-C", source, ...args], { encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }).trim();
    git("init"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test"); git("add", "."); git("commit", "-m", "method fixture");
    spec = { format: "cimiloop/skill-import/1.0.0", repository_url: "https://example.test/skills", commit_id: git("rev-parse", "HEAD"), entry_path: "skills/clarify", license_path: "LICENSE",
      name: "fixture-clarifier", version: "1.0.0", modules: [{ path: "skills/clarify", dependencies: [] }], capabilities: [{ capability_id: "intent.clarify", version: "1.0.0" }],
      provider_dependencies: [], required_permissions: { actions: [], resources: [], environment_ids: [], network_hosts: [] }, harness_requirements: [], dependency_review: "This fixture calls no other skill." };
    file = join(root, "skill-import.json"); writeFileSync(file, JSON.stringify(spec));
    f = createFlowProject(root, { databasePath: join(root, ".cimiloop", "project.db") });
    writeInstance(join(root, ".cimiloop", "instance.json"), { schema_version: "1.0.0", instance_id: f.project.instance_id, project_id: f.project.id, actor_id: f.actor.id, created_at: f.project.created_at });
  });
  afterEach(() => { f?.store.close(); if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("cimiloop-skill-cli-")) throw new Error("Unsafe skill CLI cleanup"); rmSync(root, { recursive: true, force: true }); });
  it("registers the actual package, reads it back, and replays the native command after later writes", () => {
    const args = ["--command-id", createInternalId(), "skill", "import", "--file", file, "--repository", source], first = success(args);
    expect(first.command_type).toBe("RegisterProvider"); if (first.command_type !== "RegisterProvider") throw new Error("Wrong command");
    const descriptor = first.data.descriptor; expect(descriptor.trust_status).toBe("candidate"); expect(descriptor.source_ref.version).toBe(spec.commit_id);
    const beforeQuery = f.store.listEvents().length, inspection = run(["skill", "inspect", descriptor.id]); expect(inspection.status, inspection.stderr).toBe(0);
    const view = compileValidator<SkillPackageInspectionResult>(SkillPackageInspectionResultSchema)(JSON.parse(inspection.stdout));
    expect(view.modules[0]!.name).toBe("clarify"); expect(view.admission).toBe("candidate_package_only"); expect(f.store.listEvents()).toHaveLength(beforeQuery);
    const provider = new LocalProviderVerifier(root, join(root, ".cimiloop")); expect(provider.sourceDigest(f.store.getProject()!, descriptor)).toEqual(descriptor.source_ref.digest);
    success(["change", "create", "--title", "Later fact"]); expect(success(args)).toEqual(first);
    expect(f.store.listProviderDescriptors()).toHaveLength(1); expect(f.store.listProviderBindings()).toHaveLength(0);
    const catalog = f.kernel.getProviderCatalog(); if ("code" in catalog) throw new Error(catalog.code); expect(catalog.admission[0]!.execution_enabled).toBe(false);
  }, 40_000);
  it("requires an actual native Project Owner role and current revision", () => {
    const original = f.store.listEvents().length;
    const denied = run(["--acting-role", "technical_owner", "skill", "import", "--file", file, "--repository", source]);
    expect(denied.status).not.toBe(0); expect(JSON.parse(denied.stdout).error.code).toBe("ROLE_NOT_ASSIGNED");
    const stale = run(["skill", "import", "--file", file, "--repository", source, "--expected-revision", "999"]);
    expect(stale.status).not.toBe(0); expect(JSON.parse(stale.stdout).error.code).toBe("REVISION_CONFLICT");
    expect(f.store.listEvents()).toHaveLength(original); expect(f.store.listProviderDescriptors()).toHaveLength(0);
  }, 40_000);
  it("keeps upgrades as separate candidates and refuses a descriptor that overstates its package permissions", () => {
    const first = success(["skill", "import", "--file", file, "--repository", source]); if (first.command_type !== "RegisterProvider") throw new Error("Wrong command");
    spec.version = "1.0.1"; writeFileSync(file, JSON.stringify(spec));
    const upgrade = success(["skill", "import", "--file", file, "--repository", source]); if (upgrade.command_type !== "RegisterProvider") throw new Error("Wrong command");
    expect(f.store.listProviderDescriptors()).toHaveLength(2); expect(upgrade.data.descriptor.source_ref.digest).not.toEqual(first.data.descriptor.source_ref.digest);
    const provider = new LocalProviderVerifier(root, join(root, ".cimiloop"));
    const claimed = { ...first.data.descriptor, required_permissions: { ...first.data.descriptor.required_permissions, actions: ["edit_files"] } };
    expect(() => provider.sourceDigest(f.store.getProject()!, claimed)).toThrow("does not match");
    const packages = new LocalSkillPackageStore(root, join(root, ".cimiloop"));
    expect(() => packages.inspect(claimed)).toThrow("does not match");
    expect(() => packages.inspect({ ...first.data.descriptor, input_schema_ref: { ...first.data.descriptor.input_schema_ref, digest: { algorithm: "sha256", value: "a".repeat(64) } } })).toThrow("Skill Schema changed");
    const pkg = packages.inspect(first.data.descriptor); expect(pkg.package.spec.version).toBe("1.0.0");
  }, 40_000);
});
