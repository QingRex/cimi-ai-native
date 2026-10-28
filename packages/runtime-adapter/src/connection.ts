import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isIP } from "node:net";
import { isAbsolute, join } from "node:path";
import type { Digest } from "@cimiloop/protocol/v2";
import { bytesAt, digest, RuntimeAdapterError } from "./files.js";
import { isolatedEnvironment } from "./native.js";

export interface DedicatedModelConnection {
  format: "cimiloop/dedicated-model/1.0.0" | "cimiloop/dedicated-model/2.0.0";
  provider: "zhipuai-coding-plan" | "zhipuai" | "openai-compatible";
  model: string;
  credential_file: string;
  credential_digest: Digest;
  endpoint?: string;
  transport?: "loopback_http/1.0.0";
}
export const validDedicatedModelName=(value:unknown):value is string=>typeof value==='string'&&value.length<=255&&value.split('/').length<=4&&value.split('/').every(part=>/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(part));
export function parseLoopbackModelEndpoint(value:unknown):URL {
  try {const url=new URL(String(value));if(typeof value!=='string'||value!==url.href||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!/^\d+$/.test(url.port)||Number(url.port)<1024||url.username||url.password||url.search||url.hash||url.pathname!=='/v1/chat/completions')throw Error();return url;}
  catch {throw new RuntimeAdapterError('invalid_dedicated_model_connection');}
}
export const isLoopbackModelConnection=(value:DedicatedModelConnection)=>value.format==='cimiloop/dedicated-model/2.0.0'&&value.transport==='loopback_http/1.0.0';
export const validDedicatedApiKey=(connection:DedicatedModelConnection,key:unknown):key is string=>typeof key==='string'&&(isLoopbackModelConnection(connection)?/^[A-Za-z0-9._-]{1,512}$/:/^[A-Za-z0-9._-]{8,512}$/).test(key);
const credentialDigest = (hash: DedicatedModelConnection["credential_digest"]) => !!hash && typeof hash === "object" &&
  Object.keys(hash).sort().join(",") === "algorithm,value" && hash.algorithm === "sha256" && /^[0-9a-f]{64}$/.test(hash.value);
const modelSuffix = (provider: string, model: string) => model.startsWith(`${provider}/`) ? model.slice(provider.length + 1) : "";
export const validateModelConnection = (input: unknown): DedicatedModelConnection => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new RuntimeAdapterError("invalid_dedicated_model_connection");
  const config = input as DedicatedModelConnection;
  const keys = Object.keys(config).sort().join(","), openai = config.provider === "openai-compatible";
  if (!["cimiloop/dedicated-model/1.0.0","cimiloop/dedicated-model/2.0.0"].includes(config.format) || typeof config.model !== "string" || typeof config.credential_file !== "string" ||
    !isAbsolute(config.credential_file) || !credentialDigest(config.credential_digest) || !modelSuffix(config.provider, config.model)) throw new RuntimeAdapterError("invalid_dedicated_model_connection");
  if(config.format==='cimiloop/dedicated-model/2.0.0'){
    if(!openai||!isLoopbackModelConnection(config)||keys!=='credential_digest,credential_file,endpoint,format,model,provider,transport'||!validDedicatedModelName(modelSuffix(config.provider,config.model)))throw new RuntimeAdapterError('invalid_dedicated_model_connection');
    parseLoopbackModelEndpoint(config.endpoint);return config;
  }
  if (openai) {
    if (keys !== "credential_digest,credential_file,endpoint,format,model,provider" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(modelSuffix(config.provider, config.model))) throw new RuntimeAdapterError("invalid_dedicated_model_connection");
    let url: URL;
    try { url = new URL(String(config.endpoint)); } catch { throw new RuntimeAdapterError("invalid_dedicated_model_connection"); }
    const openCodeGo = url.hostname === "opencode.ai" && url.pathname === "/inference/go/openai/v1/chat/completions";
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.port !== "" && url.port !== "443") || (url.pathname !== "/v1/chat/completions" && !openCodeGo) ||
      isIP(url.hostname) || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(url.hostname)) throw new RuntimeAdapterError("invalid_dedicated_model_connection");
    return config;
  }
  if (keys !== "credential_digest,credential_file,format,model,provider" || !["zhipuai", "zhipuai-coding-plan"].includes(config.provider) ||
    !/^glm-[a-z0-9.-]+$/.test(modelSuffix(config.provider, config.model))) throw new RuntimeAdapterError("invalid_dedicated_model_connection");
  return config;
};
export const loadModelConnection = (file: string): DedicatedModelConnection => {
  try { return validateModelConnection(JSON.parse(bytesAt(file, 16 * 1024).toString("utf8"))); }
  catch { throw new RuntimeAdapterError("invalid_dedicated_model_connection"); }
};
export const modelEndpoint = (connection: DedicatedModelConnection): string => {
  const config = validateModelConnection(connection);
  // This projection is for the legacy credentialed Native driver. Local HTTP
  // must use the owned-socket Agent path and its original-request accounting.
  if (isLoopbackModelConnection(config)) throw new RuntimeAdapterError("loopback_connection_requires_managed_agent");
  if (config.provider === "openai-compatible") {
    const url = new URL(String(config.endpoint));
    return url.hostname === "opencode.ai" && url.pathname === "/inference/go/openai/v1/chat/completions" ? "https://opencode.ai/inference/go/openai/v1" : url.origin;
  }
  return config.provider === "zhipuai-coding-plan" ? "https://open.bigmodel.cn/api/coding/paas/v4" : "https://open.bigmodel.cn/api/paas/v4";
};
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
    if (!validDedicatedApiKey(connection,key)) throw new Error();
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
