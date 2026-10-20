import { describe, expect, it, vi } from "vitest";
import { Resolver } from "node:dns/promises";
import { EventEmitter } from "node:events";
import { connect as tlsConnect, type ConnectionOptions, type TLSSocket } from "node:tls";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { GatewayNetworkBoundary, type GatewayDnsAddress } from "../src/gateway-network.js";
import { isPublicGatewayAddress, gatewayPeerMatchesPin } from "../src/gateway-address.js";
import { runPublicGatewayNetworkProbe, parseRuntimeGatewayNetworkProbe } from "../src/gateway-network-probe.js";
import { gatewayFixtureCertificate, startGatewayFixture } from "../src/gateway-fixture.js";
import { bytesAt } from "../src/files.js";
const record = (address = "8.8.8.8", ttl = 60): GatewayDnsAddress => ({ address, family: address.includes(":") ? 6 : 4, ttl_seconds: ttl });
class ObservedSocket extends EventEmitter {
  authorized = true; remoteAddress = "8.8.8.8"; destroyed = false; closed = false;
  bytesWritten = 0; readableLength = 0;
  certificateHost = "open.bigmodel.cn"; protocol = "TLSv1.3";
  getPeerCertificate() { return { raw: Buffer.from("synthetic-test-certificate"), subjectaltname: `DNS:${this.certificateHost}`, subject: { CN: this.certificateHost } }; }
  getProtocol() { return this.protocol; }
  destroy() { this.destroyed = true; this.closed = true; queueMicrotask(() => this.emit("close")); return this; }
}
const fixture = (options: { records?: GatewayDnsAddress[]; alter?: (socket: ObservedSocket) => void } = {}) => {
  let dnsCalls = 0, dialCalls = 0, time = Date.now(), captured: ConnectionOptions | undefined;
  const socket = new ObservedSocket(); options.alter?.(socket);
  const boundary = new GatewayNetworkBoundary({ resolve: async () => { dnsCalls++; return options.records ?? [record()]; }, now: () => time, monotonic: () => time,
    connect: input => { dialCalls++; captured = input; queueMicrotask(() => socket.emit("secureConnect")); return socket as unknown as TLSSocket; } });
  return { boundary, socket, advance: (ms: number) => { time += ms; }, dnsCalls: () => dnsCalls, dialCalls: () => dialCalls, captured: () => captured };
};
describe("public gateway DNS and exact TLS boundary", () => {
  it("pins an OpenAI-compatible host on the same 30 second DNS pin", async () => {
    const boundary = new GatewayNetworkBoundary({ resolve: async () => [record()], now: () => Date.now(), monotonic: () => 0 }, "/v1/chat/completions", "api.x.ai");
    const pin = await boundary.resolve();
    expect(pin.host).toBe("api.x.ai"); expect(pin.path).toBe("/v1/chat/completions"); expect(pin.port).toBe(443);
    expect(() => new GatewayNetworkBoundary({}, "/v1/chat/completions", "127.0.0.1")).toThrow("gateway_path_denied");
  });
  it("pins the documented OpenCode Go chat completions path only on opencode.ai", async () => {
    const boundary = new GatewayNetworkBoundary({ resolve: async () => [record()], now: () => Date.now(), monotonic: () => 0 }, "/inference/go/openai/v1/chat/completions", "opencode.ai");
    const pin = await boundary.resolve();
    expect(pin.host).toBe("opencode.ai"); expect(pin.path).toBe("/inference/go/openai/v1/chat/completions");
    expect(() => new GatewayNetworkBoundary({}, "/inference/go/openai/v1/chat/completions", "api.x.ai")).toThrow("gateway_path_denied");
  });
  it("hands off only its original connection once and does not consume it on a copied claim", async () => {
    const f = fixture(), connection = await f.boundary.connect(await f.boundary.resolve());
    expect(Object.isFrozen(connection)).toBe(true); expect(Object.isFrozen(connection.observation)).toBe(true);
    expect(() => f.boundary.consumeHttpConnection({ ...connection })).toThrow("gateway_tls_connection_unowned");
    expect(() => fixture().boundary.consumeHttpConnection(connection)).toThrow("gateway_tls_connection_unowned");
    expect(f.boundary.consumeHttpConnection(connection)).toBe(connection.socket);
    expect(() => f.boundary.consumeHttpConnection(connection)).toThrow("gateway_tls_connection_unowned"); connection.socket.destroy();
  });
  it.each(["expired", "closed", "prior_write", "incoming_data", "peer", "certificate", "protocol", "authorization"])("destroys an owned connection changed before HTTP: %s", async mode => {
    const f = fixture(), connection = await f.boundary.connect(await f.boundary.resolve());
    if (mode === "expired") f.advance(30001);
    if (mode === "closed") f.socket.destroy();
    if (mode === "prior_write") f.socket.bytesWritten++;
    if (mode === "incoming_data") f.socket.readableLength++;
    if (mode === "peer") f.socket.remoteAddress = "8.8.4.4";
    if (mode === "certificate") f.socket.certificateHost = "other.example";
    if (mode === "protocol") f.socket.protocol = "TLSv1.2";
    if (mode === "authorization") f.socket.authorized = false;
    expect(() => f.boundary.consumeHttpConnection(connection)).toThrow(mode === "expired" ? "gateway_address_pin_expired" : "gateway_tls_connection_changed");
    expect(f.socket.destroyed).toBe(true);
    expect(() => f.boundary.consumeHttpConnection(connection)).toThrow("gateway_tls_connection_unowned");
  });
  it("pins a frozen DNS result, bypasses later DNS and sends no HTTP, headers or proxy configuration", async () => {
    const records = [record()], f = fixture({ records }), pin = await f.boundary.resolve();
    records[0]!.address = "127.0.0.1"; records.push(record("169.254.169.254"));
    expect(pin.selected.address).toBe("8.8.8.8"); expect(Object.isFrozen(pin.addresses[0])).toBe(true);
    const connected = await f.boundary.connect(pin); expect(connected.observation.peer_address).toBe("8.8.8.8");
    expect(f.captured()).toMatchObject({ host: "8.8.8.8", port: 443, family: 4, servername: "open.bigmodel.cn", rejectUnauthorized: true, minVersion: "TLSv1.2" });
    for (const key of ["lookup", "headers", "agent", "ca", "proxyEnv"]) expect(f.captured()).not.toHaveProperty(key);
    expect(f.dnsCalls()).toBe(1); expect(f.dialCalls()).toBe(1);
    await expect(f.boundary.connect(pin)).rejects.toThrow("gateway_address_pin_unowned"); connected.socket.destroy();
  });
  it("rejects any private or ambiguous answer, including mixed public/private DNS sets, before dialing", async () => {
    for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.0.1", "::ffff:8.8.8.8", "2002:808:808::1", "fe80::1%12", "2001:db8::1", "not-an-ip"]) {
      const f = fixture({ records: [record(), record(address)] });
      await expect(f.boundary.resolve()).rejects.toThrow("gateway_dns_answers_denied"); expect(f.dialCalls()).toBe(0);
    }
  });
  it("rejects wrong family, zero TTL, oversize answers and input fields before dialing", async () => {
    for (const records of [[], [record("8.8.8.8", 0)], [{ ...record(), family: 6 }], [{ ...record(), ttl_seconds: 1.5 }], [{ ...record(), hostname: "localhost" }], Array.from({ length: 33 }, () => record())]) {
      const f = fixture({ records: records as GatewayDnsAddress[] }); await expect(f.boundary.resolve()).rejects.toThrow("gateway_dns_answers_denied"); expect(f.dialCalls()).toBe(0);
    }
  });
  it("deduplicates equivalent IPv6 and uses the lowest TTL across all answers", async () => {
    const f = fixture({ records: [record("2606:4700:4700::1111", 60), record("2606:4700:4700:0:0:0:0:1111", 1), record()] }), pin = await f.boundary.resolve();
    expect(pin.addresses).toHaveLength(2); expect(Date.parse(pin.expires_at) - Date.parse(pin.resolved_at)).toBe(1000);
    f.advance(1000); await expect(f.boundary.connect(pin)).rejects.toThrow("gateway_address_pin_expired"); expect(f.dialCalls()).toBe(0);
  });
  it("refuses fabricated, cloned or foreign pins without opening a socket", async () => {
    const f = fixture(), pin = await f.boundary.resolve(), foreign = fixture();
    await expect(f.boundary.connect({ ...pin })).rejects.toThrow("gateway_address_pin_unowned");
    await expect(foreign.boundary.connect(pin)).rejects.toThrow("gateway_address_pin_unowned"); expect(f.dialCalls()).toBe(0);
  });
  it("does not extend a live pin when the system date moves backward", async () => {
    let wall = Date.now(), elapsed = 0, dials = 0;
    const boundary = new GatewayNetworkBoundary({ resolve: async () => [record()], now: () => wall, monotonic: () => elapsed, connect: () => { dials++; throw Error(); } });
    const pin = await boundary.resolve(); wall -= 86400000; elapsed += 30000;
    await expect(boundary.connect(pin)).rejects.toThrow("gateway_address_pin_expired"); expect(dials).toBe(0);
  });
  it("includes DNS lookup time in the minimum TTL instead of renewing early answers", async () => {
    let wall = Date.now(), elapsed = 0, dials = 0, wait = 2000;
    const start = wall;
    const boundary = new GatewayNetworkBoundary({ now: () => wall, monotonic: () => elapsed,
      resolve: async () => { wall += wait; elapsed += wait; return [record("8.8.8.8", 1)]; },
      connect: () => { dials++; throw Error(); } });
    await expect(boundary.resolve()).rejects.toThrow("gateway_address_pin_expired"); expect(dials).toBe(0);
    wait = 900; const pin = await boundary.resolve();
    expect(Date.parse(pin.resolved_at)).toBe(start + 2000);
    expect(Date.parse(pin.expires_at) - Date.parse(pin.resolved_at)).toBe(1000);
    elapsed += 100; await expect(boundary.connect(pin)).rejects.toThrow("gateway_address_pin_expired"); expect(dials).toBe(0);
  });
  it.each(["wrong_peer", "untrusted", "wrong_hostname", "old_tls", "expired_during_tls"])("destroys an unproven TLS socket after %s", async mode => {
    const f = fixture({ alter: socket => { if (mode === "wrong_peer") socket.remoteAddress = "127.0.0.1"; if (mode === "untrusted") socket.authorized = false;
      if (mode === "wrong_hostname") socket.certificateHost = "another.example"; if (mode === "old_tls") socket.protocol = "TLSv1.1"; } });
    const pin = await f.boundary.resolve(); if (mode === "expired_during_tls") f.advance(29999);
    if (mode === "expired_during_tls") f.socket.once("secureConnect", () => f.advance(1));
    await expect(f.boundary.connect(pin)).rejects.toThrow(/^gateway_/); expect(f.socket.destroyed).toBe(true);
    await expect(f.boundary.connect(pin)).rejects.toThrow("gateway_address_pin_unowned"); expect(f.dialCalls()).toBe(1);
  });
  it("bounds DNS, aborts its resolver and handles late rejection without opening a socket", async () => {
    let aborted = false, dials = 0;
    const boundary = new GatewayNetworkBoundary({ resolve: signal => new Promise((_, reject) => { signal.addEventListener("abort", () => { aborted = true; reject(Error("private DNS error")); }, { once: true }); }),
      connect: () => { dials++; throw Error(); } });
    await expect(boundary.resolve(25)).rejects.toThrow("gateway_dns_deadline_exhausted"); expect(aborted).toBe(true); expect(dials).toBe(0);
  });
  it("denies pre-abort without DNS and cancels an in-flight TLS socket", async () => {
    const f = fixture(); await expect(f.boundary.resolve(100, AbortSignal.abort())).rejects.toThrow("gateway_network_aborted"); expect(f.dnsCalls()).toBe(0);
    const socket = new ObservedSocket(), boundary = new GatewayNetworkBoundary({ resolve: async () => [record()], connect: () => socket as unknown as TLSSocket }), pin = await boundary.resolve();
    const control = new AbortController(), pending = boundary.connect(pin, 1000, control.signal); control.abort();
    await expect(pending).rejects.toThrow("gateway_network_aborted"); expect(socket.destroyed).toBe(true);
  });
  it("bounds stalled TLS and closes the chosen socket without retry or another DNS lookup", async () => {
    const socket = new ObservedSocket(); let lookups = 0, dials = 0;
    const boundary = new GatewayNetworkBoundary({ resolve: async () => { lookups++; return [record()]; }, connect: () => { dials++; return socket as unknown as TLSSocket; } });
    const pin = await boundary.resolve(); await expect(boundary.connect(pin, 25)).rejects.toThrow("gateway_tls_deadline_exhausted");
    expect(socket.destroyed).toBe(true); expect(dials).toBe(1); expect(lookups).toBe(1);
  });
  it("never silently falls back to public A records when the AAAA query is unproven", async () => {
    const answerA = async (_host: string, options?: { ttl?: boolean }) => options?.ttl ? [{ address: "8.8.8.8", ttl: 60 }] : ["8.8.8.8"];
    const a = vi.spyOn(Resolver.prototype, "resolve4").mockImplementation(answerA as unknown as Resolver["resolve4"]);
    const b = vi.spyOn(Resolver.prototype, "resolve6");
    try {
      b.mockRejectedValue({ code: "ESERVFAIL" }); await expect(new GatewayNetworkBoundary().resolve()).rejects.toThrow("gateway_dns_unproven");
      b.mockRejectedValue({ code: "ENOTFOUND" }); await expect(new GatewayNetworkBoundary().resolve()).rejects.toThrow("gateway_dns_unproven");
      b.mockRejectedValue({ code: "ENODATA" }); expect((await new GatewayNetworkBoundary().resolve()).selected.address).toBe("8.8.8.8");
    } finally { a.mockRestore(); b.mockRestore(); }
  });
  it("matches only the pinned underlying address and denies mapped/zone addresses in DNS", () => {
    expect(gatewayPeerMatchesPin("8.8.8.8", "::ffff:8.8.8.8")).toBe(true);
    expect(gatewayPeerMatchesPin("8.8.8.8", "::ffff:808:808")).toBe(true);
    expect(gatewayPeerMatchesPin("8.8.8.8", "::ffff:127.0.0.1")).toBe(false);
    expect(gatewayPeerMatchesPin("2606:4700:4700::1111", "2606:4700:4700:0:0:0:0:1111")).toBe(true);
    expect(isPublicGatewayAddress("2606:4700:4700::1111%12")).toBe(false);
  });
  it("verifies the real fixed hostname in an actual local TLS handshake before any HTTP data", async () => {
    const server = await startGatewayFixture(), boundary = new GatewayNetworkBoundary({ resolve: async () => [record()],
      connect: options => tlsConnect({ ...options, host: "127.0.0.1", port: server.port, ca: bytesAt(gatewayFixtureCertificate) }) });
    try { const pin = await boundary.resolve(); await expect(boundary.connect(pin)).rejects.toThrow("gateway_tls_unproven"); expect(server.observations).toHaveLength(0); }
    finally { await server.close(); }
  });
  it("keeps network observation separate from real-model acceptance and refuses forged result links", async () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-network-test-")), f = fixture();
    try {
      const result = await runPublicGatewayNetworkProbe({ root }, f.boundary);
      expect(result).toMatchObject({ network_probe_passed: true, actual_credentials_read: 0, external_model_requests: 0, http_requests: 0, formal_execution_enabled: false, billing: { admission_ready: false } });
      expect(f.socket.destroyed).toBe(true);
      expect(parseRuntimeGatewayNetworkProbe({ ...result, billing: { ...result.billing, credit_rate_digest: { algorithm: "sha256", value: "b".repeat(64) } } }).billing.admission_ready).toBe(false);
      expect(() => parseRuntimeGatewayNetworkProbe({ ...result, tls: { ...result.tls, peer_address: "127.0.0.1" } })).toThrow("gateway_network_observation_invalid");
      expect(() => parseRuntimeGatewayNetworkProbe({ ...result, route: { ...result.route, path: "/api/paas/v4/chat/completions" } })).toThrow();
      expect(() => parseRuntimeGatewayNetworkProbe({ ...result, billing: { ...result.billing, admission_ready: true } })).toThrow();
      expect(() => parseRuntimeGatewayNetworkProbe({ ...result, dns: { ...result.dns, pin_digest: { algorithm: "sha256", value: "0".repeat(64) } } })).toThrow("gateway_network_observation_invalid");
    } finally { if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-network-test-")) throw Error("Invalid cleanup target"); rmSync(root, { recursive: true, force: true }); }
  });
});
