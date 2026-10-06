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
});
