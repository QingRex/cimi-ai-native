import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInternalId, type SkillImportSpec } from "@cimiloop/protocol/v2";
import { packageGitSkill, type VerifiedSkillPackage } from "@cimiloop/skill-adapter";
import { digest } from "@cimiloop/runtime-adapter";
import * as app from "../src/index.js";
import { createIntentProject } from "../../../tests/fixtures/intent-project.js";

// Real Git proof and shared Human/SQLite service, PUBLIC model transport only.
// This does not establish real Matt behavior, account usage or S1 acceptance.
describe("concrete Codex pre-plan clarification host", () => {
  let source: VerifiedSkillPackage, local: ReturnType<typeof app.openLocalProject>, fixture: ReturnType<typeof createIntentProject>;
  beforeAll(() => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-codex-app-")), skills = join(root, "skills-git"); mkdirSync(skills);
    const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=disabled-hooks", "-C", skills, ...args], { encoding: "utf8", windowsHide: true, stdio: "pipe" }).trim();
    const write = (path: string, content: string) => { mkdirSync(dirname(join(skills, path)), { recursive: true }); writeFileSync(join(skills, path), content); };
    git("init"); git("config", "user.name", "PUBLIC fixture"); git("config", "user.email", "public@example.test");
    write("LICENSE", "PUBLIC synthetic fixture license");
    write("skills/grill-me/SKILL.md", '---\nname: grill-me\ndescription: PUBLIC method fixture\n---\nCall the Skill tool with "grilling".\n');
    write("skills/grilling/SKILL.md", "---\nname: grilling\ndescription: PUBLIC dependency fixture\n---\nAsk only Human preferences.\n");
    git("add", "."); git("commit", "-m", "PUBLIC skill source fixture");
    const spec: SkillImportSpec = { format: "cimiloop/skill-import/1.0.0", repository_url: "https://example.test/skills", commit_id: git("rev-parse", "HEAD"), entry_path: "skills/grill-me", license_path: "LICENSE", name: "PUBLIC fixture", version: "1.0.0",
      modules: [{ path: "skills/grill-me", dependencies: ["skills/grilling"] }, { path: "skills/grilling", dependencies: [] }], capabilities: [{ capability_id: "intent.clarify", version: "1.0.0" }],
      provider_dependencies: [], required_permissions: { actions: [], resources: [], environment_ids: [], network_hosts: [] }, harness_requirements: ["invoke_skills"], dependency_review: "PUBLIC fixture only" };
    source = packageGitSkill(skills, spec);
    const project = join(root, "project"); mkdirSync(project);
    fixture = createIntentProject(project, { databasePath: join(project, ".cimiloop", "project.db") });
    app.writeInstance(join(project, ".cimiloop", "instance.json"), { schema_version: "1.0.0", instance_id: fixture.project.instance_id, project_id: fixture.project.id, actor_id: fixture.actor.id, created_at: fixture.project.created_at });
    local = app.openLocalProject({ projectDir: project });
  }, 120000);
  afterAll(() => { local?.store.close(); fixture?.store.close(); });
  function setup(lost = false) {
    const originals = new Map<string, any>(); let calls = 0, context: any;
    const transport = {
      async execute(request: any, tool: any, guard: () => void) {
        guard(); calls++;
        for (const name of request.tools.find((t: any) => t.name === "invoke_skill").inputSchema.properties.name.enum) await call("invoke_skill", { name });
        for (const path of request.tools.find((t: any) => t.name === "read_method_resource").inputSchema.properties.path.enum) await call("read_method_resource", { path });
        const transcript = await call("read_clarification_context", {}), envelope = JSON.parse(transcript); expect(envelope.origin).toBe("public_fixture"); context = envelope.input;
        const round = await call("ask_human_round", { questions: [{ question: "PUBLIC display preference?", recommendation: "Keep original operation visible." }] });
        const result = { format: "cimiloop/codex-method-original/1.0.0" as const, operation_key: request.operation_key, input_digest: digest(JSON.stringify(request)).value, thread_id: "PUBLIC-thread", turn_id: "PUBLIC-turn", model: request.model,
          account_digest: digest("PUBLIC account").value, tool_calls: entries, output_text: JSON.stringify({ purpose: "clarification", questions: JSON.parse(round).questions, unresolved: ["PUBLIC source installation facts remain unavailable"] }),
          usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, totalTokens: 2, reasoningOutputTokens: 0, cacheWriteInputTokens: 0 },
          original_ref: { provider: "codex_app_server", resource_type: "skill_invocation_proof", locator: "PUBLIC original " + request.operation_key, digest: digest("PUBLIC original " + request.operation_key) } };
        originals.set(request.operation_key, result); if (lost) throw Error("PUBLIC response lost"); return structuredClone(result);
        async function call(name: string, args: unknown) { const output = await tool(name, args); entries.push({ call_id: String(entries.length), tool: name, arguments: args, output }); return output; }
      },
      readOriginal(request: any) { const result = originals.get(request.operation_key); if (result && result.input_digest !== digest(JSON.stringify(request)).value) throw Error("PUBLIC changed original request"); return result ? structuredClone(result) : null; }
    };
    const entries: any[] = [];
    const Constructor = Reflect.get(app, "CodexMattClarificationHost"); expect(Constructor).toBeTypeOf("function");
    const host = new Constructor({ source, runtime: transport, model: "gpt-6-luna", origin: "public_fixture" });
    const service = new app.LocalPrePlanClarification(local, host), change = fixture.create();
    const session = service.begin(change.id, { request_id: createInternalId(), requirement: "PUBLIC requirement", background: "PUBLIC actual background", constraints: ["Keep original identity"] }).session;
    const question = { request_id: createInternalId(), expected_head: 0, kind: "question", text: "PUBLIC existing preference?" };
    service.advance(change.id, session.id, question);
    service.advance(change.id, session.id, { request_id: createInternalId(), expected_head: 1, kind: "answer", question_id: question.request_id, text: "PUBLIC actual Human answer" });
    const request = { request_id: createInternalId(), expected_head: 2, kind: "matt" };
    return { host, service, change, session, request, originals, calls: () => calls, context: () => context };
  }
  it("executes the fixed source through the shared service with the complete Human packet and original replay", async () => {
    const x = setup(), before = fixture.store.asOfEventSequence();
    const result = await x.service.advanceAsync(x.change.id, x.session.id, x.request);
    expect(x.context()).toMatchObject({ invocation_key: x.session.id + "_" + x.request.request_id, basis: { change: { id: x.change.id } }, questions: [{ answer: "PUBLIC actual Human answer" }], request: x.request });
    expect(x.context().steps).toHaveLength(2);
    expect(result.session.questions).toHaveLength(2);
    expect(result.session.real_method_invocations).toBe(0);
    expect(result.session.questions.some(q => q.text.includes("source installation facts"))).toBe(false);
    expect(result.session.steps[2]?.method_result).toMatchObject({ format: "cimiloop/pre-plan-matt-original/2.0.0", qualification: "unqualified_method_execution" });
    expect(await x.service.advanceAsync(x.change.id, x.session.id, x.request)).toEqual(result);
    expect(x.calls()).toBe(1); expect(fixture.store.asOfEventSequence()).toBe(before);
  });
  it("collects a lost original response without starting another model operation", async () => {
    const x = setup(true);
    await expect(x.service.advanceAsync(x.change.id, x.session.id, x.request)).rejects.toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    expect(x.service.show(x.change.id, x.session.id).session.pending).toBe(true);
    expect((await x.service.advanceAsync(x.change.id, x.session.id, x.request)).session.pending).toBe(false);
    expect(x.calls()).toBe(1);
  });
  it("rechecks protected transport originals after model completion", async () => {
    const x = setup(); await x.service.advanceAsync(x.change.id, x.session.id, x.request);
    const input = x.context(), original = await x.host.readOriginal(input);
    if (!original) throw Error("PUBLIC original missing");
    x.originals.get(input.invocation_key).tool_calls[0].output += "PUBLIC changed source";
    expect(() => x.host.verifyOriginal(input, original)).toThrow(); expect(x.calls()).toBe(1);
  });
  it("rejects a modified Git package before invoking the model", () => {
    const modified = structuredClone(source); modified.package.files[0]!.content_base64 = Buffer.from("PUBLIC tampered").toString("base64");
    const Constructor = Reflect.get(app, "CodexMattClarificationHost"); expect(Constructor).toBeTypeOf("function");
    expect(() => new Constructor({ source: modified, runtime: { async execute() { throw Error("PUBLIC must not execute"); }, readOriginal() { return null; } }, model: "gpt-6-luna", origin: "public_fixture" })).toThrow();
  });
  it("does not label an arbitrary public transport as an external model runtime", () => {
    const Constructor = Reflect.get(app, "CodexMattClarificationHost");
    expect(() => Reflect.construct(Constructor, [{ source, runtime: { async execute() { throw Error("PUBLIC must not execute"); }, readOriginal() { return null; } }, model: "gpt-6-luna", origin: "external_model" }])).toThrow();
  });
});
