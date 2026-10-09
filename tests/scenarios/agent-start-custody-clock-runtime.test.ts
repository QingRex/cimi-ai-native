import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest } from "../../packages/runtime-adapter/src/files.js";
import { describe, expect, it } from "vitest";
import { initializeWindowsAgentStartLedger, openWindowsAgentRunClock } from "../../packages/runtime-adapter/src/index.js";

describe.runIf(process.platform === "win32" && process.arch === "x64")("fresh original custody under Task supervision", () => {
  it("revalidates original ACL and ledger repeatedly without starving the original clock deadline", async () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-custody-clock-runtime-"));
    console.error("Retain original custody-clock fixture: " + root);
    const ledger = await initializeWindowsAgentStartLedger(join(root, "origin"), join(root, "tools"));
    const clock = await openWindowsAgentRunClock(join(root, "tools"));
    const basis = { purpose: "constructed repeated original custody checks" }, ticket = ledger.issue(basis);
    try {
      const original = clock.read().then(reading => ({ reading }), error => ({ error }));
      await Promise.resolve(); await Promise.resolve();
      const started = performance.now();
      for (let i = 0; i < 64; i++) expect(ledger.readTicket(ticket)).toEqual(basis);
      const elapsed = Math.ceil(performance.now() - started), result = await original;
      console.error(JSON.stringify({ fresh_custody_checks: 64, elapsed_ms: elapsed }));
      expect(result).toHaveProperty("reading"); expect(result).not.toHaveProperty("error");
      expect(elapsed).toBeLessThan(15000);
    } finally { await clock.close(); ledger.close(); }
  }, 90000);
  it("rejects a changed live custody helper even when its cached build metadata is rewritten", async () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-custody-clock-runtime-"));
    console.error("Retain original custody-clock fixture: " + root);
    const tools = join(root, "tools"), ledger = await initializeWindowsAgentStartLedger(join(root, "origin"), tools);
    try {
      const ticket = ledger.issue({ purpose: "constructed live helper tamper contract" });
      const name = readdirSync(join(tools, "tools")).find(name => name.startsWith("agent-start-custody-"));
      if (!name) throw Error("Missing fixed custody helper");
      const directory = join(tools, "tools", name), binary = join(directory, "AgentStartCustody.exe");
      const changed = Buffer.concat([readFileSync(binary), Buffer.from("constructed helper drift")]);
      writeFileSync(binary, changed); writeFileSync(join(directory, "build.json"), JSON.stringify({ digest: digest(changed) }));
      expect(() => ledger.readTicket(ticket)).toThrow("agent_start_directory_custody_unproven");
    } finally { ledger.close(); }
  }, 90000);
});