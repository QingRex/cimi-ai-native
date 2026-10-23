import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isDeepStrictEqual as same } from 'node:util';
import { resolve, parse } from 'node:path';
import { assertOrdinaryPath, digest, RuntimeAdapterError } from './files.js';
import { parseGatewayJson } from './gateway-conversation.js';
import { isolatedEnvironment, buildWindowsFixedVolumeReader } from './native.js';
import { readRuntimeBinaryOriginal } from './runtime-binary-originals.js';
import { AgentStartLedger, type AgentStartTicket } from './agent-start-ledger.js';

function fail():never{throw new RuntimeAdapterError('fixed_volume_original_unproven');}
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const bounded=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=9*1024**3;
function argumentsChecked(image:string,root:string,maximum:number){if(!/^[A-Za-z]:[\\/]/.test(image)||!/^([D-Z]):\\$/i.test(root)||!bounded(maximum)||maximum<64*1024**2||maximum>8*1024**3||maximum%(1024**2)!==0)fail();return{image:resolve(image),root:root.toUpperCase(),maximum};}
export interface FixedVolumeObservation {format:'cimiloop/fixed-volume-os-observation/1.0.0';image_path:string;volume_root:string;image_identity:{volume:string;index:string;created:string};virtual_disk_id:string;volume_id:string;volume_serial:string;virtual_bytes:number;volume_bytes:number;physical_bytes:number;provider_subtype:2;filesystem:'NTFS';physical_device:string;extent_bytes:number}
export function parseFixedVolumeObservation(raw:unknown,image:string,root:string,maximum:number):FixedVolumeObservation{
 const args=argumentsChecked(image,root,maximum),v=raw;
 if(!exact(v,['format','image_path','volume_root','image_identity','virtual_disk_id','volume_id','volume_serial','virtual_bytes','volume_bytes','physical_bytes','provider_subtype','filesystem','physical_device','extent_bytes'])||v.format!=='cimiloop/fixed-volume-os-observation/1.0.0'||v.image_path!==args.image||v.volume_root!==args.root||v.virtual_bytes!==maximum||v.provider_subtype!==2||v.filesystem!=='NTFS'||!exact(v.image_identity,['volume','index','created'])||Object.values(v.image_identity).some(n=>typeof n!=='string'||!/^\d{1,20}$/.test(n))||BigInt(String(v.image_identity.index))===0n||BigInt(String(v.image_identity.created))===0n||typeof v.virtual_disk_id!=='string'||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v.virtual_disk_id)||v.virtual_disk_id==='00000000-0000-0000-0000-000000000000'||typeof v.volume_id!=='string'||!/^\\\\\?\\Volume\{[a-f0-9-]{36}\}\\$/i.test(v.volume_id)||typeof v.volume_serial!=='string'||!/^\d{1,10}$/.test(v.volume_serial)||typeof v.physical_device!=='string'||!/^\\\\\.\\PhysicalDrive\d+$/.test(v.physical_device)||![v.volume_bytes,v.physical_bytes,v.extent_bytes].every(bounded)||Number(v.volume_bytes)>Number(v.extent_bytes)||Number(v.extent_bytes)>maximum||Number(v.physical_bytes)<maximum||Number(v.physical_bytes)>maximum+64*1024**2)fail();
 return structuredClone(v) as unknown as FixedVolumeObservation;
}
type Reader=(image:string,root:string,maximum:number)=>FixedVolumeObservation;
const readers=new WeakSet<Reader>();
export async function openWindowsFixedVolumeReader(toolsRoot:string):Promise<Reader>{
 const retained=await buildWindowsFixedVolumeReader(toolsRoot),original=structuredClone(retained.original);
 const verify=()=>{if(['.config','.local','.manifest'].some(suffix=>existsSync(retained.path+suffix))||!same(readRuntimeBinaryOriginal(toolsRoot,retained.path,retained.digest.value),original))fail();};
 const reader:Reader=(image,root,maximum)=>{try{const args=argumentsChecked(image,root,maximum);verify();const output=execFileSync(retained.path,[args.image,args.root,String(maximum)],{windowsHide:true,timeout:15000,maxBuffer:16384,encoding:'utf8',env:isolatedEnvironment(),stdio:['ignore','pipe','pipe']});verify();return parseFixedVolumeObservation(parseGatewayJson(output,16384),args.image,args.root,maximum);}catch{fail();}};
 readers.add(reader);return Object.freeze(reader);
}
const core=({physical_device:_,...value}:FixedVolumeObservation)=>value;
const policyKey=(root:string)=>digest(root.toUpperCase()).value;
// Volume evidence does not prove placement of every Runtime writable path.
export class FixedVolumeQuota {
 private constructor(private readonly origin:AgentStartLedger,private readonly reader:Reader,private readonly ticket:AgentStartTicket,private readonly original:ReturnType<typeof core>){if(!(origin instanceof AgentStartLedger)||!readers.has(reader)||!same(origin.readExclusive('fixed_volume_quota',policyKey(original.volume_root)),{ticket,basis:{format:'cimiloop/fixed-volume-policy/1.0.0',original}}))fail();Object.freeze(ticket);Object.freeze(original.image_identity);Object.freeze(original);Object.freeze(this);}
 static initialize(origin:AgentStartLedger,reader:Reader,input:{image:string;volume_root:string;maximum_bytes:number}){
  if(!(origin instanceof AgentStartLedger)||!readers.has(reader))fail();const args=argumentsChecked(input.image,input.volume_root,input.maximum_bytes),observed=reader(args.image,args.root,args.maximum);
  origin.issueExclusive('fixed_volume_quota',policyKey(args.root),{format:'cimiloop/fixed-volume-policy/1.0.0',original:core(observed)});return this.open(origin,reader,args.root);
 }
 static open(origin:AgentStartLedger,reader:Reader,root:string){
  if(!(origin instanceof AgentStartLedger)||!readers.has(reader)||!/^[D-Z]:\\$/i.test(root))fail();const row=origin.readExclusive('fixed_volume_quota',policyKey(root)),body=row?.basis;
  if(!row||!exact(body,['format','original'])||body.format!=='cimiloop/fixed-volume-policy/1.0.0'||!body.original||typeof body.original!=='object')fail();
  const original=body.original as ReturnType<typeof core>;if(original.volume_root!==root.toUpperCase())fail();const current=reader(original.image_path,original.volume_root,original.virtual_bytes);if(!same(core(current),original)||!same(origin.readExclusive('fixed_volume_quota',policyKey(root)),row))fail();
  return new FixedVolumeQuota(origin,reader,row.ticket,structuredClone(original));
 }
 read(){const row=this.origin.readTicket(this.ticket),observed=this.reader(this.original.image_path,this.original.volume_root,this.original.virtual_bytes);if(!same(core(observed),this.original)||!same(this.origin.readTicket(this.ticket),row))fail();return{format:'cimiloop/fixed-volume-proof/1.0.0' as const,status:'Verified' as const,maximum_bytes:this.original.virtual_bytes,observation:observed,policy_ticket:structuredClone(this.ticket),runtime_scope_proven:false as const};}
 assertPath(path:string){const canonical=assertOrdinaryPath(path);if(parse(canonical).root.toUpperCase()!==this.original.volume_root)fail();const proof=this.read();if(assertOrdinaryPath(path)!==canonical)fail();return proof;}
}
