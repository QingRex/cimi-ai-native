import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, linkSync, symlinkSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { openSync, closeSync, writeSync } from "node:fs";
import { createInternalId } from "../../protocol/src/v2/index.js";
import { WindowsWorkspaceFileBroker, parseWorkspaceToolInvocation, type WorkspaceToolInvocation } from "../src/workspace-files.js";
import { digest } from "../src/files.js";

describe.runIf(process.platform === "win32" && process.arch === "x64")("actual Windows workspace handles and native effect identity", () => {
  let tools: string; const roots: string[] = [];
  const remove = (root: string) => { if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-workspace-handles-")) throw Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true }); };
  beforeAll(() => { tools = mkdtempSync(join(tmpdir(), "cimiloop-workspace-handles-tools-")); }); afterAll(() => remove(tools));
  afterEach(() => { while (roots.length) remove(roots.pop()!); });
  const setup = async (content = "actual workspace\n") => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-workspace-handles-")); roots.push(root); mkdirSync(join(root, "src")); writeFileSync(join(root, "src", "query.ts"), content);
    const files = await WindowsWorkspaceFileBroker.open(root, tools);
    const input: WorkspaceToolInvocation = { format: "cimiloop/workspace-tool-invocation/1.0.0", project_id: createInternalId(), run_id: createInternalId(), operation_key: createInternalId(), executor_actor_id: createInternalId(),
      context_digest: digest("constructed context"), call_id: "read_1", path: "src/query.ts", tool: "read_file", expected_digest: digest(content).value };
    return { root, files, input };
  };
  it.each(["plain\n", "\ufeffBOM with 中文\n", "", "line\u0000control\t\n"])("preserves exact UTF-8 bytes and original file identity: %s", async content => {
    const f = await setup(content), effect = await f.files.prepare(f.input);
    try { expect(effect.proof.root_identity).toEqual(f.files.rootIdentity); expect(effect.proof.worker.pid).toBeGreaterThan(0); expect(effect.proof.input_digest).toBe(digest(JSON.stringify(parseWorkspaceToolInvocation(f.input))).value);
      const result = await f.files.commit(effect); expect(result.text).toBe(content); expect(result.after_digest).toBe(f.input.expected_digest); expect(result.file_identity).toEqual(effect.proof.file_identity);
      await expect(f.files.commit(effect)).rejects.toThrow("workspace_effect_unowned");
    } finally { await f.files.discard(effect); }
  });
  it.each(["替换\n", "", "\ufeffnew BOM\n"])("fsyncs and atomically replaces with the pre-recorded new file identity: %s", async replacement => {
    const f = await setup(), input = { ...f.input, tool: "replace_file" as const, replacement_utf8: replacement }, effect = await f.files.prepare(input);
    const result = await f.files.commit(effect); expect(readFileSync(join(f.root, input.path))).toEqual(Buffer.from(replacement)); expect(result.after_digest).toBe(digest(replacement).value); expect(result.text).toBeNull();
    expect(result.after_file_identity).toEqual(effect.proof.replacement_identity); expect(result.after_file_identity).not.toEqual(effect.proof.file_identity);
  });
  it("does not mutate before commit and discards only its own prepared native process", async () => {
    const f = await setup(), effect = await f.files.prepare({ ...f.input, tool: "replace_file", replacement_utf8: "must not write" });
    try { await expect(f.files.commit({ proof: effect.proof })).rejects.toThrow("workspace_effect_unowned");
      expect(() => { effect.proof.file_identity.file_index = "0".repeat(16); }).toThrow(); expect(() => { effect.proof.worker.creation_ticks = "1"; }).toThrow();
      expect(readFileSync(join(f.root, f.input.path), "utf8")).toBe("actual workspace\n");
    } finally { await f.files.discard(effect); }
    await expect(f.files.commit(effect)).rejects.toThrow("workspace_effect_unowned");
  });
  it("denies ancestor rename or competing data writes while handles are held", async () => {
    const f = await setup(), effect = await f.files.prepare({ ...f.input, tool: "replace_file", replacement_utf8: "locked effect\n" });
    try { expect(() => renameSync(join(f.root, "src"), join(f.root, "swapped"))).toThrow();
      const fd = openSync(join(f.root, f.input.path), "r+"); try { expect(() => writeSync(fd, Buffer.from("competing"), 0, 9, 0)).toThrow(); } finally { closeSync(fd); }
      const result = await f.files.commit(effect); expect(result.after_digest).toBe(digest("locked effect\n").value);
    } finally { await f.files.discard(effect); }
  });
  it("refuses a hardlink introduced after preparation without modifying either alias", async () => {
    const f = await setup(), effect = await f.files.prepare({ ...f.input, tool: "replace_file", replacement_utf8: "must not affect aliases" });
    try { linkSync(join(f.root, f.input.path), join(f.root, "outside-alias.ts")); await expect(f.files.commit(effect)).rejects.toThrow("workspace_preimage_changed");
      expect(readFileSync(join(f.root, f.input.path), "utf8")).toBe("actual workspace\n"); expect(readFileSync(join(f.root, "outside-alias.ts"), "utf8")).toBe("actual workspace\n");
    } finally { await f.files.discard(effect); }
  });
  it("rejects a renamed prepared target instead of installing a replacement under an unverified path", async () => {
    const f = await setup(), effect = await f.files.prepare({ ...f.input, tool: "replace_file", replacement_utf8: "must not follow renamed file" });
    try { renameSync(join(f.root, f.input.path), join(f.root, "renamed.ts")); await expect(f.files.commit(effect)).rejects.toThrow("workspace_preimage_changed");
      expect(readFileSync(join(f.root, "renamed.ts"), "utf8")).toBe("actual workspace\n");
    } finally { await f.files.discard(effect); }
  });
  it("leaves the original inode data unchanged when replacing its authorized pathname", async () => {
    const f = await setup(), fd = openSync(join(f.root, f.input.path), "r");
    try { const effect = await f.files.prepare({ ...f.input, tool: "replace_file", replacement_utf8: "replacement inode\n" });
      try { await f.files.commit(effect); expect(readFileSync(fd, "utf8")).toBe("actual workspace\n"); expect(readFileSync(join(f.root, f.input.path), "utf8")).toBe("replacement inode\n"); }
      finally { await f.files.discard(effect); }
    } finally { closeSync(fd); }
  });
  it("preserves a protected target DACL instead of inheriting broader staging permissions", async () => {
    const f = await setup(), path = join(f.root, f.input.path);
    const acl = (initialize: boolean) => JSON.parse(execFileSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", `
      $taskPath = $env:CIMILOOP_TEST_ACL_PATH
      ${initialize ? `$taskAcl = New-Object System.Security.AccessControl.FileSecurity
      $taskAcl.SetAccessRuleProtection($true, $false)
      foreach ($taskSid in @([System.Security.Principal.WindowsIdentity]::GetCurrent().User, (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')))) {
        $taskRule = New-Object System.Security.AccessControl.FileSystemAccessRule($taskSid, 'FullControl', 'Allow')
        $taskAcl.AddAccessRule($taskRule)
      }
      [System.IO.File]::SetAccessControl($taskPath, $taskAcl)` : ""}
      $taskAcl = [System.IO.File]::GetAccessControl($taskPath)
      @{ protected = $taskAcl.AreAccessRulesProtected; access = $taskAcl.GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::Access) } | ConvertTo-Json -Compress
    `], { windowsHide: true, encoding: "utf8", timeout: 10000, env: { ...process.env, CIMILOOP_TEST_ACL_PATH: path } }).trim()) as { protected: boolean; access: string };
    const before = acl(true), effect = await f.files.prepare({ ...f.input, tool: "replace_file", replacement_utf8: "permission-preserving replacement\n" });
    try { await f.files.commit(effect); expect(before.protected).toBe(true); expect(acl(false)).toEqual(before); }
    finally { await f.files.discard(effect); }
  });
  it.each(["hardlink", "junction", "changed_root", "wrong_digest", "invalid_utf8", "oversize"])("rejects %s before receiving a commit", async variant => {
    const f = await setup();
    if (variant === "hardlink") linkSync(join(f.root, f.input.path), join(f.root, "second.ts"));
    if (variant === "junction") { renameSync(join(f.root, "src"), join(f.root, "real-src")); symlinkSync(join(f.root, "real-src"), join(f.root, "src"), "junction"); }
    if (variant === "changed_root") { const moved = f.root + "-old"; renameSync(f.root, moved); roots.push(moved); mkdirSync(join(f.root, "src"), { recursive: true }); writeFileSync(join(f.root, f.input.path), "actual workspace\n"); }
    if (variant === "wrong_digest") f.input.expected_digest = "0".repeat(64);
    if (variant === "invalid_utf8") { writeFileSync(join(f.root, f.input.path), Buffer.from([0xff])); f.input.expected_digest = digest(Buffer.from([0xff])).value; }
    if (variant === "oversize") { writeFileSync(join(f.root, f.input.path), "x".repeat(16385)); f.input.expected_digest = digest("x".repeat(16385)).value; }
    await expect(f.files.prepare(f.input)).rejects.toThrow();
  });
  it.each(["../query.ts", "src/.git/config", "src/.cimiloop/private", "src/CON.txt", "src/q.ts:stream", "src\\query.ts", "src/*", "src/query.ts."])("rejects unbounded/metadata/device path %s", async path => {
    const f = await setup(); expect(() => parseWorkspaceToolInvocation({ ...f.input, path })).toThrow();
  });
  it("aborts a held native process without applying a replacement", async () => {
    const f = await setup(), abort = new AbortController(), effect = await f.files.prepare({ ...f.input, tool: "replace_file", replacement_utf8: "denied" }, abort.signal);
    abort.abort(); await expect(f.files.commit(effect)).rejects.toThrow(); expect(readFileSync(join(f.root, f.input.path), "utf8")).toBe("actual workspace\n");
  });
});
