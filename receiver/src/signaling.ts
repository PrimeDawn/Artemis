import{WebSocketServer,type WebSocket}from'ws';import type{IncomingMessage}from'node:http';import type{Duplex}from'node:stream';import{randomUUID}from'node:crypto';
import{PairingError,object,type PairingConfig,type Clock,type SafeLogger}from'./protocol.js';import type{ConnectionManager,ReceiverChannel}from'./connection-manager.js';import{safeSend,rejectUpgrade}from'./device-broker.js';
export function createReceiverBroker(config:PairingConfig,manager:ConnectionManager,clock:Clock,log:SafeLogger):{upgrade(req:IncomingMessage,socket:Duplex,head:Buffer):void;accept(ws:WebSocket):void;close():Promise<void>}{
 const wss=new WebSocketServer({noServer:true,maxPayload:65536,perMessageDeflate:false}),sockets=new Set<WebSocket>();let closing=false;
 function accept(ws:WebSocket){sockets.add(ws);let authenticated=false,lastPong=clock.monotonicMs(),rateAt=lastPong,count=0;const requestId=randomUUID();
  const channel:ReceiverChannel={send:e=>safeSend(ws,e),close:code=>ws.close(code)};
  const auth=setTimeout(()=>ws.close(1008),3000);auth.unref();
  const heartbeat=setInterval(()=>{if(clock.monotonicMs()-lastPong>=90000)ws.terminate();else if(ws.readyState===1)ws.ping();},30000);heartbeat.unref();
  ws.on('pong',()=>{lastPong=clock.monotonicMs();});ws.on('error',()=>log({name:'receiver_socket_error',requestId,code:'E_NETWORK'}));
  ws.once('close',()=>{clearTimeout(auth);clearInterval(heartbeat);sockets.delete(ws);if(authenticated)manager.lostReceiver(channel);});
  ws.on('message',(bytes,binary)=>{try{if(binary||closing)throw new PairingError('E_INPUT');if(clock.monotonicMs()-rateAt>=1000){rateAt=clock.monotonicMs();count=0;}if(++count>20)throw new PairingError('E_RATE_LIMIT',429);const text=bytes.toString();
    if(!authenticated){if(Buffer.byteLength(text)>512)throw new PairingError('E_TOO_LARGE',413);const m=object(JSON.parse(text),['v','kind','ticket']);if(m.v!==2||m.kind!=='auth'||typeof m.ticket!=='string'||!/^[A-Za-z0-9_-]{43}$/u.test(m.ticket))throw new PairingError('E_INPUT');manager.redeemReceiverTicket(m.ticket);authenticated=true;clearTimeout(auth);manager.attachReceiver(channel);}else manager.route('receiver',text);
   }catch(e){const code=e instanceof PairingError?e.code:'E_INPUT';log({name:'receiver_rejected',requestId,code});safeSend(ws,{v:2,kind:'error',code,requestId});ws.close(code==='E_TOO_LARGE'?1009:1008);}});
 }
 return{accept,upgrade:(req,socket,head)=>{if(closing||req.url!=='/ws/receiver'||req.headers.host!==`127.0.0.1:${config.controlPort}`||req.headers.origin!==`http://127.0.0.1:${config.controlPort}`){rejectUpgrade(socket,403);return;}if(wss.clients.size>=8){rejectUpgrade(socket,429);return;}wss.handleUpgrade(req,socket,head,accept);},close:async()=>{closing=true;for(const ws of sockets){ws.close(1001);ws.terminate();}sockets.clear();await new Promise<void>(resolve=>wss.close(()=>resolve()));}};
}
