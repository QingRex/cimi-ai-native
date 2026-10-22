import { lstatSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { loadModelConnection, openWindowsAgentStartLedger, openWindowsDedicatedAgentAccountLedger } from "@cimiloop/runtime-adapter";
import type { DedicatedAgentAccountLedger } from "@cimiloop/runtime-adapter";
import type { HumanAgentAccountFactory } from "./agent-account-billing-entry-local.js";
import { productionRuntimeLayout, readProductionAccountDigest } from "./agent-production-admission-local.js";
import { readHumanOriginalAgentRunInputs } from "./agent-runtime-control-local.js";
import type { LocalProject } from "./project.js";
import { LocalProjectError } from "./errors.js";

const unavailable = () => new LocalProjectError("原生产账户或账单核验尚不可用；保留原运行与预算", "CAPABILITY_UNAVAILABLE", "conflict");

// Availability only, never admission. No binary/check/credential dependency:
// historical account access must survive model revocation and cancellation.
export function hasInstalledProductionAccount(local: LocalProject): boolean {
  const layout = productionRuntimeLayout(local);
  const outside = relative(resolve(local.location.repositoryPath), resolve(layout.accountRoot));
  if (!layout.accountRoot || !(outside === ".." || outside.startsWith(`..${sep}`) || isAbsolute(outside))) return false;
  try {
    loadModelConnection(layout.connectionPath);
    return [join(layout.startRoot, "starts.sqlite"), join(layout.accountRoot, "account.sqlite")]
      .every(path => { const stat = lstatSync(path); return stat.isFile() && !stat.isSymbolicLink(); });
  } catch { return false; }
}

// Opens EXISTING Windows originals only. The account refuses all new model
// admission/holds. Bills requiring an uninstalled verifier remain Unknown;
// a registered projection or user-supplied JSON is never bill authentication.
export const productionAgentAccount: HumanAgentAccountFactory = async (runId, local) => {
  const original = readHumanOriginalAgentRunInputs(local, runId);
  const identity = { location: structuredClone(local.location), instance: structuredClone(local.instance), store: local.store, kernel: local.kernel };
  if (!hasInstalledProductionAccount(local)) throw unavailable();
  const layout = productionRuntimeLayout(local), connection = structuredClone(loadModelConnection(layout.connectionPath));
  const current = () => {
    if (local.store !== identity.store || local.kernel !== identity.kernel || !isDeepStrictEqual(local.location, identity.location) ||
      !isDeepStrictEqual(local.instance, identity.instance) || !isDeepStrictEqual(productionRuntimeLayout(local), layout) ||
      !isDeepStrictEqual(loadModelConnection(layout.connectionPath), connection)) throw unavailable();
    const fresh = readHumanOriginalAgentRunInputs(local, runId);
    if (!isDeepStrictEqual({ scope: original.scope, record: original.record, context: original.context },
      { scope: fresh.scope, record: fresh.record, context: fresh.context })) throw unavailable();
  };
  const origin = await openWindowsAgentStartLedger(layout.startRoot, layout.toolsRoot);
  let account: DedicatedAgentAccountLedger | undefined;
  try {
    current();
    account = await openWindowsDedicatedAgentAccountLedger({ origin, accountDigest: readProductionAccountDigest(origin, layout.accountRoot),
      connection, toolsRoot: layout.toolsRoot, admission: { check: async () => { throw unavailable(); } } });
    current();
    let released = false;
    return { account, release() {
      if (released) return;
      released = true;
      try { account!.close(); } finally { origin.close(); }
    } };
  } catch (error) {
    try { account?.close(); } finally { origin.close(); }
    throw error;
  }
};
