import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeInstance } from "@cimiloop/local-app";
import { createAgentRunProject } from "../../../tests/fixtures/agent-run-project.js";
import { startWorkbench, type WorkbenchServer } from "../src/server.js";
const { JSDOM } = createRequire(import.meta.url)("jsdom");
const script=readFileSync(new URL("../public/app.js",import.meta.url),"utf8"),html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const until=async(condition:()=>boolean)=>{const deadline=Date.now()+15000;while(!condition()){if(Date.now()>deadline)throw Error("Agent control UI did not reach expected state");await new Promise(done=>setTimeout(done,10));}};

// Real browser DOM/HTTP/Kernel receipts; constructed Agent qualification and no
// Native registration/model effect. This does not enable formal Agent execution.
describe("Agent stop survives browser response loss",()=>{
  let root:string,f:ReturnType<typeof createAgentRunProject>,server:WorkbenchServer;const windows:any[]=[];
  afterEach(async()=>{for(const window of windows.splice(0))window.close();await server?.close();f?.store.close();if(root){
    if(dirname(root)!==resolve(tmpdir())||!basename(root).startsWith("cimiloop-agent-control-ui-"))throw Error("Unsafe cleanup");rmSync(root,{recursive:true,force:true});
  }});
  it("retains the exact stop command and Agent endpoint across reload, then replays one Kernel effect",async()=>{
    root=mkdtempSync(join(tmpdir(),"cimiloop-agent-control-ui-"));f=createAgentRunProject(root);const reserved=f.reserveAgent(f.prepareAgent());
    writeInstance(join(dirname(f.path),"instance.json"),{schema_version:"1.0.0",instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
    server=await startWorkbench({projectDir:root});let lose=true;const sent:Record<string,unknown>[]=[];
    const browser=(url:string,jar?:any,pending?:Record<string,string>)=>{
      const dom=new JSDOM(html,{url,runScripts:"outside-only",...(jar?{cookieJar:jar}:{})});windows.push(dom.window);
      for(const [key,value] of Object.entries(pending??{}))dom.window.sessionStorage.setItem(key,value);
      dom.window.fetch=async(path:string,init:RequestInit={})=>{
        const destination=new URL(path,server.origin).href,headers=new Headers(init.headers);
        headers.set("Cookie",dom.cookieJar.getCookieStringSync(destination));headers.set("Connection","close");if(init.method==="POST")headers.set("Origin",server.origin);
        if(path.endsWith("/stop"))sent.push(JSON.parse(String(init.body)));
        const response=await fetch(destination,{...init,headers});const cookie=response.headers.get("set-cookie");if(cookie)dom.cookieJar.setCookieSync(cookie,destination,{http:true});
        if(path.endsWith("/stop")&&response.ok&&lose){lose=false;throw TypeError("Constructed stop response loss");}return response;
      };
      dom.window.eval(`(async()=>{\n${script}\n})();`);return dom;
    };
    const first=browser(server.bootstrapUrl);await until(()=>first.window.document.querySelector("#operator")?.textContent.includes("Owner"));
    first.window.location.hash=`change/${f.change.id}`;
    await until(()=>[...first.window.document.querySelectorAll("button")].some((button:any)=>button.textContent==="查询原运行"));
    const stop=[...first.window.document.querySelectorAll("button")].find((button:any)=>button.textContent==="请求停止原运行") as any;
    const reason=stop.closest("form").querySelector('input[name="reason"]');reason.value="Stop exactly this original Agent";
    const sequence=f.store.asOfEventSequence();stop.click();await until(()=>first.window.document.querySelector("#notice")?.textContent.includes("Constructed stop response loss"));
    expect(f.store.getRun(reserved.run.id)!.cancel_requested).toBe(true);expect(f.store.asOfEventSequence()).toBe(sequence+1);
    const saved:Record<string,string>={};for(let i=0;i<first.window.sessionStorage.length;i++){const key=first.window.sessionStorage.key(i)!;saved[key]=first.window.sessionStorage.getItem(key)!;}
    const original=JSON.parse(saved[`cimiloop.pending.${f.project.id}`]!);expect(original.agent_runtime_control).toBe(true);expect(original.command_id).toBe(sent[0]!.command_id);
    const second=browser(`${server.origin}/#change/${f.change.id}`,first.cookieJar,saved);
    await until(()=>second.window.document.querySelector("#notice")?.textContent.includes("已保留原请求"));
    const beforeReplay=second.window.document.querySelector("#content").firstChild;
    [...second.window.document.querySelectorAll("#notice button")].find((button:any)=>button.textContent==="按原请求核对").click();
    await until(()=>second.window.sessionStorage.getItem(`cimiloop.pending.${f.project.id}`)===null&&
      second.window.document.querySelector("#content").firstChild!==beforeReplay);
    expect(sent).toHaveLength(2);expect(sent[1]).toEqual(sent[0]);expect(sent[0]).not.toHaveProperty("agent_runtime_control");
    expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(f.store.listRuns(f.change.id)).toHaveLength(1);
    expect(f.task().usage.pending_reconciliation).toBe(true);
  },120000);
});
