import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, lstatSync, readFileSync, writeFileSync, renameSync, existsSync, openSync, fsyncSync, closeSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import type { Digest, ExternalReference } from "@cimiloop/protocol/v2";

export class RuntimeAdapterError extends Error {
  constructor(readonly reason: string) { super(reason); }
}
export const digest = (bytes: string | Uint8Array): Digest => ({ algorithm: "sha256", value: createHash("sha256").update(bytes).digest("hex") });
export const assertOrdinaryPath = (input: string): string => {
  const path = resolve(input);
  for (let current = path;; current = dirname(current)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new RuntimeAdapterError("linked_path_denied");
    if (dirname(current) === current) break;
  }
  return path;
};
export const directory = (path: string): string => {
  assertOrdinaryPath(path); mkdirSync(path, { recursive: true });
  if (!lstatSync(path).isDirectory()) throw new RuntimeAdapterError("directory_required");
  return resolve(path);
};
export const bytesAt = (path: string, maximum = 16 * 1024 * 1024): Buffer => {
  assertOrdinaryPath(path);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > maximum) throw new RuntimeAdapterError("ordinary_bounded_file_required");
  const bytes = readFileSync(path);
  if (bytes.length > maximum) throw new RuntimeAdapterError("file_too_large");
  return bytes;
};
export const readJson = (path: string): unknown => JSON.parse(bytesAt(path).toString("utf8"));
export const atomicJson = (path: string, value: unknown): void => {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(value), { flag: "wx" });
  const fd = openSync(temp, "r+"); try { fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, path);
};
export const rawReference = (root: string, bytes: Uint8Array, resourceType: string, version?: string): ExternalReference => {
  const contentDigest = digest(bytes);
  const path = join(directory(join(root, "blobs")), contentDigest.value);
  try { writeFileSync(path, bytes, { flag: "wx" }); }
  catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error; }
  if (digest(bytesAt(path)).value !== contentDigest.value) throw new RuntimeAdapterError("raw_content_corrupt");
  return { provider: "cimiloop-runtime-probe", resource_type: resourceType, locator: path, digest: contentDigest,
    ...(version ? { version } : {}) };
};
