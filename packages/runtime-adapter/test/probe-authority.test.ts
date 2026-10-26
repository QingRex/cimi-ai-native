import {existsSync,mkdtempSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {expect,it} from 'vitest';
import {runOpenCodeProbe} from '../src/probe.js';
it.each(['revoked','promise','value'])('rejects %s technical authority before creating a probe root or spawning Native',async mode=>{
 const parent=mkdtempSync(join(tmpdir(),'rc-deny-')),root=join(parent,'absent');
 const beforeNativeEffect=()=>{if(mode==='revoked')throw Error('PUBLIC revoked');return mode==='promise'?Promise.resolve():{PUBLIC:'not a synchronous guard'};};
 await expect(runOpenCodeProbe({root,binary:join(parent,'absent.exe'),modelProbe:false,beforeNativeEffect})).rejects.toThrow();expect(existsSync(root)).toBe(false);
});
