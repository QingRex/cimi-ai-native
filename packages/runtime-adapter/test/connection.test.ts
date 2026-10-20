import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, it } from "vitest";
import { CredentialOutputGuard, validateModelConnection, readDedicatedApiKey, modelEndpoint, type DedicatedModelConnection } from "../src/connection.js";
import { digest } from "../src/files.js";
import { isolatedEnvironment } from "../src/native.js";

const base = (): DedicatedModelConnection => ({ format: "cimiloop/dedicated-model/1.0.0", provider: "zhipuai-coding-plan", model: "zhipuai-coding-plan/glm-5.3",
  credential_file: resolve("synthetic.dpapi.json"), credential_digest: digest("fixture") });
it("limits dedicated connections to fixed official endpoints and disallows plaintext keys, wrong models and extra configuration", () => {
  expect(modelEndpoint(validateModelConnection(base()))).toBe("https://open.bigmodel.cn/api/coding/paas/v4");
  expect(modelEndpoint(validateModelConnection({ ...base(), provider: "zhipuai", model: "zhipuai/glm-5.3" }))).toBe("https://open.bigmodel.cn/api/paas/v4");
  for (const input of [{ ...base(), apiKey: "SYNTHETIC-ONLY" }, { ...base(), baseURL: "https://untrusted.example" },
    { ...base(), model: "other/glm-5.3" }, { ...base(), model: "zhipuai-coding-plan/../../escape" }, { ...base(), credential_file: "relative.json" },
    { ...base(), credential_digest: { algorithm: "sha256", value: "wrong" } }, null]) expect(() => validateModelConnection(input)).toThrow("invalid_dedicated_model_connection");
  const openai = { ...base(), provider: "openai-compatible" as const, model: "openai-compatible/grok-4", endpoint: "https://api.x.ai/v1/chat/completions" };
  const go = { ...base(), provider: "openai-compatible" as const, model: "openai-compatible/deepseek-v4.1-flash", endpoint: "https://opencode.ai/inference/go/openai/v1/chat/completions" };
  expect(modelEndpoint(validateModelConnection(go))).toBe("https://opencode.ai/inference/go/openai/v1");
  expect(modelEndpoint(validateModelConnection(openai))).toBe("https://api.x.ai");
  for (const input of [openai, { ...openai, endpoint: "http://api.x.ai/v1/chat/completions" }, { ...openai, endpoint: "https://127.0.0.1/v1/chat/completions" },
    { ...openai, endpoint: "https://api.x.ai/v1/chat/completions?k=1" }, { ...openai, model: "openai-compatible/../grok" },
    { ...go, endpoint: "https://evil.example/inference/go/openai/v1/chat/completions" }, { ...go, endpoint: "https://opencode.ai/zen/go/v1/chat/completions" }])
    if (input !== openai) expect(() => validateModelConnection(input)).toThrow("invalid_dedicated_model_connection");
});
it("blocks every split of a credential across pipe chunks and preserves unrelated UTF-8 bytes", () => {
  const secret = "SYNTHETIC-AGENT-ONLY-KEY", original = Buffer.from(`中文 before ${secret} middle ${secret} after`);
  for (let boundary = 0; boundary <= original.length; boundary++) {
    const guard = new CredentialOutputGuard(secret), captured = Buffer.concat([guard.push(original.subarray(0, boundary)), guard.push(original.subarray(boundary)), guard.push(Buffer.alloc(0), true)]);
    expect(captured.toString()).toBe("中文 before [credential redacted] middle [credential redacted] after"); expect(guard.redacted).toBe(true);
  }
  const guard = new CredentialOutputGuard(secret), safe = Buffer.from("中文 normal output and SYNTHETIC-prefix-only");
  expect(Buffer.concat([...safe].map(byte => guard.push(Buffer.from([byte]))).concat(guard.push(Buffer.alloc(0), true)))).toEqual(safe);
  expect(guard.redacted).toBe(false);
});
it.runIf(process.platform === "win32")("decrypts a dedicated DPAPI credential and refuses changed ciphertext before starting a runtime", async () => {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-connection-test-")), key = "SYNTHETIC-ROUNDTRIP-ONLY";
  try {
    const script = `Add-Type -AssemblyName System.Security
$bytes = [Text.Encoding]::UTF8.GetBytes($env:CIMILOOP_FIXTURE_KEY)
$entropy = [Text.Encoding]::UTF8.GetBytes('CimiLoop runtime agent credential v1')
[Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)))`;
    const result = await promisify(execFile)(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
      { windowsHide: true, timeout: 10_000, env: { ...isolatedEnvironment(), CIMILOOP_FIXTURE_KEY: key } });
    const file = join(root, "credential.json"), bytes = Buffer.from(JSON.stringify({ format: "cimiloop/credential/dpapi/1.0.0", ciphertext: result.stdout.trim() }));
    expect(bytes.includes(Buffer.from(key))).toBe(false); writeFileSync(file, bytes);
    const connection = { ...base(), credential_file: file, credential_digest: digest(bytes) };
    expect(await readDedicatedApiKey(connection)).toBe(key);
    writeFileSync(file, "changed"); await expect(readDedicatedApiKey(connection)).rejects.toThrow("dedicated_credential_changed");
  } finally {
    const absolute = resolve(root); if (!absolute.startsWith(`${resolve(tmpdir())}${sep}cimiloop-connection-test-`)) throw new Error("Invalid cleanup target");
    rmSync(absolute, { recursive: true, force: true });
  }
}, 30_000);
