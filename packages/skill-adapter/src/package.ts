import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parseDocument, visit, isAlias } from "yaml";
import { compileValidator, SkillImportSpecSchema, SkillPackageSchema, SkillMethodInputSchema, SkillMethodOutputSchema,
  ProviderRegistrationSchema, SkillPackageReferenceSchema, type SkillImportSpec, type SkillPackage, type SkillPackageReference,
  type ProviderRegistration, type ProviderDescriptor, type Digest, type SchemaReference, type SkillMethodInput, type SkillMethodOutput } from "@cimiloop/protocol/v2";

const MAX_FILE = 256 * 1024, MAX_COMMIT = 256 * 1024, MAX_FILES = 256, MAX_CONTENT = 2 * 1024 * 1024, MAX_PROOF = 512 * 1024, MAX_PACKAGE = 6 * 1024 * 1024;
const parseSpec = compileValidator<SkillImportSpec>(SkillImportSpecSchema);
const parsePackage = compileValidator<SkillPackage>(SkillPackageSchema);
const sha = (bytes: Uint8Array): Digest => ({ algorithm: "sha256", value: createHash("sha256").update(bytes).digest("hex") });
const utf8 = (bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const safePath = (path: string) => {
  if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path) || path.length > 240 || path.split("/").some(part =>
    [".", ".."].includes(part) || part.endsWith(".") || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) throw new Error("Non-portable skill path");
};
const decode = (value: string, maximum: number): Buffer => {
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > maximum || bytes.toString("base64") !== value) throw new Error("Invalid bounded base64");
  return bytes;
};
const objectId = (type: "commit" | "tree" | "blob", bytes: Uint8Array, oid: string) => {
  const hash = createHash(oid.length === 40 ? "sha1" : "sha256").update(`${type} ${bytes.length}\0`).update(bytes).digest("hex");
  if (hash !== oid) throw new Error("Git object identity mismatch");
};
type TreeEntry = { mode: string; name: string; oid: string };
const treeEntries = (bytes: Buffer, oidSize: number): TreeEntry[] => {
  const result: TreeEntry[] = []; let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(32, offset), end = bytes.indexOf(0, space + 1);
    if (space < offset || end <= space || end + 1 + oidSize > bytes.length) throw new Error("Malformed Git tree");
    const mode = bytes.subarray(offset, space).toString("ascii"), name = utf8(bytes.subarray(space + 1, end));
    if (name.includes("/") || name === "." || name === ".." || result.some(entry => entry.name === name)) throw new Error("Ambiguous Git tree");
    result.push({ mode, name, oid: bytes.subarray(end + 1, end + 1 + oidSize).toString("hex") }); offset = end + 1 + oidSize;
  }
  return result;
};
const validateGraph = (input: unknown): SkillImportSpec => {
  const spec = parseSpec(input); safePath(spec.entry_path); safePath(spec.license_path);
  const modules = new Map(spec.modules.map(module => [module.path, module]));
  if (modules.size !== spec.modules.length || !modules.has(spec.entry_path)) throw new Error("Unique entry module required");
  const folded = new Set<string>();
  for (const module of spec.modules) {
    safePath(module.path);
    if (folded.has(module.path.toLowerCase())) throw new Error("Case-colliding modules"); folded.add(module.path.toLowerCase());
    for (const other of spec.modules) if (other !== module && other.path.startsWith(`${module.path}/`)) throw new Error("Overlapping modules");
    for (const dependency of module.dependencies) if (!modules.has(dependency)) throw new Error("Unresolved skill dependency");
  }
  const active = new Set<string>(), reached = new Set<string>();
  const walk = (path: string) => {
    if (active.has(path)) throw new Error("Cyclic skill dependency"); if (reached.has(path)) return;
    active.add(path); for (const child of modules.get(path)!.dependencies) walk(child); active.delete(path); reached.add(path);
  };
  walk(spec.entry_path); if (reached.size !== modules.size) throw new Error("Unrelated modules are not an entry dependency closure");
  if (new Set(spec.provider_dependencies.map(dependency => dependency.descriptor_ref.id)).size !== spec.provider_dependencies.length) throw new Error("Duplicate Provider dependency identity");
  return spec;
};
export interface SkillModule {
  path: string; name: string; description: string; body: string; frontmatter: Record<string, unknown>;
}
export interface VerifiedSkillPackage { package: SkillPackage; source_digest: Digest; modules: SkillModule[] }
const metadata = (path: string, bytes: Uint8Array): SkillModule => {
  const source = utf8(bytes), match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source);
  if (!match || Buffer.byteLength(match[1]!) > 16 * 1024 || !match[2]!.trim()) throw new Error("Skill needs bounded YAML metadata and a body");
  const document = parseDocument(match[1]!, { strict: true, uniqueKeys: true, stringKeys: true, version: "1.2", prettyErrors: false });
  if (document.errors.length || document.warnings.length) throw new Error("Invalid skill YAML");
  visit(document, (_key, node) => { if (isAlias(node)) throw new Error("Skill YAML aliases are unsupported"); });
  const data = document.toJS({ maxAliasCount: 0 }) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Skill metadata must be a mapping");
  const fields = data as Record<string, unknown>;
  if (typeof fields.name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.name) || fields.name.length > 64 || fields.name !== basename(path) ||
    typeof fields.description !== "string" || !fields.description.trim() || fields.description.length > 1024) throw new Error("Invalid skill name or description");
  for (const [key, value] of Object.entries(fields)) {
    if (["__proto__", "constructor", "prototype"].includes(key) || key.length > 100) throw new Error("Unsafe metadata key");
    if (key === "metadata") {
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.entries(value).some(([name, item]) =>
        ["__proto__", "constructor", "prototype"].includes(name) || typeof item !== "string")) throw new Error("Metadata entries must be strings");
    } else if (typeof value !== "string" && typeof value !== "boolean" && !(Array.isArray(value) && value.every(item => typeof item === "string"))) throw new Error("Unsupported skill metadata value");
  }
  for (const key of ["license", "compatibility"] as const) if (fields[key] !== undefined && (typeof fields[key] !== "string" || !fields[key] || (key === "compatibility" && fields[key].length > 500))) throw new Error("Invalid optional metadata");
  return { path, name: fields.name, description: fields.description, body: match[2]!, frontmatter: fields };
};

