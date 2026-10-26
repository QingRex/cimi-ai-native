import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { verifySkillPackageBytes, assertSkillDescriptor } from "@cimiloop/skill-adapter";
import { parseSkillMethodInput } from "@cimiloop/skill-adapter";
import { validateOperationRequest, type OperationRequest } from "@cimiloop/runtime-adapter";
import type { ProviderVerifierPort } from "@cimiloop/kernel";
import { compileValidator, RuntimeProbeResultSchema, SkillProbeResultSchema, ProviderArtifactReferenceSchema, type ExternalReference,
  type ProviderDescriptor, type ProviderProbeReference, type ProviderArtifactReference, type RuntimeProbeResult, type Project, SkillPackageReferenceSchema, type SkillPackageReference, type SkillProbeResult } from "@cimiloop/protocol/v2";
import { LocalEvidenceVerifier } from "./evidence-local.js";
import{LocalNamedSkillMethodAssessment,type NamedSkillMethodOriginalsPort}from'./skill-method-assessment-local.js';
import{NamedSkillMethodEvidenceSchema,type NamedSkillMethodEvidenceReference,type NamedSkillMethodAssessment}from'@cimiloop/protocol/v2';
import{LocalCodexNamedMethodOriginals}from'./codex-named-method-originals-local.js';

