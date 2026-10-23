import { digest, RuntimeAdapterError } from './files.js';

export const CODEX_ORDINARY_USAGE_POLICY='require_ordinary_permission/1.0.0' as const;
export type CodexOrdinaryUsagePolicy=typeof CODEX_ORDINARY_USAGE_POLICY;
export const CODEX_QUOTA_READ_PARAMS=Object.freeze({supportsLunaReserve:false,excludeResetCreditDetails:true});
function fail():never{throw new RuntimeAdapterError('codex_ordinary_quota_unproven');}
export function parseCodexUsagePolicy(raw:unknown):CodexOrdinaryUsagePolicy|undefined{
 if(raw===undefined)return undefined;if(raw!==CODEX_ORDINARY_USAGE_POLICY)fail();return raw;
}
type Window={used_percent:number;window_minutes:number|null;resets_at:number|null};
export interface CodexOrdinaryQuotaSnapshot {
 format:'cimiloop/codex-ordinary-quota/1.0.0';ordinary_usage_allowed:boolean|null;account_id_digest:string|null;
 primary:Window|null;secondary:Window|null;credits:{has_credits:boolean;unlimited:boolean;balance:string|null}|null;
}
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))fail();return v as Record<string,unknown>;};
function window(raw:unknown):Window|null{
 if(raw===null)return null;const v=object(raw);
 if(typeof v.usedPercent!=='number'||!Number.isFinite(v.usedPercent)||v.usedPercent<0||v.usedPercent>10000||
  !(v.windowDurationMins===null||Number.isSafeInteger(v.windowDurationMins)&&(v.windowDurationMins as number)>0)||
  !(v.resetsAt===null||Number.isSafeInteger(v.resetsAt)&&(v.resetsAt as number)>=0))fail();
 return {used_percent:v.usedPercent,window_minutes:v.windowDurationMins as number|null,resets_at:v.resetsAt as number|null};
}
// Read-only backend permission; percentages and reset times never grant usage.
// This is not a bill, a credit purchase, or a cash/physical quota guarantee.
export function parseCodexOrdinaryQuota(raw:unknown):CodexOrdinaryQuotaSnapshot{
 const v=object(raw),limits=object(v.rateLimits);
 if(![true,false,null].includes(v.ordinaryUsageAllowed as boolean|null)||!(v.accountId===null||typeof v.accountId==='string'&&v.accountId.length>0&&v.accountId.length<=500))fail();
 let credits:CodexOrdinaryQuotaSnapshot['credits']=null;
 if(limits.credits!==null){const c=object(limits.credits);if(typeof c.hasCredits!=='boolean'||typeof c.unlimited!=='boolean'||!(c.balance===null||typeof c.balance==='string'&&c.balance.length<=128&&/^-?\d+(?:\.\d+)?$/.test(c.balance)))fail();credits={has_credits:c.hasCredits,unlimited:c.unlimited,balance:c.balance as string|null};}
 return {format:'cimiloop/codex-ordinary-quota/1.0.0',ordinary_usage_allowed:v.ordinaryUsageAllowed as boolean|null,account_id_digest:v.accountId===null?null:digest(String(v.accountId)).value,primary:window(limits.primary),secondary:window(limits.secondary),credits};
}
