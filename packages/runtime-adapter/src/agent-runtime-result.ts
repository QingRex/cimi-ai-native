import type { Project } from "@cimiloop/protocol/v2";
import { isDeepStrictEqual } from "node:util";
import { parseAgentWorkspaceToolScope, type AgentWorkspaceToolScope } from "./agent-workspace-authority.js";
import { AgentWorkspaceCheckHost, parseWorkspaceCheckCatalog } from "./workspace-checks.js";
import type { readAgentWorkspaceIpcOriginals } from "./agent-workspace-ipc-journal.js";
import { agentWorkspaceIpcInvocation, agentWorkspaceIpcCheckInvocation } from "./agent-workspace-ipc.js";
import { readWorkspaceFileRunOriginals } from "./workspace-tool-host.js";
import { RuntimeAdapterError } from "./files.js";

import {parseAgentParentSkillSdkCatalog,parseAgentParentSkillIpcRequest,parseAgentParentSkillIpcReceipt,type AgentParentSkillSdkCatalog,type AgentParentSkillIpcReceipt} from './agent-parent-skill-ipc.js';
import {copyToolJson} from './tool-journal.js';
// Trusted read-only application service, bound by Kernel composition. A wire
// receipt never supplies this reader and cannot establish child Native effects.
export interface AgentParentSkillHistoricalResultReader {
 readonly sdkCatalog:AgentParentSkillSdkCatalog;
 readOriginal(raw:unknown):{receipt:AgentParentSkillIpcReceipt};
}
function originalResult(value:unknown){
 if(value instanceof Promise){void Promise.prototype.then.call(value,undefined,()=>{});throw Error('Asynchronous original result');}
 if(value!==null&&(typeof value==='object'||typeof value==='function')){let then:unknown;try{then=Reflect.get(value,'then');}catch{void Promise.resolve(value).then(undefined,()=>{});throw Error('Asynchronous original result');}if(typeof then==='function'){void Promise.resolve(value).then(undefined,()=>{});throw Error('Asynchronous original result');}}
 const raw=copyToolJson(value);if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).join(',')!=='receipt'||!('receipt'in raw))throw Error('Original result shape');return raw.receipt;
}
type RecordIdentity = Parameters<typeof AgentWorkspaceCheckHost.readRunOriginals>[2];
// Independent reads of the original Native file/check ledgers, never of the
// receipt embedded in an SDK/IPC response alone. No tool is dispatched here.
// This verifies historical Native receipts, not current workspace applicability
// or model/account/cost/admission qualification. The Kernel retains authority.
export function readAgentRuntimeNativeResult(root: string, project: Pick<Project, "id" | "repository_path">, record: RecordIdentity,
  rawScope: AgentWorkspaceToolScope, originals: ReturnType<typeof readAgentWorkspaceIpcOriginals>, rawCatalog?: unknown, parentReader?:AgentParentSkillHistoricalResultReader) {
  const result = { status: "Unknown" as "Unknown" | "Verified", reason: "agent_native_originals_incomplete", matched_calls: 0,
    unmatched_native_calls: 0, unresolved_native_calls: 0, native_effect_reverified: false,
    model_account_custody_proven: false as const, formal_agent_execution_enabled: false as const };
  try {
    const scope = parseAgentWorkspaceToolScope(rawScope), spine=structuredClone(originals);
    if (project.id !== scope.project_id || record.run_kind !== "agent" || record.run_id !== scope.run_id || record.operation_key !== scope.operation_key ||
      record.executor_ref.id !== scope.executor_actor_id || !isDeepStrictEqual(record.input_digest, scope.context_digest) ||
      !isDeepStrictEqual(record.runtime_binding, scope.runtime_binding) || !isDeepStrictEqual(record.skill_bindings, scope.skill_bindings) ||
      !isDeepStrictEqual(record.host_admission_ref, scope.host_admission_ref) || !isDeepStrictEqual(originals.header?.scope, scope)) throw Error("Original scope mismatch");
    const read = () => ({ files: readWorkspaceFileRunOriginals(root, project, record), checks: AgentWorkspaceCheckHost.readRunOriginals(root, project, record) });
    const original = read(), catalog = rawCatalog === undefined ? undefined : parseWorkspaceCheckCatalog(rawCatalog, scope);
    const seen = new Set<string>(),children=new Map<string,{frame:ReturnType<typeof parseAgentParentSkillIpcRequest>;receipt:AgentParentSkillIpcReceipt}>();
    const parentCatalog=parentReader?parseAgentParentSkillSdkCatalog(parentReader.sdkCatalog,scope):undefined,readChild=parentReader?.readOriginal.bind(parentReader);
    const childProof=(frame:ReturnType<typeof parseAgentParentSkillIpcRequest>)=>{if(!parentReader||!parentCatalog||!readChild||originals.header?.endpoint.parent_skill_catalog_digest!==parentCatalog.catalog_digest||!isDeepStrictEqual(parseAgentParentSkillSdkCatalog(parentReader.sdkCatalog,scope),parentCatalog))throw Error('Original child reader missing');const receipt=parseAgentParentSkillIpcReceipt(originalResult(readChild(structuredClone(frame))),frame);if(!isDeepStrictEqual(parseAgentParentSkillSdkCatalog(parentReader.sdkCatalog,scope),parentCatalog)||!isDeepStrictEqual(originals,spine))throw Error('Original child identity changed');return receipt;};
    result.unresolved_native_calls = original.files.facts.unresolved + original.checks.facts.unresolved;
    for (const exchange of originals.exchanges) {
      const frame = exchange.request as Record<string, unknown> | null, reply = exchange.reply as Record<string, unknown> | null;
      if (!frame || !reply || reply.outcome !== "completed" || frame.tool === "model_step") continue;
      if(frame.tool==='run_skill'){
        if(!parentCatalog)throw Error('Independent original child reader missing');const request=parseAgentParentSkillIpcRequest(frame,parentCatalog),receipt=childProof(request),prior=children.get(String(request.call_id));
        if(!isDeepStrictEqual(receipt,parseAgentParentSkillIpcReceipt(reply.receipt,request))||prior&&(!isDeepStrictEqual(prior.frame,request)||!isDeepStrictEqual(prior.receipt,receipt)))throw Error('Original child result mismatch');children.set(String(request.call_id),{frame:request,receipt});
      } else if (frame.tool === "run_check") {
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
    for(const child of children.values())if(!isDeepStrictEqual(childProof(child.frame),child.receipt))throw Error('Original child result changed during verification');
    if (!isDeepStrictEqual(read(), original)||!isDeepStrictEqual(originals,spine)) throw Error("Native originals changed during verification");
    if (originals.status === "Observed" && !originals.unresolved && result.matched_calls > 0 &&
      result.matched_calls === originals.exchanges.filter(exchange => !(exchange.request && typeof exchange.request === "object" && "tool" in exchange.request && exchange.request.tool === "model_step")).length && !result.unmatched_native_calls && !result.unresolved_native_calls) {
      result.status = "Verified"; result.native_effect_reverified = true; result.reason = "agent_native_originals_reverified";
    }
  } catch (error) { result.reason = error instanceof RuntimeAdapterError ? error.reason : "agent_native_originals_unproven"; }
  return result;
}
