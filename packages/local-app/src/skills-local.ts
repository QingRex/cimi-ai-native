import { packageGitSkill, verifySkillPackageBytes, skillRegistration, assertSkillDescriptor, type VerifiedSkillPackage } from "@cimiloop/skill-adapter";
import { compileValidator, SkillPackageReferenceSchema, type SkillPackageReference, type ProviderDescriptor } from "@cimiloop/protocol/v2";
import { LocalProviderVerifier } from "./providers-local.js";
import { LocalEvidenceVerifier } from "./evidence-local.js";

export class LocalSkillPackageStore {
  readonly content: LocalEvidenceVerifier;
  readonly provider: LocalProviderVerifier;
  constructor(readonly repositoryPath: string, readonly dataDirectory: string) {
    this.content = new LocalEvidenceVerifier(repositoryPath, dataDirectory);
    this.provider = new LocalProviderVerifier(repositoryPath, dataDirectory);
  }
  importGit(repository: string, spec: unknown) {
    const verified = packageGitSkill(repository, spec);
    const ref = this.content.storeContent(Buffer.from(JSON.stringify(verified.package)), "skill_package");
    const registration = skillRegistration(verified, ref,
      { schema_id: "SkillMethodInput", digest: this.provider.schemaDigest("SkillMethodInput") },
      { schema_id: "SkillMethodOutput", digest: this.provider.schemaDigest("SkillMethodOutput") });
    return { ref, verified, registration };
  }
  read(ref: SkillPackageReference): VerifiedSkillPackage {
    const valid = compileValidator<SkillPackageReference>(SkillPackageReferenceSchema)(ref);
    return verifySkillPackageBytes(this.content.readContent(valid), valid.digest);
  }
  inspect(descriptor: ProviderDescriptor): VerifiedSkillPackage {
    if (descriptor.provider_kind !== "skill") throw new Error("Skill descriptor required");
    const { version: _version, ...raw } = descriptor.source_ref;
    const verified = this.read(compileValidator<SkillPackageReference>(SkillPackageReferenceSchema)(raw));
    assertSkillDescriptor(verified, descriptor);
    for (const ref of [descriptor.input_schema_ref, descriptor.output_schema_ref]) if (this.provider.schemaDigest(ref.schema_id).value !== ref.digest.value) throw new Error("Skill Schema changed");
    return verified;
  }
}
