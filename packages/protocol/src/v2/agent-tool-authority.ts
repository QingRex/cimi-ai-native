import { Type, type Static } from "typebox";
import { DigestSchema, InternalIdSchema, UtcTimestampSchema } from "./common.js";
import { ToolAuthorityRequestSchema } from "./tool-authority.js";
import { AgentRunBindingsSchema, AgentHostAdmissionReferenceSchema } from "./runs.js";
const strict = { additionalProperties: false } as const;
// Project ownership comes from the containing immutable ProviderBinding. This
// names a policy scope, not immutable file bytes; content digests are invalid.
export const WorkspaceToolResourceGrantSchema = Type.Object({ provider: Type.Literal("cimiloop_workspace"), resource_type: Type.Literal("repository_path"),
  locator: Type.String({ minLength: 1, maxLength: 1024 }), version: Type.Literal("1.0.0") }, strict);
export type WorkspaceToolResourceGrant = Static<typeof WorkspaceToolResourceGrantSchema>;
// Independent Agent query. Frozen Human requests/assessments cannot be reused
// as Agent permission or carry imported admission/verified flags.
export const AgentToolAuthorityRequestSchema = Type.Object({ ...ToolAuthorityRequestSchema.properties,
  ...AgentRunBindingsSchema.properties, host_admission_ref: AgentHostAdmissionReferenceSchema }, strict);
const fields = { schema_version: Type.Literal("2.0.0"), scope: Type.Literal("agent_run_tool_assessment"),
  request: AgentToolAuthorityRequestSchema, assessed_at: UtcTimestampSchema, as_of_event_sequence: Type.Integer({ minimum: 0 }) };
export const AgentToolAuthorityAssessmentSchema = Type.Union([
  Type.Object({ ...fields, decision: Type.Literal("ALLOW"), reasons: Type.Array(Type.String(), { maxItems: 0 }), authority: Type.Object({
    change_id: InternalIdSchema, task_id: InternalIdSchema, work_item_id: InternalIdSchema, run_record_id: InternalIdSchema, context_id: InternalIdSchema,
    host_admission_ref: AgentHostAdmissionReferenceSchema, host_validation_digest: DigestSchema, basis_digest: DigestSchema }, strict) }, strict),
  Type.Object({ ...fields, decision: Type.Literal("DENY"), authority: Type.Null(), reasons: Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { minItems: 1, maxItems: 32 }) }, strict)
]);
export type AgentToolAuthorityRequest = Static<typeof AgentToolAuthorityRequestSchema>;
export type AgentToolAuthorityAssessment = Static<typeof AgentToolAuthorityAssessmentSchema>;
