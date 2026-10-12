import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { digest } from "../src/files.js";
import { AgentWorkspaceIpcJournal, readAgentWorkspaceIpcOriginals } from "../src/agent-workspace-ipc-journal.js";
import { agentWorkspaceIpcInvocation, agentWorkspaceIpcScopeDigest } from "../src/agent-workspace-ipc.js";
import { parseAgentWorkspaceToolScope } from "../src/agent-workspace-authority.js";
import { WorkspaceToolJournal, WORKSPACE_TOOL_SLOT_BYTES, type WorkspaceToolPolicy } from "../src/workspace-tool-journal.js";
import { readAgentRuntimeNativeResult } from "../src/agent-runtime-result.js";

// Real read-only SQLite/IPC records; constructed Native and authority contracts.
// These cases do not establish OS effects, model or account qualification.
describe("original parent Skill receipts require an independent result reader", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-parent-result-contract-")) throw Error("Unsafe cleanup");
    rmSync(root, { recursive: true, force: true });
  } });
  function fixture(state: "completed" | "unknown" = "completed") {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-parent-result-contract-")); roots.push(root);
    const scope = parseAgentWorkspaceToolScope({ project_id: createInternalId(), run_id: createInternalId(), operation_key: createInternalId(),
      executor_actor_id: createInternalId(), context_digest: digest("constructed context"), skill_bindings: [],
      runtime_binding: { binding_ref: { object_type: "provider_binding", id: createInternalId() }, digest: digest("binding") },
      host_admission_ref: { provider: "local_content", resource_type: "agent_host_admission", locator: digest("admission").value, digest: digest("admission") } });
    const frame = { format: "cimiloop/agent-workspace-tool-request/1.0.0", scope_digest: agentWorkspaceIpcScopeDigest(scope),
      call_id: "sdk_original", tool: "read_file", path: "src/file.ts", expected_digest: digest("original").value };
    const input = agentWorkspaceIpcInvocation(scope, frame), owner = { pid: process.pid, creation_ticks: "1", image: process.execPath };
    const policy: WorkspaceToolPolicy = { format: "cimiloop/workspace-tool-journal/1.0.0", scope: "authorized_workspace", project_id: scope.project_id,
      repository_path_digest: digest(realpathSync(root).toLowerCase()).value, root_identity: { volume_serial: "12345678", file_index: "0000000000000001" },
      scope_digest: digest("file scope").value, maximum_entries: 8, maximum_bytes: 8 * WORKSPACE_TOOL_SLOT_BYTES };
    mkdirSync(join(root, "workspace-tools"));
    const journal = new WorkspaceToolJournal(join(root, "workspace-tools", scope.project_id + ".sqlite"), policy, { identity: owner });
    const authority = { change_id: createInternalId(), task_id: createInternalId(), work_item_id: createInternalId(), run_record_id: createInternalId(),
      context_id: createInternalId(), basis_digest: digest("constructed authority") };
    const request = { project_id: input.project_id, run_id: input.run_id, operation_key: input.operation_key, executor_actor_id: input.executor_actor_id,
      context_digest: input.context_digest, action: "read_files", resource: input.path };
    const permit = journal.claim(input, { schema_version: "2.0.0", scope: "human_run_tool_assessment", request, assessed_at: "2026-10-07T00:00:00.000Z",
      as_of_event_sequence: 1, formal_agent_execution_enabled: false, decision: "ALLOW", reasons: [], authority }).permit!;
    const proof = { format: "cimiloop/workspace-native/1.0.0" as const, phase: "prepared" as const, nonce: randomUUID(), input_digest: digest(JSON.stringify(input)).value,
      root_identity: policy.root_identity, file_identity: { volume_serial: "12345678", file_index: "0000000000000002" }, replacement_identity: null,
      before_digest: input.expected_digest, worker: { ...owner, creation_ticks: "2" } };
    journal.prepare(permit, proof); journal.dispatch(permit);
    const receipt = state === "completed" ? journal.complete(permit, { ...proof, phase: "completed", after_digest: input.expected_digest,
      after_file_identity: proof.file_identity, text: "original" }) : null;
    if (!receipt) journal.stop(permit, true); journal.close();
    writeFileSync(join(root, "workspace-tools", scope.project_id + ".json"), JSON.stringify({ format: "cimiloop/workspace-tool-anchor/1.0.0", project_id: scope.project_id,
      repository_path_digest: policy.repository_path_digest, journal_policy_digest: digest(JSON.stringify(policy)).value }));
    const catalog={scope_digest:frame.scope_digest,catalog_digest:digest('PUBLIC fixed child catalog').value,entries:[{skill_alias:'review',method_name:'review',input_alias:'original'}]},skillFrame={format:'cimiloop/agent-parent-skill-request/1.0.0',scope_digest:frame.scope_digest,catalog_digest:catalog.catalog_digest,call_id:'sdk_'+digest('PUBLIC actual SDK identity').value,tool:'run_skill',skill_alias:'review',method_name:'review',input_alias:'original'},output={purpose:'review',findings:[],limitations:['PUBLIC result reader contract, not actual child Native or S1']},skillReceipt={format:'cimiloop/agent-parent-skill-receipt/1.0.0',scope_digest:frame.scope_digest,catalog_digest:catalog.catalog_digest,call_id:skillFrame.call_id,request_digest:digest(JSON.stringify(skillFrame)).value,invocation_id:createInternalId(),invocation_key:createInternalId(),observation_id:createInternalId(),report_digest:digest('PUBLIC independently read report').value,status:'succeeded',output,output_digest:digest(JSON.stringify(output)).value,formal_agent_execution_enabled:false};
    const nonce = randomUUID(), endpoint = { pipe: `\\\\.\\pipe\\CimiLoop.AgentWorkspace.${nonce}`, scope_digest: frame.scope_digest, check_catalog_digest:digest('PUBLIC fixed checks').value,model_admission_digest:digest('PUBLIC fixed model admission').value,parent_skill_catalog_digest:catalog.catalog_digest,
      peer: owner, supervisor: owner, appcontainer_sid: null }, ipc = AgentWorkspaceIpcJournal.create(root, scope, endpoint, nonce, digest("transport").value);
    const reply = { format: "cimiloop/agent-workspace-tool-reply/1.0.0", scope_digest: frame.scope_digest, request_digest: digest(JSON.stringify(frame)).value,
      call_id: frame.call_id, outcome: "completed", receipt, replay: false, reason: null, formal_agent_execution_enabled: false };
    const exchange = (body: unknown = reply) => { const ticket = ipc.request(Buffer.from(JSON.stringify(frame)), reply.request_digest); ipc.reply(ticket, Buffer.from(JSON.stringify(body))); };
    const record = { run_id: scope.run_id, run_kind: "agent" as const, operation_key: scope.operation_key, executor_ref: { object_type: "actor" as const, id: scope.executor_actor_id },
      input_digest: scope.context_digest, runtime_binding: scope.runtime_binding, skill_bindings: scope.skill_bindings, host_admission_ref: scope.host_admission_ref };
    const read = (reader?:unknown) => Reflect.apply(readAgentRuntimeNativeResult,undefined,[root,{id:scope.project_id,repository_path:root},record,scope,readAgentWorkspaceIpcOriginals(root,scope,nonce),undefined,reader]);
    const skillExchange=(receipt:unknown=skillReceipt)=>{const request_digest=digest(JSON.stringify(skillFrame)).value,ticket=ipc.request(Buffer.from(JSON.stringify(skillFrame)),request_digest);ipc.reply(ticket,Buffer.from(JSON.stringify({format:'cimiloop/agent-workspace-tool-reply/1.0.0',scope_digest:frame.scope_digest,request_digest,call_id:skillFrame.call_id,outcome:'completed',receipt,replay:false,reason:null,formal_agent_execution_enabled:false})));};
    const reader={sdkCatalog:catalog,readOriginal(raw:unknown){expect(raw).toEqual(skillFrame);return{receipt:structuredClone(skillReceipt)};}};
    return { root, frame, reply, exchange, read, ipc,skillExchange,skillReceipt,reader,catalog };
  }
  it('joins the exact original SDK call with independently reread known Kernel child output while preserving independent file proof',()=>{const f=fixture();f.exchange();f.skillExchange();expect(f.read(f.reader)).toMatchObject({status:'Verified',matched_calls:2,native_effect_reverified:true,model_account_custody_proven:false,formal_agent_execution_enabled:false});});
  it('keeps Unknown when a completed Skill wire receipt has no independent reader',()=>{const f=fixture();f.exchange();f.skillExchange();expect(f.read()).toMatchObject({status:'Unknown',native_effect_reverified:false});});
  it('refuses a self-consistent wire child output whose independent original observation differs',()=>{const f=fixture();f.exchange();f.skillExchange({...f.skillReceipt,observation_id:createInternalId()});expect(f.read(f.reader)).toMatchObject({status:'Unknown',native_effect_reverified:false});});
  it('consumes and refuses an accidentally asynchronous independent reader without inferring a child effect',async()=>{const f=fixture(),unhandled:unknown[]=[],listener=(reason:unknown)=>unhandled.push(reason);process.on('unhandledRejection',listener);try{f.exchange();f.skillExchange();expect(f.read({...f.reader,readOriginal:()=>Promise.reject(Error('PUBLIC asynchronous reader'))})).toMatchObject({status:'Unknown',native_effect_reverified:false});await new Promise<void>(done=>setImmediate(done));expect(unhandled).toHaveLength(0);}finally{process.removeListener('unhandledRejection',listener);}});
  it('rechecks the original child proof after all Native reads instead of retaining an earlier known receipt',()=>{const f=fixture();let reads=0;f.exchange();f.skillExchange();expect(f.read({...f.reader,readOriginal(raw:unknown){const value=f.reader.readOriginal(raw);if(++reads>1)throw Error('PUBLIC original result no longer provable');return value;}})).toMatchObject({status:'Unknown',native_effect_reverified:false});expect(reads).toBe(2);});
});
