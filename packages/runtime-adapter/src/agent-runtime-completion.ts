import {readOriginalAgentJobObservation} from './agent-job-policy.js';
import {isOriginalAgentNativeSuspension} from "./agent-native-suspension.js";
import { verifyCollectedDedicatedAgentModelOriginals } from "./agent-dedicated-model.js";
import { isDeepStrictEqual } from "node:util";
import { compileValidator, TaskDefinitionRecordSchema, ContractVersionSchema, PlanVersionSchema, TaskSchema, WorkItemSchema,
  type Project, type AgentRunRecord, type AgentContextManifest, type TaskDefinitionRecord, type ContractVersion, type PlanVersion, type Task, type WorkItem, type Run } from "@cimiloop/protocol/v2";
import { bytesAt, digest, RuntimeAdapterError } from "./files.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import { agentWorkspaceIpcScopeDigest } from "./agent-workspace-ipc.js";
import { parseAgentRuntimeModelRequest, parseAgentRuntimeModelResponse, readAgentRuntimeModelOriginals } from "./agent-runtime-model.js";
import { readAgentRuntimeNativeResult } from "./agent-runtime-result.js";
import { correlateAgentWorkspaceSdkOriginals, readAgentWorkspaceIpcOriginals } from "./agent-workspace-ipc-journal.js";
import type { collectAgentRuntimeOperation, readAgentRuntimeOriginalIdentity } from "./agent-runtime-operation.js";

type Original = ReturnType<typeof readAgentRuntimeOriginalIdentity>;
type Collection = Awaited<ReturnType<typeof collectAgentRuntimeOperation>>;
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw Error(); return value as Record<string, unknown>; };
const same = isDeepStrictEqual, id = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
const json = (bytes: Buffer, maximum = 2 * 1024 * 1024) => structuredClone(parseGatewayJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes), maximum));

export function originalTaskResultContract(scope: Original["scope"], definitionRef: AgentRunRecord["definition_ref"], outputs: string[], checkIds: string[]) {
  if (!outputs.length || outputs.length > 128 || !checkIds.length || checkIds.length > 128) throw new RuntimeAdapterError("agent_task_result_capacity_unavailable");
  return { format: "cimiloop/task-result-contract/1.0.0" as const, run_id: scope.run_id, operation_key: scope.operation_key, input_digest: scope.context_digest,
    definition_ref: structuredClone(definitionRef), outputs: outputs.map((requirement, output_index) => ({ output_index, requirement })), required_check_ids: [...checkIds],
    response_format: "cimiloop/task-execution-result/1.0.0", instructions: "Return one JSON object with format, run_id, operation_key, input_digest, definition_ref, outputs and summary. outputs must cover every output_index exactly once, each with evidence_call_ids from completed cimi tool outputs. Fixed checks must pass after all edits. Do not claim model/account approval, billing, Task acceptance or delivery." };
}
export interface OriginalTaskExecutionResult {
  format: "cimiloop/original-task-execution-result/1.0.0";
  run_id: string; operation_key: string; task_packet_digest: string; definition_ref: AgentRunRecord["definition_ref"];
  sdk: { session_id: string; message_id: string; final_model_call_id: string; stdout_digest: string; final_response_digest: string };
  outputs: { output_index: number; requirement: string; evidence_call_ids: string[] }[]; summary: string;
  required_checks: { check_id: string; call_id: string; source_digest: string; source_basis_digest: string | null }[];
  native_effect_reverified: true; model_account_custody_proven: false; costs_reconciled: false; task_acceptance_proven: false; current_workspace_applicability_proven: false;
}
// Supplied independently from the Kernel's immutable records, never from the
// Runtime packet or model answer. These pins describe the original Run's basis,
// not the currently active Plan or a Task acceptance decision.
export interface OriginalTaskDomainBasis { definition: TaskDefinitionRecord; contract: ContractVersion; plan: PlanVersion; run?: Run }

