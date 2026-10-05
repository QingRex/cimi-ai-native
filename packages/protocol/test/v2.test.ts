import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION, ProtocolValidationError, UnsupportedObjectTypeError, UnsupportedSchemaVersionError,
  createInternalId, parseVersionedCommand, parseVersionedCommandResult, parseVersionedChangeListResult,
  parseVersionedRecord, protocolV1 as v1, protocolV2 as v2
} from "../src/index.js";

const at = "2026-10-03T00:00:00.000Z";
it("strictly separates professional raw reports and rejects risk acceptance as evidence invalidation", () => {
  const input = { format: "cimiloop/manual-review/1.0.0", producer_actor_id: createInternalId(), observed_at: at,
    request_input_digest: { algorithm: "sha256", value: "a".repeat(64) }, method: "实际复核", finding: { kind: "evidence_invalidation", claim_keys: ["goal"],
      defect: "wrong_observation", analysis: "原观察存在具体缺陷", correction_evidence_refs: [{ object_type: "evidence", id: createInternalId() }] } };
  const parse = v2.compileValidator(v2.RawProfessionalReviewSchema); expect(parse(input)).toEqual(input);
  expect(() => parse({ ...input, finding: { ...input.finding, defect: "risk_accepted" } })).toThrow(ProtocolValidationError);
  expect(() => parse({ ...input, finding: { ...input.finding, correction_evidence_refs: [] } })).toThrow(ProtocolValidationError);
  expect(() => parse({ ...input, allow: true })).toThrow(ProtocolValidationError);
  expect(() => v2.compileValidator(v2.RawEvidenceResultSchema)(input)).toThrow(ProtocolValidationError);
});
const projectId = createInternalId();
const actorId = createInternalId();
const digest = { algorithm: "sha256" as const, value: "a".repeat(64) };
const metadata = (id = createInternalId()) => ({
  schema_version: v2.SCHEMA_VERSION, id, revision: 1, created_at: at, updated_at: at
});
const change = (): v2.Change => ({
  ...metadata(), project_id: projectId, display_key: "CHG-0001", title: "同一条需求",
  kind: "requirement", lifecycle_state: "Draft", operating_status: "Active", owner_actor_id: actorId,
  priority: 0, source: { origin: "human_cli", producer: "test" }
});
const legacyChange = (): v1.Change => ({
  schema_version: v1.SCHEMA_VERSION, id: createInternalId(), project_id: projectId,
  revision: 1, created_at: at, updated_at: at, display_key: "CHG-0001", title: "M0 原记录",
  lifecycle_state: "Draft", operating_status: "Active", owner_actor_id: actorId,
  source: { origin: "human_cli", producer: "test" }
});
const envelope = () => ({
  schema_version: v2.SCHEMA_VERSION, command_id: createInternalId(), correlation_id: createInternalId(),
  requested_at: at, source: { origin: "human_cli" as const, producer: "test" },
  project_id: projectId, actor_id: actorId, acting_role: "project_owner" as const
});
const createCommand = () => ({ ...envelope(), command_type: "CreateChange", payload: { title: "一句话录入" } });
const descriptor = () => ({
  schema_version: v2.SCHEMA_VERSION, id: createInternalId(), project_id: projectId,
  created_at: at, producer_actor_id: actorId, provider_kind: "skill", name: "澄清候选", version: "1.0.0",
  source_ref: { provider: "git", resource_type: "skill", locator: "repo/skills/clarify", version: "b".repeat(40), digest },
  capabilities: [{ capability_id: "intent.elicitation", version: "1.0.0" }], dependencies: [],
  required_permissions: { actions: [], resources: [], environment_ids: [], network_hosts: [] },
  input_schema_ref: { schema_id: "ClarificationInput.v2", digest },
  output_schema_ref: { schema_id: "ContractProposal.v2", digest }, trust_status: "candidate"
});

