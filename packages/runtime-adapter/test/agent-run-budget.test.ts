import {withinAgentRuntimeTaskBudget} from "../src/agent-runtime-lifetime.js";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { AgentRunBudget } from "../src/agent-run-budget.js";
import { parseAgentRunClock, type AgentRunClockReading } from "../src/agent-run-clock.js";
import { digest } from "../src/files.js";
import { runOpenCodeWorkspaceToolRehearsal } from "../src/opencode-workspace-rehearsal.js";

// Contract clocks are explicit constructed observations, not actual OS proof.
describe("original Task elapsed budget survives host and Run replacement", () => {
  const roots: string[] = [];
  afterEach(() => { vi.useRealTimers();for (const root of roots.splice(0)) { if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-task-budget-")) throw Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true }); } });
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-task-budget-")); roots.push(root);
    const basis = { scope: { project_id: createInternalId(), run_id: createInternalId(), operation_key: createInternalId(), executor_actor_id: createInternalId(), context_digest: digest("context"),
      runtime_binding: { binding_ref: { object_type: "provider_binding" as const, id: createInternalId() }, digest: digest("runtime") }, skill_bindings: [],
      host_admission_ref: { provider: "local_content" as const, resource_type: "agent_host_admission" as const, locator: digest("admission").value, digest: digest("admission") } },
      task_id: createInternalId(), first_started_at: "2026-10-08T00:00:00.000Z", max_elapsed_ms: 60000 };
    let reading: AgentRunClockReading = { format: "cimiloop/agent-run-clock/1.0.0", utc: "2026-10-08T00:00:10.000Z", boot_utc: "2026-10-07T00:00:00.000Z", uptime_ms: 86410000, machine_digest: digest("machine").value };
    const ports = { basis: () => basis, readClock: async () => reading };
    return { root, basis, ports, clock: (next: Partial<AgentRunClockReading>) => { reading = { ...reading, ...next }; } };
  }
  it("closes its owned clock once without renewing the original Task anchor",async()=>{
    const f=fixture(),closeClock=vi.fn(async()=>{}),readClock=vi.fn(f.ports.readClock);
    const budget=await AgentRunBudget.open(f.root,{...f.ports,readClock,closeClock}),anchor=readFileSync(budget.anchorPath);
    await Promise.all([budget.close(),budget.close()]);expect(closeClock).toHaveBeenCalledTimes(1);
    await expect(budget.remaining()).rejects.toThrow("agent_run_budget_closed");expect(readClock).toHaveBeenCalledTimes(1);
    expect(readFileSync(budget.anchorPath)).toEqual(anchor);
  });
  it("reopens the original anchor and charges elapsed time despite a backwards wall clock", async () => {
    const f = fixture(), first = await AgentRunBudget.open(f.root, f.ports), bytes = readFileSync(first.anchorPath);
    f.clock({ utc: "2026-10-08T00:00:05.000Z", uptime_ms: 86445000 });
    const reopened = await AgentRunBudget.open(f.root, f.ports);
    expect(await reopened.remaining()).toBeLessThanOrEqual(15000); expect(readFileSync(first.anchorPath)).toEqual(bytes);
    f.clock({ utc: "2026-10-08T00:00:05.000Z", uptime_ms: 86460000 });
    await expect(reopened.remaining()).rejects.toThrow("agent_run_budget_exhausted");
  });
  it("shares the same start across another Run and a smaller approved WorkItem budget", async () => {
    const f = fixture(), original = await AgentRunBudget.open(f.root, f.ports);
    f.basis.scope.run_id = createInternalId(); f.basis.scope.operation_key = createInternalId(); f.basis.max_elapsed_ms = 20000;
    f.clock({ utc: "2026-10-08T00:00:15.000Z", uptime_ms: 86415000 });
    const next = await AgentRunBudget.open(f.root, f.ports);
    expect(next.anchorPath).toBe(original.anchorPath); expect(await next.remaining()).toBeLessThanOrEqual(5000);
    expect(() => original.assertScope(original.basis.scope)).toThrow("agent_run_budget_scope_changed");
  });
  it.each([{ boot_utc: "2026-10-07T01:00:00.000Z" }, { machine_digest: digest("other machine").value }, { uptime_ms: 1 }])("refuses a changed OS clock origin %j", async change => {
    const f = fixture(), budget = await AgentRunBudget.open(f.root, f.ports); f.clock(change);
    await expect(budget.remaining()).rejects.toThrow("agent_run_budget_boot_changed");
    await expect(AgentRunBudget.open(f.root, f.ports)).rejects.toThrow("agent_run_budget_boot_changed");
  });
  it("retains a partial claim and does not recreate a lost original anchor", async () => {
    const f = fixture(), budget = await AgentRunBudget.open(f.root, f.ports); rmSync(budget.anchorPath);
    await expect(AgentRunBudget.open(f.root, f.ports)).rejects.toThrow();
    await expect(budget.remaining()).rejects.toThrow();
  });
  it("refuses altered anchors and a new native start time for the same Task", async () => {
    const f = fixture(), budget = await AgentRunBudget.open(f.root, f.ports), original = readFileSync(budget.anchorPath);
    const changed = JSON.parse(original.toString()); changed.clock.machine_digest = digest("edited").value; writeFileSync(budget.anchorPath, JSON.stringify(changed));
    await expect(budget.remaining()).rejects.toThrow("agent_run_budget_anchor_changed");
    writeFileSync(budget.anchorPath, original); f.basis.first_started_at = "2026-10-08T00:00:01.000Z";
    await expect(AgentRunBudget.open(f.root, f.ports)).rejects.toThrow("agent_run_budget_anchor_mismatch");
  });
  it("rechecks native scope after an asynchronous clock read", async () => {
    const f = fixture(), budget = await AgentRunBudget.open(f.root, f.ports);
    f.ports.readClock = async () => { f.basis.scope.context_digest = digest("changed"); return parseAgentRunClock({ format: "cimiloop/agent-run-clock/1.0.0", utc: "2026-10-08T00:00:10.000Z", boot_utc: "2026-10-07T00:00:00.000Z", uptime_ms: 86410000, machine_digest: digest("machine").value }); };
    await expect(budget.remaining()).rejects.toThrow("agent_run_budget_scope_changed");
  });
  it("rejects unknown clock fields and impossible calendar timestamps", () => {
    expect(() => parseAgentRunClock({ format: "cimiloop/agent-run-clock/1.0.0", utc: "2026-02-30T00:00:00.000Z", boot_utc: "2026-01-01T00:00:00.000Z", uptime_ms: 1, machine_digest: digest("machine").value })).toThrow("agent_run_clock_invalid");
    expect(() => parseAgentRunClock({ format: "cimiloop/agent-run-clock/1.0.0", utc: "2026-02-28T00:00:00.000Z", boot_utc: "2026-01-01T00:00:00.000Z", uptime_ms: 1, machine_digest: digest("machine").value, unknown: true })).toThrow("agent_run_clock_invalid");
  });
  it("does not create an anchor when cancellation arrives during clock observation", async () => {
    const f = fixture(), original = f.ports.readClock, external = new AbortController();
    f.ports.readClock = async () => { external.abort(); return original(); };
    await expect(AgentRunBudget.open(f.root, f.ports, external.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(existsSync(join(f.root, "agent-task-clocks"))).toBe(false);
  });
  it("retains the original external stop signal across an asynchronous budget query", async () => {
    const f = fixture(), external = new AbortController();
    const options = { root: f.root, binary: process.execPath, scope: f.basis.scope, signal: external.signal,
      connect: async () => { throw Error("Must not connect"); },
      path: "src/query.ts", expectedDigest: digest("original").value, replacement: "replacement", runBudget: {
        nativeDeadlineUptimeMs: 100000,
        assertScope: () => {}, watch: () => () => {}, remaining: async () => { options.signal = new AbortController().signal; external.abort(); return 30000; }
      } };
    await expect(runOpenCodeWorkspaceToolRehearsal(options)).rejects.toThrow("workspace_rehearsal_aborted");
    expect(existsSync(join(f.root, "tools"))).toBe(false);
  });
  it("bounds shared staging by the same Task clock and closes a late resource without renewing its anchor",async()=>{
    vi.useFakeTimers();const f=fixture(),budget=await AgentRunBudget.open(f.root,f.ports),anchor=readFileSync(budget.anchorPath);
    let finish!:(value:{close():void})=>void,arrived!:()=>void;const ready=new Promise<void>(done=>{arrived=done;});let closed!:()=>void;const closure=new Promise<void>(done=>{closed=done;}),close=vi.fn(()=>closed());
    const pending=withinAgentRuntimeTaskBudget(budget,async()=>{arrived();return new Promise<{close():void}>(done=>{finish=done;});},late=>late.close());
    const rejected=expect(pending).rejects.toThrow("agent_run_budget_exhausted");await ready;
    f.clock({utc:"2026-10-08T00:01:00.000Z",uptime_ms:86460000});await vi.advanceTimersByTimeAsync(1000);await rejected;
    finish({close});await closure;expect(close).toHaveBeenCalledTimes(1);
    expect(readFileSync(budget.anchorPath)).toEqual(anchor);expect(f.basis.first_started_at).toBe("2026-10-08T00:00:00.000Z");
  });});
