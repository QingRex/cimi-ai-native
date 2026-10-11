import {isDeepStrictEqual as same} from 'node:util';
// Read-only original isolation proof; never grants approval or proves physical quotas.
export function isOriginalAgentNativeSuspension(value:unknown,basis:{nonce:unknown;supervisor:unknown;peer:unknown;appcontainer_sid:unknown}):boolean {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const native=value as Record<string,unknown>;
 return Object.keys(native).sort().join(',')==='active_process_limit,appcontainer_sid,format,network_capability_sids,nonce,peer,phase,supervisor'&&
  native.format==='cimiloop/agent-workspace-sandbox/1.0.0'&&native.phase==='suspended'&&native.nonce===basis.nonce&&
  typeof basis.appcontainer_sid==='string'&&/^S-1-15-2-(?:[0-9]+-){6}[0-9]+$/.test(basis.appcontainer_sid)&&native.appcontainer_sid===basis.appcontainer_sid&&
  same(native.supervisor,basis.supervisor)&&same(native.peer,basis.peer)&&same(native.network_capability_sids,[])&&native.active_process_limit===1;
}