describe("explicit protocol versions and historical reads", () => {
  it("keeps the M0 default while exposing explicit v2 entry points", () => {
    expect(v1.SCHEMA_VERSION).toBe("1.0.0");
    expect(CURRENT_SCHEMA_VERSION).toBe("2.0.0");
    expect(v2.SCHEMA_VERSION).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("reads frozen v1 commands and records without adding defaults or migrating them", () => {
    const command = Object.freeze({
      ...envelope(), schema_version: v1.SCHEMA_VERSION, acting_role: undefined,
      command_type: "CreateChange", payload: Object.freeze({ title: "原始输入" })
    });
    const { acting_role: _unused, ...legacyCommand } = command;
    const record = Object.freeze(legacyChange());
    expect(parseVersionedCommand(legacyCommand)).toBe(legacyCommand);
    expect(parseVersionedRecord("change", record)).toBe(record);
    expect(record).not.toHaveProperty("kind");
    expect(() => v2.parseCommand(legacyCommand)).toThrow(ProtocolValidationError);
  });

  it("preserves unversioned historical receipts and validates their original result shape", () => {
    const record = legacyChange();
    const result = Object.freeze({
      ok: true, command_id: createInternalId(), correlation_id: createInternalId(),
      aggregate: { object_type: "change", id: record.id, domain_version: 1 }, revision: 1, events: [],
      data: { change: record }
    });
    expect(parseVersionedCommandResult(result)).toBe(result);
    expect(parseVersionedChangeListResult({ ok: true, changes: [record] })).toEqual({ ok: true, changes: [record] });
    expect(() => parseVersionedCommandResult({ ...result, data: { change: "invalid" } })).toThrow(ProtocolValidationError);
  });

  it("rejects unsupported versions and record types instead of guessing", () => {
    expect(() => parseVersionedCommand({ ...createCommand(), schema_version: "3.0.0" })).toThrow(UnsupportedSchemaVersionError);
    expect(() => parseVersionedRecord("change", { ...change(), schema_version: 2 })).toThrow(UnsupportedSchemaVersionError);
    expect(() => parseVersionedRecord("release_candidate", change())).toThrow(UnsupportedObjectTypeError);
    expect(() => parseVersionedRecord("contract_version", change())).toThrow(ProtocolValidationError);
    expect(() => parseVersionedRecord("toString", change())).toThrow(UnsupportedObjectTypeError);
  });

  it("does not treat a missing v2 result tag as permission to accept the current format", () => {
    const record = change();
    const result = {
      ok: true, command_id: createInternalId(), correlation_id: createInternalId(), revision: 1, events: [],
      aggregate: { object_type: "change", id: record.id }, command_type: "CreateChange", data: { change: record }
    };
    expect(() => parseVersionedCommandResult(result)).toThrow(ProtocolValidationError);
    expect(parseVersionedCommandResult({ ...result, schema_version: v2.SCHEMA_VERSION })).toEqual({
      ...result, schema_version: v2.SCHEMA_VERSION
    });
    expect(() => parseVersionedCommandResult({ ...result, schema_version: "9.0.0" })).toThrow(UnsupportedSchemaVersionError);
  });
});

describe("v2 authority and wire boundaries", () => {
  it("keeps complete strict validation when selecting a command or result branch", () => {
    const record = change(), result = { schema_version: v2.SCHEMA_VERSION, ok: true, command_id: createInternalId(), correlation_id: createInternalId(),
      aggregate: { object_type: "change", id: record.id }, revision: 1, events: [], command_type: "CreateChange", data: { change: record } };
    expect(v2.parseCommandSuccess(result)).toBe(result);
    expect(() => v2.parseCommandResult({ ...result, extra: true })).toThrow(ProtocolValidationError);
    expect(() => v2.parseCommandResult({ ...result, command_type: "UpdateProjectSettings" })).toThrow(ProtocolValidationError);
    expect(() => v2.parseCommandSuccess({ ...result, data: { change: { ...record, priority: -1 } } })).toThrow(ProtocolValidationError);
    expect(() => v2.parseCommand({ ...createCommand(), extra: true })).toThrow(ProtocolValidationError);
    expect(() => v2.parseCommand({ ...createCommand(), command_type: "UnknownCommand" })).toThrow(ProtocolValidationError);
  });

  it("fully validates event payloads inside branch-selected success results", () => {
    const record = change(), event = { schema_version: v2.SCHEMA_VERSION, event_id: createInternalId(), event_type: "ChangeCreated", project_id: projectId,
      aggregate: { object_type: "change", id: record.id }, aggregate_revision: 1, event_sequence: 1, occurred_at: at,
      actor_id: actorId, acting_role: "project_owner", command_id: createInternalId(), correlation_id: createInternalId(), payload: { display_key: "CHG-0001", lifecycle_state: "Draft" } };
    const result = { schema_version: v2.SCHEMA_VERSION, ok: true, command_id: event.command_id, correlation_id: event.correlation_id,
      aggregate: event.aggregate, revision: 1, events: [event], command_type: "CreateChange", data: { change: record } };
    expect(v2.parseCommandSuccess(result)).toBe(result);
    for (const invalid of [{ ...event, payload: { ...event.payload, approved: true } }, { ...event, event_type: "DecisionRecorded", payload: { decision: {} } }, { ...event, actor_id: "fake" }, { ...event, extra: true }]) {
      expect(() => v2.parseCommandSuccess({ ...result, events: [invalid] })).toThrow(ProtocolValidationError);
    }
  });

  it("accepts title-only v2 creation without inventing a target version or contract", () => {
    const command = createCommand();
    expect(parseVersionedCommand(command)).toBe(command);
    expect(command.payload).toEqual({ title: "一句话录入" });
    expect(() => v1.parseCommand(command)).toThrow(ProtocolValidationError);
  });

  it("requires explicit actor context, role and revision on updates", () => {
    const command = {
      ...envelope(), command_type: "PauseChange", target: { object_type: "change", id: createInternalId() },
      expected_revision: 1, payload: { reason: "等待核对" }
    };
    expect(v2.parseCommand(command)).toEqual(command);
    for (const field of ["actor_id", "project_id", "acting_role", "expected_revision", "target"] as const) {
      const invalid: Record<string, unknown> = { ...command };
      delete invalid[field];
      expect(() => v2.parseCommand(invalid)).toThrow(ProtocolValidationError);
    }
    expect(() => v2.parseCommand({ ...command, target: { object_type: "project", id: projectId } })).toThrow(ProtocolValidationError);
    expect(() => v2.parseCommand({ ...command, expected_revision: 0 })).toThrow(ProtocolValidationError);
  });

  it("rejects nested extra fields and undocumented command names", () => {
    expect(() => v2.parseCommand({ ...createCommand(), payload: { title: "录入", approved: true } })).toThrow(ProtocolValidationError);
    expect(() => v2.parseCommand({ ...createCommand(), command_type: "SetStatus" })).toThrow(ProtocolValidationError);
  });

  it("validates all six lifecycle positions without a writable delivery or flow status", () => {
    for (const state of ["Draft", "IntentReady", "Executing", "ReadyForDelivery", "Completed", "Terminated"] as const) {
      const record = state === "Terminated"
        ? { ...change(), lifecycle_state: state, termination_reason: "split" }
        : { ...change(), lifecycle_state: state };
      expect(parseVersionedRecord("change", record)).toEqual(record);
    }
    for (const patch of [{ lifecycle_state: "Planned" }, { delivery_status: "Completed" }, { flow_condition: "Blocked" }]) {
      expect(() => parseVersionedRecord("change", { ...change(), ...patch })).toThrow(ProtocolValidationError);
    }
  });

  it("requires versioned plan/contract refs and explicit pause/termination facts", () => {
    expect(() => parseVersionedRecord("change", { ...change(), contract_ref: { object_type: "contract_version", id: createInternalId() } })).toThrow(ProtocolValidationError);
    expect(() => parseVersionedRecord("change", { ...change(), plan_ref: { object_type: "contract_version", id: createInternalId(), domain_version: 1 } })).toThrow(ProtocolValidationError);
    expect(() => parseVersionedRecord("change", { ...change(), operating_status: "Paused" })).toThrow(ProtocolValidationError);
    expect(() => parseVersionedRecord("change", { ...change(), lifecycle_state: "Terminated" })).toThrow(ProtocolValidationError);
    expect(() => parseVersionedRecord("change", { ...change(), termination_reason: "cancelled" })).toThrow(ProtocolValidationError);
  });

  it("keeps agent identity provenance distinct from a local human", () => {
    const agent = {
      ...metadata(), project_id: projectId, actor_type: "agent", display_name: "执行者",
      identity_source: "runtime_binding",
      provider_identity_ref: { provider: "runtime", resource_type: "actor", locator: "agent-1" }
    };
    expect(parseVersionedRecord("actor", agent)).toEqual(agent);
    expect(() => parseVersionedRecord("actor", { ...agent, identity_source: "git_config" })).toThrow(ProtocolValidationError);
    expect(() => parseVersionedRecord("actor", { ...agent, actor_type: "human" })).toThrow(ProtocolValidationError);
  });

  it("binds result payload types to command types and only allows stable error codes", () => {
    const result = {
      schema_version: v2.SCHEMA_VERSION, ok: true, command_type: "CreateChange",
      command_id: createInternalId(), correlation_id: createInternalId(), revision: 1, events: [],
      aggregate: { object_type: "change", id: createInternalId() }, data: { change: change() }
    };
    expect(v2.parseCommandResult(result)).toEqual(result);
    expect(() => v2.parseCommandResult({ ...result, command_type: "InitializeProject" })).toThrow(ProtocolValidationError);
    const error: v2.DomainError = {
      schema_version: v2.SCHEMA_VERSION, code: "DECISION_STALE", message: "输入已变化", category: "conflict",
      retryable: false, details: { current_revision: 2 }, correlation_id: createInternalId()
    };
    expect(v2.parseCommandResult(error)).toEqual(error);
    expect(() => v2.parseCommandResult({ ...error, code: "ANYTHING_PASSES" })).toThrow(ProtocolValidationError);
  });

  it("rejects arbitrary foundation event payloads while preserving historical events", () => {
    const event = {
      schema_version: v1.SCHEMA_VERSION, event_id: createInternalId(), event_type: "ChangeResumed",
      project_id: projectId, aggregate: { object_type: "change", id: createInternalId() },
      aggregate_revision: 2, event_sequence: 2, occurred_at: at, actor_id: actorId,
      command_id: createInternalId(), correlation_id: createInternalId(), payload: { old_detail: "preserved" }
    };
    expect(parseVersionedRecord("event", event)).toBe(event);
    expect(() => parseVersionedRecord("event", { ...event, schema_version: v2.SCHEMA_VERSION, acting_role: "change_owner" })).toThrow(ProtocolValidationError);
  });
});

describe("versioned skill providers", () => {
  it("requires fixed source, digest and evaluated-trust evidence", () => {
    const candidate = descriptor();
    expect(v2.parseProviderDescriptor(candidate)).toEqual(candidate);
    expect(() => v2.parseProviderDescriptor({ ...candidate, source_ref: { ...candidate.source_ref, digest: { ...digest, value: "abc" } } })).toThrow(ProtocolValidationError);
    expect(() => v2.parseProviderDescriptor({ ...candidate, trust_status: "evaluated" })).toThrow(ProtocolValidationError);
    expect(() => v2.parseProviderDescriptor({ ...candidate, revision: 2 })).toThrow(ProtocolValidationError);
  });

  it("records exact dependency digests and effective permissions on every binding", () => {
    const candidate = descriptor();
    const binding = {
      schema_version: v2.SCHEMA_VERSION, id: createInternalId(), project_id: projectId, created_at: at,
      producer_actor_id: actorId, descriptor_ref: { object_type: "provider_descriptor", id: candidate.id },
      descriptor_digest: digest, capability: candidate.capabilities[0], resolved_dependencies: [],
      input_schema_ref: candidate.input_schema_ref, output_schema_ref: candidate.output_schema_ref,
      effective_permissions: candidate.required_permissions,
      probe_evidence_refs: [{ object_type: "evidence", id: createInternalId() }]
    };
    expect(v2.parseProviderBinding(binding)).toEqual(binding);
    expect(() => v2.parseProviderBinding({ ...binding, probe_evidence_refs: [] })).toThrow(ProtocolValidationError);
    expect(() => v2.parseProviderBinding({ ...binding, resolved_dependencies: [{ descriptor_ref: binding.descriptor_ref }] })).toThrow(ProtocolValidationError);
    expect(() => v2.parseProviderBinding({ ...binding, effective_permissions: { ...binding.effective_permissions, arbitrary_shell: true } })).toThrow(ProtocolValidationError);
  });
});

describe("v2 JSON Schema artifacts", () => {
  it("exports every registered schema with distinct v2 IDs and no stale artifacts", () => {
    const directory = resolve("packages/protocol/schemas/v2");
    const names = readdirSync(directory).filter((name) => name.endsWith(".schema.json")).map((name) => name.replace(".schema.json", "")).sort();
    expect(names).toEqual(Object.keys(v2.protocolSchemas).sort());
    for (const [name, schema] of Object.entries(v2.protocolSchemas)) {
      expect(JSON.parse(readFileSync(resolve(directory, `${name}.schema.json`), "utf8"))).toEqual({
        $schema: "https://json-schema.org/draft/2020-12/schema", $id: `${name}.v2`, ...schema
      });
    }
  });

  it("loads both schema generations into one strict registry and validates their boundaries", () => {
    const registry = new Ajv2020({ strict: true, allErrors: true, inlineRefs: false });
    for (const directory of [resolve("packages/protocol/schemas"), resolve("packages/protocol/schemas/v2")]) {
      for (const name of readdirSync(directory).filter((file) => file.endsWith(".schema.json"))) {
        registry.addSchema(JSON.parse(readFileSync(resolve(directory, name), "utf8")));
      }
    }
    expect(registry.getSchema("CreateChangeCommand.v2")?.(createCommand())).toBe(true);
    expect(registry.getSchema("CreateChangeCommand.v1")?.(createCommand())).toBe(false);
    for (const name of Object.keys(v2.protocolSchemas)) expect(registry.getSchema(`${name}.v2`)).toBeTypeOf("function");
  }, 30_000); // Compiles every full union/artifact, including confirmation records, unlike lazy runtime branch parsing.
});
