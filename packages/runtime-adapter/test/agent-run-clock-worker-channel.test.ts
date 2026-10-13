import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ workers: [] as any[] }));
vi.mock("node:worker_threads", async () => {
  const { EventEmitter } = await import("node:events");
  return { Worker: class extends EventEmitter {
    readonly messages: unknown[] = [];
    readonly state: Int32Array;
    constructor(_url: URL, input: { workerData: { state: SharedArrayBuffer } }) { super(); this.state = new Int32Array(input.workerData.state); mocked.workers.push(this); }
    postMessage(raw: unknown) { this.messages.push(raw); }
  } };
});
import { WorkerAgentRunClockChannel } from "../src/agent-run-clock-worker-channel.js";
import { NativeControlError } from "../src/native.js";
import { parseClockWorkerFailure } from "../src/agent-run-clock-worker-wire.js";
const failure = { format: "cimiloop/native-control-failure/1.0.0" as const, kind: "deadline" as const, operation: "clock_continuous" as const,
  exit_code: null, signal: null, duration_ms: 15000, stdout_bytes: 500, stderr_bytes: 0 };
async function setup() {
  const opening = WorkerAgentRunClockChannel.open("fixed.exe", "a".repeat(64));
  const worker = mocked.workers.at(-1)! as EventEmitter & { state: Int32Array; messages: unknown[] };
  Atomics.store(worker.state, 1, 123); worker.emit("message", { kind: "ready" });
  return { worker, clock: await opening };
}
// Constructed transport tests. These are neither actual Native nor owner-exit proof.
describe("fixed Worker transport preserves original clock failures and custody", () => {
  it("retains the first Native deadline through subsequent Worker death and close", async () => {
    const { clock, worker } = await setup(), pending = clock.read();
    const rejected = expect(pending).rejects.toBeInstanceOf(NativeControlError);
    worker.emit("message", { kind: "rejected", id: 1, error: { reason: "native_control_unavailable", control: failure } }); await rejected;
    worker.emit("error", Error("must never expose stack")); worker.emit("exit", 1);
    await expect(clock.read()).rejects.toMatchObject({ controlFailure: failure });
    await expect(clock.close()).rejects.toMatchObject({ controlFailure: failure });
    expect(clock.snapshot()).toMatchObject({ pid: 123, process_exited: false, closed: true });
  });
  it("retains all cancelled original slots until the original drain acknowledgement", async () => {
    const { clock, worker } = await setup();
    for (let id = 1; id <= 16; id++) {
      const stop = new AbortController(), pending = clock.read(stop.signal), rejected = expect(pending).rejects.toThrow("agent_run_clock_channel_aborted"); stop.abort(); await rejected;
      worker.emit("message", { kind: "rejected", id, error: { reason: "agent_run_clock_channel_aborted", control: null } });
    }
    await expect(clock.read()).rejects.toThrow("agent_run_clock_channel_capacity");
    worker.emit("message", { kind: "drained", id: 1 });
    const next = clock.read(), reject = expect(next).rejects.toThrow();
    expect(worker.messages.filter((raw: any) => raw.kind === "read")).toHaveLength(17);
    const closing = clock.close(); Atomics.store(worker.state, 4, 1); Atomics.store(worker.state, 5, 1);
    worker.emit("message", { kind: "closed" }); worker.emit("exit", 0); await reject; await closing;
  });
  it("refuses to treat Worker exit or close acknowledgement as Native exit proof", async () => {
    const { clock, worker } = await setup(), closing = clock.close(), rejected = expect(closing).rejects.toThrow("agent_run_clock_channel_unproven");
    worker.emit("message", { kind: "closed" }); worker.emit("exit", 0); await rejected;
    expect(clock.snapshot()).toMatchObject({ pid: 123, process_exited: false, closed: true });
  });
  it("reconstructs safe Native errors and refuses arbitrary diagnostic fields", () => {
    expect(parseClockWorkerFailure({ reason: "native_control_unavailable", control: failure })).toBeInstanceOf(NativeControlError);
    expect(parseClockWorkerFailure({ reason: "native_control_unavailable", control: { ...failure, stack: "private" } })).toMatchObject({ reason: "agent_run_clock_channel_unproven" });
    expect(parseClockWorkerFailure({ reason: "private unknown reason", control: null })).toMatchObject({ reason: "agent_run_clock_channel_unproven" });
  });
});
