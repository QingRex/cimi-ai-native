import { createRequire } from "node:module";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { requestDigest } from "../../../packages/kernel/src/canonical.js";
import { LocalPrePlanClarification, openLocalProject, writeInstance } from "@cimiloop/local-app";
import { createIntentProject } from "../../../tests/fixtures/intent-project.js";
import { startWorkbench, type WorkbenchServer } from "../src/server.js";

const { JSDOM } = createRequire(import.meta.url)("jsdom"), script = readFileSync(new URL("../public/app.js", import.meta.url), "utf8"), html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const until = async (check: () => boolean) => { const deadline = Date.now() + 10000; while (!check()) { if (Date.now() > deadline) throw Error("Matt UI state missing"); await new Promise(done => setTimeout(done, 10)); } };
const find = (dom: any, title: string) => [...dom.window.document.querySelectorAll("button")].find((b: any) => b.textContent === title) as { disabled: boolean; click(): void } | undefined;

// Actual DOM/HTTP/SQLite/Human originals with a PUBLIC method host. No model,
// upstream Matt behavior qualification, Native effects or S1 acceptance.
describe("workbench installed Matt and original clarification recovery", () => {
  let fixture: ReturnType<typeof createIntentProject>, local: ReturnType<typeof openLocalProject>;
  const browsers: any[] = [], servers: WorkbenchServer[] = [];
  beforeAll(() => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-matt-ui-"));
    fixture = createIntentProject(root, { databasePath: join(root, ".cimiloop", "project.db") });
    writeInstance(join(root, ".cimiloop", "instance.json"), { schema_version: "1.0.0", instance_id: fixture.project.instance_id, project_id: fixture.project.id, actor_id: fixture.actor.id, created_at: fixture.project.created_at });
    local = openLocalProject({ projectDir: root });
  }, 120000);
  afterAll(async () => { for (const dom of browsers) { await until(() => dom.window.__pendingFetches === 0); dom.window.close(); } for (const server of servers) await server.close(); local?.store.close(); fixture?.store.close(); });
  async function setup(installed = true, mode: "normal" | "lost" | "waiting" = "normal") {
    let calls = 0, release!: () => void; const gate = new Promise<void>(done => { release = done; }), originals = new Map<string, any>(), sent: unknown[] = [];
    const host = {
      async invoke(input: any, guard: () => void) {
        guard(); calls++; if (mode === "waiting") await gate; guard();
        originals.set(input.invocation_key, { format: "cimiloop/pre-plan-matt-original/2.0.0", invocation_key: input.invocation_key, input_digest: input.input_digest,
          method_name: "grill-me", source_digest: { algorithm: "sha256", value: requestDigest("PUBLIC source") }, origin: "public_fixture", qualification: "unqualified_method_execution",
          original_ref: { provider: "public_fixture", resource_type: "skill_invocation_proof", locator: "PUBLIC original", digest: { algorithm: "sha256", value: requestDigest("PUBLIC original") } },
          output: { purpose: "clarification", questions: ["PUBLIC Human preference? 建议：保留原操作。"], unresolved: ["PUBLIC missing source capability"] } });
        if (mode === "lost") throw Error("PUBLIC response lost after recording original");
      },
      async readOriginal(input: any) { return originals.get(input.invocation_key) ?? null; },
      verifyOriginal(input: any, original: any) { if (original.input_digest !== input.input_digest || !originals.has(input.invocation_key)) throw Error("PUBLIC original unavailable"); }
    };
    const change = fixture.create(), service = new LocalPrePlanClarification(local);
    const session = service.begin(change.id, { request_id: createInternalId(), requirement: "PUBLIC clarification UI", background: "PUBLIC original requirement", constraints: [] }).session;
    const server = await startWorkbench({ projectDir: local.location.repositoryPath, ...(installed ? { prePlanMatt: host } : {}) }); servers.push(server);
    const browser = (url: string, jar?: any, saved?: Record<string, string>) => {
      const dom = new JSDOM(html, { url, runScripts: "outside-only", ...(jar ? { cookieJar: jar } : {}) }); browsers.push(dom); dom.window.__pendingFetches = 0;
      for (const [key, value] of Object.entries(saved ?? {})) dom.window.sessionStorage.setItem(key, value);
      dom.window.fetch = async (path: string, init: RequestInit = {}) => {
        dom.window.__pendingFetches++;
        try {
          const destination = new URL(path, server.origin).href, headers = new Headers(init.headers);
          headers.set("Cookie", dom.cookieJar.getCookieStringSync(destination)); headers.set("Connection", "close"); if (init.method === "POST") headers.set("Origin", server.origin);
          if (path.includes("/clarifications/") && init.method === "POST") sent.push(JSON.parse(String(init.body)));
          const response = await fetch(destination, { ...init, headers }), cookie = response.headers.get("set-cookie"); if (cookie) dom.cookieJar.setCookieSync(cookie, destination, { http: true });
          const json = response.json.bind(response); Reflect.set(response, "json", async () => { try { return await json(); } finally { dom.window.__pendingFetches--; } }); return response;
        } catch (error) { dom.window.__pendingFetches--; throw error; }
      };
      dom.window.eval(`(async()=>{\n${script}\n})();`); return dom;
    };
    const ready = async (dom: any) => { await until(() => dom.window.document.querySelector("#operator")?.textContent.includes("Human")); dom.window.location.hash = "change/" + change.id; await until(() => !!dom.window.document.querySelector('textarea[name="question"]')); };
    return { server, change, session, service, sent, browser, ready, calls: () => calls, release };
  }
  it("shows installed Matt, records its Human frontier and keeps method limitations separate", async () => {
    const x = await setup(), dom = x.browser(x.server.bootstrapUrl); await x.ready(dom);
    expect(find(dom, "请 Matt 澄清当前轮")).toBeDefined(); find(dom, "请 Matt 澄清当前轮")!.click();
    await until(() => dom.window.document.querySelector("#content")?.textContent.includes("PUBLIC Human preference?"));
    const session = x.service.show(x.change.id, x.session.id).session;
    expect(session.questions).toHaveLength(1); expect(session.real_method_invocations).toBe(0);
    expect(dom.window.document.querySelector("#content")?.textContent).toContain("方法待核对项");
    expect(dom.window.document.querySelector("#content")?.textContent).toContain("PUBLIC missing source capability");
    expect(x.calls()).toBe(1); expect(find(dom, "请 Matt 澄清当前轮")).toBeUndefined();
  });
  it("explains an unavailable host and does not offer a model action", async () => {
    const x = await setup(false), dom = x.browser(x.server.bootstrapUrl); await x.ready(dom);
    expect(find(dom, "请 Matt 澄清当前轮")).toBeUndefined();
    expect(dom.window.document.querySelector("#content")?.textContent).toContain("Matt 方法宿主尚未安装"); expect(x.calls()).toBe(0);
  });
  it("retains the exact Matt request after a pending response and restores it from the server after browser storage loss", async () => {
    const x = await setup(true, "lost"), first = x.browser(x.server.bootstrapUrl); await x.ready(first);
    expect(find(first, "请 Matt 澄清当前轮")).toBeDefined(); find(first, "请 Matt 澄清当前轮")!.click();
    await until(() => first.window.document.querySelector("#notice")?.textContent.includes("原 Matt 操作尚待核对"));
    const saved = first.window.sessionStorage.getItem("cimiloop.pending." + fixture.project.id); expect(saved).not.toBeNull();
    expect(JSON.parse(saved).request).toEqual(x.sent[0]);
    const second = x.browser(x.server.origin + "/#change/" + x.change.id, first.cookieJar);
    await until(() => !!find(second, "核对原澄清请求"));
    find(second, "核对原澄清请求")!.click();
    await until(() => second.window.document.querySelector("#content")?.textContent.includes("PUBLIC Human preference?"));
    expect(x.sent).toHaveLength(2); expect(x.sent[1]).toEqual(x.sent[0]); expect(x.calls()).toBe(1);
    expect(x.service.show(x.change.id, x.session.id).session.pending).toBe(false);
  });
  it("keeps read-only original queries usable while the model request is still awaiting", async () => {
    const x = await setup(true, "waiting"), dom = x.browser(x.server.bootstrapUrl); await x.ready(dom);
    expect(find(dom, "请 Matt 澄清当前轮")).toBeDefined(); find(dom, "请 Matt 澄清当前轮")!.click();
    await until(() => x.calls() === 1);
    try {
      expect(find(dom, "查看原澄清记录")?.disabled).toBe(false); find(dom, "查看原澄清记录")!.click();
      await until(() => dom.window.document.querySelector("#notice")?.textContent.includes('"pending": true'));
      expect(x.sent).toHaveLength(1); expect(x.calls()).toBe(1);
    } finally { x.release(); }
    await until(() => x.service.show(x.change.id, x.session.id).session.pending === false);
  });
  it("does not replace a different preserved action while recovering a server-side pending operation", async () => {
    const x = await setup(true, "lost"), first = x.browser(x.server.bootstrapUrl); await x.ready(first); find(first, "请 Matt 澄清当前轮")!.click();
    await until(() => first.window.document.querySelector("#notice")?.textContent.includes("原 Matt 操作尚待核对"));
    const key = "cimiloop.pending." + fixture.project.id, other = JSON.stringify({ command_id: createInternalId(), command_type: "PUBLIC other original action" });
    const second = x.browser(x.server.origin + "/#change/" + x.change.id, first.cookieJar, { [key]: other });
    await until(() => !!find(second, "核对原澄清请求")); find(second, "核对原澄清请求")!.click();
    await until(() => second.window.document.querySelector("#notice")?.textContent.includes("另一个动作尚未核对"));
    expect(second.window.sessionStorage.getItem(key)).toBe(other); expect(x.sent).toHaveLength(1); expect(x.calls()).toBe(1);
  });
  it("sends no recovery request if the browser cannot preserve the exact original identity", async () => {
    const x = await setup(true, "lost"), first = x.browser(x.server.bootstrapUrl); await x.ready(first); find(first, "请 Matt 澄清当前轮")!.click();
    await until(() => first.window.document.querySelector("#notice")?.textContent.includes("原 Matt 操作尚待核对"));
    const second = x.browser(x.server.origin + "/#change/" + x.change.id, first.cookieJar);
    await until(() => !!find(second, "核对原澄清请求")); second.window.Storage.prototype.setItem = () => { throw Error("PUBLIC storage denied"); };
    find(second, "核对原澄清请求")!.click();
    await until(() => second.window.document.querySelector("#notice")?.textContent.includes("恢复请求尚未发送"));
    expect(x.sent).toHaveLength(1); expect(x.calls()).toBe(1); expect(x.service.show(x.change.id, x.session.id).session.pending).toBe(true);
    expect(find(second, "查看原澄清记录")?.disabled).toBe(false);
  });
});
