import { Type, type Static } from "typebox";
import { DigestSchema, InternalIdSchema, UtcTimestampSchema } from "./common.js";
import { ExecutionActionSchema } from "./execution.js";
const strict = { additionalProperties: false } as const;
export const ToolAuthorityRequestSchema = Type.Object({
  project_id: InternalIdSchema, run_id: InternalIdSchema, operation_key: InternalIdSchema,
  executor_actor_id: InternalIdSchema, context_digest: DigestSchema, action: ExecutionActionSchema,
  resource: Type.String({ minLength: 1, maxLength: 1024 })
}, strict);
const fields = {
  schema_version: Type.Literal("2.0.0"), scope: Type.Literal("human_run_tool_assessment"),
  request: ToolAuthorityRequestSchema, assessed_at: UtcTimestampSchema,
  as_of_event_sequence: Type.Integer({ minimum: 0 }), formal_agent_execution_enabled: Type.Literal(false)
};
export const ToolAuthorityAssessmentSchema = Type.Union([
  Type.Object({ ...fields, decision: Type.Literal("ALLOW"), reasons: Type.Array(Type.String(), { maxItems: 0 }),
    authority: Type.Object({ change_id: InternalIdSchema, task_id: InternalIdSchema, work_item_id: InternalIdSchema,
      run_record_id: InternalIdSchema, context_id: InternalIdSchema, basis_digest: DigestSchema }, strict) }, strict),
  Type.Object({ ...fields, decision: Type.Literal("DENY"), authority: Type.Null(),
    reasons: Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { minItems: 1, maxItems: 32 }) }, strict)
]);
export type ToolAuthorityRequest = Static<typeof ToolAuthorityRequestSchema>;
export type ToolAuthorityAssessment = Static<typeof ToolAuthorityAssessmentSchema>;
