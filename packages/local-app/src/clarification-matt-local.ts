import { createHash } from "node:crypto";
import { requestDigest } from "@cimiloop/kernel";
import { compileValidator, DigestSchema, ExternalReferenceSchema, SkillMethodOutputSchema,
  type Digest, type ExternalReference, type SkillMethodOutput } from "@cimiloop/protocol/v2";
import { parseGatewayJson } from "@cimiloop/runtime-adapter";
import type { ClarificationAction, ClarificationSession } from "./clarification-local.js";
import { LocalProjectError } from "./errors.js";

export interface MattClarificationInput {
  format: "cimiloop/pre-plan-matt-input/1.0.0";
  invocation_key: string;
  basis: ClarificationSession["basis"];
  questions: ClarificationSession["questions"];
  steps: ClarificationSession["steps"];
  request: Extract<ClarificationAction, { kind: "matt" }>;
  maximum_questions: number;
  input_digest: string;
}
interface MattClarificationOriginalBody {
  invocation_key: string;
  input_digest: string;
  method_name: string;
  source_digest: Digest;
  origin: "external_model" | "public_fixture";
  original_ref: ExternalReference;
  output: Extract<SkillMethodOutput, { purpose: "clarification" }>;
}
export type MattClarificationOriginal = MattClarificationOriginalBody & (
  { format: "cimiloop/pre-plan-matt-original/1.0.0" } |
  { format: "cimiloop/pre-plan-matt-original/2.0.0"; qualification: "unqualified_method_execution" }
);

// Trusted application installation only. An imported Skill descriptor or HTTP
// JSON never installs this host. It owns a PRE-PLAN operation, not a fabricated
// Agent Run. It must enforce fixed source/harness/model/account admission and
// original-effect identity; verifyOriginal rechecks its protected originals.
export interface MattClarificationHost {
  // Synchronous, effect-free validation before durable request reservation.
  prepare?(input: MattClarificationInput): void;
  invoke(input: MattClarificationInput, beforeEffect: () => void): Promise<void>;
  readOriginal(input: MattClarificationInput): Promise<MattClarificationOriginal | null>;
  verifyOriginal(input: MattClarificationInput, original: MattClarificationOriginal): void;
}

export function mattClarificationInput(session: ClarificationSession, request: Extract<ClarificationAction, { kind: "matt" }>): MattClarificationInput {
  const input = { format: "cimiloop/pre-plan-matt-input/1.0.0" as const, invocation_key: session.id + "_" + request.request_id,
    basis: structuredClone(session.basis), questions: structuredClone(session.questions), steps: structuredClone(session.steps), request: structuredClone(request),
    maximum_questions: Math.max(0, Math.min(16, 62 - request.expected_head - session.questions.filter(question => question.answer === undefined).length)) };
  return { ...input, input_digest: requestDigest(input) };
}

const originalFailure = () => new LocalProjectError("原 Matt 方法结果尚不可独立核验；保留原请求", "EVIDENCE_MISSING", "conflict");
export function parseMattClarificationOriginal(input: MattClarificationInput, raw: unknown): MattClarificationOriginal {
  try {
    const body = JSON.stringify(raw);
    if (!body || Buffer.byteLength(body) > 65536) throw originalFailure();
    const original = parseGatewayJson(body, 65536) as MattClarificationOriginal;
    const modern = original?.format === "cimiloop/pre-plan-matt-original/2.0.0";
    if (!original || Object.keys(original).sort().join(",") !== (modern ? "format,input_digest,invocation_key,method_name,origin,original_ref,output,qualification,source_digest" : "format,input_digest,invocation_key,method_name,origin,original_ref,output,source_digest") ||
      (modern ? original.qualification !== "unqualified_method_execution" : original.format !== "cimiloop/pre-plan-matt-original/1.0.0") || original.invocation_key !== input.invocation_key || original.input_digest !== input.input_digest ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(original.method_name) || !["external_model", "public_fixture"].includes(original.origin)) throw originalFailure();
    compileValidator(DigestSchema)(original.source_digest);
    compileValidator(ExternalReferenceSchema)(original.original_ref);
    if (!original.original_ref.digest) throw originalFailure();
    const output = compileValidator<SkillMethodOutput>(SkillMethodOutputSchema)(original.output);
    if (output.purpose !== "clarification" || new Set(modern ? output.questions : [...output.questions, ...output.unresolved]).size > input.maximum_questions ||
      [...output.questions, ...output.unresolved].some(value => !value.trim() || value.length > 4000 || !value.isWellFormed())) throw originalFailure();
    return structuredClone(original);
  } catch { throw originalFailure(); }
}

export function mattClarificationQuestions(original: MattClarificationOriginal) {
  const questions = original.format === "cimiloop/pre-plan-matt-original/2.0.0" ? original.output.questions : [...original.output.questions, ...original.output.unresolved];
  return [...new Set(questions)].map((text, index) => {
    const bytes = createHash("sha256").update(original.invocation_key + "\0" + index).digest();
    bytes[6] = (bytes[6]! & 15) | 0x40; bytes[8] = (bytes[8]! & 63) | 0x80;
    const hex = bytes.toString("hex").slice(0, 32);
    return { id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`, text, source: "matt" as const };
  });
}
