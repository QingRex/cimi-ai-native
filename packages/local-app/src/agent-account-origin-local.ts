import {resolve} from 'node:path';
import type {AgentStartLedger} from '@cimiloop/runtime-adapter';
import {LocalProjectError} from './errors.js';

// Protected original registration, never a caller-selected account digest.
export function readProductionAccountDigest(origin:AgentStartLedger,accountRoot:string){
 const root=resolve(accountRoot),rows=origin.listExclusive('dedicated_agent_account').filter(row=>{
  const basis=row.basis;
  return !!basis&&typeof basis==='object'&&'root'in basis&&'policy'in basis&&resolve(String((basis as {root:unknown}).root))===root&&typeof(basis as {policy?:{account_digest?:unknown}}).policy?.account_digest==='string';
 });
 if(rows.length!==1)throw new LocalProjectError('历史 HTTP 原账户资料缺失或不唯一','CAPABILITY_UNAVAILABLE','conflict');
 return(rows[0]!.basis as {policy:{account_digest:string}}).policy.account_digest;
}
