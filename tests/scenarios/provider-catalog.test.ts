import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { afterEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { CimiLoopKernel, providerBindingIdentity } from "../../packages/kernel/src/index.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import { agentBindingStatus } from "../../packages/kernel/src/providers.js";
import * as v2 from "../../packages/protocol/src/v2/index.js";
import { createFlowProject, flowSuccess, flowTime } from "../fixtures/flow-project.js";
import { createRunProject } from "../fixtures/run-project.js";
import { writeInstance } from "../../apps/cli/src/instance.js";

const dirs: string[] = [], stores: { close(): void }[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
  while (dirs.length) {
    const directory = resolve(dirs.pop()!);
    if (!directory.startsWith(`${resolve(tmpdir())}${sep}cimiloop-provider-`)) throw new Error("unexpected test cleanup target");
    rmSync(directory, { recursive: true, force: true });
  }
});
const temporary = () => { const path = mkdtempSync(join(tmpdir(), "cimiloop-provider-")); dirs.push(path); return path; };
const fixture = (cli = false) => {
  const directory = temporary(), f = createFlowProject(directory, cli ? { databasePath: join(directory, ".cimiloop", "project.db") } : {});
  stores.push(f.store); return f;
};
const digest = { algorithm: "sha256" as const, value: "a".repeat(64) };
const registration = (overrides: Partial<v2.ProviderRegistration> = {}): v2.ProviderRegistration => ({
  provider_kind: "runtime", name: "Fixed Runtime", version: "1.0.0",
  source_ref: { provider: "local", resource_type: "executable", locator: "fixture/runtime.exe", version: "1.0.0", digest },
  capabilities: [{ capability_id: "runtime.run", version: "1.0.0" }], dependencies: [],
  required_permissions: { actions: ["read_files"], resources: [], environment_ids: [], network_hosts: ["model.example.test"] },
  input_schema_ref: { schema_id: "fixture.context", digest }, output_schema_ref: { schema_id: "fixture.result", digest }, ...overrides
});
const register = (f: ReturnType<typeof fixture>, payload = registration()) => {
  const result = flowSuccess(f.kernel.execute(f.projectCommand("RegisterProvider", payload)));
  if (result.command_type !== "RegisterProvider") throw new Error("registration expected");
  return result.data.descriptor;
};
const catalog = (f: { kernel: CimiLoopKernel }) => v2.compileValidator<v2.ProviderCatalogResult>(v2.ProviderCatalogResultSchema)(f.kernel.getProviderCatalog());
const registerAgent = (f: ReturnType<typeof fixture>, identity: v2.ExternalReference) => {
  const result = flowSuccess(f.kernel.execute(f.projectCommand("RegisterActor", { actor_type: "agent", identity_source: "runtime_binding",
    display_name: "Metadata Agent", provider_identity_ref: identity })));
  if (result.command_type !== "RegisterActor" || result.data.actor.actor_type !== "agent") throw new Error("agent expected");
  return result.data.actor;
};
// Test-only binding metadata cannot substitute for native probe/evaluation facts.
const bindingFor = (f: ReturnType<typeof fixture>, descriptor: v2.ProviderDescriptor): v2.ProviderBinding => ({
  schema_version: v2.SCHEMA_VERSION, id: v2.createInternalId(), project_id: f.project.id, producer_actor_id: f.actor.id, created_at: flowTime,
  descriptor_ref: { object_type: "provider_descriptor", id: descriptor.id }, descriptor_digest: contentDigest(descriptor), capability: descriptor.capabilities[0]!,
  resolved_dependencies: descriptor.dependencies, input_schema_ref: descriptor.input_schema_ref, output_schema_ref: descriptor.output_schema_ref,
  effective_permissions: descriptor.required_permissions, probe_evidence_refs: [{ object_type: "evidence", id: v2.createInternalId() }]
});

