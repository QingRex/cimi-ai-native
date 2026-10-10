import { createInternalId } from "../../packages/protocol/src/v2/index.js";
import { mkdtempSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, basename, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isolatedEnvironment } from "../../packages/runtime-adapter/src/native.js";
import { digest } from "../../packages/runtime-adapter/src/files.js";
import { initializeWindowsAgentStartLedger, openWindowsAgentStartLedger } from "../../packages/runtime-adapter/src/agent-start-origin-windows.js";
vi.setConfig({ testTimeout: 90000 });
// Actual machine/principal, protected Windows directory, durable SQLite and
// distinct host process. Basis/Run are contract fixtures, no model/Skill approval.
describe.runIf(process.platform === "win32" && process.arch === "x64")("Windows original start origin", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) { if (dirname(root) !== tmpdir() || !basename(root).startsWith("cimiloop-start-origin-")) throw Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true }); } });
  it("pins the actual host identity across another process and rejects a missing old origin without initializing it", async () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-start-origin-")); roots.push(root);
    const origin = join(root, "origin"), tools = join(root, "tools"), ledger = await initializeWindowsAgentStartLedger(origin, tools);
    const basis = { purpose: "constructed origin contract" }, ticket = ledger.issue(basis); ledger.close();
    const scope = { project_id: createInternalId(), run_id: createInternalId(), operation_key: createInternalId(), executor_actor_id: createInternalId(), context_digest: digest("constructed context"),
      runtime_binding: { binding_ref: { object_type: "provider_binding", id: createInternalId() }, digest: digest("constructed runtime") }, skill_bindings: [],
      host_admission_ref: { provider: "local_content", resource_type: "agent_host_admission", locator: digest("constructed admission").value, digest: digest("constructed admission") } };
    const material = digest("constructed material");
    const module = pathToFileURL(resolve("packages/runtime-adapter/dist/agent-start-origin-windows.js")).href;
    const code = `import {openWindowsAgentStartLedger} from ${JSON.stringify(module)};const x=JSON.parse(process.argv[1]);const l=await openWindowsAgentStartLedger(x.origin,x.tools);try{const same=l.issue(x.basis),claim=l.claim(same,x.scope,x.material);console.log(JSON.stringify({same,created:claim.created,state:l.inspect(same,x.scope).state,pid:process.pid}));}finally{l.close();}`;
    const children = await Promise.all([0, 1].map(() => promisify(execFile)(process.execPath, ["--input-type=module", "-e", code, JSON.stringify({ origin, tools, basis, ticket, scope, material })],
      { windowsHide: true, timeout: 45000, env: isolatedEnvironment() })));
    const results = children.map(child => JSON.parse(child.stdout));
    expect(new Set(results.map(result => result.pid)).size).toBe(2);
    expect(results.every(result => result.pid !== process.pid && JSON.stringify(result.same) === JSON.stringify(ticket))).toBe(true);
    expect(results.filter(result => result.created === true)).toHaveLength(1);
    expect(results.filter(result => result.created === false)).toHaveLength(1);
    expect(results.every(result => result.state === "claimed")).toBe(true);
    // Different new ticket/claim pairs exercise integrity reads during another
    // connection's insertions; they must share a consistent database snapshot.
    const independent = await Promise.all([0, 1].map(index => promisify(execFile)(process.execPath, ["--input-type=module", "-e", code,
      JSON.stringify({ origin, tools, basis: { purpose: "constructed concurrent new basis", index }, material,
        scope: { ...scope, run_id: createInternalId(), operation_key: createInternalId() } })],
      { windowsHide: true, timeout: 45000, env: isolatedEnvironment() })));
    expect(independent.map(child => JSON.parse(child.stdout)).every(result => result.created === true && result.state === "claimed")).toBe(true);
    renameSync(origin, join(root, "retained-origin"));
    await expect(openWindowsAgentStartLedger(origin, tools)).rejects.toThrow("agent_start_original_missing");
    const fresh = await initializeWindowsAgentStartLedger(origin, tools);
    try { expect(fresh.identityDigest).not.toBe(ticket.identity_digest); expect(() => fresh.readTicket(ticket)).toThrow("agent_start_ticket_origin_mismatch"); }
    finally { fresh.close(); }
    expect(digest(JSON.stringify(ticket)).value).toHaveLength(64);
  });
  it("denies an already opened original ledger when its database permissions drift", async () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-start-origin-")); roots.push(root);
    const origin = join(root, "origin"), tools = join(root, "tools"), ledger = await initializeWindowsAgentStartLedger(origin, tools);
    const script = "$p=$env:CIMILOOP_TEST_START_DATABASE;$acl=[IO.File]::GetAccessControl($p);$sid=[Security.Principal.SecurityIdentifier]::new('S-1-1-0');$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow));[IO.File]::SetAccessControl($p,$acl)";
    try {
      await promisify(execFile)(join(process.env.SystemRoot!, "System32/WindowsPowerShell/v1.0/powershell.exe"), ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
        { windowsHide: true, timeout: 15000, env: { ...isolatedEnvironment(), CIMILOOP_TEST_START_DATABASE: join(origin, "starts.sqlite") } });
      expect(() => ledger.issue({ purpose: "constructed drift contract" })).toThrow("agent_start_directory_custody_unproven");
      await expect(openWindowsAgentStartLedger(origin, tools)).rejects.toThrow("agent_start_directory_custody_unproven");
    } finally { ledger.close(); }
  });
  it('elects one original SkillInvocation dispatcher across actual protected Windows host processes without a new Run', async () => {
    const root=mkdtempSync(join(tmpdir(),'cimiloop-start-origin-'));roots.push(root);
    const origin=join(root,'origin'),tools=join(root,'tools'),ledger=await initializeWindowsAgentStartLedger(origin,tools);
    const id=digest('constructed original child').value,basis={parent_run:createInternalId(),parent_operation_key:createInternalId(),invocation_key:createInternalId(),input_digest:digest('fixed child input')};ledger.close();
    const module=pathToFileURL(resolve('packages/runtime-adapter/dist/agent-start-origin-windows.js')).href;
    const code=`import {openWindowsAgentStartLedger} from ${JSON.stringify(module)};const x=JSON.parse(process.argv[1]),l=await openWindowsAgentStartLedger(x.origin,x.tools);try{const result=l.claimExclusiveOnce('skill_invocation_dispatch',x.id,x.basis);console.log(JSON.stringify({...result,original:l.readExclusive('skill_invocation_dispatch',x.id),pid:process.pid}));}finally{l.close();}`;
    const children=await Promise.all([0,1].map(()=>promisify(execFile)(process.execPath,['--input-type=module','-e',code,JSON.stringify({origin,tools,id,basis})],{windowsHide:true,timeout:45000,env:isolatedEnvironment()})));
    const results=children.map(child=>JSON.parse(child.stdout));expect(new Set(results.map(value=>value.pid)).size).toBe(2);
    expect(results.filter(value=>value.created)).toHaveLength(1);expect(results.filter(value=>!value.created)).toHaveLength(1);
    expect(results[0].ticket).toEqual(results[1].ticket);expect(results.map(value=>value.original.basis)).toEqual([basis,basis]);
    const reopened=await openWindowsAgentStartLedger(origin,tools);try {expect(reopened.claimExclusiveOnce('skill_invocation_dispatch',id,basis).created).toBe(false);expect(reopened.listExclusive('skill_invocation_dispatch')).toHaveLength(1);} finally {reopened.close();}
  });
});
