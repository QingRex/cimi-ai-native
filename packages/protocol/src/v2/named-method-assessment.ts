import { Type, type Static } from "typebox";
import { DigestSchema, InternalIdSchema, UtcTimestampSchema, referenceSchema } from "./common.js";
import { RunBindingPinSchema, SkillMethodInputReferenceSchema } from "./runs.js";
import { ProviderArtifactReferenceSchema } from "./provider-assessment.js";

const strict = { additionalProperties: false } as const;
const key = Type.String({ pattern: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$" });
const name = Type.String({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 64 });
const purpose = Type.Union([Type.Literal("clarification"), Type.Literal("review")]);
// Conversation requests/responses are validated by the bounded gateway parser
// during replay. Unknown here is not permission to trust imported effects.
export const FixedMethodTranscriptSchema = Type.Object({ format: Type.Literal("cimiloop/fixed-method-transcript/1.0.0"),
  invocation_key: key, mapping: Type.String({ pattern: "^[F-Z]:$" }), source_digest: DigestSchema,
  request_digest: DigestSchema, profile_digest: DigestSchema,
  exchanges: Type.Array(Type.Object({ sdk_input: Type.Unknown(), upstream_response: Type.Unknown(), mapped_response: Type.Unknown() }, strict),
    { minItems: 1, maxItems: 33 }) }, strict);
export type FixedMethodTranscript = Static<typeof FixedMethodTranscriptSchema>;
export const NamedSkillMethodSampleSchema = Type.Object({ invocation_key: key, input_ref: SkillMethodInputReferenceSchema,
  transcript_ref: ProviderArtifactReferenceSchema, stdout_ref: ProviderArtifactReferenceSchema, native_proof_ref: ProviderArtifactReferenceSchema }, strict);
export type NamedSkillMethodSample = Static<typeof NamedSkillMethodSampleSchema>;
export const NamedSkillMethodEvidenceSchema = Type.Object({ format: Type.Literal("cimiloop/named-skill-method-evidence/1.0.0"),
  project_id: InternalIdSchema, descriptor_ref: referenceSchema("provider_descriptor"), descriptor_digest: DigestSchema,
  runtime_binding: RunBindingPinSchema, method_name: name, purpose, observed_at: UtcTimestampSchema,
  samples: Type.Array(NamedSkillMethodSampleSchema, { minItems: 1, maxItems: 4 }) }, strict);
export type NamedSkillMethodEvidence = Static<typeof NamedSkillMethodEvidenceSchema>;
export const NamedSkillMethodEvidenceReferenceSchema = Type.Object({ provider: Type.Literal("local_content"),
  resource_type: Type.Literal("named_skill_method_evidence"), locator: Type.String({ pattern: "^[0-9a-f]{64}$" }), digest: DigestSchema }, strict);
export type NamedSkillMethodEvidenceReference = Static<typeof NamedSkillMethodEvidenceReferenceSchema>;
export const NamedSkillMethodAssessmentSchema = Type.Object({ format: Type.Literal("cimiloop/named-skill-method-assessment/1.0.0"),
  rule_version: Type.Literal("named-skill-method-assessment/1.0.0"), profile: Type.Union([Type.Literal("method_contract"), Type.Literal("controlled_execution")]),
  project_id: InternalIdSchema, descriptor_ref: referenceSchema("provider_descriptor"), descriptor_digest: DigestSchema,
  runtime_binding: RunBindingPinSchema, method_name: name, purpose, evidence_ref: NamedSkillMethodEvidenceReferenceSchema,
  input_digest: DigestSchema, outcome: Type.Union([Type.Literal("ALLOW"), Type.Literal("DENY"), Type.Literal("NEED_MORE_EVIDENCE")]),
  assessments: Type.Array(Type.Object({ key: Type.String({ pattern: "^[a-z][a-z0-9_]*$", maxLength: 140 }),
    result: Type.Union([Type.Literal("passed"), Type.Literal("failed"), Type.Literal("inconclusive")]) }, strict), { minItems: 1, maxItems: 192 }),
  builtin_skill_qualified: Type.Literal(false), formal_execution_enabled: Type.Literal(false) }, strict);
export type NamedSkillMethodAssessment = Static<typeof NamedSkillMethodAssessmentSchema>;
