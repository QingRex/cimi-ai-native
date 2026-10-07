// Fixed dependency-free custom tools for the pinned OpenCode 1.18.34 registry.
// No built-in filesystem/shell calls, model credentials or model-selected IDs.
import { createHash } from "node:crypto";
import { createAgentWorkspaceToolClient } from "./agent-workspace-ipc-client.mjs";

const id = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const sha = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const hash = value => createHash("sha256").update(value).digest("hex");
function captureCatalog(raw, scopeDigest) {
  let nodes = 0;
  const copy = (value, depth = 0) => {
    if (++nodes > 4096 || depth > 16) throw Error("invalid");
    if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.isWellFormed()) return value;
    if (!value || typeof value !== "object") throw Error("invalid");
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) throw Error("invalid");
      return Array.from({ length: value.length }, (_, i) => { const field = Object.getOwnPropertyDescriptor(value, String(i)); if (!field || !("value" in field)) throw Error("invalid"); return copy(field.value, depth + 1); });
    }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error("invalid");
    const result = {};
    for (const key of Reflect.ownKeys(value)) {
      const field = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== "string" || ["__proto__", "prototype", "constructor", "toJSON"].includes(key) || !field.enumerable || !("value" in field)) throw Error("invalid");
      result[key] = copy(field.value, depth + 1);
    }
    return result;
  };
  const path = value => typeof value === "string" && value.isWellFormed() && !!value && Buffer.byteLength(value) <= 1024 && !/[\\:%*?\x00-\x1f]/.test(value) &&
    !value.split("/").some(part => !part || part === "." || part === ".." || part !== part.trim() || part.endsWith(".") ||
      [".git", ".cimiloop"].includes(part.toLowerCase()) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
  try {
    const catalog = copy(raw);
    if (!exact(catalog, ["format", "scope_digest", "node_digest", "policy_digest", "recipes", "catalog_digest"]) ||
      catalog.format !== "cimiloop/workspace-check-catalog/1.0.0" || catalog.scope_digest !== scopeDigest ||
      ![catalog.node_digest, catalog.policy_digest, catalog.catalog_digest].every(sha) || !Array.isArray(catalog.recipes) || !catalog.recipes.length || catalog.recipes.length > 16) throw Error("invalid");
    for (const [i, recipe] of catalog.recipes.entries()) {
      if (!exact(recipe, ["check_id", "profile", "entry", "inputs", "max_elapsed_ms", "max_output_bytes"]) || !id(recipe.check_id) ||
        i > 0 && catalog.recipes[i - 1].check_id >= recipe.check_id || !["node_syntax", "node_test"].includes(recipe.profile) || !path(recipe.entry) || !/\.(?:js|mjs|cjs)$/.test(recipe.entry) ||
        !Array.isArray(recipe.inputs) || !recipe.inputs.length || recipe.inputs.length > 32 || !Number.isSafeInteger(recipe.max_elapsed_ms) || recipe.max_elapsed_ms < 100 || recipe.max_elapsed_ms > 30000 ||
        !Number.isSafeInteger(recipe.max_output_bytes) || recipe.max_output_bytes < 1024 || recipe.max_output_bytes > 131072) throw Error("invalid");
      const seen = new Set();
      for (const source of recipe.inputs) {
        if (!exact(source, ["path", "expected_digest"]) || !path(source.path) || !sha(source.expected_digest) || seen.has(source.path.toLowerCase())) throw Error("invalid");
        seen.add(source.path.toLowerCase());
      }
      if (!recipe.inputs.some(source => source.path === recipe.entry)) throw Error("invalid");
    }
    const body = { format: catalog.format, scope_digest: catalog.scope_digest, node_digest: catalog.node_digest, policy_digest: catalog.policy_digest, recipes: catalog.recipes };
    if (hash(JSON.stringify(body)) !== catalog.catalog_digest) throw Error("invalid");
    return catalog;
  } catch { throw Error("opencode_workspace_catalog_invalid"); }
}
const validContext = context => context && id(context.sessionID) && id(context.messageID) && id(context.callID) &&
  typeof context.ask === "function" && context.abort && typeof context.abort.aborted === "boolean" && !context.abort.aborted;
