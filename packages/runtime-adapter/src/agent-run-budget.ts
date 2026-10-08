import { mkdirSync, writeFileSync, openSync, fsyncSync, closeSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";
import { parseAgentWorkspaceToolScope, type AgentWorkspaceToolScope } from "./agent-workspace-authority.js";
import { parseAgentRunClock, type AgentRunClockReading } from "./agent-run-clock.js";
import { bytesAt, digest, directory, RuntimeAdapterError } from "./files.js";
import { parseGatewayJson } from "./gateway-conversation.js";

export interface AgentRunBudgetBasis { scope: AgentWorkspaceToolScope; task_id: string; first_started_at: string; max_elapsed_ms: number }
interface Anchor { format: "cimiloop/agent-task-clock-anchor/1.0.0"; project_id: string; task_id: string; first_started_at: string; clock: AgentRunClockReading; task_started_uptime_ms: number }
export interface AgentRunBudgetPorts { basis(): AgentRunBudgetBasis; readClock(signal?: AbortSignal): Promise<AgentRunClockReading> }
const fail = (reason: string): never => { throw new RuntimeAdapterError(reason); };
const basisCopy = (raw: AgentRunBudgetBasis): AgentRunBudgetBasis => {
  const scope = parseAgentWorkspaceToolScope(raw.scope);
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(raw.task_id) || typeof raw.first_started_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw.first_started_at) || !Number.isFinite(Date.parse(raw.first_started_at)) ||
    new Date(raw.first_started_at).toISOString() !== (raw.first_started_at.includes(".") ? raw.first_started_at : raw.first_started_at.replace("Z", ".000Z")) ||
    !Number.isSafeInteger(raw.max_elapsed_ms) || raw.max_elapsed_ms < 1) fail("agent_run_budget_basis_invalid");
  return { scope, task_id: raw.task_id, first_started_at: raw.first_started_at, max_elapsed_ms: raw.max_elapsed_ms };
};
function parseAnchor(raw: unknown): Anchor {
  const value = raw as Anchor;
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "clock,first_started_at,format,project_id,task_id,task_started_uptime_ms" ||
    value.format !== "cimiloop/agent-task-clock-anchor/1.0.0" || typeof value.first_started_at !== "string" || !Number.isFinite(Date.parse(value.first_started_at)) ||
    !Number.isSafeInteger(value.task_started_uptime_ms) || value.task_started_uptime_ms < 0) fail("agent_run_budget_anchor_invalid");
  const clock = parseAgentRunClock(value.clock), started = Date.parse(value.first_started_at);
  if (started < Date.parse(clock.boot_utc) || started > Date.parse(clock.utc) || value.task_started_uptime_ms !== clock.uptime_ms - (Date.parse(clock.utc) - started)) fail("agent_run_budget_anchor_invalid");
  return { ...value, clock };
}
// Host-owned Task clock anchor, shared by subsequent Run / WorkItem scopes.
// No qualification, authority, execution ownership or Run result is inferred here.
export class AgentRunBudget {
  private constructor(private readonly ports: AgentRunBudgetPorts, private readonly originalBasis: AgentRunBudgetBasis, private readonly anchor: Anchor, readonly anchorPath: string) {}
  get basis(): AgentRunBudgetBasis { return basisCopy(this.originalBasis); }
  get nativeDeadlineUptimeMs(): number {
    const deadline = this.anchor.task_started_uptime_ms + this.originalBasis.max_elapsed_ms;
    if (!Number.isSafeInteger(deadline)) fail("agent_run_budget_deadline_invalid"); return deadline;
  }
  static async open(root: string, ports: AgentRunBudgetPorts, signal?: AbortSignal): Promise<AgentRunBudget> {
    signal?.throwIfAborted(); const basis = basisCopy(ports.basis()), clock = parseAgentRunClock(await ports.readClock(signal));
    signal?.throwIfAborted();
    if (!isDeepStrictEqual(basisCopy(ports.basis()), basis)) fail("agent_run_budget_scope_changed");
    const parent = directory(join(root, "agent-task-clocks", basis.scope.project_id)), target = join(parent, basis.task_id), anchorPath = join(target, "anchor.json");
    let created = false;
    try { mkdirSync(target); created = true; } catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error; }
    if (created) {
      const started = Date.parse(basis.first_started_at), before = Date.parse(clock.utc) - started;
      if (started < Date.parse(clock.boot_utc) || before < 0 || before > clock.uptime_ms) fail("agent_run_budget_initial_clock_unproven");
      const anchor: Anchor = { format: "cimiloop/agent-task-clock-anchor/1.0.0", project_id: basis.scope.project_id, task_id: basis.task_id,
        first_started_at: basis.first_started_at, clock, task_started_uptime_ms: clock.uptime_ms - before };
      writeFileSync(anchorPath, JSON.stringify(anchor), { flag: "wx" }); const fd = openSync(anchorPath, "r+"); try { fsyncSync(fd); } finally { closeSync(fd); }
    }
    // Existing directory without the original complete anchor fails closed. Do not
    // overwrite a partial record or invent a new start after a host crash.
    const anchor = parseAnchor(parseGatewayJson(bytesAt(anchorPath, 16384).toString("utf8"), 16384));
    if (anchor.project_id !== basis.scope.project_id || anchor.task_id !== basis.task_id || anchor.first_started_at !== basis.first_started_at) fail("agent_run_budget_anchor_mismatch");
    const budget = new AgentRunBudget(ports, basis, anchor, anchorPath); budget.calculate(clock); return budget;
  }
  assertScope(scope: AgentWorkspaceToolScope): void {
    if (!isDeepStrictEqual(parseAgentWorkspaceToolScope(scope), this.originalBasis.scope) || !isDeepStrictEqual(basisCopy(this.ports.basis()), this.originalBasis)) fail("agent_run_budget_scope_changed");
  }
  private calculate(clock: AgentRunClockReading): number {
    if (clock.machine_digest !== this.anchor.clock.machine_digest || clock.boot_utc !== this.anchor.clock.boot_utc || clock.uptime_ms < this.anchor.clock.uptime_ms) fail("agent_run_budget_boot_changed");
    const wall = Date.parse(clock.utc) - Date.parse(this.basis.first_started_at), monotonic = clock.uptime_ms - this.anchor.task_started_uptime_ms;
    const remaining = this.basis.max_elapsed_ms - Math.max(wall, monotonic, 0);
    if (!Number.isSafeInteger(remaining) || remaining <= 0) fail("agent_run_budget_exhausted"); return remaining;
  }
  async remaining(signal?: AbortSignal): Promise<number> {
    signal?.throwIfAborted(); this.assertScope(this.basis.scope); const started = performance.now(), clock = parseAgentRunClock(await this.ports.readClock(signal));
    signal?.throwIfAborted();
    this.assertScope(this.basis.scope);
    if (!isDeepStrictEqual(parseAnchor(parseGatewayJson(bytesAt(this.anchorPath, 16384).toString("utf8"), 16384)), this.anchor)) fail("agent_run_budget_anchor_changed");
    // Charge the whole observation latency conservatively; a slow clock read
    // cannot grant another preparation / execution window.
    const remaining = this.calculate(clock) - Math.ceil(performance.now() - started);
    if (remaining <= 0) fail("agent_run_budget_exhausted"); return remaining;
  }
  watch(stop: (reason: string) => void): () => void {
    const controller = new AbortController(); let busy = false, closed = false;
    const timer = setInterval(() => {
      if (closed || busy) return; busy = true;
      void this.remaining(controller.signal).catch(error => {
        if (!closed) { stop(error instanceof RuntimeAdapterError ? error.reason : "agent_run_budget_unavailable"); clearInterval(timer); }
      }).finally(() => { busy = false; });
    }, 1000);
    return () => { closed = true; clearInterval(timer); controller.abort(); };
  }
  get anchorDigest(): string { return digest(bytesAt(this.anchorPath, 16384)).value; }
}
