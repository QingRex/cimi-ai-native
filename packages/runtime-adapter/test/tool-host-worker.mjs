// Fixed public fixture worker. This does not accept Runtime-supplied host ports.
import { CimiLoopKernel } from '../../kernel/dist/index.js';
import { SqliteProjectStore } from '../../store-sqlite/dist/index.js';
import { ToolJournal } from '../dist/tool-journal.js';
import { PublicToolHost, PublicToolFileFixture } from '../dist/tool-host.js';
import { creditHostDependencies } from '../dist/gateway-credit-owner.js';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const [path, policyJson, launcher, domainPath, callerJson, root, requestJson, crashAt] = process.argv.slice(2);
if (!['reserved_committed', 'effect_completed', 'completion_committed', 'before_completion_update', 'race_owner', 'race_contender'].includes(crashAt)) throw Error('invalid owned fixture phase');
const store = new SqliteProjectStore(domainPath);
const kernel = new CimiLoopKernel({ store, caller: JSON.parse(callerJson), now: () => '2026-10-03T00:00:00.000Z' });
const journal = new ToolJournal(path, JSON.parse(policyJson), await creditHostDependencies(launcher));
if (crashAt === 'before_completion_update') {
  const prepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function(sql) { if (sql.startsWith("UPDATE tool_calls SET state='completed'")) process.exit(73); return prepare.call(this, sql); };
}
const host = new PublicToolHost({ journal, fixture: new PublicToolFileFixture(root), assess: request => kernel.assessRunTool(request),
  phase: async phase => {
    if (phase === crashAt) process.exit(73);
    if (crashAt === 'race_owner' && phase === 'reserved_committed') {
      writeFileSync(join(root, 'race-reserved.txt'), 'public fixture reservation committed');
      const deadline = Date.now() + 15000;
      while (!existsSync(join(root, 'race-contender-ended.txt'))) { if (Date.now() >= deadline) throw Error('fixture barrier deadline'); await delay(25); }
    }
  } });
try { const result = await host.execute(JSON.parse(requestJson)); console.log(JSON.stringify({ state: 'completed', replay: result.replay })); }
catch (error) { if (crashAt === 'race_contender') { console.log(JSON.stringify({ state: error.reason ?? 'fixture_failed' })); writeFileSync(join(root, 'race-contender-ended.txt'), 'public fixture contender finished'); } else throw error; }
finally { await host.close(); store.close(); }
