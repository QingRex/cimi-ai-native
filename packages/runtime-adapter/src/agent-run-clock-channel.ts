import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { bytesAt, digest, RuntimeAdapterError } from "./files.js";
import { isolatedEnvironment, NativeControlError, type NativeControlFailure } from "./native.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import type { AgentRunClockReading } from "./agent-run-clock.js";

const deadlineMs = 15_000;
const unproven = () => new RuntimeAdapterError("agent_run_clock_channel_unproven");
type Waiting<T> = { resolve(value: T): void; reject(error: unknown): void; started: number; timer: ReturnType<typeof setTimeout> };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function exact(raw: unknown, keys: string): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).sort().join(",") === keys;
}

// Host-only read channel. Cancellation discards an original reply; it never
// sends a replacement read, grants cached time or restarts the helper.
export class NativeAgentRunClockChannel {
  private readonly nonce = randomUUID();
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly ready = deferred<void>();
  private readonly exited = deferred<void>();
  private startup: Waiting<void> | undefined;
  private pending: Waiting<AgentRunClockReading> | undefined;
  private anchor: AgentRunClockReading | undefined;
  private lastUptime = 0;
  private buffer = Buffer.alloc(0);
  private stdoutBytes = 0;
  private stderrBytes = 0;
  private sequence = 0;
  private validated = 0;
  private queued = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private failure: unknown;
  private closed = false;
  private processExited = false;
  private closing: Promise<void> | undefined;

