import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalDedicatedAgentRunCosts,withOriginalDedicatedAgentRunCostRead,type OriginalDedicatedAgentRunCostReader } from '../src/agent-run-cost-evidence.js';
import { createOriginalFamilyCosts } from './original-family-costs-fixture.js';

// Actual account/Host/SQLite/TLS and original fee readers; PUBLIC model,
// credential and bill verifier only. No Native, paid model or S1 qualification.
describe('fresh bounded original run fee audit', () => {
  it('audits the complete account twice instead of once per original hold', async () => {
    const f = await createOriginalFamilyCosts();
    try {
      f.bill(f.relation.child, f.childRoot, 'PUBLIC-child-cut', 17, 5);
      const before = f.custodyChecks(), sends = f.sends();
      const result = readOriginalDedicatedAgentRunCosts(f.childRoot, f.relation.child, f.account);
      expect(result.costs).toMatchObject({ holds: 1, unresolved: 0, cash_charged_micros: 17, credit_charged_micro_units: 5, costs_reconciled: true });
      expect(result.calls).toHaveLength(1);
      expect(f.custodyChecks() - before).toBe(2);
      expect(f.sends()).toBe(sends);
      expect(result.starts_run).toBe(false);
      expect(result.kernel_costs_reconciled).toBe(false);
    } finally { await f.close(); }
  });
  it('rechecks bill authentication in the final account cut and on the next read', async () => {
    let effect: (() => void) | undefined;
    const f = await createOriginalFamilyCosts({ onCustodyVerify: () => effect?.() });
    try {
      f.bill(f.relation.child, f.childRoot, 'PUBLIC-child-auth-cut', 17, 5);
      const auth = new Map(f.projections); let checks = 0;
      effect = () => { if (++checks === 2) f.projections.clear(); };
      expect(() => readOriginalDedicatedAgentRunCosts(f.childRoot, f.relation.child, f.account)).toThrow();
      effect = undefined;
      expect(() => readOriginalDedicatedAgentRunCosts(f.childRoot, f.relation.child, f.account)).toThrow();
      for (const [key, value] of auth) f.projections.set(key, value);
      expect(readOriginalDedicatedAgentRunCosts(f.childRoot, f.relation.child, f.account).costs.cash_charged_micros).toBe(17);
      expect(f.sends()).toBe(2);
    } finally { effect = undefined; await f.close(); }
  });
  it('rereads provider originals after the final installed account callback', async () => {
    let effect: (() => void) | undefined;
    const f = await createOriginalFamilyCosts({ onCustodyVerify: () => effect?.() });
    const path = join(f.childRoot, 'agent-dedicated-model-originals', f.parent.project_id, f.parent.run_id, 'model_0001/provider-response.json');
    const bytes = readFileSync(path);
    try {
      f.bill(f.relation.child, f.childRoot, 'PUBLIC-child-provider-cut', 17, 5);
      let checks = 0;
      effect = () => { if (++checks === 2) writeFileSync(path, '{}'); };
      expect(() => readOriginalDedicatedAgentRunCosts(f.childRoot, f.relation.child, f.account)).toThrow();
      effect = undefined; writeFileSync(path, bytes);
      expect(readOriginalDedicatedAgentRunCosts(f.childRoot, f.relation.child, f.account).costs.costs_reconciled).toBe(true);
      expect(f.sends()).toBe(2);
    } finally { effect = undefined; writeFileSync(path, bytes); await f.close(); }
  });
  it('audits two fresh cuts around repeated synchronous semantic reads and expires the scoped reader',async()=>{
    const f=await createOriginalFamilyCosts();try{
      f.bill(f.relation.child,f.childRoot,'PUBLIC-window',17,5);let retained:OriginalDedicatedAgentRunCostReader|undefined;
      const before=f.custodyChecks(),sends=f.sends();
      const result=withOriginalDedicatedAgentRunCostRead(f.childRoot,f.relation.child,f.account,read=>{retained=read;const first=read(f.childRoot,f.relation.child,f.account);first.costs.cash_charged_micros=99;for(let i=0;i<4;i++)expect(read(f.childRoot,f.relation.child,f.account).costs.cash_charged_micros).toBe(17);return{charge:17};});
      expect(result).toEqual({charge:17});expect(f.custodyChecks()-before).toBe(2);expect(f.sends()).toBe(sends);expect(()=>retained!(f.childRoot,f.relation.child,f.account)).toThrow();
    }finally{await f.close();}
  });
  it('refuses final bill authentication revoked by a semantic callback',async()=>{
    const f=await createOriginalFamilyCosts();try{f.bill(f.relation.child,f.childRoot,'PUBLIC-window-revoke',17,5);expect(()=>withOriginalDedicatedAgentRunCostRead(f.childRoot,f.relation.child,f.account,read=>{expect(read(f.childRoot,f.relation.child,f.account).costs.cash_charged_micros).toBe(17);f.projections.clear();return true;})).toThrow();expect(f.sends()).toBe(2);}finally{await f.close();}
  });
  it('refuses final provider drift and closes application originals after the last account callback',async()=>{
    let effect:(()=>void)|undefined;const f=await createOriginalFamilyCosts({onCustodyVerify:()=>effect?.()});
    const file=join(f.childRoot,'agent-dedicated-model-originals',f.parent.project_id,f.parent.run_id,'model_0001/provider-response.json'),bytes=readFileSync(file);
    try{f.bill(f.relation.child,f.childRoot,'PUBLIC-window-provider',17,5);let count=0,closed=false;effect=()=>{if(++count===2)writeFileSync(file,'{}');};expect(()=>withOriginalDedicatedAgentRunCostRead(f.childRoot,f.relation.child,f.account,()=>true,()=>{closed=true;})).toThrow();expect(closed).toBe(false);effect=undefined;writeFileSync(file,bytes);const start=f.custodyChecks();withOriginalDedicatedAgentRunCostRead(f.childRoot,f.relation.child,f.account,()=>true,()=>{expect(f.custodyChecks()-start).toBe(2);closed=true;});expect(closed).toBe(true);}finally{effect=undefined;writeFileSync(file,bytes);await f.close();}
  });
  it('refuses foreign roots, scopes and asynchronous consumers without leaking an active reader',async()=>{
    const f=await createOriginalFamilyCosts();try{f.bill(f.relation.child,f.childRoot,'PUBLIC-window-scope',17,5);expect(()=>withOriginalDedicatedAgentRunCostRead(f.childRoot,f.relation.child,f.account,read=>read(f.root,f.relation.child,f.account))).toThrow();expect(()=>withOriginalDedicatedAgentRunCostRead(f.childRoot,f.relation.child,f.account,read=>read(f.childRoot,f.parent,f.account))).toThrow();let retained:OriginalDedicatedAgentRunCostReader|undefined;expect(()=>withOriginalDedicatedAgentRunCostRead(f.childRoot,f.relation.child,f.account,read=>{retained=read;return Promise.reject(Error('PUBLIC async consumer'));})).toThrow();await Promise.resolve();expect(()=>retained!(f.childRoot,f.relation.child,f.account)).toThrow();}finally{await f.close();}
  });
});
