import type { IncomingMessage } from 'node:http';import type { Duplex } from 'node:stream';import WebSocket,{WebSocketServer} from 'ws';import{sign,randomUUID}from'node:crypto';
import {PairingError,object,parsePeer,canonicalProof,verifyIdentityProof,type PeerIdentity,type TlsIdentity,type Clock,type RandomBytes,type SafeLogger,type PairingConfig} from './protocol.js';import type { TrustRepository } from './trust-repository.js';import type { ConnectionManager,DeviceChannel } from './connection-manager.js';
export interface DeviceContext { config:PairingConfig;identity:TlsIdentity;repository:TrustRepository;manager:ConnectionManager;clock:Clock;random:RandomBytes;log:SafeLogger }
export function safeSend(ws:WebSocket,event:unknown):void{if(ws.readyState===WebSocket.OPEN)try{ws.send(JSON.stringify(event));}catch{ws.terminate();}}
export function rejectUpgrade(socket:Duplex,status:number):void{socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);}
export function createDeviceBroker(context:DeviceContext):{upgrade(req:IncomingMessage,socket:Duplex,head:Buffer):void;accept(ws:WebSocket):void;close():Promise<void>}{
 const {manager,clock,identity,random}=context,wss=new WebSocketServer({noServer:true,maxPayload:65536,perMessageDeflate:false}),sockets=new Set<WebSocket>();
 const addresses=new Map<string,{at:number;count:number}>();let closing=false;
 function accept(ws:WebSocket):void{
  sockets.add(ws);let peer:PeerIdentity|null=null,authenticated=false,challengeId='',nonce='',deadline=0;
  const connectionId=randomUUID(),requestId=randomUUID();let chain=Promise.resolve(),lastPong=clock.monotonicMs(),rateAt=lastPong,frames=0;
  let authTimer=setTimeout(()=>ws.close(1008),3000);authTimer.unref();
  const channel:DeviceChannel={connectionId,send:event=>safeSend(ws,event),close:code=>ws.close(code)};
  // debug-003: screen-off power saving can prevent the phone's Close frame arriving.
  // Detect missing responses on the PC; responding sessions have no lifetime limit.
  const heartbeat=setInterval(()=>{if(clock.monotonicMs()-lastPong>=2000)ws.terminate();else if(ws.readyState===WebSocket.OPEN)ws.ping();},1000);heartbeat.unref();
  ws.on('pong',()=>{lastPong=clock.monotonicMs();});
  ws.once('close',()=>{clearTimeout(authTimer);clearInterval(heartbeat);sockets.delete(ws);if(peer&&authenticated)manager.lostDevice(peer.id,channel);});
  ws.on('error',()=>{context.log({name:'device_socket_error',requestId,code:'E_NETWORK'});});
  ws.on('message',(bytes,isBinary)=>{
   chain=chain.then(async()=>{
    if(closing||ws.readyState!==WebSocket.OPEN)return;
    if(isBinary)throw new PairingError('E_INPUT');
    if(clock.monotonicMs()-rateAt>=1000){rateAt=clock.monotonicMs();frames=0;}if(++frames>20)throw new PairingError('E_RATE_LIMIT',429);
    const text=bytes.toString();if(Buffer.byteLength(text)>65536)throw new PairingError('E_TOO_LARGE',413);
    let m:Record<string,unknown>;try{m=JSON.parse(text);}catch{throw new PairingError('E_INPUT');}
    if(!peer){
     object(m,['v','kind','device']);if(m.v!==2||m.kind!=='hello'||Buffer.byteLength(text)>2048)throw new PairingError('E_INPUT');peer=parsePeer(m.device);
     nonce=random(32).toString('base64url');challengeId=randomUUID();deadline=clock.monotonicMs()+30000;clearTimeout(authTimer);authTimer=setTimeout(()=>ws.close(1008),30000);authTimer.unref();
     const signature=sign('sha256',canonicalProof('challenge',identity.peer.id,peer.id,challengeId,nonce,connectionId,'challenge'),identity.privateKeyPem).toString('base64url');
     safeSend(ws,{v:2,kind:'challenge',pc:identity.peer,challengeId,connectionId,nonce,expiresAt:clock.wallMs()+30000,signature});return;
    }
    if(!authenticated){
     object(m,['v','kind','deviceId','challengeId','connectionId','signature']);if(m.v!==2||m.kind!=='proof'||m.deviceId!==peer.id||m.challengeId!==challengeId||m.connectionId!==connectionId||clock.monotonicMs()>=deadline||!verifyIdentityProof(peer.publicKeySpki,canonicalProof('proof',identity.peer.id,peer.id,challengeId,nonce,connectionId,'proof'),String(m.signature)))throw new PairingError('E_AUTH',401);
     clearTimeout(authTimer);authenticated=true;manager.registerDevice(peer,channel,identity.peer.id);nonce='';return;
    }
    if(m.kind==='enroll-decision'){
     object(m,['v','kind','pcId','deviceId','requestId','nonce','allow','signature']);if(m.v!==2||m.pcId!==identity.peer.id||m.deviceId!==peer.id||typeof m.allow!=='boolean'||typeof m.requestId!=='string'||typeof m.nonce!=='string'||typeof m.signature!=='string')throw new PairingError('E_INPUT');
     await manager.decide(peer.id,m.requestId,m.nonce,m.allow,m.signature);return;
    }
    if(manager.state().intent.deviceId!==peer.id||!context.repository.find(peer.id))throw new PairingError('E_NOT_TRUSTED',403);
    if(m.kind==='request-enrollment'){object(m,['v','kind']);if(m.v!==2)throw new PairingError('E_INPUT');await manager.requestEnrollment(peer.id);return;}
    if(m.kind==='disconnect'){object(m,['v','kind']);if(m.v!==2)throw new PairingError('E_INPUT');await manager.disconnect();return;}
    if(m.kind==='bye'&&(m.payload as {reason?:string})?.reason==='user')await manager.disconnect();
   }).catch(error=>{const code=error instanceof PairingError?error.code:'E_INTERNAL';context.log({name:'device_rejected',requestId,code});safeSend(ws,{v:2,kind:'error',code,requestId});ws.close(code==='E_TOO_LARGE'?1009:1008);});
  });
 }
 return {
  accept,
  upgrade:(req,socket,head)=>{
   if(closing||req.url!=='/v2/device'||req.headers.origin||req.headers.host!==`${context.config.lanHost}:${context.config.tlsPort}`){rejectUpgrade(socket,403);return;}
   if(wss.clients.size>=32){rejectUpgrade(socket,429);return;}
   const now=clock.monotonicMs();for(const [key,v]of addresses)if(now-v.at>=60000)addresses.delete(key);
   const key=req.socket.remoteAddress??'unknown',entry=addresses.get(key);if(!entry&&addresses.size>=256||entry&&entry.count>=20){rejectUpgrade(socket,429);return;}addresses.set(key,entry?{...entry,count:entry.count+1}:{at:now,count:1});
   wss.handleUpgrade(req,socket,head,accept);
  },
  close:async()=>{closing=true;for(const ws of sockets){ws.close(1001);ws.terminate();}sockets.clear();await new Promise<void>(resolve=>wss.close(()=>resolve()));},
 };
}
