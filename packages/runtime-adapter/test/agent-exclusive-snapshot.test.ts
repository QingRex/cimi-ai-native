import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {describe,it,expect} from 'vitest';
import {AgentStartLedger} from '../src/agent-start-ledger.js';import {digest} from '../src/files.js';
// Actual SQLite, constructed Host identity, no Native/model/Skill qualification.
describe('one original Host exclusive read cut',()=>{
 it('keeps namespaces independent and does not let readers mutate retained original tickets or payloads',()=>{
  const ledger=AgentStartLedger.initialize(join(mkdtempSync(join(tmpdir(),'cimiloop-exclusive-cut-')),'host'),{machine_digest:digest('controlled machine').value,principal_digest:digest('controlled principal').value});
  try{const id=digest('same id').value,a=ledger.issueExclusive('cut_a',id,{value:'original a'}),b=ledger.issueExclusive('cut_b',id,{value:'original b'}),rows=ledger.readExclusiveNamespaces(['cut_a','cut_b']);
   expect(rows).toEqual(expect.arrayContaining([{namespace:'cut_a',id,ticket:a,basis:{value:'original a'}},{namespace:'cut_b',id,ticket:b,basis:{value:'original b'}}]));
   (rows[0]!.basis as {value:string}).value='substituted';rows[0]!.ticket.ticket_id='substituted';expect(ledger.readExclusiveNamespaces(['cut_a'])).toEqual([{namespace:'cut_a',id,ticket:a,basis:{value:'original a'}}]);
   expect(ledger.listExclusive('cut_b')).toEqual([{id,ticket:b,basis:{value:'original b'}}]);
  }finally{ledger.close();}
 });
 it('rejects malformed or duplicate selectors and includes newly committed originals on the next read',()=>{
  const ledger=AgentStartLedger.initialize(join(mkdtempSync(join(tmpdir(),'cimiloop-exclusive-cut-')),'host'),{machine_digest:digest('controlled machine').value,principal_digest:digest('controlled principal').value});
  try{expect(ledger.readExclusiveNamespaces(['cut_a'])).toEqual([]);expect(()=>ledger.readExclusiveNamespaces([])).toThrow();expect(()=>ledger.readExclusiveNamespaces(['cut_a','cut_a'])).toThrow();expect(()=>ledger.readExclusiveNamespaces(['approved=true'])).toThrow();const id=digest('new original').value,ticket=ledger.issueExclusive('cut_a',id,{value:'fresh'});expect(ledger.readExclusiveNamespaces(['cut_a'])).toEqual([{namespace:'cut_a',id,ticket,basis:{value:'fresh'}}]);}finally{ledger.close();}
 });
});
