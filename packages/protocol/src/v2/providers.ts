import { Type, type Static } from "typebox";
import {
  DigestSchema, ExternalReferenceSchema, InternalIdSchema, NonEmptyStringSchema,
  RecordMetadata, SCHEMA_VERSION, SemanticVersionSchema, referenceSchema
} from "./common.js";

export const CapabilityReferenceSchema = Type.Object({
  capability_id: Type.String({ pattern: "^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$" }),
  version: SemanticVersionSchema
}, { additionalProperties: false });

export const SchemaReferenceSchema = Type.Object({
  schema_id: NonEmptyStringSchema, digest: DigestSchema
}, { additionalProperties: false });

export const PermissionSetSchema = Type.Object({
  actions: Type.Array(NonEmptyStringSchema, { uniqueItems: true }),
  resources: Type.Array(ExternalReferenceSchema, { uniqueItems: true }),
  environment_ids: Type.Array(InternalIdSchema, { uniqueItems: true }),
  network_hosts: Type.Array(NonEmptyStringSchema, { uniqueItems: true })
}, { additionalProperties: false });

export const ProviderDependencySchema = Type.Object({
  descriptor_ref: referenceSchema("provider_descriptor"), digest: DigestSchema
}, { additionalProperties: false });

// Registration declares capabilities. It cannot choose identity, provenance or trust.
export const ProviderRegistrationSchema = Type.Object({
  provider_kind: Type.Union([
    Type.Literal("runtime"), Type.Literal("skill"), Type.Literal("evaluator"),
    Type.Literal("spec_adapter"), Type.Literal("devops")
  ]),
  name: NonEmptyStringSchema, version: SemanticVersionSchema,
  source_ref: Type.Object({
    provider: NonEmptyStringSchema, resource_type: NonEmptyStringSchema, locator: NonEmptyStringSchema,
    version: NonEmptyStringSchema, digest: DigestSchema
  }, { additionalProperties: false }),
  capabilities: Type.Array(CapabilityReferenceSchema, { minItems: 1, uniqueItems: true }),
  dependencies: Type.Array(ProviderDependencySchema, { uniqueItems: true }),
  required_permissions: PermissionSetSchema,
  input_schema_ref: SchemaReferenceSchema, output_schema_ref: SchemaReferenceSchema
}, { additionalProperties: false });
const descriptorFields = { ...RecordMetadata, ...ProviderRegistrationSchema.properties };
export const ProviderCandidateDescriptorSchema = Type.Object({ ...descriptorFields, trust_status: Type.Literal("candidate") }, { additionalProperties: false });
export const ProviderDescriptorSchema = Type.Union([
  ProviderCandidateDescriptorSchema,
  Type.Object({ ...descriptorFields, trust_status: Type.Literal("evaluated"),
    evaluation_ref: referenceSchema("evaluation")
  }, { additionalProperties: false })
]);

export const ProviderBindingApprovalSchema = Type.Object({ assignment_ref: referenceSchema("assignment"), evaluation_ref: referenceSchema("evaluation"),
  input_digest: DigestSchema, binding_scope: Type.Union([Type.Literal("isolated_provider_probe"), Type.Literal("task_execution")]) }, { additionalProperties: false });
export const ProviderBindingSchema = Type.Object({
  ...RecordMetadata,
  descriptor_ref: referenceSchema("provider_descriptor"), descriptor_digest: DigestSchema,
  capability: CapabilityReferenceSchema,
  resolved_dependencies: Type.Array(ProviderDependencySchema, { uniqueItems: true }),
  runtime_binding_ref: Type.Optional(referenceSchema("provider_binding")),
  input_schema_ref: SchemaReferenceSchema, output_schema_ref: SchemaReferenceSchema,
  effective_permissions: PermissionSetSchema,
  approval: Type.Optional(ProviderBindingApprovalSchema),
  probe_evidence_refs: Type.Array(referenceSchema("evidence"), { minItems: 1, uniqueItems: true })
}, { additionalProperties: false });
export const ApprovedProviderBindingSchema = Type.Object({ ...ProviderBindingSchema.properties, approval: ProviderBindingApprovalSchema }, { additionalProperties: false });

export type CapabilityReference = Static<typeof CapabilityReferenceSchema>;
export type SchemaReference = Static<typeof SchemaReferenceSchema>;
export type PermissionSet = Static<typeof PermissionSetSchema>;
export type ProviderDescriptor = Static<typeof ProviderDescriptorSchema>;
export type ProviderBinding = Static<typeof ProviderBindingSchema>;
export type ProviderRegistration = Static<typeof ProviderRegistrationSchema>;
export type ProviderDependency = Static<typeof ProviderDependencySchema>;

const blockers = Type.Array(Type.String({ minLength: 1 }), { minItems: 1, uniqueItems: true });
// A schema-valid binding is metadata, not evidence of enforced permissions.
export const ProviderCatalogResultSchema = Type.Object({
  schema_version: Type.Literal(SCHEMA_VERSION), ok: Type.Literal(true),
  descriptors: Type.Array(ProviderDescriptorSchema), bindings: Type.Array(ProviderBindingSchema),
  assessment_checks: Type.Array(Type.Object({ evaluation_ref: referenceSchema("evaluation"), descriptor_ref: referenceSchema("provider_descriptor"),
    profile: Type.Union([Type.Literal("technical_contract"), Type.Literal("controlled_execution")]),
    outcome: Type.Union([Type.Literal("ALLOW"), Type.Literal("NEED_MORE_EVIDENCE"), Type.Literal("REQUIRE_HUMAN"), Type.Literal("DENY")]),
    input_digest: DigestSchema, blockers: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }) }, { additionalProperties: false })),
  admission: Type.Array(Type.Object({ descriptor_ref: referenceSchema("provider_descriptor"), descriptor_digest: DigestSchema,
    execution_enabled: Type.Literal(false), blockers }, { additionalProperties: false })),
  binding_checks: Type.Array(Type.Object({ binding_ref: referenceSchema("provider_binding"), binding_digest: DigestSchema,
    execution_enabled: Type.Literal(false), blockers }, { additionalProperties: false })),
  agent_bindings: Type.Array(Type.Object({ actor_ref: referenceSchema("actor"),
    binding_ref: Type.Optional(referenceSchema("provider_binding")), identity_matches_binding: Type.Boolean(),
    execution_enabled: Type.Literal(false), blockers }, { additionalProperties: false })),
  as_of_event_sequence: Type.Integer({ minimum: 0 })
}, { additionalProperties: false });
export type ProviderCatalogResult = Static<typeof ProviderCatalogResultSchema>;
