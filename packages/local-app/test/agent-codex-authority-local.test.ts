import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CimiLoopKernel } from '@cimiloop/kernel';
import { digest, type CodexAgentModelAuthority } from '@cimiloop/runtime-adapter';
import * as Public from '../src/index.js';
import { originalAgentWorkspaceScope } from '../src/agent-workspace-tools-local.js';
import { createAgentRunProject } from '../../../tests/fixtures/agent-run-project.js';
import { flowSuccess, flowTime } from '../../../tests/fixtures/flow-project.js';

vi.setConfig({testTimeout:120000});
// Actual Kernel/SQLite authority transitions; PUBLIC qualification/host proof.
// No model, Native, account billing, physical quota or S1 acceptance.
const close:(()=>void)[]=[];afterEach(()=>{while(close.length)close.pop()!();});
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'cimiloop-codex-authority-')),f=createAgentRunProject(root);close.push(()=>f.store.close());
 f.runPort.agent.checkModelAuthority=()=>digest('PUBLIC independent host proof');
 const run=f.reserveAgent(f.prepareAgent()).run,kernel=new CimiLoopKernel({store:f.store,caller:f.caller,now:()=>flowTime,runVerifier:f.runPort});
 const local={store:f.store,caller:structuredClone(f.caller),kernel,location:{repositoryKind:'git' as const,repositoryPath:root,dataDirectory:dirname(f.path),databasePath:f.path,instancePath:join(dirname(f.path),'instance.json'),suggestedName:'PUBLIC Codex current authority'}};
 const scope=originalAgentWorkspaceScope(local,run.id),factory=()=>{const Class=Reflect.get(Public,'LocalAgentCodexModelAuthority');expect(Class).toBeTypeOf('function');return Reflect.apply(Class.open,Class,[local,run.id]) as CodexAgentModelAuthority;};
 const cancel=()=>flowSuccess(f.humanKernel.execute(f.humanCommand('CancelRun','run',run.id,{reason:'PUBLIC current authority revoked'},'technical_owner')));
 return{f,local,scope,factory,cancel};
}
describe('Kernel-owned Codex model authority',()=>{
 it('reads current original model authority without changing Kernel state',async()=>{const f=fixture(),authority=f.factory(),before=f.f.store.asOfEventSequence();await authority.check(f.scope);authority.beforeEffect(f.scope);expect(f.f.store.asOfEventSequence()).toBe(before);});
 it('refuses cancellation between an earlier check and the actual effect',async()=>{const f=fixture(),authority=f.factory();await authority.check(f.scope);f.cancel();expect(()=>authority.beforeEffect(f.scope)).toThrow();await expect(authority.check(f.scope)).rejects.toThrow();});
 it('refuses a foreign frozen operation',async()=>{const f=fixture(),authority=f.factory(),foreign={...f.scope,context_digest:digest('PUBLIC other context')};await expect(authority.check(foreign)).rejects.toThrow();expect(()=>authority.beforeEffect(foreign)).toThrow();});
 it.each(['kernel','method','caller','location'] as const)('refuses %s identity replacement without calling a substitute ALLOW',async mode=>{const f=fixture(),authority=f.factory(),allowed=f.local.kernel.assessAgentRunModel(f.scope);expect(allowed).toMatchObject({decision:'ALLOW'});let substituted=0;const fake=()=>{substituted++;return allowed;};f.cancel();if(mode==='kernel')Reflect.set(f.local,'kernel',{assessAgentRunModel:fake});if(mode==='method')Reflect.set(f.local.kernel,'assessAgentRunModel',fake);if(mode==='caller')f.local.caller.actor_id=f.f.actor.id;if(mode==='location')f.local.location.dataDirectory=join(f.local.location.dataDirectory,'other');await expect(authority.check(f.scope)).rejects.toThrow();expect(()=>authority.beforeEffect(f.scope)).toThrow();expect(substituted).toBe(0);});
 it('requires the independent model proof rather than a launch-only permission',async()=>{const f=fixture(),authority=f.factory();delete f.f.runPort.agent.checkModelAuthority;await expect(authority.check(f.scope)).rejects.toThrow();expect(()=>authority.beforeEffect(f.scope)).toThrow();});
});
