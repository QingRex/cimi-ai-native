import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, openSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { ChangeSchema, ContractBodySchema, compileValidator, type Change, type ContractBody } from "@cimiloop/protocol/v2";
import { assertOrdinaryPath, directory, parseGatewayJson } from "@cimiloop/runtime-adapter";
import { executeLocalCommand, type LocalProject } from "./project.js";
import { LocalProjectError } from "./errors.js";

const FORMAT = "cimiloop/pre-plan-clarification/1.0.0", APP_ID = 0x43494d43;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const parseContract = compileValidator<ContractBody>(ContractBodySchema), parseChange = compileValidator<Change>(ChangeSchema);
function fail(message: string, code: LocalProjectError["code"] = "INVALID_COMMAND", category: LocalProjectError["category"] = "validation"): never {
  throw new LocalProjectError(message, code, category);
};
function corrupt(): never { return fail("原澄清记录缺失或完整性无法核对，保留现场。", "EVIDENCE_MISSING", "storage"); }
const id = (value: unknown): string => typeof value === "string" && uuid.test(value) ? value : fail("需要原始内部请求身份");
const text = (value: unknown): string => typeof value === "string" && value.trim() && value.length <= 4000 && value.isWellFormed() ? value : fail("需要非空且有界的澄清内容");
const hash = (body: string) => createHash("sha256").update(body).digest("hex");
const encode = (value: unknown): string => {
  const body = JSON.stringify(value);
  if (typeof body !== "string" || Buffer.byteLength(body) > 131072) fail("澄清请求超过大小上限");
  parseGatewayJson(body, 131072); return body;
};
const copy = <T>(value: T): T => JSON.parse(encode(value)) as T;
const strict = (raw: unknown, keys: string[]): Record<string, unknown> => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
    Object.keys(raw).sort().join(",") !== keys.sort().join(",")) fail("澄清请求含缺失或不支持的字段");
  return raw as Record<string, unknown>;
};
export interface ClarificationBegin { request_id: string; requirement: string; background: string; constraints: string[] }
export type ClarificationAction = { request_id: string; expected_head: number } & (
  { kind: "question"; text: string } | { kind: "answer"; question_id: string; text: string } |
  { kind: "matt" } | { kind: "candidate"; requested_at: string; body: ContractBody });
