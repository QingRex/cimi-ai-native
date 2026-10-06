import { Type, type Static } from "typebox";
import { DigestSchema, ExternalReferenceSchema, SemanticVersionSchema } from "./common.js";
import { CapabilityReferenceSchema, PermissionSetSchema, ProviderDependencySchema, ProviderDescriptorSchema } from "./providers.js";
import { ContractBodySchema } from "./intent.js";

const strict = { additionalProperties: false } as const;
const path = Type.String({ minLength: 1, maxLength: 240, pattern: "^[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*$" });
const oid = Type.String({ pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" });
const text = Type.String({ minLength: 1, maxLength: 4000 });
const module = Type.Object({ path, dependencies: Type.Array(path, { uniqueItems: true, maxItems: 32 }) }, strict);
export const SkillImportSpecSchema = Type.Object({
  format: Type.Literal("cimiloop/skill-import/1.0.0"),
  repository_url: Type.String({ pattern: "^https://[A-Za-z0-9.-]+/[A-Za-z0-9_./-]+$", maxLength: 500 }),
  commit_id: oid, entry_path: path, license_path: path,
  name: Type.String({ minLength: 1, maxLength: 200 }), version: SemanticVersionSchema,
  modules: Type.Array(module, { minItems: 1, maxItems: 32 }),
  capabilities: Type.Array(CapabilityReferenceSchema, { minItems: 1, maxItems: 16, uniqueItems: true }),
  provider_dependencies: Type.Array(ProviderDependencySchema, { maxItems: 32, uniqueItems: true }),
  required_permissions: PermissionSetSchema,
  harness_requirements: Type.Array(Type.String({ pattern: "^[a-z][a-z0-9_]*$", maxLength: 100 }), { maxItems: 32, uniqueItems: true }),
  dependency_review: text
}, strict);
export type SkillImportSpec = Static<typeof SkillImportSpecSchema>;
const object = Type.Object({ oid, content_base64: Type.String({ maxLength: 350000 }) }, strict);
export const SkillPackageSchema = Type.Object({
  format: Type.Literal("cimiloop/skill-package/1.0.0"), spec: SkillImportSpecSchema,
  git_commit: object, git_trees: Type.Array(object, { minItems: 1, maxItems: 128 }),
  files: Type.Array(Type.Object({ path, git_oid: oid, mode: Type.Union([Type.Literal("100644"), Type.Literal("100755")]),
    bytes: Type.Integer({ minimum: 0, maximum: 262144 }), digest: DigestSchema,
    content_base64: Type.String({ maxLength: 350000 }) }, strict), { minItems: 2, maxItems: 256 })
}, strict);
export type SkillPackage = Static<typeof SkillPackageSchema>;
export const SkillPackageReferenceSchema = Type.Object({ provider: Type.Literal("local_content"), resource_type: Type.Literal("skill_package"),
  locator: Type.String({ pattern: "^[0-9a-f]{64}$" }), digest: DigestSchema }, strict);
export type SkillPackageReference = Static<typeof SkillPackageReferenceSchema>;
export const SkillPackageInspectionResultSchema = Type.Object({
  schema_version: Type.Literal("2.0.0"), ok: Type.Literal(true), descriptor: ProviderDescriptorSchema,
  package_ref: SkillPackageReferenceSchema, spec: SkillImportSpecSchema,
  modules: Type.Array(Type.Object({ path, name: Type.String({ minLength: 1, maxLength: 64 }),
    description: Type.String({ minLength: 1, maxLength: 1024 }), dependencies: Type.Array(path, { uniqueItems: true }) }, strict), { minItems: 1, maxItems: 32 }),
  file_count: Type.Integer({ minimum: 2, maximum: 256 }), content_bytes: Type.Integer({ minimum: 0, maximum: 2097152 }),
  admission: Type.Literal("candidate_package_only")
}, strict);
export type SkillPackageInspectionResult = Static<typeof SkillPackageInspectionResultSchema>;

// A method result can only propose content. It carries no Decision, Task status or Gate.
export const SkillMethodInputSchema = Type.Union([
  Type.Object({ purpose: Type.Literal("clarification"), requirement: text, background: text,
    constraints: Type.Array(text, { maxItems: 64, uniqueItems: true }) }, strict),
  Type.Object({ purpose: Type.Literal("review"), goal: text, spec: text, standards: text,
    artifact_refs: Type.Array(ExternalReferenceSchema, { minItems: 1, maxItems: 64, uniqueItems: true }) }, strict)
]);
export const SkillMethodOutputSchema = Type.Union([
  Type.Object({ purpose: Type.Literal("clarification"), questions: Type.Array(text, { maxItems: 64, uniqueItems: true }),
    candidate: Type.Optional(ContractBodySchema), unresolved: Type.Array(text, { maxItems: 64, uniqueItems: true }) }, strict),
  Type.Object({ purpose: Type.Literal("review"), findings: Type.Array(Type.Object({
    axis: Type.Union([Type.Literal("spec"), Type.Literal("standards"), Type.Literal("verification")]),
    severity: Type.Union([Type.Literal("blocking"), Type.Literal("non_blocking"), Type.Literal("uncertain")]),
    observation: text, basis_refs: Type.Array(ExternalReferenceSchema, { minItems: 1, maxItems: 16, uniqueItems: true })
  }, strict), { maxItems: 128 }), limitations: Type.Array(text, { maxItems: 64, uniqueItems: true }) }, strict)
]);
export type SkillMethodInput = Static<typeof SkillMethodInputSchema>;
export type SkillMethodOutput = Static<typeof SkillMethodOutputSchema>;
