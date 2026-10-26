import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {expect,it} from 'vitest';
import {createFlowProject,flowSuccess} from '../fixtures/flow-project.js';import {createProviderProbe} from '../fixtures/provider-probe.js';
import {CimiLoopKernel} from '../../packages/kernel/src/index.js';

it('authorizes the Human owner to test a fixed Runtime candidate before any Binding exists, without creating business objects',()=>{
 const root=mkdtempSync(join(tmpdir(),'cimiloop-runtime-contract-authority-')),f=createFlowProject(root),p=createProviderProbe(root,root);
 try{const kernel=new CimiLoopKernel({store:f.store,caller:f.caller}),result=flowSuccess(kernel.execute(f.projectCommand('RegisterProvider',p.registration)));if(result.command_type!=='RegisterProvider')throw Error('Descriptor expected');
  const authorize=Reflect.get(kernel,'authorizeRuntimeContractProbe');expect(authorize).toBeTypeOf('function');const before=f.store.listEvents().length;
  expect(authorize.call(kernel,result.data.descriptor.id)).toMatchObject({ok:true,project_id:f.project.id,actor_id:f.actor.id,boundary:'fixed_runtime_contract',descriptor:result.data.descriptor});
  expect(f.store.listProviderBindings()).toEqual([]);expect(f.store.listEvents()).toHaveLength(before);
 }finally{f.store.close();}
});
