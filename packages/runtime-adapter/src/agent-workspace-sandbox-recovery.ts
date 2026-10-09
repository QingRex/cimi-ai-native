import { existsSync } from "node:fs";
import {readRuntimeBinaryOriginal} from "./runtime-binary-originals.js";
import { join, resolve, dirname, basename } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { agentWorkspaceIpcScopeDigest } from "./agent-workspace-ipc.js";
import { parseAgentWorkspaceToolScope } from "./agent-workspace-authority.js";
import { validWorkspaceWorkerIdentity } from "./workspace-files.js";
import { copyToolJson } from "./tool-journal.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import { bytesAt, digest, assertOrdinaryPath, RuntimeAdapterError } from "./files.js";
import { nativeControl } from "./native.js";

const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function fail(): never { throw new RuntimeAdapterError("workspace_rehearsal_recovery_unproven"); }
const record = (path: string) => copyToolJson(parseGatewayJson(bytesAt(path, 65536).toString("utf8"), 65536));
// Trusted original-operation composition only; no CLI/workbench default entry.
// Resource recovery never runs a tool/model or synthesizes Run completion.
function readOriginal(raw: { root: string; operation: string; scope: unknown }, verifyBinaryOriginal:boolean) {
  const scope = parseAgentWorkspaceToolScope(raw.scope), root = assertOrdinaryPath(raw.root), operation = assertOrdinaryPath(raw.operation);
  if (!uuid(basename(operation)) || dirname(operation) !== join(resolve(root), "workspace-tool-rehearsals")) fail();
  const config = record(join(operation, "original-config.json"));
  const fields = ["format", "nonce", "root", "binary", "owner", "pipe_nonce", "scope_digest", "elapsed_ms", "provider_options"];
  const oldConfig = exact(config, fields) && config.format === "cimiloop/agent-workspace-sandbox-config/1.0.0";
  const retainedConfig=exact(config,[...fields,"deadline_uptime_ms","prompt","lifetime_policy","binary_original"])&&config.format==="cimiloop/agent-workspace-sandbox-config/5.0.0"&&
    (typeof config.prompt==="string"&&config.lifetime_policy==="agent_task/1.0.0"||config.prompt===null&&config.lifetime_policy===null);
  const newConfig = (exact(config, [...fields, "deadline_uptime_ms"]) && config.format === "cimiloop/agent-workspace-sandbox-config/2.0.0" ||
    exact(config, [...fields, "deadline_uptime_ms", "prompt"]) && config.format === "cimiloop/agent-workspace-sandbox-config/3.0.0" && typeof config.prompt === "string" ||
    exact(config,[...fields,"deadline_uptime_ms","prompt","lifetime_policy"]) && config.format === "cimiloop/agent-workspace-sandbox-config/4.0.0" && typeof config.prompt === "string" && config.lifetime_policy==="agent_task/1.0.0"||retainedConfig) &&
    (config.deadline_uptime_ms === null || Number.isSafeInteger(config.deadline_uptime_ms) && Number(config.deadline_uptime_ms) > 0);
  if (!config || !oldConfig && !newConfig || !uuid(config.nonce) || !uuid(config.pipe_nonce) || config.root !== join(operation, "sandbox") ||
    !Number.isSafeInteger(config.elapsed_ms) || Number(config.elapsed_ms)<1000 || Number(config.elapsed_ms)>(config.lifetime_policy==="agent_task/1.0.0"?3600000:180000) ||
    typeof config.binary !== "string" || !validWorkspaceWorkerIdentity(config.owner) || config.scope_digest !== agentWorkspaceIpcScopeDigest(scope)) fail();
  if(retainedConfig){const proof=config.binary_original as ReturnType<typeof readRuntimeBinaryOriginal>;if(!proof||proof.path!==config.binary||verifyBinaryOriginal&&!isDeepStrictEqual(readRuntimeBinaryOriginal(root,config.binary,proof.sha),proof))fail();}
  if (!existsSync(join(operation, "original-launcher.json")) || !existsSync(join(operation, "agent-sandbox-resources.json"))) {
    return { scope, root, operation, config, launch: null, resources: null };
  }
  const launch = record(join(operation, "original-launcher.json")), resources = record(join(operation, "agent-sandbox-resources.json"));
  const launchFields=["format", "nonce", "owner", "supervisor", "launcher_path", "launcher_digest"],legacyLaunch=exact(launch,launchFields)&&launch.format==="cimiloop/agent-workspace-launcher/1.0.0",retainedLaunch=exact(launch,[...launchFields,"launcher_original"])&&launch.format==="cimiloop/agent-workspace-launcher/2.0.0";
  if (!legacyLaunch&&!retainedLaunch || launch.nonce !== config.nonce || !isDeepStrictEqual(launch.owner, config.owner) ||
    !validWorkspaceWorkerIdentity(launch.supervisor) || typeof launch.launcher_path !== "string" || !sha(launch.launcher_digest) ||
    resolve(launch.supervisor.image).toLowerCase() !== resolve(launch.launcher_path).toLowerCase() ||
    digest(bytesAt(launch.launcher_path)).value !== launch.launcher_digest) fail();
  if(retainedLaunch){if(!isDeepStrictEqual(readRuntimeBinaryOriginal(root,launch.launcher_path,launch.launcher_digest),launch.launcher_original))fail();}
  else{
    if(dirname(dirname(launch.launcher_path))!==join(root,"tools")||!/^agent-workspace-sandbox-[a-f0-9]{64}$/.test(basename(dirname(launch.launcher_path)))||basename(launch.launcher_path)!=="AgentWorkspaceSandbox.exe")fail();
    const metadata=record(join(dirname(launch.launcher_path),"build.json"));
    if(!exact(metadata,["digest"])||!exact(metadata.digest,["algorithm","value"])||metadata.digest.algorithm!=="sha256"||metadata.digest.value!==launch.launcher_digest)fail();
  }
  if (!exact(resources, ["format", "nonce", "root", "binary", "profile", "scope_digest", "config_digest", "owner", "supervisor", "runtime", "mapping", "job_name", "job_assignment", "phase", "profile_intent", "profile_was_absent", "grants_intent", "resources_disposed", "user_sid", "session_id", "logon_luid"]) ||
    resources.format !== "cimiloop/agent-workspace-resources/1.0.0" || resources.nonce !== config.nonce || resources.root !== config.root || resources.binary !== config.binary ||
    resources.config_digest !== digest(bytesAt(join(operation, "original-config.json"), 65536)).value || resources.scope_digest !== config.scope_digest ||
    !isDeepStrictEqual(resources.owner, config.owner) || !isDeepStrictEqual(resources.supervisor, launch.supervisor) ||
    resources.profile !== "CimiLoop.AgentWorkspace." + config.nonce.replaceAll("-", "") || resources.job_name !== "Local\\" + resources.profile ||
    resources.job_assignment !== "atomic_on_create" || !["registered", "profile_intent", "grants_intent", "granted", "mapped", "process_create_intent", "runtime_created", "suspended", "running", "ended", "recovered"].includes(String(resources.phase)) ||
    typeof resources.profile_intent !== "boolean" || typeof resources.profile_was_absent !== "boolean" || typeof resources.grants_intent !== "boolean" || typeof resources.resources_disposed !== "boolean" ||
    typeof resources.user_sid !== "string" || !/^S-[0-9]+(?:-[0-9]+){2,15}$/.test(resources.user_sid) || resources.user_sid.length > 184 ||
    !Number.isSafeInteger(resources.session_id) || Number(resources.session_id) < 0 || Number(resources.session_id) > 2147483647 ||
    typeof resources.logon_luid !== "string" || !/^[a-f0-9]{16}$/.test(resources.logon_luid) ||
    resources.runtime !== null && (!validWorkspaceWorkerIdentity(resources.runtime) || resources.runtime.image.toLowerCase() !== config.binary.toLowerCase()) ||
    resources.mapping !== null && (typeof resources.mapping !== "string" || !/^[F-Z]:$/.test(resources.mapping))) fail();
  return { scope, root, operation, config, launch, resources };
}
export function readOriginalAgentWorkspaceOperation(raw: { root: string; operation: string; scope: unknown }) {return readOriginal(raw,true);}
export async function recoverOpenCodeWorkspaceToolRehearsal(raw: { root: string; operation: string; scope: unknown }) {
  // Missing execution bytes invalidate result proof, but must not prevent
  // disposal of the original OS resources by the original pinned controller.
  const { launch, resources, operation } = readOriginal(raw,false);
  if (!launch || !resources) return { outcome: "unknown" as const, reason: "agent_original_registration_missing", resources_disposed: false, completion_proven: false as const };
  const result = (await nativeControl(launch.launcher_path as string, ["--recover", operation])).value;
  if (!exact(result, ["outcome", "reason", "resources_disposed", "completion_proven"]) || !["recovered", "active", "unknown"].includes(String(result.outcome)) ||
    typeof result.reason !== "string" || !/^agent_[a-z_]{1,96}$/.test(result.reason) || typeof result.resources_disposed !== "boolean" ||
    (result.outcome === "recovered") !== result.resources_disposed || result.completion_proven !== false) fail();
  return { outcome: result.outcome as "recovered" | "active" | "unknown", reason: result.reason, resources_disposed: result.resources_disposed, completion_proven: false as const };
}
