import { afterEach, describe, expect, it, vi } from "vitest";
import { ExecutionLifetime } from "../src/execution-lifetime.js";

describe("one original execution lifetime", () => {
  afterEach(() => vi.useRealTimers());
  it("keeps preparation and later connection inside the same elapsed budget", async () => {
    vi.useFakeTimers(); const lifetime = new ExecutionLifetime(100);
    try {
      const preparation = lifetime.wait(new Promise<void>(resolve => setTimeout(resolve, 70)));
      await vi.advanceTimersByTimeAsync(70); await preparation;
      const connection = lifetime.wait(new Promise<void>(() => {}));
      const result = expect(connection).rejects.toThrow("workspace_rehearsal_deadline");
      await vi.advanceTimersByTimeAsync(30); await result;
      expect(lifetime.signal.aborted).toBe(true);
    } finally { lifetime.dispose(); }
  });
  it("stops waiting on cancellation and disposes a late resource without resuming", async () => {
    const external = new AbortController(), lifetime = new ExecutionLifetime(10000, external.signal), close = vi.fn();
    let complete!: (value: { close(): void }) => void;
    try {
      const waiting = lifetime.wait(new Promise<{ close(): void }>(resolve => { complete = resolve; }), resource => resource.close());
      external.abort(); await expect(waiting).rejects.toThrow("workspace_rehearsal_aborted");
      complete({ close }); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(close).toHaveBeenCalledTimes(1); expect(lifetime.interruptionReason).toBe("workspace_rehearsal_aborted");
    } finally { lifetime.dispose(); }
  });
  it("preserves the first stop cause and consumes a late callback rejection", async () => {
    const external = new AbortController(), lifetime = new ExecutionLifetime(10000, external.signal);
    let reject!: (error: Error) => void;
    try {
      const waiting = lifetime.wait(new Promise<void>((_, fail) => { reject = fail; }));
      lifetime.stop("workspace_rehearsal_deadline"); external.abort();
      await expect(waiting).rejects.toThrow("workspace_rehearsal_deadline");
      reject(Error("late failure")); await Promise.resolve();
      expect(() => lifetime.check()).toThrow("workspace_rehearsal_deadline");
    } finally { lifetime.dispose(); }
  });
});
