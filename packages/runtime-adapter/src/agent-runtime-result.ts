import type { Project } from "@cimiloop/protocol/v2";
import { isDeepStrictEqual } from "node:util";
import { parseAgentWorkspaceToolScope, type AgentWorkspaceToolScope } from "./agent-workspace-authority.js";
import { AgentWorkspaceCheckHost, parseWorkspaceCheckCatalog } from "./workspace-checks.js";
import type { readAgentWorkspaceIpcOriginals } from "./agent-workspace-ipc-journal.js";
import { agentWorkspaceIpcInvocation, agentWorkspaceIpcCheckInvocation } from "./agent-workspace-ipc.js";
import { readWorkspaceFileRunOriginals } from "./workspace-tool-host.js";
import { RuntimeAdapterError } from "./files.js";

type RecordIdentity = Parameters<typeof AgentWorkspaceCheckHost.readRunOriginals>[2];
// Independent reads of the original Native file/check ledgers, never of the
// receipt embedded in an SDK/IPC response alone. No tool is dispatched here.
// This verifies historical Native receipts, not current workspace applicability
// or model/account/cost/admission qualification. The Kernel retains authority.
export function readAgentRuntimeNativeResult(root: string, project: Pick<Project, "id" | "repository_path">, record: RecordIdentity,
  rawScope: AgentWorkspaceToolScope, originals: ReturnType<typeof readAgentWorkspaceIpcOriginals>, rawCatalog?: unknown) {
  const result = { status: "Unknown" as "Unknown" | "Verified", reason: "agent_native_originals_incomplete", matched_calls: 0,
    unmatched_native_calls: 0, unresolved_native_calls: 0, native_effect_reverified: false,
    model_account_custody_proven: false as const, formal_agent_execution_enabled: false as const };
  try {
    const scope = parseAgentWorkspaceToolScope(rawScope);
    if (project.id !== scope.project_id || record.run_kind !== "agent" || record.run_id !== scope.run_id || record.operation_key !== scope.operation_key ||
      record.executor_ref.id !== scope.executor_actor_id || !isDeepStrictEqual(record.input_digest, scope.context_digest) ||
      !isDeepStrictEqual(record.runtime_binding, scope.runtime_binding) || !isDeepStrictEqual(record.skill_bindings, scope.skill_bindings) ||
      !isDeepStrictEqual(record.host_admission_ref, scope.host_admission_ref) || !isDeepStrictEqual(originals.header?.scope, scope)) throw Error("Original scope mismatch");
    const read = () => ({ files: readWorkspaceFileRunOriginals(root, project, record), checks: AgentWorkspaceCheckHost.readRunOriginals(root, project, record) });
    const original = read(), catalog = rawCatalog === undefined ? undefined : parseWorkspaceCheckCatalog(rawCatalog, scope);
    const seen = new Set<string>();
    result.unresolved_native_calls = original.files.facts.unresolved + original.checks.facts.unresolved;
    for (const exchange of originals.exchanges) {
      const frame = exchange.request as Record<string, unknown> | null, reply = exchange.reply as Record<string, unknown> | null;
      if (!frame || !reply || reply.outcome !== "completed") continue;
      if (frame.tool === "run_check") {
        if (!catalog || catalog.catalog_digest !== originals.header?.endpoint.check_catalog_digest) continue;
        const input = agentWorkspaceIpcCheckInvocation(scope, catalog, frame), call = original.checks.calls.find(call => call.call.call_id === input.call_id);
        if (!call?.receipt || !isDeepStrictEqual(call.call, input) || !isDeepStrictEqual(call.receipt, reply.receipt) ||
          !isDeepStrictEqual(call.scope, scope) || call.policy_digest !== catalog.policy_digest || call.node_digest !== catalog.node_digest ||
          !isDeepStrictEqual(call.recipe, catalog.recipes.find(recipe => recipe.check_id === input.check_id))) continue;
        seen.add("check/" + input.call_id);
      } else {
        const input = agentWorkspaceIpcInvocation(scope, frame), call = original.files.calls.find(call => call.input.call_id === input.call_id);
        if (!call?.receipt || !isDeepStrictEqual(call.input, input) || !isDeepStrictEqual(call.receipt, reply.receipt)) continue;
        seen.add("file/" + input.call_id);
      }
      result.matched_calls++;
    }
    result.unmatched_native_calls = original.files.calls.filter(call => !seen.has("file/" + call.input.call_id)).length +
      original.checks.calls.filter(call => !seen.has("check/" + call.call.call_id)).length;
    // A running ledger may advance while other files are read. Retain Unknown
    // rather than reporting a completion assembled from different Native states.
    if (!isDeepStrictEqual(read(), original)) throw Error("Native originals changed during verification");
    if (originals.status === "Observed" && !originals.unresolved && result.matched_calls > 0 &&
      result.matched_calls === originals.exchanges.length && !result.unmatched_native_calls && !result.unresolved_native_calls) {
      result.status = "Verified"; result.native_effect_reverified = true; result.reason = "agent_native_originals_reverified";
    }
  } catch (error) { result.reason = error instanceof RuntimeAdapterError ? error.reason : "agent_native_originals_unproven"; }
  return result;
}
