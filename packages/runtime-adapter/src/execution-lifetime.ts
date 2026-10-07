import { performance } from "node:perf_hooks";
import { RuntimeAdapterError } from "./files.js";

// One host-owned lifetime covers preparation, connection and execution. Nested
  // callbacks receive its signal; they cannot renew the original elapsed budget.
export class ExecutionLifetime {
  private readonly controller = new AbortController();
  private readonly started = performance.now();
  private readonly timer: ReturnType<typeof setTimeout>;
  private reason?: string;
  private readonly externalStop = () => this.stop("workspace_rehearsal_aborted");
  constructor(private readonly maximumMs: number, private readonly external?: AbortSignal) {
    if (!Number.isSafeInteger(maximumMs) || maximumMs < 1 || maximumMs > 180000) throw new RuntimeAdapterError("execution_lifetime_invalid");
    this.timer = setTimeout(() => this.stop("workspace_rehearsal_deadline"), maximumMs);
    external?.addEventListener("abort", this.externalStop, { once: true });
    if (external?.aborted) this.externalStop();
  }
  get signal(): AbortSignal { return this.controller.signal; }
  stop(reason: string): void {
    if (this.reason) return;
    this.reason = reason; this.controller.abort();
  }
  check(): void {
    if (!this.reason && performance.now() - this.started >= this.maximumMs) this.stop("workspace_rehearsal_deadline");
    if (this.reason) throw new RuntimeAdapterError(this.reason);
  }
  get interruptionReason(): string | null { return this.reason ?? null; }
  // A trusted callback may fail to cooperate. Stop waiting, but request closure of any
  // late resource it returns; never resume the original Runtime after expiry.
  wait<T>(pending: Promise<T>, late?: (value: T) => void | Promise<void>): Promise<T> {
    return new Promise((resolve, reject) => {
      let finished = false;
      const stopped = () => { if (!finished) { finished = true; this.signal.removeEventListener("abort", stopped); reject(new RuntimeAdapterError(this.reason ?? "workspace_rehearsal_aborted")); } };
      this.signal.addEventListener("abort", stopped, { once: true });
      if (this.signal.aborted) stopped();
      pending.then(value => {
        if (finished) { if (this.signal.aborted && late) void Promise.resolve().then(() => late(value)).catch(() => {}); return; }
        try { this.check(); } catch { stopped(); if (late) void Promise.resolve().then(() => late(value)).catch(() => {}); return; }
        finished = true; this.signal.removeEventListener("abort", stopped); resolve(value);
      }, error => { if (!finished) { finished = true; this.signal.removeEventListener("abort", stopped); reject(error); } });
    });
  }
  dispose(): void { clearTimeout(this.timer); this.external?.removeEventListener("abort", this.externalStop); }
}