export function createOpenCodeWorkspaceTools(endpoint, rawCatalog) {
  if (!exact(endpoint, ["pipe", "scope_digest"]) || typeof endpoint.pipe !== "string" ||
    !/^\\\\\.\\pipe\\CimiLoop\.AgentWorkspace\.[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(endpoint.pipe) || typeof endpoint.scope_digest !== "string" || !/^[a-f0-9]{64}$/.test(endpoint.scope_digest)) throw Error("opencode_workspace_endpoint_invalid");
  const client = createAgentWorkspaceToolClient(endpoint);
  const catalog = rawCatalog === undefined ? undefined : captureCatalog(rawCatalog, endpoint.scope_digest);
  const definition = tool => ({
    description: tool === "read_file" ? "Read one authorized repository file through CimiLoop; supply its original SHA-256." : "Replace one authorized repository file through CimiLoop; supply its original SHA-256 and complete UTF-8 replacement.",
    args: { path: { type: "string", minLength: 1, maxLength: 240 }, expected_digest: { type: "string", pattern: "^[a-f0-9]{64}$" },
      ...(tool === "replace_file" ? { replacement_utf8: { type: "string", maxLength: 16384 } } : {}) },
    async execute(args, context) {
      // callID is carried by the pinned registry's original toolCtx. It is not
      // an argument. Include session/message so reused IDs cannot collide.
      if (!exact(args, ["path", "expected_digest", ...(tool === "replace_file" ? ["replacement_utf8"] : [])]) ||
        Object.values(Object.getOwnPropertyDescriptors(args)).some(value => !Object.hasOwn(value, "value")) ||
        typeof args.path !== "string" || !args.path.isWellFormed() || !args.path || args.path.length > 240 || typeof args.expected_digest !== "string" || !/^[a-f0-9]{64}$/.test(args.expected_digest) ||
        tool === "replace_file" && (typeof args.replacement_utf8 !== "string" || !args.replacement_utf8.isWellFormed() || Buffer.byteLength(args.replacement_utf8) > 16384) ||
        !context || !id(context.sessionID) || !id(context.messageID) || !id(context.callID) ||
        typeof context.ask !== "function" || !context.abort || typeof context.abort.aborted !== "boolean" || context.abort.aborted) throw Error("opencode_workspace_call_invalid");
      const call_id = "sdk_" + createHash("sha256").update(JSON.stringify([context.sessionID, context.messageID, context.callID])).digest("hex");
      const original = { ...args }, abort = context.abort;
      await context.ask({ permission: tool === "read_file" ? "cimi_read" : "cimi_replace", patterns: [original.path], always: [], metadata: {} });
      const reply = await client.execute({ ...original, call_id, tool }, abort);
      if (reply.outcome !== "completed") throw Error(reply.reason);
      // The full original receipt is retained by the trusted host ledger.
      // This projection is only tool output, never Run/Task completion proof.
      return { title: original.path, output: JSON.stringify({ format: "cimiloop/opencode-workspace-output/1.0.0", call_id, tool, path: original.path,
        before_digest: reply.receipt.native.before_digest, after_digest: reply.receipt.native.after_digest, text: reply.receipt.native.text, replay: reply.replay,
        formal_agent_execution_enabled: false }), metadata: { call_id, tool, replay: reply.replay } };
    }
  });
  const check = catalog ? Object.freeze({
    description: "Run one fixed CimiLoop check on its pinned authorized input snapshot. A failed command remains a failed result.",
    args: { check_id: { type: "string", enum: catalog.recipes.map(recipe => recipe.check_id), minLength: 1, maxLength: 128 } },
    async execute(args, context) {
      if (!exact(args, ["check_id"]) || Object.values(Object.getOwnPropertyDescriptors(args)).some(field => !("value" in field)) || !validContext(context)) throw Error("opencode_workspace_call_invalid");
      const recipe = catalog.recipes.find(value => value.check_id === args.check_id);
      if (!recipe) throw Error("opencode_workspace_call_invalid");
      const call_id = "sdk_" + hash(JSON.stringify([context.sessionID, context.messageID, context.callID])), abort = context.abort;
      await context.ask({ permission: "cimi_check", patterns: [recipe.check_id], always: [], metadata: {} });
      const reply = await client.check({ call_id, check_id: recipe.check_id, check_catalog_digest: catalog.catalog_digest }, abort);
      if (reply.outcome !== "completed") throw Error(reply.reason);
      const receipt = reply.receipt, sourceDigest = hash(JSON.stringify(recipe.inputs.map(source => ({ path: source.path, digest: source.expected_digest }))));
      if (receipt.profile !== recipe.profile || receipt.entry !== recipe.entry || receipt.source_digest !== sourceDigest) throw Error("opencode_workspace_check_unproven");
      return { title: recipe.check_id, output: JSON.stringify({ format: "cimiloop/opencode-check-output/1.0.0", call_id, check_id: recipe.check_id,
        check_catalog_digest: catalog.catalog_digest, outcome: receipt.outcome, exit_code: receipt.exit_code, reason: receipt.reason, source_digest: receipt.source_digest,
        stdout_digest: receipt.stdout_digest, stderr_digest: receipt.stderr_digest, replay: reply.replay, formal_agent_execution_enabled: false }),
        metadata: { call_id, tool: "run_check", check_id: recipe.check_id, outcome: receipt.outcome, replay: reply.replay } };
    }
  }) : undefined;
  return Object.freeze({ read: Object.freeze(definition("read_file")), replace: Object.freeze(definition("replace_file")), ...(check ? { check } : {}) });
}
