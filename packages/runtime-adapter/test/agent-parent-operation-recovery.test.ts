import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { digest } from "../src/files.js";
import { pinBinary,buildWindowsLauncher } from "../src/native.js";
import { readRuntimeBinaryOriginal } from "../src/runtime-binary-originals.js";
import { claimAgentRuntimeOperation, recoverAgentRuntimeOperation, queryAgentRuntimeOperation, collectAgentRuntimeOperation } from "../src/agent-runtime-operation.js";
import { agentWorkspaceIpcScopeDigest } from "../src/agent-workspace-ipc.js";
import { readOriginalAgentWorkspaceOperation } from "../src/agent-workspace-sandbox-recovery.js";
import {AGENT_JOB_RESOURCE_POLICY} from '../src/agent-job-policy.js';

// Actual original claim/key/input, retained binary custody and production reader.
// Constructed executable bytes/owner only: no Native process or model/Skill qualification.
describe("parent config7 original operation reader and resource-only recovery", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("cimiloop-parent-operation-original-")) throw Error("Unsafe own fixture cleanup");
      rmSync(root, { recursive: true, force: true });
    }
  });
  const setup = (startup=false,privateWrites=false,explicitPackage=false) => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-parent-operation-original-")); roots.push(root);
    const source = join(root, "constructed-runtime.exe"); writeFileSync(source, "PUBLIC constructed runtime bytes, never executed");
    const binary = pinBinary(root, source), proof = readRuntimeBinaryOriginal(root, binary.path, binary.digest.value);
    const scope = { project_id: createInternalId(), run_id: createInternalId(), operation_key: createInternalId(), executor_actor_id: createInternalId(), context_digest: digest("PUBLIC context"),
      runtime_binding: { binding_ref: { object_type: "provider_binding" as const, id: createInternalId() }, digest: digest("PUBLIC runtime") }, skill_bindings: [],
      host_admission_ref: { provider: "local_content" as const, resource_type: "agent_host_admission" as const, locator: digest("PUBLIC admission").value, digest: digest("PUBLIC admission") } };
    const owner = { pid: 1234, creation_ticks: "123456", image: process.execPath }, scope_digest = agentWorkspaceIpcScopeDigest(scope);
    const binding = { format: "cimiloop/agent-parent-skill-binding/1.0.0", scope_digest, catalog_digest: digest("PUBLIC fixed private catalog").value, sdk_catalog_digest: digest("PUBLIC fixed SDK catalog").value };
    const input = { binary_original: proof, parent_skill_original_binding: binding, prompt: "PUBLIC original parent Task packet", lifetime_policy: "agent_task/1.0.0", deadline_uptime_ms: 123456789,
      provider_options: { admission_digest: digest("PUBLIC original model admission").value, parent_skill_tools: "fixed_parent_skill/1.0.0",...(privateWrites?{model_output_profile:'bounded_2048/1.0.0'}:{}) },...(startup?{startup_profile:'bun_interpreter/1.0.0',job_resource_policy:AGENT_JOB_RESOURCE_POLICY,job_observer_original:proof}: {}),...(privateWrites?{writable_storage_profile:explicitPackage?'private_state_only/2.0.0':'private_state_only/1.0.0'}:{}) };
    const claim = claimAgentRuntimeOperation(root, scope, input, owner), nonce = createInternalId();
    const config: Record<string, unknown> = { format: privateWrites?"cimiloop/agent-workspace-sandbox-config/15.0.0":startup?"cimiloop/agent-workspace-sandbox-config/10.0.0":"cimiloop/agent-workspace-sandbox-config/7.0.0",...(startup?{startup_profile:'bun_interpreter/1.0.0'}:{}),...(privateWrites?{writable_storage_profile:explicitPackage?'private_state_only/2.0.0':'private_state_only/1.0.0'}:{}), nonce, root: join(claim.operation, "sandbox"), binary: proof.path, owner, pipe_nonce: createInternalId(), scope_digest,
      elapsed_ms: 600000, provider_options: input.provider_options, deadline_uptime_ms: input.deadline_uptime_ms, prompt: input.prompt, lifetime_policy: input.lifetime_policy, binary_original: proof,
      parent_skill_tools: "fixed_parent_skill/1.0.0", parent_skill_original_binding: binding };
    mkdirSync(claim.operation, { recursive: true }); const path = join(claim.operation, "original-config.json");
    const save = () => writeFileSync(path, JSON.stringify(config)); save();
    return { root, scope, owner, input, claim, proof, config, path, save, read: () => readOriginalAgentWorkspaceOperation({ root, operation: claim.operation, scope }) };
  };
  it("reads the explicitly registered parent mode without fabricating missing Native registration", () => {
    const f = setup(), before = readFileSync(f.path), claimBytes = readFileSync(join(f.claim.claimDirectory, "claim.json"));
    expect(f.read()).toMatchObject({ config: { format: "cimiloop/agent-workspace-sandbox-config/7.0.0", parent_skill_original_binding: f.input.parent_skill_original_binding }, launch: null, resources: null });
    expect(readFileSync(f.path)).toEqual(before); expect(readFileSync(join(f.claim.claimDirectory, "claim.json"))).toEqual(claimBytes);
    expect(existsSync(join(f.claim.operation, "original-launcher.json"))).toBe(false);
  });
  it('recovers the original claim4 without dispatch and refuses a profile2-to-profile1 downgrade',async()=>{
    const f=setup(true,true,true),claimPath=join(f.claim.claimDirectory,'claim.json'),before=readFileSync(claimPath);
    expect(JSON.parse(before.toString()).format).toBe('cimiloop/agent-runtime-operation-claim/4.0.0');
    expect(f.read()).toMatchObject({config:{writable_storage_profile:'private_state_only/2.0.0'},launch:null,resources:null});
    expect(await recoverAgentRuntimeOperation(f.root,f.scope)).toMatchObject({outcome:'unknown',resources_disposed:false,completion_proven:false});
    f.config.writable_storage_profile='private_state_only/1.0.0';f.save();expect(()=>f.read()).toThrow();expect(readFileSync(claimPath)).toEqual(before);
  });
  it('retains config15 private storage in original recovery and refuses erased or historical markers',async()=>{const f=setup(true,true),before=readFileSync(join(f.claim.claimDirectory,'claim.json'));expect(f.read()).toMatchObject({config:{format:'cimiloop/agent-workspace-sandbox-config/15.0.0',writable_storage_profile:'private_state_only/1.0.0'},launch:null,resources:null});expect(await recoverAgentRuntimeOperation(f.root,f.scope)).toMatchObject({outcome:'unknown',resources_disposed:false});delete f.config.writable_storage_profile;f.save();expect(()=>f.read()).toThrow();f.config.writable_storage_profile='private_state_only/1.0.0';f.config.format='cimiloop/agent-workspace-sandbox-config/12.0.0';f.save();expect(()=>f.read()).toThrow();expect(readFileSync(join(f.claim.claimDirectory,'claim.json'))).toEqual(before);});
  it('keeps config10 and claim3 bound to the same original startup policy while missing Native registration stays Unknown',async()=>{
    const f=setup(true),claimPath=join(f.claim.claimDirectory,'claim.json'),before=readFileSync(claimPath);
    expect(JSON.parse(before.toString())).toHaveProperty('format','cimiloop/agent-runtime-operation-claim/3.0.0');
    expect(f.read()).toMatchObject({config:{format:'cimiloop/agent-workspace-sandbox-config/10.0.0',startup_profile:'bun_interpreter/1.0.0'},launch:null,resources:null});
    expect(await recoverAgentRuntimeOperation(f.root,f.scope)).toMatchObject({outcome:'unknown',resources_disposed:false,completion_proven:false});
    expect(readFileSync(claimPath)).toEqual(before);
    f.config.format='cimiloop/agent-workspace-sandbox-config/7.0.0';delete f.config.startup_profile;f.save();
    expect(()=>f.read()).toThrow();expect(readFileSync(claimPath)).toEqual(before);
    const old=setup();old.config.format='cimiloop/agent-workspace-sandbox-config/10.0.0';old.config.startup_profile='bun_interpreter/1.0.0';old.save();
    expect(()=>old.read()).toThrow();
  });
  it("recovers only the same original registration as Unknown without creating Native resources or a new claim", async () => {
    const f = setup(), before = readFileSync(join(f.claim.claimDirectory, "claim.json"));
    expect(await recoverAgentRuntimeOperation(f.root, f.scope)).toMatchObject({ outcome: "unknown", reason: "agent_original_registration_missing", completion_proven: false, resources_disposed: false });
    expect(readFileSync(join(f.claim.claimDirectory, "claim.json"))).toEqual(before); expect(existsSync(join(f.claim.operation, "original-launcher.json"))).toBe(false);
  });
  it("keeps resource-only recovery readable after execution bytes disappear while refusing result identity", async () => {
    const f = setup();
    if (!resolve(f.proof.path).startsWith(resolve(f.root) + sep)) throw Error("Unsafe own fixture target"); rmSync(f.proof.path);
    expect(() => f.read()).toThrow();
    expect(await recoverAgentRuntimeOperation(f.root, f.scope)).toMatchObject({ outcome: "unknown", resources_disposed: false, completion_proven: false });
    expect(existsSync(f.proof.path)).toBe(false);
  });
  it.each(["binding", "prompt", "deadline", "policy", "provider", "owner", "scope", "extra", "binary"] as const)("rejects changed parent %s without rewriting the original claim", field => {
    const f = setup(), before = readFileSync(join(f.claim.claimDirectory, "claim.json"));
    switch (field) {
      case "binding": f.config.parent_skill_original_binding = { ...f.input.parent_skill_original_binding, catalog_digest: digest("PUBLIC substituted catalog").value }; break;
      case "prompt": f.config.prompt = "PUBLIC substituted Task"; break;
      case "deadline": f.config.deadline_uptime_ms = f.input.deadline_uptime_ms + 1; break;
      case "policy": f.config.lifetime_policy = null; break;
      case "provider": f.config.provider_options = { ...f.input.provider_options, parent_skill_tools: "unrestricted" }; break;
      case "owner": f.config.owner = { ...f.owner, pid: 2345 }; break;
      case "scope": f.config.scope_digest = digest("PUBLIC substituted scope").value; break;
      case "extra": f.config.approved = true; break;
      case "binary": f.config.binary_original = { ...f.proof, sha: digest("PUBLIC substituted binary").value }; break;
    }
    f.save(); expect(() => f.read()).toThrow(); expect(readFileSync(join(f.claim.claimDirectory, "claim.json"))).toEqual(before);
  });
  it("refuses parent flags in a downgraded ordinary config even when only provider options carry them", () => {
    const f = setup(); f.config.format = "cimiloop/agent-workspace-sandbox-config/5.0.0";
    delete f.config.parent_skill_tools; delete f.config.parent_skill_original_binding; f.save();
    expect(() => f.read()).toThrow();
  });
  it.each(["read", "recover"] as const)("refuses %s after all saved parent markers are erased while the original claim remains parent", async action => {
    const f = setup(), before = readFileSync(join(f.claim.claimDirectory, "input.json"));
    f.config.format = "cimiloop/agent-workspace-sandbox-config/5.0.0"; delete f.config.parent_skill_tools; delete f.config.parent_skill_original_binding;
    f.config.provider_options = { admission_digest: f.input.provider_options.admission_digest }; f.save();
    if (action === "read") expect(() => f.read()).toThrow(); else await expect(recoverAgentRuntimeOperation(f.root, f.scope)).rejects.toThrow();
    expect(readFileSync(join(f.claim.claimDirectory, "input.json"))).toEqual(before);
  });
  it("requires the original registered parent input rather than accepting a standalone matching config", () => {
    const f = setup(), path = join(f.claim.claimDirectory, "input.json"), before = readFileSync(path); writeFileSync(path, "{}");
    expect(() => f.read()).toThrow(); expect(readFileSync(path, "utf8")).toBe("{}"); expect(before.length).toBeGreaterThan(2);
  });
  it.each([5, 6])("preserves original config%s without adding parent interpretation", version => {
    const f = setup(), scope = { ...f.scope, run_id: createInternalId(), operation_key: createInternalId() };
    const input: Record<string, unknown> = { ...f.input, provider_options: { admission_digest: f.input.provider_options.admission_digest } };
    delete input.parent_skill_original_binding;
    if (version === 6) input.method_original_binding = { format: "cimiloop/agent-named-method-binding/1.0.0", profile_digest: digest("PUBLIC method profile").value,
      header_digest: digest("PUBLIC method header").value, anchor_digest: digest("PUBLIC method anchor").value };
    const claim = claimAgentRuntimeOperation(f.root, scope, input, f.owner), config: Record<string, unknown> = { ...f.config, format: `cimiloop/agent-workspace-sandbox-config/${version}.0.0`,
      root: join(claim.operation, "sandbox"), scope_digest: agentWorkspaceIpcScopeDigest(scope), provider_options: input.provider_options };
    delete config.parent_skill_tools; delete config.parent_skill_original_binding;
    if (version === 6) Object.assign(config, { method_tools: "fixed_named_method/1.0.0", method_original_binding: input.method_original_binding });
    mkdirSync(claim.operation, { recursive: true }); writeFileSync(join(claim.operation, "original-config.json"), JSON.stringify(config));
    const result = readOriginalAgentWorkspaceOperation({ root: f.root, operation: claim.operation, scope });
    expect(result.config.format).toBe(config.format); expect(result.config.parent_skill_original_binding).toBeUndefined(); expect(result.resources).toBeNull();
  });
  it.each([1, 2, 3, 4, 5])("preserves legacy config%s with explicitly absent claim identities as incomplete registration", version => {
    const f = setup(), scope = { ...f.scope, run_id: createInternalId(), operation_key: createInternalId() }, operation = join(f.root, "workspace-tool-rehearsals", createInternalId());
    const config: Record<string, unknown> = { format: `cimiloop/agent-workspace-sandbox-config/${version}.0.0`, nonce: createInternalId(), root: join(operation, "sandbox"),
      binary: f.proof.path, owner: f.owner, pipe_nonce: createInternalId(), scope_digest: agentWorkspaceIpcScopeDigest(scope), elapsed_ms: 60000,
      provider_options: { admission_digest: f.input.provider_options.admission_digest } };
    if (version >= 2) config.deadline_uptime_ms = f.input.deadline_uptime_ms;
    if (version >= 3) config.prompt = "PUBLIC original legacy packet";
    if (version >= 4) config.lifetime_policy = "agent_task/1.0.0";
    if (version === 5) config.binary_original = f.proof;
    mkdirSync(operation, { recursive: true }); writeFileSync(join(operation, "original-config.json"), JSON.stringify(config));
    expect(readOriginalAgentWorkspaceOperation({ root: f.root, operation, scope })).toMatchObject({ config: { format: config.format }, launch: null, resources: null });
    expect(existsSync(join(f.root, "agent-runtime-claims", scope.project_id, "runs", scope.run_id))).toBe(false);
    expect(existsSync(join(f.root, "agent-runtime-claims", scope.project_id, "keys", scope.operation_key))).toBe(false);
  });
  it("queries and collects a fully registered parent through the real reader and Windows identity observer without inventing completion", async () => {
    if (process.platform !== "win32" || process.arch !== "x64") throw Error("Windows x64 identity observation required; skip is not evidence");
    const f = setup(), supervisor = { ...f.owner, pid: 2345, image: f.proof.path }, nonce = String(f.config.nonce), profile = "CimiLoop.AgentWorkspace." + nonce.replaceAll("-", "");
    // These retained controller bytes are never executed. Query uses the actual,
    // independently built Windows identity observer, not this constructed owner.
    // Actual Runtime setup installs it before registration; query now only opens
    // that original helper and never compiles or installs an environment.
    const launch = { format: "cimiloop/agent-workspace-launcher/2.0.0", nonce, owner: f.owner, supervisor, launcher_path: f.proof.path, launcher_digest: f.proof.sha, launcher_original: f.proof };
    const resources = { format: "cimiloop/agent-workspace-resources/1.0.0", nonce, root: f.config.root, binary: f.proof.path, profile,
      scope_digest: f.config.scope_digest, config_digest: digest(readFileSync(f.path)).value, owner: f.owner, supervisor, runtime: null, mapping: null,
      job_name: "Local\\" + profile, job_assignment: "atomic_on_create", phase: "registered", profile_intent: false, profile_was_absent: false, grants_intent: false,
      resources_disposed: false, user_sid: "S-1-5-21-1234", session_id: 0, logon_luid: "0000000000000000" };
    const save = (name: string, value: unknown) => writeFileSync(join(f.claim.operation, name), JSON.stringify(value), { flag: "wx" });
    save("original-launcher.json", launch); save("agent-sandbox-resources.json", resources);
    expect(f.read()).toMatchObject({ launch, resources });
    const before = readFileSync(join(f.claim.claimDirectory, "claim.json"));
    expect(await queryAgentRuntimeOperation(f.root,f.scope)).toMatchObject({status:'Unknown',reason:'agent_original_observer_unavailable',resources_disposed:false});expect(existsSync(join(f.root,'native-process-environment'))).toBe(false);
    await buildWindowsLauncher(f.root);
    expect(await queryAgentRuntimeOperation(f.root, f.scope)).toMatchObject({ status: "Unknown", reason: "agent_original_state_unproven", resources_disposed: false, completion_proven: false });
    const collected = await collectAgentRuntimeOperation(f.root, f.scope);
    expect(collected).toMatchObject({ status: { status: "Unknown", reason: "agent_original_state_unproven" }, domain_observation_produced: false, formal_agent_execution_enabled: false });
    expect(collected.artifacts.map(row => row.name)).toEqual(expect.arrayContaining(["original-config.json", "original-launcher.json", "agent-sandbox-resources.json"]));
    expect(readFileSync(join(f.claim.claimDirectory, "claim.json"))).toEqual(before); expect(existsSync(join(f.claim.operation, "result.json"))).toBe(false);
  }, 120000);
});
