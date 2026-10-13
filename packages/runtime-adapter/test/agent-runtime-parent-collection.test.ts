import{pinBinary}from'../src/native.js';import{readRuntimeBinaryOriginal}from'../src/runtime-binary-originals.js';
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
import{AgentRuntimeModelHost,AGENT_PARENT_SKILL_TOOLS}from'../src/agent-runtime-model.js';import{claimAgentRuntimeOperation,collectAgentRuntimeOperation}from'../src/agent-runtime-operation.js';
import { readAgentRuntimeNativeResult } from "../src/agent-runtime-result.js";

// Real read-only SQLite/IPC records; constructed Native and authority contracts.
// These cases do not establish OS effects, model or account qualification.
describe("original parent Runtime collection consumes the installed historical child result reader", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-parent-collect-contract-")) throw Error("Unsafe cleanup");
    rmSync(root, { recursive: true, force: true });
  } });
  async function fixture(state: "completed" | "unknown" = "completed") {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-parent-collect-contract-")); roots.push(root);
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
    const binding={format:'cimiloop/agent-parent-skill-binding/1.0.0',scope_digest:frame.scope_digest,catalog_digest:catalog.catalog_digest,sdk_catalog_digest:digest(JSON.stringify(catalog)).value},prompt=JSON.stringify({format:'cimiloop/agent-runtime-task-packet/3.0.0',parent_skill_catalog:catalog}),runtimeInput={purpose:'agent_runtime',prompt,parent_skill_original_binding:binding,provider_options:{admission_digest:endpoint.model_admission_digest,parent_skill_tools:'fixed_parent_skill/1.0.0'}};
    await AgentRuntimeModelHost.initialize(root,scope,{admission_digest:endpoint.model_admission_digest,async check(){},async execute(){throw Error('No model request allowed');}},[...AGENT_PARENT_SKILL_TOOLS],prompt);
    const claim=claimAgentRuntimeOperation(root,scope,runtimeInput,owner),config={format:'cimiloop/agent-workspace-sandbox-config/7.0.0',nonce,pipe_nonce:nonce,scope_digest:frame.scope_digest,owner,prompt,provider_options:runtimeInput.provider_options,parent_skill_tools:'fixed_parent_skill/1.0.0',parent_skill_original_binding:binding};mkdirSync(join(claim.operation,'sandbox','config'),{recursive:true});writeFileSync(join(claim.operation,'original-config.json'),JSON.stringify(config));writeFileSync(join(claim.operation,'original-launcher.json'),JSON.stringify({supervisor:owner}));writeFileSync(join(claim.operation,'agent-sandbox-original.json'),JSON.stringify({nonce,phase:'suspended',appcontainer_sid:null,peer:owner,supervisor:owner}));writeFileSync(join(claim.operation,'sandbox','config','parent-skill-catalog.json'),JSON.stringify(catalog));
    const collect=(reader?:unknown)=>Reflect.apply(collectAgentRuntimeOperation,undefined,[root,scope,{project:{id:scope.project_id,repository_path:root},record},undefined,reader]);
    const read = (reader?:unknown) => Reflect.apply(readAgentRuntimeNativeResult,undefined,[root,{id:scope.project_id,repository_path:root},record,scope,readAgentWorkspaceIpcOriginals(root,scope,nonce),undefined,reader]);
    const skillExchange=(receipt:unknown=skillReceipt)=>{const request_digest=digest(JSON.stringify(skillFrame)).value,ticket=ipc.request(Buffer.from(JSON.stringify(skillFrame)),request_digest);ipc.reply(ticket,Buffer.from(JSON.stringify({format:'cimiloop/agent-workspace-tool-reply/1.0.0',scope_digest:frame.scope_digest,request_digest,call_id:skillFrame.call_id,outcome:'completed',receipt,replay:false,reason:null,formal_agent_execution_enabled:false})));};
    const reader={sdkCatalog:catalog,readOriginal(raw:unknown){expect(raw).toEqual(skillFrame);return{receipt:structuredClone(skillReceipt)};}};
    return { root, frame, reply, exchange, read, ipc,skillExchange,skillReceipt,reader,catalog,collect,claim,config };
  }
  it('collects exact original catalog bytes and joins Native file and independent child results without dispatching a tool or model',async()=>{const f=await fixture();f.exchange();f.skillExchange();const value=await f.collect(f.reader);expect(value.native).toMatchObject({status:'Verified',matched_calls:2,native_effect_reverified:true,formal_agent_execution_enabled:false});expect(value.artifacts.some((a:any)=>a.name==='parent-skill-catalog.json')).toBe(true);expect(value.status.status).toBe('Unknown');expect(value.domain_observation_produced).toBe(false);expect(value.formal_agent_execution_enabled).toBe(false);});
  it('preserves Unknown and original bytes when the historical child reader is absent',async()=>{const f=await fixture();f.exchange();f.skillExchange();expect((await f.collect()).native).toMatchObject({status:'Unknown',native_effect_reverified:false});});
  it('captures the same trusted child reader before the first collection await',async()=>{const f=await fixture();f.exchange();f.skillExchange();const pending=f.collect(f.reader);f.reader.readOriginal=()=>{throw Error('PUBLIC later method substitution must not run');};expect((await pending).native.status).toBe('Verified');});
  it('refuses changed original catalog bytes without recreating them from the trusted service',async()=>{const f=await fixture();f.exchange();f.skillExchange();writeFileSync(join(f.claim.operation,'sandbox','config','parent-skill-catalog.json'),'{}');expect((await f.collect(f.reader)).native).toMatchObject({status:'Unknown',native_effect_reverified:false});});
  it('refuses a mutually inconsistent saved parent config binding even with valid independent child output',async()=>{const f=await fixture();f.exchange();f.skillExchange();writeFileSync(join(f.claim.operation,'original-config.json'),JSON.stringify({...f.config,parent_skill_original_binding:{...f.config.parent_skill_original_binding,catalog_digest:digest('PUBLIC foreign').value}}));expect((await f.collect(f.reader)).native).toMatchObject({status:'Unknown',native_effect_reverified:false});});
  it.each(['binary_original','sandbox_original'])('keeps original legacy Unknown collection when the previously frozen %s file is lost before launcher/resources exist',async field=>{const root=mkdtempSync(join(tmpdir(),'cimiloop-parent-collect-contract-'));roots.push(root);const scope=parseAgentWorkspaceToolScope({project_id:createInternalId(),run_id:createInternalId(),operation_key:createInternalId(),executor_actor_id:createInternalId(),context_digest:digest('PUBLIC legacy original context'),skill_bindings:[],runtime_binding:{binding_ref:{object_type:'provider_binding',id:createInternalId()},digest:digest('PUBLIC runtime')},host_admission_ref:{provider:'local_content',resource_type:'agent_host_admission',locator:digest('PUBLIC admission').value,digest:digest('PUBLIC admission')}}),source=join(root,'PUBLIC-frozen.exe');writeFileSync(source,'PUBLIC original binary');const pinned=pinBinary(root,source),proof=readRuntimeBinaryOriginal(root,pinned.path,pinned.digest.value),claim=claimAgentRuntimeOperation(root,scope,{purpose:'legacy constructed claim',[field]:proof},{pid:1234,creation_ticks:'1',image:process.execPath});rmSync(pinned.path);const before=JSON.stringify(claim),collected=await collectAgentRuntimeOperation(root,scope);expect(collected.status).toMatchObject({status:'Unknown',reason:'agent_original_registration_missing',resources_disposed:false});expect(collected.native).toMatchObject({status:'Unknown',native_effect_reverified:false});expect(JSON.stringify(claim)).toBe(before);});
});
