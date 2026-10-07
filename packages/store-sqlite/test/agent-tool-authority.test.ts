import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, it, expect, vi } from "vitest";
import { CimiLoopKernel, type AgentRunVerifierPort } from "../../kernel/src/index.js";
import * as v2 from "../../protocol/src/v2/index.js";
import { contentDigest } from "../../kernel/src/intent.js";
import { createAgentRunProject } from "../../../tests/fixtures/agent-run-project.js";
import { createSkillInvocationProject } from "../../../tests/fixtures/skill-invocation-project.js";
import { flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";
vi.setConfig({ testTimeout: 60000 });
// Constructed controlled ALLOW/host only. Real temporary Git/native records do
// not qualify production Agent/model/fee execution; queries perform no effects.
describe("Agent current tool authority over original Native records", () => {
  const roots: string[] = [], stores: { close(): void }[] = [];
  afterEach(() => { while(stores.length)stores.pop()!.close(); while(roots.length) { const root=roots.pop()!; if(!resolve(root).startsWith(resolve(tmpdir())+sep+"cimiloop-agent-tool-"))throw Error("Unsafe cleanup"); rmSync(root,{recursive:true,force:true}); } });
  function setup(resources?: v2.ExternalReference[]) {
    const root=mkdtempSync(join(tmpdir(),"cimiloop-agent-tool-")); roots.push(root); const f=createAgentRunProject(root,"task_execution",100,resources); stores.push(f.store);
    const prepared=f.prepareAgent(), reserved=f.reserveAgent(prepared), request: v2.AgentToolAuthorityRequest={project_id:f.project.id,run_id:reserved.run.id,operation_key:reserved.record.operation_key,
      executor_actor_id:f.agent.id,context_digest:prepared.context.input_digest,action:"read_files",resource:"src/query.ts",...f.pins,host_admission_ref:prepared.context.host_admission_ref};
    const live={epoch:1,available:true,calls:0}; let time=flowTime;
    const port: AgentRunVerifierPort={...f.runPort.agent,checkToolAuthority(project,input) { live.calls++; if(!live.available)throw Error("Constructed proof unavailable");
      expect(project.id).toBe(f.project.id); expect(input.record).toEqual(reserved.record); expect(input.context).toEqual(prepared.context); expect(input.runtime).toEqual(f.runtime);
      const result=contentDigest({synthetic:true,epoch:live.epoch,request:input.request,admission:input.context.host_admission_ref}); input.record.operation_key=v2.createInternalId(); input.request.resource="mutated callback copy"; return result; }};
    const host=Object.assign(f.runPort,{agent:port}), kernel=()=>new CimiLoopKernel({store:f.store,caller:f.caller,now:()=>time,runVerifier:host});
    return {...f,root,prepared,reserved,request,live,port,host,toolKernel:kernel(),kernelAt:kernel,setToolTime:(value:string)=>{time=value;}};
  }
  it("allows one original parent tool with a live trusted check while queries leave records/events/usage untouched", () => {
    const f=setup(), before=f.task(), sequence=f.store.asOfEventSequence(), first=f.toolKernel.assessAgentRunTool(f.request);
    expect(first).toMatchObject({scope:"agent_run_tool_assessment",decision:"ALLOW",as_of_event_sequence:sequence,authority:{run_record_id:f.reserved.record.id,host_admission_ref:f.request.host_admission_ref}});
    expect(f.toolKernel.assessAgentRunTool(f.request)).toEqual(first); expect(f.live.calls).toBe(2); expect(f.task()).toEqual(before); expect(f.store.asOfEventSequence()).toBe(sequence);
    expect(f.store.getRuntimeRecord("run_record",f.reserved.record.id)).toEqual(f.reserved.record); expect(f.request.resource).toBe("src/query.ts");
    f.live.epoch++; const next=f.toolKernel.assessAgentRunTool(f.request); expect(next).toMatchObject({decision:"ALLOW"});
    if (!("authority" in first)||!first.authority||!("authority" in next)||!next.authority)throw Error("Expected allowance"); expect(next.authority.basis_digest).not.toEqual(first.authority.basis_digest);
  });
  it("rejects absent, unreadable or malformed live host proof instead of trusting original admission or constructed ALLOW metadata", () => {
    const f=setup(); delete f.port.checkToolAuthority;
    expect(f.toolKernel.assessAgentRunTool(f.request)).toMatchObject({decision:"DENY",reasons:["AGENT_TOOL_HOST_UNAVAILABLE"]});
    f.port.checkToolAuthority=()=>{throw Error("Actual original proof missing");}; expect(f.toolKernel.assessAgentRunTool(f.request)).toMatchObject({decision:"DENY",reasons:["AGENT_TOOL_HOST_PROOF_UNPROVEN"]});
    f.port.checkToolAuthority=()=>({algorithm:"sha256",value:"not-a-digest"}); expect(f.toolKernel.assessAgentRunTool(f.request)).toMatchObject({decision:"DENY",reasons:["AGENT_TOOL_HOST_PROOF_UNPROVEN"]});
  });
  it("rejects Human/missing/foreign trusted callers and request pin substitution before invoking the host", () => {
    const f=setup();
    for(const caller of [undefined,f.humanKernel, { ...f.caller,provider_identity_ref:{...f.caller.provider_identity_ref,locator:"foreign"} }]) {
      const kernel=caller===f.humanKernel?f.humanKernel:new CimiLoopKernel({store:f.store,now:()=>flowTime,runVerifier:f.host,...(caller&&caller!==f.humanKernel?{caller:caller as typeof f.caller}:{})});
      expect(kernel.assessAgentRunTool(f.request)).toMatchObject({decision:"DENY",reasons:["CALLER_IDENTITY_MISMATCH"]});
    }
    for(const fields of [{operation_key:v2.createInternalId()},{context_digest:contentDigest("foreign")},{runtime_binding:{...f.request.runtime_binding,digest:contentDigest("foreign")}},
      {skill_bindings:[]},{host_admission_ref:{...f.request.host_admission_ref,locator:"b".repeat(64)}}]) expect(f.toolKernel.assessAgentRunTool({...f.request,...fields})).toMatchObject({decision:"DENY",reasons:["RUN_BINDING_MISMATCH"]});
    expect(f.live.calls).toBe(0); expect(f.toolKernel.assessAgentRunTool({...f.request,verified:true})).toMatchObject({code:"PROTOCOL_VALIDATION_FAILED"});
    expect(f.toolKernel.assessRunTool(f.request)).toMatchObject({code:"PROTOCOL_VALIDATION_FAILED"});
  });
  it.each(["cancel","revoke","elapsed","pause","approval_ended","settled"])("rechecks current Native facts after %s before permitting another effect", condition => {
    const f=setup(); expect(f.toolKernel.assessAgentRunTool(f.request)).toMatchObject({decision:"ALLOW"});
    if(condition==="cancel")flowSuccess(f.humanKernel.execute(f.humanCommand("CancelRun","run",f.reserved.run.id,{reason:"Stop original Agent"},"technical_owner")));
    if(condition==="revoke")flowSuccess(f.humanKernel.execute(f.humanCommand("RevokeWorkItem","work_item",f.item.id,{reason:"Stop original authority"},"technical_owner")));
    if(condition==="elapsed")f.setToolTime(new Date(Date.parse(flowTime)+60000).toISOString());
    if(condition==="pause")flowSuccess(f.humanKernel.execute({...f.humanCommand("PauseChange","task",f.item.task_id,{reason:"Pause original Change"},"change_owner"),
      target:{object_type:"change",id:f.change.id},expected_revision:f.store.getChange(f.change.id)!.revision}));
    if(condition==="approval_ended") {
      f.grant("project_owner",f.reviewer.id); flowSuccess(f.humanKernel.execute(f.settingsCommand({priority_arbiter_actor_id:f.reviewer.id})));
      const assignment=f.store.listAssignments(f.actor.id).find(value=>value.id===f.runtime.approval!.assignment_ref.id)!;
      flowSuccess(f.humanKernel.execute(f.projectCommand("EndAssignment",{assignment_id:assignment.id,expected_assignment_revision:assignment.revision,reason:"End approval owner"}))); }
    if(condition==="settled")flowSuccess(f.agentObserve(f.reserved.run,"succeeded"));
    expect(f.toolKernel.assessAgentRunTool(f.request)).toMatchObject({decision:"DENY",authority:null}); expect(f.live.calls).toBe(1);
  });
  it.each([[],[{provider:"fixture",resource_type:"path",locator:"src/query.ts",version:"1.0.0"}], [{provider:"cimiloop_workspace",resource_type:"repository_path",locator:"other/**",version:"1.0.0"}],
    [{provider:"cimiloop_workspace",resource_type:"repository_path",locator:"src/**",version:"2.0.0"}]].map(resources=>({resources})))("requires a bounded current Provider workspace grant: %j", ({resources}) => {
    const f=setup(resources as v2.ExternalReference[]); expect(f.toolKernel.assessAgentRunTool(f.request)).toMatchObject({decision:"DENY",reasons:expect.arrayContaining(["TOOL_OUTSIDE_WORK_ITEM_OR_PROVIDER"])}); expect(f.live.calls).toBe(0);
  });
  it("accepts a directory grant but refuses wildcards/metadata/path escapes as tool resources", () => {
    const f=setup([{provider:"cimiloop_workspace",resource_type:"repository_path",locator:"src/**",version:"1.0.0"}]); expect(f.toolKernel.assessAgentRunTool(f.request)).toMatchObject({decision:"ALLOW"});
    for(const resource of ["src/**","src/other.ts","../src/query.ts",".git/config","src/.cimiloop/state"]) expect(f.toolKernel.assessAgentRunTool({...f.request,resource})).toMatchObject({decision:"DENY"}); expect(f.live.calls).toBe(1);
  });
  it("holds parent-only tool access while an original SkillInvocation remains unresolved", () => {
    const root=mkdtempSync(join(tmpdir(),"cimiloop-agent-tool-")); roots.push(root); const f=createSkillInvocationProject(root); stores.push(f.store); f.reserveSkill();
    let calls=0; f.runPort.agent.checkToolAuthority=()=>{calls++;return contentDigest("constructed live host");};
    const kernel=new CimiLoopKernel({store:f.store,caller:f.caller,now:()=>flowTime,runVerifier:f.runPort});
    const request:v2.AgentToolAuthorityRequest={project_id:f.project.id,run_id:f.reserved.run.id,operation_key:f.reserved.record.operation_key,executor_actor_id:f.agent.id,context_digest:f.prepared.context.input_digest,
      action:"read_files",resource:"src/query.ts",...f.pins,host_admission_ref:f.prepared.context.host_admission_ref};
    expect(kernel.assessAgentRunTool(request)).toMatchObject({decision:"DENY",reasons:expect.arrayContaining(["SKILL_TOOL_CONTEXT_UNAVAILABLE"])}); expect(calls).toBe(0);
  });
});
