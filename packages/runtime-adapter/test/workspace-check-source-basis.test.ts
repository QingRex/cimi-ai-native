import {describe,it,expect} from "vitest";
import {digest} from "../src/files.js";
import {resolveWorkspaceCheckSourceBasis} from "../src/workspace-check-source-basis.js";
import {parseWorkspaceCheckRecipe} from "../src/workspace-checks.js";
import {createInternalId} from "@cimiloop/protocol/v2";
import {parseAgentWorkspaceToolScope} from "../src/agent-workspace-authority.js";
const sha=(v:string)=>digest(v).value;
const scope=parseAgentWorkspaceToolScope({project_id:createInternalId(),run_id:createInternalId(),operation_key:createInternalId(),executor_actor_id:createInternalId(),context_digest:digest("context"),skill_bindings:[],
 runtime_binding:{binding_ref:{object_type:"provider_binding",id:createInternalId()},digest:digest("binding")},host_admission_ref:{provider:"local_content",resource_type:"agent_host_admission",locator:sha("admit"),digest:digest("admit")}});
const recipe=()=>parseWorkspaceCheckRecipe({check_id:"fixed",profile:"node_test",entry:"src/check.mjs",inputs:[{path:"src/check.mjs",expected_digest:sha("harness")},{path:"src/query.ts",expected_digest:sha("before")}],
 max_elapsed_ms:4000,max_output_bytes:32768,source_policy:"original_run_edits/1.0.0",editable_inputs:["src/query.ts"]},scope);
const call=(id:string,before:string,after:string,path="src/query.ts",state="completed")=>({input:{call_id:id,tool:"replace_file",path,expected_digest:sha(before)},state,
 receipt:state==="completed"?{call_id:id,native:{before_digest:sha(before),after_digest:sha(after)}}:null}) as any;
describe("check source basis from independently read original Run writes",()=>{
 it("uses an unordered unique original write chain and preserves the pinned harness",()=>{
  const basis=resolveWorkspaceCheckSourceBasis(recipe(),[call("second","middle","after"),call("first","before","middle")]);
  expect(basis.sources).toEqual([{path:"src/check.mjs",digest:sha("harness")},{path:"src/query.ts",digest:sha("after")}]);
  expect(basis.original_file_calls.map(c=>c.call_id)).toEqual(["first","second"]);
 });
 it("retains the original baseline when no source was edited",()=>expect(resolveWorkspaceCheckSourceBasis(recipe(),[]).sources[1]!.digest).toBe(sha("before")));
 it.each(["unknown","executing","reserved"])("refuses an unresolved original write: %s",state=>{
  expect(()=>resolveWorkspaceCheckSourceBasis(recipe(),[call("pending","before","after","src/query.ts",state)])).toThrow("workspace_check_source_unproven");
 });
 it("refuses foreign baselines, branches, cycles, duplicate identities and harness edits",()=>{
  for(const calls of [[call("foreign","elsewhere","after")],[call("a","before","x"),call("b","before","y")],
   [call("a","before","middle"),call("b","middle","before")],[call("a","before","middle"),call("a","middle","after")],
   [call("harness","harness","changed","src/check.mjs")]])
   expect(()=>resolveWorkspaceCheckSourceBasis(recipe(),calls)).toThrow("workspace_check_source_unproven");
 });
 it("does not hide Windows case aliases, cycles or fixed harness writes",()=>{
  for(const calls of [[call("a","before","middle","src/QUERY.ts"),call("b","middle","before","src/query.ts")],
   [call("a","harness","changed","src/CHECK.mjs"),call("b","changed","harness","src/check.mjs")]])
   expect(()=>resolveWorkspaceCheckSourceBasis(recipe(),calls)).toThrow("workspace_check_source_unproven");
  expect(resolveWorkspaceCheckSourceBasis(recipe(),[call("a","before","after","src/QUERY.ts")]).sources[1]!.digest).toBe(sha("after"));
 });
 it("rejects an editable entry, unknown policy and undeclared source",()=>{
  for(const patch of [{editable_inputs:["src/check.mjs"]},{source_policy:"latest_disk"},{editable_inputs:["src/other.ts"]},{editable_inputs:["SRC/QUERY.TS"]}])
   expect(()=>parseWorkspaceCheckRecipe({...recipe(),...patch},scope)).toThrow();
 });
});