import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { assertOrdinaryPath, bytesAt, digest, RuntimeAdapterError } from "./files.js";
import { buildWindowsWorkspaceBroker, isolatedEnvironment } from "./native.js";
import { copyToolJson, parseToolInvocation, TOOL_FILE_BYTES, TOOL_RECORD_BYTES, type ToolInvocation } from "./tool-journal.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import type { CreditProcessIdentity } from "./gateway-credit.js";

const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const sha = /^[a-f0-9]{64}$/;
const same = (a: unknown, b: unknown) => isDeepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
function fail(reason: string): never { throw new RuntimeAdapterError(reason); }
export type WorkspaceToolInvocation = Omit<ToolInvocation, "format"> & { format: "cimiloop/workspace-tool-invocation/1.0.0" };
export function parseWorkspaceToolInvocation(raw: unknown): WorkspaceToolInvocation {
  const value = copyToolJson(raw);
  if (!value || typeof value !== "object" || !("format" in value) || value.format !== "cimiloop/workspace-tool-invocation/1.0.0") fail("workspace_tool_contract_invalid");
  const input = parseToolInvocation({ ...value, format: "cimiloop/public-tool-invocation/1.0.0" });
  if (input.path.split("/").some(part => [".git", ".cimiloop"].includes(part.toLowerCase()) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) fail("workspace_tool_resource_invalid");
  return { ...input, format: "cimiloop/workspace-tool-invocation/1.0.0" };
}
export interface WorkspaceFileIdentity { volume_serial: string; file_index: string }
export const validWorkspaceFileIdentity = (value: unknown): value is WorkspaceFileIdentity => exact(value, ["volume_serial", "file_index"]) &&
  typeof value.volume_serial === "string" && /^[a-f0-9]{8}$/.test(value.volume_serial) && typeof value.file_index === "string" && /^[a-f0-9]{16}$/.test(value.file_index);
export const validWorkspaceWorkerIdentity = (value: unknown): value is CreditProcessIdentity => exact(value, ["pid", "creation_ticks", "image"]) &&
  Number.isSafeInteger(value.pid) && Number(value.pid) > 0 && Number(value.pid) <= 2147483647 && typeof value.creation_ticks === "string" && /^[1-9][0-9]{0,19}$/.test(value.creation_ticks) &&
  typeof value.image === "string" && value.image.length <= 32768 && isAbsolute(value.image);
export interface WorkspaceNativePreparation {
  format: "cimiloop/workspace-native/1.0.0"; phase: "prepared"; nonce: string; input_digest: string;
  root_identity: WorkspaceFileIdentity; file_identity: WorkspaceFileIdentity; replacement_identity: WorkspaceFileIdentity | null; before_digest: string; worker: CreditProcessIdentity;
}
export interface WorkspaceNativeCompletion extends Omit<WorkspaceNativePreparation, "phase"> { phase: "completed"; after_digest: string; after_file_identity: WorkspaceFileIdentity; text: string | null }
export const parseWorkspacePreparation = (raw: unknown): WorkspaceNativePreparation => {
  const value = copyToolJson(raw);
  if (!exact(value, ["format", "phase", "nonce", "input_digest", "root_identity", "file_identity", "replacement_identity", "before_digest", "worker"]) || value.format !== "cimiloop/workspace-native/1.0.0" || value.phase !== "prepared" ||
    typeof value.nonce !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.nonce) || typeof value.input_digest !== "string" || !sha.test(value.input_digest) ||
    typeof value.before_digest !== "string" || !sha.test(value.before_digest) || !validWorkspaceFileIdentity(value.root_identity) || !validWorkspaceFileIdentity(value.file_identity) ||
    value.root_identity.volume_serial !== value.file_identity.volume_serial || value.replacement_identity !== null && (!validWorkspaceFileIdentity(value.replacement_identity) ||
      value.replacement_identity.volume_serial !== value.root_identity.volume_serial || same(value.replacement_identity, value.file_identity)) || !validWorkspaceWorkerIdentity(value.worker)) fail("workspace_preparation_unproven");
  return value as unknown as WorkspaceNativePreparation;
};
export function parseWorkspaceCompletion(raw: unknown, prepared: WorkspaceNativePreparation, input: WorkspaceToolInvocation): WorkspaceNativeCompletion {
  const value = copyToolJson(raw);
  if (!exact(value, [...Object.keys(prepared), "after_digest", "after_file_identity", "text"])) fail("workspace_completion_unproven");
  const { after_digest, after_file_identity, text, ...body } = value;
  if (body.phase !== "completed" || !same({ ...body, phase: "prepared" }, prepared) || typeof after_digest !== "string" || !sha.test(after_digest) ||
    !validWorkspaceFileIdentity(after_file_identity) || !same(after_file_identity, prepared.replacement_identity ?? prepared.file_identity) ||
    (input.tool === "read_file" ? typeof text !== "string" || Buffer.byteLength(text) > TOOL_FILE_BYTES || digest(text).value !== input.expected_digest || after_digest !== input.expected_digest :
      text !== null || after_digest !== digest(input.replacement_utf8!).value)) fail("workspace_completion_unproven");
  return value as unknown as WorkspaceNativeCompletion;
}

