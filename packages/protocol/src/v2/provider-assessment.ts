import { Type, type Static } from "typebox";
import { DigestSchema, RecordMetadata, UtcTimestampSchema, referenceSchema } from "./common.js";
import { CapabilityReferenceSchema, PermissionSetSchema } from "./providers.js";
import { GateOutcomeSchema } from "./verification.js";

const strict = { additionalProperties: false } as const;
export const ProviderAssessmentProfileSchema = Type.Union([Type.Literal("technical_contract"), Type.Literal("controlled_execution")]);
export const ProviderProbeReferenceSchema = Type.Object({ provider: Type.Literal("local_content"),
  resource_type: Type.Literal("provider_probe_snapshot"), locator: Type.String({ pattern: "^[0-9a-f]{64}$" }), digest: DigestSchema }, strict);
export const ProviderArtifactReferenceSchema = Type.Object({ provider: Type.Literal("local_content"),
  resource_type: Type.Literal("provider_probe_artifact"), locator: Type.String({ pattern: "^[0-9a-f]{64}$" }),
  digest: DigestSchema, version: Type.Optional(Type.String({ minLength: 1 })) }, strict);
export const RuntimeProviderEvidenceSchema = Type.Object({ ...RecordMetadata, purpose: Type.Literal("provider_probe"),
  descriptor_ref: referenceSchema("provider_descriptor"), descriptor_digest: DigestSchema,
  origin: Type.Literal("local_probe_observation"), raw_result_ref: ProviderProbeReferenceSchema,
  observed_at: UtcTimestampSchema }, strict);
export const SkillProviderEvidenceSchema = Type.Object({ ...RecordMetadata, purpose: Type.Literal("skill_probe"),
  descriptor_ref: referenceSchema("provider_descriptor"), descriptor_digest: DigestSchema,
  origin: Type.Literal("local_skill_observation"), raw_result_ref: ProviderProbeReferenceSchema,
  observed_at: UtcTimestampSchema }, strict);
export const ProviderEvidenceSchema = Type.Union([RuntimeProviderEvidenceSchema, SkillProviderEvidenceSchema]);
export const RuntimeProviderEvaluationSchema = Type.Object({ ...RecordMetadata, purpose: Type.Literal("provider_assessment"),
  descriptor_ref: referenceSchema("provider_descriptor"), descriptor_digest: DigestSchema,
  profile: ProviderAssessmentProfileSchema, rule_version: Type.Literal("provider-assessment/1.0.0"),
  input_digest: DigestSchema, evidence_refs: Type.Array(referenceSchema("evidence"), { minItems: 1, uniqueItems: true }),
  outcome: GateOutcomeSchema, reasons: Type.Array(Type.String({ minLength: 1 })),
  assessments: Type.Array(Type.Object({ key: Type.String({ minLength: 1 }),
    result: Type.Union([Type.Literal("supports"), Type.Literal("refutes"), Type.Literal("inconclusive")]),
    evidence_refs: Type.Array(referenceSchema("evidence"), { uniqueItems: true }) }, strict), { minItems: 1 }) }, strict);
export const SkillProviderEvaluationSchema = Type.Object({ ...RuntimeProviderEvaluationSchema.properties,
  rule_version: Type.Literal("skill-provider-assessment/1.0.0") }, strict);
export const ProviderEvaluationSchema = Type.Union([RuntimeProviderEvaluationSchema, SkillProviderEvaluationSchema]);
export const RecordProviderEvidencePayloadSchema = Type.Object({ descriptor_ref: referenceSchema("provider_descriptor"),
  descriptor_digest: DigestSchema, raw_result_ref: ProviderProbeReferenceSchema }, strict);
export const EvaluateProviderPayloadSchema = Type.Object({ descriptor_ref: referenceSchema("provider_descriptor"),
  descriptor_digest: DigestSchema, profile: ProviderAssessmentProfileSchema,
  evidence_refs: Type.Array(referenceSchema("evidence"), { minItems: 1, uniqueItems: true }) }, strict);
export const RuntimeRegisterProviderBindingPayloadSchema = Type.Object({ descriptor_ref: referenceSchema("provider_descriptor"),
  descriptor_digest: DigestSchema, evaluation_ref: referenceSchema("evaluation"), input_digest: DigestSchema,
  binding_scope: Type.Union([Type.Literal("isolated_provider_probe"), Type.Literal("task_execution")]),
  capability: CapabilityReferenceSchema, effective_permissions: PermissionSetSchema }, strict);
export const SkillRegisterProviderBindingPayloadSchema = Type.Object({ ...RuntimeRegisterProviderBindingPayloadSchema.properties,
  runtime_binding_ref: referenceSchema("provider_binding"), runtime_binding_digest: DigestSchema }, strict);
export const RegisterProviderBindingPayloadSchema = Type.Union([RuntimeRegisterProviderBindingPayloadSchema, SkillRegisterProviderBindingPayloadSchema]);
export type ProviderEvidence = Static<typeof ProviderEvidenceSchema>;
export type ProviderEvaluation = Static<typeof ProviderEvaluationSchema>;
export type ProviderProbeReference = Static<typeof ProviderProbeReferenceSchema>;
export type ProviderArtifactReference = Static<typeof ProviderArtifactReferenceSchema>;
