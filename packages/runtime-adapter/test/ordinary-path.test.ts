import {mkdtempSync,mkdirSync,symlinkSync,renameSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {afterEach,expect,it} from 'vitest';
import {assertOrdinaryPath} from '../src/files.js';

const roots:string[]=[];
function setup(){const root=mkdtempSync(join(tmpdir(),'cimiloop-ordinary-path-'));roots.push(root);return root;}
afterEach(()=>{for(const root of roots.splice(0)){const checked=resolve(root);if(dirname(checked)!==resolve(tmpdir())||!basename(checked).startsWith('cimiloop-ordinary-path-'))throw Error('Unsafe fixture cleanup');rmSync(checked,{recursive:true,force:true});}});
const link=(target:string,path:string)=>symlinkSync(target,path,process.platform==='win32'?'junction':'dir');

it('refuses a dangling directory link even when an existence check reports no target',()=>{
 const root=setup(),path=join(root,'dangling');link(join(root,'missing-target'),path);expect(existsSync(path)).toBe(false);
 expect(()=>assertOrdinaryPath(path)).toThrow('linked_path_denied');
});
it('refuses a future descendant through a dangling directory link',()=>{
 const root=setup(),path=join(root,'dangling');link(join(root,'missing-target'),path);
 expect(()=>assertOrdinaryPath(join(path,'future','output.json'))).toThrow('linked_path_denied');
});
it('accepts a future path under ordinary parents without creating it',()=>{
 const root=setup(),path=join(root,'future','output.json');expect(assertOrdinaryPath(path)).toBe(resolve(path));expect(existsSync(path)).toBe(false);
});
it('checks the current parents again after an ordinary directory is replaced by a junction',()=>{
 const root=setup(),path=join(root,'parent'),target=join(root,'target');mkdirSync(path);mkdirSync(target);
 expect(assertOrdinaryPath(join(path,'future'))).toBe(resolve(path,'future'));renameSync(path,join(root,'retained-parent'));link(target,path);
 expect(()=>assertOrdinaryPath(join(path,'future'))).toThrow('linked_path_denied');
});
