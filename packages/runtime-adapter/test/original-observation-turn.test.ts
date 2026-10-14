import {describe, expect, it} from "vitest";
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
  expect(reads).toBe(2);
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
  expect(reads).toBe(2);
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
  expect(reads).toBe(2);
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
});
