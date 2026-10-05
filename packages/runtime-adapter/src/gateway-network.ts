import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import { performance } from "node:perf_hooks";
import { connect as tlsConnect, checkServerIdentity, type TLSSocket, type ConnectionOptions } from "node:tls";
import { digest, RuntimeAdapterError } from "./files.js";
import { canonicalGatewayAddress, gatewayPeerMatchesPin, isPublicGatewayAddress } from "./gateway-address.js";

export const DEDICATED_GATEWAY_HOST = "open.bigmodel.cn";
export const DEDICATED_GATEWAY_PATH = "/api/coding/paas/v4/chat/completions";
export const DEDICATED_GATEWAY_POLICY_DIGEST = digest(JSON.stringify({ format: "cimiloop/public-gateway-network/1.0.0", host: DEDICATED_GATEWAY_HOST,
  port: 443, path: DEDICATED_GATEWAY_PATH, model: "glm-5.3", all_dns_answers_public: true, maximum_addresses: 32,
  maximum_pin_age_ms: 30000, expiry_clock: "monotonic", ttl_origin: "dns_query_start", tls_hostname_verification: true, proxy: false, redirects: false, retries: 0 })).value;
export interface GatewayDnsAddress { address: string; family: 4 | 6; ttl_seconds: number }
export interface GatewayAddressPin {
  readonly host: typeof DEDICATED_GATEWAY_HOST; readonly port: 443; readonly path: typeof DEDICATED_GATEWAY_PATH;
  readonly resolved_at: string; readonly expires_at: string; readonly addresses: readonly GatewayDnsAddress[];
  readonly selected: Readonly<GatewayDnsAddress>; readonly digest: string;
}
export interface GatewayTlsObservation { peer_address: string; protocol: string; certificate_digest: string }
// These dependency functions are trusted host code/test seams. They are never
// accepted from JSON, CLI, a connection file, environment or Runtime input.
interface NetworkDependencies {
  resolve?: (signal: AbortSignal) => Promise<GatewayDnsAddress[]>;
  connect?: (options: ConnectionOptions) => TLSSocket;
  now?: () => number;
  monotonic?: () => number;
}
const resolvePublicHost = async (signal: AbortSignal): Promise<GatewayDnsAddress[]> => {
  const resolver = new Resolver({ timeout: 5000, tries: 1 }), cancel = () => resolver.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) throw new RuntimeAdapterError("gateway_network_aborted");
    const values = await Promise.allSettled([resolver.resolve4(DEDICATED_GATEWAY_HOST, { ttl: true }), resolver.resolve6(DEDICATED_GATEWAY_HOST, { ttl: true })]);
    const records: GatewayDnsAddress[] = [];
    for (const [index, value] of values.entries()) {
      if (value.status === "rejected") {
        if (value.reason?.code === "ENODATA") continue;
        throw new RuntimeAdapterError("gateway_dns_unproven");
      }
      for (const record of value.value) records.push({ address: record.address, family: index === 0 ? 4 : 6, ttl_seconds: record.ttl });
    }
    return records;
  } finally { signal.removeEventListener("abort", cancel); }
};
export class GatewayNetworkBoundary {
  private readonly pins = new WeakMap<GatewayAddressPin, { expires: number; consumed: boolean }>();
  private readonly resolver: NonNullable<NetworkDependencies["resolve"]>;
  private readonly dial: NonNullable<NetworkDependencies["connect"]>;
  private readonly now: () => number;
  private readonly monotonic: () => number;
  constructor(dependencies: NetworkDependencies = {}) { this.resolver = dependencies.resolve ?? resolvePublicHost; this.dial = dependencies.connect ?? tlsConnect;
    this.now = dependencies.now ?? Date.now; this.monotonic = dependencies.monotonic ?? (() => performance.now()); }
  async resolve(deadlineMs = 8000, signal?: AbortSignal): Promise<GatewayAddressPin> {
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 25 || deadlineMs > 30000) throw new RuntimeAdapterError("invalid_gateway_network_deadline");
    if (signal?.aborted) throw new RuntimeAdapterError("gateway_network_aborted");
    // Use the query start as the conservative TTL origin. A fast A answer must
    // not gain extra life while we wait for a slower AAAA answer or validation.
    const time = this.now(), started = this.monotonic();
    const control = new AbortController();
    const records = await new Promise<GatewayDnsAddress[]>((resolve, reject) => {
      let settled = false;
      const finish = (reason?: string, records?: GatewayDnsAddress[]) => {
        if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", cancel);
        if (reason) { control.abort(); reject(new RuntimeAdapterError(reason)); } else resolve(records!);
      };
      const cancel = () => finish("gateway_network_aborted"), timer = setTimeout(() => finish("gateway_dns_deadline_exhausted"), deadlineMs);
      signal?.addEventListener("abort", cancel, { once: true });
      Promise.resolve().then(() => this.resolver(control.signal)).then(records => finish(undefined, records), () => finish("gateway_dns_unproven"));
    });
    if (signal?.aborted) throw new RuntimeAdapterError("gateway_network_aborted");
    if (!Array.isArray(records) || records.length < 1 || records.length > 32) throw new RuntimeAdapterError("gateway_dns_answers_denied");
    const unique = new Map<string, GatewayDnsAddress>();
    for (const record of records) {
      if (!record || Object.keys(record).sort().join(",") !== "address,family,ttl_seconds" || typeof record.address !== "string" ||
        !isPublicGatewayAddress(record.address) || record.family !== isIP(record.address) || !Number.isSafeInteger(record.ttl_seconds) || record.ttl_seconds < 1 || record.ttl_seconds > 604800)
        throw new RuntimeAdapterError("gateway_dns_answers_denied");
      const address = canonicalGatewayAddress(record.address)!, key = `${record.family}:${address}`, previous = unique.get(key);
      unique.set(key, { address, family: record.family, ttl_seconds: Math.min(previous?.ttl_seconds ?? record.ttl_seconds, record.ttl_seconds) });
    }
    const addresses = [...unique.values()].sort((a, b) => a.family - b.family || a.address.localeCompare(b.address));
    const lifetime = Math.min(30000, ...addresses.map(a => a.ttl_seconds * 1000)), expires = time + lifetime;
    if (this.monotonic() >= started + lifetime) throw new RuntimeAdapterError("gateway_address_pin_expired");
    addresses.forEach(Object.freeze); Object.freeze(addresses);
    const value = { host: DEDICATED_GATEWAY_HOST, port: 443 as const, path: DEDICATED_GATEWAY_PATH, resolved_at: new Date(time).toISOString(),
      expires_at: new Date(expires).toISOString(), addresses, selected: addresses[0]! } as const;
    const pin = Object.freeze({ ...value, digest: digest(JSON.stringify(value)).value });
    this.pins.set(pin, { expires: started + lifetime, consumed: false }); return pin;
  }
  // The returned socket is TLS-authorized and belongs to the chosen DNS pin.
  // Callers may write only after this promise resolves. No HTTP/header/body is
  // sent here, and no proxy or subsequent DNS lookup participates in dialing.
  connect(pin: GatewayAddressPin, deadlineMs = 8000, signal?: AbortSignal): Promise<{ socket: TLSSocket; observation: GatewayTlsObservation }> {
    const owner = this.pins.get(pin);
    if (!owner || owner.consumed) return Promise.reject(new RuntimeAdapterError("gateway_address_pin_unowned"));
    if (this.monotonic() >= owner.expires) return Promise.reject(new RuntimeAdapterError("gateway_address_pin_expired"));
    if (signal?.aborted) return Promise.reject(new RuntimeAdapterError("gateway_network_aborted"));
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 25 || deadlineMs > 30000) return Promise.reject(new RuntimeAdapterError("invalid_gateway_network_deadline"));
    owner.consumed = true;
    return new Promise((resolve, reject) => {
      let socket: TLSSocket | undefined, settled = false;
      const cancel = () => finish("gateway_network_aborted");
      const finish = (reason?: string, observation?: GatewayTlsObservation) => {
        if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", cancel);
        if (reason) { socket?.destroy(); reject(new RuntimeAdapterError(reason)); }
        else resolve({ socket: socket!, observation: observation! });
      };
      const timer = setTimeout(() => finish("gateway_tls_deadline_exhausted"), deadlineMs);
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        const options: ConnectionOptions & { family: 4 | 6 } = { host: pin.selected.address, port: 443, family: pin.selected.family, servername: DEDICATED_GATEWAY_HOST,
          rejectUnauthorized: true, minVersion: "TLSv1.2", checkServerIdentity: (_host, certificate) => checkServerIdentity(DEDICATED_GATEWAY_HOST, certificate) };
        socket = this.dial(options);
        socket.on("error", () => finish("gateway_tls_unproven"));
        socket.once("close", () => { if (!settled) finish("gateway_tls_unproven"); });
        socket.once("secureConnect", () => {
          if (settled) return;
          try {
            if (this.monotonic() >= owner.expires) throw new RuntimeAdapterError("gateway_address_pin_expired");
            if (!socket!.authorized || !socket!.remoteAddress || !gatewayPeerMatchesPin(pin.selected.address, socket!.remoteAddress)) throw new RuntimeAdapterError("gateway_tls_peer_unproven");
            const cert = socket!.getPeerCertificate(), protocol = socket!.getProtocol();
            if (!cert.raw?.length || checkServerIdentity(DEDICATED_GATEWAY_HOST, cert) || !["TLSv1.2", "TLSv1.3"].includes(protocol ?? "")) throw new RuntimeAdapterError("gateway_tls_identity_unproven");
            finish(undefined, { peer_address: socket!.remoteAddress, protocol: protocol!, certificate_digest: digest(cert.raw).value });
          } catch (error) { finish(error instanceof RuntimeAdapterError ? error.reason : "gateway_tls_identity_unproven"); }
        });
        if (signal?.aborted) cancel();
      } catch { finish("gateway_tls_unproven"); }
    });
  }
}
