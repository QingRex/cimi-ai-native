// Fixed PUBLIC boundary program. No model, credential or application input.
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createConnection} from 'node:net';
import {join} from 'node:path';

const [workspace,protectedFile,mode,rawPort]=process.argv.slice(1),port=Number(rawPort);
if(!workspace||!protectedFile||!['read','write'].includes(mode)||!Number.isInteger(port)||port<1||port>65535)process.exit(2);
const denied=effect=>{try{effect();return false;}catch(error){if(error?.code==='EACCES'||error?.code==='EPERM')return true;throw error;}};
const outside_read_denied=denied(()=>readFileSync(protectedFile));
const outside_write_denied=denied(()=>writeFileSync(protectedFile,'forbidden'));
let inside_readable=false;try{inside_readable=readFileSync(join(workspace,'input.txt'),'utf8')==='visible';}catch{}
const inside_writable=!denied(()=>writeFileSync(join(workspace,'output.txt'),'inside'));
const child=spawnSync(process.execPath,['-e','process.exit(0)'],{windowsHide:true,timeout:1000,stdio:'ignore'}),subprocess_denied=!!child.error;
const loopback_denied=await new Promise(resolve=>{const socket=createConnection({host:'127.0.0.1',port});let settled=false;const done=value=>{if(settled)return;settled=true;socket.destroy();resolve(value);};socket.setTimeout(1500,()=>done(true));socket.once('connect',()=>done(false));socket.once('error',error=>done(error.code==='EACCES'||error.code==='EPERM'));});
const shared=process.env.CIMILOOP_SHARED_PACKAGE_CANARY,expectedDenied=process.env.CIMILOOP_SHARED_PACKAGE_POLICY==='deny';
const sharedDenied=!!shared&&denied(()=>appendFileSync(shared,'forbidden'));
console.log(JSON.stringify({event:'sandbox.canary',outside_read_denied,outside_write_denied,subprocess_denied,inside_readable,inside_writable,loopback_denied}));
console.log(JSON.stringify({event_type:'sandbox.shared_package_canary',write_denied:sharedDenied}));
process.exit(outside_read_denied&&outside_write_denied&&subprocess_denied&&inside_readable&&inside_writable===(mode==='write')&&loopback_denied&&sharedDenied===expectedDenied?0:10);
