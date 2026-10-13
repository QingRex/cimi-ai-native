import { execFileSync } from "node:child_process";
import {isDeepStrictEqual} from 'node:util';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { requestDigest, type RunVerifierPort } from "@cimiloop/kernel";
import { compileValidator, WorkspaceManifestSchema, type Project, type SourceSnapshot, type WorkspaceManifest, type WorkspaceSnapshot, type RunObservation } from "@cimiloop/protocol/v2";
import { LocalEvidenceVerifier, type ContentReference } from "./evidence-local.js";
import { readWorkspaceToolRunFacts,resolveOriginalWorkspaceFileChain,bytesAt,digest as byteDigest,type readWorkspaceFileRunOriginals,type DedicatedAgentAccountLedger } from "@cimiloop/runtime-adapter";
import type{LocalAgentRunFamilyReader,LocalAgentRunFamilyVerification}from'./agent-run-family-costs-local.js';
import type {LocalAgentParentSkillResultPort} from './agent-parent-skill-results-local.js';
import { LocalAgentRunResultVerifier } from "./agent-runtime-observation-local.js";

const digest = (value: unknown) => ({ algorithm: "sha256" as const, value: requestDigest(value) });
const bounded = (path: string) => !!path && !/[\\:%\x00-\x1f*?]/.test(path) && !path.startsWith("/") && path.split("/").every(p => !!p && p !== "." && p !== ".." && ![".git", ".cimiloop"].includes(p.toLowerCase()) && p === p.trim() && !p.endsWith(".") && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));
const contains = (allowed: string, path: string) => bounded(path) && (allowed === path || (allowed.endsWith("/**") && path.startsWith(allowed.slice(0, -2))));
export interface OriginalParentCandidateMaterials {
  format:'cimiloop/original-parent-candidate-materials/1.0.0';
  workspace_manifest_ref:WorkspaceSnapshot['manifest_ref'];head_commit_id:string;
  files:{path:string;state:'present'|'deleted';original_ref:Extract<ContentReference,{resource_type:'workspace_file'}>|null;current_ref:Extract<ContentReference,{resource_type:'workspace_file'}>|null}[];
  worktree_diff_ref:WorkspaceManifest['worktree_diff_ref'];index_diff_ref:WorkspaceManifest['index_diff_ref'];
  artifact_refs:Extract<ContentReference,{resource_type:'provider_probe_artifact'}>[];
  parts:{artifact_ref:Extract<ContentReference,{resource_type:'provider_probe_artifact'}>;start_byte:number;end_byte:number;content_offset_bytes:number}[];
  stream_bytes:number;stream_digest:string;
  projection_digest:string;materials_digest:string;
}
export class LocalRunVerifier implements RunVerifierPort {
  readonly #admittedWorkspaces=new Map<string,WorkspaceManifest>();
  readonly content: LocalEvidenceVerifier;
  readonly agent: NonNullable<RunVerifierPort["agent"]>;
  readonly tools: NonNullable<RunVerifierPort["tools"]> = { facts: (project, record) => readWorkspaceToolRunFacts(this.dataDirectory, project, record) };
  constructor(readonly repositoryPath: string, readonly dataDirectory: string,accountForRun?:(runId:string)=>DedicatedAgentAccountLedger,familyReader?:LocalAgentRunFamilyReader,familySkills?:LocalAgentRunFamilyVerification,parentResults?:LocalAgentParentSkillResultPort) {
    this.content = new LocalEvidenceVerifier(repositoryPath, dataDirectory);
    const results = new LocalAgentRunResultVerifier(repositoryPath, dataDirectory,accountForRun,familyReader,familySkills,parentResults);
    this.agent = { admitContext: () => { throw new Error("Agent live admission unavailable"); },
      readRunResult: (project, record, context, reference, domain, writer) => results.readRunResult(project, record, context, reference, domain, writer) };
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
      for(const entry of status){if(entry.startsWith('# '))continue;if(entry.startsWith('? ')){dirty.push(entry.slice(2));continue;}const match=/^1 (\S+) (\S+) (\d+) (\d+) (\d+) (\S+) (\S+) (.+)$/.exec(entry);if(!match)throw Error('Workspace mode, rename or type changed');const originalDeletion=match[5]==='000000'&&old.files.some(file=>file.state==='deleted'&&file.path.toUpperCase()===match[8]!.toUpperCase());if(!originalDeletion&&(match[3]!==match[4]||match[4]!==match[5]))throw Error('Workspace mode, rename or type changed');dirty.push(match[8]!);}
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
  // The caller must independently verify the original same-Run Native ledgers.
  // This projection never re-admits a baseline or proves model/Skill custody.
  #encodeOriginalCandidateBasis(original:WorkspaceManifest,snapshot:WorkspaceSnapshot,projection:ReturnType<LocalRunVerifier['modelWorkspace']>,currentBytes:(file:ReturnType<LocalRunVerifier['modelWorkspace']>['current'][number])=>Buffer,diff:Buffer,index:Buffer) {
    const objects:{bytes:Buffer;ref:ContentReference}[]=[],keep=<T extends ContentReference['resource_type']>(bytes:Buffer,resource_type:T)=>{
      const hash=byteDigest(bytes),ref={provider:'local_content' as const,resource_type,locator:hash.value,digest:hash};objects.push({bytes:Buffer.from(bytes),ref:ref as ContentReference});return ref as Extract<ContentReference,{resource_type:T}>;
    };
    const sections=['CimiLoop complete original parent candidate, version 1','Original workspace: '+snapshot.manifest_ref.digest.value,'Original HEAD: '+original.head_commit_id,'Authorized resources: '+JSON.stringify(original.allowed_resources)];
    const utf8=(bytes:Buffer)=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
    const files:OriginalParentCandidateMaterials['files']=projection.current.map(file=>{
      const before=original.files.find(row=>row.path===file.path);if(!before)throw Error('Complete original candidate file missing');
      if(file.state==='deleted'){sections.push('FILE '+JSON.stringify(file.path)+' remains deleted');return{path:file.path,state:'deleted',original_ref:null,current_ref:null};}
      if(before.state!=='present')throw Error('Candidate cannot replace an original deletion');
      const old=this.content.readContent(before.content_ref),bytes=currentBytes(file);
      if(byteDigest(bytes).value!==file.digest)throw Error('Complete candidate changed during read');
      sections.push('FILE '+JSON.stringify(file.path),'ORIGINAL SHA256 '+before.content_ref.digest.value,utf8(old),'CURRENT SHA256 '+file.digest,utf8(bytes));
      return{path:file.path,state:'present',original_ref:structuredClone(before.content_ref),current_ref:keep(bytes,'workspace_file')};
    });

    if(!index.equals(this.content.readContent(original.index_diff_ref)))throw Error('Original candidate index changed');
    sections.push('COMPLETE WORKTREE DIFF',utf8(diff),'ORIGINAL INDEX DIFF',utf8(index));
    const text=sections.join('\n');if(!text.isWellFormed()||text.includes('\0'))throw Error('Complete candidate is not readable by the pinned SDK');
    // Keep every UTF-8 byte in ordered contiguous parts. Each part satisfies
    // the actual per-resource SDK bounds; no overall single-file ceiling.
    const chunks:string[]=[],stream=Buffer.from(text),stream_digest=byteDigest(stream).value;let pending='',bytes=0,lineCharacters=0,lineCount=1;
    for(const character of text){const length=Buffer.byteLength(character);if(pending&&(bytes+length>45*1024||character!=='\n'&&lineCharacters+character.length>1900||character==='\n'&&lineCount>=1900)){chunks.push(pending);pending='';bytes=0;lineCharacters=0;lineCount=1;}
      pending+=character;bytes+=length;if(character==='\n'){lineCharacters=0;lineCount++;}else lineCharacters+=character.length;
    }
    if(pending)chunks.push(pending);if(!chunks.length||chunks.length>64)throw Error('Complete candidate exceeds the original input artifact count');
    const worktree_diff_ref=keep(diff,'workspace_diff');let offset=0;
    const parts=chunks.map((content,i)=>{const payload=Buffer.from(content),start_byte=offset;offset+=payload.length;const header=Buffer.from('CimiLoop complete candidate material part '+(i+1)+'/'+chunks.length+'\nUTF-8 byte range: '+start_byte+'..'+offset+'\nComplete stream SHA256: '+stream_digest+'\nBEGIN ORIGINAL CONTENT\n'),encoded=Buffer.concat([header,payload]),lines=encoded.toString('utf8').split(/\r?\n/);if(encoded.length>50*1024||lines.length>2000||lines.some(line=>line.length>2000))throw Error('Complete candidate part exceeds pinned SDK read bounds');return{artifact_ref:keep(encoded,'provider_probe_artifact'),start_byte,end_byte:offset,content_offset_bytes:header.length};});
    if(offset!==stream.length)throw Error('Complete candidate byte coverage mismatch');
    const body={format:'cimiloop/original-parent-candidate-materials/1.0.0' as const,workspace_manifest_ref:structuredClone(snapshot.manifest_ref),head_commit_id:original.head_commit_id,files,worktree_diff_ref,index_diff_ref:structuredClone(original.index_diff_ref),artifact_refs:parts.map(part=>part.artifact_ref),parts,stream_bytes:stream.length,stream_digest,projection_digest:byteDigest(JSON.stringify(projection)).value};
    return{materials:{...body,materials_digest:byteDigest(JSON.stringify(body)).value},objects};
  }
  #originalCandidateBasis(project:Project,snapshot:WorkspaceSnapshot,calls:Parameters<LocalRunVerifier['modelWorkspace']>[2],editable:string[],validated?:WorkspaceManifest) {
    const original=validated??this.readWorkspace(project,snapshot),projection=this.modelWorkspace(project,snapshot,calls,editable,original),diff=this.#git(['diff','--no-ext-diff','--no-textconv','--binary','--full-index','--no-renames','HEAD','--']),index=this.#git(['diff','--cached','--no-ext-diff','--no-textconv','--binary','--full-index','--no-renames','HEAD','--']);
    return this.#encodeOriginalCandidateBasis(original,snapshot,projection,file=>bytesAt(this.#path(file.path),8*1024*1024),diff,index);
  }
  #historicalCandidateBasis(project:Project,snapshot:WorkspaceSnapshot,materials:OriginalParentCandidateMaterials,calls:Parameters<LocalRunVerifier['modelWorkspace']>[2],editable:string[]) {
    const original=this.readAdmittedWorkspace(project,snapshot),present=original.files.filter(row=>row.state==='present');
    if(new Set(original.files.map(row=>row.path.toUpperCase())).size!==original.files.length||calls.some(call=>!present.some(row=>row.path.toUpperCase()===call.input.path.toUpperCase())))throw Error('Historical candidate Native path mismatch');
    const chain=resolveOriginalWorkspaceFileChain(present.map(row=>({path:row.path,expected_digest:row.content_ref.digest.value})),editable,calls);
    const current=original.files.map(row=>row.state==='deleted'?{path:row.path,state:'deleted' as const}:{path:row.path,state:'present' as const,digest:chain.sources.find(source=>source.path===row.path)!.digest}).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
    const projection={manifest_ref:snapshot.manifest_ref,current,original_file_calls:chain.original_file_calls};
    return this.#encodeOriginalCandidateBasis(original,snapshot,projection,file=>{const row=materials.files.find(row=>row.path===file.path);if(!row?.current_ref)throw Error('Original historical candidate content missing');return this.content.readContent(row.current_ref);},this.content.readContent(materials.worktree_diff_ref),this.content.readContent(original.index_diff_ref));
  }
  captureOriginalCandidate(project:Project,snapshot:WorkspaceSnapshot,calls:Parameters<LocalRunVerifier['modelWorkspace']>[2],editable:string[],validated?:WorkspaceManifest):OriginalParentCandidateMaterials {
    const original=this.#originalCandidateBasis(project,snapshot,calls,editable,validated);
    for(const object of original.objects)if(!isDeepStrictEqual(this.content.storeContent(object.bytes,object.ref.resource_type),object.ref))throw Error('Original candidate content changed during save');
    if(!isDeepStrictEqual(this.#originalCandidateBasis(project,snapshot,calls,editable,validated),original))throw Error('Complete candidate changed during save');
    for(const object of original.objects)if(!this.content.readContent(object.ref).equals(object.bytes))throw Error('Saved complete candidate object lost during final source recheck');
    return structuredClone(original.materials);
  }
  // No storage, replacement, dispatch, transaction or live input refresh here.
  readOriginalCandidate(project:Project,snapshot:WorkspaceSnapshot,materials:OriginalParentCandidateMaterials,calls:Parameters<LocalRunVerifier['modelWorkspace']>[2],editable:string[],validated?:WorkspaceManifest):OriginalParentCandidateMaterials {
    const original=this.#originalCandidateBasis(project,snapshot,calls,editable,validated);
    if(!isDeepStrictEqual(materials,original.materials))throw Error('Saved complete original candidate mismatch');
    for(const object of original.objects)if(!this.content.readContent(object.ref).equals(object.bytes))throw Error('Saved complete candidate bytes changed');
    if(!isDeepStrictEqual(this.#originalCandidateBasis(project,snapshot,calls,editable,validated),original))throw Error('Complete candidate changed during verification');
    for(const object of original.objects)if(!this.content.readContent(object.ref).equals(object.bytes))throw Error('Original complete candidate object lost during final source recheck');
    return structuredClone(original.materials);
  }
  // Independently verified Native calls must be from the exact original IPC
  // cut. This re-reads immutable historical input, never today's workspace.
  // It grants neither current applicability nor execution/model authority.
  readHistoricalCandidate(project:Project,snapshot:WorkspaceSnapshot,materials:OriginalParentCandidateMaterials,calls:Parameters<LocalRunVerifier['modelWorkspace']>[2],editable:string[]):OriginalParentCandidateMaterials {
    const original=this.#historicalCandidateBasis(project,snapshot,materials,calls,editable);
    if(!isDeepStrictEqual(original.materials,materials))throw Error('Original historical candidate mismatch');
    for(const object of original.objects)if(!this.content.readContent(object.ref).equals(object.bytes))throw Error('Original historical candidate object changed');
    if(!isDeepStrictEqual(this.#historicalCandidateBasis(project,snapshot,materials,calls,editable),original))throw Error('Historical source changed during verification');
    for(const object of original.objects)if(!this.content.readContent(object.ref).equals(object.bytes))throw Error('Original historical candidate object lost during final recheck');
    return structuredClone(original.materials);
  }
  readRunResult(project: Project, reference: RunObservation["raw_result_ref"]): unknown {
    if (resolve(project.repository_path) !== resolve(this.repositoryPath)) throw new Error("Project mismatch");
    return JSON.parse(this.content.readContent(reference).toString("utf8"));
  }
}
