import { execFileSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicJson, bytesAt, digest, directory, readJson } from "./files.js";

// NTFS records a write generation on the file. A later proof can read that
// generation again. The same generation means the sealed bytes were not
// written. A changed, missing, or unreadable generation is not a proof: the
// caller hashes. This process does not keep the generation across calls.
const floorBytes = 1024 * 1024;
let compiled: { path: string; digest: string } | undefined, compileFailed = false;

const helperEnvironment = (): NodeJS.ProcessEnv => {
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  return {
    SystemRoot: systemRoot, WINDIR: systemRoot, PATH: join(systemRoot, "System32"),
    TEMP: process.env.TEMP, TMP: process.env.TMP
  };
};

function helper(): { path: string; digest: string } | undefined {
  if (compileFailed || process.platform !== "win32") return undefined;
  try {
    if (compiled) {
      if (digest(bytesAt(compiled.path)).value !== compiled.digest) { compileFailed = true; return undefined; }
      return compiled;
    }
    const source = fileURLToPath(new URL("../native/FileWriteGeneration.cs", import.meta.url));
    const build = directory(join(tmpdir(), "cimiloop-file-write-generation-" + digest(bytesAt(source)).value));
    const binary = join(build, "FileWriteGeneration.exe"), metadata = join(build, "build.json");
    if (!existsSync(binary) || !existsSync(metadata)) {
      if (existsSync(binary) || existsSync(metadata)) { compileFailed = true; return undefined; }
      const compiler = resolve(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
      if (!existsSync(compiler)) { compileFailed = true; return undefined; }
      const candidate = join(build, randomUUID() + ".exe");
      execFileSync(compiler, ["/nologo", "/target:exe", "/out:" + candidate, source], { windowsHide: true, timeout: 30000, maxBuffer: 1048576, env: helperEnvironment() });
      renameSync(candidate, binary);
      atomicJson(metadata, { digest: digest(bytesAt(binary)).value });
    }
    const expected = (readJson(metadata) as { digest?: string }).digest;
    if (!expected || digest(bytesAt(binary)).value !== expected) { compileFailed = true; return undefined; }
    compiled = { path: binary, digest: expected };
    return compiled;
  } catch { compileFailed = true; return undefined; }
}

// One synchronous query for the large originals in a proof. Undefined means
// every caller must hash. A generation is never reused as an ALLOW decision.
export function readFileWriteGenerations(paths: readonly string[]): Map<string, string> | undefined {
  const wanted = [...new Set(paths.map(path => resolve(path)))].filter(path => path.length > 0);
  if (wanted.length === 0 || wanted.length > 128) return undefined;
  const current = helper();
  if (!current) return undefined;
  try {
    if (digest(bytesAt(current.path)).value !== current.digest) return undefined;
    const output = execFileSync(current.path, ["query"], {
      input: wanted.join("\n"), encoding: "utf8", windowsHide: true, timeout: 5000,
      maxBuffer: 65536, env: helperEnvironment(), stdio: ["pipe", "pipe", "pipe"]
    });
    const lines = output.split(/\n/).map(line => line.endsWith("\r") ? line.slice(0, -1) : line).filter((_line, index, all) => index < all.length - 1 || _line.length > 0);
    if (lines.length !== wanted.length) return undefined;
    const generations = new Map<string, string>();
    for (let index = 0; index < wanted.length; index++) {
      const match = /^(\d+)\t(\d+|none)$/.exec(lines[index] ?? "");
      if (!match || Number(match[1]) !== index) return undefined;
      if (match[2] !== "none") generations.set(wanted[index]!, match[2]!);
    }
    return generations;
  } catch { return undefined; }
}

export const retainedBinaryWriteGenerationFloor = floorBytes;
