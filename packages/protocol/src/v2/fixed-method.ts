import { Type, type Static } from "typebox";
import { DigestSchema } from "./common.js";
import { SkillMethodInputSchema, SkillMethodOutputSchema } from "./skills.js";

const strict = { additionalProperties: false } as const;
const key = Type.String({ pattern: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$" });
const name = Type.String({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 64 });
const requestId = Type.String({ pattern: "^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$" });
const path = Type.String({ pattern: "^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*(?:/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*)*$", maxLength: 240 });
export const NamedSkillMethodRequestSchema = Type.Object({ format: Type.Literal("cimiloop/named-skill-method/1.0.0"),
  invocation_key: key, method_name: name, source_digest: DigestSchema, input: SkillMethodInputSchema }, strict);
export type NamedSkillMethodRequest = Static<typeof NamedSkillMethodRequestSchema>;
export const FixedMethodProfileSchema = Type.Object({ format: Type.Literal("cimiloop/fixed-method-adapter/1.0.0"),
  invocation_key: key, source_digest: DigestSchema, request_digest: DigestSchema, entry_name: name,
  modules: Type.Array(Type.Object({ name, dependencies: Type.Array(name, { maxItems: 32, uniqueItems: true }),
    definition_path: path }, strict), { minItems: 1, maxItems: 32 }),
  resources: Type.Array(Type.Object({ path, digest: DigestSchema, kind: Type.Union([Type.Literal("request"), Type.Literal("input"),
    Type.Literal("definition"), Type.Literal("reference"), Type.Literal("artifact"), Type.Literal("artifact_index")]) }, strict), { minItems: 3, maxItems: 32 })
}, strict);
export type FixedMethodProfile = Static<typeof FixedMethodProfileSchema>;
export const FixedMethodProjectionSchema = Type.Object({ format: Type.Literal("cimiloop/fixed-method-projection/1.0.0"),
  invocation_key: key, source_digest: DigestSchema, request_digest: DigestSchema, profile_digest: DigestSchema,
  sdk_input_digest: DigestSchema, upstream_input_digest: DigestSchema, mapped_response_digest: DigestSchema, upstream_response_digest: DigestSchema }, strict);
export type FixedMethodProjection = Static<typeof FixedMethodProjectionSchema>;
const call = Type.Object({ call_id: Type.String({ pattern: "^[a-zA-Z0-9_-]{1,128}$" }), request_id: requestId,
  upstream_input_digest: DigestSchema, sdk_input_digest: DigestSchema,
  function_name: Type.Union([Type.Literal("invoke_skill"), Type.Literal("read_method_resource")]), argument: path,
  sdk_file_path: Type.String({ minLength: 1, maxLength: 300 }), resource_path: path, resource_digest: DigestSchema,
  status: Type.Union([Type.Literal("issued"), Type.Literal("observed")]), output_digest: Type.Optional(DigestSchema) }, strict);
export const FixedMethodObservationSchema = Type.Object({ format: Type.Literal("cimiloop/fixed-method-observation/1.0.0"),
  scope: Type.Literal("isolated_conversation_rehearsal"), invocation_key: key, source_digest: DigestSchema, request_digest: DigestSchema,
  profile_digest: DigestSchema, calls: Type.Array(call, { maxItems: 32 }),
  status: Type.Union([Type.Literal("Pending"), Type.Literal("Succeeded"), Type.Literal("Failed"), Type.Literal("Unknown")]),
  output: Type.Optional(SkillMethodOutputSchema), reason: Type.Optional(Type.String({ pattern: "^[a-z_]{1,96}$" })),
  completion: Type.Optional(Type.Object({ request_id: requestId, upstream_input_digest: DigestSchema,
    response_digest: DigestSchema, output_digest: DigestSchema }, strict)),
  builtin_skill_qualified: Type.Literal(false), behavior_qualified: Type.Literal(false), formal_execution_enabled: Type.Literal(false)
}, strict);
export type FixedMethodObservation = Static<typeof FixedMethodObservationSchema>;
