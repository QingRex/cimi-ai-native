import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { requestDigest, type RunVerifierPort } from "@cimiloop/kernel";
import { compileValidator, WorkspaceManifestSchema, type Project, type SourceSnapshot, type WorkspaceManifest, type WorkspaceSnapshot, type RunObservation } from "@cimiloop/protocol/v2";
import { LocalEvidenceVerifier } from "./evidence-local.js";

const digest = (value: unknown) => ({ algorithm: "sha256" as const, value: requestDigest(value) });
const bounded = (path: string) => !!path && !/[\\:%\x00-\x1f*?]/.test(path) && !path.startsWith("/") && path.split("/").every(p => !!p && p !== "." && p !== ".." && ![".git", ".cimiloop"].includes(p.toLowerCase()) && p === p.trim() && !p.endsWith(".") && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));
const contains = (allowed: string, path: string) => bounded(path) && (allowed === path || (allowed.endsWith("/**") && path.startsWith(allowed.slice(0, -2))));
export class LocalRunVerifier implements RunVerifierPort {
  readonly content: LocalEvidenceVerifier;
  constructor(readonly repositoryPath: string, readonly dataDirectory: string) { this.content = new LocalEvidenceVerifier(repositoryPath, dataDirectory); }
  sourceDigest(project: Project, commitId: string) { return this.content.sourceDigest(project, commitId); }
  sourceIsCurrent(project: Project, snapshot: SourceSnapshot) { return this.content.sourceIsCurrent(project, snapshot); }
  #git(args: string[]): Buffer {
    const env = { ...process.env }; for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
    return execFileSync("git", ["--no-replace-objects", "-C", this.repositoryPath, ...args], { encoding: "buffer", env, windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 30_000, stdio: ["pipe", "pipe", "pipe"] });
  }
  #path(path: string): string {
    if (!bounded(path)) throw new Error("Unbounded workspace path");
    const root = realpathSync(this.repositoryPath), full = resolve(root, ...path.split("/"));
    if (relative(root, full).startsWith("..") || relative(root, full).split(sep).includes(".git")) throw new Error("Workspace escape");
    let current = root;
    for (const part of path.split("/")) { current = resolve(current, part); if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("Workspace symlinks are unsupported"); }
    return full;
  }
  #manifest(project: Project, allowedResources: string[]): WorkspaceManifest {
    if (resolve(project.repository_path) !== resolve(this.repositoryPath) || allowedResources.some(r => !bounded(r.endsWith("/**") ? r.slice(0, -3) : r))) throw new Error("Project or resource mismatch");
    const head = this.#git(["rev-parse", "HEAD"]).toString().trim(), source = this.sourceDigest(project, head);
    const names = (args: string[]) => this.#git(args).toString("utf8").split("\0").filter(Boolean);
    const dirty = [...names(["diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", "HEAD", "--"]), ...names(["ls-files", "--others", "--exclude-standard", "-z"])];
    if (dirty.some(p => !allowedResources.some(r => contains(r, p)))) throw new Error("Dirty files exceed authorized resources");
    const paths = new Set(names(["ls-files", "-z"]).filter(p => allowedResources.some(r => contains(r, p))));
    const walk = (path: string) => {
      const full = this.#path(path);
      if (!existsSync(full)) { paths.add(path); return; }
      const stat = lstatSync(full);
      if (stat.isDirectory()) { for (const entry of readdirSync(full)) walk(path + "/" + entry); }
      else if (stat.isFile()) paths.add(path); else throw new Error("Unsupported workspace entry");
      if (paths.size > 10_000) throw new Error("Workspace has too many files");
    };
    for (const allowed of allowedResources) walk(allowed.endsWith("/**") ? allowed.slice(0, -3) : allowed);
    for (const path of dirty) paths.add(path);
    let total = 0;
    const files: WorkspaceManifest["files"] = [...paths].sort().filter(path => allowedResources.some(r => contains(r, path))).map(path => {
      const full = this.#path(path); if (!existsSync(full)) return { path, state: "deleted" as const };
      const stat = lstatSync(full); if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error("Expected file of at most 8 MiB");
      const bytes = readFileSync(full); total += bytes.length; if (total > 64 * 1024 * 1024) throw new Error("Workspace exceeds 64 MiB");
      return { path, state: "present" as const, content_ref: this.content.storeContent(bytes, "workspace_file") };
    });
    return { format: "cimiloop/workspace/1.0.0", project_id: project.id, head_commit_id: head, head_source_digest: source, allowed_resources: allowedResources,
      worktree_diff_ref: this.content.storeContent(this.#git(["diff", "--no-ext-diff", "--no-textconv", "--binary", "--full-index", "--no-renames", "HEAD", "--"]), "workspace_diff"),
      index_diff_ref: this.content.storeContent(this.#git(["diff", "--cached", "--no-ext-diff", "--no-textconv", "--binary", "--full-index", "--no-renames", "HEAD", "--"]), "workspace_diff"), files };
  }
  captureWorkspace(project: Project, allowedResources: string[]) {
    const manifest = this.#manifest(project, allowedResources);
    if (digest(manifest).value !== digest(this.#manifest(project, allowedResources)).value) throw new Error("Workspace changed during capture");
    const manifest_ref = this.content.storeContent(Buffer.from(JSON.stringify(manifest)), "workspace_manifest"); return { manifest, manifest_ref };
  }
  readWorkspace(project: Project, snapshot: WorkspaceSnapshot): WorkspaceManifest {
    if (snapshot.project_id !== project.id || resolve(project.repository_path) !== resolve(this.repositoryPath)) throw new Error("Workspace project mismatch");
    const manifest = compileValidator<WorkspaceManifest>(WorkspaceManifestSchema)(JSON.parse(this.content.readContent(snapshot.manifest_ref).toString("utf8")));
    if (manifest.project_id !== project.id || manifest.head_commit_id !== snapshot.head_commit_id || digest(manifest).value !== snapshot.state_digest.value ||
      snapshot.state_digest.algorithm !== "sha256" || this.sourceDigest(project, manifest.head_commit_id).value !== manifest.head_source_digest.value ||
      new Set(manifest.files.map(f => f.path)).size !== manifest.files.length || manifest.files.some(f => !manifest.allowed_resources.some(r => contains(r, f.path)))) throw new Error("Workspace manifest mismatch");
    this.content.readContent(manifest.worktree_diff_ref); this.content.readContent(manifest.index_diff_ref);
    for (const file of manifest.files) if (file.state === "present") this.content.readContent(file.content_ref);
    return manifest;
  }
  workspaceIsCurrent(project: Project, snapshot: WorkspaceSnapshot): boolean { const old = this.readWorkspace(project, snapshot); return digest(this.captureWorkspace(project, old.allowed_resources).manifest).value === snapshot.state_digest.value; }
  readRunResult(project: Project, reference: RunObservation["raw_result_ref"]): unknown {
    if (resolve(project.repository_path) !== resolve(this.repositoryPath)) throw new Error("Project mismatch");
    return JSON.parse(this.content.readContent(reference).toString("utf8"));
  }
}
