import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {afterEach,expect,it} from 'vitest';
const {JSDOM}=createRequire(import.meta.url)('jsdom'),script=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const ids={project:'01900000-0000-7000-8000-000000000001',actor:'01900000-0000-7000-8000-000000000002',skill:'01900000-0000-7000-8000-000000000003',runtime:'01900000-0000-7000-8000-000000000004',descriptor:'01900000-0000-7000-8000-000000000005'};
const windows:any[]=[];afterEach(()=>{for(const window of windows.splice(0))window.close();});
const until=async(check:()=>boolean)=>{const end=performance.now()+10000;while(!check()){if(performance.now()>end)throw Error('Probe UI state missing');await new Promise(done=>setTimeout(done,10));}};
function browser(saved:Record<string,string>={},denyStorage=false){
 const dom=new JSDOM(html,{url:'http://127.0.0.1:12345/#skills',runScripts:'outside-only'});windows.push(dom.window);const sent:{path:string;body?:any}[]=[];
 for(const [key,value] of Object.entries(saved))dom.window.sessionStorage.setItem(key,value);
 if(denyStorage){const get=dom.window.Storage.prototype.getItem;dom.window.Storage.prototype.getItem=function(key:string){if(key.startsWith('cimiloop.skill-probes.'))throw Error('PUBLIC storage denied');return get.call(this,key);};}
 dom.window.fetch=async(path:string,init:RequestInit={})=>{const body=init.body?JSON.parse(String(init.body)):undefined;sent.push({path,...(body?{body}:{})});let value:unknown;
  if(path==='/api/context')value={project_id:ids.project,actor_id:ids.actor,csrf:'PUBLIC'};
  else if(path==='/api/dashboard')value={project:{name:'PUBLIC probe UI'},governance:{actors:[{id:ids.actor,display_name:'PUBLIC Human'}]},providers:{descriptors:[{id:ids.skill,provider_kind:'skill',name:'PUBLIC candidate'},{id:ids.descriptor,provider_kind:'runtime',name:'PUBLIC Runtime'}],bindings:[{id:ids.runtime,descriptor_ref:{id:ids.descriptor},approval:{binding_scope:'isolated_provider_probe'}}]}};
  else if(path==='/api/skill-probes')value={requests:[]};
  else if(path.endsWith('/start'))throw Error('PUBLIC original response lost');
  else value={request_id:path.split('/').at(-1),run_created:false,outcome:'unknown',costs_reconciled:false};
  return{ok:true,json:async()=>value};};dom.window.eval('(async()=>{\n'+script+'\n})()');return{dom,sent};
}
// DOM/transport behavior only. No actual Kernel, Runtime, account or model.
it('saves the original id before dispatch and only queries that id after response loss and browser reload',async()=>{
 const first=browser();await until(()=>!!first.dom.window.document.querySelector('input[name="request_id"]'));const document=first.dom.window.document;
 document.querySelector('input[name="method"]').value='entry';document.querySelector('textarea[name="input"]').value=JSON.stringify({purpose:'clarification',requirement:'PUBLIC requirement',background:'PUBLIC context',constraints:[]});const requestId=document.querySelector('input[name="request_id"]').value;
 document.querySelector('input[name="method"]').closest('form').querySelector('button[type="submit"]').click();await until(()=>document.querySelector('#notice').textContent.includes('PUBLIC original response lost'));
 const key='cimiloop.skill-probes.'+ids.project+'.'+ids.actor,saved=first.dom.window.sessionStorage.getItem(key);expect(JSON.parse(saved)).toEqual([requestId]);expect(first.sent.filter(value=>value.path.endsWith('/start'))).toHaveLength(1);
 const second=browser({[key]:saved});await until(()=>!!second.dom.window.document.querySelector('[data-skill-probe-id]'));second.dom.window.document.querySelector('[data-skill-probe-id] button').click();await until(()=>second.sent.some(value=>value.path==='/api/skill-probes/'+requestId));expect(second.sent.some(value=>value.path.endsWith('/start'))).toBe(false);
});
it('keeps original query usable when browser storage is unavailable while disabling a new model invocation',async()=>{const {dom,sent}=browser({},true);await until(()=>!!dom.window.document.querySelector('input[name="request_id"]'));const document=dom.window.document;expect(document.querySelector('input[name="method"]').closest('form').querySelector('button[type="submit"]').disabled).toBe(true);const input=document.querySelector('input[name="id"]');input.value=ids.runtime;input.closest('form').querySelector('button[type="submit"]').click();await until(()=>sent.some(value=>value.path==='/api/skill-probes/'+ids.runtime));expect(sent.some(value=>value.path.endsWith('/start'))).toBe(false);});