interface Basis { format: typeof FORMAT; id: string; change_id: string; project_id: string; actor_id: string; change: Change; request: ClarificationBegin }
interface Step { request: ClarificationAction; command_result?: ReturnType<typeof executeLocalCommand> }
export interface ClarificationSession {
  id: string; change_id: string; project_id: string; actor_id: string; basis: Basis; head: number;
  steps: Step[]; questions: { id: string; text: string; answer?: string }[];
  unanswered: string[]; submitted: boolean; pending: boolean; real_method_invocations: 0;
}
const parseBegin = (raw: unknown): ClarificationBegin => {
  const value = strict(copy(raw), ["request_id", "requirement", "background", "constraints"]);
  if (!Array.isArray(value.constraints) || value.constraints.length > 32) fail("约束数量超过上限");
  return { request_id: id(value.request_id), requirement: text(value.requirement), background: text(value.background), constraints: value.constraints.map(text) };
};
const parseAction = (raw: unknown): ClarificationAction => {
  const value = copy(raw) as Record<string, unknown>, kind = value?.kind;
  const extras = kind === "question" ? ["text"] : kind === "answer" ? ["question_id", "text"] : kind === "candidate" ? ["requested_at", "body"] : kind === "matt" ? [] : fail("不支持的澄清动作");
  strict(value, ["request_id", "expected_head", "kind", ...extras]); id(value.request_id);
  if (!Number.isSafeInteger(value.expected_head) || Number(value.expected_head) < 0 || Number(value.expected_head) >= 64) fail("无效澄清轮次");
  if (kind === "question" || kind === "answer") text(value.text);
  if (kind === "answer") id(value.question_id);
  if (kind === "candidate") {
    if (typeof value.requested_at !== "string" || !Number.isFinite(Date.parse(value.requested_at)) ||
      new Date(value.requested_at).toISOString() !== value.requested_at) fail("需要固定的原请求时间");
    try { parseContract(value.body); } catch { fail("候选约定内容无效"); }
  }
  return value as unknown as ClarificationAction;
};
const ddl = [
  "CREATE TABLE sessions (id TEXT PRIMARY KEY, change_id TEXT NOT NULL, actor_id TEXT NOT NULL, body TEXT NOT NULL, digest TEXT NOT NULL) STRICT",
  "CREATE TABLE requests (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), seq INTEGER NOT NULL, body TEXT NOT NULL, digest TEXT NOT NULL, UNIQUE(session_id, seq)) STRICT",
  "CREATE TABLE results (request_id TEXT PRIMARY KEY REFERENCES requests(id), body TEXT NOT NULL, digest TEXT NOT NULL) STRICT",
  ...["sessions", "requests", "results"].flatMap(table => ["UPDATE", "DELETE"].map(action =>
    "CREATE TRIGGER " + table + "_" + action.toLowerCase() + " BEFORE " + action + " ON " + table + " BEGIN SELECT RAISE(ABORT, 'immutable clarification record'); END"))
];
// Private conversation originals, not Project domain facts or SkillInvocation proof.
// Format 1 is created separately; Project database format 10 is never migrated.
class ClarificationLedger {
  readonly db: DatabaseSync;
  constructor(path: string, create: boolean) {
    assertOrdinaryPath(path);
    const fresh = !existsSync(path);
    if (fresh) {
      if (!create) corrupt();
      directory(join(path, "..")); closeSync(openSync(path, "wx"));
    }
    if (!lstatSync(path).isFile()) corrupt();
    this.db = new DatabaseSync(path, { readOnly: !create });
    try {
      this.db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=30000;");
      if (fresh) {
        this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA max_page_count=16384; PRAGMA wal_autocheckpoint=128;");
        this.transaction(() => { for (const sql of ddl) this.db.exec(sql); this.db.exec("PRAGMA application_id=" + APP_ID + "; PRAGMA user_version=1;"); });
      } else if (create) this.db.exec("PRAGMA synchronous=FULL; PRAGMA max_page_count=16384; PRAGMA wal_autocheckpoint=128;");
      this.snapshot(() => {
        if (this.db.prepare("PRAGMA application_id").get()?.application_id !== APP_ID ||
          this.db.prepare("PRAGMA user_version").get()?.user_version !== 1 ||
          this.db.prepare("PRAGMA quick_check").get()?.quick_check !== "ok" ||
          this.db.prepare("PRAGMA foreign_key_check").all().length ||
          !isDeepStrictEqual(this.db.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY sql").all().map(row => row.sql), [...ddl].sort())) corrupt();
      });
    } catch (error) { this.db.close(); if (error instanceof LocalProjectError) throw error; corrupt(); }
  }
  close(): void { this.db.close(); }
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  snapshot<T>(work: () => T): T {
    if (this.db.isTransaction) return work();
    this.db.exec("BEGIN");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private decode(row: Record<string, unknown>): unknown {
    if (typeof row.body !== "string" || row.digest !== hash(row.body)) corrupt();
    try { const value = parseGatewayJson(row.body, 131072); if (encode(value) !== row.body) corrupt(); return JSON.parse(row.body); }
    catch { return corrupt(); }
  }
  request(requestId: string): { sessionId: string; seq: number; request: ClarificationAction; step?: Step } | undefined {
    const row = this.db.prepare("SELECT * FROM requests WHERE id=?").get(requestId);
    if (!row) return undefined;
    const request = parseAction(this.decode(row));
    if (request.request_id !== row.id || typeof row.session_id !== "string" || !Number.isSafeInteger(row.seq)) corrupt();
    const result = this.db.prepare("SELECT * FROM results WHERE request_id=?").get(requestId);
    const step = result ? this.decode(result) as Step : undefined;
    if (step && (!isDeepStrictEqual(step.request, request) || Object.keys(step).some(key => !["request", "command_result"].includes(key)) ||
      (request.kind === "candidate") !== ("command_result" in step))) corrupt();
    return { sessionId: row.session_id as string, seq: Number(row.seq), request, ...(step ? { step } : {}) };
  }
  session(sessionId: string, through?: number): ClarificationSession {
    return this.snapshot(() => {
      const row = this.db.prepare("SELECT * FROM sessions WHERE id=?").get(sessionId);
      if (!row) fail("原澄清会话不存在", "OBJECT_NOT_FOUND", "not_found");
      const basis = this.decode(row!) as Basis;
      try {
        strict(basis, ["format", "id", "change_id", "project_id", "actor_id", "change", "request"]);
        parseChange(basis.change); parseBegin(basis.request); id(basis.project_id); id(basis.actor_id); id(basis.change_id);
      } catch { corrupt(); }
      if (basis.format !== FORMAT || basis.id !== row!.id || basis.id !== basis.request.request_id ||
        basis.change_id !== row!.change_id || basis.change_id !== basis.change.id || basis.actor_id !== row!.actor_id ||
        basis.project_id !== basis.change.project_id) corrupt();
      const session: ClarificationSession = { id: basis.id, change_id: basis.change_id, project_id: basis.project_id,
        actor_id: basis.actor_id, basis, head: 0, steps: [], questions: [], unanswered: [], submitted: false, pending: false, real_method_invocations: 0 };
      const rows = this.db.prepare("SELECT id,seq FROM requests WHERE session_id=? ORDER BY seq").all(sessionId);
      if (rows.length > 64) corrupt();
      for (const [index, entry] of rows.entries()) {
        if (through !== undefined && index >= through) break;
        const item = this.request(String(entry.id));
        if (!item || entry.seq !== index + 1 || item.seq !== index + 1 || item.sessionId !== sessionId ||
          item.request.expected_head !== index || session.pending || session.submitted) corrupt();
        const request = item.request;
        if (!item.step) { session.pending = true; session.head++; continue; }
        if (request.kind === "question") session.questions.push({ id: request.request_id, text: request.text });
        else if (request.kind === "answer") {
          const question = session.questions.find(value => value.id === request.question_id);
          if (!question || question.answer !== undefined) corrupt(); question!.answer = request.text;
        } else if (request.kind === "candidate") session.submitted = true;
        else corrupt();
        session.head++; session.steps.push(item.step);
      }
      session.unanswered = session.questions.filter(question => question.answer === undefined).map(question => question.id);
      return session;
    });
  }
  list(changeId: string): ClarificationSession[] {
    return this.snapshot(() => this.db.prepare("SELECT id FROM sessions WHERE change_id=? ORDER BY rowid").all(changeId).map(row => this.session(String(row.id))));
  }
  begin(basis: Basis): ClarificationSession {
    return this.transaction(() => {
      if (this.db.prepare("SELECT id FROM requests WHERE id=?").get(basis.id)) fail("原请求身份已用于不同动作", "COMMAND_ID_REUSED", "conflict");
      const prior = this.db.prepare("SELECT id FROM sessions WHERE id=?").get(basis.id);
      if (prior) {
        const session = this.session(basis.id);
        if (session.change_id !== basis.change_id || session.actor_id !== basis.actor_id || !isDeepStrictEqual(session.basis.request, basis.request))
          fail("原请求身份已用于不同输入", "COMMAND_ID_REUSED", "conflict");
        return this.session(basis.id, 0);
      }
      if (Number(this.db.prepare("SELECT count(*) AS n FROM sessions").get()!.n) >= 512 ||
        Number(this.db.prepare("SELECT count(*) AS n FROM sessions WHERE change_id=?").get(basis.change_id)!.n) >= 32)
        fail("澄清会话容量已满，保留原记录", "RECOVERY_CONDITIONS_UNMET", "conflict");
      const body = encode(basis); this.db.prepare("INSERT INTO sessions VALUES (?,?,?,?,?)").run(basis.id, basis.change_id, basis.actor_id, body, hash(body));
      return this.session(basis.id);
    });
  }
  reserve(sessionId: string, request: ClarificationAction): void {
    if (this.db.prepare("SELECT id FROM sessions WHERE id=?").get(request.request_id)) fail("原请求身份已用于会话登记", "COMMAND_ID_REUSED", "conflict");
    const session = this.session(sessionId);
    if (session.pending || session.submitted) fail("原会话已有待核对或已提交动作", "RECOVERY_CONDITIONS_UNMET", "conflict");
    if (session.head !== request.expected_head) fail("澄清依据已变化", "REVISION_CONFLICT", "conflict");
    const body = encode(request);
    this.db.prepare("INSERT INTO requests VALUES (?,?,?,?,?)").run(request.request_id, sessionId, session.head + 1, body, hash(body));
  }
  complete(step: Step): void {
    const body = encode(step); this.db.prepare("INSERT INTO results VALUES (?,?,?)").run(step.request.request_id, body, hash(body));
  }
}

export class LocalPrePlanClarification {
  private readonly path: string;
  constructor(private readonly context: LocalProject) { this.path = join(context.location.dataDirectory, "pre-plan-clarifications", "originals.sqlite"); }
  private human(changeId: string): Change {
    id(changeId);
    const change = this.context.store.getChange(changeId), actor = this.context.store.getActor(this.context.instance.actor_id);
    if (!change || change.project_id !== this.context.instance.project_id) fail("需求不存在", "OBJECT_NOT_FOUND", "not_found");
    if (!actor || actor.actor_type !== "human" || actor.project_id !== change!.project_id ||
      (change!.owner_actor_id !== actor.id && change!.requirement_owner_actor_id !== actor.id))
      fail("需要当前需求的 Human 负责人", "CALLER_IDENTITY_MISMATCH", "forbidden");
    return change!;
  }
  private prePlan(changeId: string, expected?: Change): Change {
    const current = this.human(changeId);
    const basis = this.context.store.readSnapshot(reader => ({
      change: reader.getChange(changeId), plans: reader.listIntentRecords("plan_proposal", changeId),
      versions: reader.listIntentRecords("plan_version", changeId), tasks: reader.listExecutionObjects("task", changeId)
    })).value;
    if (!isDeepStrictEqual(current, basis.change) || (expected && !isDeepStrictEqual(expected, current)))
      fail("需求依据已变化，请核对新事实", "INPUT_CHANGED", "conflict");
    if (current.plan_ref || basis.plans.length || basis.versions.length || basis.tasks.length ||
      current.operating_status !== "Active" || !["Draft", "IntentReady"].includes(current.lifecycle_state))
      fail("只能在创建 Plan 或 Task 前澄清，不能追认历史", "RECOVERY_CONDITIONS_UNMET", "conflict");
    return current;
  }
  private bound(ledger: ClarificationLedger, changeId: string, sessionId: string): ClarificationSession {
    const session = ledger.session(id(sessionId));
    if (session.change_id !== changeId || session.project_id !== this.context.instance.project_id || session.actor_id !== this.context.instance.actor_id)
      fail("原会话与当前项目、需求或 Human 不匹配", "CALLER_IDENTITY_MISMATCH", "forbidden");
    return session;
  }
  list(changeId: string): { ok: true; sessions: { id: string; head: number; pending: boolean; submitted: boolean; requirement: string }[]; latest_session?: ClarificationSession } {
    this.human(changeId); assertOrdinaryPath(this.path);
    if (!existsSync(this.path)) return { ok: true, sessions: [] };
    const ledger = new ClarificationLedger(this.path, false);
    try {
      const own = ledger.list(changeId).filter(session => session.actor_id === this.context.instance.actor_id && session.project_id === this.context.instance.project_id);
      return { ok: true, sessions: own.map(session => ({ id: session.id, head: session.head, pending: session.pending,
        submitted: session.submitted, requirement: session.basis.request.requirement })),
        ...(own.length ? { latest_session: own.at(-1)! } : {}) };
    }
    finally { ledger.close(); }
  }
  show(changeId: string, sessionId: string): { ok: true; session: ClarificationSession } {
    this.human(changeId); const ledger = new ClarificationLedger(this.path, false);
    try { return { ok: true, session: this.bound(ledger, changeId, sessionId) }; } finally { ledger.close(); }
  }
  begin(changeId: string, raw: unknown): { ok: true; session: ClarificationSession } {
    const request = parseBegin(raw); this.human(changeId);
    const ledger = new ClarificationLedger(this.path, true);
    try {
      const prior = ledger.list(changeId).find(value => value.id === request.request_id);
      if (prior) {
        this.bound(ledger, changeId, prior.id);
        if (!isDeepStrictEqual(prior.basis.request, request)) fail("原请求身份已用于不同输入", "COMMAND_ID_REUSED", "conflict");
        return { ok: true, session: ledger.session(prior.id, 0) };
      }
      const change = this.prePlan(changeId);
      return { ok: true, session: ledger.begin({ format: FORMAT, id: request.request_id, change_id: changeId,
        project_id: this.context.instance.project_id, actor_id: this.context.instance.actor_id, change, request }) };
    } finally { ledger.close(); }
  }
  advance(changeId: string, sessionId: string, raw: unknown): { ok: true; session: ClarificationSession; command_result?: ReturnType<typeof executeLocalCommand> } {
    const request = parseAction(raw); this.human(changeId);
    assertOrdinaryPath(this.path); if (!existsSync(this.path)) corrupt();
    const ledger = new ClarificationLedger(this.path, true);
    try {
      const saved = ledger.transaction(() => {
        const session = this.bound(ledger, changeId, sessionId), prior = ledger.request(request.request_id);
        if (prior) {
          if (prior.sessionId !== sessionId || !isDeepStrictEqual(prior.request, request)) fail("原请求身份已用于不同输入", "COMMAND_ID_REUSED", "conflict");
          if (prior.step) return { seq: prior.seq, step: prior.step };
          if (request.kind !== "candidate") fail("原动作尚待核对，不创建替代请求", "RECOVERY_CONDITIONS_UNMET", "conflict");
          return undefined;
        }
        this.prePlan(changeId, session.basis.change);
        if (session.pending || session.submitted) fail("原会话已有待核对或已提交动作", "RECOVERY_CONDITIONS_UNMET", "conflict");
        if (request.expected_head !== session.head) fail("澄清依据已变化", "REVISION_CONFLICT", "conflict");
        if (request.kind === "matt") fail("真实 Matt 方法宿主尚未安装", "CAPABILITY_UNAVAILABLE", "conflict");
        if (request.kind === "answer" && !session.unanswered.includes(request.question_id)) fail("只能回答当前未解决问题");
        if (request.kind === "candidate" && (!session.questions.length || session.unanswered.length || request.body.unresolved_questions.length))
          fail("需要先完成 Human 澄清，再提交无未决问题的候选", "RECOVERY_CONDITIONS_UNMET", "conflict");
        ledger.reserve(sessionId, request);
        if (request.kind === "candidate") return undefined;
        const step: Step = { request }; ledger.complete(step); return { seq: request.expected_head + 1, step };
      });
      if (saved) return { ok: true, session: ledger.session(sessionId, saved.seq), ...(saved.step.command_result ? { command_result: saved.step.command_result } : {}) };
      if (request.kind !== "candidate") corrupt();
      const session = ledger.session(sessionId);
      const candidate = request as Extract<ClarificationAction, { kind: "candidate" }>;
      const command_result = executeLocalCommand(this.context, { command_id: request.request_id, requested_at: candidate.requested_at,
        acting_role: "change_owner", command_type: "SubmitContractProposal", target: { object_type: "change", id: changeId },
        expected_revision: session.basis.change.revision, payload: { base_version_ref: session.basis.change.contract_ref ?? null, body: candidate.body } });
      if ("code" in command_result && (command_result.retryable || ["storage", "internal"].includes(command_result.category))) {
        return { ok: true, session: ledger.session(sessionId), command_result };
      }
      ledger.transaction(() => {
        const current = ledger.request(request.request_id);
        if (current?.step) { if (!isDeepStrictEqual(current.step.command_result, command_result)) corrupt(); }
        else ledger.complete({ request, command_result });
      });
      return { ok: true, session: ledger.session(sessionId, request.expected_head + 1), command_result };
    } finally { ledger.close(); }
  }
}