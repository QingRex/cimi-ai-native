import { lstatSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { loadModelConnection, openWindowsAgentStartLedger, openWindowsDedicatedAgentAccountLedger } from "@cimiloop/runtime-adapter";
import type { DedicatedAgentAccountLedger } from "@cimiloop/runtime-adapter";
import type { HumanAgentAccountFactory, HumanAgentCostsFactory } from "./agent-account-billing-entry-local.js";
import { hasInstalledCodexAgentRuntime } from './agent-codex-installation-local.js';
import { openInstalledCodexUsageBudget } from './agent-codex-usage-budget-local.js';
import { productionRuntimeLayout, readProductionAccountDigest } from "./agent-production-admission-local.js";
import { readHumanOriginalAgentRunInputs } from "./agent-runtime-control-local.js";
import type { LocalProject } from "./project.js";
import { LocalProjectError } from "./errors.js";
import {readOriginalAgentCostBackend} from './agent-account-billing-local.js';

const unavailable = () => new LocalProjectError("原生产账户或账单核验尚不可用；保留原运行与预算", "CAPABILITY_UNAVAILABLE", "conflict");

// Discovery only enables a read button, never bill mutation or execution.
export function hasReadableProductionAgentCosts(local:LocalProject){
  try{return hasInstalledCodexAgentRuntime(local)||hasInstalledProductionAccount(local);}catch{return false;}
}
export function hasProductionAgentBillAccount(local:LocalProject,runId?:string){
  try{return hasInstalledProductionAccount(local)&&(runId===undefined||readOriginalAgentCostBackend(local,runId)!=='codex');}catch{return false;}
}

export const productionAgentCosts:HumanAgentCostsFactory=async(runId,local)=>{
  const original=readHumanOriginalAgentRunInputs(local,runId);
  const backend=readOriginalAgentCostBackend(local,runId);
  if(backend==='dedicated'||backend===undefined&&!hasInstalledCodexAgentRuntime(local))return productionAgentAccount(runId,local);
  const identity={store:local.store,kernel:local.kernel,location:structuredClone(local.location),instance:structuredClone(local.instance)};
  const lease=await openInstalledCodexUsageBudget(local);
  if(!lease){if(backend===undefined)return productionAgentAccount(runId,local);throw unavailable();}
  try{
    const guard=()=>{
      lease.guard();const fresh=readHumanOriginalAgentRunInputs(local,runId);if(readOriginalAgentCostBackend(local,runId)!==backend)throw unavailable();
      if(local.store!==identity.store||local.kernel!==identity.kernel||!isDeepStrictEqual(local.location,identity.location)||!isDeepStrictEqual(local.instance,identity.instance)||!isDeepStrictEqual({scope:original.scope,record:original.record,context:original.context},{scope:fresh.scope,record:fresh.record,context:fresh.context}))throw unavailable();
    };guard();
    if(backend===undefined&&!lease.budget.snapshot().reservations.some(row=>{const basis=row.basis as {scope?:{project_id?:string;run_id?:string}};return basis?.scope?.project_id===original.scope.project_id&&basis.scope.run_id===original.scope.run_id;})){
      lease.release();return productionAgentAccount(runId,local);
    }
    return{codex_usage:{budget:lease.budget,guard},release:()=>lease.release()};
  }catch(error){lease.release();throw error;}
};

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
  const backend=readOriginalAgentCostBackend(local,runId);if(backend==='codex')throw unavailable();
  const identity = { location: structuredClone(local.location), instance: structuredClone(local.instance), store: local.store, kernel: local.kernel };
  if (!hasInstalledProductionAccount(local)) throw unavailable();
  const layout = productionRuntimeLayout(local), connection = structuredClone(loadModelConnection(layout.connectionPath));
  const current = () => {
    if(readOriginalAgentCostBackend(local,runId)!==backend)throw unavailable();
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
