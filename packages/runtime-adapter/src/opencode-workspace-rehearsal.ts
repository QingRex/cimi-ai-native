import { runOpenCodeWorkspaceEngine, type RehearsalOptions } from "./opencode-workspace-runtime.js";
// Explicit constructed-model entry point, retaining the original compatibility
// format and operation identity. Never substitutes for host model admission.
export function runOpenCodeWorkspaceToolRehearsal(options: RehearsalOptions) {
 if (options.mode !== undefined && options.mode !== "files" && options.mode !== "checks") throw Error("workspace_rehearsal_input_invalid");
 return runOpenCodeWorkspaceEngine(options);
}