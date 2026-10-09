import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { writeInstance } from "@cimiloop/local-app";
import { createAgentRunProject } from "../../../tests/fixtures/agent-run-project.js";
import { startWorkbench, type WorkbenchServer } from "../src/server.js";
import { claimAgentRuntimeOperation } from "../../../packages/runtime-adapter/src/agent-runtime-operation.js";
import { originalAgentWorkspaceScope } from "../../../packages/local-app/src/agent-workspace-tools-local.js";

// Actual HTTP/SQLite control with constructed Agent qualification, no OS Run
// or model effect. Missing original Native registration must remain Unknown.
describe("Workbench controls original Agent Runs with Human Kernel authority", () => {
  let root: string, f: ReturnType<typeof createAgentRunProject>, server: WorkbenchServer, cookie: string, csrf: string, runId: string;
  const request = async (path: string, body?: unknown, headers: Record<string,string> = {}) => {
    const response = await fetch(server.origin + path, {headers: {Cookie:cookie,Connection:"close",...(body === undefined ? {} : {
      Origin:server.origin,"Content-Type":"application/json","X-CimiLoop-CSRF":csrf}),...headers},
      ...(body === undefined ? {} : {method:"POST",body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json() as Record<string,any>};
  };
  const stop = (role = "technical_owner") => ({command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:role,
    command_type:"CancelRun",target:{object_type:"run",id:runId},expected_revision:f.store.getRun(runId)!.revision,payload:{reason:"Human stop original Agent"}});
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(),"cimiloop-workbench-agent-control-")); f = createAgentRunProject(root);
    runId = f.reserveAgent(f.prepareAgent()).run.id;
    writeInstance(join(dirname(f.path),"instance.json"),{schema_version:"1.0.0",instance_id:f.project.instance_id,project_id:f.project.id,
      actor_id:f.actor.id,created_at:f.project.created_at}); server = await startWorkbench({projectDir:root});
    const login = await fetch(server.origin+"/api/session",{method:"POST",headers:{Origin:server.origin,"Content-Type":"application/json"},
      body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});
    expect(login.status).toBe(200); cookie=login.headers.get("set-cookie")!.split(";")[0]!; csrf=(await login.json() as {csrf:string}).csrf;
  },120000);
  afterAll(async () => { await server?.close(); f?.store.close(); if(root) {
    if(dirname(root)!==resolve(tmpdir())||!basename(root).startsWith("cimiloop-workbench-agent-control-")) throw Error("Unsafe cleanup");
    rmSync(root,{recursive:true,force:true});
  } });
  it("requires the existing session, exact Origin and CSRF before every control",async()=>{
    expect((await fetch(server.origin+`/api/agent-runs/${runId}`)).status).toBe(401);
    const sequence=f.store.asOfEventSequence();
    for(const action of ["collect","stop","cancel","recover"]) {
      expect((await request(`/api/agent-runs/${runId}/${action}`,{}, {"X-CimiLoop-CSRF":"wrong"})).status).toBe(403);
      expect((await request(`/api/agent-runs/${runId}/${action}`,{}, {Origin:"https://foreign.example"})).status).toBe(403);
    }
    expect(f.store.asOfEventSequence()).toBe(sequence);
  });
  it("queries and collects missing originals as Unknown without inventing a start or domain observation",async()=>{
    const sequence=f.store.asOfEventSequence();
    const queried=await request(`/api/agent-runs/${runId}`),collected=await request(`/api/agent-runs/${runId}/collect`,{});
    expect(queried.status).toBe(200);expect(collected.status).toBe(200);
    for(const result of [queried,collected]) expect(result.body).toMatchObject({ok:true,run_id:runId,starts_run:false,
      domain_observation_produced:false,operation:{outcome:"unknown"}});
    expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.store.listRuntimeRecords("run_observation",f.change.id)).toHaveLength(0);
  });
  it("rejects caller/scope/path overrides and a stop request for a different original Run",async()=>{
    const sequence=f.store.asOfEventSequence();
    expect((await request(`/api/agent-runs/${runId}/collect`,{scope:{run_id:runId}})).status).toBe(400);
    expect((await request(`/api/agent-runs/${runId}/recover`,{repository_path:root})).status).toBe(400);
    expect((await request(`/api/agent-runs/${runId}/stop`,{...stop(),actor_id:f.agent.id})).status).toBe(400);
    expect((await request(`/api/agent-runs/${runId}/stop`,{...stop(),target:{object_type:"run",id:createInternalId()}})).status).toBe(400);
    expect((await request(`/api/agent-runs/${createInternalId()}`)).status).toBe(404);
    expect(f.store.asOfEventSequence()).toBe(sequence);
  });
  it("keeps Kernel role checks and forbids marker retry or resource recovery before native cancellation authority",async()=>{
    const denied=await request(`/api/agent-runs/${runId}/stop`,stop("executor"));
    expect(denied.status).toBe(409);expect(denied.body).toMatchObject({code:"ROLE_NOT_ASSIGNED"});
    expect((await request(`/api/agent-runs/${runId}/cancel`,{})).status).toBe(409);
    expect((await request(`/api/agent-runs/${runId}/recover`,{})).status).toBe(409);
    expect(f.store.getRun(runId)!.cancel_requested).toBe(false);
  });
  it("replays one Kernel cancellation and preserves its Unknown Native acknowledgement and budget",async()=>{
    const input=stop(),sequence=f.store.asOfEventSequence(),first=await request(`/api/agent-runs/${runId}/stop`,input),second=await request(`/api/agent-runs/${runId}/stop`,input);
    expect(first.status).toBe(200);expect(second.body).toEqual(first.body);
    expect(first.body).toMatchObject({command_result:{command_type:"CancelRun"},operation:{outcome:"unknown"},starts_run:false});
    expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(f.store.getRun(runId)!.cancel_requested).toBe(true);
    expect(f.task().usage.pending_reconciliation).toBe(true);expect(f.task().usage.cost_reserved_micros).toBe(100);
  });
  it("retries only the original Native marker and resources without another domain command or Run",async()=>{
    const sequence=f.store.asOfEventSequence();
    for(const action of ["cancel","recover"]) {
      const result=await request(`/api/agent-runs/${runId}/${action}`,{});
      expect(result.status).toBe(200);expect(result.body.operation.outcome).toBe("unknown");expect(result.body.starts_run).toBe(false);
    }
    expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.store.listRuns(f.change.id)).toHaveLength(1);
  });
  it("refuses to invent an observation without the original registration and rejects report/caller overrides",async()=>{
    const sequence=f.store.asOfEventSequence(),input={...stop(),command_type:"RecordRunObservation",payload:{}};
    expect((await request(`/api/agent-runs/${runId}/observe`,input)).body).toMatchObject({code:"CAPABILITY_UNAVAILABLE"});
    expect((await request(`/api/agent-runs/${runId}/observe`,{...input,actor_id:f.agent.id})).status).toBe(400);
    expect((await request(`/api/agent-runs/${runId}/observe`,{...input,payload:{status:"succeeded"}})).status).toBe(400);
    expect(f.store.asOfEventSequence()).toBe(sequence);
  });
  it("records one original Unknown observation with the Human identity and keeps cancellation and budget pending",async()=>{
    // Constructed original claim only, no Native process or model effect.
    const scope=originalAgentWorkspaceScope({store:f.store,kernel:f.kernel,caller:f.caller,location:{repositoryKind:"git",repositoryPath:root,
      dataDirectory:dirname(f.path),databasePath:f.path,instancePath:join(dirname(f.path),"instance.json"),suggestedName:"Constructed Unknown HTTP claim"}},runId);
    claimAgentRuntimeOperation(dirname(f.path),scope,{purpose:"constructed-incomplete-http-claim"},{pid:1234,creation_ticks:"123456",image:process.execPath});
    const input={...stop(),command_type:"RecordRunObservation",payload:{}},sequence=f.store.asOfEventSequence();
    const first=await request(`/api/agent-runs/${runId}/observe`,input),second=await request(`/api/agent-runs/${runId}/observe`,input);
    expect(first.status).toBe(200);expect(second.body).toEqual(first.body);
    expect(first.body).toMatchObject({command_type:"RecordRunObservation",data:{observation:{report:{status:"unknown",producer_actor_id:f.actor.id,usage:{cost_known:false}}}}});
    expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(f.store.listRuntimeRecords("run_observation",f.change.id)).toHaveLength(1);
    expect(f.store.getRun(runId)!.cancel_requested).toBe(true);expect(f.task().usage).toMatchObject({pending_reconciliation:true,cost_reserved_micros:100});
  });
});
