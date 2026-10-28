import {Socket} from 'node:net';
import {performance} from 'node:perf_hooks';
import {parseLoopbackModelEndpoint} from './connection.js';
import {RuntimeAdapterError} from './files.js';

export interface LoopbackGatewayConnection {
 readonly socket:Socket;
 readonly observation:Readonly<{format:'cimiloop/loopback-http-peer/1.0.0';peer_address:'127.0.0.1';peer_port:number}>;
}
// A distinct local transport, never a public DNS/TLS pin or certificate proof.
// HTTP gets one live TCP socket to the exact configured numeric endpoint.
export class LoopbackGatewayNetworkBoundary {
 readonly host='127.0.0.1';readonly path='/v1/chat/completions';readonly port:number;
 readonly #connections=new WeakMap<LoopbackGatewayConnection,{expires:number;consumed:boolean;written:number}>();
 constructor(endpoint:string){const url=parseLoopbackModelEndpoint(endpoint);this.port=Number(url.port);Object.freeze(this);}
 connect(deadlineMs=8000,signal?:AbortSignal):Promise<LoopbackGatewayConnection>{
  if(!Number.isSafeInteger(deadlineMs)||deadlineMs<25||deadlineMs>30000)return Promise.reject(new RuntimeAdapterError('invalid_gateway_network_deadline'));
  if(signal?.aborted)return Promise.reject(new RuntimeAdapterError('gateway_network_aborted'));
  return new Promise((resolve,reject)=>{
   const socket=new Socket(),started=performance.now();let settled=false;
   const finish=(reason?:string)=>{
    if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);
    if(reason){socket.destroy();reject(new RuntimeAdapterError(reason));return;}
    const connection=Object.freeze({socket,observation:Object.freeze({format:'cimiloop/loopback-http-peer/1.0.0' as const,peer_address:'127.0.0.1' as const,peer_port:this.port})});
    this.#connections.set(connection,{expires:started+30000,consumed:false,written:socket.bytesWritten});resolve(connection);
   };
   const cancel=()=>finish('gateway_network_aborted'),timer=setTimeout(()=>finish('gateway_loopback_deadline_exhausted'),deadlineMs);
   signal?.addEventListener('abort',cancel,{once:true});
   socket.on('error',()=>finish('gateway_loopback_peer_unproven'));socket.once('close',()=>finish('gateway_loopback_peer_unproven'));
   socket.once('connect',()=>{if(socket.remoteAddress!=='127.0.0.1'||socket.remotePort!==this.port||socket.localAddress!=='127.0.0.1')finish('gateway_loopback_peer_unproven');else finish();});
   try{socket.connect({host:this.host,port:this.port,family:4});if(signal?.aborted)cancel();}catch{finish('gateway_loopback_peer_unproven');}
  });
 }
 consumeHttpConnection(connection:LoopbackGatewayConnection):Socket{
  const original=this.#connections.get(connection);if(!original||original.consumed)throw new RuntimeAdapterError('gateway_loopback_connection_unowned');original.consumed=true;
  const socket=connection.socket;
  if(performance.now()>=original.expires||socket.destroyed||socket.writableEnded||socket.readableEnded||!socket.writable||socket.remoteAddress!==this.host||socket.remotePort!==this.port||socket.localAddress!==this.host||socket.bytesWritten!==original.written||socket.readableLength!==0){socket.destroy();throw new RuntimeAdapterError('gateway_loopback_connection_changed');}
  return socket;
 }
}
