import {afterEach,describe,expect,it,vi} from "vitest";
const execute=vi.hoisted(()=>vi.fn());
vi.mock("node:child_process",()=>({execFile:execute}));
import {nativeControl} from "../src/native.js";
import {ExecutionLifetime} from "../src/execution-lifetime.js";
describe("bounded original Native control failure",()=>{
 afterEach(()=>vi.restoreAllMocks());
 it("retains failure class without arguments, environment, stdout or stderr",async()=>{
  execute.mockImplementation((_file,_args,_options,callback)=>callback(Object.assign(Error("secret argv"),{code:2,killed:false,signal:null,stdout:Buffer.from("secret reply"),stderr:Buffer.from("secret key")}),Buffer.alloc(0),Buffer.alloc(0)));
  let failure:any;try{await nativeControl("missing-helper.exe",["secret request"]);}catch(error){failure=error;}
  expect(failure).toMatchObject({reason:"native_control_unavailable",controlFailure:{format:"cimiloop/native-control-failure/1.0.0",kind:"exit",exit_code:2,signal:null}});
  expect(JSON.stringify(failure.controlFailure)).not.toContain("secret");
  const lifetime=new ExecutionLifetime(10000);try{
   lifetime.stop("native_control_unavailable",failure);lifetime.stop("workspace_rehearsal_ended_before_resume");
   expect(lifetime.interruptionReason).toBe("native_control_unavailable");expect(lifetime.interruptionFailure).toEqual(failure.controlFailure);
  }finally{lifetime.dispose();}
 });
 it("preserves the original callback error in memory without serializing its contents",async()=>{
  const lifetime=new ExecutionLifetime(10000),original=Error("private original callback"),pending=lifetime.wait(new Promise<void>(()=>{}));
  try{lifetime.stop("workspace_rehearsal_preparation_failed",original);await expect(pending).rejects.toBe(original);expect(()=>lifetime.check()).toThrow(original);expect(lifetime.interruptionFailure).toBeNull();}finally{lifetime.dispose();}
 });
 it("distinguishes bounded output rejection from a missing executable",async()=>{
  execute.mockImplementation((_file,_args,_options,callback)=>callback(Object.assign(Error("private output"),{code:"ERR_CHILD_PROCESS_STDIO_MAXBUFFER",stdout:Buffer.from("private output")}),Buffer.alloc(0),Buffer.alloc(0)));
  await expect(nativeControl("missing-helper.exe",[])).rejects.toMatchObject({controlFailure:{kind:"invalid_output",exit_code:null}});
 });
 it("keeps a legacy nonzero structured denial but rejects it if the helper was terminated",async()=>{
  const stdout=Buffer.from('{"state":"unknown"}');
  execute.mockImplementation((_file,_args,_options,callback)=>callback(Object.assign(Error("private"),{code:2,stdout}),Buffer.alloc(0),Buffer.alloc(0)));
  await expect(nativeControl("missing-helper.exe",[])).resolves.toMatchObject({value:{state:"unknown"}});
  execute.mockImplementation((_file,_args,_options,callback)=>callback(Object.assign(Error("private"),{code:2,killed:true,stdout}),Buffer.alloc(0),Buffer.alloc(0)));
  await expect(nativeControl("missing-helper.exe",[])).rejects.toMatchObject({controlFailure:{kind:"terminated"}});
 });
 it("does not launch any helper for an already cancelled call",async()=>{
  execute.mockClear();const stop=new AbortController();stop.abort();
  await expect(nativeControl("missing-helper.exe",[],stop.signal)).rejects.toMatchObject({controlFailure:{kind:"aborted"}});expect(execute).not.toHaveBeenCalled();
 });
 it("retains a timeout independently of a later EOF without interpreting it as completion",async()=>{
  execute.mockImplementation((_file,_args,_options,callback)=>callback(Object.assign(Error("secret"),{code:null,killed:true,signal:"SIGTERM",stdout:Buffer.alloc(0)}),Buffer.alloc(0),Buffer.alloc(0)));
  await expect(nativeControl("missing-helper.exe",[])).rejects.toMatchObject({controlFailure:{kind:"terminated",exit_code:null,signal:"SIGTERM"}});
 });
});