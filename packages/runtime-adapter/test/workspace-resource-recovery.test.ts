import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, linkSync, rmSync, rmdirSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createInternalId } from "@cimiloop/protocol/v2";
import { WindowsWorkspaceFileBroker, type WorkspaceNativePreparation } from "../src/workspace-files.js";
import { buildWindowsLauncher, isolatedEnvironment } from "../src/native.js";
import { creditHostDependencies } from "../src/gateway-credit-owner.js";
import { digest } from "../src/files.js";
import type { CreditProcessIdentity } from "../src/gateway-credit.js";
vi.setConfig({ testTimeout: 60000 });

describe.runIf(process.platform === "win32" && process.arch === "x64")("actual original native staging resource recovery", () => {
  let tools: string, owners: Awaited<ReturnType<typeof creditHostDependencies>>; const roots: string[] = [];
  const remove = (root: string) => { if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-workspace-resource-")) throw Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true }); };
  beforeAll(async () => { tools = mkdtempSync(join(tmpdir(), "cimiloop-workspace-resource-tools-")); owners = await creditHostDependencies(await buildWindowsLauncher(tools)); });
  afterAll(() => remove(tools)); afterEach(() => { while (roots.length) remove(roots.pop()!); });
  const setup = async () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-workspace-resource-")); roots.push(root); writeFileSync(join(root, "query.ts"), "original resource\n");
    const files = await WindowsWorkspaceFileBroker.open(root, tools), input = { format: "cimiloop/workspace-tool-invocation/1.0.0", project_id: createInternalId(), run_id: createInternalId(),
      operation_key: createInternalId(), executor_actor_id: createInternalId(), context_digest: digest("constructed file fixture context"), call_id: "resource", path: "query.ts", tool: "replace_file", expected_digest: digest("original resource\n").value, replacement_utf8: "must not install\n" };
    return { root, files, input };
  };
  const orphan = async (differentBuild = false) => {
    const f = await setup(), record = join(f.root, "owned-original.json"), worker = fileURLToPath(new URL("./workspace-resource-worker.mjs", import.meta.url));
    const args = [worker, f.root, tools, JSON.stringify(f.input), record];
    if (differentBuild) {
      // Actual second compiled source identity, not a forged worker.image or an
      // assertion that a historical build was qualified. Only the comment differs.
      const source = Buffer.concat([readFileSync(fileURLToPath(new URL("../native/WorkspaceFiles.cs", import.meta.url))), Buffer.from("\r\n// Owned second source-addressed build fixture.\r\n")]);
      const directory = join(tools, "tools", "workspace-" + digest(source).value), input = join(f.root, "owned-source.cs"), binary = join(directory, "WorkspaceFiles.exe");
      mkdirSync(directory, { recursive: true }); writeFileSync(input, source);
      execFileSync(join(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"), ["/nologo", "/target:exe", "/reference:System.Web.Extensions.dll", "/out:" + binary, input],
        { windowsHide: true, timeout: 30000, env: isolatedEnvironment() }); args.push(binary);
    }
    await expect(promisify(execFile)(process.execPath, args, { windowsHide: true, timeout: 30000 })).rejects.toMatchObject({ code: 73 });
    const original = JSON.parse(readFileSync(record, "utf8")) as { preparation: WorkspaceNativePreparation; owner: CreditProcessIdentity };
    const deadline = Date.now() + 10000;
    while ((await Promise.all([owners.observeOwner(original.owner), owners.observeOwner(original.preparation.worker)])).some(state => state !== "absent")) {
      if (Date.now() >= deadline) throw Error("Actual original owners not absent"); await delay(25);
    }
    const staging = join(dirname(original.preparation.worker.image), "workspace-" + original.preparation.nonce + ".tmp");
    expect(existsSync(staging)).toBe(true); return { ...f, ...original, staging };
  };
  it("deletes only the original matching private inode after both actual owners exit and repeats as absent", async () => {
    const f = await orphan(), unrelated = join(dirname(f.staging), "workspace-unrecorded.tmp"); writeFileSync(unrelated, "unrecorded private bytes");
    expect(await f.files.reclaimStaging(f.preparation, f.owner)).toBe("removed"); expect(existsSync(f.staging)).toBe(false);
    expect(await f.files.reclaimStaging(f.preparation, f.owner)).toBe("absent"); expect(readFileSync(unrelated, "utf8")).toBe("unrecorded private bytes");
    expect(readFileSync(join(f.root, "query.ts"), "utf8")).toBe("original resource\n");
  });
  it("recovers a distinct original source-addressed build after its executable is removed without running that build", async () => {
    const f = await orphan(true); rmSync(f.preparation.worker.image);
    expect(await f.files.reclaimStaging(f.preparation, f.owner)).toBe("removed"); expect(existsSync(f.staging)).toBe(false);
    expect(readFileSync(join(f.root, "query.ts"), "utf8")).toBe("original resource\n");
  });
  it.each(["wrong_identity", "substitution", "hardlink", "directory", "outside_scope", "wrong_root"])("refuses %s without deleting the original or substituted resource", async variant => {
    const f = await orphan(), proof = structuredClone(f.preparation), saved = f.staging + ".saved";
    if (variant === "wrong_identity") proof.replacement_identity!.file_index = "0".repeat(16);
    if (variant === "substitution" || variant === "directory") { renameSync(f.staging, saved); if (variant === "substitution") writeFileSync(f.staging, "different original identity"); else mkdirSync(f.staging); }
    if (variant === "hardlink") linkSync(f.staging, join(f.root, "staging-alias"));
    if (variant === "outside_scope") proof.worker.image = join(f.root, "WorkspaceFiles.exe");
    if (variant === "wrong_root") proof.root_identity.file_index = "0".repeat(16);
    const expected = { wrong_identity: "workspace_recovery_identity_denied", substitution: "workspace_recovery_identity_denied", hardlink: "workspace_recovery_identity_denied", directory: "workspace_link_or_type_denied",
      outside_scope: "workspace_recovery_scope_denied", wrong_root: "workspace_recovery_contract_invalid" }[variant]!;
    try { await expect(f.files.reclaimStaging(proof, f.owner)).rejects.toThrow(expected); expect(existsSync(f.staging)).toBe(true);
      if (variant === "substitution") expect(readFileSync(f.staging, "utf8")).toBe("different original identity");
      expect(readFileSync(join(f.root, "query.ts"), "utf8")).toBe("original resource\n");
    } finally { if (variant === "hardlink") rmSync(join(f.root, "staging-alias")); if (variant === "directory") rmdirSync(f.staging); }
  });
  it("independently refuses an active original Node owner even after its own native worker is killed", async () => {
    const f = await setup(), effect = await f.files.prepare(f.input);
    const path = join(dirname(effect.proof.worker.image), "workspace-" + effect.proof.nonce + ".tmp");
    try { await expect(f.files.reclaimStaging(effect.proof, owners.identity)).rejects.toThrow("workspace_recovery_owner_active");
      process.kill(effect.proof.worker.pid, "SIGKILL"); await f.files.discard(effect);
      await expect(f.files.reclaimStaging(effect.proof, owners.identity)).rejects.toThrow("workspace_recovery_owner_active"); expect(existsSync(path)).toBe(true);
    } finally { await f.files.discard(effect); }
  });
});
