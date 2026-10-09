import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { isolatedEnvironment } from "../../packages/runtime-adapter/src/native.js";
import { digest } from "../../packages/runtime-adapter/src/files.js";
import { describe, expect, it } from "vitest";
import { openWindowsAgentRunClock } from "../../packages/runtime-adapter/src/index.js";

describe.runIf(process.platform === "win32" && process.arch === "x64")("real held Windows Task clock", () => {
  it("reads fresh OS time in the same helper across cancellation and closes that child", async () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-clock-channel-runtime-"));
    console.error("Retain original clock fixture: " + root);
    const clock = await openWindowsAgentRunClock(root);
    const original = clock.snapshot();
    try {
      const readings = await Promise.all(Array.from({ length: 12 }, () => clock.read()));
      for (let i = 1; i < readings.length; i++) {
        expect(readings[i]!.uptime_ms).toBeGreaterThanOrEqual(readings[i - 1]!.uptime_ms);
        expect(readings[i]!.boot_utc).toBe(readings[0]!.boot_utc);
        expect(readings[i]!.machine_digest).toBe(readings[0]!.machine_digest);
      }
      const stop = new AbortController(), aborted = clock.read(stop.signal);
      const assertion = expect(aborted).rejects.toThrow("agent_run_clock_channel_aborted");
      await Promise.resolve(); await Promise.resolve();
      expect(clock.snapshot().requests_sent).toBe(13); stop.abort(); await assertion;
      const final = await clock.read();
      expect(final.uptime_ms).toBeGreaterThanOrEqual(readings[11]!.uptime_ms);
      expect(clock.snapshot()).toMatchObject({ pid: original.pid, replies_validated: 14, requests_sent: 14, process_exited: false });
    } finally { await clock.close(); }
    expect(clock.snapshot()).toMatchObject({ pid: original.pid, process_exited: true, closed: true });
    await expect(clock.read()).rejects.toThrow();
  }, 45000);
  it("exits on the held original owner's death, observed through the helper's original OS handle",async()=>{
    const root=mkdtempSync(join(tmpdir(),"cimiloop-clock-channel-runtime-"));console.error("Retain original clock owner fixture: "+root);
    const owner=spawn(process.execPath,["-e","process.stdin.once('data',()=>process.exit(73));process.stdin.once('end',()=>process.exit(74));process.stdin.resume();"],{windowsHide:true,env:isolatedEnvironment(),stdio:["pipe","pipe","pipe"]});
    const holder=spawn(process.execPath,[resolve("packages/runtime-adapter/test/agent-run-clock-owner-worker.mjs"),root,String(owner.pid)],{windowsHide:true,env:isolatedEnvironment(),stdio:["ignore","pipe","pipe"]});
    const holderExit=new Promise<number|null>(done=>holder.once("close",code=>done(code)));
    const ownerExit=new Promise<number|null>(done=>owner.once("close",code=>done(code)));
    let text="";
    const identity=await new Promise<{pid:number}>((yes,no)=>{
      const timer=setTimeout(()=>no(Error("Clock owner identity unavailable")),15000);
      holder.stdout.on("data",chunk=>{text+=chunk.toString();if(text.length>4096){clearTimeout(timer);no(Error("Clock identity overflow"));}else if(text.includes("\n")){clearTimeout(timer);yes(JSON.parse(text.split("\n")[0]!));}});
      holder.once("error",()=>{clearTimeout(timer);no(Error("Clock owner unavailable"));});
    }).catch(error=>{owner.kill();holder.kill();throw error;});
    const marker=join(root,"held-clock-handle.txt"),image=join(root,"tools","agent-run-clock-"+digest(readFileSync(resolve("packages/runtime-adapter/native/AgentRunClock.cs"))).value,"AgentRunClock.exe");
    const script=`$ErrorActionPreference='Stop'; Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class ClockExit { [DllImport("kernel32.dll")] public static extern bool GetExitCodeProcess(IntPtr handle,out uint code); }'; $clock=[Diagnostics.Process]::GetProcessById([int]$env:CIMILOOP_CLOCK_TEST_PID); $held=$clock.Handle; if($clock.HasExited -or $clock.MainModule.FileName -ne $env:CIMILOOP_CLOCK_TEST_IMAGE){throw 'Clock identity changed'}; [IO.File]::WriteAllText($env:CIMILOOP_CLOCK_TEST_READY,'held'); if(-not $clock.WaitForExit(15000)){throw 'Original clock did not exit'}; [uint32]$raw=0; if(-not [ClockExit]::GetExitCodeProcess($held,[ref]$raw)){throw 'Clock exit unavailable'}; [Console]::Out.Write($raw); $clock.Dispose()`;
    const observer=promisify(execFile)(join(process.env.SystemRoot??"C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe"),
      ["-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(script,"utf16le").toString("base64")],
      {windowsHide:true,timeout:20000,env:{...isolatedEnvironment(),CIMILOOP_CLOCK_TEST_PID:String(identity.pid),CIMILOOP_CLOCK_TEST_IMAGE:image,CIMILOOP_CLOCK_TEST_READY:marker}});
    void observer.catch(()=>{});
    try{await new Promise<void>((yes,no)=>{const started=Date.now(),timer=setInterval(()=>{if(existsSync(marker)){clearInterval(timer);yes();}else if(Date.now()-started>=10000){clearInterval(timer);no(Error("Clock handle unavailable"));}},25);});
      const header=JSON.parse(readFileSync(join(root,"native-header.json"),"utf8"));expect(header.owner_pid).toBe(owner.pid);
      const started=Date.now();owner.stdin.write("exit");expect(await ownerExit).toBe(73);expect((await observer).stdout).toBe("2");expect(Date.now()-started).toBeLessThan(5000);expect(await holderExit).toBe(0);
    }finally{if(owner.exitCode===null)owner.kill();if(holder.exitCode===null)holder.kill();}
  },45000);
});