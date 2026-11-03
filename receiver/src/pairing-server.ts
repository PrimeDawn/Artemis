import{PairingError,type PairingConfig,type SafeLogger}from'./protocol.js';
import{createServer,type Server}from'node:http';import{createServer as createTlsServer,type Server as HttpsServer}from'node:https';import{networkInterfaces}from'node:os';import{randomBytes,randomUUID}from'node:crypto';import{open,unlink,readFile}from'node:fs/promises';import{join}from'node:path';import type{AddressInfo}from'node:net';
import{loadOrCreateIdentity,renewCertificate}from'./identity.js';import{openTrustRepository}from'./trust-repository.js';import{createConnectionManager}from'./connection-manager.js';import{createControlHandler}from'./control-http.js';import{createDeviceBroker}from'./device-broker.js';import{createMediaRelay}from'./media-relay.js';import{WebSocketServer}from'ws';import{connect}from'node:net';import type{IncomingMessage}from'node:http';import type{Duplex}from'node:stream';import{publishDiscovery}from'./discovery.js';import{resolveUpgradeTarget}from'./upgrade-router.js';import{privateIpv4}from'./pairing-config.js';
export interface RunningPairingServer{controlAddress:string;lanAddress:string;close():Promise<void>}
export async function startPairingServer(input:PairingConfig,log:SafeLogger=()=>{}):Promise<RunningPairingServer>{
 const config={...input};let identity=await loadOrCreateIdentity(config);
 const lockPath=join(config.dataDir,'running.lock');let lock:Awaited<ReturnType<typeof open>>;
 try{lock=await open(lockPath,'wx',0o600);await lock.writeFile(String(process.pid));}catch(e){
  if((e as NodeJS.ErrnoException).code!=='EEXIST')throw new PairingError('E_BUSY',409);
  const previous=Number(await readFile(lockPath,'utf8'));if(!Number.isInteger(previous)||previous<=0)throw new PairingError('E_BUSY',409);
  let exited=false;try{process.kill(previous,0);}catch(error){exited=(error as NodeJS.ErrnoException).code==='ESRCH';}if(!exited)throw new PairingError('E_BUSY',409);
  await unlink(lockPath);try{lock=await open(lockPath,'wx',0o600);await lock.writeFile(String(process.pid));}catch{throw new PairingError('E_BUSY',409);}
 }
 const clock={wallMs:Date.now,monotonicMs:()=>performance.now()},repo=await openTrustRepository(config.dataDir).catch(async e=>{await lock.close();await unlink(lockPath);throw e;}),manager=createConnectionManager(repo,clock,randomBytes);
 let control:Server|undefined,lan:HttpsServer|undefined,device:ReturnType<typeof createDeviceBroker>|undefined,discovery:Awaited<ReturnType<typeof publishDiscovery>>|undefined;
 let closing=false,maintenance=Promise.resolve(),timer:NodeJS.Timeout|undefined,closePromise:Promise<void>|undefined;
 const original=networkInterfaces();const adapter=Object.entries(original).find(([,list])=>list?.some(a=>a.address===config.lanHost))?.[0];
 async function listen(server:Server|HttpsServer,host:string,port:number){await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve();});});return(server.address() as AddressInfo).port;}
 async function stop(server:Server|HttpsServer|undefined){if(server?.listening)await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeIdleConnections();});}
 async function bindLan(){
  const ctx={config,identity,repository:repo,manager,clock,random:randomBytes,log};device=createDeviceBroker(ctx);
  lan=createTlsServer({key:identity.privateKeyPem,cert:identity.certificatePem,minVersion:'TLSv1.2'},(req,res)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.writeHead(404).end('{"code":"E_NOT_FOUND"}');});
  lan.requestTimeout=5000;lan.headersTimeout=5000;lan.on('upgrade',(req,socket,head)=>{const target=resolveUpgradeTarget(req.url??'');if(target==='media'){mediaUpgrade(req,socket,head);return;}if(target==='audio'){audioUpgrade(req,socket,head);return;}device!.upgrade(req,socket,head);});config.tlsPort=await listen(lan,config.lanHost,config.tlsPort);lan.on('error',()=>log({name:'lan_error',requestId:randomUUID(),code:'E_NETWORK'}));
  if(!config.testOnly)discovery=await publishDiscovery(config,identity,()=>log({name:'discovery_error',requestId:randomUUID(),code:'E_DISCOVERY'}));
 }
 // 媒体通道：只在 path 为 /media 时接管，控制通道的 upgrade 与二进制校验完全不变。
