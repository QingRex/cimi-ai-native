// Text-only synthetic gateway shim. It receives no URL, API key or host mailbox
// path, and opens only the operation's authenticated Windows named pipe.
import { createConnection } from "node:net";
import { randomUUID, createHash } from "node:crypto";
import { TextDecoder } from "node:util";
const maximumRequest = 16384, maximumResponse = 32768;
const integer = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max;
export const exchangeGatewayFrame = (pipe, request, signal) => new Promise((done, fail) => {
  const payload = Buffer.from(JSON.stringify(request)), hash = createHash("sha256").update(payload).digest("hex");
  if (payload.length > maximumRequest || signal?.aborted) { fail(new Error("gateway_request_denied")); return; }
  let socket, retry, buffered = Buffer.alloc(0), settled = false, sent = false;
  const timer = setTimeout(() => finish(new Error("gateway_pipe_deadline_exhausted")), 15000);
  const abort = () => finish(new Error("gateway_aborted"));
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
      if (buffered.length + bytes.length > maximumResponse + 4) { finish(new Error("gateway_response_limit")); return; }
      buffered = Buffer.concat([buffered, bytes]); if (buffered.length < 4) return;
      const length = buffered.readUInt32LE(); if (length < 1 || length > maximumResponse) { finish(new Error("gateway_response_limit")); return; }
      if (buffered.length < length + 4) return;
      try {
        const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffered.subarray(4, length + 4)));
        if (!value || buffered.length !== length + 4 || value.request_id !== request.request_id || value.request_digest !== hash) throw new Error("gateway_response_mismatch");
        if (value.format === "cimiloop/model-gateway-error/1.0.0") {
          if (Object.keys(value).sort().join(",") !== "format,reason,request_digest,request_id" || typeof value.reason !== "string" || !/^[a-z_]{1,96}$/.test(value.reason)) throw new Error("gateway_response_mismatch");
          finish(new Error(value.reason)); return;
        }
        const usage = value.usage;
        if (Object.keys(value).sort().join(",") !== "currency,format,held_micro_units,request_digest,request_id,synthetic,text,usage" ||
          value.format !== "cimiloop/model-gateway/1.0.0" || value.synthetic !== true || typeof value.text !== "string" || value.currency !== "TEST" || value.held_micro_units !== 33408 ||
          !usage || Object.keys(usage).sort().join(",") !== "input_tokens,output_tokens,total_tokens" || !integer(usage.input_tokens, 16384) || !integer(usage.output_tokens, request.max_output_tokens) ||
          usage.total_tokens !== usage.input_tokens + usage.output_tokens) throw new Error("gateway_response_mismatch");
        finish(undefined, value);
      } catch { finish(new Error("gateway_response_mismatch")); }
    });
    client.once("error", () => { client.destroy(); if (sent) finish(new Error("gateway_pipe_connection_failed")); else if (!settled) retry = setTimeout(connect, 50); });
    client.once("end", () => { if (sent) finish(new Error("gateway_pipe_response_incomplete")); });
  }; connect();
});
export const gatewayMessages = prompt => {
  if (!Array.isArray(prompt) || !prompt.length || prompt.length > 32) throw new Error("gateway_prompt_denied");
  return prompt.map(message => {
    if (!message || !["system", "user", "assistant"].includes(message.role)) throw new Error("gateway_prompt_denied");
    let content;
    if (typeof message.content === "string") content = message.content;
    else if (Array.isArray(message.content) && message.content.every(part => part.type === "text" && typeof part.text === "string")) content = message.content.map(part => part.text).join("");
    else throw new Error("gateway_prompt_denied");
    return { role: message.role, content };
  });
};
export function createCimiGatewayProbe(options) {
  const pipe = process.env.CIMILOOP_IPC_PIPE;
  if (!pipe?.startsWith("\\\\.\\pipe\\CimiLoop.") || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(options.operationKey)) throw new Error("gateway_configuration_invalid");
  const invoke = input => {
    if (input.toolChoice?.type === "required" || input.toolChoice?.type === "tool") throw new Error("gateway_tools_denied");
    const output = input.maxOutputTokens ?? 128;
    if (!Number.isSafeInteger(output) || output < 1) throw new Error("gateway_output_limit_invalid");
    return exchangeGatewayFrame(pipe, { format: "cimiloop/model-gateway/1.0.0", request_id: randomUUID(), operation_key: options.operationKey,
      model_id: "cimiloop-synthetic-text", messages: gatewayMessages(input.prompt), max_output_tokens: Math.min(128, output) }, input.abortSignal);
  };
  const usage = reply => ({ inputTokens: { total: reply.usage.input_tokens, noCache: reply.usage.input_tokens, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: reply.usage.output_tokens, text: reply.usage.output_tokens, reasoning: 0 } });
  const languageModel = modelId => {
    if (modelId !== "cimiloop-synthetic-text") throw new Error("gateway_model_denied");
    return { specificationVersion: "v3", provider: "cimiloop-gateway", modelId, supportedUrls: {},
      async doGenerate(input) { const reply = await invoke(input); return { content: [{ type: "text", text: reply.text }], finishReason: { unified: "stop", raw: "stop" }, usage: usage(reply), warnings: [] }; },
      async doStream(input) {
        const reply = await invoke(input);
        return { stream: new ReadableStream({ start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] }); controller.enqueue({ type: "text-start", id: "gateway" });
          controller.enqueue({ type: "text-delta", id: "gateway", delta: reply.text }); controller.enqueue({ type: "text-end", id: "gateway" });
          controller.enqueue({ type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: usage(reply) }); controller.close();
        } }) };
      }
    };
  }; return { languageModel };
}
