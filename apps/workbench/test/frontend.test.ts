import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeInstance } from "@cimiloop/local-app";
import { createFlowProject } from "../../../tests/fixtures/flow-project.js";
import { startWorkbench, type WorkbenchServer } from "../src/server.js";

const { JSDOM } = createRequire(import.meta.url)("jsdom");
const script = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const until = async (condition: () => boolean) => {
  const deadline = Date.now() + 10_000;
  while (!condition()) { if (Date.now() > deadline) throw new Error("Frontend did not reach its expected state"); await new Promise(done => setTimeout(done, 10)); }
};

describe("Workbench frontend recovery with the real HTTP service and SQLite receipts", () => {
  let root: string, f: ReturnType<typeof createFlowProject>, service: WorkbenchServer;
  const windows: any[] = [];
  const browser = (url: string, options: { jar?: any; pending?: Record<string, string>; fault?: (path: string, response: Response) => void } = {}) => {
    const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true, ...(options.jar ? { cookieJar: options.jar } : {}) });
    windows.push(dom.window);
    for (const [key, value] of Object.entries(options.pending ?? {})) dom.window.sessionStorage.setItem(key, value);
    dom.window.fetch = async (path: string, init: RequestInit = {}) => {
      const destination = new URL(path, service.origin).href, headers = new Headers(init.headers);
      headers.set("Cookie", dom.cookieJar.getCookieStringSync(destination)); headers.set("Connection", "close");
      if (init.method === "POST") headers.set("Origin", service.origin);
      const response = await fetch(destination, { ...init, headers });
      const cookie = response.headers.get("set-cookie"); if (cookie) dom.cookieJar.setCookieSync(cookie, destination, { http: true });
      options.fault?.(path, response); return response;
    };
    // jsdom does not execute module scripts; preserve their async startup boundary.
    dom.window.eval(`(async () => {\n${script}\n})();`); return dom;
  };
  const pool = async (dom: any) => {
    dom.window.location.hash = "pool";
    await until(() => Boolean(dom.window.document.querySelector('input[name="title"]')));
  };
  const create = (dom: any, title: string) => {
    const input = dom.window.document.querySelector('input[name="title"]'); input.value = title;
    input.closest("form").querySelector('button[type="submit"]').click();
  };
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "cimiloop-workbench-ui-"));
    f = createFlowProject(root, { databasePath: join(root, ".cimiloop", "project.db") }); f.configure();
    writeInstance(join(root, ".cimiloop", "instance.json"), { schema_version: "1.0.0", instance_id: f.project.instance_id, project_id: f.project.id, actor_id: f.actor.id, created_at: f.project.created_at });
    service = await startWorkbench({ projectDir: root });
  });
  afterEach(async () => {
    for (const window of windows.splice(0)) window.close(); await service?.close(); f?.store.close();
    if (root) {
      if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("cimiloop-workbench-ui-")) throw new Error("Unsafe test cleanup");
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("retains a response-lost command across page reload and replays its one native effect", async () => {
    let loseOnce = true, csrf: string | undefined;
    const first = browser(service.bootstrapUrl, { fault(path, response) {
      if (path === "/api/context") void response.clone().json().then(body => { csrf = (body as { csrf: string }).csrf; });
      if (path === "/api/commands" && response.ok && loseOnce) { loseOnce = false; throw new TypeError("Synthetic response loss"); }
    } });
    await until(() => first.window.document.querySelector("#operator")?.textContent.includes("Owner")); await pool(first);
    create(first, "Response-lost requirement");
    await until(() => first.window.document.querySelector("#notice")?.textContent.includes("Synthetic response loss"));
    const storage = first.window.sessionStorage, saved: Record<string, string> = {};
    for (let index = 0; index < storage.length; index++) { const key = storage.key(index)!; saved[key] = storage.getItem(key)!; }
    expect(Object.keys(saved)).toEqual([`cimiloop.pending.${f.project.id}`]);
    expect(typeof csrf).toBe("string");
    expect(JSON.stringify(saved)).not.toContain(csrf!);
    expect(first.window.document.cookie).toBe(""); // Session is HttpOnly.
    expect(f.store.listChanges().filter(change => change.title === "Response-lost requirement")).toHaveLength(1);
    const retainedCookie = first.cookieJar.getCookieStringSync(service.origin);
    first.cookieJar.removeAllCookiesSync();
    [...first.window.document.querySelectorAll("#notice button")].find((element: any) => element.textContent === "按原请求核对").click();
    await until(() => first.window.document.querySelector("#notice")?.textContent.includes("SESSION_REQUIRED"));
    expect(first.window.sessionStorage.getItem(`cimiloop.pending.${f.project.id}`)).toBe(saved[`cimiloop.pending.${f.project.id}`]);
    first.cookieJar.setCookieSync(`${retainedCookie}; HttpOnly; SameSite=Strict; Path=/`, service.origin, { http: true });
    const second = browser(`${service.origin}/#pool`, { jar: first.cookieJar, pending: saved });
    await until(() => second.window.document.querySelector("#notice")?.textContent.includes("已保留原请求"));
    const beforeReplay = second.window.document.querySelector("#content").firstChild;
    const retry = [...second.window.document.querySelectorAll("#notice button")].find((element: any) => element.textContent === "按原请求核对") as any;
    retry.click(); await until(() => second.window.sessionStorage.length === 0 && second.window.document.querySelector("#content").firstChild !== beforeReplay);
    expect(f.store.listChanges().filter(change => change.title === "Response-lost requirement")).toHaveLength(1);
  });
  it("keeps a committed command known when refreshing the page facts fails", async () => {
    let failRefresh = false;
    const dom = browser(service.bootstrapUrl, { fault(path, response) {
      if (path === "/api/commands" && response.ok) failRefresh = true;
      else if (path === "/api/dashboard" && failRefresh) { failRefresh = false; throw new Error("Synthetic refresh failure"); }
    } });
    await until(() => dom.window.document.querySelector("#operator")?.textContent.includes("Owner")); await pool(dom);
    create(dom, "Committed before refresh failure");
    await until(() => dom.window.document.querySelector("#notice")?.textContent.includes("动作已记录，但刷新失败"));
    expect(dom.window.sessionStorage.length).toBe(0);
    expect(f.store.listChanges().filter(change => change.title === "Committed before refresh failure")).toHaveLength(1);
  });
  it("renders untrusted titles as text and uses the configured Flow Owner for planning", async () => {
    const dom = browser(service.bootstrapUrl); await until(() => dom.window.document.querySelector("#operator")?.textContent.includes("Owner")); await pool(dom);
    const title = '<img src=x onerror="throw new Error(1)">'; create(dom, title);
    await until(() => dom.window.document.querySelector("#content")?.textContent.includes(title));
    expect(dom.window.document.querySelectorAll("#content img")).toHaveLength(0);
    const version = dom.window.document.querySelector('input[name="name"]'); version.value = "Frontend planning version";
    version.closest("form").querySelector('button[type="submit"]').click();
    await until(() => dom.window.document.querySelector("#content")?.textContent.includes("Frontend planning version"));
    expect(f.store.listTargetVersions()).toHaveLength(1);
  });
  it("retains a response-lost clarification question across reload and submits one candidate from the completed Human round",async()=>{
    const change=f.create("Before any plan");let lose=true;
    const first=browser(service.bootstrapUrl,{fault(path,response){if(path.includes("/clarifications/")&&response.ok&&lose){lose=false;throw TypeError("Constructed clarification response loss");}}});
    await until(()=>first.window.document.querySelector("#operator")?.textContent.includes("Owner"));first.window.location.hash='change/'+change.id;
    await until(()=>Boolean(first.window.document.querySelector('textarea[name="requirement"]')));
    const fill=(dom:any,selector:string,value:string)=>{const field=dom.window.document.querySelector(selector);field.value=value;return field.closest("form");};
    const begin=fill(first,'textarea[name="requirement"]',"澄清后提交唯一候选");fill(first,'textarea[name="background"]',"真实HTTP和Kernel");
    begin.querySelector('button[type="submit"]').click();
    await until(()=>Boolean(first.window.document.querySelector('textarea[name="question"]')));
    const question=fill(first,'textarea[name="question"]',"应怎样验收？");question.querySelector('button[type="submit"]').click();
    await until(()=>first.window.document.querySelector("#notice")?.textContent.includes("Constructed clarification response loss"));
    const saved:Record<string,string>={};for(let i=0;i<first.window.sessionStorage.length;i++){const key=first.window.sessionStorage.key(i)!;saved[key]=first.window.sessionStorage.getItem(key)!;}
    const original=JSON.parse(saved['cimiloop.pending.'+f.project.id]!);expect(original.clarification_request).toBe(true);expect(original.request.kind).toBe("question");
    const second=browser(service.origin+'/#change/'+change.id,{jar:first.cookieJar,pending:saved});
    await until(()=>second.window.document.querySelector("#notice")?.textContent.includes("已保留原请求"));
    [...second.window.document.querySelectorAll("#notice button")].find((item:any)=>item.textContent==="按原请求核对").click();
    await until(()=>second.window.sessionStorage.getItem('cimiloop.pending.'+f.project.id)===null&&Boolean(second.window.document.querySelector('textarea[name="answer"]')));
    const answer=fill(second,'textarea[name="answer"]',"保留一致回执");answer.querySelector('button[type="submit"]').click();
    await until(()=>[...second.window.document.querySelectorAll("summary")].some((item:any)=>item.textContent==="从澄清提交约定候选"));
    const summary=[...second.window.document.querySelectorAll("summary")].find((item:any)=>item.textContent==="从澄清提交约定候选") as any;summary.parentElement.open=true;
    const form=summary.parentElement.querySelector("form");for(const [key,value] of Object.entries({goal:"一致结果",scope:"查询",scenario:"重试",expected:"一份候选",evidence:"原收据",rationale:"可撤回候选"}))form.querySelector('[name="'+key+'"]').value=value;
    const sequence=f.store.asOfEventSequence();form.querySelector('button[type="submit"]').click();
    await until(()=>f.store.listIntentRecords("contract_proposal",change.id).length===1&&second.window.sessionStorage.getItem('cimiloop.pending.'+f.project.id)===null&&second.window.document.querySelector("#content")?.textContent.includes("原候选已处理"));
    expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(f.store.listIntentRecords("plan_proposal",change.id)).toHaveLength(0);expect(f.store.listExecutionObjects("task",change.id)).toHaveLength(0);
  },60000);
  it("releases a known Kernel rejection of a clarification candidate and displays its original error",async()=>{
    const change=f.create("Reject candidate"), priorCommand={...f.context(),command_type:"CreateChange",payload:{title:"Earlier command identity"}};
    f.kernel.execute(priorCommand);const dom=browser(service.bootstrapUrl);
    await until(()=>dom.window.document.querySelector("#operator")?.textContent.includes("Owner"));dom.window.location.hash='change/'+change.id;
    await until(()=>Boolean(dom.window.document.querySelector('textarea[name="requirement"]')));
    const fill=(selector:string,value:string)=>{const field=dom.window.document.querySelector(selector);field.value=value;return field.closest("form");};
    const begin=fill('textarea[name="requirement"]',"明确拒绝");fill('textarea[name="background"]',"无目标权限");
    begin.querySelector('button[type="submit"]').click();await until(()=>Boolean(dom.window.document.querySelector('textarea[name="question"]')));
    fill('textarea[name="question"]',"如何提交？").querySelector('button[type="submit"]').click();await until(()=>Boolean(dom.window.document.querySelector('textarea[name="answer"]')));
    fill('textarea[name="answer"]',"核对原请求").querySelector('button[type="submit"]').click();
    await until(()=>[...dom.window.document.querySelectorAll("summary")].some((item:any)=>item.textContent==="从澄清提交约定候选"));
    const summary=[...dom.window.document.querySelectorAll("summary")].find((item:any)=>item.textContent==="从澄清提交约定候选") as any;summary.parentElement.open=true;
    const form=summary.parentElement.querySelector("form");for(const [key,value] of Object.entries({goal:"目标",scope:"范围",scenario:"场景",expected:"拒绝",evidence:"原错误",rationale:"测试"}))form.querySelector('[name="'+key+'"]').value=value;
    // Generate the next browser UUID as the existing real Kernel command ID.
    const bytes=Uint8Array.from(priorCommand.command_id.replaceAll("-","").match(/../g)!,byte=>parseInt(byte,16));
    dom.window.crypto.getRandomValues=(target:Uint8Array)=>{target.set(bytes);return target;};
    dom.window.Date.now=()=>parseInt(priorCommand.command_id.replaceAll("-","").slice(0,12),16);
    const storage=dom.window.sessionStorage;
    form.querySelector('button[type="submit"]').click();
    await until(()=>dom.window.document.querySelector("#notice")?.textContent.includes("同一 command_id"));
    expect(storage.getItem('cimiloop.pending.'+f.project.id)).toBeNull();expect(f.store.listIntentRecords("contract_proposal",change.id)).toHaveLength(0);
  },60000);
});