const mediaPort=config.mediaPort??3450;
const mediaRelay=createMediaRelay({
  findSession:(sessionId)=>{
    if(manager.state().sessionId!==sessionId)return null;
    const deviceId=manager.activeDevice();
    if(!deviceId)return null;
    return {sessionId,pcId:identity.peer.id,deviceId};
  },
  openSink:(_session,onDead)=>{
    const upstream=connect({host:'127.0.0.1',port:mediaPort});
    upstream.on('error',(error)=>{log({name:'media_upstream_error',requestId:randomUUID(),code:(error as NodeJS.ErrnoException).code??'E_NETWORK'});onDead();});
    upstream.on('close',()=>onDead());
    return {write:(chunk)=>upstream.write(chunk),end:()=>upstream.end()};
  },
  log,
});
const mediaServer=new WebSocketServer({noServer:true,clientTracking:true});
function mediaUpgrade(req:IncomingMessage,socket:Duplex,head:Buffer):void{
  mediaServer.handleUpgrade(req,socket,head,(ws)=>{
    mediaRelay.handle({on:(event,handler)=>ws.on(event,handler as (...args:unknown[])=>void),close:(code,reason)=>ws.close(code,reason),send:(payload)=>ws.send(payload)});
  });
}

 // 音频通道：与 /media 同构，sink 指向 decode-host 的音频端口（writer/plan.html §3）。
 const audioPort=mediaPort+1;
 const audioRelay=createMediaRelay({
  findSession:(sessionId)=>{if(manager.state().sessionId!==sessionId)return null;const deviceId=manager.activeDevice();if(!deviceId)return null;return {sessionId,pcId:identity.peer.id,deviceId};},
  openSink:(_session,onDead)=>{const upstream=connect({host:'127.0.0.1',port:audioPort});upstream.on('error',(error)=>{log({name:'audio_upstream_error',requestId:randomUUID(),code:(error as NodeJS.ErrnoException).code??'E_NETWORK'});onDead();});upstream.on('close',()=>onDead());return {write:(chunk)=>upstream.write(chunk),end:()=>upstream.end()};},
  log,
 });
 const audioServer=new WebSocketServer({noServer:true,clientTracking:true});
 function audioUpgrade(req:IncomingMessage,socket:Duplex,head:Buffer):void{
  audioServer.handleUpgrade(req,socket,head,(ws)=>{
   audioRelay.handle({on:(event,handler)=>ws.on(event,handler as (...args:unknown[])=>void),close:(code,reason)=>ws.close(code,reason),send:(payload)=>ws.send(payload)});
  });
 }
async function close(){closing=true;if(timer)clearInterval(timer);await maintenance.catch(()=>{});await discovery?.close();await device?.close();await manager.close();await Promise.all([stop(lan),stop(control)]);await repo.close();await lock.close();await unlink(lockPath);}
 try{
  control=createServer((req,res)=>{void handler(req,res);});const handler=createControlHandler({config,manager,random:randomBytes,log});control.requestTimeout=5000;control.headersTimeout=5000;
  config.controlPort=await listen(control,config.controlHost,config.controlPort);control.on('error',()=>log({name:'control_error',requestId:randomUUID(),code:'E_NETWORK'}));await bindLan();
  if(!config.testOnly){timer=setInterval(()=>{maintenance=maintenance.then(async()=>{
    if(closing)return;
    const addresses=adapter?networkInterfaces()[adapter]:undefined;const ip=addresses?.find(a=>a.family==='IPv4'&&!a.internal&&privateIpv4(a.address))?.address;
    if(ip&&(ip!==config.lanHost||!lan?.listening)){const nextIdentity=await renewCertificate(identity,ip,Date.now());await discovery?.close();discovery=undefined;await device?.close();await stop(lan);config.lanHost=ip;identity=nextIdentity;await bindLan();log({name:'lan_address_updated',requestId:randomUUID(),code:null});}
    else if(identity.certificateExpiresAt-Date.now()<7*86400000){identity=await renewCertificate(identity,config.lanHost,Date.now());lan?.setSecureContext({key:identity.privateKeyPem,cert:identity.certificatePem});log({name:'certificate_renewed',requestId:randomUUID(),code:null});}
   }).catch(()=>log({name:'maintenance_error',requestId:randomUUID(),code:'E_NETWORK'}));},10000);timer.unref();}
  return{get controlAddress(){return`http://127.0.0.1:${config.controlPort}`;},get lanAddress(){return`https://${config.lanHost}:${config.tlsPort}`;},close:()=>closePromise??=close()};
 }catch(e){await close().catch(()=>{});throw e;}
}