it("registers one immutable candidate with atomic provenance, replays exactly and preserves the old version", () => {
  const f = fixture(), command = f.projectCommand("RegisterProvider", registration()), revision = f.store.getProject()!.revision;
  const before = { events: f.store.listEvents().length, outbox: f.store.listOutbox().length };
  const result = flowSuccess(f.kernel.execute(command));
  if (result.command_type !== "RegisterProvider") throw new Error("registration expected");
  expect(result.data.descriptor).toMatchObject({ project_id: f.project.id, producer_actor_id: f.actor.id, trust_status: "candidate" });
  expect(result.revision).toBe(revision + 1);
  expect(f.store.listEvents()).toHaveLength(before.events + 1); expect(f.store.listOutbox()).toHaveLength(before.outbox + 1);
  expect(result.events[0]).toMatchObject({ event_type: "ProviderRegistered", payload: { descriptor: result.data.descriptor } });
  expect(() => v2.parseCommandSuccess({ ...result, data: { ...result.data, descriptor: { ...result.data.descriptor,
    trust_status: "evaluated", evaluation_ref: { object_type: "evaluation", id: v2.createInternalId() } } } })).toThrow(v2.ProtocolValidationError);
  const saved = f.store.transaction(tx => tx.getCommandReceipt(command.command_id)); expect(saved?.result).toEqual(result);
  expect(f.kernel.execute(command)).toEqual(result);
  expect(f.kernel.execute({ ...command, payload: registration({ name: "Changed" }) })).toMatchObject({ code: "COMMAND_ID_REUSED" });
  expect(f.store.listEvents()).toHaveLength(before.events + 1);
  const next = register(f, registration({ version: "1.0.1" })); expect(next.id).not.toBe(result.data.descriptor.id);
  expect(f.store.getProviderDescriptor(result.data.descriptor.id)).toEqual(result.data.descriptor);
  const db = new DatabaseSync(f.path);
  try { expect(() => db.prepare("UPDATE immutable_records SET payload_json = ? WHERE id = ?").run("{}", next.id)).toThrow(); }
  finally { db.close(); }
  const view = catalog(f); expect(view.descriptors).toHaveLength(2); expect(view.as_of_event_sequence).toBe(f.store.listEvents().length);
  expect(view.admission[0]).toMatchObject({ descriptor_digest: contentDigest(result.data.descriptor), execution_enabled: false });
});

it("rejects trust/provenance injection, changed same-version manifests, stale project state and unresolved dependencies without writes", () => {
  const f = fixture(), base = register(f), events = f.store.listEvents(), project = f.store.getProject()!;
  const inputs: Array<[unknown, string]> = [
    [f.projectCommand("RegisterProvider", { ...registration({ version: "1.0.1" }), trust_status: "evaluated", evaluation_ref: { object_type: "evaluation", id: v2.createInternalId() } }), "PROTOCOL_VALIDATION_FAILED"],
    [f.projectCommand("RegisterProvider", { ...registration({ version: "1.0.1" }), producer_actor_id: v2.createInternalId() }), "PROTOCOL_VALIDATION_FAILED"],
    [f.projectCommand("RegisterProvider", registration({ source_ref: { ...base.source_ref, digest: { ...digest, value: "b".repeat(64) } } })), "PROVIDER_VERSION_CONFLICT"],
    [{ ...f.projectCommand("RegisterProvider", registration({ version: "1.0.1" })), expected_revision: project.revision - 1 }, "REVISION_CONFLICT"],
    [f.projectCommand("RegisterProvider", registration({ version: "1.0.1", dependencies: [{ descriptor_ref: { object_type: "provider_descriptor", id: v2.createInternalId() }, digest }] })), "DEPENDENCY_UNSATISFIED"],
    [f.projectCommand("RegisterProvider", registration({ version: "1.0.1", dependencies: [{ descriptor_ref: { object_type: "provider_descriptor", id: base.id }, digest }] })), "DEPENDENCY_UNSATISFIED"],
    [f.projectCommand("RegisterProvider", registration({ version: "1.0.1", dependencies: [{ descriptor_ref: { object_type: "provider_descriptor", id: base.id }, digest: contentDigest(base) },
      { descriptor_ref: { object_type: "provider_descriptor", id: base.id }, digest }] })), "DEPENDENCY_UNSATISFIED"]
  ];
  for (const [input, code] of inputs) expect(f.kernel.execute(input)).toMatchObject({ code });
  expect(f.store.listEvents()).toEqual(events); expect(f.store.getProject()).toEqual(project); expect(f.store.listProviderDescriptors()).toEqual([base]);
  const skill = register(f, registration({ provider_kind: "skill", name: "Candidate Skill", dependencies: [{ descriptor_ref: { object_type: "provider_descriptor", id: base.id }, digest: contentDigest(base) }] }));
  expect(catalog(f).admission.find(a => a.descriptor_ref.id === skill.id)?.blockers).toContain("DEPENDENCY_NOT_EVALUATED");
});

