import { RuntimeAdapterError } from "./files.js";
import { NativeControlError, type NativeControlFailure } from "./native.js";

const reasons = new Set(["agent_run_clock_channel_unproven", "agent_run_clock_channel_aborted", "agent_run_clock_channel_capacity", "agent_run_clock_invalid"]);
export type ClockWorkerFailure = { reason: string; control: NativeControlFailure | null };
export function clockWorkerFailure(error: unknown): ClockWorkerFailure {
  return error instanceof NativeControlError ? { reason: "native_control_unavailable", control: { ...error.controlFailure } } :
    { reason: error instanceof RuntimeAdapterError && reasons.has(error.reason) ? error.reason : "agent_run_clock_channel_unproven", control: null };
}
export function exactClockFrame(raw: unknown, keys: string): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).sort().join(",") === keys;
}
export function parseClockWorkerFailure(raw: unknown): RuntimeAdapterError {
  const invalid = () => new RuntimeAdapterError("agent_run_clock_channel_unproven");
  if (!exactClockFrame(raw, "control,reason")) return invalid();
  if (raw.control === null) return typeof raw.reason === "string" && reasons.has(raw.reason) ? new RuntimeAdapterError(raw.reason) : invalid();
  const value = raw.control;
  if (raw.reason !== "native_control_unavailable" || !exactClockFrame(value, "duration_ms,exit_code,format,kind,operation,signal,stderr_bytes,stdout_bytes") ||
    value.format !== "cimiloop/native-control-failure/1.0.0" ||
    typeof value.kind !== "string" || !["deadline", "exit", "terminated", "aborted", "spawn", "invalid_output"].includes(value.kind) ||
    typeof value.operation !== "string" || !["clock_anchor", "clock_continuous"].includes(value.operation) ||
    value.exit_code !== null && !Number.isSafeInteger(value.exit_code) ||
    value.signal !== null && (typeof value.signal !== "string" || !/^SIG[A-Z0-9]{1,16}$/.test(value.signal)) ||
    !Number.isSafeInteger(value.duration_ms) || (value.duration_ms as number) < 0 ||
    [value.stdout_bytes, value.stderr_bytes].some(n => n !== null && (!Number.isSafeInteger(n) || (n as number) < 0))) return invalid();
  return new NativeControlError({ ...value } as unknown as NativeControlFailure);
}