// Owned native process, one configuration and one commit. No model-selected
// command, executable, cwd or environment reaches this transport.
class NativeWorkspaceSession {
  readonly child: ChildProcessWithoutNullStreams;
  readonly done: Promise<{ code: number | null; signal: NodeJS.Signals | null; outputProven: boolean }>;
  private readonly first: Promise<unknown>;
  private readonly last: Promise<unknown>;
  private lastResolve!: (value: unknown) => void;
  private lastReject!: (error: unknown) => void;
  private stopped = false;
  private commitSent = false;
  constructor(binary: string, config: unknown, readonly nonce: string, signal?: AbortSignal) {
    this.child = spawn(binary, [], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: isolatedEnvironment() });
    let firstResolve!: (value: unknown) => void, firstReject!: (error: unknown) => void, seen = 0, buffer = Buffer.alloc(0), bytes = 0, unproven = false;
    this.first = new Promise((resolve, reject) => { firstResolve = resolve; firstReject = reject; });
    this.last = new Promise((resolve, reject) => { this.lastResolve = resolve; this.lastReject = reject; });
    void this.first.catch(() => {}); void this.last.catch(() => {});
    const reject = (reason: string) => { unproven = true; const error = new RuntimeAdapterError(reason); firstReject(error); this.lastReject(error); this.cancel(); };
    this.child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length; if (bytes > 2 * TOOL_RECORD_BYTES) { reject("workspace_native_output_limit"); return; }
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.includes(10)) {
        const at = buffer.indexOf(10), line = buffer.subarray(0, at); buffer = buffer.subarray(at + 1);
        try {
          const value = parseGatewayJson(new TextDecoder("utf-8", { fatal: true }).decode(line).trim(), TOOL_RECORD_BYTES) as Record<string, unknown>;
          if (value.format !== "cimiloop/workspace-native/1.0.0" || value.nonce !== nonce) { reject("workspace_native_identity_unproven"); return; }
          if (value.phase === "denied") { reject(typeof value.reason === "string" && /^workspace_[a-z_]{1,80}$/.test(value.reason) ? value.reason : "workspace_native_unproven"); return; }
          if (++seen === 1 && ["root", "prepared", "reclaimed"].includes(String(value.phase))) firstResolve(value);
          else if (seen === 2 && value.phase === "completed" && this.commitSent) this.lastResolve(value);
          else { reject("workspace_native_sequence_unproven"); return; }
        } catch { reject("workspace_native_output_unproven"); return; }
      }
    });
    this.child.stderr.on("data", () => reject("workspace_native_stderr_unproven"));
    this.child.stdin.on("error", () => reject("workspace_native_input_unproven"));
    this.child.on("error", () => reject("workspace_native_start_unproven"));
    const cancel = () => { reject("workspace_effect_cancelled"); }, timer = setTimeout(() => { reject("workspace_native_deadline_exhausted"); this.cancel(true); }, 15000);
    signal?.addEventListener("abort", cancel, { once: true });
    this.done = new Promise(resolve => this.child.once("close", (code, endedSignal) => {
      clearTimeout(timer); signal?.removeEventListener("abort", cancel); this.stopped = true;
      if (!seen || buffer.length) { unproven = true; firstReject(new RuntimeAdapterError("workspace_native_exit_unproven")); }
      if (seen < 2) this.lastReject(new RuntimeAdapterError("workspace_native_completion_missing")); resolve({ code, signal: endedSignal, outputProven: !unproven });
    }));
    const frame = Buffer.from(JSON.stringify(config) + "\n");
    if (frame.length > 262144 || signal?.aborted) reject("workspace_effect_cancelled"); else this.child.stdin.write(frame);
  }
  async prepared(): Promise<unknown> { return this.first; }
  async root(): Promise<unknown> { const first = await this.first, exit = await this.done; if (exit.code !== 0 || exit.signal || !exit.outputProven) fail("workspace_native_exit_unproven"); return first; }
  async commit(): Promise<unknown> {
    if (this.commitSent || this.stopped) fail("workspace_effect_unowned"); this.commitSent = true;
    this.child.stdin.end("commit:" + this.nonce + "\n"); const result = await this.last, exit = await this.done;
    if (exit.code !== 0 || exit.signal || !exit.outputProven) fail("workspace_native_exit_unproven"); return result;
  }
  cancel(force = false): void { if (!this.stopped) { this.child.stdin.destroy(); if (force) this.child.kill(); } }
}
export interface PreparedWorkspaceEffect { readonly proof: Readonly<WorkspaceNativePreparation> }
export type WorkspaceStagingOutcome = "removed" | "absent" | "not_applicable";
export class WindowsWorkspaceFileBroker {
  readonly repositoryPath: string;
  readonly rootIdentity: Readonly<WorkspaceFileIdentity>;
  readonly scopeDigest: string;
  private readonly effects = new WeakMap<PreparedWorkspaceEffect, { session: NativeWorkspaceSession; input: WorkspaceToolInvocation }>();
  private constructor(root: string, identity: WorkspaceFileIdentity, private readonly binary: Awaited<ReturnType<typeof buildWindowsWorkspaceBroker>>, private readonly toolsRoot: string) {
    this.repositoryPath = root; this.rootIdentity = Object.freeze({ ...identity });
    this.scopeDigest = digest(JSON.stringify({ format: "cimiloop/workspace-files/1.0.0", repository_path: root.toLowerCase(), root_identity: identity })).value;
  }
  static async open(repositoryPath: string, toolsDirectory: string): Promise<WindowsWorkspaceFileBroker> {
    const root = realpathSync(assertOrdinaryPath(repositoryPath)), binary = await buildWindowsWorkspaceBroker(toolsDirectory), nonce = randomUUID();
    const session = new NativeWorkspaceSession(binary.path, { mode: "inspect", nonce, root }, nonce);
    try { const value = await session.root();
      if (!exact(value, ["format", "phase", "nonce", "root_identity"]) || value.phase !== "root" || !validWorkspaceFileIdentity(value.root_identity)) fail("workspace_root_unproven");
      return new WindowsWorkspaceFileBroker(root, value.root_identity, binary, realpathSync(assertOrdinaryPath(join(toolsDirectory, "tools"))));
    } finally { session.cancel(); await session.done; }
  }
  async prepare(raw: unknown, signal?: AbortSignal): Promise<PreparedWorkspaceEffect> {
    const input = parseWorkspaceToolInvocation(raw), nonce = randomUUID();
    if (digest(bytesAt(this.binary.path)).value !== this.binary.digest.value) fail("workspace_broker_digest_changed");
    const session = new NativeWorkspaceSession(this.binary.path, { mode: "prepare", nonce, root: this.repositoryPath, root_identity: this.rootIdentity,
      request_base64: Buffer.from(JSON.stringify(input)).toString("base64") }, nonce, signal);
    try {
      const proof = parseWorkspacePreparation(await session.prepared());
      if (proof.worker.pid !== session.child.pid || proof.worker.image.toLowerCase() !== this.binary.path.toLowerCase() || !same(proof.root_identity, this.rootIdentity) ||
        proof.input_digest !== digest(JSON.stringify(input)).value || proof.before_digest !== input.expected_digest || (input.tool === "replace_file") !== (proof.replacement_identity !== null) || signal?.aborted) fail("workspace_preparation_unproven");
      const immutable = Object.freeze({ ...proof, root_identity: Object.freeze({ ...proof.root_identity }), file_identity: Object.freeze({ ...proof.file_identity }),
        replacement_identity: proof.replacement_identity && Object.freeze({ ...proof.replacement_identity }), worker: Object.freeze({ ...proof.worker }) });
      const effect = Object.freeze({ proof: immutable }); this.effects.set(effect, { session, input }); return effect;
    } catch (error) { session.cancel(); await session.done; throw error; }
  }
  async commit(effect: PreparedWorkspaceEffect): Promise<WorkspaceNativeCompletion> {
    const owned = this.effects.get(effect); if (!owned) fail("workspace_effect_unowned"); this.effects.delete(effect);
    try { return parseWorkspaceCompletion(await owned.session.commit(), effect.proof, owned.input); }
    finally { owned.session.cancel(); await owned.session.done; }
  }
  async discard(effect: PreparedWorkspaceEffect): Promise<void> {
    const owned = this.effects.get(effect); if (!owned) return; this.effects.delete(effect); owned.session.cancel(); await owned.session.done;
  }
  // Trusted original-journal recovery only. The native broker independently
  // proves both original owners absent and deletes by the matching file handle.
  // No worktree path, arbitrary temporary name or inferred completion is used.
  async reclaimStaging(raw: WorkspaceNativePreparation, owner: CreditProcessIdentity): Promise<WorkspaceStagingOutcome> {
    const proof = parseWorkspacePreparation(raw);
    if (!validWorkspaceWorkerIdentity(owner) || !same(proof.root_identity, this.rootIdentity)) fail("workspace_recovery_contract_invalid");
    if (digest(bytesAt(this.binary.path)).value !== this.binary.digest.value) fail("workspace_broker_digest_changed");
    const nonce = randomUUID(), serialized = JSON.stringify(proof);
    const session = new NativeWorkspaceSession(this.binary.path, { mode: "reclaim", nonce, root: this.toolsRoot,
      preparation_base64: Buffer.from(serialized).toString("base64"), owner }, nonce);
    try {
      const value = await session.root();
      if (!exact(value, ["format", "phase", "nonce", "preparation_digest", "replacement_identity", "status"]) || value.phase !== "reclaimed" ||
        value.preparation_digest !== digest(serialized).value || !same(value.replacement_identity, proof.replacement_identity) ||
        !["removed", "absent", "not_applicable"].includes(String(value.status)) || (proof.replacement_identity === null) !== (value.status === "not_applicable")) fail("workspace_recovery_result_unproven");
      return value.status as WorkspaceStagingOutcome;
    } finally { session.cancel(); await session.done; }
  }
}
