import { isDeepStrictEqual } from "node:util";
import { compileValidator, FixedMethodProfileSchema, NamedSkillMethodRequestSchema, FixedMethodObservationSchema,
  SkillMethodOutputSchema, type FixedMethodProfile, type NamedSkillMethodRequest, type FixedMethodObservation,
  type SkillMethodOutput, type SkillMethodInput } from "@cimiloop/protocol/v2";
import { digest, RuntimeAdapterError } from "./files.js";
import { prepareGatewayConversation, parseGatewayJson, type GatewayConversationResponse, type GatewayFunctionCall } from "./gateway-conversation.js";

const same = (left: unknown, right: unknown) => isDeepStrictEqual(JSON.parse(JSON.stringify(left)), JSON.parse(JSON.stringify(right)));
const parseProfile = compileValidator<FixedMethodProfile>(FixedMethodProfileSchema);
const parseRequest = compileValidator<NamedSkillMethodRequest>(NamedSkillMethodRequestSchema);
const parseObservation = compileValidator<FixedMethodObservation>(FixedMethodObservationSchema);
const parseOutput = compileValidator<SkillMethodOutput>(SkillMethodOutputSchema);
const exact = (value: unknown, key: string): value is Record<string, string> => !!value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).join(",") === key && typeof (value as Record<string, unknown>)[key] === "string";
function fail(reason: string): never { throw new RuntimeAdapterError(reason); }
const freeze = (value: unknown): void => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } };
const lines = (content: string) => { const result = content.split(/\r?\n/); if (result.at(-1) === "") result.pop(); return result; };

// Shared pure output contract. This validates neither execution nor qualification.
export function validateFixedMethodOutput(raw:unknown,input:SkillMethodInput):SkillMethodOutput {
 const output=parseOutput(structuredClone(raw));
 if(output.purpose!==input.purpose||output.purpose==='review'&&input.purpose==='review'&&output.findings.some(finding=>finding.basis_refs.some(ref=>!input.artifact_refs.some(actual=>same(actual,ref)))))fail('fixed_method_output_denied');
 return output;
}

