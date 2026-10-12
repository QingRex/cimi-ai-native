import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { writeInstance } from "@cimiloop/local-app";
import { createSkillInvocationProject } from "../../../tests/fixtures/skill-invocation-project.js";
import { startWorkbench, type WorkbenchServer } from "../src/server.js";


const { JSDOM } = createRequire(import.meta.url)("jsdom");
const script=readFileSync(new URL("../public/app.js",import.meta.url),"utf8"),html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const until=async(condition:()=>boolean)=>{const deadline=Date.now()+15000;while(!condition()){if(Date.now()>deadline)throw Error("Skill control UI did not reach expected state");await new Promise(done=>setTimeout(done,10));}};

// Real browser DOM/HTTP/Kernel receipts and assignment revocation; constructed
// method qualification and query responses, without OS/model effects.
// This does not enable formal Agent execution.
describe("original Skill controls survive browser response loss",()=>{
  let root:string,f:ReturnType<typeof createSkillInvocationProject>,server:WorkbenchServer;const windows:any[]=[];
  afterEach(async()=>{for(const window of windows.splice(0))window.close();await server?.close();f?.store.close();if(root){
    if(dirname(root)!==resolve(tmpdir())||!basename(root).startsWith("cimiloop-skill-control-ui-"))throw Error("Unsafe cleanup");rmSync(root,{recursive:true,force:true});
  }});
  it.each(['response_loss','role_revocation','query_errors'])('preserves original Skill control in %s',async kind=>{
    const action='stop';root=mkdtempSync(join(tmpdir(),"cimiloop-skill-control-ui-"));f=createSkillInvocationProject(root);const invocation=f.reserveSkill().invocation,reserved={run:f.currentRun()};
    writeInstance(join(dirname(f.path),"instance.json"),{schema_version:"1.0.0",instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
    const withheld:any[]=[];server=await startWorkbench({projectDir:root,...(kind==='role_revocation'?{skillRuntimeForInvocation:async()=>{f.store.transaction(tx=>{for(const assignment of tx.listAssignments(f.actor.id).filter(a=>a.role_key==='technical_owner')){withheld.push(assignment);tx.endAssignment({...assignment,ended_at:assignment.effective_at,updated_at:assignment.effective_at,revision:assignment.revision+1},assignment.revision);}});return{custody:null,release:()=>{}};}}:{})} as any);let lose=kind==='response_loss';const sent:Record<string,unknown>[]=[];
    const browser=(url:string,jar?:any,pending?:Record<string,string>)=>{
      const dom=new JSDOM(html,{url,runScripts:"outside-only",...(jar?{cookieJar:jar}:{})});windows.push(dom.window);
      for(const [key,value] of Object.entries(pending??{}))dom.window.sessionStorage.setItem(key,value);
      dom.window.fetch=async(path:string,init:RequestInit={})=>{
        const destination=new URL(path,server.origin).href,headers=new Headers(init.headers);
        headers.set("Cookie",dom.cookieJar.getCookieStringSync(destination));headers.set("Connection","close");if(init.method==="POST")headers.set("Origin",server.origin);
        if(path==="/api/skill-invocations/"+invocation.id+"/stop")sent.push(JSON.parse(String(init.body)));
        const response=await fetch(destination,{...init,headers});const cookie=response.headers.get("set-cookie");if(cookie)dom.cookieJar.setCookieSync(cookie,destination,{http:true});
        if(path==="/api/skill-invocations/"+invocation.id+"/stop"&&response.ok&&lose){lose=false;throw TypeError("Constructed control response loss");}return response;
      };
      dom.window.eval(`(async()=>{\n${script}\n})();`);return dom;
    };
    const first=browser(server.bootstrapUrl);await until(()=>first.window.document.querySelector("#operator")?.textContent.includes("Owner"));
    first.window.location.hash=`change/${f.change.id}`;
    await until(()=>[...first.window.document.querySelectorAll("button")].some((button:any)=>button.textContent==="查询原技能调用"));
    if(kind==='query_errors'){
      const requests:{resolve:(v:Response)=>void;reject:(v:Error)=>void}[]=[],real=first.window.fetch;first.window.fetch=(path:string,init:RequestInit)=>path==='/api/skill-invocations/'+invocation.id?new Promise<Response>((resolve,reject)=>requests.push({resolve,reject})):real(path,init);
      const query=[...first.window.document.querySelectorAll('button')].find((b:any)=>b.textContent==='查询原技能调用') as any,card=first.window.document.querySelector('[data-skill-control]'),notice=first.window.document.querySelector('#notice');
      const response=(marker:string)=>new Response(JSON.stringify({invocation_id:invocation.id,run_id:invocation.run_ref.id,starts_run:false,domain_observation_produced:false,operation:{outcome:'observed',result:{constructed:marker}}}),{status:200,headers:{'Content-Type':'application/json'}});
      query.click();await until(()=>requests.length===1);query.click();await until(()=>requests.length===2);requests[1]!.resolve(response('newer original'));await until(()=>card.textContent.includes('newer original'));notice.textContent='Current newer notice';requests[0]!.reject(Error('Late old failure'));await new Promise(r=>setTimeout(r,30));expect(notice.textContent).toBe('Current newer notice');
      query.click();await until(()=>requests.length===3);requests[2]!.reject(Error('Current query failed'));await until(()=>notice.textContent.includes('Current query failed'));expect(card.textContent).not.toContain('newer original');
      query.click();await until(()=>requests.length===4);first.window.location.hash='dashboard';await until(()=>!card.isConnected);notice.textContent='New dashboard notice';requests[3]!.reject(Error('Old disconnected failure'));await new Promise(r=>setTimeout(r,30));expect(notice.textContent).toBe('New dashboard notice');expect(f.currentRun().cancel_requested).toBe(false);return;
    }
    const control=[...first.window.document.querySelectorAll("button")].find((button:any)=>button.textContent==="请求停止原技能调用") as any;
    {const reason=control.closest("form").querySelector('input[name="reason"]');reason.value="Stop exactly this original Skill child";}
    const sequence=f.store.asOfEventSequence();control.click();await until(()=>first.window.document.querySelector("#notice")?.textContent.includes(kind==='response_loss'?"Constructed control response loss":"需要当前 Human 技术负责人"));
    expect(f.store.getRun(reserved.run.id)!.cancel_requested).toBe(true);expect(f.store.asOfEventSequence()).toBe(sequence+1);
    const saved:Record<string,string>={};for(let i=0;i<first.window.sessionStorage.length;i++){const key=first.window.sessionStorage.key(i)!;saved[key]=first.window.sessionStorage.getItem(key)!;}
    expect(saved["cimiloop.pending."+f.project.id]).toBeDefined();
    const original=JSON.parse(saved[`cimiloop.pending.${f.project.id}`]!);expect(original.skill_runtime_control).toBe(invocation.id);expect(original.command_id).toBe(sent[0]!.command_id);
    if(kind==='role_revocation')f.store.transaction(tx=>{for(const assignment of withheld){const {ended_at:_,...active}=assignment;tx.insertAssignment({...active,id:createInternalId(),revision:1});}});
    const second=browser(`${server.origin}/#change/${f.change.id}`,first.cookieJar,saved);
    await until(()=>second.window.document.querySelector("#notice")?.textContent.includes("已保留原请求"));
    const beforeReplay=second.window.document.querySelector("#content").firstChild;
    [...second.window.document.querySelectorAll("#notice button")].find((button:any)=>button.textContent==="按原请求核对").click();
    await until(()=>second.window.sessionStorage.getItem(`cimiloop.pending.${f.project.id}`)===null&&
      second.window.document.querySelector("#content").firstChild!==beforeReplay);
    expect(sent).toHaveLength(2);expect(sent[1]).toEqual(sent[0]);expect(sent[0]).not.toHaveProperty("skill_runtime_control");
    expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(f.store.listRuns(f.change.id)).toHaveLength(1);
    expect(f.task().usage.pending_reconciliation).toBe(true);
  },120000);
});
