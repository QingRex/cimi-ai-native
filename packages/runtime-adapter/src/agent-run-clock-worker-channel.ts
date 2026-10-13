import { Worker } from "node:worker_threads";
import { parseAgentRunClock, type AgentRunClockReading } from "./agent-run-clock.js";
import { RuntimeAdapterError } from "./files.js";
import { NativeControlError } from "./native.js";
import { exactClockFrame, parseClockWorkerFailure } from "./agent-run-clock-worker-wire.js";

const unproven = () => new RuntimeAdapterError("agent_run_clock_channel_unproven");
type Pending = { resolve(value: AgentRunClockReading): void; reject(error: unknown): void; removeAbort(): void; settled: boolean };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject };
}
// The Worker validates timely Native bytes independently of synchronous Kernel
// work. Main consumption never grants cached time: Budget charges the full delay.
export class WorkerAgentRunClockChannel {
  private readonly state = new Int32Array(new SharedArrayBuffer(24));
  private readonly worker: Worker;
  private readonly ready = deferred<void>();
  private readonly finished = deferred<void>();
  private readonly pending = new Map<number, Pending>();
  private id = 0;
  private failure: unknown;
  private closed = false;
  private closeAcknowledged = false;
  private workerExited = false;
  private closing: Promise<void> | undefined;
  private constructor(binary: string, expected: string) {
    this.worker = new Worker(new URL("../dist/agent-run-clock-worker.js", import.meta.url), { execArgv: [], workerData: { binary, expected, state: this.state.buffer } });
    void this.ready.promise.catch(() => {}); void this.finished.promise.catch(() => {});
    this.worker.on("message", (raw: unknown) => this.receive(raw));
    this.worker.on("error", () => this.fail(unproven()));
    this.worker.once("exit", code => {
      this.workerExited = true;
      if (!this.closeAcknowledged || code !== 0) { this.fail(unproven()); this.finished.reject(this.failure); }
      else this.finished.resolve();
    });
  }
  static async open(binary: string, expected: string, signal?: AbortSignal) {
    if (signal?.aborted) throw new RuntimeAdapterError("agent_run_clock_channel_aborted");
    const channel = new WorkerAgentRunClockChannel(binary, expected);
    const abort = () => { channel.fail(new RuntimeAdapterError("agent_run_clock_channel_aborted")); void channel.close().catch(() => {}); };
    signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
    try { await channel.ready.promise; if (signal?.aborted) throw new RuntimeAdapterError("agent_run_clock_channel_aborted"); return channel; }
    catch (error) { await channel.close().catch(() => {}); throw error; }
    finally { signal?.removeEventListener("abort", abort); }
  }
  private fail(error: unknown) {
    this.failure ??= error; this.closed = true; this.ready.reject(this.failure);
    for (const wait of this.pending.values()) { wait.reject(this.failure); wait.removeAbort(); }
    if (!this.workerExited) this.worker.postMessage({ kind: "close" });
  }
  private receive(raw: unknown) {
    try {
      if (exactClockFrame(raw, "kind") && raw.kind === "ready") { if (!this.closed) this.ready.resolve(); return; }
      if (exactClockFrame(raw, "kind") && raw.kind === "closed") {
        this.closeAcknowledged = true; this.closed = true; this.ready.reject(this.failure ?? unproven()); return;
      }
      if (exactClockFrame(raw, "error,kind") && raw.kind === "failed") { this.fail(parseClockWorkerFailure(raw.error)); return; }
      const id = raw && typeof raw === "object" ? (raw as { id?: unknown }).id : undefined;
      if (!Number.isSafeInteger(id)) throw unproven();
      const wait = this.pending.get(id as number); if (!wait) throw unproven();
      if (exactClockFrame(raw, "id,kind") && raw.kind === "drained") {
        if (!wait.settled) throw unproven(); wait.removeAbort(); this.pending.delete(raw.id as number); return;
      }
      if (wait.settled) throw unproven();
      if (exactClockFrame(raw, "id,kind,reading") && raw.kind === "reply") { wait.settled = true; wait.resolve(parseAgentRunClock(raw.reading)); return; }
      if (exactClockFrame(raw, "error,id,kind") && raw.kind === "rejected") {
        const error = parseClockWorkerFailure(raw.error);
        // Native failure remains the original diagnostic even if transport later
        // dies. Caller-local abort/capacity does not close or poison the channel.
        if (error instanceof NativeControlError) this.failure ??= error;
        wait.settled = true; wait.reject(error); return;
      }
      throw unproven();
    } catch { this.fail(unproven()); }
  }
  read(signal?: AbortSignal): Promise<AgentRunClockReading> {
    if (signal?.aborted) return Promise.reject(new RuntimeAdapterError("agent_run_clock_channel_aborted"));
    if (this.closed) return Promise.reject(this.failure ?? unproven());
    if (this.pending.size >= 16) return Promise.reject(new RuntimeAdapterError("agent_run_clock_channel_capacity"));
    const wait = deferred<AgentRunClockReading>(), id = ++this.id;
    const abort = () => { wait.reject(new RuntimeAdapterError("agent_run_clock_channel_aborted")); this.worker.postMessage({ kind: "abort", id }); };
    this.pending.set(id, { ...wait, settled: false, removeAbort: () => signal?.removeEventListener("abort", abort) });
    signal?.addEventListener("abort", abort, { once: true });
    this.worker.postMessage({ kind: "read", id, started: performance.now() });
    if (signal?.aborted) abort(); return wait.promise;
  }
  snapshot() {
    // Seqlock is diagnostics only. Never infer Native exit from Worker death.
    for (let attempts = 0; attempts < 1000; attempts++) {
      const version = Atomics.load(this.state, 0); if (version % 2) continue;
      const values = Array.from({ length: 5 }, (_, i) => Atomics.load(this.state, i + 1));
      if (version === Atomics.load(this.state, 0)) return { pid: values[0] || null, requests_sent: values[1]!, replies_validated: values[2]!, process_exited: !!values[3], closed: this.closed || !!values[4] };
    }
    throw unproven();
  }
  close(): Promise<void> {
    return this.closing ??= (async () => {
      this.closed = true; for (const wait of this.pending.values()) { wait.reject(this.failure ?? unproven()); wait.removeAbort(); }
      if (!this.workerExited) this.worker.postMessage({ kind: "close" });
      await this.finished.promise;
      if (!this.closeAcknowledged || !this.snapshot().process_exited) throw this.failure ?? unproven();
    })();
  }
}
