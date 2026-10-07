// Owned local test process only. Real Native project/WorkItem authorization and
// actual Git workspace effects; fixed test clock, no credential/model network.
import { openWorkspaceToolHost } from '../dist/index.js';
import { CimiLoopKernel } from '../../kernel/dist/index.js';
import { SqliteProjectStore } from '../../store-sqlite/dist/index.js';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const [repositoryPath, dataDirectory, database, callerJson, inputJson, phase] = process.argv.slice(2);
if (!['reserved_committed','native_prepared','dispatch_committed','effect_completed','completion_committed','before_completion_update','race_owner','race_contender','forced_native_prepared','forced_dispatch'].includes(phase)) throw Error('unknown owned fixture phase');
const store = new SqliteProjectStore(database), caller = JSON.parse(callerJson), project = store.getProject();
const kernel = new CimiLoopKernel({ store, caller, now: () => '2026-10-03T00:00:00.000Z' });
if (phase === 'before_completion_update') {
 const prepare = DatabaseSync.prototype.prepare;
 DatabaseSync.prototype.prepare = function(sql) { if (sql.startsWith("UPDATE workspace_tool_calls SET state='completed'")) process.exit(73); return prepare.call(this, sql); };
}
const execution = await openWorkspaceToolHost({ repositoryPath, dataDirectory, projectId: project.id, assess: request => kernel.assessRunTool(request), phase: async current => {
 if (phase === 'forced_native_prepared' && current === 'native_prepared' || phase === 'forced_dispatch' && current === 'dispatch_committed') {
  const journal = new DatabaseSync(join(dataDirectory, 'workspace-tools', project.id + '.sqlite'), { readOnly: true });
  let original; try { original = journal.prepare('SELECT preparation,owner FROM workspace_tool_calls').get(); } finally { journal.close(); }
  const preparation = JSON.parse(original.preparation);
  writeFileSync(join(dataDirectory, 'forced-original.json'), JSON.stringify({ preparation, owner: JSON.parse(original.owner) }));
  process.kill(preparation.worker.pid, 'SIGKILL'); process.exit(73);
 }
 if (current === phase) process.exit(73);
 if (phase === 'race_owner' && current === 'reserved_committed') {
  writeFileSync(join(dataDirectory, 'race-reserved.txt'), 'owned'); const deadline = Date.now() + 15000;
  while (!existsSync(join(dataDirectory, 'race-release.txt'))) { if (Date.now() >= deadline) throw Error('owned barrier timeout'); await delay(25); }
 }
} });
try { const result = await execution.host.execute(JSON.parse(inputJson)); console.log(JSON.stringify({ state: 'completed', replay: result.replay })); }
catch (error) { console.log(JSON.stringify({ state: error.reason ?? 'owned_fixture_failed' })); }
finally { await execution.host.close(); store.close(); }
