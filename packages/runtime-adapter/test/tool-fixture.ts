import { createInternalId } from "@cimiloop/protocol/v2";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { ToolAuthorityAssessment, ToolAuthorityRequest } from "@cimiloop/protocol/v2";
import { digest } from "../src/files.js";
import { PublicToolFileFixture } from "../src/tool-host.js";
import { TOOL_SLOT_BYTES, type ToolInvocation, type ToolJournalPolicy } from "../src/tool-journal.js";
export const fixtureIdentity = { pid: process.pid, creation_ticks: "1", image: process.execPath };
export const toolFixture = () => {
  const file = PublicToolFileFixture.create(), projectId = createInternalId();
  const input: ToolInvocation = { format: "cimiloop/public-tool-invocation/1.0.0", project_id: projectId, run_id: createInternalId(), operation_key: createInternalId(), executor_actor_id: createInternalId(),
    context_digest: digest("public fixture context"), call_id: "public_call", tool: "read_file", path: "src/query.ts", expected_digest: digest(readFileSync(join(file.root, "public.txt"))).value };
  const policy: ToolJournalPolicy = { format: "cimiloop/public-tool-journal/1.0.0", scope: "public_tool_rehearsal", project_id: projectId, fixture_scope_digest: file.scopeDigest, maximum_entries: 8, maximum_bytes: 8 * TOOL_SLOT_BYTES };
  // Test-only authorization seam; positive native WorkItem checks are covered
  // independently with a real Kernel/SQLite/Git fixture.
  const authority = { change_id: createInternalId(), task_id: createInternalId(), work_item_id: createInternalId(), run_record_id: createInternalId(), context_id: createInternalId(), basis_digest: digest("public fixture authority") };
  const assess = (request: ToolAuthorityRequest): ToolAuthorityAssessment => ({ schema_version: "2.0.0", scope: "human_run_tool_assessment", request: structuredClone(request), assessed_at: "2026-10-05T00:00:00.000Z",
    as_of_event_sequence: 1, formal_agent_execution_enabled: false, decision: "ALLOW", reasons: [], authority: structuredClone(authority) });
  return { file, input, policy, assess, path: join(file.root, "tool.sqlite") };
};
export const removeToolFixture = (root: string): void => {
  if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-tool-fixture-") || resolve(join(root, "..")) !== resolve(tmpdir())) throw Error("unowned fixture cleanup");
  rmSync(root, { recursive: true, force: true });
};
