import {existsSync} from 'node:fs';
import {isDeepStrictEqual as same} from 'node:util';
import {DedicatedAgentAccountLedger,openWindowsDedicatedAgentAccountLedger,withStartCustodyVerifyTurn,type DedicatedModelConnection} from '@cimiloop/runtime-adapter';
import {openOriginalDedicatedRuntimeCustody,readDedicatedRuntimeOriginalConnection,type OriginalDedicatedRuntimeCustody} from './agent-dedicated-installation-local.js';
import {readProductionAccountDigest} from './agent-account-origin-local.js';
import type {LocalProject} from './project.js';
import {LocalProjectError} from './errors.js';

const unavailable=()=>new LocalProjectError('本地兼容原账户或连接原件不可核对；不创建账户或派发模型','CAPABILITY_UNAVAILABLE','conflict');
const assertHost=DedicatedAgentAccountLedger.prototype.assertOriginalHost;
export interface OriginalDedicatedAccount{source:OriginalDedicatedRuntimeCustody;account:DedicatedAgentAccountLedger;connection:DedicatedModelConnection;guard():void;release():void}
// Query-only original account. Missing execution programs or credentials do not
// erase held money. The permanently denied admission cannot reserve new funds.
export async function openOriginalDedicatedAccount(local:LocalProject):Promise<OriginalDedicatedAccount|undefined>{
 const source=await openOriginalDedicatedRuntimeCustody(local);if(!source)return undefined;let account:DedicatedAgentAccountLedger|undefined;
 try{
  source.guard();const connection=readDedicatedRuntimeOriginalConnection(source),rows=source.origin.listExclusive('dedicated_agent_account');
  if(!rows.length&&!existsSync(source.account_root)){source.release();return undefined;}
  const sourceGuard=()=>withStartCustodyVerifyTurn(()=>{source.guard();if(!same(readDedicatedRuntimeOriginalConnection(source),connection))throw unavailable();source.guard();});
  account=await openWindowsDedicatedAgentAccountLedger({origin:source.origin,accountDigest:readProductionAccountDigest(source.origin,source.account_root),connection,toolsRoot:source.tools,guard:sourceGuard,admission:{async check(){throw unavailable();}}});const original=account;let released=false;
  const guard=()=>withStartCustodyVerifyTurn(()=>{if(released)throw unavailable();sourceGuard();Reflect.apply(assertHost,original,[source.origin]);sourceGuard();});
  guard();return Object.freeze({source,account:original,connection,guard,release(){if(!released){released=true;try{original.close();}finally{source.release();}}}});
 }catch{try{account?.close();}finally{source.release();}throw unavailable();}
}
