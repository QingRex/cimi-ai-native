import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { atomicJson, bytesAt, digest, directory, readJson, RuntimeAdapterError } from "./files.js";
import { isolatedEnvironment, nativeControl } from "./native.js";

export interface AgentRunClockReading { format: "cimiloop/agent-run-clock/1.0.0"; utc: string; boot_utc: string; uptime_ms: number; machine_digest: string }
export function parseAgentRunClock(raw: unknown): AgentRunClockReading {
  const value = raw as AgentRunClockReading;
  const stamp = (input: unknown): input is string => typeof input === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input) && Number.isFinite(Date.parse(input)) && new Date(input).toISOString() === input;
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "boot_utc,format,machine_digest,uptime_ms,utc" ||
    value.format !== "cimiloop/agent-run-clock/1.0.0" || !stamp(value.utc) || !stamp(value.boot_utc) || Date.parse(value.boot_utc) > Date.parse(value.utc) ||
    !Number.isSafeInteger(value.uptime_ms) || value.uptime_ms < 0 || typeof value.machine_digest !== "string" || !/^[a-f0-9]{64}$/.test(value.machine_digest)) throw new RuntimeAdapterError("agent_run_clock_invalid");
  return { ...value };
}
export async function openWindowsAgentRunClock(root: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (process.platform !== "win32" || process.arch !== "x64") throw new RuntimeAdapterError("windows_x64_agent_clock_required");
  const source = fileURLToPath(new URL("../native/AgentRunClock.cs", import.meta.url));
  const build = directory(join(root, "tools", "agent-run-clock-" + digest(bytesAt(source)).value)), output = join(build, "AgentRunClock.exe"), metadata = join(build, "build.json");
  if (!existsSync(output) || !existsSync(metadata)) {
    const compiler = resolve(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"), candidate = join(build, `${randomUUID()}.exe`);
    if (!existsSync(compiler)) throw new RuntimeAdapterError("native_compiler_unavailable");
    try { await promisify(execFile)(compiler, ["/nologo", "/target:exe", "/reference:System.Management.dll", "/reference:System.Web.Extensions.dll", `/out:${candidate}`, source],
      { windowsHide: true, timeout: 30000, maxBuffer: 1048576, env: isolatedEnvironment(), signal }); }
    catch { throw new RuntimeAdapterError("agent_run_clock_build_failed"); }
    renameSync(candidate, output); atomicJson(metadata, { digest: digest(bytesAt(output)) });
  }
  const expected = (readJson(metadata) as { digest?: { value?: string } }).digest?.value;
  if (!expected || expected !== digest(bytesAt(output)).value) throw new RuntimeAdapterError("agent_run_clock_binary_changed");
  // WMI boot identity is sampled once for this live host process. Subsequent
  // native reads prove its exact OS creation time before reusing that boot pin.
  // A restarted host creates a new factory and must independently sample WMI;
  // copied Task anchors never supply this process-continuity permission.
  let anchor:Promise<{reading:AgentRunClockReading;owner_creation_ticks:string}>|undefined;
  return { read: async (stop?: AbortSignal): Promise<AgentRunClockReading> => {
    if (digest(bytesAt(output)).value !== expected) throw new RuntimeAdapterError("agent_run_clock_binary_changed");
    stop?.throwIfAborted();
    if(!anchor){
      anchor=nativeControl(output,["--anchor",String(process.pid)],stop).then(({value})=>{
        const raw=value as {format?:unknown;reading?:unknown;owner_creation_ticks?:unknown};
        if(!raw||typeof raw!=="object"||Object.keys(raw).sort().join(",")!=="format,owner_creation_ticks,reading"||raw.format!=="cimiloop/agent-run-clock-owner-anchor/1.0.0"||typeof raw.owner_creation_ticks!=="string"||!/^\d{1,19}$/.test(raw.owner_creation_ticks))throw new RuntimeAdapterError("agent_run_clock_owner_unproven");
        return {reading:parseAgentRunClock(raw.reading),owner_creation_ticks:raw.owner_creation_ticks};
      });
      void anchor.catch(()=>{});
      const original=await anchor;stop?.throwIfAborted();return original.reading;
    }
    const original=await anchor;stop?.throwIfAborted();
    const reading=parseAgentRunClock((await nativeControl(output,["--continuous",String(process.pid),original.owner_creation_ticks,original.reading.boot_utc],stop)).value);
    if(reading.machine_digest!==original.reading.machine_digest||reading.boot_utc!==original.reading.boot_utc||reading.uptime_ms<original.reading.uptime_ms)throw new RuntimeAdapterError("agent_run_clock_owner_unproven");
    return reading;
  } };
}
