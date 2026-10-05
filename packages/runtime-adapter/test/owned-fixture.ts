import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { isolatedEnvironment } from "../src/native.js";

// Keep one verified OS Process handle for the entire fault injection. A PID
// checked by a separate process and later killed by number could be reused.
export const crashOwnedFixture = async (identity: { pid: number; creation_ticks: string; image: string }): Promise<void> => {
  const script = "$ErrorActionPreference='Stop'; $fixtureProcess=[Diagnostics.Process]::GetProcessById([int]$env:CIMILOOP_FIXTURE_PID); $fixtureHandle=$fixtureProcess.Handle; if ($fixtureProcess.HasExited) { throw 'Fixture already ended' }; if ($fixtureProcess.StartTime.ToUniversalTime().ToFileTimeUtc().ToString() -ne $env:CIMILOOP_FIXTURE_CREATED -or $fixtureProcess.MainModule.FileName -ne $env:CIMILOOP_FIXTURE_IMAGE) { throw 'Fixture identity changed' }; $fixtureProcess.Kill(); if (-not $fixtureProcess.WaitForExit(5000)) { throw 'Fixture still running' }";
  await promisify(execFile)(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, timeout: 10000,
      env: { ...isolatedEnvironment(), CIMILOOP_FIXTURE_PID: String(identity.pid), CIMILOOP_FIXTURE_CREATED: identity.creation_ticks, CIMILOOP_FIXTURE_IMAGE: identity.image } });
};