// The portable package contains the Git objects needed to prove every selected
// file belongs to the exact commit. A locator or hash of copied text alone does not.
export const verifySkillPackageBytes = (input: Uint8Array, expected?: Digest): VerifiedSkillPackage => {
  if (input.length > MAX_PACKAGE) throw new Error("Skill package exceeds limit");
  const source_digest = sha(input); if (expected && (expected.algorithm !== "sha256" || expected.value !== source_digest.value)) throw new Error("Skill package digest mismatch");
  const pkg = parsePackage(JSON.parse(utf8(input))), spec = validateGraph(pkg.spec);
  const commit = decode(pkg.git_commit.content_base64, MAX_COMMIT);
  if (pkg.git_commit.oid !== spec.commit_id) throw new Error("Commit reference mismatch"); objectId("commit", commit, spec.commit_id);
  const root = /^tree ([0-9a-f]+)\n/.exec(utf8(commit))?.[1]; if (!root || root.length !== spec.commit_id.length) throw new Error("Commit tree missing");
  const trees = new Map<string, TreeEntry[]>(); let proofBytes = commit.length;
  for (const tree of pkg.git_trees) {
    if (tree.oid.length !== spec.commit_id.length || trees.has(tree.oid)) throw new Error("Duplicate or mixed-format Git tree");
    const bytes = decode(tree.content_base64, 128 * 1024); proofBytes += bytes.length; if (proofBytes > MAX_PROOF) throw new Error("Tree proof limit");
    objectId("tree", bytes, tree.oid); trees.set(tree.oid, treeEntries(bytes, spec.commit_id.length / 2));
  }
  const used = new Set<string>();
  const entries = (oid: string) => { used.add(oid); const value = trees.get(oid); if (!value) throw new Error("Missing Git tree proof"); return value; };
  const lookup = (path: string): TreeEntry => {
    const segments = path.split("/"); let tree = root;
    for (let index = 0; index < segments.length; index++) {
      const entry = entries(tree).find(item => item.name === segments[index]); if (!entry) throw new Error("Selected source missing in commit");
      if (index === segments.length - 1) return entry;
      if (entry.mode !== "40000") throw new Error("Source parent is not a directory"); tree = entry.oid;
    }
    throw new Error("Empty source path");
  };
  const expectedFiles = new Map<string, TreeEntry>();
  const collect = (oid: string, directory: string, depth: number) => {
    if (depth > 32) throw new Error("Skill directory depth limit");
    for (const entry of entries(oid)) {
      const path = `${directory}/${entry.name}`; safePath(path);
      if (entry.mode === "40000") collect(entry.oid, path, depth + 1);
      else if (["100644", "100755"].includes(entry.mode)) { expectedFiles.set(path, entry); if (expectedFiles.size > MAX_FILES) throw new Error("Skill file count limit"); }
      else throw new Error("Skill packages cannot contain symlinks or submodules");
    }
  };
  for (const module of spec.modules) { const entry = lookup(module.path); if (entry.mode !== "40000") throw new Error("Module is not a directory"); collect(entry.oid, module.path, 0); }
  const license = lookup(spec.license_path); if (!["100644", "100755"].includes(license.mode)) throw new Error("License must be an ordinary Git blob");
  expectedFiles.set(spec.license_path, license);
  if (expectedFiles.size !== pkg.files.length || used.size !== trees.size) throw new Error("Incomplete or unrelated package content");
  const decoded = new Map<string, Buffer>(), folded = new Set<string>(); let total = 0;
  for (const file of pkg.files) {
    safePath(file.path); const entry = expectedFiles.get(file.path);
    if (!entry || entry.oid !== file.git_oid || entry.mode !== file.mode || file.git_oid.length !== spec.commit_id.length || folded.has(file.path.toLowerCase())) throw new Error("Package file identity mismatch");
    folded.add(file.path.toLowerCase()); const bytes = decode(file.content_base64, MAX_FILE); total += bytes.length;
    if (total > MAX_CONTENT || file.bytes !== bytes.length || file.digest.value !== sha(bytes).value) throw new Error("Package file digest or size mismatch");
    objectId("blob", bytes, file.git_oid); decoded.set(file.path, bytes);
  }
  if (!utf8(decoded.get(spec.license_path)!).trim()) throw new Error("Empty package license");
  const modules = spec.modules.map(module => { const bytes = decoded.get(`${module.path}/SKILL.md`); if (!bytes) throw new Error("Module SKILL.md missing"); return metadata(module.path, bytes); });
  if (new Set(modules.map(module => module.name)).size !== modules.length) throw new Error("Ambiguous skill names");
  // Recognise explicit Skill-tool calls used by the selected Matt wrapper. This
  // supplements, and does not replace, the recorded semantic dependency review.
  for (const module of modules) for (const call of module.body.matchAll(/Skill tool with\s+["'`]([a-z0-9-]+)["'`]/g)) {
    const dependency = modules.find(value => value.name === call[1]);
    if (!dependency || !spec.modules.find(value => value.path === module.path)!.dependencies.includes(dependency.path)) throw new Error("Undeclared explicit Skill-tool dependency");
  }
  return { package: pkg, source_digest, modules };
};

export const packageGitSkill = (repository: string, input: unknown): VerifiedSkillPackage => {
  const spec = validateGraph(input), env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key]; env.GIT_NO_LAZY_FETCH = "1";
  const git = (...args: string[]) => execFileSync("git", ["--no-replace-objects", "--no-pager", "-C", repository, ...args],
    { env, encoding: "buffer", maxBuffer: MAX_CONTENT + MAX_PROOF, timeout: 30_000, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  if (git("cat-file", "-t", spec.commit_id).toString().trim() !== "commit") throw new Error("Exact Git commit required");
  const commitSize = Number(git("cat-file", "-s", spec.commit_id).toString().trim());
  if (!Number.isSafeInteger(commitSize) || commitSize < 0 || commitSize > MAX_COMMIT) throw new Error("Skill commit limit");
  const commit = git("cat-file", "commit", spec.commit_id), root = /^tree ([0-9a-f]+)\n/.exec(utf8(commit))?.[1]; if (!root) throw new Error("Commit tree missing");
  const proof = new Map<string, Buffer>(), files = new Map<string, TreeEntry>(); let proofBytes = commit.length;
  const tree = (oid: string) => {
    if (!proof.has(oid)) { const bytes = git("cat-file", "tree", oid); proofBytes += bytes.length; if (proof.size >= 128 || proofBytes > MAX_PROOF) throw new Error("Tree proof limit"); proof.set(oid, bytes); }
    return treeEntries(proof.get(oid)!, spec.commit_id.length / 2);
  };
  const lookup = (path: string): TreeEntry => {
    let oid = root; const segments = path.split("/");
    for (let index = 0; index < segments.length; index++) {
      const entry = tree(oid).find(value => value.name === segments[index]); if (!entry) throw new Error("Source missing in exact commit");
      if (index === segments.length - 1) return entry;
      if (entry.mode !== "40000") throw new Error("Source parent is not a tree"); oid = entry.oid;
    }
    throw new Error("Empty source path");
  };
  const collect = (oid: string, directory: string, depth: number) => {
    if (depth > 32) throw new Error("Skill directory depth limit");
    for (const entry of tree(oid)) {
      const path = `${directory}/${entry.name}`; safePath(path);
      if (entry.mode === "40000") collect(entry.oid, path, depth + 1);
      else if (["100644", "100755"].includes(entry.mode)) { files.set(path, entry); if (files.size > MAX_FILES) throw new Error("Skill file count limit"); }
      else throw new Error("Linked or submodule skill source");
    }
  };
  for (const module of spec.modules) { const entry = lookup(module.path); if (entry.mode !== "40000") throw new Error("Module source must be a tree"); collect(entry.oid, module.path, 0); }
  files.set(spec.license_path, lookup(spec.license_path)); let total = 0;
  const pkg: SkillPackage = { format: "cimiloop/skill-package/1.0.0", spec, git_commit: { oid: spec.commit_id, content_base64: commit.toString("base64") },
    git_trees: [...proof].sort(([a], [b]) => a.localeCompare(b)).map(([oid, bytes]) => ({ oid, content_base64: bytes.toString("base64") })),
    files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, entry]) => {
      if (!["100644", "100755"].includes(entry.mode)) throw new Error("Non-blob license");
      const size = Number(git("cat-file", "-s", entry.oid).toString().trim()); if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE || total + size > MAX_CONTENT) throw new Error("Skill content limit");
      const bytes = git("cat-file", "blob", entry.oid); total += bytes.length;
      return { path, git_oid: entry.oid, mode: entry.mode as "100644" | "100755", bytes: bytes.length, digest: sha(bytes), content_base64: bytes.toString("base64") };
    }) };
  return verifySkillPackageBytes(Buffer.from(JSON.stringify(pkg)));
};

