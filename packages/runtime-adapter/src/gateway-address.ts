import { BlockList, isIP } from "node:net";
const privateV4 = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) privateV4.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList(); globalV6.addSubnet("2000::", 3, "ipv6");
const specialV6 = new BlockList();
for (const [address, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) specialV6.addSubnet(address, prefix, "ipv6");
export const canonicalGatewayAddress = (address: string): string | undefined => {
  if (typeof address !== "string" || address.includes("%")) return undefined;
  if (isIP(address) === 4) return address;
  if (isIP(address) !== 6) return undefined;
  try { return new URL(`https://[${address}]/`).hostname.slice(1, -1); } catch { return undefined; }
};
export const isPublicGatewayAddress = (address: string): boolean => {
  const canonical = canonicalGatewayAddress(address);
  return canonical !== undefined && (isIP(canonical) === 4 ? !privateV4.check(canonical, "ipv4")
    : globalV6.check(canonical, "ipv6") && !specialV6.check(canonical, "ipv6"));
};
// Mapped addresses are forbidden in DNS. An OS may represent an IPv4 peer in
// mapped form; accept it only when the underlying IPv4 exactly matches our pin.
export const gatewayPeerMatchesPin = (pinned: string, peer: string): boolean => {
  const expected = canonicalGatewayAddress(pinned), actual = canonicalGatewayAddress(peer);
  if (!expected || !actual) return false;
  if (expected === actual) return true;
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(actual);
  if (isIP(expected) !== 4 || !mapped) return false;
  const a = Number.parseInt(mapped[1]!, 16), b = Number.parseInt(mapped[2]!, 16);
  return expected === `${a >>> 8}.${a & 255}.${b >>> 8}.${b & 255}`;
};
