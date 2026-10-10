import { execFileSync } from "node:child_process";
import {isDeepStrictEqual} from 'node:util';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { requestDigest, type RunVerifierPort } from "@cimiloop/kernel";
import { compileValidator, WorkspaceManifestSchema, type Project, type SourceSnapshot, type WorkspaceManifest, type WorkspaceSnapshot, type RunObservation } from "@cimiloop/protocol/v2";
import { LocalEvidenceVerifier } from "./evidence-local.js";
import { readWorkspaceToolRunFacts,resolveOriginalWorkspaceFileChain,bytesAt,digest as byteDigest,type readWorkspaceFileRunOriginals } from "@cimiloop/runtime-adapter";
import { LocalAgentRunResultVerifier } from "./agent-runtime-observation-local.js";

const digest = (value: unknown) => ({ algorithm: "sha256" as const, value: requestDigest(value) });
const bounded = (path: string) => !!path && !/[\\:%\x00-\x1f*?]/.test(path) && !path.startsWith("/") && path.split("/").every(p => !!p && p !== "." && p !== ".." && ![".git", ".cimiloop"].includes(p.toLowerCase()) && p === p.trim() && !p.endsWith(".") && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));
const contains = (allowed: string, path: string) => bounded(path) && (allowed === path || (allowed.endsWith("/**") && path.startsWith(allowed.slice(0, -2))));
export class LocalRunVerifier implements RunVerifierPort {
  readonly #admittedWorkspaces=new Map<string,WorkspaceManifest>();
  readonly content: LocalEvidenceVerifier;
  readonly agent: NonNullable<RunVerifierPort["agent"]>;
  readonly tools: NonNullable<RunVerifierPort["tools"]> = { facts: (project, record) => readWorkspaceToolRunFacts(this.dataDirectory, project, record) };
  constructor(readonly repositoryPath: string, readonly dataDirectory: string) {
    this.content = new LocalEvidenceVerifier(repositoryPath, dataDirectory);
    const results = new LocalAgentRunResultVerifier(repositoryPath, dataDirectory);
    this.agent = { admitContext: () => { throw new Error("Agent live admission unavailable"); },
      readRunResult: (project, record, context, reference, domain) => results.readRunResult(project, record, context, reference, domain) };
  }
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
  // Cache only independently validated immutable source metadata, not current
  // authority, permissions, workspace bytes, installation or qualification.
  // Every original content-addressed artifact is still read and hashed afresh.
  readAdmittedWorkspace(project:Project,snapshot:WorkspaceSnapshot):WorkspaceManifest {
    const key=requestDigest({project_id:project.id,repository_path:project.repository_path,snapshot}),cached=this.#admittedWorkspaces.get(key);
    if(!cached){const original=this.readWorkspace(project,snapshot);this.#admittedWorkspaces.set(key,structuredClone(original));return original;}
    if(resolve(project.repository_path)!==resolve(this.repositoryPath)||!isDeepStrictEqual(JSON.parse(this.content.readContent(snapshot.manifest_ref).toString('utf8')),cached))throw Error('Original admitted workspace changed');
    if(this.content.admittedSourceDigest(project,cached.head_commit_id).value!==cached.head_source_digest.value)throw Error('Original admitted source changed');
    this.content.readContent(cached.worktree_diff_ref);this.content.readContent(cached.index_diff_ref);
    for(const file of cached.files)if(file.state==='present')this.content.readContent(file.content_ref);
    return structuredClone(cached);
  }
  workspaceIsCurrent(project: Project, snapshot: WorkspaceSnapshot): boolean { const old = this.readWorkspace(project, snapshot); return digest(this.captureWorkspace(project, old.allowed_resources).manifest).value === snapshot.state_digest.value; }
  // Read-only whole original resource projection. Only independently verified
  // same-Run Native replacements may change content. Never capture a new base.
  modelWorkspace(project:Project,snapshot:WorkspaceSnapshot,calls:ReturnType<typeof readWorkspaceFileRunOriginals>["calls"],editable:string[],validated?:WorkspaceManifest) {
    const old=validated??this.readWorkspace(project,snapshot),present=old.files.filter(f=>f.state==='present');
    if(validated&&this.content.admittedSourceDigest(project,old.head_commit_id).value!==old.head_source_digest.value)throw Error('Original admitted source changed');
    if(!isDeepStrictEqual(JSON.parse(this.content.readContent(snapshot.manifest_ref).toString('utf8')),old)||requestDigest(old)!==snapshot.state_digest.value)throw Error('Original manifest changed');
    for(const file of present)this.content.readContent(file.content_ref);
    if(new Set(old.files.map(f=>f.path.toUpperCase())).size!==old.files.length)throw Error('Original workspace has ambiguous path casing');
    if(calls.some(call=>!present.some(f=>f.path.toUpperCase()===call.input.path.toUpperCase())))throw Error('Native call outside original workspace');
    const expected=resolveOriginalWorkspaceFileChain(present.map(f=>({path:f.path,expected_digest:f.content_ref.digest.value})),editable,calls);
    const projection=()=>{
      const status=this.#git(['status','--porcelain=v2','--branch','--untracked-files=all','-z']).toString('utf8').split('\0').filter(Boolean);
      if(!status.includes('# branch.oid '+old.head_commit_id)||!this.#git(['diff','--cached','--no-ext-diff','--no-textconv','--binary','--full-index','--no-renames','HEAD','--']).equals(this.content.readContent(old.index_diff_ref)))throw Error('Original commit or index changed');
      const dirty:string[]=[];
      for(const entry of status){if(entry.startsWith('# '))continue;if(entry.startsWith('? ')){dirty.push(entry.slice(2));continue;}const match=/^1 (\S+) (\S+) (\d+) (\d+) (\d+) (\S+) (\S+) (.+)$/.exec(entry);if(!match||match[3]!==match[4]||match[4]!==match[5])throw Error('Workspace mode, rename or type changed');dirty.push(match[8]!);}
      if(dirty.some(path=>!old.allowed_resources.some(r=>contains(r,path))))throw Error('Dirty files exceed original resources');
      const canonical=new Map(old.files.map(file=>[file.path.toUpperCase(),file.path])),paths=new Set(old.files.map(file=>file.path)),seen=new Map<string,{path:string;dev:string;ino:string}>();
      const walk=(path:string)=>{const full=this.#path(path);if(!existsSync(full)){paths.add(path);return;}const stat=lstatSync(full);if(stat.isDirectory()){for(const entry of readdirSync(full))walk(path+'/'+entry);}else if(stat.isFile()){const physical=lstatSync(full,{bigint:true}),key=path.toUpperCase(),prior=seen.get(key);if(prior&&prior.path!==path&&(prior.dev!==String(physical.dev)||prior.ino!==String(physical.ino)||process.platform!=='win32'))throw Error('Ambiguous physical workspace path');seen.set(key,{path,dev:String(physical.dev),ino:String(physical.ino)});paths.add(canonical.get(key)??path);}else throw Error('Unsupported workspace entry');if(paths.size>10000)throw Error('Workspace file limit');};
      for(const bound of old.allowed_resources)walk(bound.endsWith('/**')?bound.slice(0,-3):bound);
      for(const path of dirty)paths.add(canonical.get(path.toUpperCase())??path);
      const files=[...paths].sort().map(path=>{const full=this.#path(path);if(!existsSync(full))return {path,state:'deleted' as const};const stat=lstatSync(full);if(!stat.isFile()||stat.nlink!==1)throw Error('Ordinary unique file required');return{path,state:'present' as const,digest:byteDigest(bytesAt(full,8*1024*1024)).value};});
      if(files.length!==old.files.length||files.some(file=>{const original=old.files.find(f=>f.path===file.path);return!original||file.state!==original.state||file.state==='present'&&file.digest!==expected.sources.find(f=>f.path===file.path)?.digest;}))throw Error('Current workspace has no complete original Native chain');
      return files;
    };
    const current=projection();
    return {manifest_ref:snapshot.manifest_ref,current,original_file_calls:expected.original_file_calls};
  }
  readRunResult(project: Project, reference: RunObservation["raw_result_ref"]): unknown {
    if (resolve(project.repository_path) !== resolve(this.repositoryPath)) throw new Error("Project mismatch");
    return JSON.parse(this.content.readContent(reference).toString("utf8"));
  }
}
