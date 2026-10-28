import {existsSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {IsolatedProbeAdapter,validateOperationRequest,type ProbeDriver,type ProbeOperationInput} from '../src/operations.js';
import {modelEndpoint,type DedicatedModelConnection} from '../src/connection.js';
import {digest} from '../src/files.js';

function fixture(){
 const root=mkdtempSync(join(tmpdir(),'cimiloop-loopback-denial-'));
 const connection:DedicatedModelConnection={format:'cimiloop/dedicated-model/2.0.0',provider:'openai-compatible',transport:'loopback_http/1.0.0',endpoint:'http://127.0.0.1:3425/v1/chat/completions',model:'openai-compatible/codex/gpt-6-luna',credential_file:join(root,'absent-credential.json'),credential_digest:digest('PUBLIC ciphertext')};
 const driver:ProbeDriver={kind:'opencode',model:connection.model,connection,launcher:join(root,'absent-launcher.exe'),binary:join(root,'absent-client.exe'),binary_digest:digest('PUBLIC client')};
 const input:ProbeOperationInput={scope:'isolated_provider_probe',operation_key:'PUBLIC_original',mode:'read',files:[{path:'input.txt',content:'PUBLIC'}],prompt:'PUBLIC check',max_elapsed_ms:1000};
 return{root,connection,driver,input};
}
it('refuses the local connection in the legacy Native endpoint projection',()=>{
 expect(()=>modelEndpoint(fixture().connection)).toThrow('loopback_connection_requires_managed_agent');
});
it('rejects local Native start before creating an original operation or reading a credential or program',async()=>{
 const f=fixture(),adapter=new IsolatedProbeAdapter(join(f.root,'runtime'),f.driver);
 await expect(adapter.start(f.input)).rejects.toThrow('loopback_connection_requires_managed_agent');
 expect(existsSync(join(adapter.root,'operations'))).toBe(false);
});
it('rejects a persisted local Native request before supervisor launch or credential access',()=>{
 const f=fixture(),request={input:f.input,driver:f.driver,input_digest:digest(JSON.stringify({input:f.input,driver:f.driver})),nonce:'PUBLIC_nonce'};
 expect(()=>validateOperationRequest(request)).toThrow('loopback_connection_requires_managed_agent');
});