export const skillRegistration = (verified: VerifiedSkillPackage, ref: SkillPackageReference, input: SchemaReference, output: SchemaReference): ProviderRegistration => {
  if (ref.provider !== "local_content" || ref.resource_type !== "skill_package" || ref.locator !== ref.digest.value || ref.digest.algorithm !== "sha256" || ref.digest.value !== verified.source_digest.value || input.schema_id !== "SkillMethodInput" || output.schema_id !== "SkillMethodOutput") throw new Error("Skill registration source or schema mismatch");
  const spec = verified.package.spec;
  return compileValidator<ProviderRegistration>(ProviderRegistrationSchema)({ provider_kind: "skill", name: spec.name, version: spec.version,
    source_ref: { ...ref, version: spec.commit_id }, capabilities: spec.capabilities, dependencies: spec.provider_dependencies,
    required_permissions: spec.required_permissions, input_schema_ref: input, output_schema_ref: output });
};
export const assertSkillDescriptor = (verified: VerifiedSkillPackage, descriptor: ProviderDescriptor): void => {
  const { version, ...raw } = descriptor.source_ref;
  const ref = compileValidator<SkillPackageReference>(SkillPackageReferenceSchema)(raw);
  const expected = skillRegistration(verified, ref, descriptor.input_schema_ref, descriptor.output_schema_ref);
  if (version !== verified.package.spec.commit_id || !isDeepStrictEqual(expected, Object.fromEntries(Object.keys(expected).map(key => [key, descriptor[key as keyof ProviderDescriptor]])))) throw new Error("Skill descriptor does not match its fixed package");
};

const methodInput = compileValidator<SkillMethodInput>(SkillMethodInputSchema), methodOutput = compileValidator<SkillMethodOutput>(SkillMethodOutputSchema);
const boundedMethodValue = (value: unknown, maximum: number) => {
  const json = JSON.stringify(value);
  if (typeof json !== "string" || Buffer.byteLength(json) > maximum) throw new Error("Skill method byte limit");
  return value;
};
export const parseSkillMethodInput = (value: unknown): SkillMethodInput => methodInput(boundedMethodValue(value, 384 * 1024));
export const parseSkillMethodOutput = (input: unknown, value: unknown): SkillMethodOutput => {
  const request = parseSkillMethodInput(input), result = methodOutput(boundedMethodValue(value, 1024 * 1024));
  if (result.purpose !== request.purpose) throw new Error("Skill output purpose mismatch");
  return result;
};
