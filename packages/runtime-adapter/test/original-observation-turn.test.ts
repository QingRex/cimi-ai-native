import {mkdtempSync, rmSync, writeFileSync, readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {digest} from "../src/files.js";
import {rememberOriginalIdentity, rememberOriginalObservation, withRuntimeBinaryProofTurn} from "../src/runtime-binary-originals.js";

describe("original observation turn", () => {
 it("reads every time outside a turn and does not replay a single observation", () => {
  let reads = 0;
  const produce = () => { reads += 1; return {stable: true}; };
  expect(rememberOriginalObservation("outside", produce)).toEqual({stable: true});
  expect(rememberOriginalObservation("outside", produce)).toEqual({stable: true});
  expect(reads).toBe(2);
  withRuntimeBinaryProofTurn(() => { rememberOriginalObservation("once", produce); });
  expect(reads).toBe(3);
 });
 it("reuses a repeated observation and reads it again before the turn returns", () => {
  let reads = 0;
  const produce = () => { reads += 1; return {stable: true}; };
  const value = withRuntimeBinaryProofTurn(() => {
   const first = rememberOriginalObservation("same", produce);
   const second = rememberOriginalObservation("same", produce);
   expect(second).toEqual(first);
   expect(second).not.toBe(first);
   expect(reads).toBe(1);
   return second;
  });
  expect(value).toEqual({stable: true});
  expect(reads).toBe(3);
 });
 it("reuses the same branded original and reads it again before the turn returns", () => {
  let reads = 0;
  const produce = () => { reads += 1; return {stable: true}; };
  const value = withRuntimeBinaryProofTurn(() => {
   const first = rememberOriginalIdentity("brand", produce);
   const second = rememberOriginalIdentity("brand", produce);
   expect(second).toBe(first);
   expect(reads).toBe(1);
   return second;
  });
  expect(value).toEqual({stable: true});
  expect(reads).toBe(3);
 });
 it("closes when a repeated branded original changes before the turn returns", () => {
  let reads = 0;
  expect(() => withRuntimeBinaryProofTurn(() => {
   rememberOriginalIdentity("brand-changed", () => ({n: reads += 1}));
   rememberOriginalIdentity("brand-changed", () => ({n: reads += 1}));
  })).toThrow(/runtime_binary_original_unproven/);
 });
 it("accepts a repeated Buffer observation when the bytes are unchanged", () => {
  let reads = 0;
  const value = withRuntimeBinaryProofTurn(() => {
   const produce = () => { reads += 1; return {bytes: Buffer.from("same")}; };
   rememberOriginalObservation("bytes", produce);
   return rememberOriginalObservation("bytes", produce);
  });
  expect(Buffer.from(value.bytes).toString()).toBe("same");
  expect(reads).toBe(3);
 });
 it("closes when a repeated Buffer observation changes before the turn returns", () => {
  let n = 0;
  expect(() => withRuntimeBinaryProofTurn(() => {
   const produce = () => ({bytes: Buffer.from(String(n += 1))});
   rememberOriginalObservation("bytes-changed", produce);
   rememberOriginalObservation("bytes-changed", produce);
  })).toThrow(/runtime_binary_original_unproven/);
 });
 it("closes when a repeated observation changes before the turn returns", () => {
  let reads = 0;
  expect(() => withRuntimeBinaryProofTurn(() => {
   rememberOriginalObservation("changed", () => ({n: reads += 1}));
   rememberOriginalObservation("changed", () => ({n: reads += 1}));
  })).toThrow(/runtime_binary_original_unproven/);
  expect(reads).toBe(2);
 });
 it("closes when a later replay changes an earlier observation after that observation was rechecked", () => {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-observation-window-"));
  const source = join(root, "PUBLIC-current-source.txt");
  writeFileSync(source, "PUBLIC original source");
  let laterCalls = 0;
  try {
   expect(() => withRuntimeBinaryProofTurn(() => {
    const read = () => ({sha: digest(readFileSync(source)).value});
    rememberOriginalObservation("PUBLIC-first-source", read);
    rememberOriginalObservation("PUBLIC-first-source", read);
    const later = () => {
     laterCalls += 1;
     if (laterCalls === 2) writeFileSync(source, "PUBLIC changed after final source recheck");
     return {unchanged: true};
    };
    rememberOriginalObservation("PUBLIC-last-callback", later);
    rememberOriginalObservation("PUBLIC-last-callback", later);
    return {allowed: true};
   })).toThrow(/runtime_binary_original_unproven/);
   expect(readFileSync(source, "utf8")).not.toBe("PUBLIC original source");
  } finally { rmSync(root, {recursive: true, force: true}); }
 });
 it("keeps a pure reread off a reader that has already ended", () => {
  let produceCalls = 0, rereadCalls = 0, readerOpen = true;
  const value = withRuntimeBinaryProofTurn(() => {
   const read = () => {
    produceCalls += 1;
    if (!readerOpen) throw Error("scoped reader escaped");
    return {sha: "settled"};
   };
   const reread = () => { rereadCalls += 1; if (!readerOpen) return {sha: "settled"}; throw Error("reread ran while the reader was still open"); };
   const first = rememberOriginalObservation("historical-reader", read, reread);
   rememberOriginalObservation("historical-reader", () => { throw Error("reader reused"); }, reread);
   readerOpen = false;
   return first;
  });
  expect(value).toEqual({sha: "settled"});
  expect(produceCalls).toBe(1);
  expect(rereadCalls).toBeGreaterThan(0);
 });
});