it("authenticates the caller before replay and reserves new registration for a Human Project Owner", () => {
  const f = fixture(), command = f.projectCommand("RegisterProvider", registration()), result = flowSuccess(f.kernel.execute(command));
  const agent = registerAgent(f, { provider: "untrusted", resource_type: "session", locator: "metadata-only" });
  const agentKernel = new CimiLoopKernel({ store: f.store, caller: { kind: "agent", project_id: f.project.id, actor_id: agent.id,
    provider_identity_ref: agent.provider_identity_ref }, now: () => flowTime });
  expect(agentKernel.execute(command)).toMatchObject({ code: "CALLER_IDENTITY_MISMATCH" });
  expect(agentKernel.execute({ ...f.projectCommand("RegisterProvider", registration({ version: "1.0.1" })), actor_id: agent.id,
    source: { origin: "agent", producer: "metadata-fixture" } })).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
  expect(new CimiLoopKernel({ store: f.store }).execute(command)).toMatchObject({ code: "CALLER_REQUIRED" });
  expect(f.kernel.execute(command)).toEqual(result); expect(f.store.listProviderDescriptors()).toHaveLength(1);
});

it("rolls back the candidate and project revision if the immutable event cannot be appended", () => {
  const f = fixture(), project = f.store.getProject()!, events = f.store.listEvents(), outbox = f.store.listOutbox(), command = f.projectCommand("RegisterProvider", registration());
  const ids = [v2.createInternalId(), events[0]!.event_id];
  const kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, id: () => ids.shift() ?? v2.createInternalId() });
  expect(kernel.execute(command)).toMatchObject({ code: "STORE_FAILURE" });
  expect(f.store.getProject()).toEqual(project); expect(f.store.listProviderDescriptors()).toEqual([]);
  expect(f.store.listEvents()).toEqual(events); expect(f.store.listOutbox()).toEqual(outbox);
  expect(f.store.transaction(tx => tx.getCommandReceipt(command.command_id))).toBeUndefined();
});

it("checks pinned binding identities and rejects execution even for matching metadata or a declared evaluated descriptor", () => {
  const f = fixture(), descriptor = register(f), binding = bindingFor(f, descriptor);
  f.store.transaction(tx => tx.insertProviderBinding(binding));
  const agent = registerAgent(f, providerBindingIdentity(binding));
  const wrong = registerAgent(f, { ...providerBindingIdentity({ ...binding, id: v2.createInternalId() }), locator: v2.createInternalId() });
  let view = catalog(f), status = view.agent_bindings.find(a => a.actor_ref.id === agent.id)!;
  expect(status).toMatchObject({ identity_matches_binding: true, execution_enabled: false, binding_ref: { id: binding.id } });
  expect(status.blockers).toContain("AGENT_HOST_NOT_CONNECTED");
  expect(view.agent_bindings.find(a => a.actor_ref.id === wrong.id)?.blockers).toContain("PROVIDER_BINDING_NOT_FOUND");
  expect(view.binding_checks[0]?.blockers).toContain("PROVIDER_PROBE_EVIDENCE_SCOPE_UNSUPPORTED");
  expect(v2.parseObjectShowResult(f.kernel.getObject("provider_binding", binding.id)).object).toEqual(binding);
  const claimed: v2.ProviderDescriptor = { ...descriptor, id: v2.createInternalId(), name: "Claimed evaluated metadata", trust_status: "evaluated", evaluation_ref: { object_type: "evaluation", id: v2.createInternalId() } };
  const claimedBinding = bindingFor(f, claimed); claimedBinding.input_schema_ref = { ...claimed.input_schema_ref, schema_id: "wrong.input" };
  f.store.transaction(tx => { tx.insertProviderDescriptor(claimed); tx.insertProviderBinding(claimedBinding); });
  view = catalog(f); expect(view.admission.every(a => !a.execution_enabled)).toBe(true);
  expect(view.binding_checks.find(b => b.binding_ref.id === claimedBinding.id)?.blockers).toEqual(expect.arrayContaining(["PROVIDER_EVALUATION_SCOPE_UNSUPPORTED", "SCHEMA_BINDING_MISMATCH"]));
  expect(() => v2.compileValidator(v2.ProviderCatalogResultSchema)({ ...view, admission: [{ ...view.admission[0], execution_enabled: true }] })).toThrow(v2.ProtocolValidationError);
  // Duplicate Agent runtime locator is prohibited; inspect the mismatched digest
  // through the same shared checker instead of registering a second identity.
  const mismatch = agentBindingStatus(f.store, f.project.id, { ...providerBindingIdentity(binding), digest });
  expect(mismatch.matches).toBe(false); expect(mismatch.blockers).toContain("PROVIDER_IDENTITY_MISMATCH");
});

