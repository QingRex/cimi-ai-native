import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { digest } from "../src/files.js";
import {pinBinary} from "../src/native.js";
import {readRuntimeBinaryOriginal} from "../src/runtime-binary-originals.js";
import { claimAgentRuntimeOperation, requestAgentRuntimeCancellation, queryAgentRuntimeOperation, recoverAgentRuntimeOperation, readAgentRuntimeOriginalIdentity, inspectAgentRuntimeOriginalRegistration } from "../src/agent-runtime-operation.js";

import {AGENT_JOB_RESOURCE_POLICY} from '../src/agent-job-policy.js';
// Constructed scope and owner contract inputs only; no OS or model qualification.
describe("one original Runtime claim per native Run and operation key", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) { if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-runtime-claim-contract-")) throw Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true }); } });
  function setup() {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-runtime-claim-contract-")); roots.push(root);
    const scope = { project_id: createInternalId(), run_id: createInternalId(), operation_key: createInternalId(), executor_actor_id: createInternalId(), context_digest: digest("context"),
      runtime_binding: { binding_ref: { object_type: "provider_binding" as const, id: createInternalId() }, digest: digest("runtime") }, skill_bindings: [],
      host_admission_ref: { provider: "local_content" as const, resource_type: "agent_host_admission" as const, locator: digest("admission").value, digest: digest("admission") } };
    const owner = { pid: 1234, creation_ticks: "123456", image: process.execPath }, input = { mode: "constructed_claim_contract", original: "value" };
    return { root, scope, owner, input };
  }
  it('registers new Job policy as claim2, refuses downgrade and keeps cancellation without observer bytes',()=>{
    const f=setup(),source=join(f.root,'constructed-observer.exe');writeFileSync(source,'constructed observer binary');const pinned=pinBinary(f.root,source),input={...f.input,job_resource_policy:AGENT_JOB_RESOURCE_POLICY,job_observer_original:readRuntimeBinaryOriginal(f.root,pinned.path,pinned.digest.value)},original=claimAgentRuntimeOperation(f.root,f.scope,input,f.owner),path=join(original.claimDirectory,'claim.json'),claim=JSON.parse(readFileSync(path,'utf8'));
    expect(claim.format).toBe('cimiloop/agent-runtime-operation-claim/2.0.0');expect(readAgentRuntimeOriginalIdentity(f.root,f.scope).input).toEqual(input);
    writeFileSync(path,JSON.stringify({...claim,format:'cimiloop/agent-runtime-operation-claim/1.0.0'}));expect(()=>requestAgentRuntimeCancellation(f.root,f.scope)).toThrow('agent_runtime_job_policy_unproven');
    writeFileSync(path,JSON.stringify(claim));rmSync(pinned.path);expect(requestAgentRuntimeCancellation(f.root,f.scope)).toMatchObject({requested:true,stopped_proven:false});expect(existsSync(original.operation)).toBe(false);
  });
  it('rejects partial or widened Job input before registering any Run',()=>{
    for(const input of [{job_resource_policy:AGENT_JOB_RESOURCE_POLICY},{job_resource_policy:{...AGENT_JOB_RESOURCE_POLICY,active_process_limit:2},job_observer_original:{path:'constructed'}}]){const f=setup();expect(()=>claimAgentRuntimeOperation(f.root,f.scope,input,f.owner)).toThrow('agent_runtime_job_policy_unproven');expect(inspectAgentRuntimeOriginalRegistration(f.root,f.scope)).toEqual({status:'absent'});}
  });
  it("refuses a second owner, changed input and rebinding the same Run", () => {
    const f = setup(), original = claimAgentRuntimeOperation(f.root, f.scope, f.input, f.owner), bytes = readFileSync(join(original.claimDirectory, "claim.json"));
    expect(() => claimAgentRuntimeOperation(f.root, f.scope, f.input, { ...f.owner, pid: 2345 })).toThrow("agent_runtime_already_claimed");
    expect(() => claimAgentRuntimeOperation(f.root, f.scope, { original: "different" }, f.owner)).toThrow("agent_runtime_input_conflict");
    expect(() => claimAgentRuntimeOperation(f.root, { ...f.scope, operation_key: createInternalId() }, f.input, f.owner)).toThrow("agent_runtime_claim_unproven");
    expect(readFileSync(join(original.claimDirectory, "claim.json"))).toEqual(bytes); expect(existsSync(original.operation)).toBe(false);
  });
  it("keeps original cancellation available when frozen binary proof can no longer be verified",()=>{
    const f=setup(),source=join(f.root,"constructed.exe");writeFileSync(source,"constructed claim executable");const pinned=pinBinary(f.root,source);
    const input={...f.input,binary_original:readRuntimeBinaryOriginal(f.root,pinned.path,pinned.digest.value)},original=claimAgentRuntimeOperation(f.root,f.scope,input,f.owner);
    expect(readAgentRuntimeOriginalIdentity(f.root,f.scope).input).toEqual(input);
    rmSync(pinned.path);expect(()=>readAgentRuntimeOriginalIdentity(f.root,f.scope)).toThrow();
    expect(requestAgentRuntimeCancellation(f.root,f.scope)).toMatchObject({requested:true,stopped_proven:false});
    expect(existsSync(original.operation)).toBe(false);expect(existsSync(pinned.path)).toBe(false);
  });
  it("binds launcher2 to the frozen controller and preserves cancellation if its bytes disappear",()=>{
    const f=setup(),source=join(f.root,"constructed-controller.exe");writeFileSync(source,"constructed original controller");const pinned=pinBinary(f.root,source),proof=readRuntimeBinaryOriginal(f.root,pinned.path,pinned.digest.value);
    const input={...f.input,sandbox_original:proof},original=claimAgentRuntimeOperation(f.root,f.scope,input,f.owner);mkdirSync(original.operation,{recursive:true});
    const launch={format:"cimiloop/agent-workspace-launcher/2.0.0",launcher_path:pinned.path,launcher_digest:pinned.digest.value,launcher_original:proof};
    writeFileSync(join(original.operation,"original-launcher.json"),JSON.stringify(launch));expect(readAgentRuntimeOriginalIdentity(f.root,f.scope).input).toEqual(input);
    rmSync(pinned.path);expect(()=>readAgentRuntimeOriginalIdentity(f.root,f.scope)).toThrow();expect(requestAgentRuntimeCancellation(f.root,f.scope)).toMatchObject({requested:true,stopped_proven:false});
    writeFileSync(join(original.operation,"original-launcher.json"),JSON.stringify({...launch,format:"cimiloop/agent-workspace-launcher/1.0.0"}));
    expect(()=>readAgentRuntimeOriginalIdentity(f.root,f.scope)).toThrow("agent_runtime_controller_original_unproven");expect(existsSync(pinned.path)).toBe(false);
  });
  it("refuses reuse of one operation key by another Run and retains the incomplete claim", () => {
    const f = setup(); claimAgentRuntimeOperation(f.root, f.scope, f.input, f.owner); const next = { ...f.scope, run_id: createInternalId() };
    expect(() => claimAgentRuntimeOperation(f.root, next, f.input, f.owner)).toThrow("agent_runtime_operation_key_conflict");
    expect(() => claimAgentRuntimeOperation(f.root, next, f.input, f.owner)).toThrow("agent_runtime_claim_incomplete");
  });
  it("preserves missing registration as Unknown and does not convert cancel or recovery to completion", async () => {
    const f = setup(), claim = claimAgentRuntimeOperation(f.root, f.scope, f.input, f.owner);
    expect(await queryAgentRuntimeOperation(f.root, f.scope)).toMatchObject({ status: "Unknown", completion_proven: false, resources_disposed: false });
    expect(requestAgentRuntimeCancellation(f.root, f.scope)).toMatchObject({ requested: true, stopped_proven: false });
    expect(requestAgentRuntimeCancellation(f.root, f.scope)).toMatchObject({ requested: true, stopped_proven: false });
    expect(await recoverAgentRuntimeOperation(f.root, f.scope)).toMatchObject({ outcome: "unknown", completion_proven: false, resources_disposed: false });
    expect(existsSync(claim.operation)).toBe(false);
  });
  it("refuses damaged original input and cancellation records without erasing them", async () => {
    const f = setup(), claim = claimAgentRuntimeOperation(f.root, f.scope, f.input, f.owner), path = join(claim.claimDirectory, "input.json"), original = readFileSync(path);
    writeFileSync(path, JSON.stringify({ changed: true })); await expect(queryAgentRuntimeOperation(f.root, f.scope)).rejects.toThrow("agent_runtime_input_unproven");
    writeFileSync(path, original); requestAgentRuntimeCancellation(f.root, f.scope); writeFileSync(join(claim.claimDirectory, "cancel.json"), '{}');
    expect(() => requestAgentRuntimeCancellation(f.root, f.scope)).toThrow("agent_runtime_cancellation_unproven");
    expect(readFileSync(join(claim.claimDirectory, "cancel.json"), "utf8")).toBe('{}');
  });
  it("never fills an existing partial claim on retry", () => {
    const f = setup(), parent = join(f.root, "agent-runtime-claims", f.scope.project_id, "runs"); mkdirSync(join(parent, f.scope.run_id), { recursive: true });
    expect(() => claimAgentRuntimeOperation(f.root, f.scope, f.input, f.owner)).toThrow("agent_runtime_claim_incomplete");
    expect(existsSync(join(parent, f.scope.run_id, "claim.json"))).toBe(false);
  });
  it("reads the original identity and full input without starting or updating an operation", () => {
    const f = setup(), claim = claimAgentRuntimeOperation(f.root, f.scope, f.input, f.owner), bytes = readFileSync(join(claim.claimDirectory,"claim.json"));
    const original = readAgentRuntimeOriginalIdentity(f.root, f.scope);
    expect(original).toMatchObject({ operation: claim.operation, operation_id: claim.operationId, scope: f.scope, input: f.input,
      claim: { owner: f.owner, synthetic_model_responses: true, formal_agent_execution_enabled: false } });
    if(!original.input||typeof original.input!=="object"||!("original" in original.input))throw Error("Expected original input");
    original.input.original = "Detached mutation";
    expect(readAgentRuntimeOriginalIdentity(f.root, f.scope).input).toEqual(f.input);
    expect(readFileSync(join(claim.claimDirectory,"claim.json"))).toEqual(bytes);expect(existsSync(claim.operation)).toBe(false);
  });
  it("does not return original identity for replaced input or a foreign scope", () => {
    const f = setup(), claim = claimAgentRuntimeOperation(f.root, f.scope, f.input, f.owner);
    expect(()=>readAgentRuntimeOriginalIdentity(f.root,{...f.scope,context_digest:digest("foreign")})).toThrow("agent_runtime_claim_unproven");
    writeFileSync(join(claim.claimDirectory,"input.json"),'{}');
    expect(()=>readAgentRuntimeOriginalIdentity(f.root,f.scope)).toThrow("agent_runtime_input_unproven");
  });
  it("distinguishes local absence from an incomplete operation-key registration", () => {
    const f = setup(); expect(inspectAgentRuntimeOriginalRegistration(f.root, f.scope)).toEqual({ status: "absent" });
    mkdirSync(join(f.root, "agent-runtime-claims", f.scope.project_id, "keys", f.scope.operation_key), { recursive: true });
    expect(inspectAgentRuntimeOriginalRegistration(f.root, f.scope)).toMatchObject({ status: "unknown" });
  });
  it("never describes damaged original input as absent", () => {
    const f = setup(), claim = claimAgentRuntimeOperation(f.root, f.scope, f.input, f.owner);
    expect(inspectAgentRuntimeOriginalRegistration(f.root, f.scope)).toMatchObject({ status: "original", identity: { operation_id: claim.operationId } });
    writeFileSync(join(claim.claimDirectory, "input.json"), "{}");
    expect(inspectAgentRuntimeOriginalRegistration(f.root, f.scope)).toMatchObject({ status: "unknown" });
  });
});
