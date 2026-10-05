// Trusted, read-only provider shim for a synthetic transport check. It does not
// implement a model, expose a URL, load credentials or call fetch.
import { createConnection } from "node:net";
import { randomUUID, createHash } from "node:crypto";

const maximum = 262144;
export const exchangeProbeFrame = (pipe, request, signal) => new Promise((done, fail) => {
  const payload = Buffer.from(JSON.stringify(request)), hash = createHash("sha256").update(payload).digest("hex");
  if (payload.length > maximum || signal?.aborted) { fail(new Error("ipc_probe_request_denied")); return; }
  let socket, retry, buffered = Buffer.alloc(0), settled = false, sent = false;
  const timer = setTimeout(() => finish(new Error("ipc_probe_timeout")), 10000);
  const abort = () => finish(new Error("ipc_probe_aborted"));
  const finish = (error, value) => {
    if (settled) return; settled = true; clearTimeout(timer); clearTimeout(retry); signal?.removeEventListener("abort", abort); socket?.destroy();
    if (error) fail(error); else done(value);
  };
  signal?.addEventListener("abort", abort, { once: true });
  const connect = () => {
  if (settled) return;
  const client = createConnection({ path: pipe }); socket = client;
  client.once("connect", () => { sent = true; const header = Buffer.alloc(4); header.writeUInt32LE(payload.length); client.write(Buffer.concat([header, payload])); });
  client.on("data", bytes => {
    if (buffered.length + bytes.length > maximum + 4) { finish(new Error("ipc_probe_frame_limit")); return; }
    buffered = Buffer.concat([buffered, bytes]); if (buffered.length < 4) return;
    const length = buffered.readUInt32LE(); if (length < 1 || length > maximum) { finish(new Error("ipc_probe_frame_limit")); return; }
    if (buffered.length < length + 4) return;
    try {
      const value = JSON.parse(buffered.subarray(4, length + 4).toString("utf8"));
      if (!value || Object.keys(value).sort().join(",") !== "format,request_digest,request_id,synthetic,text" || buffered.length !== length + 4 || value.format !== "cimiloop/ipc-probe/1.0.0" || value.request_id !== request.request_id || value.request_digest !== hash || value.synthetic !== true || value.text !== "CIMILOOP_IPC_OK") throw new Error("ipc_probe_response_mismatch");
      finish(undefined, value);
    } catch { finish(new Error("ipc_probe_response_mismatch")); }
  });
  client.once("error", () => { client.destroy(); if (sent) finish(new Error("ipc_probe_connection_failed")); else if (!settled) retry = setTimeout(connect, 50); });
  client.once("end", () => { if (sent) finish(new Error("ipc_probe_response_incomplete")); });
  }; connect();
});

export function createCimiIpcProbe(options) {
  const pipe = process.env.CIMILOOP_IPC_PIPE;
  if (!pipe?.startsWith("\\\\.\\pipe\\CimiLoop.") || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(options.operationKey)) throw new Error("ipc_probe_configuration_invalid");
  const invoke = (kind, input) => exchangeProbeFrame(pipe, { format: "cimiloop/ipc-probe/1.0.0", request_id: randomUUID(), operation_key: options.operationKey,
    model_id: "probe", kind, payload: input.prompt }, input.abortSignal);
  const usage = () => ({ inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } });
  const languageModel = modelId => {
    if (modelId !== "probe") throw new Error("ipc_probe_model_denied");
    return { specificationVersion: "v3", provider: "cimiloop-transport", modelId, supportedUrls: {},
      async doGenerate(input) {
        const reply = await invoke("generate", input);
        return { content: [{ type: "text", text: reply.text }], finishReason: { unified: "stop", raw: "stop" }, usage: usage(), warnings: [] };
      },
      async doStream(input) {
        const reply = await invoke("stream", input);
        return { stream: new ReadableStream({ start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "synthetic" });
          controller.enqueue({ type: "text-delta", id: "synthetic", delta: reply.text });
          controller.enqueue({ type: "text-end", id: "synthetic" });
          controller.enqueue({ type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: usage() }); controller.close();
        } }) };
      }
    };
  };
  return { languageModel };
}
