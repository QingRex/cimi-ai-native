import { isDeepStrictEqual } from "node:util";
import { queryAgentRuntimeOperation, requestAgentRuntimeCancellation, recoverAgentRuntimeOperation, collectAgentRuntimeOperation } from "@cimiloop/runtime-adapter";
import { originalAgentWorkspaceScope, type AgentWorkspaceToolLocalContext } from "./agent-workspace-tools-local.js";

// Trusted original Agent metadata only. No Human initialization/default Agent
// entry installs this composition or converts its facts to domain completion.
export class LocalAgentRuntimeOperations {
  constructor(private readonly local: AgentWorkspaceToolLocalContext) {}
  private scope(runId: string) { return originalAgentWorkspaceScope(this.local, runId); }
  async query(runId: string) {
    const scope = this.scope(runId), result = await queryAgentRuntimeOperation(this.local.location.dataDirectory, scope);
    if (!isDeepStrictEqual(this.scope(runId), scope)) throw Error("Agent original Runtime scope changed"); return result;
  }
  requestCancellation(runId: string) { return requestAgentRuntimeCancellation(this.local.location.dataDirectory, this.scope(runId)); }
  async collect(runId: string) {
    const scope = this.scope(runId), result = await collectAgentRuntimeOperation(this.local.location.dataDirectory, scope);
    if (!isDeepStrictEqual(this.scope(runId), scope)) throw Error("Agent original Runtime scope changed"); return result;
  }
  async recover(runId: string) {
    const scope = this.scope(runId), result = await recoverAgentRuntimeOperation(this.local.location.dataDirectory, scope);
    if (!isDeepStrictEqual(this.scope(runId), scope)) throw Error("Agent original Runtime scope changed"); return result;
  }
}
