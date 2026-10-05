import { createServer } from "node:https";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import { bytesAt, digest } from "./files.js";
import { SYNTHETIC_GATEWAY_PATH, SYNTHETIC_GATEWAY_HOST, SYNTHETIC_GATEWAY_MODEL, SYNTHETIC_GATEWAY_KEY, GATEWAY_RESPONSE_BYTES } from "./model-gateway.js";

export type GatewayFixtureMode = "valid" | "redirect" | "malformed" | "usage_overflow" | "usage_inconsistent" | "partial" | "oversize" | "oversize_chunked" | "encoded" | "timeout" | "secret" | "status" | "wrong_model" | "invalid_utf8";
export const gatewayFixtureCertificate = fileURLToPath(new URL("../fixtures/gateway-tls/cert.pem", import.meta.url));
export const startGatewayFixture = async (options: { untrusted?: boolean; onRequest?: () => void } = {}) => {
  const prefix = options.untrusted ? "untrusted-" : "";
  let mode: GatewayFixtureMode = "valid";
  const observations: { path: string; method: string; host: string; authenticated: boolean; body_digest: string; model: string; output_limit: number; stream: boolean; n: number }[] = [];
  const sockets = new Set<Duplex>();
  const server = createServer({ key: bytesAt(fileURLToPath(new URL(`../fixtures/gateway-tls/${prefix}key.pem`, import.meta.url))),
    cert: bytesAt(fileURLToPath(new URL(`../fixtures/gateway-tls/${prefix}cert.pem`, import.meta.url))) }, (request, response) => {
    let size = 0; const chunks: Buffer[] = [];
    request.on("error", () => request.destroy());
    request.on("data", (bytes: Buffer) => { size += bytes.length; if (size > 16384) request.destroy(); else chunks.push(bytes); });
    request.on("end", () => {
      try {
        const bytes = Buffer.concat(chunks), body = JSON.parse(bytes.toString()) as { model: string; max_tokens: number; stream: boolean; n: number; messages: { content: string }[] };
        const authenticated = request.headers.authorization === `Bearer ${SYNTHETIC_GATEWAY_KEY}`;
        observations.push({ path: request.url ?? "", method: request.method ?? "", host: request.headers.host ?? "", authenticated,
          body_digest: digest(bytes).value, model: body.model, output_limit: body.max_tokens, stream: body.stream, n: body.n });
        options.onRequest?.();
        if (!authenticated || request.url !== SYNTHETIC_GATEWAY_PATH || request.method !== "POST" || !request.headers.host?.startsWith(SYNTHETIC_GATEWAY_HOST + ":")) { response.writeHead(403); response.end(); return; }
        const selected = mode;
        if (selected === "timeout") return;
        if (selected === "redirect") { response.writeHead(307, { location: "https://127.0.0.1/forbidden", "content-type": "application/json" }); response.end("{}"); return; }
        if (selected === "status") { response.writeHead(429, { "content-type": "application/json" }); response.end("{}"); return; }
        response.setHeader("content-type", "application/json");
        if (selected === "malformed") { response.end("{}"); return; }
        if (selected === "invalid_utf8") { response.end(Buffer.from([0xff])); return; }
        if (selected === "partial") { response.setHeader("content-length", "1000"); response.write("{"); setImmediate(() => response.destroy()); return; }
        if (selected === "oversize") { response.end("x".repeat(GATEWAY_RESPONSE_BYTES + 1)); return; }
        if (selected === "oversize_chunked") { response.write("x".repeat(8192)); response.write("x".repeat(8192)); response.end("x"); return; }
        if (selected === "encoded") { response.setHeader("content-encoding", "gzip"); response.end("{}"); return; }
        const input = body.messages.reduce((sum, message) => sum + Buffer.byteLength(message.content), 0), output = selected === "usage_overflow" ? body.max_tokens + 1 : Math.min(4, body.max_tokens);
        response.end(JSON.stringify({ id: "fixture-completion", object: "chat.completion", model: selected === "wrong_model" ? "unapproved-model" : SYNTHETIC_GATEWAY_MODEL,
          choices: [{ index: 0, message: { role: "assistant", content: selected === "secret" ? SYNTHETIC_GATEWAY_KEY : "CIMILOOP_GATEWAY_OK" }, finish_reason: "stop" }],
          usage: { prompt_tokens: input, completion_tokens: output, total_tokens: input + output + (selected === "usage_inconsistent" ? 1 : 0) } }));
      } catch { response.destroy(); }
    });
  });
  server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  server.on("tlsClientError", () => {});
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("fixture listener unavailable");
  return { port: address.port, observations, setMode: (next: GatewayFixtureMode) => { mode = next; }, close: async () => {
    for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve()));
  } };
};