const parseProbe = compileValidator<RuntimeProbeResult>(RuntimeProbeResultSchema);
const parseArtifact = compileValidator<ProviderArtifactReference>(ProviderArtifactReferenceSchema);
const digest = (bytes: Uint8Array) => ({ algorithm: "sha256" as const, value: createHash("sha256").update(bytes).digest("hex") });
const ordinaryFile = (path: string, maximum: number): Buffer => {
  const absolute = resolve(path);
  for (let current = absolute; ; current = dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) throw new Error("Linked probe path");
    if (dirname(current) === current) break;
  }
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.size > maximum || realpathSync(absolute).toLowerCase() !== absolute.toLowerCase()) throw new Error("Unsafe probe file");
  const bytes = readFileSync(absolute); if (bytes.length > maximum) throw new Error("Probe size limit"); return bytes;
};
export class LocalProviderVerifier implements ProviderVerifierPort {
  readonly content: LocalEvidenceVerifier;
  #namedScope:{originals:LocalCodexNamedMethodOriginals;guard:()=>void}|undefined;
  constructor(readonly repositoryPath: string, readonly dataDirectory: string,private readonly namedOriginals?:NamedSkillMethodOriginalsPort) { this.content = new LocalEvidenceVerifier(repositoryPath, dataDirectory); }
  #project(project: Project) { if (resolve(project.repository_path) !== resolve(this.repositoryPath)) throw new Error("Provider project mismatch"); }
  sourceDigest(project: Project, descriptor: ProviderDescriptor) {
    this.#project(project);
    if (descriptor.provider_kind === "skill") {
      const { version: _version, ...raw } = descriptor.source_ref;
      const ref = compileValidator<SkillPackageReference>(SkillPackageReferenceSchema)(raw);
      const verified = verifySkillPackageBytes(this.content.readContent(ref), ref.digest);
      assertSkillDescriptor(verified, descriptor);
      return verified.source_digest;
    }
    if (descriptor.source_ref.provider !== "local_file" || descriptor.source_ref.resource_type !== "executable") throw new Error("Unsupported Provider source");
    const source = isAbsolute(descriptor.source_ref.locator) ? descriptor.source_ref.locator : resolve(this.repositoryPath, descriptor.source_ref.locator);
    return digest(ordinaryFile(source, 512 * 1024 * 1024));
  }
  schemaDigest(schemaId: string) {
    if (!["RuntimeOperationResult", "RuntimeProbeResult", "SkillMethodInput", "SkillMethodOutput"].includes(schemaId)) throw new Error("Unsupported probe schema");
    const root = fileURLToPath(new URL("../../../packages/protocol/schemas/v2/", import.meta.url));
    return digest(ordinaryFile(join(root, `${schemaId}.schema.json`), 1024 * 1024));
  }
  readSkillPackage(project: Project, descriptor: ProviderDescriptor) {
    this.#project(project); const { version: _version, ...raw } = descriptor.source_ref;
    return this.content.readContent(compileValidator<SkillPackageReference>(SkillPackageReferenceSchema)(raw));
  }
  validateSkillRequest(project: Project, request: unknown) { this.#project(project); validateOperationRequest(request as OperationRequest); }
  withNamedOriginals<T>(originals:LocalCodexNamedMethodOriginals,guard:()=>void,run:()=>T):T{if(this.#namedScope||!(originals instanceof LocalCodexNamedMethodOriginals))throw Error('Named method source scope unavailable');const scope={originals,guard};this.#namedScope=scope;try{guard();return run();}finally{if(this.#namedScope!==scope)throw Error('Named method source scope changed');this.#namedScope=undefined;}}
  assessNamedSkillMethod(project:Project,descriptor:ProviderDescriptor,reference:NamedSkillMethodEvidenceReference,profile:NamedSkillMethodAssessment['profile']){this.#project(project);const scope=this.#namedScope;scope?.guard();const result=new LocalNamedSkillMethodAssessment(this.repositoryPath,this.dataDirectory).evaluate(project,descriptor,reference,profile,scope?.originals??this.namedOriginals);scope?.guard();if(this.#namedScope!==scope)throw Error('Named method source scope changed');return result;}
  readProbe(project: Project, ref: ProviderProbeReference) {
    this.#project(project); const raw: unknown = JSON.parse(this.content.readContent(ref).toString("utf8"));
    if(raw&&typeof raw==='object'&&'format'in raw&&raw.format==='cimiloop/named-skill-method-evidence/1.0.0')return compileValidator(NamedSkillMethodEvidenceSchema)(raw);
    return raw && typeof raw === "object" && "kind" in raw && raw.kind === "skill_invocation_probe" ? compileValidator(SkillProbeResultSchema)(raw) : parseProbe(raw);
  }
  readArtifact(project: Project, ref: ExternalReference) { this.#project(project); return this.content.readContent(parseArtifact(ref)); }
  importProbe(snapshotFile: string, artifactRoot: string): ProviderProbeReference {
    const raw: unknown = JSON.parse(ordinaryFile(snapshotFile, 1024 * 1024).toString("utf8"));
    if(raw&&typeof raw==='object'&&'format'in raw&&raw.format==='cimiloop/named-skill-method-evidence/1.0.0')return this.importNamedSkillProbe(raw,artifactRoot);
    if (raw && typeof raw === "object" && "kind" in raw && raw.kind === "skill_invocation_probe") return this.importSkillProbe(raw, artifactRoot);
    const probe = parseProbe(raw);
    const root = resolve(artifactRoot); if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error("Unsafe probe artifact root");
    let count = 0;
    const copy = (ref: ExternalReference): ExternalReference => {
      if (++count > 64 || !ref.digest || ref.digest.algorithm !== "sha256") throw new Error("Fixed bounded probe artifact required");
      const file = resolve(root, ref.locator);
      if (!file.startsWith(`${root}${sep}`)) throw new Error("Probe artifact escapes selected root");
      const bytes = ordinaryFile(file, 8 * 1024 * 1024);
      if (digest(bytes).value !== ref.digest.value) throw new Error("Probe artifact digest mismatch");
      return { ...this.content.storeContent(bytes, "provider_probe_artifact"), version: ref.version ?? ref.resource_type };
    };
    probe.evidence_refs = probe.evidence_refs.map(copy);
    for (const boundary of probe.boundaries) boundary.raw_refs = boundary.raw_refs.map(copy);
    for (const operation of probe.model_operations) { operation.raw_refs = operation.raw_refs.map(copy); operation.outputs = operation.outputs.map(copy); }
    return this.content.storeContent(Buffer.from(JSON.stringify(probe)), "provider_probe_snapshot");
  }
  importNamedSkillProbe(raw:unknown,artifactRoot:string):ProviderProbeReference{
    const evidence=compileValidator(NamedSkillMethodEvidenceSchema)(raw) as import('@cimiloop/protocol/v2').NamedSkillMethodEvidence,root=resolve(artifactRoot);
    if(!lstatSync(root).isDirectory()||lstatSync(root).isSymbolicLink())throw Error('Unsafe named Skill artifact root');let count=0;
    const copy=(ref:{provider:string;resource_type:string;locator:string;digest:{algorithm:string;value:string}},maximum:number)=>{if(++count>128||ref.provider!=='local_content'||ref.digest.algorithm!=='sha256'||ref.locator!==ref.digest.value||!/^[a-f0-9]{64}$/.test(ref.locator))throw Error('Fixed named method artifact required');const bytes=ordinaryFile(join(root,ref.locator),maximum);if(digest(bytes).value!==ref.digest.value)throw Error('Named method artifact changed');this.content.storeContent(bytes,ref.resource_type as import('./evidence-local.js').ContentReference['resource_type']);return bytes;};
    for(const sample of evidence.samples){const input=parseSkillMethodInput(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(copy(sample.input_ref,384*1024))));if(input.purpose==='review')for(const ref of input.artifact_refs)copy(parseArtifact(ref),256*1024);copy(sample.transcript_ref,4*1024*1024);copy(sample.stdout_ref,4*1024*1024);copy(sample.native_proof_ref,65536);}
    return this.content.storeContent(Buffer.from(JSON.stringify(evidence)),'provider_probe_snapshot');
  }
  importSkillProbe(raw: unknown, artifactRoot: string): ProviderProbeReference {
    const probe = compileValidator<SkillProbeResult>(SkillProbeResultSchema)(raw), root = resolve(artifactRoot);
    if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error("Unsafe skill artifact root");
    let count = 0;
    const copy = (ref: ExternalReference) => {
      const value = parseArtifact(ref); if (++count > 64) throw new Error("Skill artifact limit");
      if (!/^[0-9a-f]{64}$/.test(value.locator) || value.digest.value !== value.locator) throw new Error("Fixed skill artifact locator required");
      const bytes = ordinaryFile(join(root, value.locator), 2 * 1024 * 1024);
      if (digest(bytes).value !== value.digest.value) throw new Error("Skill artifact digest mismatch");
      this.content.storeContent(bytes, "provider_probe_artifact"); return value;
    };
    for (const call of probe.calls) {
      copy(call.input_ref); copy(call.request_ref);
      const input = parseSkillMethodInput(JSON.parse(ordinaryFile(join(root, call.input_ref.locator), 384 * 1024).toString("utf8")));
      if (input.purpose === "review") input.artifact_refs.forEach(copy);
      call.operation.raw_refs.forEach(copy); call.operation.outputs.forEach(copy);
    }
    return this.content.storeContent(Buffer.from(JSON.stringify(probe)), "provider_probe_snapshot");
  }
}
