import { existsSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { assertOrdinaryPath, RuntimeAdapterError } from "./files.js";

export const removePrivateDirectory = (operation: string, name: "state" | "workspace"): void => {
  const parent = assertOrdinaryPath(join(operation, "sandbox")), target = resolve(parent, name);
  if (target !== join(parent, name) || !target.startsWith(`${resolve(operation)}${sep}`)) throw new RuntimeAdapterError("invalid_private_cleanup_target");
  if (existsSync(target)) { assertOrdinaryPath(target); rmSync(target, { recursive: true, force: true }); }
};