it("reports Agent binding blockers before context preparation and leaves the actual Task budget and run ledger untouched", () => {
  const f = createRunProject(temporary()); stores.push(f.store);
  const source = f.capture();
  const registered = flowSuccess(f.kernel.execute(f.projectCommand("RegisterActor", { actor_type: "agent", identity_source: "runtime_binding",
    display_name: "Unbound Agent", provider_identity_ref: { provider: "runtime", resource_type: "session", locator: "unbound" } })));
  if (registered.command_type !== "RegisterActor" || registered.data.actor.actor_type !== "agent") throw new Error("agent expected");
  const agent = registered.data.actor, wi = f.authorize(3, undefined, ["src/query.ts"], agent.id);
  const task = f.task(), events = f.store.listEvents(), agentKernel = new CimiLoopKernel({ store: f.store,
    caller: { kind: "agent", project_id: f.project.id, actor_id: agent.id, provider_identity_ref: agent.provider_identity_ref }, now: () => flowTime, runVerifier: f.runPort });
  // Use the actual Agent command shape. The Human-only shape is rejected as
  // INPUT_CHANGED before the provider binding can be checked.
  const command = f.command("PrepareRunContext", "work_item", wi.id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id },
    runtime_binding: { binding_ref: { object_type: "provider_binding", id: v2.createInternalId() }, digest: contentDigest("PUBLIC absent binding") }, skill_bindings: [] }, "executor", agent.id);
  expect(agentKernel.execute({ ...command, source: { origin: "agent", producer: "metadata-fixture" } })).toMatchObject({ code: "CAPABILITY_UNAVAILABLE", details: { blockers: expect.arrayContaining(["PROVIDER_BINDING_NOT_FOUND_OR_STALE"]) } });
  expect(f.task()).toEqual(task); expect(f.store.listEvents()).toEqual(events); expect(f.store.listRuns(f.change.id)).toEqual([]);
}, 45_000);

it("uses real CLI registration, replay, persisted catalogue and inspection with strict input errors", () => {
  const f = fixture(true); writeInstance(join(dirname(f.path), "instance.json"), { schema_version: "1.0.0", instance_id: f.project.instance_id,
    project_id: f.project.id, actor_id: f.actor.id, created_at: flowTime });
  // Directory repositories use .cimiloop for the shared CLI database.
  const path = join(f.directory, "candidate.json"); writeFileSync(path, JSON.stringify(registration()));
  const invoke = (...args: string[]) => spawnSync(process.execPath, ["--no-warnings", resolve("apps/cli/dist/bin.js"), "--json", "--project-dir", f.directory, ...args], { encoding: "utf8", windowsHide: true });
  const commandId = v2.createInternalId(), first = invoke("--command-id", commandId, "provider", "register", "--file", path);
  expect(first.status).toBe(0); const result = v2.parseCommandSuccess(JSON.parse(first.stdout));
  if (result.command_type !== "RegisterProvider") throw new Error("registration expected");
  expect(invoke("--command-id", commandId, "provider", "register", "--file", path).stdout).toBe(first.stdout);
  expect(JSON.parse(invoke("provider", "list").stdout)).toMatchObject({ descriptors: [{ id: result.data.descriptor.id }], admission: [{ execution_enabled: false }] });
  expect(v2.parseObjectShowResult(JSON.parse(invoke("inspect", "provider_descriptor", result.data.descriptor.id).stdout)).object).toEqual(result.data.descriptor);
  writeFileSync(path, JSON.stringify({ ...registration(), trust_status: "evaluated" }));
  expect(invoke("provider", "register", "--file", path).status).toBe(2);
}, 45_000);
