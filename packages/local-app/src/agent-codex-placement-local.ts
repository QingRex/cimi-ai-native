import {existsSync,openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import {isAbsolute,join,parse,relative,resolve,sep} from 'node:path';
import {assertOrdinaryPath,bytesAt,directory,parseGatewayJson} from '@cimiloop/runtime-adapter';
import type {LocalProject} from './project.js';import {LocalProjectError} from './errors.js';
type Context=Pick<LocalProject,'location'|'instance'>;
function fail():never{throw new LocalProjectError('原 Runtime 放置记录缺失、冲突或指向旧安装；保留原目录，不自动迁移','CAPABILITY_UNAVAILABLE','conflict');}
const outside=(parent:string,path:string)=>{const value=relative(resolve(parent),resolve(path));return isAbsolute(value)||value==='..'||value.startsWith('..'+sep);};
// A first-install selector only. It grants no qualification, account capacity,
// migration or filesystem alias, and never hides a previous legacy installation.
export function codexRuntimePlacement(local:Context,requested?:string){
 const appData=process.env.LOCALAPPDATA;if(!appData||!isAbsolute(appData))fail();
 const legacy={root:join(appData!,'CimiLoop','runtime-codex',local.instance.project_id,local.instance.actor_id),tools:join(appData!,'CimiLoop','runtime-codex-tools')},anchor=assertOrdinaryPath(join(local.location.dataDirectory,'codex-runtime-placement')),file=join(anchor,'original.json');
 const body=(base:string)=>({format:'cimiloop/codex-runtime-placement/1.0.0',project_id:local.instance.project_id,actor_id:local.instance.actor_id,instance_id:local.instance.instance_id,repository:local.location.repositoryPath,data_directory:local.location.dataDirectory,base,root:join(base,'runtime-codex',local.instance.project_id,local.instance.actor_id),tools:join(base,'runtime-codex-tools')});
 const validate=(raw:unknown)=>{if(!raw||typeof raw!=='object'||!('base'in raw)||typeof raw.base!=='string'||!isAbsolute(raw.base))fail();const expected=body(assertOrdinaryPath(resolve(raw.base)));
  if(JSON.stringify(raw)!==JSON.stringify(expected)||parse(expected.base).root.toLowerCase()!==parse(resolve(local.location.repositoryPath)).root.toLowerCase()||parse(expected.base).root.toLowerCase()!==parse(resolve(local.location.dataDirectory)).root.toLowerCase()||[expected.root,expected.tools].some(path=>!outside(local.location.repositoryPath,path)||!outside(local.location.dataDirectory,path)))fail();
  if(resolve(expected.root)!==resolve(legacy.root)&&existsSync(assertOrdinaryPath(legacy.root)))fail();return expected;};
 let saved:ReturnType<typeof body>|undefined;
 if(existsSync(anchor)){if(!existsSync(assertOrdinaryPath(file)))fail();saved=validate(JSON.parse(JSON.stringify(parseGatewayJson(bytesAt(file,16384).toString('utf8'),16384))));}
 const selected=requested===undefined?saved:validate(body(assertOrdinaryPath(resolve(requested))));if(saved&&selected&&JSON.stringify(saved)!==JSON.stringify(selected))fail();
 const where=selected?{root:selected.root,tools:selected.tools}:legacy;
 for(const path of[where.root,where.tools]){assertOrdinaryPath(path);if(!outside(local.location.repositoryPath,path)||!outside(local.location.dataDirectory,path))fail();}
 return{...where,registered:saved!==undefined,commit(){if(!selected)return;const bytes=Buffer.from(JSON.stringify(selected));directory(anchor);if(!existsSync(file)){const fd=openSync(assertOrdinaryPath(file),'wx');try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}}if(!bytesAt(file,16384).equals(bytes))fail();}};
}
