import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { EvidenceVerifierPort } from "@cimiloop/kernel";
import type { Digest, Evidence, Project, SourceSnapshot, Decision, RunObservation, WorkspaceManifest, WorkspaceSnapshot, ProviderProbeReference, ProviderArtifactReference, SkillPackageReference } from "@cimiloop/protocol/v2";
type RawReference = Evidence["raw_result_ref"] | NonNullable<Decision["review"]>["raw_result_ref"];
export type ContentReference = RawReference | RunObservation["raw_result_ref"] | WorkspaceSnapshot["manifest_ref"] | WorkspaceManifest["worktree_diff_ref"] | Extract<WorkspaceManifest["files"][number], { state: "present" }>["content_ref"] | ProviderProbeReference | ProviderArtifactReference | SkillPackageReference;

const digest = (bytes: Buffer): Digest => ({ algorithm: "sha256", value: createHash("sha256").update(bytes).digest("hex") });
const safeOid = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const limit = 64 * 1024 * 1024;
export class LocalEvidenceVerifier implements EvidenceVerifierPort {
  constructor(readonly repositoryPath: string, readonly dataDirectory: string) {}
  #git(args: string[], input?: Buffer): Buffer {
    const env = { ...process.env }; for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
    return execFileSync("git", ["--no-replace-objects", "-C", this.repositoryPath, ...args], { encoding: "buffer", input, env, windowsHide: true, maxBuffer: limit, timeout: 30_000, stdio: ["pipe", "pipe", "pipe"] });
  }
  #project(project: Project): void {
    if (resolve(project.repository_path) !== resolve(this.repositoryPath) || project.repository_kind !== "git") throw new Error("Evidence requires the bound Git repository");
    if (resolve(this.#git(["rev-parse", "--show-toplevel"]).toString().trim()) !== resolve(this.repositoryPath)) throw new Error("Git root mismatch");
  }
  sourceDigest(project: Project, commitId: string): Digest {
    this.#project(project); if (!safeOid.test(commitId) || this.#git(["cat-file", "-t", commitId]).toString().trim() !== "commit") throw new Error("Exact commit required");
    const commit = this.#git(["cat-file", "commit", commitId]), tree = this.#git(["ls-tree", "-r", "-t", "-z", "--full-tree", commitId]);
    const algorithm = commitId.length === 40 ? "sha1" : "sha256";
    if (createHash(algorithm).update(`commit ${commit.length}\0`).update(commit).digest("hex") !== commitId) throw new Error("Git commit identity mismatch");
    const entries = tree.toString().split("\0").filter(Boolean);
    const rootTree = /^tree ([0-9a-f]{40}|[0-9a-f]{64})\n/.exec(commit.toString()); if (!rootTree) throw new Error("Commit tree missing");
    const identities = [{ type: "tree", oid: rootTree[1]! }, ...entries.map(entry => { const match = /^(\d+) (blob|tree) ([0-9a-f]{40}|[0-9a-f]{64})\t/.exec(entry); if (!match) throw new Error("Submodules require a separate fixed source snapshot"); return { type: match[2]!, oid: match[3]! }; })];
    const objects = this.#git(["cat-file", "--batch"], Buffer.from(identities.map(item => item.oid).join("\n") + "\n"));
    let offset = 0;
    for (const identity of identities) {
      const end = objects.indexOf(10, offset), header = objects.subarray(offset, end).toString(), match = /^([0-9a-f]+) (blob|tree) (\d+)$/.exec(header);
      if (end < offset || match?.[1] !== identity.oid || match[2] !== identity.type || !Number.isSafeInteger(Number(match[3])) || Number(match[3]) > limit) throw new Error("Source object missing");
      const size = Number(match[3]), body = objects.subarray(end + 1, end + 1 + size);
      if (createHash(algorithm).update(`${identity.type} ${size}\0`).update(body).digest("hex") !== identity.oid) throw new Error("Git object identity mismatch");
      offset = end + 1 + size; if (offset >= objects.length || objects[offset] !== 10) throw new Error("Source object truncated"); offset++;
    }
    if (offset !== objects.length) throw new Error("Unexpected source output");
    return digest(Buffer.concat([commit, Buffer.from("\0"), tree, Buffer.from("\0"), objects]));
  }
  sourceIsCurrent(project: Project, snapshot: SourceSnapshot): boolean {
    this.#project(project);
    return this.#git(["rev-parse", "HEAD"]).toString().trim() === snapshot.commit_id && this.#git(["status", "--porcelain=v1", "--untracked-files=all"]).length === 0 && this.sourceDigest(project, snapshot.commit_id).value === snapshot.source_digest.value;
  }
  #objects(create = false): string {
    const root = resolve(this.dataDirectory), objects = join(root, "objects");
    if (!existsSync(root) || lstatSync(root).isSymbolicLink()) throw new Error("Unsafe data directory");
    if (!existsSync(objects) && create) mkdirSync(objects);
    if (lstatSync(objects).isSymbolicLink() || realpathSync(objects).toLowerCase() !== join(realpathSync(root), "objects").toLowerCase()) throw new Error("Unsafe evidence directory");
    return objects;
  }
  importRawResult(path: string): Evidence["raw_result_ref"];
  importRawResult(path: string, resourceType: "manual_review"): NonNullable<Decision["review"]>["raw_result_ref"];
  importRawResult(path: string, resourceType: "manual_run"): RunObservation["raw_result_ref"];
  importRawResult(path: string, resourceType: ContentReference["resource_type"] = "manual_evidence"): ContentReference {
    const stat = statSync(path); if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error("Expected report file of at most 8 MiB");
    return this.storeContent(readFileSync(path), resourceType);
  }
  storeContent<T extends ContentReference["resource_type"]>(bytes: Buffer, resourceType: T): Extract<ContentReference, { resource_type: T }> {
    if (bytes.length > 8 * 1024 * 1024) throw new Error("Content exceeds 8 MiB");
    const hash = digest(bytes), file = join(this.#objects(true), hash.value);
    try { writeFileSync(file, bytes, { flag: "wx" }); }
    catch (error) { if (!existsSync(file)) throw error; }
    const ref = { provider: "local_content" as const, resource_type: resourceType, locator: hash.value, digest: hash };
    this.readContent(ref as ContentReference); return ref as Extract<ContentReference, { resource_type: T }>;
  }
  readContent(ref: ContentReference): Buffer {
    if (!/^[0-9a-f]{64}$/.test(ref.locator) || ref.digest.value !== ref.locator || ref.digest.algorithm !== "sha256" || ref.provider !== "local_content" || !["manual_evidence", "manual_review", "manual_run", "workspace_manifest", "workspace_file", "workspace_diff", "provider_probe_snapshot", "provider_probe_artifact", "skill_package"].includes(ref.resource_type)) throw new Error("Unsupported raw result reference");
    const objects = this.#objects(), file = join(objects, ref.locator), stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024 || realpathSync(file).toLowerCase() !== join(realpathSync(objects), ref.locator).toLowerCase()) throw new Error("Unsafe raw result path");
    const descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try { const bytes = readFileSync(descriptor); if (digest(bytes).value !== ref.digest.value) throw new Error("Raw result digest mismatch"); return bytes; }
    finally { closeSync(descriptor); }
  }
  readRawResult(project: Project, ref: RawReference): unknown {
    if (resolve(project.repository_path) !== resolve(this.repositoryPath)) throw new Error("Project mismatch");
    return JSON.parse(this.readContent(ref).toString("utf8"));
  }
}