  private constructor(private readonly binary: string, private readonly expected: string,
    private readonly parseReading: (raw: unknown) => AgentRunClockReading) {
    const started = performance.now();
    const timer = setTimeout(() => this.fail(this.control("deadline", "clock_anchor", started)), deadlineMs);
    this.startup = { ...this.ready, started, timer };
    // Keep rejections owned even if a caller stops before consuming startup.
    void this.ready.promise.catch(() => {});
    try {
      if (digest(bytesAt(binary)).value !== expected) throw unproven();
      this.child = spawn(binary, ["--stream"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: isolatedEnvironment() });
    } catch {
      clearTimeout(timer); throw this.control("spawn", "clock_anchor", started);
    }
    this.child.on("error", () => this.fail(this.control("spawn", this.operation(), this.started())));
    this.child.stdin.on("error", () => this.fail(unproven()));
    this.child.stdout.on("data", (chunk: Buffer) => this.receive(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderrBytes += chunk.length; this.fail(this.control("invalid_output", this.operation(), this.started()));
    });
    this.child.once("close", () => {
      this.processExited = true; this.exited.resolve();
      if (!this.closed) this.fail(this.control("exit", this.operation(), this.started()));
    });
    this.child.stdin.write(JSON.stringify({ format: "cimiloop/agent-run-clock-channel-open/1.0.0", nonce: this.nonce, owner_pid: process.pid }) + "\n");
  }
  static async open(binary: string, expected: string, parseReading: (raw: unknown) => AgentRunClockReading, signal?: AbortSignal) {
    if (signal?.aborted) throw new RuntimeAdapterError("agent_run_clock_channel_aborted");
    const channel = new NativeAgentRunClockChannel(binary, expected, parseReading);
    const abort = () => channel.fail(new RuntimeAdapterError("agent_run_clock_channel_aborted"));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    try { await channel.ready.promise; if (signal?.aborted) throw new RuntimeAdapterError("agent_run_clock_channel_aborted"); return channel; }
    catch (error) { await channel.close(); throw error; }
    finally { signal?.removeEventListener("abort", abort); }
  }
  private operation(): NativeControlFailure["operation"] { return this.startup ? "clock_anchor" : "clock_continuous"; }
  private started(): number { return this.startup?.started ?? this.pending?.started ?? performance.now(); }
  private control(kind: NativeControlFailure["kind"], operation: NativeControlFailure["operation"], started: number) {
    return new NativeControlError({ format: "cimiloop/native-control-failure/1.0.0", kind, operation,
      exit_code: this.child?.exitCode ?? null, signal: this.child?.signalCode ?? null,
      duration_ms: Math.max(0, Math.ceil(performance.now() - started)), stdout_bytes: this.stdoutBytes, stderr_bytes: this.stderrBytes });
  }
  private fail(error: unknown) {
    if (this.closed) return;
    this.failure = error; this.closed = true;
    if (this.startup) { clearTimeout(this.startup.timer); this.startup.reject(error); this.startup = undefined; }
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = undefined; }
    // Terminate this exact child handle only; never discover/reopen another PID.
    this.child.kill();
  }
  private receive(chunk: Buffer) {
    if (this.closed) return;
    this.stdoutBytes += chunk.length;
    if (this.stdoutBytes > 8 * 1024 * 1024) { this.fail(unproven()); return; }
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const end = this.buffer.indexOf(10);
      if (end < 0) { if (this.buffer.length > 4096) this.fail(unproven()); return; }
      if (end > 4096) { this.fail(unproven()); return; }
      const bytes = this.buffer.subarray(0, end); this.buffer = this.buffer.subarray(end + 1);
      try {
        const wait = this.startup ?? this.pending;
        if (!wait) throw unproven();
        if (performance.now() - wait.started >= deadlineMs) {
          this.fail(this.control("deadline", this.operation(), wait.started)); return;
        }
        const raw: unknown = parseGatewayJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes), 4096);
        if (this.startup) {
          if (!exact(raw, "format,nonce,owner_creation_ticks,owner_pid,reading") ||
            raw.format !== "cimiloop/agent-run-clock-channel/1.0.0" || raw.nonce !== this.nonce || raw.owner_pid !== process.pid ||
            typeof raw.owner_creation_ticks !== "string" || !/^[1-9]\d{0,18}$/.test(raw.owner_creation_ticks)) throw unproven();
          const reading = this.parseReading(raw.reading);
          this.anchor = reading; this.lastUptime = reading.uptime_ms;
          clearTimeout(this.startup.timer); this.startup.resolve(); this.startup = undefined;
        } else {
          if (!exact(raw, "format,nonce,reading,sequence") || raw.format !== "cimiloop/agent-run-clock-reply/1.0.0" ||
            raw.nonce !== this.nonce || raw.sequence !== this.sequence) throw unproven();
          const reading = this.parseReading(raw.reading);
          if (reading.machine_digest !== this.anchor!.machine_digest || reading.boot_utc !== this.anchor!.boot_utc ||
            reading.uptime_ms < this.lastUptime) throw unproven();
          this.lastUptime = reading.uptime_ms; this.validated++;
          clearTimeout(this.pending!.timer); this.pending!.resolve(reading); this.pending = undefined;
        }
      } catch { this.fail(unproven()); return; }
      if (this.closed) return;
    }
  }
  read(signal?: AbortSignal, enqueuedAt = performance.now()): Promise<AgentRunClockReading> {
    if (signal?.aborted) return Promise.reject(new RuntimeAdapterError("agent_run_clock_channel_aborted"));
    if (this.closed) return Promise.reject(this.failure ?? unproven());
    if (this.queued >= 16) return Promise.reject(new RuntimeAdapterError("agent_run_clock_channel_capacity"));
    if (!Number.isFinite(enqueuedAt) || enqueuedAt < 0 || enqueuedAt > performance.now()) return Promise.reject(unproven());
    const started = enqueuedAt, caller = deferred<AgentRunClockReading>();
    let sent = false, expired: NativeControlError | undefined;
    const timer = setTimeout(() => {
      expired = this.control("deadline", "clock_continuous", started);
      if (sent) this.fail(expired);
      caller.reject(expired);
    }, Math.max(0, deadlineMs - (performance.now() - started)));
    this.queued++;
    const original = this.tail.then(() => {
      if (this.closed) throw this.failure ?? unproven();
      if (expired || performance.now() - started >= deadlineMs) throw expired ?? this.control("deadline", "clock_continuous", started);
      if (signal?.aborted) throw new RuntimeAdapterError("agent_run_clock_channel_aborted");
      try { if (this.sequence >= 8192 || digest(bytesAt(this.binary)).value !== this.expected) throw unproven(); } catch { this.fail(unproven()); throw this.failure; }
      if (performance.now() - started >= deadlineMs) throw this.control("deadline", "clock_continuous", started);
      const waiting = deferred<AgentRunClockReading>();
      this.pending = { ...waiting, started, timer }; this.sequence++; sent = true;
      this.child.stdin.write(JSON.stringify({ format: "cimiloop/agent-run-clock-read/1.0.0", nonce: this.nonce, sequence: this.sequence }) + "\n");
      return waiting.promise;
    });
    this.tail = original.then(() => { this.queued--; clearTimeout(timer); }, () => { this.queued--; clearTimeout(timer); });
    const abort = () => caller.reject(new RuntimeAdapterError("agent_run_clock_channel_aborted"));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    void original.then(caller.resolve, caller.reject).finally(() => signal?.removeEventListener("abort", abort));
    return caller.promise;
  }
  // Internal transport acknowledgement: cancellation does not release its original queue slot.
  drained(): Promise<void> { return this.tail.then(() => {}); }
  snapshot() { return { pid: this.child.pid ?? null, requests_sent: this.sequence, replies_validated: this.validated, process_exited: this.processExited, closed: this.closed }; }
  close(): Promise<void> {
    return this.closing ??= (async () => {
      if (!this.closed) {
        this.closed = true; const error = unproven();
        if (this.startup) { clearTimeout(this.startup.timer); this.startup.reject(error); this.startup = undefined; }
        if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = undefined; }
        this.child.stdin.end();
      }
      if (this.processExited) return;
      const timer = setTimeout(() => this.child.kill(), 5000);
      try { await this.exited.promise; } finally { clearTimeout(timer); }
    })();
  }
}