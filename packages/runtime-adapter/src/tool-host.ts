import { mkdtempSync, writeFileSync, openSync, closeSync, fsyncSync, readFileSync, fstatSync, writeSync, ftruncateSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { ToolAuthorityRequest } from "@cimiloop/protocol/v2";
import { assertOrdinaryPath, bytesAt, digest, RuntimeAdapterError } from "./files.js";
import { ToolJournal, parseToolInvocation, parseToolAssessment, toolAuthorityRequest, TOOL_FILE_BYTES, type ToolInvocation, type ToolReceipt } from "./tool-journal.js";

// Fixed public fixture only. This is not the production workspace effect port:
// ordinary-path checks do not claim a Windows handle-relative filesystem sandbox.
export class PublicToolFileFixture {
  readonly scopeDigest: string;
  readonly root: string;
  constructor(root: string) {
    this.root = assertOrdinaryPath(root);
    if (!this.root.startsWith(resolve(tmpdir()) + sep + "cimiloop-tool-fixture-") || resolve(join(this.root, "..")) !== resolve(tmpdir()) ||
      bytesAt(join(this.root, "public-fixture.txt"), 128).toString("utf8") !== "cimiloop/public-tool-file-fixture/1.0.0\n") throw new RuntimeAdapterError("tool_public_fixture_required");
    this.scopeDigest = digest(JSON.stringify({ format: "cimiloop/public-tool-file-fixture/1.0.0", root: this.root, resource: "src/query.ts", file: "public.txt" })).value;
  }
  static create(): PublicToolFileFixture {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-tool-fixture-"));
    writeFileSync(join(root, "public-fixture.txt"), "cimiloop/public-tool-file-fixture/1.0.0\n", { flag: "wx" });
    writeFileSync(join(root, "public.txt"), "public CimiLoop tool fixture\n", { flag: "wx" }); return new PublicToolFileFixture(root);
  }
  effect(input: ToolInvocation, signal: AbortSignal): { before_digest: string; after_digest: string; text: string | null } {
    if (input.path !== "src/query.ts" || signal.aborted) throw new RuntimeAdapterError("tool_fixture_boundary_denied");
    const file = assertOrdinaryPath(join(this.root, "public.txt")), fd = openSync(file, input.tool === "read_file" ? "r" : "r+");
    try {
      const stat = fstatSync(fd); if (!stat.isFile() || stat.nlink !== 1 || stat.size > TOOL_FILE_BYTES) throw new RuntimeAdapterError("tool_fixture_file_invalid");
      const before = readFileSync(fd); if (before.length > TOOL_FILE_BYTES || digest(before).value !== input.expected_digest) throw new RuntimeAdapterError("tool_preimage_changed");
      let content: string; try { content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(before); } catch { throw new RuntimeAdapterError("tool_fixture_utf8_invalid"); }
      if (input.tool === "read_file") return { before_digest: input.expected_digest, after_digest: input.expected_digest, text: content };
      // One already-open fixture handle; no dynamic path comes from the model.
      const replacement = Buffer.from(input.replacement_utf8!); if (signal.aborted) throw new RuntimeAdapterError("tool_host_closed");
      return replaceOnHandle(fd, replacement, input.expected_digest);
    } finally { closeSync(fd); }
  }
}
const replaceOnHandle = (fd: number, bytes: Buffer, before: string) => {
  let at = 0; while (at < bytes.length) { const count = writeSync(fd, bytes, at, bytes.length - at, at); if (!count) throw new RuntimeAdapterError("tool_fixture_write_failed"); at += count; }
  ftruncateSync(fd, bytes.length); fsyncSync(fd);
  return { before_digest: before, after_digest: digest(bytes).value, text: null };
};
export type ToolHostPhase = "reserved_committed" | "dispatch_committed" | "effect_completed" | "completion_committed";
interface Options {
  journal: ToolJournal; fixture: PublicToolFileFixture;
  // Supplied by trusted host composition; never parsed from Runtime JSON.
  assess: (request: ToolAuthorityRequest) => unknown | Promise<unknown>;
  phase?: (phase: ToolHostPhase) => void | Promise<void>;
}
export class PublicToolHost {
  private readonly options: Options;
  private readonly abort = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();
  private closing?: Promise<void>;
  constructor(options: Options) { options.journal.assertFixture(options.fixture.scopeDigest); this.options = { ...options }; }
  execute(input: unknown): Promise<{ receipt: ToolReceipt; replay: boolean }> {
    if (this.abort.signal.aborted) return Promise.reject(new RuntimeAdapterError("tool_host_closed"));
    let request: ToolInvocation; try { request = parseToolInvocation(input); } catch (error) { return Promise.reject(error); }
    const promise = this.perform(request); this.pending.add(promise);
    void promise.finally(() => this.pending.delete(promise)).catch(() => {}); return promise;
  }
  private async perform(request: ToolInvocation): Promise<{ receipt: ToolReceipt; replay: boolean }> {
    const { journal, fixture, assess, phase } = this.options, authorityRequest = toolAuthorityRequest(request);
    const checked = async () => { if (this.abort.signal.aborted) throw new RuntimeAdapterError("tool_host_closed");
      const result = parseToolAssessment(await assess({ ...authorityRequest, context_digest: { ...authorityRequest.context_digest } }), authorityRequest);
      if (this.abort.signal.aborted) throw new RuntimeAdapterError("tool_host_closed"); return result; };
    const original = await checked(), claim = journal.claim(request, original);
    if (claim.replay) return { receipt: claim.replay, replay: true };
    const permit = claim.permit; let dispatched = false, completed = false;
    try {
      await phase?.("reserved_committed"); const current = await checked();
      if (current.decision !== "ALLOW" || original.decision !== "ALLOW" || current.authority.basis_digest.value !== original.authority.basis_digest.value) throw new RuntimeAdapterError("tool_authority_changed");
      journal.dispatch(permit); dispatched = true; await phase?.("dispatch_committed");
      const latest = await checked();
      if (latest.decision !== "ALLOW" || latest.authority.basis_digest.value !== original.authority.basis_digest.value) throw new RuntimeAdapterError("tool_authority_changed");
      const value = fixture.effect(request, this.abort.signal); await phase?.("effect_completed");
      const receipt = journal.complete(permit, request, value); completed = true; await phase?.("completion_committed"); return { receipt, replay: false };
    } catch (error) { if (!completed) journal.stop(permit, dispatched); throw error; }
  }
  close(): Promise<void> {
    if (!this.closing) { this.abort.abort(); this.closing = (async () => { await Promise.allSettled([...this.pending]); this.options.journal.close(); })(); }
    return this.closing;
  }
}
