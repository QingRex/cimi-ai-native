import { AgentStartLedger, type AgentStartHostIdentity } from "./agent-start-ledger.js";
import { openWindowsAgentRunClock } from "./agent-run-clock.js";
import { assertOrdinaryPath, RuntimeAdapterError } from "./files.js";
import { openWindowsAgentStartCustody } from "./agent-start-custody-native.js";
async function host(root: string, toolsRoot: string, principal: Awaited<ReturnType<typeof openWindowsAgentStartCustody>>, signal?: AbortSignal): Promise<AgentStartHostIdentity> {
  signal?.throwIfAborted(); const clock = await openWindowsAgentRunClock(toolsRoot, signal);
  try { const actual = await clock.read(signal);
  signal?.throwIfAborted(); return { machine_digest: actual.machine_digest, principal_digest: principal("identity", root) };
  } finally { await clock.close(); }
}
export async function initializeWindowsAgentStartLedger(root: string, toolsRoot: string, signal?: AbortSignal) {
  root = assertOrdinaryPath(root); const principal = await openWindowsAgentStartCustody(toolsRoot, signal), identity = await host(root, toolsRoot, principal, signal);
  signal?.throwIfAborted(); return AgentStartLedger.initialize(root, identity, path => { if (principal("protect", path) !== identity.principal_digest) throw new RuntimeAdapterError("agent_start_origin_changed"); },
    path => { if (principal("verify", path) !== identity.principal_digest) throw new RuntimeAdapterError("agent_start_origin_changed"); });
}
export async function openWindowsAgentStartLedger(root: string, toolsRoot: string, signal?: AbortSignal) {
  root = assertOrdinaryPath(root); const principal = await openWindowsAgentStartCustody(toolsRoot, signal), identity = await host(root, toolsRoot, principal, signal);
  signal?.throwIfAborted(); if (principal("verify", root) !== identity.principal_digest) throw new RuntimeAdapterError("agent_start_origin_changed");
  return AgentStartLedger.open(root, identity, path => { if (principal("verify", path) !== identity.principal_digest) throw new RuntimeAdapterError("agent_start_origin_changed"); });
}
