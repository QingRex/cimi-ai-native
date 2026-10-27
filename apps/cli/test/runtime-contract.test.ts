import {spawnSync} from 'node:child_process';import {resolve} from 'node:path';import {expect,it} from 'vitest';
it('exposes fixed Runtime contract stages and requires the original request id before opening a project',()=>{const cli=(args:string[])=>spawnSync(process.execPath,[resolve('apps/cli/dist/bin.js'),'runtime','contract',...args],{encoding:'utf8',windowsHide:true,timeout:30000});
 const help=cli(['--help']);expect(help.status).toBe(0);for(const action of['start','query','usage','continue','cancel','recover','capture','list'])expect(help.stdout).toContain(action);
 const start=cli(['start','01900000-0000-7000-8000-000000000001']);expect(start.status).not.toBe(0);expect(start.stdout+start.stderr).toContain('--request-id');
},120000);
