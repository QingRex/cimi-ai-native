import {mkdirSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {assertAgentRuntimeNativeRoot} from '../../packages/runtime-adapter/src/native.js';

// A new retained repository belongs to this test only. The production CLR
// path guard is applied before any Native preparation; never alias or relocate
// an earlier failed operation to make its original resource appear recovered.
export function createNativeFixtureRepository():string {
 const parent=process.env.CIMILOOP_NATIVE_TEST_ROOT??(process.env.LOCALAPPDATA?join(process.env.LOCALAPPDATA,'CimiS1'):undefined);
 if(!parent)throw Error('Configured short Native test root unavailable');
 mkdirSync(parent,{recursive:true});const repository=mkdtempSync(join(parent,'_'));
 const id='00000000-0000-7000-8000-000000000000';
 assertAgentRuntimeNativeRoot(join(repository,'.git','cimiloop','skill-runtime-originals',id,id));
 return repository;
}
