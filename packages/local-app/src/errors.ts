import type { DomainError } from "@cimiloop/protocol/v2";

export class LocalProjectError extends Error {
  constructor(message: string, readonly code: DomainError["code"] = "CLI_ARGUMENT_INVALID",
    readonly category: DomainError["category"] = "validation", readonly details: Record<string, unknown> = {}) { super(message); }
}
