import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it, expect } from 'vitest';
import { AgentStartLedger } from '../src/agent-start-ledger.js';
import { digest } from '../src/files.js';
describe('atomic original child dispatch ticket compatibility', () => {
 it('creates exactly one immutable exclusive claim across connections and reopen without changing format1', () => {
  const root = mkdtempSync(join(tmpdir(), 'cimiloop-child-claim-')), path=join(root,'host');
  const host={ machine_digest:digest('machine').value, principal_digest:digest('principal').value };
  const first=AgentStartLedger.initialize(path,host), second=AgentStartLedger.open(path,host), id=digest('child original').value, basis={ parent_run:'original', invocation:'child', input:'fixed' };
  try {
   const a=(first as any).claimExclusiveOnce('skill_invocation_dispatch',id,basis), b=(second as any).claimExclusiveOnce('skill_invocation_dispatch',id,basis);
   expect(a.created).toBe(true); expect(b.created).toBe(false); expect(b.ticket).toEqual(a.ticket); expect(first.readTicket(a.ticket)).toMatchObject({ basis });
   expect(()=>(second as any).claimExclusiveOnce('skill_invocation_dispatch',id,{ ...basis,input:'changed' })).toThrow('agent_start_exclusive_conflict');
   const db=new DatabaseSync(join(path,'starts.sqlite'),{readOnly:true}); try { expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(1); } finally { db.close(); }
  } finally { first.close(); second.close(); }
  const reopened=AgentStartLedger.open(path,host); try { expect((reopened as any).claimExclusiveOnce('skill_invocation_dispatch',id,basis).created).toBe(false); } finally { reopened.close(); }
  if(dirname(root)!==tmpdir()||!basename(root).startsWith('cimiloop-child-claim-'))throw Error('Unsafe cleanup'); rmSync(root,{recursive:true,force:true});
 });
});
