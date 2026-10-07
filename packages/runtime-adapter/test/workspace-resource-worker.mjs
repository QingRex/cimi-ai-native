// Owned temporary-file fixture only. Captures actual original Node/native
// identities, kills its own prepared native child, then exits without cleanup.
import { WindowsWorkspaceFileBroker, parseWorkspaceToolInvocation } from '../dist/workspace-files.js';
import { buildWindowsLauncher, isolatedEnvironment } from '../dist/native.js';
import { creditHostDependencies } from '../dist/gateway-credit-owner.js';
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const [root, tools, inputJson, record, secondaryBinary] = process.argv.slice(2);
const files = await WindowsWorkspaceFileBroker.open(root, tools);
const owners = await creditHostDependencies(await buildWindowsLauncher(tools));
let preparation;
if (secondaryBinary) {
 const child = spawn(secondaryBinary, [], { windowsHide: true, stdio: ['pipe','pipe','pipe'], env: isolatedEnvironment() });
 const nonce = randomUUID(); let output = '';
 preparation = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => { child.kill(); reject(Error('owned secondary broker timeout')); }, 10000);
  child.on('error', error => { clearTimeout(timer); reject(error); });
  child.stdout.on('data', chunk => { output += chunk; if (output.length > 114688) { child.kill(); clearTimeout(timer); reject(Error('owned output bound')); }
   if (output.includes('\n')) { clearTimeout(timer); const value = JSON.parse(output.trim()); if (value.phase !== 'prepared' || value.worker.pid !== child.pid) reject(Error('owned preparation missing')); else resolve(value); }
  });
  child.stdin.write(JSON.stringify({ mode: 'prepare', nonce, root, root_identity: files.rootIdentity, request_base64: Buffer.from(JSON.stringify(parseWorkspaceToolInvocation(JSON.parse(inputJson)))).toString('base64') }) + '\n');
 });
} else preparation = (await files.prepare(JSON.parse(inputJson))).proof;
writeFileSync(record, JSON.stringify({ preparation, owner: owners.identity }));
process.kill(preparation.worker.pid, 'SIGKILL');
process.exit(73);
