import { isDeepStrictEqual } from "node:util";
import { requestDigest } from "@cimiloop/kernel";
import { fixedMethodInvocationPlan, verifySkillPackageBytes, type VerifiedSkillPackage } from "@cimiloop/skill-adapter";
import { CodexFixedClarificationMethod, CodexOriginalMethodRuntime, parseGatewayJson, type CodexFixedClarificationOptions,
  type CodexFixedClarificationOriginal,type CodexOriginalMethodOptions } from "@cimiloop/runtime-adapter";
import { parseMattClarificationOriginal, type MattClarificationHost, type MattClarificationInput, type MattClarificationOriginal } from "./clarification-matt-local.js";
import { LocalProjectError } from "./errors.js";

export type CodexMattClarificationOptions = {
  source: VerifiedSkillPackage;
  model: string;
  facts?: CodexFixedClarificationOptions["facts"];
  ordinary_quota_account_digest?:string;
} & ({ origin: "external_model"; runtime: CodexOriginalMethodRuntime } |
  { origin: "public_fixture"; runtime: Pick<CodexOriginalMethodRuntime, "execute" | "readOriginal"> });
const unavailable = (): never => { throw new LocalProjectError("固定 Matt 输入或原件无法核对，保留原会话", "EVIDENCE_MISSING", "conflict"); };

// A concrete, trusted-code installation for the PRE-PLAN application service.
// It provides actual method execution and immutable original verification, not
// Skill behavior qualification or the independent Kernel Plan admission port.
// Imported JSON/provider descriptors never instantiate this host.
export class CodexMattClarificationHost implements MattClarificationHost {
  private readonly source: VerifiedSkillPackage;
  private readonly runtime: CodexMattClarificationOptions["runtime"];
  private readonly model: string;
  private readonly facts?: CodexFixedClarificationOptions["facts"];
  private readonly origin: "external_model" | "public_fixture";
  private readonly configuration:CodexOriginalMethodOptions|undefined;
  private readonly ordinaryQuotaAccountDigest:string|undefined;
  constructor(options: CodexMattClarificationOptions) {
    this.source = verifySkillPackageBytes(Buffer.from(JSON.stringify(options.source.package)), options.source.source_digest);
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(options.model) || typeof options.runtime.execute !== "function" || typeof options.runtime.readOriginal !== "function" ||
      !["external_model", "public_fixture"].includes(options.origin) || options.origin === "external_model" && !(options.runtime instanceof CodexOriginalMethodRuntime)) unavailable();
    this.model = options.model;
    this.origin = options.origin;
    this.configuration=options.origin==='external_model'?options.runtime.originalConfiguration:undefined;
    if(options.ordinary_quota_account_digest!==undefined&&!/^[a-f0-9]{64}$/.test(options.ordinary_quota_account_digest))unavailable();
    this.ordinaryQuotaAccountDigest=options.ordinary_quota_account_digest;
    this.runtime = Object.freeze({ execute: options.runtime.execute.bind(options.runtime), readOriginal: options.runtime.readOriginal.bind(options.runtime) });
    if (options.facts) this.facts = Object.freeze({ execute: options.facts.execute.bind(options.facts), readOriginal: options.facts.readOriginal.bind(options.facts), snapshot: options.facts.snapshot.bind(options.facts) });
  }
  private prepared(raw: MattClarificationInput) {
    const body = JSON.stringify(raw);
    if (!body || Buffer.byteLength(body) > 131072) unavailable();
    const input = parseGatewayJson(body, 131072) as MattClarificationInput;
    const { input_digest: claimed, ...packet } = input;
    if (input.format !== "cimiloop/pre-plan-matt-input/1.0.0" || claimed !== requestDigest(packet) ||
      input.invocation_key !== input.basis.id + "_" + input.request.request_id || input.request.kind !== "matt" ||
      input.request.expected_head !== input.steps.length || input.basis.id !== input.basis.request.request_id) unavailable();
    const name = this.source.modules.find(module => module.path === this.source.package.spec.entry_path)!.name;
    const plan = fixedMethodInvocationPlan(this.source, { format: "cimiloop/named-skill-method/1.0.0", invocation_key: input.invocation_key,
      method_name: name, source_digest: this.source.source_digest, input: { purpose: "clarification", requirement: input.basis.request.requirement,
        background: input.basis.request.background, constraints: input.basis.request.constraints } });
    const method = new CodexFixedClarificationMethod(this.runtime, this.model, { maximum_questions: input.maximum_questions,
      ...(this.ordinaryQuotaAccountDigest?{ordinary_quota_account_digest:this.ordinaryQuotaAccountDigest}:{}),
      application_context: JSON.stringify({ format: "cimiloop/codex-matt-context/1.0.0", origin: this.origin, input }), ...(this.facts ? { facts: this.facts } : {}) });
    method.prepare(plan.profile, plan.files);
    return { input, plan, method };
  }
  prepare(input: MattClarificationInput): void { this.prepared(input); }
  async invoke(input: MattClarificationInput, beforeEffect: () => void): Promise<void> {
    const { method, plan } = this.prepared(input);
    await method.execute(plan.profile, plan.files, beforeEffect);
  }
  private project(input: MattClarificationInput, result: CodexFixedClarificationOriginal): MattClarificationOriginal {
    return parseMattClarificationOriginal(input, { format: "cimiloop/pre-plan-matt-original/2.0.0", invocation_key: input.invocation_key,
      input_digest: input.input_digest, method_name: result.method_name, source_digest: result.source_digest, origin: this.origin,
      original_ref: result.original.original_ref, output: result.output, qualification: result.qualification });
  }
  async readOriginal(input: MattClarificationInput): Promise<MattClarificationOriginal | null> {
    const { method, plan } = this.prepared(input), original = method.readOriginal(plan.profile, plan.files);
    return original ? this.project(input, original) : null;
  }
  verifyOriginal(input: MattClarificationInput, original: MattClarificationOriginal): void {
    const { method, plan } = this.prepared(input), retained = method.readOriginal(plan.profile, plan.files);
    if (!retained || !isDeepStrictEqual(this.project(input, retained), parseMattClarificationOriginal(input, original))) unavailable();
  }
  readExecutionControls(input:MattClarificationInput,original:MattClarificationOriginal):{configuration:CodexOriginalMethodOptions;request:ReturnType<CodexFixedClarificationMethod['originalRequest']>;original:CodexFixedClarificationOriginal['original'];control:ReturnType<typeof CodexOriginalMethodRuntime.readProcessControlRetained>}{
    if(!this.configuration)unavailable();this.verifyOriginal(input,original);
    const {method,plan}=this.prepared(input),request=method.originalRequest(plan.profile,plan.files),retained=method.readOriginal(plan.profile,plan.files);if(!retained)unavailable();
    const control=CodexOriginalMethodRuntime.readProcessControlRetained(this.configuration!,request);
    this.verifyOriginal(input,original);return{configuration:structuredClone(this.configuration!),request,original:retained!.original,control};
  }
}
