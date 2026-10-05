import { nativeControl } from "./native.js";
import { RuntimeAdapterError } from "./files.js";
import type { CreditProcessIdentity, CreditOwnerState } from "./gateway-credit.js";
export const creditHostDependencies = async (launcher: string, options: { now?: () => number; observation?: (bytes: Buffer) => void } = {}) => {
  const captured = await nativeControl(launcher, ["--identity", String(process.pid)]); options.observation?.(captured.bytes);
  const identity = captured.value as CreditProcessIdentity;
  return { identity, ...(options.now ? { now: options.now } : {}), observeOwner: async (owner: CreditProcessIdentity): Promise<CreditOwnerState> => {
    const observed = await nativeControl(launcher, ["--inspect-identity", JSON.stringify(owner)]); options.observation?.(observed.bytes);
    const value = observed.value as { state?: string };
    if (!value || Object.keys(value).join(",") !== "state" || !["active", "absent", "unknown"].includes(value.state ?? "")) throw new RuntimeAdapterError("credit_owner_observation_unproven");
    return value.state as CreditOwnerState;
  } };
};
