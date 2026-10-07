import { resolve } from "node:path";
import { openWorkspaceToolHost, parseWorkspaceToolInvocation } from "@cimiloop/runtime-adapter";
import type { LocalProject } from "./project.js";
export type WorkspaceToolLocalContext = Pick<LocalProject, "instance" | "location"> & {
  store: Pick<LocalProject["store"], "getProject" | "getActor" | "getRun" | "getRuntimeRecord">;
  kernel: Pick<LocalProject["kernel"], "assessRunTool">;
};

// Local trusted Human entry only. A Runtime cannot choose a repository, actor,
// fresh journal or fake assessment. Agent admission remains a separate host.
export class LocalWorkspaceToolService {
  private constructor(private readonly local: WorkspaceToolLocalContext, private readonly execution: Awaited<ReturnType<typeof openWorkspaceToolHost>>) {}
  static async open(local: WorkspaceToolLocalContext): Promise<LocalWorkspaceToolService> {
    const project = local.store.getProject(), actor = local.store.getActor(local.instance.actor_id);
    if (!project || project.id !== local.instance.project_id || resolve(project.repository_path) !== resolve(local.location.repositoryPath) || !actor || actor.actor_type !== "human" || actor.project_id !== project.id) throw new Error("Workspace tool local identity mismatch");
    const execution = await openWorkspaceToolHost({ repositoryPath: local.location.repositoryPath, dataDirectory: local.location.dataDirectory, projectId: project.id,
      assess: request => local.kernel.assessRunTool(request) });
    return new LocalWorkspaceToolService(local, execution);
  }
  execute(raw: unknown) {
    const input = parseWorkspaceToolInvocation(raw), run = this.local.store.getRun(input.run_id), record = run && this.local.store.getRuntimeRecord("run_record", run.record_ref.id);
    if (input.project_id !== this.local.instance.project_id || input.executor_actor_id !== this.local.instance.actor_id || !record || record.run_kind !== "human" ||
      record.project_id !== input.project_id || record.operation_key !== input.operation_key || record.executor_ref.id !== input.executor_actor_id || record.input_digest.value !== input.context_digest.value) throw new Error("Workspace tool original run mismatch");
    return this.execution.host.execute(input);
  }
  reconcileOwners() { return this.execution.journal.reconcileOwners(); }
  close() { return this.execution.host.close(); }
}
