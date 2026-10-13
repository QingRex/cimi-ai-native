import {PassThrough} from 'node:stream';import {EventEmitter} from 'node:events';import {afterEach,describe,expect,it,vi} from 'vitest';
const mocked=vi.hoisted(()=>({spawn:vi.fn(),bytes:vi.fn()}));vi.mock('node:child_process',async original=>({...await original<any>(),spawn:mocked.spawn}));vi.mock('../src/files.js',async original=>({...await original<any>(),bytesAt:mocked.bytes}));
import {NativeAgentRunClockChannel} from '../src/agent-run-clock-channel.js';import {digest} from '../src/files.js';
const reading={format:'cimiloop/agent-run-clock/1.0.0' as const,utc:'2026-10-09T00:00:00.000Z',boot_utc:'2026-10-08T00:00:00.000Z',uptime_ms:86400000,machine_digest:'a'.repeat(64)};
function setup(){const child=Object.assign(new EventEmitter(),{pid:123,exitCode:null as number|null,signalCode:null,stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()});child.stdin.once('finish',()=>{child.exitCode=0;child.emit('close',0,null);});child.kill.mockImplementation(()=>{child.exitCode=0;child.emit('close',0,null);return true;});mocked.spawn.mockReturnValue(child);mocked.bytes.mockReturnValue(Buffer.from('pinned'));
 const pending=NativeAgentRunClockChannel.open('fixed.exe',digest('pinned').value,raw=>raw as typeof reading);const config=JSON.parse(String(child.stdin.read()));child.stdout.write(JSON.stringify({format:'cimiloop/agent-run-clock-channel/1.0.0',nonce:config.nonce,owner_pid:process.pid,owner_creation_ticks:'1',reading})+'\n');return {child,config,pending,reply(sequence:number,nonce=config.nonce){child.stdout.write(JSON.stringify({format:'cimiloop/agent-run-clock-reply/1.0.0',nonce,sequence,reading:{...reading,uptime_ms:reading.uptime_ms+sequence}})+'\n');}};}
describe('same held Native clock channel',()=>{
 afterEach(()=>vi.useRealTimers());
 it('serializes fresh original reads in one process and closes explicitly',async()=>{const f=setup(),clock=await f.pending;try{const first=clock.read(),second=clock.read();await Promise.resolve();await Promise.resolve();expect(mocked.spawn).toHaveBeenCalled();f.reply(1);expect((await first).uptime_ms).toBe(reading.uptime_ms+1);await Promise.resolve();await Promise.resolve();f.reply(2);expect((await second).uptime_ms).toBe(reading.uptime_ms+2);expect(clock.snapshot()).toMatchObject({pid:123,requests_sent:2,replies_validated:2});}finally{await clock.close();}expect(clock.snapshot().process_exited).toBe(true);});
 it('rejects wrong response identity without starting another helper',async()=>{const f=setup(),clock=await f.pending;const pending=clock.read(),rejected=expect(pending).rejects.toThrow('agent_run_clock_channel_unproven');await Promise.resolve();await Promise.resolve();f.reply(1,'wrong');await rejected;await clock.close();});
 it('consumes a cancelled original read before sending the next request',async()=>{const f=setup(),clock=await f.pending,stop=new AbortController();try{const first=clock.read(stop.signal),rejected=expect(first).rejects.toThrow('agent_run_clock_channel_aborted');await Promise.resolve();await Promise.resolve();stop.abort();await rejected;const second=clock.read();f.reply(1);await vi.waitFor(()=>expect(clock.snapshot().requests_sent).toBe(2));f.reply(2);expect((await second).uptime_ms).toBe(reading.uptime_ms+2);}finally{await clock.close();}});
 it('charges queue waiting to the original deadline instead of allowing two fourteen-second reads',async()=>{
  vi.useFakeTimers();const f=setup(),clock=await f.pending,first=clock.read(),second=clock.read();
  const rejected=expect(second).rejects.toMatchObject({reason:'native_control_unavailable',controlFailure:{kind:'deadline',operation:'clock_continuous'}});
  await vi.advanceTimersByTimeAsync(14000);f.reply(1);await first;await vi.advanceTimersByTimeAsync(0);
  expect(clock.snapshot().requests_sent).toBe(2);await vi.advanceTimersByTimeAsync(1000);await rejected;await clock.close();
 });
 it('rejects a changed pinned helper before the next fresh read and closes the original process',async()=>{
  const f=setup(),clock=await f.pending;mocked.bytes.mockReturnValue(Buffer.from('changed'));
  await expect(clock.read()).rejects.toThrow('agent_run_clock_channel_unproven');await clock.close();
  expect(clock.snapshot()).toMatchObject({requests_sent:0,process_exited:true});
 });
 it('keeps the hard read deadline and refuses reuse after loss',async()=>{vi.useFakeTimers();const f=setup(),clock=await f.pending;const pending=clock.read(),rejected=expect(pending).rejects.toMatchObject({reason:'native_control_unavailable',controlFailure:{kind:'deadline',operation:'clock_continuous'}});await Promise.resolve();await Promise.resolve();await vi.advanceTimersByTimeAsync(15000);await rejected;await clock.close();await expect(clock.read()).rejects.toThrow();});
});
describe('host-to-Worker queue age retains the original control deadline',()=>{
 afterEach(()=>vi.useRealTimers());
 it('terminates a sent original read five seconds after a ten-second transport wait',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});const f=setup(),clock=await f.pending;
  try{await vi.advanceTimersByTimeAsync(10000);let failure:unknown;const pending=clock.read(undefined,0).catch(error=>{failure=error;});
   await vi.advanceTimersByTimeAsync(0);expect(clock.snapshot().requests_sent).toBe(1);await vi.advanceTimersByTimeAsync(5000);
   expect(failure).toMatchObject({reason:'native_control_unavailable',controlFailure:{kind:'deadline',operation:'clock_continuous',duration_ms:15000}});await pending;
   expect(clock.snapshot()).toMatchObject({requests_sent:1,process_exited:true,closed:true});
  }finally{await clock.close();}
 });
});
