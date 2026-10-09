import {describe,expect,it,vi} from "vitest";
import {nativeControl} from "../src/native.js";
vi.setConfig({testTimeout:45000});
// Actual Windows termination, no AppContainer, workspace effects or model calls.
describe.runIf(process.platform==="win32")("original Native control deadline on Windows",()=>{
 it("rejects valid JSON from a helper stopped by its own 15-second deadline",async()=>{
  await expect(nativeControl(process.execPath,["-e","process.stdout.write(JSON.stringify({state:'active'}));setInterval(()=>{},1000)"])).rejects.toMatchObject({reason:"native_control_unavailable",controlFailure:{kind:"deadline"}});
 });
 it("rejects valid JSON buffered before external cancellation",async()=>{
  const stop=new AbortController(),timer=setTimeout(()=>stop.abort(),3000);
  try{await expect(nativeControl(process.execPath,["-e","process.stdout.write(JSON.stringify({state:'active'}));setInterval(()=>{},1000)"],stop.signal)).rejects.toMatchObject({reason:"native_control_unavailable",controlFailure:{kind:"aborted"}});}finally{clearTimeout(timer);}
 });
});