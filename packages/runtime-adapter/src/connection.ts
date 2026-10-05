import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isAbsolute, join } from "node:path";
import type { Digest } from "@cimiloop/protocol/v2";
import { bytesAt, digest, RuntimeAdapterError } from "./files.js";
import { isolatedEnvironment } from "./native.js";

export interface DedicatedModelConnection {
  format: "cimiloop/dedicated-model/1.0.0";
  provider: "zhipuai-coding-plan" | "zhipuai";
  model: string;
  credential_file: string;
  credential_digest: Digest;
}
export const validateModelConnection = (input: unknown): DedicatedModelConnection => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new RuntimeAdapterError("invalid_dedicated_model_connection");
  const config = input as DedicatedModelConnection;
  const hash = config.credential_digest;
  if (Object.keys(config).sort().join(",") !== "credential_digest,credential_file,format,model,provider" ||
    config.format !== "cimiloop/dedicated-model/1.0.0" || !["zhipuai", "zhipuai-coding-plan"].includes(config.provider) ||
    typeof config.model !== "string" || !config.model.startsWith(`${config.provider}/`) || !/^glm-[a-z0-9.-]+$/.test(config.model.slice(config.provider.length + 1)) ||
    typeof config.credential_file !== "string" || !isAbsolute(config.credential_file) || !hash || typeof hash !== "object" ||
    Object.keys(hash).sort().join(",") !== "algorithm,value" || hash.algorithm !== "sha256" || !/^[0-9a-f]{64}$/.test(hash.value)) throw new RuntimeAdapterError("invalid_dedicated_model_connection");
  return config;
};
export const loadModelConnection = (file: string): DedicatedModelConnection => {
  try { return validateModelConnection(JSON.parse(bytesAt(file, 16 * 1024).toString("utf8"))); }
  catch { throw new RuntimeAdapterError("invalid_dedicated_model_connection"); }
};
export const modelEndpoint = (connection: DedicatedModelConnection): string => connection.provider === "zhipuai-coding-plan"
  ? "https://open.bigmodel.cn/api/coding/paas/v4" : "https://open.bigmodel.cn/api/paas/v4";
const decryptScript = `Add-Type -AssemblyName System.Security
$cipher = [Convert]::FromBase64String($env:CIMILOOP_DPAPI_CIPHERTEXT)
$entropy = [Text.Encoding]::UTF8.GetBytes('CimiLoop runtime agent credential v1')
$plain = [Security.Cryptography.ProtectedData]::Unprotect($cipher, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Convert]::ToBase64String($plain))
[Array]::Clear($plain, 0, $plain.Length)`;
export const readDedicatedApiKey = async (connection: DedicatedModelConnection): Promise<string> => {
  validateModelConnection(connection);
  if (process.platform !== "win32") throw new RuntimeAdapterError("windows_dpapi_required");
  const bytes = bytesAt(connection.credential_file, 16 * 1024);
  if (digest(bytes).value !== connection.credential_digest.value) throw new RuntimeAdapterError("dedicated_credential_changed");
  let encrypted: { format: string; ciphertext: string };
  try {
    encrypted = JSON.parse(bytes.toString("utf8")) as typeof encrypted;
    if (Object.keys(encrypted).sort().join(",") !== "ciphertext,format" || encrypted.format !== "cimiloop/credential/dpapi/1.0.0" ||
      typeof encrypted.ciphertext !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(encrypted.ciphertext)) throw new Error();
  } catch { throw new RuntimeAdapterError("invalid_dedicated_credential"); }
  try {
    const shell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const result = await promisify(execFile)(shell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(decryptScript, "utf16le").toString("base64")],
      { windowsHide: true, timeout: 10_000, maxBuffer: 16 * 1024, encoding: "utf8", env: { ...isolatedEnvironment(), CIMILOOP_DPAPI_CIPHERTEXT: encrypted.ciphertext } });
    const key = Buffer.from(result.stdout.trim(), "base64").toString("utf8");
    if (!/^[a-zA-Z0-9._-]{8,512}$/.test(key)) throw new Error();
    return key;
  } catch { throw new RuntimeAdapterError("dedicated_credential_unavailable"); }
};

// Preserve bytes except an exact credential occurrence, including one split
// across pipe chunks. A redaction invalidates the observation; it is not raw proof.
export class CredentialOutputGuard {
  #pending = Buffer.alloc(0);
  readonly #secret: Buffer;
  redacted = false;
  constructor(secret: string) { this.#secret = Buffer.from(secret); if (!this.#secret.length) throw new Error("secret required"); }
  push(bytes: Buffer, finish = false): Buffer {
    this.#pending = Buffer.concat([this.#pending, bytes]);
    const safe = finish ? this.#pending.length : Math.max(0, this.#pending.length - this.#secret.length + 1);
    const output: Buffer[] = []; let position = 0;
    while (position < safe) {
      const found = this.#pending.indexOf(this.#secret, position);
      if (found >= 0 && found < safe) {
        output.push(this.#pending.subarray(position, found), Buffer.from("[credential redacted]"));
        position = found + this.#secret.length; this.redacted = true;
      } else { output.push(this.#pending.subarray(position, safe)); position = safe; }
    }
    this.#pending = this.#pending.subarray(position);
    return Buffer.concat(output);
  }
}
