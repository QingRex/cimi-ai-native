import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { digest } from "../src/files.js";
import {pinBinary} from "../src/native.js";
import { readRuntimeBinaryOriginal, withRuntimeBinaryProofTurn } from "../src/runtime-binary-originals.js";
import { AgentWorkspaceCheckHost, parseWorkspaceCheckRecipe } from "../src/workspace-checks.js";
import { parseAgentWorkspaceToolScope } from "../src/agent-workspace-authority.js";

// Constructed Native proof contracts on actual files. Actual AppContainer/Node
// execution remains in the scenarios; no model/production qualification here.
describe("fixed check completion independently revalidates original dispatch and ownership", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-check-originals-")) throw Error("Unsafe cleanup");
    rmSync(root, { recursive: true, force: true });
  } });
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-check-originals-")); roots.push(root);
    const project = { id: createInternalId(), repository_path: root };
    const scope = parseAgentWorkspaceToolScope({ project_id: project.id, run_id: createInternalId(), operation_key: createInternalId(), executor_actor_id: createInternalId(),
      context_digest: digest("context"), runtime_binding: { binding_ref: { object_type: "provider_binding", id: createInternalId() }, digest: digest("binding") }, skill_bindings: [],
      host_admission_ref: { provider: "local_content", resource_type: "agent_host_admission", locator: digest("admission").value, digest: digest("admission") } });
    const policy = { format: "cimiloop/workspace-check-policy/1.0.0", project_id: project.id, repository_path_digest: digest(realpathSync(root).toLowerCase()).value,
      root_identity: { volume_serial: "12345678", file_index: "0000000000000001" }, node_digest: digest("constructed binary").value, maximum_calls: 128 };
    const call = { format: "cimiloop/workspace-check-call/1.0.0", call_id: "sdk_original", check_id: "original_check" }, source = "export const check = 1;\n";
    const recipe = parseWorkspaceCheckRecipe({ check_id: call.check_id, profile: "node_syntax", entry: "src/check.mjs", inputs: [{ path: "src/check.mjs", expected_digest: digest(source).value }],
      max_elapsed_ms: 1000, max_output_bytes: 16384 }, scope);
    const input = { scope, call, recipe, policy_digest: digest(JSON.stringify(policy)).value, authority_basis: [digest("authority").value, digest("read authority").value] };
    const parent = join(root, "workspace-checks", project.id), operation = join(parent, digest(JSON.stringify([scope.run_id, call.call_id])).value);
    const sandbox = join(operation, "sandbox"), workspace = join(sandbox, "workspace"), nonce = randomUUID(), profile = "CimiLoop." + nonce.replaceAll("-", "");
    mkdirSync(join(workspace, "src"), { recursive: true });
    const save = (name: string, body: unknown) => writeFileSync(join(operation, name), JSON.stringify(body));
    writeFileSync(join(parent, "policy.json"), JSON.stringify({ policy, policy_digest: input.policy_digest }));
    writeFileSync(join(workspace, recipe.entry), source); writeFileSync(join(operation, "stdout.raw"), ""); writeFileSync(join(operation, "stderr.raw"), "");
    const binary = join(operation, "constructed.exe"); writeFileSync(binary, "constructed binary");
    const owner = { pid: process.pid, creation_ticks: "1", image: process.execPath }, nativeIdentity = { pid: 11, creation_ticks: "2", image: binary }, runtimeIdentity = { pid: 12, creation_ticks: "3", image: binary };
    const inputDigest = digest(JSON.stringify(input)).value, sources = recipe.inputs.map(file => ({ path: file.path, digest: file.expected_digest })), sourceDigest = digest(JSON.stringify(sources)).value;
    save("request.json", { format: "cimiloop/workspace-check-request/1.0.0", input, input_digest: inputDigest, nonce, owner, root: sandbox, binary, launcher: binary, launcher_digest: policy.node_digest });
    save("dispatch.json", { input_digest: inputDigest, nonce });
    save("native-proof.json", { pid: runtimeIdentity.pid, profile, phase: "ended", reason: "exited", exit_code: 0 });
    save("native-ownership.json", { format: "cimiloop/native-ownership/1.0.0", nonce, root: sandbox, binary, mode: "read", profile,
      native_identity: nativeIdentity, runtime_identity: runtimeIdentity, job_assignment: "atomic_on_create", resources_disposed: true });
    save("execution-policy-proof.json", { pid: runtimeIdentity.pid, operation_key: operation.split(sep).at(-1), schema_version: "2.0.0", scope: "isolated_provider_probe",
      network_mode: "deny_all", enforcement: "appcontainer_no_network_capabilities", cost_mode: "unmetered_probe_only", formal_execution_enabled: false, capability_sids: [] });
    save("sources.json", { sources, source_digest: sourceDigest });
    save("capture.json", { format: "cimiloop/workspace-check-capture/1.0.0", input_digest: inputDigest, total_bytes: 0, captured_bytes: 0, maximum_bytes: recipe.max_output_bytes, exceeded: false });
    const receipt = { format: "cimiloop/workspace-check-receipt/1.0.0", input_digest: inputDigest, run_id: scope.run_id, call_id: call.call_id, profile: recipe.profile, entry: recipe.entry,
      outcome: "passed", exit_code: 0, reason: "exited", stdout_digest: digest("").value, stderr_digest: digest("").value, source_digest: sourceDigest, formal_agent_execution_enabled: false };
    save("receipt.json", { receipt, receipt_digest: digest(JSON.stringify(receipt)).value });
    const record = { run_id: scope.run_id, run_kind: "agent" as const, operation_key: scope.operation_key, executor_ref: { object_type: "actor" as const, id: scope.executor_actor_id },
      input_digest: scope.context_digest, runtime_binding: scope.runtime_binding, skill_bindings: scope.skill_bindings, host_admission_ref: scope.host_admission_ref };
    return { root, scope,call,recipe,policy,input, operation, nonce, inputDigest, save, read: () => AgentWorkspaceCheckHost.readRunOriginals(root, project, record), receipt };
  }
  it("reads the independent complete original check receipt", () => {
    const f = fixture(); expect(f.read()).toMatchObject({ facts: { invocations: 1, unresolved: 0 }, calls: [{ receipt: f.receipt }] });
  });
  it("replays the exact old request1 without rewriting its bytes or executing a new check",async()=>{
    const f=fixture(),binary=join(f.operation,"constructed.exe"),node=pinBinary(f.root,binary),before=readFileSync(join(f.operation,"request.json"));
    const host=Reflect.construct(AgentWorkspaceCheckHost,[{scope:f.scope,recipes:[f.recipe],repositoryPath:f.root,dataDirectory:f.root},null,binary,node,null,join(f.root,"workspace-checks",f.scope.project_id),f.input.policy_digest,f.policy.node_digest]);
    // Constructed authority port; the replay takes no files/spawn/owner port.
    Object.defineProperty(host,"authority",{value:async()=>f.input.authority_basis});
    await expect(host.execute(f.call)).resolves.toEqual({receipt:f.receipt,replay:true,operation:f.operation});
    expect(readFileSync(join(f.operation,"request.json"))).toEqual(before);expect(f.read().facts.invocations).toBe(1);
  });
  it.each(["replaced_file","reinitialized_registry","downgraded_request"])("request3 rejects %s despite identical executable bytes",mode=>{
    const f=fixture(),source=join(f.operation,"constructed.exe"),pinned=pinBinary(f.root,source),proof=readRuntimeBinaryOriginal(f.root,pinned.path,pinned.digest.value);
    const request=JSON.parse(readFileSync(join(f.operation,"request.json"),"utf8")),ownership=JSON.parse(readFileSync(join(f.operation,"native-ownership.json"),"utf8"));
    const input={...request.input,format:"cimiloop/workspace-check-input/2.0.0",binary_original:proof},inputDigest=digest(JSON.stringify(input)).value;
    f.save("request.json",{...request,format:"cimiloop/workspace-check-request/3.0.0",input,input_digest:inputDigest,binary:pinned.path,binary_original:proof});
    for(const name of ["dispatch.json","capture.json"]){const original=JSON.parse(readFileSync(join(f.operation,name),"utf8"));f.save(name,{...original,input_digest:inputDigest});}
    const expectedReceipt={...f.receipt,input_digest:inputDigest};f.save("receipt.json",{receipt:expectedReceipt,receipt_digest:digest(JSON.stringify(expectedReceipt)).value});
    f.save("native-ownership.json",{...ownership,binary:pinned.path,runtime_identity:{...ownership.runtime_identity,image:pinned.path}});
    expect(f.read().calls[0]!.receipt).toEqual(expectedReceipt);
    if(mode==="replaced_file"||mode==="downgraded_request"){unlinkSync(pinned.path);writeFileSync(pinned.path,"constructed binary");
      if(mode==="downgraded_request"){const downgraded=JSON.parse(readFileSync(join(f.operation,"request.json"),"utf8"));downgraded.format="cimiloop/workspace-check-request/1.0.0";delete downgraded.binary_original;f.save("request.json",downgraded);}}
    else {for(const name of ["runtime-binary-originals","runtime-binary-original-claims","runtime-binary-original-registry.json"])rmSync(join(f.root,name),{recursive:true});pinBinary(f.root,source);}
    expect(()=>f.read()).toThrow();expect(readFileSync(pinned.path,"utf8")).toBe("constructed binary");
  });
  it.each(["missing_dispatch", "changed_dispatch", "contradictory_not_started", "changed_nonce", "changed_pid", "changed_policy", "changed_launcher_digest", "changed_binary", "missing_binary"])("refuses %s even when the IPC receipt could still match", mode => {
    const f = fixture();
    if (mode === "missing_dispatch") unlinkSync(join(f.operation, "dispatch.json"));
    if (mode === "changed_dispatch") f.save("dispatch.json", { input_digest: digest("foreign").value, nonce: f.nonce });
    if (mode === "contradictory_not_started") f.save("not-started.json", { input_digest: f.inputDigest, nonce: f.nonce });
    const change = (name: string, value: unknown) => f.save(name, { ...JSON.parse(readFileSync(join(f.operation, name), "utf8")), ...value as object });
    if (mode === "changed_nonce") change("native-ownership.json", { nonce: randomUUID() });
    if (mode === "changed_pid") change("native-proof.json", { pid: 99 });
    if (mode === "changed_policy") change("execution-policy-proof.json", { network_mode: "allow_all" });
    if (mode === "changed_launcher_digest") change("request.json", { launcher_digest: digest("foreign launcher").value });
    if (mode === "changed_binary") writeFileSync(join(f.operation, "constructed.exe"), "changed binary");
    if (mode === "missing_binary") unlinkSync(join(f.operation, "constructed.exe"));
    expect(f.read).toThrow();
  });
  it("rejects the same run ids when repository, executor, or input identity differs, including inside one proof turn", () => {
    const f = fixture(), project = { id: f.scope.project_id, repository_path: f.root };
    const record = { run_id: f.scope.run_id, run_kind: "agent" as const, operation_key: f.scope.operation_key, executor_ref: { object_type: "actor" as const, id: f.scope.executor_actor_id },
      input_digest: f.scope.context_digest, runtime_binding: f.scope.runtime_binding, skill_bindings: f.scope.skill_bindings, host_admission_ref: f.scope.host_admission_ref };
    const foreign = join(f.root, "PUBLIC-foreign-repository"); mkdirSync(foreign);
    const changed = [
      { ...project, repository_path: foreign },
    ];
    const read = (nextProject: typeof project, nextRecord: typeof record) => AgentWorkspaceCheckHost.readRunOriginals(f.root, nextProject, nextRecord);
    expect(() => read(changed[0]!, record)).toThrow(/workspace_check_policy_conflict/);
    expect(() => withRuntimeBinaryProofTurn(() => { read(project, record); return read(changed[0]!, record); })).toThrow(/workspace_check_policy_conflict/);
    const otherExecutor = { ...record, executor_ref: { object_type: "actor" as const, id: createInternalId() } };
    const otherInput = { ...record, input_digest: digest("PUBLIC different context") };
    const otherBinding = { ...record, runtime_binding: { ...record.runtime_binding, digest: digest("PUBLIC different binding") } };
    for (const next of [otherExecutor, otherInput, otherBinding]) {
      expect(() => read(project, next)).toThrow(/workspace_check_run_mismatch/);
      expect(() => withRuntimeBinaryProofTurn(() => { read(project, record); return read(project, next); })).toThrow(/workspace_check_run_mismatch/);
    }
    const replay = withRuntimeBinaryProofTurn(() => { const first = read(project, record); expect(read(project, record)).toEqual(first); return first; });
    expect(replay.facts.invocations).toBe(1);
  });
});
