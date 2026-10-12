import {DatabaseSync} from 'node:sqlite';
import {isAbsolute,resolve,relative,basename,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
const root=process.argv[2];
if(!root||!isAbsolute(root)||dirname(resolve(root))!==resolve(tmpdir())||!basename(root).startsWith('cimiloop-start-ledger-'))throw Error('Unexpected owned fixture root');
const path=join(root,'original','starts.sqlite');
if(relative(root,path)!==join('original','starts.sqlite'))throw Error('Fixture escape');
const db=new DatabaseSync(path);
try{
 db.exec('PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE;');
 db.prepare('SELECT body FROM origin WHERE singleton=1').get();
 process.stdout.write('locked\n');
 setTimeout(()=>{try{db.exec('ROLLBACK');}finally{db.close();}},2500);
}catch(error){db.close();throw error;}
