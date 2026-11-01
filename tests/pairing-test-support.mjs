// Independent tester transport: real production listeners, real EC keys/TLS/WS.
// The generated peer stands in for an absent phone; it does not certify Android NSD.
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile,appendFile,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,generateKeyPairSync,sign,verify,createPublicKey,X509Certificate,randomUUID} from 'node:crypto';
import {request} from 'node:http';import {checkServerIdentity} from 'node:tls';
import {startPairingServer} from '../receiver/dist/src/pairing-server.js';
const require=createRequire(new URL('../receiver/package.json',import.meta.url));
export const WebSocket=require('ws');
export const delay=ms=>new Promise(r=>setTimeout(r,ms));
export const args=Object.fromEntries(process.argv.slice(2).reduce((a,x,i,all)=>x.startsWith('--')?[...a,[x.slice(2),all[i+1]]]:a,[]));
export function invariant(ok,message){if(!ok)throw new Error(message);}
export async function runContext(dir,scope){
 const out=resolve(dir);await mkdir(out,{recursive:true});const startedAt=new Date().toISOString();
 const auditPath=join(out,'audit.log');await writeFile(auditPath,`Command: ${process.execPath} ${process.argv.slice(1).join(' ')}\nTimestamp: ${startedAt}\n` ,{flag:'wx'});
 const event=(name,data={})=>appendFile(auditPath,JSON.stringify({at:new Date().toISOString(),event:name,...data})+'\n');
 const root=resolve('.cache/spec2-independent-data');await mkdir(root,{recursive:true});const dataDir=await mkdtemp(join(root,'run-'));
 const cases=[];return {out,dataDir,startedAt,event,cases,scope,async test(id,fn){await event('case_start',{id});const t=performance.now();try{const observations=await fn();cases.push({id,status:'pass',durationMs:Math.round(performance.now()-t),observations});await event('case_pass',{id});}catch(e){cases.push({id,status:'fail',durationMs:Math.round(performance.now()-t),error:e.message});await event('case_fail',{id,error:e.message});throw e;}},async finish(error){const result={startedAt,finishedAt:new Date().toISOString(),scope,passed:!error,cases,error:error?.message??null};await writeFile(join(out,'result.json'),JSON.stringify(result,null,2)+'\n');await appendFile(auditPath,`Exit code: ${error?1:0}\n`);console.log(JSON.stringify({scope,passed:!error,cases:cases.length,error:error?.message??null}));}};
}
export async function startService(run,extra={}){
 const cfg={controlHost:'127.0.0.1',controlPort:0,lanHost:'127.0.0.1',tlsPort:0,dataDir:run.dataDir,opensslPath:process.env.ARTEMIS_OPENSSL_PATH,testOnly:true,...extra};
 invariant(cfg.opensslPath,'Existing OpenSSL path is required');
 const server=await startPairingServer(cfg,e=>{void appendFile(join(run.out,'backend-events.ndjson'),JSON.stringify({at:new Date().toISOString(),run:run.scope,...e})+'\n');});
 let cert;try{cert=await readFile(join(cfg.dataDir,'certificate.pem'));}catch(error){await server.close();throw error;}
 const x=new X509Certificate(cert);const spki=x.publicKey.export({format:'der',type:'spki'});const pcId=createHash('sha256').update(spki).digest('base64url');
 return {server,config:cfg,control:server.controlAddress,lan:server.lanAddress.replace('https:','wss:')+'/v2/device',cert,pcId,async close(){await server.close();}};
}
export async function http(s,path,options={}){
 const base=new URL(s.control),encoded=options.body===undefined?undefined:typeof options.body==='string'?options.body:JSON.stringify(options.body);return new Promise((resolve,reject)=>{const q=request({hostname:base.hostname,port:base.port,path,method:options.method??'GET',headers:{...(encoded===undefined?{}:{'Content-Length':Buffer.byteLength(encoded)}),...options.headers}},r=>{let text='';r.setEncoding('utf8');r.on('data',x=>text+=x);r.on('end',()=>{let body;try{body=JSON.parse(text);}catch{body=text;}resolve({status:r.statusCode,headers:r.headers,body});});});q.on('error',reject);q.setTimeout(6000,()=>q.destroy(new Error('HTTP timeout')));if(encoded!==undefined)q.write(encoded);q.end();});
}
export async function controlSession(s){const page=await http(s,'/control');invariant(page.status===200,'control page status');const cookie=page.headers['set-cookie'][0].split(';')[0];const state=await http(s,'/api/state',{headers:{Cookie:cookie}});invariant(state.status===200,'authenticated control state');const csrf=state.body.csrf;return {async state(){const r=await http(s,'/api/state',{headers:{Cookie:cookie}});invariant(r.status===200,'state remains authenticated');return r.body.state;},async action(path,method='POST',headers={}){return http(s,path,{method,headers:{Cookie:cookie,Origin:s.control,'X-Artemis-CSRF':csrf,'Content-Type':'application/json',...headers},body:{}});},cookie,csrf};}
export function transcript(kind,pcId,deviceId,id,nonce,connectionId,decision){return Buffer.from(['artemis-v2',kind,pcId,deviceId,id,nonce,connectionId,decision].join('\n'));}
export class Inbox{
 constructor(ws){this.ws=ws;this.items=[];this.waiters=[];this.closed=false;this.pings=0;this.pongs=0;ws.on('message',b=>{let m;try{m=JSON.parse(b.toString());}catch{return;}const waiter=this.waiters.find(w=>w.predicate(m));if(waiter){clearTimeout(waiter.timer);this.waiters.splice(this.waiters.indexOf(waiter),1);waiter.resolve(m);}else this.items.push(m);});ws.on('close',()=>{this.closed=true;for(const w of this.waiters){clearTimeout(w.timer);w.reject(new Error('WS closed while waiting'));}this.waiters=[];});ws.on('error',()=>{});ws.on('ping',()=>this.pings++);ws.on('pong',()=>this.pongs++);}
 take(predicate,timeout=7000){if(typeof predicate==='string'){const kind=predicate;predicate=m=>m.kind===kind;}const i=this.items.findIndex(predicate);if(i>=0)return Promise.resolve(this.items.splice(i,1)[0]);if(this.closed)return Promise.reject(new Error('WS already closed'));return new Promise((resolve,reject)=>{const w={predicate,resolve,reject,timer:setTimeout(()=>{this.waiters.splice(this.waiters.indexOf(w),1);reject(new Error('WS event timeout'));},timeout)};this.waiters.push(w);});}
 send(m){this.ws.send(JSON.stringify(m));}
 async close(){if(this.ws.readyState===3)return;await new Promise(resolve=>{this.ws.once('close',resolve);this.ws.close(1000);setTimeout(()=>{if(this.ws.readyState!==3)this.ws.terminate();},1500).unref();});}
}
export async function socket(url,options={}){const ws=new WebSocket(url,{perMessageDeflate:false,...options});const inbox=new Inbox(ws);await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return inbox;}
export class DevicePeer{
 constructor(label='Protocol test device'){const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'});this.key=key.privateKey;const spki=key.publicKey.export({format:'der',type:'spki'});this.peer={id:createHash('sha256').update(spki).digest('base64url'),publicKeySpki:spki.toString('base64url'),label};this.approvals=0;}
 async connect(s,options={}){const expected=options.expectedPin??s.pcId;this.box=await socket(s.lan,{ca:s.cert,checkServerIdentity:(host,cert)=>{const base=checkServerIdentity(host,cert);if(base)return base;const x=new X509Certificate(cert.raw);const actual=createHash('sha256').update(x.publicKey.export({format:'der',type:'spki'})).digest('base64url');if(actual!==expected)return new Error('SPKI mismatch');},...options});this.box.send({v:2,kind:'hello',device:this.peer});this.challenge=await this.box.take('challenge');const c=this.challenge;invariant(c.pc.id===s.pcId,'signed PC identity matches pinned certificate');const bytes=transcript('challenge',c.pc.id,this.peer.id,c.challengeId,c.nonce,c.connectionId,'challenge');invariant(verify('sha256',bytes,createPublicKey({key:Buffer.from(c.pc.publicKeySpki,'base64url'),format:'der',type:'spki'}),Buffer.from(c.signature,'base64url')),'real PC challenge signature');this.box.send({v:2,kind:'proof',deviceId:this.peer.id,challengeId:c.challengeId,connectionId:c.connectionId,signature:sign('sha256',transcript('proof',c.pc.id,this.peer.id,c.challengeId,c.nonce,c.connectionId,'proof'),this.key).toString('base64url')});const initial=await this.box.take(m=>['waiting','ready','error'].includes(m.kind));invariant(initial.kind!=='error','device proof accepted');return initial;}
 async decide(allow=true){const a=await this.box.take('enroll-request');this.approvals++;const signature=sign('sha256',transcript('enroll-decision',a.pcId,this.peer.id,a.requestId,a.nonce,this.challenge.connectionId,allow?'allow':'deny'),this.key).toString('base64url');this.lastDecision={v:2,kind:'enroll-decision',pcId:a.pcId,deviceId:this.peer.id,requestId:a.requestId,nonce:a.nonce,allow,signature};this.box.send(this.lastDecision);return this.box.take(allow?'trusted':'denied');}
 async close(){await this.box?.close();}
}
export async function pair(s,control,peer=new DevicePeer()){await peer.connect(s);const r=await control.action(`/api/devices/${peer.peer.id}/connect`);invariant(r.status===202,'PC selects phone');await peer.decide();const active=await peer.box.take('activated');invariant(active.manual,'first selection is manual');await peer.box.take(m=>m.kind==='waiting'||m.kind==='ready');return peer;}
export function signal(kind,ready,payload){return {v:2,id:randomUUID(),sessionId:ready.sessionId,epoch:ready.epoch,kind,payload};}
export async function until(fn,message,timeout=10000){const t=performance.now();while(performance.now()-t<timeout){if(await fn())return;await delay(50);}throw new Error(message);}
