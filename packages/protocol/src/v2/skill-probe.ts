import { Type, type Static } from "typebox";
import { DigestSchema, UtcTimestampSchema, referenceSchema } from "./common.js";
import { CapabilityReferenceSchema } from "./providers.js";
import { RuntimeOperationResultSchema } from "./runtime-probe.js";

const strict = { additionalProperties: false } as const;
const name = Type.String({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 64 });
export const SkillRuntimeProfileSchema = Type.Object({ version: Type.Literal("cimiloop/skill-method/1.0.0"),
  source_digest: DigestSchema, skill_names: Type.Array(name, { minItems: 1, maxItems: 32, uniqueItems: true }),
  purpose: Type.Union([Type.Literal("clarification"), Type.Literal("review")]) }, strict);
const artifact = Type.Object({ provider: Type.Literal("local_content"), resource_type: Type.Literal("provider_probe_artifact"),
  locator: Type.String({ pattern: "^[0-9a-f]{64}$" }), digest: DigestSchema, version: Type.String({ minLength: 1, maxLength: 100 }) }, strict);
export const SkillInvocationSampleSchema = Type.Object({ input_ref: artifact, request_ref: artifact,
  operation: RuntimeOperationResultSchema }, strict);
export const SkillProbeResultSchema = Type.Object({ schema_version: Type.Literal("2.0.0"), scope: Type.Literal("isolated_provider_probe"),
  kind: Type.Literal("skill_invocation_probe"), observed_at: UtcTimestampSchema,
  descriptor_ref: referenceSchema("provider_descriptor"), descriptor_digest: DigestSchema, capability: CapabilityReferenceSchema,
  runtime_binding_ref: referenceSchema("provider_binding"), runtime_binding_digest: DigestSchema,
  calls: Type.Array(SkillInvocationSampleSchema, { minItems: 1, maxItems: 4 }), formal_execution_enabled: Type.Literal(false)
}, strict);
export type SkillRuntimeProfile = Static<typeof SkillRuntimeProfileSchema>;
export type SkillInvocationSample = Static<typeof SkillInvocationSampleSchema>;
export type SkillProbeResult = Static<typeof SkillProbeResultSchema>;
