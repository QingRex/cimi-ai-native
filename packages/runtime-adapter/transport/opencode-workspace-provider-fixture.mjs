// Deterministic *test* provider. OpenCode/SDK/custom tools/effects are actual;
// these model responses are constructed and prove no real method or model.
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
function canary(hasCheck) {
  let outsideReadDenied = false, outsideWriteDenied = false, moduleWriteDenied = false, directoryWriteDenied = false;
  const privateFile = process.env.CIMILOOP_AGENT_WORKSPACE_PRIVATE_CANARY, modules = process.env.OPENCODE_CONFIG_DIR;
  try { readFileSync(privateFile); } catch { outsideReadDenied = true; }
  try { writeFileSync(privateFile, "foreign"); } catch { outsideWriteDenied = true; }
  const module = join(modules, "opencode-workspace-tools.js");
  const source = readFileSync(module); try { writeFileSync(module, source); } catch { moduleWriteDenied = true; }
  let catalogWriteDenied = null;
  if (hasCheck) {
    const catalog = join(modules, "check-catalog.json"), original = readFileSync(catalog);
    catalogWriteDenied = false; try { writeFileSync(catalog, original); } catch { catalogWriteDenied = true; }
  }
  const foreign = join(modules, "unexpected.txt"); try { writeFileSync(foreign, "foreign", { flag: "wx" }); unlinkSync(foreign); } catch { directoryWriteDenied = true; }
  const child = spawnSync(process.execPath, ["--version"], { windowsHide: true, timeout: 1500 }), subprocessDenied = !!child.error && child.status == null;
  const result = { event: "cimiloop.workspace_boundary", outside_read_denied: outsideReadDenied, outside_write_denied: outsideWriteDenied, module_write_denied: moduleWriteDenied, catalog_write_denied: catalogWriteDenied, directory_write_denied: directoryWriteDenied, subprocess_denied: subprocessDenied,
    subprocess_error: child.error?.code ?? null, subprocess_status: child.status ?? null, subprocess_signal: child.signal ?? null, subprocess_stdout_bytes: child.stdout?.length ?? 0 };
  console.log(JSON.stringify(result));
  if (![outsideReadDenied, outsideWriteDenied, moduleWriteDenied, directoryWriteDenied, subprocessDenied].every(Boolean) || catalogWriteDenied === false) throw Error("workspace_fixture_boundary_unproven");
}
export function createCimiWorkspaceFixture(options) {
  let step = 0;
  const usage = () => ({ inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } });
  return { languageModel(modelId) {
    if (modelId !== "workspace-fixture") throw Error("workspace_fixture_model_denied");
    return { specificationVersion: "v3", provider: "cimiloop-workspace-fixture", modelId, supportedUrls: {},
      async doStream(input) {
        if (step === 0) canary(!!options.check_id);
        const tools = (input.tools ?? []).map(value => value.name);
        const permitted = options.check_only ? ["cimi_check"] : ["cimi_read", "cimi_replace", ...(options.check_id ? ["cimi_check"] : [])];
        if (permitted.some(name => !tools.includes(name)) || tools.some(name => ![...permitted, "invalid"].includes(name))) throw Error("workspace_fixture_tools_unproven");
        const current = step++, call = options.check_only ? current === 0 ? { type: "tool-call", toolCallId: "original_0", toolName: "cimi_check", input: JSON.stringify({ check_id: options.check_id }) } : null : current < 2 ? { type: "tool-call", toolCallId: `original_${current}`, toolName: current === 0 ? "cimi_read" : "cimi_replace",
          input: JSON.stringify({ path: options.path, expected_digest: options.expectedDigest, ...(current === 1 ? { replacement_utf8: options.replacement } : {}) }) } : current === 2 && options.check_id ?
          { type: "tool-call", toolCallId: "original_2", toolName: "cimi_check", input: JSON.stringify({ check_id: options.check_id }) } : null;
        if (current > (options.check_only ? 1 : options.check_id ? 3 : 2)) throw Error("workspace_fixture_steps_exceeded");
        return { stream: new ReadableStream({ start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          if (call) for (const item of [{ type: "tool-input-start", id: call.toolCallId, toolName: call.toolName }, { type: "tool-input-delta", id: call.toolCallId, delta: call.input }, { type: "tool-input-end", id: call.toolCallId }, call]) controller.enqueue(item);
          else for (const item of [{ type: "text-start", id: "done" }, { type: "text-delta", id: "done", delta: "CIMILOOP_WORKSPACE_FIXTURE_DONE" }, { type: "text-end", id: "done" }]) controller.enqueue(item);
          controller.enqueue({ type: "finish", finishReason: { unified: call ? "tool-calls" : "stop", raw: call ? "tool_calls" : "stop" }, usage: usage() }); controller.close();
        } }) };
      }
    };
  } };
}
