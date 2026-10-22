import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInternalId } from "@cimiloop/protocol/v2";
import { requestDigest } from "@cimiloop/kernel";
import { LocalPrePlanClarification, openLocalProject, writeInstance } from "../src/index.js";
import { createIntentProject } from "../../../tests/fixtures/intent-project.js";
import { startWorkbench } from "../../../apps/workbench/src/server.js";

// Controlled trusted method host, actual Human/SQLite originals. No model,
// Native, real Matt qualification, Plan admission or S1 acceptance evidence.
describe("durable pre-plan Matt application execution", () => {
  let fixture: ReturnType<typeof createIntentProject>, local: ReturnType<typeof openLocalProject>;
  beforeAll(() => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-matt-application-"));
    fixture = createIntentProject(root, { databasePath: join(root, ".cimiloop", "project.db") });
    writeInstance(join(root, ".cimiloop", "instance.json"), { schema_version: "1.0.0", instance_id: fixture.project.instance_id,
      project_id: fixture.project.id, actor_id: fixture.actor.id, created_at: fixture.project.created_at });
    local = openLocalProject({ projectDir: root });
  }, 120_000);
  afterAll(() => { local?.store.close(); fixture?.store.close(); });

  function setup(mode: "normal" | "lost" | "pending" | "invalid" | "changed" | "second-read-revoked" = "normal", afterInvoke?: () => void) {
    const change = fixture.create(), originals = new Map<string, any>();
    let invokes = 0, reads = 0, verifies = 0;
    const host = {
      async invoke(input: any, beforeEffect: () => void) {
        beforeEffect(); invokes++;
        if (mode === "changed") { local.instance.actor_id = createInternalId(); return; }
        if (mode === "pending") return;
        originals.set(input.request.request_id, { format: "cimiloop/pre-plan-matt-original/1.0.0", invocation_key: input.invocation_key,
          input_digest: input.input_digest, method_name: "grill-me", source_digest: { algorithm: "sha256", value: requestDigest("PUBLIC source") },
          origin: "public_fixture", original_ref: { provider: "public_fixture", resource_type: "skill_invocation_proof", locator: input.invocation_key,
            digest: { algorithm: "sha256", value: requestDigest("PUBLIC original") } },
          output: { purpose: "clarification", questions: ["Which observable result proves the requirement?"], unresolved: [] } });
        afterInvoke?.();
        if (mode === "lost") throw Error("PUBLIC response lost after original capture");
      },
      async readOriginal(input: any) { reads++; return originals.get(input.request.request_id) ?? null; },
      verifyOriginal(_input: any, original: any) { verifies++; if (mode === "invalid" || mode === "second-read-revoked" && reads >= 2 || !original.original_ref) throw Error("PUBLIC private verification rejection"); }
    };
    const service = Reflect.construct(LocalPrePlanClarification, [local, host]) as LocalPrePlanClarification & { advanceAsync(changeId: string, sessionId: string, action: unknown, guard?: () => void): Promise<any> };
    const session = service.begin(change.id, { request_id: createInternalId(), requirement: "A bounded ordinary change", background: "Existing confirmed constraints", constraints: [] }).session;
    const request = { request_id: createInternalId(), expected_head: 0, kind: "matt" };
    return { change, service, session, request, originals, host, invokes: () => invokes, reads: () => reads, verifies: () => verifies };
  }

  it("records method questions and replays the same result without invoking twice or creating domain objects", async () => {
    const x = setup(), before = fixture.store.asOfEventSequence();
    expect(x.service.advanceAsync).toBeTypeOf("function");
    const result = await x.service.advanceAsync(x.change.id, x.session.id, x.request);
    expect(result.session).toMatchObject({ head: 1, pending: false, real_method_invocations: 0 });
    expect(result.session.questions).toHaveLength(1);
    expect(result.session.questions[0]!.source).toBe("matt");
    expect(result.session.unanswered).toEqual([result.session.questions[0]!.id]);
    expect(await x.service.advanceAsync(x.change.id, x.session.id, x.request)).toEqual(result);
    expect(x.invokes()).toBe(1);
    expect(fixture.store.asOfEventSequence()).toBe(before);
    expect(fixture.store.listExecutionObjects("task", x.change.id)).toHaveLength(0);
  });

  it("recovers a lost method response by reading the original, never repeating the invocation", async () => {
    const x = setup("lost");
    await expect(x.service.advanceAsync(x.change.id, x.session.id, x.request)).rejects.toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    expect(x.service.show(x.change.id, x.session.id).session).toMatchObject({ pending: true, head: 1 });
    const recovered = await x.service.advanceAsync(x.change.id, x.session.id, x.request);
    expect(recovered.session).toMatchObject({ pending: false, head: 1 });
    expect(x.invokes()).toBe(1);
  });

  it("keeps missing originals pending and refuses a replacement identity or changed input", async () => {
    const x = setup("pending");
    await expect(x.service.advanceAsync(x.change.id, x.session.id, x.request)).rejects.toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    await expect(x.service.advanceAsync(x.change.id, x.session.id, x.request)).rejects.toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    await expect(x.service.advanceAsync(x.change.id, x.session.id, { ...x.request, expected_head: 1 })).rejects.toMatchObject({ code: "COMMAND_ID_REUSED" });
    await expect(x.service.advanceAsync(x.change.id, x.session.id, { ...x.request, request_id: createInternalId() })).rejects.toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    expect(x.invokes()).toBe(1);
  });

  it("does not install serialized host authority or accept an unverified result", async () => {
    const x = setup("invalid"), before = fixture.store.asOfEventSequence();
    const error = await x.service.advanceAsync(x.change.id, x.session.id, x.request).catch(value => value);
    expect(error).toMatchObject({ code: "EVIDENCE_MISSING" });
    expect(String(error.message)).not.toContain("private verification");
    expect(x.service.show(x.change.id, x.session.id).session.pending).toBe(true);
    expect(fixture.store.asOfEventSequence()).toBe(before);
  });

  it("rechecks Human identity after awaiting the method and retains the original request", async () => {
    const x = setup("changed"), human = local.instance.actor_id;
    try { await expect(x.service.advanceAsync(x.change.id, x.session.id, x.request)).rejects.toMatchObject({ code: "CALLER_IDENTITY_MISMATCH" }); }
    finally { local.instance.actor_id = human; }
    expect(x.service.show(x.change.id, x.session.id).session.pending).toBe(true);
    expect(x.invokes()).toBe(1);
  });

  it("checks the current request guard after awaits and before accepting method output", async () => {
    let allowed = true; const x = setup("normal", () => { allowed = false; });
    await expect(x.service.advanceAsync(x.change.id, x.session.id, x.request, () => { if (!allowed) throw Error("PUBLIC request expired"); })).rejects.toThrow("PUBLIC request expired");
    expect(x.service.show(x.change.id, x.session.id).session.pending).toBe(true);
  });

  it("validates the full method input before reserving an operation that cannot execute", async () => {
    const x = setup(); let head = 0;
    for (let index = 0; index < 10; index++) {
      const question = { request_id: createInternalId(), expected_head: head++, kind: "question", text: "Q".repeat(4000) };
      x.service.advance(x.change.id, x.session.id, question);
      x.service.advance(x.change.id, x.session.id, { request_id: createInternalId(), expected_head: head++, kind: "answer", question_id: question.request_id, text: "A".repeat(4000) });
    }
    await expect(x.service.advanceAsync(x.change.id, x.session.id, { ...x.request, expected_head: head })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    expect(x.service.show(x.change.id, x.session.id).session).toMatchObject({ pending: false, head });
    expect(x.invokes()).toBe(0);
  });

  it("reserves enough conversation rounds for Human answers and a candidate before calling Matt", async () => {
    const x = setup(); let head = 0;
    for (let index = 0; index < 31; index++) {
      const question = { request_id: createInternalId(), expected_head: head++, kind: "question", text: "A bounded question" };
      x.service.advance(x.change.id, x.session.id, question);
      x.service.advance(x.change.id, x.session.id, { request_id: createInternalId(), expected_head: head++, kind: "answer", question_id: question.request_id, text: "A bounded answer" });
    }
    x.service.advance(x.change.id, x.session.id, { request_id: createInternalId(), expected_head: head++, kind: "question", text: "The final unresolved question" });
    await expect(x.service.advanceAsync(x.change.id, x.session.id, { ...x.request, expected_head: head })).rejects.toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    expect(x.service.show(x.change.id, x.session.id).session).toMatchObject({ pending: false, head: 63 });
    expect(x.invokes()).toBe(0);
  });

  it("verifies protected originals after the last asynchronous read, rejecting a revoked original", async () => {
    const x = setup("second-read-revoked");
    await expect(x.service.advanceAsync(x.change.id, x.session.id, x.request)).rejects.toMatchObject({ code: "EVIDENCE_MISSING" });
    expect(x.service.show(x.change.id, x.session.id).session.pending).toBe(true);
    expect(x.invokes()).toBe(1);
  });

  it("rejects serialized host installation before entering a method", () => {
    expect(() => Reflect.construct(LocalPrePlanClarification, [local, JSON.parse('{"invoke":"installed","readOriginal":"verified","verifyOriginal":true}')]))
      .toThrow("Matt 方法宿主必须由受信应用安装");
  });
  it("keeps method limitations out of Human questions for explicit result format2", async () => {
    const x = setup();
    const invoke = x.host.invoke.bind(x.host);
    x.host.invoke = async (input, guard) => {
      await invoke(input, guard);
      const original = x.originals.get(input.request.request_id);
      original.format = "cimiloop/pre-plan-matt-original/2.0.0";
      original.qualification = "unqualified_method_execution";
      original.output.unresolved = ["PUBLIC environment fact still unavailable"];
    };
    const service = new LocalPrePlanClarification(local, x.host);
    const result = await service.advanceAsync(x.change.id, x.session.id, x.request);
    expect(result.session.questions.map((q: any) => q.text)).toEqual(["Which observable result proves the requirement?"]);
    expect(result.session.steps[0]?.method_result?.output.unresolved).toEqual(["PUBLIC environment fact still unavailable"]);
    expect(await service.advanceAsync(x.change.id, x.session.id, x.request)).toEqual(result);
  });
  it("preserves legacy format1 unresolved items as their historical Human questions", async () => {
    const x = setup(), invoke = x.host.invoke.bind(x.host);
    x.host.invoke = async (input, guard) => { await invoke(input, guard); x.originals.get(input.request.request_id).output.unresolved = ["PUBLIC historical unresolved question"]; };
    const service = new LocalPrePlanClarification(local, x.host);
    expect((await service.advanceAsync(x.change.id, x.session.id, x.request)).session.questions.map(q => q.text))
      .toEqual(["Which observable result proves the requirement?", "PUBLIC historical unresolved question"]);
  });
  it("rejects an unexecutable installed host input before reserving the original request", async () => {
    const x = setup();
    const host = { ...x.host, prepare() { throw Error("PUBLIC fixed method input unavailable"); } };
    const service = new LocalPrePlanClarification(local, host);
    await expect(service.advanceAsync(x.change.id, x.session.id, x.request)).rejects.toThrow();
    expect(service.show(x.change.id, x.session.id).session).toMatchObject({ head: 0, pending: false });
    expect(x.invokes()).toBe(0);
  });

  it("shares the installed method host and immutable result with authenticated workbench requests", async () => {
    const x = setup(), server = await startWorkbench({ projectDir: local.location.repositoryPath, prePlanMatt: x.host });
    try {
      const login = await fetch(server.origin + "/api/session", { method: "POST", headers: { Origin: server.origin, "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify({ bootstrap: new URL(server.bootstrapUrl).hash.slice(1) }) });
      const cookie = login.headers.get("set-cookie")!.split(";")[0]!, csrf = (await login.json() as { csrf: string }).csrf;
      const send = async () => {
        const response = await fetch(server.origin + `/api/changes/${x.change.id}/clarifications/${x.session.id}`, { method: "POST",
          headers: { Cookie: cookie, Origin: server.origin, "Content-Type": "application/json", "X-CimiLoop-CSRF": csrf, Connection: "close" }, body: JSON.stringify(x.request) });
        return { status: response.status, body: await response.json() };
      };
      const before = fixture.store.asOfEventSequence(), first = await send();
      expect(first).toMatchObject({ status: 200, body: { session: { head: 1, pending: false, real_method_invocations: 0, questions: [{ source: "matt" }] } } });
      expect(await send()).toEqual(first); expect(x.invokes()).toBe(1); expect(fixture.store.asOfEventSequence()).toBe(before);
    } finally { await server.close(); }
  });

  it("retains pending method identity and suppresses output when the HTTP session expires during execution", async () => {
    const x = setup("normal", () => { vi.spyOn(Date, "now").mockReturnValue(Date.now() + 8 * 60 * 60 * 1000 + 1); });
    const server = await startWorkbench({ projectDir: local.location.repositoryPath, prePlanMatt: x.host });
    try {
      const login = await fetch(server.origin + "/api/session", { method: "POST", headers: { Origin: server.origin, "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify({ bootstrap: new URL(server.bootstrapUrl).hash.slice(1) }) });
      const cookie = login.headers.get("set-cookie")!.split(";")[0]!, csrf = (await login.json() as { csrf: string }).csrf;
      const response = await fetch(server.origin + `/api/changes/${x.change.id}/clarifications/${x.session.id}`, { method: "POST",
        headers: { Cookie: cookie, Origin: server.origin, "Content-Type": "application/json", "X-CimiLoop-CSRF": csrf, Connection: "close" }, body: JSON.stringify(x.request) });
      expect(response.status).toBe(401); expect(await response.json()).not.toHaveProperty("session");
      expect(x.service.show(x.change.id, x.session.id).session.pending).toBe(true); expect(x.invokes()).toBe(1);
    } finally { vi.restoreAllMocks(); await server.close(); }
  });
});