export const validateFixedMethodContext = (raw: unknown, files: { path: string; content: string }[], operationKey: string) => {
  const profile = parseProfile(structuredClone(raw));
  if (profile.invocation_key !== operationKey || files.length !== profile.resources.length || new Set(profile.resources.map(resource => resource.path)).size !== files.length ||
    profile.resources.some(resource => !files.some(file => file.path === resource.path && same(digest(file.content), resource.digest)))) fail("fixed_method_resource_mismatch");
  const byName = new Map(profile.modules.map(module => [module.name, module]));
  if (byName.size !== profile.modules.length || !byName.has(profile.entry_name)) fail("fixed_method_dependency_mismatch");
  const reachable = new Set<string>(), visiting = new Set<string>();
  const visit = (name: string) => {
    if (visiting.has(name) || !byName.has(name)) fail("fixed_method_dependency_mismatch");
    if (reachable.has(name)) return; visiting.add(name);
    for (const dependency of byName.get(name)!.dependencies) visit(dependency);
    visiting.delete(name); reachable.add(name);
  };
  visit(profile.entry_name);
  if (reachable.size !== profile.modules.length) fail("fixed_method_dependency_mismatch");
  for (const resource of profile.resources) {
    const valid = resource.kind === "request" ? resource.path === "skill-request.json" : resource.kind === "input" ? resource.path === "skill-input.json" :
      resource.kind === "artifact_index" ? resource.path === "skill-artifacts/index.json" : resource.kind === "artifact" ? /^skill-artifacts\/[0-9a-f]{64}\.txt$/.test(resource.path) :
      resource.kind === "definition" ? profile.modules.some(module => module.definition_path === resource.path && resource.path === `skill-source/${module.name}/SKILL.md`) :
      profile.modules.some(module => resource.path.startsWith(`skill-source/${module.name}/references/`));
    if (!valid || resource.path.split("/").some(part => part === "." || part === ".." || part.endsWith(".") || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) fail("fixed_method_resource_mismatch");
    const content = files.find(file => file.path === resource.path)!.content, contentLines = lines(content);
    // Pinned OpenCode read truncates lines over 2000 chars, 2000 lines or 50 KiB.
    // Refuse such a plan before effects; truncated content never counts as loaded.
    if (!content.isWellFormed() || content.includes("\0") || contentLines.length > 2000 || contentLines.some(line => line.length > 2000) || Buffer.byteLength(contentLines.join("\n")) > 50 * 1024) fail("fixed_method_read_limit");
  }
  if (profile.modules.some(module => !profile.resources.some(resource => resource.kind === "definition" && resource.path === module.definition_path)) ||
    !profile.resources.some(resource => resource.kind === "request") || !profile.resources.some(resource => resource.kind === "input")) fail("fixed_method_resource_mismatch");
  const request = parseRequest(parseGatewayJson(files.find(file => file.path === "skill-request.json")!.content, 384 * 1024));
  if (request.invocation_key !== operationKey || request.method_name !== profile.entry_name || !same(request.source_digest, profile.source_digest) ||
    !same(digest(JSON.stringify(request)), profile.request_digest) || !same(request.input, parseGatewayJson(files.find(file => file.path === "skill-input.json")!.content, 384 * 1024))) fail("fixed_method_request_mismatch");
  const input = request.input, artifactResources = profile.resources.filter(resource => resource.kind === "artifact" || resource.kind === "artifact_index");
  if (input.purpose === "clarification" && artifactResources.length) fail("fixed_method_artifact_mismatch");
  if (input.purpose === "review") {
    const indexFile = files.find(file => file.path === "skill-artifacts/index.json"), index = indexFile && parseGatewayJson(indexFile.content, 384 * 1024);
    if (!Array.isArray(index) || index.length !== input.artifact_refs.length) fail("fixed_method_artifact_mismatch");
    for (const ref of input.artifact_refs) {
      const rows = index.filter(row => row && typeof row === "object" && Object.keys(row).sort().join(",") === "path,ref" && same(row.ref, ref));
      const expected = `skill-artifacts/${ref.digest?.value}.txt`, resource = profile.resources.find(resource => resource.kind === "artifact" && resource.path === expected);
      if (rows.length !== 1 || rows[0].path !== expected || !ref.digest || !resource || !same(ref.digest, resource.digest)) fail("fixed_method_artifact_mismatch");
    }
    if (artifactResources.filter(resource => resource.kind === "artifact").some(resource => !input.artifact_refs.some(ref => resource.path === `skill-artifacts/${ref.digest?.value}.txt`))) fail("fixed_method_artifact_mismatch");
  }
  const copy = structuredClone(files); freeze(profile); freeze(request); freeze(copy); return { profile, request, files: copy };
};

type ConversationInput = { request_id: string; messages: { role: string; content: string | null; tool_calls?: GatewayFunctionCall[]; tool_call_id?: string }[];
  tools: unknown[]; response_mode: "json" | "sse"; input_tokens: number; max_output_tokens: number };
export interface FixedMethodProjection { input: ConversationInput; sdk: ConversationInput; sdk_input_digest: string; upstream_input_digest: string; mapping: string }

// This adapter explicitly projects named host calls into native SDK reads. It
// preserves both identities and never rewrites a read event into a Skill event.
// It is wired only to the public isolated rehearsal host in this slice.
export class FixedMethodConversationAdapter {
  readonly profile: FixedMethodProfile;
  private readonly request: NamedSkillMethodRequest;
  private readonly files: { path: string; content: string }[];
  private readonly proof: FixedMethodObservation;
  constructor(profile: unknown, files: { path: string; content: string }[], operationKey: string, previous?: unknown) {
    const context = validateFixedMethodContext(profile, files, operationKey); this.profile = context.profile; this.request = context.request; this.files = context.files;
    const initial: FixedMethodObservation = { format: "cimiloop/fixed-method-observation/1.0.0", scope: "isolated_conversation_rehearsal", invocation_key: operationKey,
      source_digest: this.profile.source_digest, request_digest: this.profile.request_digest, profile_digest: digest(JSON.stringify(this.profile)), calls: [], status: "Pending",
      builtin_skill_qualified: false, behavior_qualified: false, formal_execution_enabled: false };
    this.proof = previous === undefined ? initial : parseObservation(structuredClone(previous));
    for (const field of ["invocation_key", "source_digest", "request_digest", "profile_digest"] as const) if (!same(initial[field], this.proof[field])) fail("fixed_method_proof_conflict");
    if (new Set(this.proof.calls.map(call => call.call_id)).size !== this.proof.calls.length) fail("fixed_method_proof_conflict");
    for (const call of this.proof.calls) {
      const resource = this.resource(call.function_name, call.argument);
      if (call.resource_path !== resource.path || !same(call.resource_digest, resource.digest) || !/^[F-Z]:\\workspace\\/.test(call.sdk_file_path) ||
        call.sdk_file_path.slice(13).replaceAll("\\", "/") !== resource.path || (call.status === "observed") !== !!call.output_digest) fail("fixed_method_proof_conflict");
    }
    if (this.proof.status === "Succeeded") {
      if (!this.proof.output || !this.proof.completion || !this.allObserved() || !same(this.proof.completion.output_digest, digest(JSON.stringify(this.proof.output)))) fail("fixed_method_proof_conflict"); this.validateOutput(this.proof.output);
    } else if (this.proof.output || this.proof.completion) fail("fixed_method_proof_conflict");
  }
  private resource(fn: string, argument: string) {
    const path = fn === "invoke_skill" ? this.profile.modules.find(module => module.name === argument)?.definition_path : fn === "read_method_resource" ? argument : undefined;
    const resource = this.profile.resources.find(resource => resource.path === path);
    if (!resource || (fn === "invoke_skill") !== (resource.kind === "definition")) fail("fixed_method_call_denied"); return resource;
  }
  snapshot(): FixedMethodObservation { return parseObservation(structuredClone(this.proof)); }
  interrupt(): void { if (this.proof.status === "Pending") { this.proof.status = "Unknown"; this.proof.reason = "fixed_method_completion_unproven"; } }
  private allObserved() { return this.profile.resources.every(resource => this.proof.calls.some(call => call.resource_path === resource.path && call.status === "observed")); }
  private validateOutput(raw: unknown): SkillMethodOutput {
    return validateFixedMethodOutput(raw,this.request.input);
  }
  private verifyRead(output: string, call: FixedMethodObservation["calls"][number]) {
    const prefix = `<path>${call.sdk_file_path}</path>\n<type>file</type>\n<content>\n`;
    const sourceLines = lines(this.files.find(file => file.path === call.resource_path)!.content);
    const expected = prefix + sourceLines.map((line, i) => `${i + 1}: ${line}`).join("\n") + `\n\n(End of file - total ${sourceLines.length} lines)\n</content>`;
    if (output !== expected) fail("fixed_method_read_unproven");
  }
  project(raw: unknown, mapping: string): FixedMethodProjection {
    if (!/^[F-Z]:$/.test(mapping)) fail("fixed_method_mapping_denied");
    const sdkPrepared = prepareGatewayConversation(raw);
    if (sdkPrepared.tools.length !== 1 || sdkPrepared.tools[0]!.function.name !== "read") fail("fixed_method_sdk_tools_denied");
    const sdk = structuredClone(raw) as ConversationInput, input = structuredClone(sdk), seen = new Set<string>(), observed: FixedMethodObservation["calls"] = [];
    for (const message of input.messages) {
      if (message.tool_calls) message.tool_calls = message.tool_calls.map(call => {
        const issued = this.proof.calls.find(record => record.call_id === call.id);
        const args = parseGatewayJson(call.function.arguments, 16384);
        if (!issued || issued.sdk_file_path !== mapping + "\\workspace\\" + issued.resource_path.replaceAll("/", "\\") || call.function.name !== "read" || !exact(args, "filePath") || args.filePath !== issued.sdk_file_path) fail("fixed_method_history_unproven");
        seen.add(call.id); return { ...call, function: { name: issued.function_name, arguments: JSON.stringify({ [issued.function_name === "invoke_skill" ? "name" : "path"]: issued.argument }) } };
      });
      if (message.role === "tool") {
        const issued = this.proof.calls.find(record => record.call_id === message.tool_call_id);
        if (!issued || !seen.has(issued.call_id) || typeof message.content !== "string") fail("fixed_method_history_unproven");
        this.verifyRead(message.content, issued);
        const outputDigest = digest(message.content);
        if (issued.output_digest && !same(outputDigest, issued.output_digest)) fail("fixed_method_history_unproven");
        observed.push({ ...issued, status: "observed", output_digest: outputDigest });
      }
    }
    if (this.proof.calls.some(call => call.request_id !== sdk.request_id && !seen.has(call.call_id))) fail("fixed_method_history_unproven");
    const tool = (name: string, property: string, values: string[]) => ({ type: "function", function: { name, description: "Fixed CimiLoop method resource; mapped to a native read with separate provenance.",
      parameters: { type: "object", properties: { [property]: { type: "string", enum: values } }, required: [property], additionalProperties: false } } });
    input.tools = [tool("invoke_skill", "name", this.profile.modules.map(module => module.name)), tool("read_method_resource", "path", this.profile.resources.filter(resource => resource.kind !== "definition").map(resource => resource.path))];
    const upstream = prepareGatewayConversation(input);
    for (const record of observed) Object.assign(this.proof.calls.find(call => call.call_id === record.call_id)!, record);
    const projection = { input, sdk, sdk_input_digest: sdkPrepared.prepared.input_digest, upstream_input_digest: upstream.prepared.input_digest, mapping };
    freeze(projection); return projection;
  }
  accept(response: GatewayConversationResponse, projection: FixedMethodProjection): GatewayConversationResponse {
    if (response.request_id !== projection.input.request_id || response.input_digest !== projection.upstream_input_digest) fail("fixed_method_reply_conflict");
    if (this.proof.status === "Succeeded") {
      const completion = this.proof.completion!;
      if (response.finish_reason !== "stop" || response.tool_calls.length || response.request_id !== completion.request_id || response.input_digest !== completion.upstream_input_digest.value ||
        response.response_digest !== completion.response_digest.value || !response.text || !same(parseGatewayJson(response.text), this.proof.output)) fail("fixed_method_reply_conflict");
      return Object.freeze({ ...response, input_digest: projection.sdk_input_digest });
    }
    if (this.proof.status !== "Pending") fail("fixed_method_completion_unproven");
    const mapped = response.tool_calls.map(call => {
      const property = call.function.name === "invoke_skill" ? "name" : "path", args = parseGatewayJson(call.function.arguments, 16384);
      if (!exact(args, property)) fail("fixed_method_call_denied");
      const argument = args[property]!, resource = this.resource(call.function.name, argument), existing = this.proof.calls.find(record => record.call_id === call.id);
      const record: FixedMethodObservation["calls"][number] = { call_id: call.id, request_id: response.request_id,
        upstream_input_digest: { algorithm: "sha256", value: projection.upstream_input_digest }, sdk_input_digest: { algorithm: "sha256", value: projection.sdk_input_digest },
        function_name: call.function.name as "invoke_skill" | "read_method_resource", argument, resource_path: resource.path, resource_digest: resource.digest,
        sdk_file_path: projection.mapping + "\\workspace\\" + resource.path.replaceAll("/", "\\"), status: "issued" };
      if (existing && !same({ ...existing, status: "issued", output_digest: undefined }, { ...record, output_digest: undefined })) fail("fixed_method_reply_conflict");
      if (!existing && (this.proof.status !== "Pending" || this.proof.calls.length >= 32 || resource.kind === "definition" && argument !== this.profile.entry_name &&
        !this.profile.modules.some(module => module.dependencies.includes(argument) && this.proof.calls.some(record => record.argument === module.name && record.function_name === "invoke_skill" && record.status === "observed")) ||
        resource.kind !== "definition" && !this.proof.calls.some(record => record.argument === this.profile.entry_name && record.function_name === "invoke_skill" && record.status === "observed"))) fail("fixed_method_call_order_denied");
      if (!existing && this.proof.calls.some(record => record.resource_path === resource.path)) fail("fixed_method_resource_repeated");
      const sdkCall: GatewayFunctionCall = { ...call, function: { name: "read", arguments: JSON.stringify({ filePath: record.sdk_file_path }) } };
      prepareGatewayConversation({ ...projection.sdk, messages: [{ role: "user", content: "Schema validation" }, { role: "assistant", content: null, tool_calls: [sdkCall] }, { role: "tool", tool_call_id: call.id, content: "Schema validation" }] });
      return { record, sdkCall, existing };
    });
    if (new Set(mapped.map(item => item.record.call_id)).size !== mapped.length || new Set(mapped.map(item => item.record.resource_path)).size !== mapped.length ||
      this.proof.calls.length + mapped.filter(item => !item.existing).length > 32) fail("fixed_method_reply_conflict");
    if (response.finish_reason === "stop") {
      try {
        if (!this.allObserved() || !response.text || response.tool_calls.length) fail("fixed_method_resources_unobserved");
        this.proof.output = this.validateOutput(parseGatewayJson(response.text));
        this.proof.completion = { request_id: response.request_id, upstream_input_digest: { algorithm: "sha256", value: response.input_digest },
          response_digest: { algorithm: "sha256", value: response.response_digest }, output_digest: digest(JSON.stringify(this.proof.output)) }; this.proof.status = "Succeeded";
      }
      catch (error) { this.proof.status = "Failed"; this.proof.reason = "fixed_method_output_unproven"; throw error; }
    } else if (response.finish_reason === "length") { this.proof.status = "Failed"; this.proof.reason = "fixed_method_output_incomplete"; fail("fixed_method_output_incomplete"); }
    for (const item of mapped) if (!item.existing) this.proof.calls.push(item.record);
    return Object.freeze({ ...response, input_digest: projection.sdk_input_digest, tool_calls: Object.freeze(mapped.map(item => Object.freeze(item.sdkCall))) });
  }
}