// Historical execution-result verification, wired into the shared observation
// service. Re-reads independent original Native ledgers; no call/Run is launched.
// It cannot turn constructed model admission or token usage into account/bills,
// nor can it substitute for Kernel Task evaluation or current source verification.
export function verifyOriginalTaskExecutionResult(root: string, project: Project, record: AgentRunRecord, context: AgentContextManifest,
  original: Original, collection: Collection, domain?: OriginalTaskDomainBasis): OriginalTaskExecutionResult | null {
  try {
    const scope = original.scope, input = object(original.input), packet = object(json(Buffer.from(String(input.prompt)), 32768));
    if (collection.scope_digest !== agentWorkspaceIpcScopeDigest(scope) || collection.status.operation !== original.operation ||
      record.project_id !== project.id || context.project_id !== project.id || record.context_ref.id !== context.id || !same(record.input_digest, scope.context_digest) || packet.format !== "cimiloop/agent-runtime-task-packet/2.0.0" || packet.operation_key !== scope.operation_key || !same(packet.context_digest, scope.context_digest) ||
      !same(packet.context, context) || record.run_id !== scope.run_id || record.operation_key !== scope.operation_key || project.id !== scope.project_id ||
      collection.status.status !== "Stopped" || collection.status.resources_disposed !== true || collection.status.cancellation_requested !== false ||
      collection.synthetic_model_responses !== null || collection.model?.status !== "Observed" || collection.model.unresolved !== 0 ||
      collection.ipc?.status !== "Observed" || collection.ipc.unresolved !== 0 || collection.ipc.correlation?.uncorrelated_exchanges !== 0 || collection.ipc.correlation.unmatched_sdk_calls !== 0) return null;
    verifyCollectedDedicatedAgentModelOriginals(root,scope,collection);
    if (collection.dedicated_model && collection.dedicated_model.status!=="Observed") return null;
    if (!domain) return null;
    const definition = compileValidator<TaskDefinitionRecord>(TaskDefinitionRecordSchema)(packet.definition),
      contractVersion = compileValidator<ContractVersion>(ContractVersionSchema)(packet.contract), plan = compileValidator<PlanVersion>(PlanVersionSchema)(packet.plan),
      task = compileValidator<Task>(TaskSchema)(packet.task), item = compileValidator<WorkItem>(WorkItemSchema)(packet.work_item), contract = object(packet.result_contract);
    if (!same(definition, domain.definition) || !same(contractVersion, domain.contract) || !same(plan, domain.plan) ||
      [task, item, definition, contractVersion, plan].some(value => value.project_id !== project.id || value.change_id !== record.change_id) ||
      contractVersion.id !== record.contract_ref.id || contractVersion.version !== record.contract_ref.domain_version ||
      plan.id !== record.plan_ref.id || plan.version !== record.plan_ref.domain_version || !same(plan.body.contract_ref, record.contract_ref) ||
      definition.body.version !== definition.version || !same(task.scope, definition.body.scope) || !same(item.scope, task.scope) ||
      !same(item.definition_ref, record.definition_ref) || !same(item.contract_ref, record.contract_ref) || !same(item.plan_ref, record.plan_ref) ||
      item.task_id !== record.task_id || !same(item.executor_ref, record.executor_ref) || !same(task.definition_ref, record.definition_ref) ||
      plan.body.task_definitions.filter(value => value.task_id === record.task_id && value.version === definition.version).length !== 1 ||
      !plan.body.task_definitions.some(value => same(value, definition.body))) return null;
    if (task.id !== record.task_id || item.id !== record.work_item_ref.id || definition.task_id !== record.task_id || definition.body.task_id !== record.task_id ||
      definition.project_id !== project.id || definition.change_id !== record.change_id || definition.id !== record.definition_ref.id || definition.version !== record.definition_ref.domain_version || !same(task.definition_ref, record.definition_ref) ||
      !same(definition.plan_ref, record.plan_ref) || !same(task.plan_ref, record.plan_ref) || !same(task.contract_ref, record.contract_ref) || !same(object(packet.plan).contract_ref, record.contract_ref)) return null;
    const names = new Set<string>();
    for (const artifact of collection.artifacts) { if (names.has(artifact.name)) return null; names.add(artifact.name); }
    const artifact = (name: string, limit = 2 * 1024 * 1024): Buffer => {
      const ref = collection.artifacts.find(a => a.name === name)?.reference; if (!ref) throw Error();
      const bytes = bytesAt(ref.locator, limit); if (digest(bytes).value !== ref.digest?.value) throw Error(); return bytes;
    };
    const suspended=object(json(artifact("agent-sandbox-original.json"))), launch=object(json(artifact("original-launcher.json"))), resources=object(json(artifact("agent-sandbox-resources.json")));
    const config = object(json(artifact("original-config.json"))), disposal = object(json(artifact("agent-sandbox-cleanup.json"))), result = object(json(artifact("result.json")));
    if (config.prompt !== input.prompt || config.scope_digest !== collection.scope_digest || !same(config.owner, original.claim.owner) ||
      result.operation !== original.operation || !same(result.sandbox,suspended) ||
      result.format !== "cimiloop/opencode-workspace-runtime/1.0.0" || result.mode !== "host_gateway" || result.original_scope_digest !== collection.scope_digest ||
      !same(result.native_exit, { code: 0, signal: null }) || result.output_limit_exceeded !== false || result.source_bytes_unchanged !== true ||
      !same(result.disposal, disposal) || disposal.format!=="cimiloop/agent-workspace-sandbox/1.0.0" || disposal.formal_agent_execution_enabled!==false || disposal.phase !== "ended" || disposal.nonce !== config.nonce || disposal.reason !== "exited" || disposal.exit_code !== 0 ||
      disposal.resources_disposed !== true || !Array.isArray(disposal.cleanup_errors) || disposal.cleanup_errors.length) return null;
    const catalog = json(artifact("check-catalog.json", 262144)), recipes = object(catalog).recipes;
    if (!Array.isArray(recipes) || !same(contract, originalTaskResultContract(scope, record.definition_ref, definition.body.outputs, recipes.map(recipe => String(object(recipe).check_id))))) return null;
    const ipc = readAgentWorkspaceIpcOriginals(root, scope, String(config.pipe_nonce));
    if (ipc.status !== "Observed" || ipc.unresolved !== 0 || !isOriginalAgentNativeSuspension(suspended,{nonce:config.nonce,supervisor:launch.supervisor,peer:resources.runtime,appcontainer_sid:ipc.header?.endpoint.appcontainer_sid}) ||
      !same(suspended.supervisor,ipc.header?.endpoint.supervisor)||!same(suspended.peer,ipc.header?.endpoint.peer)||resources.phase!=="ended"||resources.resources_disposed!==true) return null;
    const job=readOriginalAgentJobObservation(root,original.operation,input,config,launch,resources);
    if(job&&!job.bytes.equals(artifact('agent-job-observation.json',65536)))return null;
    const native = readAgentRuntimeNativeResult(root, project, record, scope, ipc, catalog);
    if (native.status !== "Verified" || !native.native_effect_reverified || native.unresolved_native_calls || native.unmatched_native_calls) return null;
    const steps: { session_id: string; message_id: string; text: string; reason: unknown; closed: boolean; tools: Record<string, unknown>[] }[] = [];
    let session: string | undefined, suspendedSeen=false, cleanupSeen=false;
    const stdout = artifact("stdout.raw");
    const correlation = correlateAgentWorkspaceSdkOriginals(ipc, stdout);
    if (!same(collection.ipc.correlation, correlation) || correlation.uncorrelated_exchanges || correlation.unmatched_sdk_calls || !correlation.links.length) return null;
    for (const line of new TextDecoder("utf-8", { fatal: true }).decode(stdout).split(/\r?\n/)) {
      if (!line.trim()) continue; const event = object(json(Buffer.from(line)));
      if(event.format==="cimiloop/agent-workspace-preparation/1.0.0") {if(suspendedSeen||cleanupSeen||steps.length||event.nonce!==config.nonce||!same(event.supervisor,launch.supervisor))return null;continue;}
      if(event.format==="cimiloop/agent-workspace-sandbox/1.0.0"&&event.phase==="suspended") {if(suspendedSeen||cleanupSeen||steps.length||!same(event,suspended))return null;suspendedSeen=true;continue;}
      if(event.format==="cimiloop/agent-workspace-sandbox/1.0.0") {if(!suspendedSeen||cleanupSeen||!steps.length||!steps.at(-1)!.closed||!same(event,disposal))return null;cleanupSeen=true;continue;}
      if (!suspendedSeen || cleanupSeen || !["step_start", "step_finish", "text", "tool_use"].includes(String(event.type))) return null;
      const part = object(event.part);
      if (!id(event.sessionID) || part.sessionID !== event.sessionID || !id(part.messageID) || session && event.sessionID !== session) return null;
      session = event.sessionID;
      if (event.type === "step_start") {
        if (part.type !== "step-start" || steps.length && !steps[steps.length - 1]!.closed || steps.some(step => step.message_id === part.messageID) || steps.length >= 64) return null;
        steps.push({ session_id: session, message_id: part.messageID, text: "", reason: null, closed: false, tools: [] }); continue;
      }
      const step = steps[steps.length - 1]; if (!step || step.closed || step.message_id !== part.messageID) return null;
      if (event.type === "tool_use") { if (part.type !== "tool" || !id(part.callID) || step.tools.some(tool => tool.callID === part.callID)) return null; step.tools.push(part); }
      if (event.type === "text") { if (part.type !== "text" || typeof part.text !== "string" || !part.text.isWellFormed()) return null; step.text += part.text; if (Buffer.byteLength(step.text) > 16384) return null; }
      if (event.type === "step_finish") { if (part.type !== "step-finish") return null; step.reason = part.reason; step.closed = true; }
    }
    if (!suspendedSeen || !cleanupSeen || !steps.length || steps.length !== collection.model.calls || steps.some(step => !step.closed)) return null;
    const header = object(json(artifact("model/header.json", 114688))), expectedAdmission = object(input.provider_options).admission_digest;
    if (!same(header.scope, scope) || header.task_packet_digest !== digest(String(input.prompt)).value || header.admission_digest !== expectedAdmission ||
      object(config.provider_options).admission_digest !== expectedAdmission || !Array.isArray(header.permitted)) return null;
    const model = readAgentRuntimeModelOriginals(root, scope);
    if (model.status !== "Observed" || model.admission_digest !== expectedAdmission || model.task_packet_digest !== digest(String(input.prompt)).value ||
      model.calls.length !== steps.length || ipc.header?.endpoint.model_admission_digest !== expectedAdmission ||
      collection.artifacts.filter(a => a.name.startsWith("model/")).length !== model.artifacts.length) return null;
    for (const originalArtifact of model.artifacts) {
      if (digest(artifact("model/" + originalArtifact.name, 114688)).value !== originalArtifact.digest ||
        digest(bytesAt(originalArtifact.path, 114688)).value !== originalArtifact.digest) return null;
    }
    const modelExchanges = ipc.exchanges.filter(exchange => object(exchange.request).tool === "model_step");
    if (modelExchanges.length !== model.calls.length) return null;
    for (const call of model.calls) {
      const matches = modelExchanges.filter(exchange => object(exchange.request).call_id === call.call_id);
      if (call.state !== "reply_recorded" || !call.response || matches.length !== 1 || !same(matches[0]!.request, call.request) ||
        object(matches[0]!.reply).outcome !== "completed" || !same(object(matches[0]!.reply).receipt, call.response)) return null;
    }
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!, current = modelExchanges.find(exchange => object(exchange.request).call_id === model.calls[i]!.call_id)!;
      const next = i + 1 < model.calls.length ? modelExchanges.find(exchange => object(exchange.request).call_id === model.calls[i + 1]!.call_id)! : null;
      if (step.reason !== (next ? "tool-calls" : "stop") || next && Number(current.ordinal) >= Number(next.ordinal)) return null;
      const effects = correlation.links.filter(link => link.sdk?.message_id === step.message_id);
      if (effects.length !== step.tools.length || effects.some(effect => Number(effect.ordinal) <= Number(current.ordinal) || next && Number(effect.ordinal) >= Number(next.ordinal))) return null;
    }
    for (let i = 0; i < steps.length; i++) {
      const callId = "model_" + String(i + 1).padStart(4, "0"), step = steps[i]!;
      const request = parseAgentRuntimeModelRequest(scope, json(artifact("model/" + callId + "/request.json", 114688)), header.permitted as string[]);
      const saved = object(json(artifact("model/" + callId + "/reply.json", 114688)));
      if (request.call_id !== callId || request.admission_digest !== expectedAdmission || saved.request_digest !== digest(JSON.stringify(request)).value ||
        saved.response_digest !== digest(JSON.stringify(saved.response)).value) return null;
      const response = parseAgentRuntimeModelResponse(saved.response, request), tools = response.content.filter(part => part.type === "tool-call");
      if (step.reason !== (response.finish === "stop" ? "stop" : "tool-calls") || step.text !== response.content.filter(part => part.type === "text").map(part => part.text).join("") || tools.length !== step.tools.length) return null;
      for (const tool of tools) {
        const sdk = step.tools.find(part => part.callID === tool.tool_call_id);
        if (!sdk || sdk.tool !== tool.tool_name || !same(object(sdk.state).input, json(Buffer.from(tool.arguments), 16384))) return null;
      }
    }
    const last = steps[steps.length - 1]!, finalId = "model_" + String(steps.length).padStart(4, "0");
    const reply = object(json(artifact("model/" + finalId + "/reply.json", 114688))), response = object(reply.response);
    if (last.reason !== "stop" || response.finish !== "stop" || !Array.isArray(response.content) || !response.content.length ||
      response.content.some(part => object(part).type !== "text" || typeof object(part).text !== "string") ||
      response.content.map(part => object(part).text).join("") !== last.text || reply.response_digest !== digest(JSON.stringify(reply.response)).value) return null;
    const terminal = json(Buffer.from(last.text), 16384);
    if (!exact(terminal, ["format", "run_id", "operation_key", "input_digest", "definition_ref", "outputs", "summary"]) || terminal.format !== contract.response_format ||
      terminal.run_id !== scope.run_id || terminal.operation_key !== scope.operation_key || !same(terminal.input_digest, scope.context_digest) || !same(terminal.definition_ref, record.definition_ref) ||
      typeof terminal.summary !== "string" || !terminal.summary.trim() || terminal.summary.length > 4000 || !Array.isArray(terminal.outputs) || terminal.outputs.length !== definition.body.outputs.length) return null;
    const calls = new Map<string, { ordinal: number; request: Record<string, unknown>; receipt: Record<string, unknown> }>();
    let lastEdit = -1;
    for (const exchange of ipc.exchanges) {
      const request = object(exchange.request); if (request.tool === "model_step") continue;
      const reply = object(exchange.reply); if (reply.outcome !== "completed" || !id(request.call_id) || calls.has(request.call_id)) return null;
      calls.set(request.call_id, { ordinal: Number(exchange.ordinal), request, receipt: object(reply.receipt) }); if (request.tool === "replace_file") lastEdit = Number(exchange.ordinal);
    }
    const requiredChecks = recipes.map(recipe => {
      const checkId = String(object(recipe).check_id), choices = [...calls.entries()].filter(([, call]) => call.request.tool === "run_check" && call.request.check_id === checkId), latest = choices[choices.length - 1];
      if (!latest || latest[1].ordinal < lastEdit || latest[1].receipt.outcome !== "passed" || latest[1].receipt.exit_code !== 0) throw Error();
      return { check_id: checkId, call_id: latest[0], source_digest: String(latest[1].receipt.source_digest), source_basis_digest: typeof latest[1].receipt.source_basis_digest === "string" ? latest[1].receipt.source_basis_digest : null };
    });
    const indexes = new Set<number>(), outputs: OriginalTaskExecutionResult["outputs"] = [];
    for (const output of terminal.outputs) {
      if (!exact(output, ["output_index", "evidence_call_ids"]) || !Number.isSafeInteger(output.output_index) || (output.output_index as number) < 0 || (output.output_index as number) >= definition.body.outputs.length ||
        indexes.has(output.output_index as number) || !Array.isArray(output.evidence_call_ids) || !output.evidence_call_ids.length || output.evidence_call_ids.length > 16 || new Set(output.evidence_call_ids).size !== output.evidence_call_ids.length) return null;
      for (const callId of output.evidence_call_ids) {
        if (!id(callId) || !calls.has(callId)) return null; const call = calls.get(callId)!;
        if (call.request.tool === "run_check" && !requiredChecks.some(check => check.call_id === callId)) return null;
        if (call.request.tool !== "run_check" && [...calls.values()].some(later => later.ordinal > call.ordinal && later.request.tool === "replace_file" &&
          typeof later.request.path === "string" && typeof call.request.path === "string" && later.request.path.toUpperCase() === call.request.path.toUpperCase())) return null;
      }
      indexes.add(output.output_index as number); outputs.push({ output_index: output.output_index as number, requirement: definition.body.outputs[output.output_index as number]!, evidence_call_ids: output.evidence_call_ids as string[] });
    }
    if (correlation.links.some(link => !link.sdk || link.sdk.session_id !== session || !steps.some(step => step.message_id === link.sdk!.message_id))) return null;
    // Refuse a mixed read if the original model/IPC spine changed while the
    // independent Native and SDK/result evidence was being assembled.
    if (!same(readAgentRuntimeModelOriginals(root, scope), model) || !same(readAgentWorkspaceIpcOriginals(root, scope, String(config.pipe_nonce)), ipc)) return null;
    return { format: "cimiloop/original-task-execution-result/1.0.0", run_id: scope.run_id, operation_key: scope.operation_key, task_packet_digest: digest(String(input.prompt)).value,
      definition_ref: structuredClone(record.definition_ref), sdk: { session_id: last.session_id, message_id: last.message_id, final_model_call_id: finalId, stdout_digest: digest(stdout).value, final_response_digest: reply.response_digest as string },
      outputs: outputs.sort((a, b) => a.output_index - b.output_index), summary: terminal.summary, required_checks: requiredChecks, native_effect_reverified: true,
      model_account_custody_proven: false, costs_reconciled: false, task_acceptance_proven: false, current_workspace_applicability_proven: false };
  } catch { return null; }
}
