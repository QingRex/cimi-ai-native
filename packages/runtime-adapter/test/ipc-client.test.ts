import { describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
const moduleUrl = new URL("../transport/opencode-ipc-probe.mjs", import.meta.url).href;
const { exchangeProbeFrame } = await import(moduleUrl) as { exchangeProbeFrame: (pipe: string, request: unknown, signal?: AbortSignal) => Promise<unknown> };
const request = () => ({ format: "cimiloop/ipc-probe/1.0.0", request_id: randomUUID(), operation_key: "fixture", model_id: "probe", kind: "stream", payload: [] });
const fixture = async (mode: string) => {
  const pipe = process.platform === "win32" ? `\\\\.\\pipe\\CimiLoop.ClientTest.${randomUUID()}` : join(tmpdir(), `cimiloop-client-${randomUUID()}.sock`);
  let connections = 0;
  const server = createServer(socket => {
    connections++; socket.on("error", () => socket.destroy()); let input = Buffer.alloc(0);
    socket.on("data", bytes => {
      input = Buffer.concat([input, bytes]); if (input.length < 4 || input.length < input.readUInt32LE() + 4) return;
      const body = input.subarray(4), value = JSON.parse(body.toString()) as { request_id: string };
      if (mode === "oversize") { const header = Buffer.alloc(4); header.writeUInt32LE(262145); socket.end(header); return; }
      if (mode === "incomplete") { socket.end(Buffer.from([10, 0, 0, 0, 123])); return; }
      const response = Buffer.from(JSON.stringify({ format: "cimiloop/ipc-probe/1.0.0", request_id: value.request_id,
        request_digest: mode === "digest" ? "forged" : createHash("sha256").update(body).digest("hex"), synthetic: true, text: "CIMILOOP_IPC_OK", ...(mode === "extra" ? { unauthorized: true } : {}) }));
      const header = Buffer.alloc(4); header.writeUInt32LE(response.length); const frame = Buffer.concat([header, response]);
      socket.write(frame.subarray(0, 2)); setTimeout(() => socket.end(frame.subarray(2)), 10);
    });
  });
  await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(pipe, done); });
  return { pipe, connections: () => connections, close: () => new Promise<void>(done => server.close(() => done())) };
};
describe("synthetic IPC client framing", () => {
  it("accepts a fragmented response only when its digest and request ID match", async () => {
    const server = await fixture("valid");
    try { expect(await exchangeProbeFrame(server.pipe, request())).toMatchObject({ synthetic: true, text: "CIMILOOP_IPC_OK" }); }
    finally { await server.close(); }
  });
  it.each([["digest", "ipc_probe_response_mismatch"], ["extra", "ipc_probe_response_mismatch"], ["oversize", "ipc_probe_frame_limit"], ["incomplete", "ipc_probe_response_incomplete"]])("rejects %s replies", async (mode, error) => {
    const server = await fixture(mode);
    try { await expect(exchangeProbeFrame(server.pipe, request())).rejects.toThrow(error); }
    finally { await server.close(); }
  });
  it("rejects aborted and oversized requests before opening a connection", async () => {
    const server = await fixture("valid");
    try {
      const signal = AbortSignal.abort(); await expect(exchangeProbeFrame(server.pipe, request(), signal)).rejects.toThrow("ipc_probe_request_denied");
      await expect(exchangeProbeFrame(server.pipe, { ...request(), payload: "x".repeat(262144) })).rejects.toThrow("ipc_probe_request_denied");
      expect(server.connections()).toBe(0);
    } finally { await server.close(); }
  });
  it("cancels a pre-connect wait without leaving a retry loop", async () => {
    const pipe = process.platform === "win32" ? `\\\\.\\pipe\\CimiLoop.Absent.${randomUUID()}` : join(tmpdir(), `cimiloop-absent-${randomUUID()}.sock`), controller = new AbortController();
    const result = exchangeProbeFrame(pipe, request(), controller.signal); controller.abort(); await expect(result).rejects.toThrow("ipc_probe_aborted");
  });
});
