import { describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { randomUUID, createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { exchangeGatewayFrame, gatewayMessages } = await import(new URL("../transport/opencode-gateway-probe.mjs", import.meta.url).href) as {
  exchangeGatewayFrame: (pipe: string, request: unknown, signal?: AbortSignal) => Promise<unknown>; gatewayMessages: (prompt: unknown) => unknown;
};
const request = () => ({ format: "cimiloop/model-gateway/1.0.0", request_id: randomUUID(), operation_key: "fixture", model_id: "cimiloop-synthetic-text", messages: [{ role: "user", content: "Synthetic" }], max_output_tokens: 16 });
const fixture = async (mode: string) => {
  const pipe = process.platform === "win32" ? `\\\\.\\pipe\\CimiLoop.GatewayClient.${randomUUID()}` : join(tmpdir(), `cimiloop-gateway-${randomUUID()}.sock`); let connections = 0;
  const server = createServer(socket => {
    connections++; socket.on("error", () => socket.destroy()); let input = Buffer.alloc(0);
    socket.on("data", bytes => {
      input = Buffer.concat([input, bytes]); if (input.length < 4 || input.length < input.readUInt32LE() + 4) return;
      const body = input.subarray(4), value = JSON.parse(body.toString()) as { request_id: string }, hash = createHash("sha256").update(body).digest("hex");
      if (mode === "oversize") { const header = Buffer.alloc(4); header.writeUInt32LE(32769); socket.end(header); return; }
      if (mode === "incomplete") { socket.end(Buffer.from([10, 0, 0, 0, 123])); return; }
      const reply = mode === "denied" ? { format: "cimiloop/model-gateway-error/1.0.0", request_id: value.request_id, request_digest: hash, reason: "gateway_budget_exhausted" }
        : { format: "cimiloop/model-gateway/1.0.0", request_id: value.request_id, request_digest: mode === "digest" ? "forged" : hash, synthetic: true, text: "CIMILOOP_GATEWAY_OK",
          usage: { input_tokens: 8, output_tokens: mode === "usage" ? 17 : 4, total_tokens: mode === "usage" ? 25 : 12 }, held_micro_units: 33408, currency: mode === "currency" ? "USD" : "TEST", ...(mode === "extra" ? { arbitrary: true } : {}) };
      const response = Buffer.from(JSON.stringify(reply)), header = Buffer.alloc(4); header.writeUInt32LE(response.length); const frame = Buffer.concat([header, response]);
      socket.write(frame.subarray(0, 2)); setTimeout(() => socket.end(frame.subarray(2)), 10);
    });
  });
  await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(pipe, done); });
  return { pipe, connections: () => connections, close: () => new Promise<void>(done => server.close(() => done())) };
};
describe("gateway shim boundaries", () => {
  it("accepts fragmented gateway replies and preserves synthetic TEST usage", async () => {
    const server = await fixture("valid"); try { expect(await exchangeGatewayFrame(server.pipe, request())).toMatchObject({ text: "CIMILOOP_GATEWAY_OK", currency: "TEST", usage: { input_tokens: 8, output_tokens: 4 } }); } finally { await server.close(); }
  });
  it.each([["digest", "gateway_response_mismatch"], ["extra", "gateway_response_mismatch"], ["usage", "gateway_response_mismatch"], ["currency", "gateway_response_mismatch"], ["oversize", "gateway_response_limit"], ["incomplete", "gateway_pipe_response_incomplete"], ["denied", "gateway_budget_exhausted"]])("rejects %s without resending a frame", async (mode, reason) => {
    const server = await fixture(mode); try { await expect(exchangeGatewayFrame(server.pipe, request())).rejects.toThrow(reason); expect(server.connections()).toBe(1); } finally { await server.close(); }
  });
  it("rejects oversized or pre-aborted input before opening a pipe", async () => {
    const server = await fixture("valid"); try {
      await expect(exchangeGatewayFrame(server.pipe, request(), AbortSignal.abort())).rejects.toThrow("gateway_request_denied");
      await expect(exchangeGatewayFrame(server.pipe, { ...request(), messages: ["x".repeat(16384)] })).rejects.toThrow("gateway_request_denied"); expect(server.connections()).toBe(0);
    } finally { await server.close(); }
  });
  it("translates only text prompt parts and rejects tools and multimodal content", () => {
    expect(gatewayMessages([{ role: "system", content: "system" }, { role: "user", content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }])).toEqual([{ role: "system", content: "system" }, { role: "user", content: "ab" }]);
    for (const prompt of [[{ role: "tool", content: "result" }], [{ role: "assistant", content: [{ type: "tool-call", toolName: "write" }] }], [{ role: "user", content: [{ type: "image", data: "ignored" }] }]]) expect(() => gatewayMessages(prompt)).toThrow("gateway_prompt_denied");
  });
});
