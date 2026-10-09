import {afterEach,describe,it,expect,vi} from "vitest";
const execute=vi.hoisted(()=>vi.fn());
vi.mock("node:child_process",()=>({execFile:execute}));
import {compileOriginalAgentSandbox} from "../src/native.js";
// Constructed compiler callbacks test late Windows code0; not Native proof.
describe("original controller compile stop",()=>{
 afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();execute.mockReset();});
 it("rejects success after external cancellation",async()=>{
  const stop=new AbortController();execute.mockImplementation((_file,_args,options,callback)=>{stop.abort();expect(options.signal.aborted).toBe(true);callback(null,"valid output already written","");});
  await expect(compileOriginalAgentSandbox("constructed.exe",[],stop.signal)).rejects.toThrow("agent_sandbox_build_failed");
 });
 it("rejects late success even if a blocked event loop has not delivered the timer",async()=>{
  let calls=0;vi.spyOn(performance,"now").mockImplementation(()=>++calls===1?0:30000);
  execute.mockImplementation((_file,_args,_options,callback)=>callback(null,"valid output already written",""));
  await expect(compileOriginalAgentSandbox("constructed.exe",[])).rejects.toThrow("agent_sandbox_build_failed");
 });
 it("does not start a compiler for an already stopped request",async()=>{
  const stop=new AbortController();stop.abort();await expect(compileOriginalAgentSandbox("constructed.exe",[],stop.signal)).rejects.toThrow();expect(execute).not.toHaveBeenCalled();
 });
 it("rejects a successful callback after its own stop timer",async()=>{
  vi.useFakeTimers();execute.mockImplementation((_file,_args,options,callback)=>{options.signal.addEventListener("abort",()=>callback(null,"valid output already written",""));});
  const pending=expect(compileOriginalAgentSandbox("constructed.exe",[])).rejects.toThrow("agent_sandbox_build_failed");await vi.advanceTimersByTimeAsync(30000);await pending;
 });
});
