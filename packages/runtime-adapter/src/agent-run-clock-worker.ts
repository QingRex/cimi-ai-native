import { parentPort, workerData } from "node:worker_threads";
import { NativeAgentRunClockChannel } from "./agent-run-clock-channel.js";
import { parseAgentRunClock } from "./agent-run-clock.js";
import { RuntimeAdapterError } from "./files.js";
import { clockWorkerFailure, exactClockFrame } from "./agent-run-clock-worker-wire.js";

// Fixed host transport only. Native protocol, fresh binary checks, original owner
// process PID, queue and deadlines remain entirely in the existing channel.
const port = parentPort;
if (!port || !exactClockFrame(workerData, "binary,expected,state") || typeof workerData.binary !== "string" ||
  typeof workerData.expected !== "string" || !/^[a-f0-9]{64}$/.test(workerData.expected) ||
  !(workerData.state instanceof SharedArrayBuffer) || workerData.state.byteLength !== 24) throw new RuntimeAdapterError("agent_run_clock_channel_unproven");
const state = new Int32Array(workerData.state), boot = new AbortController(), pending = new Map<number, AbortController>();
let clock: NativeAgentRunClockChannel | undefined, closed = false, lastId = 0;
const snapshot = () => {
  if (!clock) return;
  const s = clock.snapshot();
  Atomics.add(state, 0, 1);
  Atomics.store(state, 1, s.pid ?? 0); Atomics.store(state, 2, s.requests_sent); Atomics.store(state, 3, s.replies_validated);
  Atomics.store(state, 4, Number(s.process_exited)); Atomics.store(state, 5, Number(s.closed));
  Atomics.add(state, 0, 1);
};
let closing: Promise<void> | undefined;
const close = () => closing ??= (async () => {
  closed = true; boot.abort(); for (const stop of pending.values()) stop.abort();
  // Await startup as well: an aborted open closes its exact Native child first.
  await opening.catch(() => {});
  if (clock) await clock.close(); snapshot(); clearInterval(pulse);
  port.postMessage({ kind: "closed" }); port.close();
})();
const opening = NativeAgentRunClockChannel.open(workerData.binary, workerData.expected, parseAgentRunClock, boot.signal)
  .then(value => { clock = value; snapshot(); if (!closed) port.postMessage({ kind: "ready" }); })
  .catch(error => { port.postMessage({ kind: "failed", error: clockWorkerFailure(error) }); throw error; });
void opening.catch(() => close());
const pulse = setInterval(snapshot, 20);
port.on("message", (raw: unknown) => {
  if (exactClockFrame(raw, "kind") && raw.kind === "close") { void close(); return; }
  if (exactClockFrame(raw, "id,kind") && raw.kind === "abort" && Number.isSafeInteger(raw.id)) { pending.get(raw.id as number)?.abort(); return; }
  if (closed || !clock || !exactClockFrame(raw, "id,kind,started") || raw.kind !== "read" || !Number.isSafeInteger(raw.id) ||
    (raw.id as number) !== lastId + 1 || typeof raw.started !== "number" || !Number.isFinite(raw.started) || raw.started < 0 || raw.started > performance.now()) {
    port.postMessage({ kind: "failed", error: clockWorkerFailure(null) }); void close(); return;
  }
  lastId = raw.id as number;
  if (pending.size >= 16) { port.postMessage({ kind: "failed", error: clockWorkerFailure(null) }); void close(); return; }
  const id = lastId, stop = new AbortController(), original = clock;
  pending.set(id, stop);
  const read = original.read(stop.signal, raw.started);
  // Capture the original tail before any later read. Abort can reject the caller,
  // but the slot is retained until this original reply is consumed or failed.
  const drained = original.drained();
  void read.then(reading => { snapshot(); port.postMessage({ kind: "reply", id, reading }); },
    error => {
      snapshot(); port.postMessage({ kind: "rejected", id, error: clockWorkerFailure(error) });
      if (original.snapshot().closed) port.postMessage({ kind: "failed", error: clockWorkerFailure(error) });
    })
    .then(() => drained).finally(() => { pending.delete(id); snapshot(); port.postMessage({ kind: "drained", id }); });
});
