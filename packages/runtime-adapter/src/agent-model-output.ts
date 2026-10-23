import { RuntimeAdapterError } from "./files.js";

// Trusted installed-port policy only. Legacy originals have no marker and
// retain their 512-token limit; a new request cannot upgrade an existing Host.
export const AGENT_MODEL_OUTPUT_PROFILE = "bounded_2048/1.0.0" as const;
export type AgentModelOutputProfile = typeof AGENT_MODEL_OUTPUT_PROFILE;
export function parseAgentModelOutputProfile(raw: unknown): AgentModelOutputProfile | undefined {
  if (raw === undefined) return undefined;
  if (raw !== AGENT_MODEL_OUTPUT_PROFILE) throw new RuntimeAdapterError("agent_model_output_policy_unproven");
  return raw;
}
export const agentModelOutputLimit = (raw: unknown): number => parseAgentModelOutputProfile(raw) ? 2048 : 512;
export const agentModelRequestFormat = (parent: boolean, profile: unknown): string =>
  `cimiloop/agent-runtime-model-request/${parseAgentModelOutputProfile(profile) ? parent ? 4 : 3 : parent ? 2 : 1}.0.0`;
