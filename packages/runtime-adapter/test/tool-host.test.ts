import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { digest } from "../src/files.js";
import { PublicToolHost, PublicToolFileFixture } from "../src/tool-host.js";
import { ToolJournal, parseToolInvocation, toolAuthorityRequest, TOOL_SLOT_BYTES } from "../src/tool-journal.js";
import { toolFixture, fixtureIdentity, removeToolFixture } from "./tool-fixture.js";

describe("bounded public tool journal and trusted host", () => {
  it.each(["read_file", "replace_file"] as const)("replays a durable %s result across reopen without a second effect", async tool => {
    const f = toolFixture(), input = { ...f.input, tool, ...(tool === "replace_file" ? { replacement_utf8: "public replacement\n" } : {}) };
    let effects = 0;
    const journal = new ToolJournal(f.path, f.policy, { identity: fixtureIdentity });
    const host = new PublicToolHost({ journal, fixture: f.file, assess: f.assess, phase: phase => { if (phase === "effect_completed") effects++; } });
    try {
      const first = await host.execute(input), again = await host.execute(input); expect(again).toEqual({ ...first, replay: true }); expect(effects).toBe(1);
      expect(first.receipt).toMatchObject({ scope: "public_tool_rehearsal", formal_agent_execution_enabled: false }); await host.close();
      const reopened = new ToolJournal(f.path, f.policy, { identity: fixtureIdentity });
      const second = new PublicToolHost({ journal: reopened, fixture: new PublicToolFileFixture(f.file.root), assess: f.assess, phase: () => { throw Error("replay must not execute"); } });
      try { expect(await second.execute(input)).toEqual(again); expect(reopened.snapshot()).toMatchObject({ completed: 1, unknown: 0 }); } finally { await second.close(); }
      expect(readFileSync(join(f.file.root, "public.txt"), "utf8")).toBe(tool === "replace_file" ? "public replacement\n" : first.receipt.text);
    } finally { await host.close(); removeToolFixture(f.file.root); }
  });
  it.each(["reserved_committed", "dispatch_committed", "effect_completed", "completion_committed"] as const)("keeps the durable fact at host cancellation: %s", async stopAt => {
    const f = toolFixture(), journal = new ToolJournal(f.path, f.policy, { identity: fixtureIdentity }); let arrived!: () => void, resume!: () => void;
    const arrival = new Promise<void>(yes => { arrived = yes; }), gate = new Promise<void>(yes => { resume = yes; });
    const host = new PublicToolHost({ journal, fixture: f.file, assess: f.assess, phase: async phase => { if (phase === stopAt) { arrived(); await gate; } } });
    try {
      const operation = host.execute({ ...f.input, tool: "replace_file", replacement_utf8: "public close result\n" }).catch((error: Error) => error.message);
      await arrival; const closing = host.close(); expect(host.close()).toBe(closing); resume(); const result = await operation; await closing;
      const next = new ToolJournal(f.path, f.policy, { identity: fixtureIdentity });
      try { expect(next.snapshot()).toMatchObject(stopAt === "reserved_committed" ? { not_started: 1 } : stopAt === "dispatch_committed" ? { unknown: 1 } : { completed: 1 }); }
      finally { next.close(); }
      if (["reserved_committed", "dispatch_committed"].includes(stopAt)) expect(result).toBe("tool_host_closed"); else expect(result).toHaveProperty("receipt");
    } finally { await host.close(); removeToolFixture(f.file.root); }
  });
  it.each(["active", "unknown", "absent"] as const)("reconciles only verified owner absence, preserving dispatch uncertainty: %s", async state => {
    const f = toolFixture(), first = new ToolJournal(f.path, f.policy, { identity: fixtureIdentity });
    const claim = first.claim(f.input, f.assess(toolAuthorityRequest(f.input))); if (!claim.permit) throw Error("permit expected"); first.dispatch(claim.permit); first.close();
    const next = new ToolJournal(f.path, f.policy, { identity: fixtureIdentity, observeOwner: async () => state });
    try { expect(await next.reconcileOwners()).toMatchObject(state === "absent" ? { reconciled: 1 } : { reconciled: 0 }); expect(next.snapshot()).toMatchObject(state === "absent" ? { unknown: 1 } : { executing: 1 });
      expect(() => next.claim(f.input, f.assess(toolAuthorityRequest(f.input)))).toThrow("tool_outcome_unproven"); }
    finally { next.close(); removeToolFixture(f.file.root); }
  });
  it("requires live authority for completed read replay and preserves the completed fact on denial", async () => {
    const f = toolFixture(), journal = new ToolJournal(f.path, f.policy, { identity: fixtureIdentity }); let allow = true;
    const host = new PublicToolHost({ journal, fixture: f.file, assess: request => allow ? f.assess(request) : { ...f.assess(request), decision: "DENY", authority: null, reasons: ["revoked"] } });
    try { await host.execute(f.input); allow = false; await expect(host.execute(f.input)).rejects.toThrow("tool_authority_denied"); expect(journal.snapshot()).toMatchObject({ completed: 1 }); }
    finally { await host.close(); removeToolFixture(f.file.root); }
  });
  it.each(["reserved_committed", "dispatch_committed"] as const)("rechecks authority immediately before dispatch/effect: %s", async revokedAt => {
    const f = toolFixture(), journal = new ToolJournal(f.path, f.policy, { identity: fixtureIdentity }); let allow = true;
    const host = new PublicToolHost({ journal, fixture: f.file, assess: request => allow ? f.assess(request) : { ...f.assess(request), decision: "DENY", authority: null, reasons: ["revoked"] }, phase: phase => { if (phase === revokedAt) allow = false; } });
    try { await expect(host.execute(f.input)).rejects.toThrow("tool_authority_denied"); expect(journal.snapshot()).toMatchObject(revokedAt === "reserved_committed" ? { not_started: 1 } : { unknown: 1 }); }
    finally { await host.close(); removeToolFixture(f.file.root); }
  });
  it("serializes shared effects, rejects changed call identity, and never unblocks Unknown by matching file bytes", async () => {
    const f = toolFixture(), one = new ToolJournal(f.path, f.policy, { identity: fixtureIdentity }), two = new ToolJournal(f.path, f.policy, { identity: fixtureIdentity });
    const claim = one.claim(f.input, f.assess(toolAuthorityRequest(f.input))); if (!claim.permit) throw Error("permit expected");
    try {
      expect(() => two.dispatch({ ...claim.permit })).toThrow("tool_permit_unowned");
      expect(() => two.claim(f.input, f.assess(toolAuthorityRequest(f.input)))).toThrow("tool_outcome_unproven");
      expect(() => two.claim({ ...f.input, expected_digest: digest("changed").value }, f.assess(toolAuthorityRequest(f.input)))).toThrow("tool_call_id_conflict");
      const other = { ...f.input, call_id: "second" }; expect(() => two.claim(other, f.assess(toolAuthorityRequest(other)))).toThrow("tool_effect_in_flight");
      one.dispatch(claim.permit); one.stop(claim.permit, true);
      expect(digest(readFileSync(join(f.file.root, "public.txt"))).value).toBe(f.input.expected_digest);
      expect(() => two.claim(f.input, f.assess(toolAuthorityRequest(f.input)))).toThrow("tool_outcome_unproven");
      expect(() => two.claim(other, f.assess(toolAuthorityRequest(other)))).toThrow("tool_effect_in_flight");
    } finally { one.close(); two.close(); removeToolFixture(f.file.root); }
  });
  it("reserves cache capacity before effects and rejects a changed fixture scope", async () => {
    const f = toolFixture(), journal = new ToolJournal(f.path, { ...f.policy, maximum_entries: 1, maximum_bytes: TOOL_SLOT_BYTES }, { identity: fixtureIdentity });
    const host = new PublicToolHost({ journal, fixture: f.file, assess: f.assess }); const other = PublicToolFileFixture.create();
    try { expect(() => new PublicToolHost({ journal, fixture: other, assess: f.assess })).toThrow("tool_fixture_scope_mismatch"); await host.execute(f.input);
      await expect(host.execute({ ...f.input, call_id: "next" })).rejects.toThrow("tool_journal_capacity_exhausted"); expect(journal.snapshot().completed).toBe(1); }
    finally { await host.close(); removeToolFixture(f.file.root); removeToolFixture(other.root); }
  });
  it.each(["receipt_digest", "receipt_payload", "input_digest", "schema", "policy"])("refuses corrupt journal data: %s", async corruption => {
    const f = toolFixture(), journal = new ToolJournal(f.path, f.policy, { identity: fixtureIdentity }), host = new PublicToolHost({ journal, fixture: f.file, assess: f.assess });
    try { await host.execute(f.input); await host.close(); const db = new DatabaseSync(f.path);
      try { if (corruption === "receipt_digest") db.exec("UPDATE tool_calls SET receipt_digest='bad'");
        else if (corruption === "receipt_payload") db.exec("UPDATE tool_calls SET receipt='{}'");
        else if (corruption === "input_digest") db.exec("UPDATE tool_calls SET input_digest='bad'");
        else if (corruption === "schema") db.exec("CREATE TABLE unapproved(id TEXT)");
        else db.exec("UPDATE tool_policy SET digest='bad'"); }
      finally { db.close(); }
      expect(() => new ToolJournal(f.path, f.policy, { identity: fixtureIdentity })).toThrow(/tool_journal_/); }
    finally { await host.close(); removeToolFixture(f.file.root); }
  });
  it("leaves Unknown when result storage fails and refuses another effect", async () => {
    const f = toolFixture(), journal = new ToolJournal(f.path, f.policy, { identity: fixtureIdentity }), host = new PublicToolHost({ journal, fixture: f.file, assess: f.assess });
    // A trigger changes the accepted schema, so use a trusted host phase to
    // simulate the storage failure without blessing a modified database format.
    const original = journal.complete.bind(journal); journal.complete = () => { throw Error("fixture storage failed"); };
    const request = { ...f.input, tool: "replace_file" as const, replacement_utf8: "public effect without receipt\n" };
    try { await expect(host.execute(request)).rejects.toThrow("fixture storage failed"); expect(journal.snapshot()).toMatchObject({ unknown: 1, completed: 0 }); journal.complete = original;
      await expect(host.execute(request)).rejects.toThrow("tool_outcome_unproven"); expect(readFileSync(join(f.file.root, "public.txt"), "utf8")).toBe(request.replacement_utf8); }
    finally { await host.close(); removeToolFixture(f.file.root); }
  });
  it.each(["utf8", "bom", "empty_replacement"])("handles exact fixture bytes without lossy success: %s", async variant => {
    const f = toolFixture(), bytes = variant === "utf8" ? Buffer.from([0xff]) : Buffer.from("\ufeffpublic BOM fixture\n");
    writeFileSync(join(f.file.root, "public.txt"), bytes);
    const journal = new ToolJournal(f.path, f.policy, { identity: fixtureIdentity }), host = new PublicToolHost({ journal, fixture: f.file, assess: f.assess });
    const input = { ...f.input, expected_digest: digest(bytes).value, ...(variant === "empty_replacement" ? { tool: "replace_file" as const, replacement_utf8: "" } : {}) };
    try {
      if (variant === "utf8") { await expect(host.execute(input)).rejects.toThrow("tool_fixture_utf8_invalid"); expect(journal.snapshot().unknown).toBe(1); }
      else { const result = await host.execute(input); expect(result.receipt.after_digest).toBe(variant === "empty_replacement" ? digest("").value : digest(bytes).value);
        expect(result.receipt.text).toBe(variant === "bom" ? bytes.toString("utf8") : null); expect(journal.snapshot().completed).toBe(1); }
    } finally { await host.close(); removeToolFixture(f.file.root); }
  });
  it("rejects changed preimage and malformed UTF-8 without publishing a successful result", async () => {
    const f = toolFixture(), journal = new ToolJournal(f.path, f.policy, { identity: fixtureIdentity }), host = new PublicToolHost({ journal, fixture: f.file, assess: f.assess });
    try { writeFileSync(join(f.file.root, "public.txt"), Buffer.from([0xff]));
      await expect(host.execute(f.input)).rejects.toThrow("tool_preimage_changed");
      await expect(host.execute({ ...f.input, call_id: "other", expected_digest: digest(Buffer.from([0xff])).value })).rejects.toThrow("tool_effect_in_flight"); expect(journal.snapshot()).toMatchObject({ unknown: 1 }); }
    finally { await host.close(); removeToolFixture(f.file.root); }
  });
  it.each(["unknown_tool", "shell_field", "traversal", "absolute", "wildcard", "secret_root", "oversize", "lone_surrogate", "toJSON", "getter", "wrong_context", "read_replacement"])("rejects unsupported or executable caller input before claim: %s", kind => {
    const f = toolFixture(), input: Record<string, unknown> = { ...f.input }; let calls = 0;
    try {
      if (kind === "unknown_tool") input.tool = "shell"; if (kind === "shell_field") input.command = "echo fixture";
      if (kind === "traversal") input.path = "../public.txt"; if (kind === "absolute") input.path = "C:/public.txt";
      if (kind === "wildcard") input.path = "src/**"; if (kind === "secret_root") input.path = ".cimiloop/public.txt";
      if (kind === "oversize") { input.tool = "replace_file"; input.replacement_utf8 = "x".repeat(16385); }
      if (kind === "lone_surrogate") input.path = "\ud800"; if (kind === "wrong_context") input.context_digest = { ...f.input.context_digest, extra: true };
      if (kind === "toJSON") input.toJSON = () => { calls++; return f.input; };
      if (kind === "getter") Object.defineProperty(input, "path", { enumerable: true, get: () => { calls++; return "src/query.ts"; } });
      if (kind === "read_replacement") input.replacement_utf8 = "inert";
      expect(() => parseToolInvocation(input)).toThrow("tool_contract_invalid"); expect(calls).toBe(0);
    } finally { removeToolFixture(f.file.root); }
  });
});
