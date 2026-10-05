import { createServer } from "node:https";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import { GatewayNetworkBoundary } from "../src/gateway-network.js";
import { bytesAt, digest } from "../src/files.js";
import { GATEWAY_HTTP_HEADER_BYTES, GATEWAY_HTTP_RESPONSE_BYTES } from "../src/gateway-http.js";

export const HTTP_FIXTURE_KEY = "CIMILOOP_HTTP_PUBLIC_FIXTURE_KEY";
export type HttpFixtureMode = "valid" | "length" | "reasoning" | "cache" | "redirect" | "status" | "encoded" | "partial" | "oversize" | "chunked_oversize" |
  "header_oversize" | "duplicate_type" | "wrong_type" | "trailer" | "invalid_utf8" | "malformed" | "wrong_model" | "wrong_id" | "usage_inconsistent" | "input_overflow" |
  "output_overflow" | "tools" | "extra_usage" | "reasoning_secret" | "escaped_secret" | "timeout" | "disconnect" | "upgrade" | "information" | "bad_finish" | "secret_error";
export const httpFixture = async (options: { mode?: HttpFixtureMode; onRequest?: () => void; untrusted?: boolean } = {}) => {
  const mode = options.mode ?? "valid", certificate = bytesAt(fileURLToPath(new URL("../fixtures/gateway-http-tls/cert.pem", import.meta.url)));
  const observations: { path: string; method: string; host: string; authenticated: boolean; input_digest: string; body: unknown }[] = [];
  const sockets = new Set<Duplex>(); let dns = 0, dials = 0; let tlsSocket: TLSSocket | undefined;
  const server = createServer({ cert: certificate, key: bytesAt(fileURLToPath(new URL("../fixtures/gateway-http-tls/key.pem", import.meta.url))) }, (request, response) => {
    const chunks: Buffer[] = []; request.on("error", () => request.destroy());
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const bytes = Buffer.concat(chunks), body = JSON.parse(bytes.toString()) as { request_id: string; max_tokens: number };
      observations.push({ path: request.url ?? "", method: request.method ?? "", host: request.headers.host ?? "", authenticated: request.headers.authorization === `Bearer ${HTTP_FIXTURE_KEY}`,
        input_digest: digest(bytes).value, body }); options.onRequest?.();
      if (mode === "timeout") return;
      if (mode === "disconnect") { response.destroy(); return; }
      if (mode === "upgrade") { response.writeHead(101, { connection: "Upgrade", upgrade: "test" }); response.end(); return; }
      if (mode === "information") { response.writeEarlyHints({ link: "</unexpected>; rel=preload" }); }
      if (mode === "redirect") { response.writeHead(307, { location: "https://127.0.0.1/blocked", "content-type": "application/json" }); response.end("{}"); return; }
      if (mode === "status" || mode === "secret_error") { response.writeHead(429, { "content-type": "application/json" }); response.end(mode === "secret_error" ? HTTP_FIXTURE_KEY : "{}"); return; }
      response.setHeader("content-type", "application/json");
      if (mode === "wrong_type") response.setHeader("content-type", "text/plain");
      if (mode === "duplicate_type") response.setHeader("content-type", ["application/json", "application/json"]);
      if (mode === "header_oversize") response.setHeader("x-oversize", "x".repeat(GATEWAY_HTTP_HEADER_BYTES));
      if (mode === "encoded") response.setHeader("content-encoding", "gzip");
      if (mode === "partial") { response.setHeader("content-length", "1000"); response.write("{"); setImmediate(() => response.destroy()); return; }
      if (mode === "oversize") { response.end("x".repeat(GATEWAY_HTTP_RESPONSE_BYTES + 1)); return; }
      if (mode === "chunked_oversize") { for (let n = 0; n < 33; n++) response.write("x".repeat(8192)); response.end(); return; }
      if (mode === "invalid_utf8") { response.end(Buffer.from([0xff])); return; }
      if (mode === "malformed") { response.end("{}"); return; }
      const input = mode === "input_overflow" ? 101 : 4, output = mode === "output_overflow" ? body.max_tokens + 1 : 3;
      const value = { id: "fixture-completion", created: 1791158400, object: "chat.completion", request_id: mode === "wrong_id" ? "another-request" : body.request_id,
        model: mode === "wrong_model" ? "unapproved-model" : "glm-5.3", choices: [{ index: 0,
          message: { role: "assistant", content: mode === "escaped_secret" ? HTTP_FIXTURE_KEY : "CIMILOOP_HTTP_OK",
            ...(mode === "reasoning" || mode === "reasoning_secret" ? { reasoning_content: mode === "reasoning_secret" ? HTTP_FIXTURE_KEY : "public fixture reasoning" } : {}),
            ...(mode === "tools" ? { tool_calls: [] } : {}) }, finish_reason: mode === "length" ? "length" : mode === "bad_finish" ? ["stop"] : "stop" }],
        usage: { prompt_tokens: input, completion_tokens: output, total_tokens: input + output + (mode === "usage_inconsistent" ? 1 : 0),
          ...(mode === "cache" ? { prompt_tokens_details: { cached_tokens: 2 } } : {}), ...(mode === "extra_usage" ? { completion_tokens_details: { reasoning_tokens: 99 } } : {}) } };
      let raw = JSON.stringify(value);
      if (mode === "escaped_secret") raw = raw.replace(HTTP_FIXTURE_KEY, [...HTTP_FIXTURE_KEY].map(c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")).join(""));
      if (mode === "trailer") { response.setHeader("trailer", "x-unexpected"); response.write(raw); response.addTrailers({ "x-unexpected": "1" }); response.end(); }
      else response.end(raw);
    });
  });
  server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  server.on("tlsClientError", () => {});
  await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", done); });
  const address = server.address(); if (!address || typeof address === "string") throw Error("fixture listen failed");
  // Test-only substitutions: DNS/dial use loopback, while the boundary's peer
  // observation is a synthetic public IP. TLS, hostname, HTTP and framing are
  // real. No production constructor or serialized input selects these seams.
  const boundary = new GatewayNetworkBoundary({ resolve: async () => { dns++; return [{ address: "8.8.8.8", family: 4, ttl_seconds: 60 }]; },
    connect: dialOptions => {
      dials++; tlsSocket = tlsConnect({ ...dialOptions, host: "127.0.0.1", port: address.port, ...(options.untrusted ? {} : { ca: certificate }) });
      Object.defineProperty(tlsSocket, "remoteAddress", { configurable: true, get: () => "8.8.8.8" }); return tlsSocket;
    } });
  return { boundary, port: address.port, observations, counts: () => ({ dns, dials }), socket: () => tlsSocket,
    close: async () => { tlsSocket?.destroy(); for (const socket of sockets) socket.destroy(); await new Promise<void>(done => server.close(() => done())); } };
};
