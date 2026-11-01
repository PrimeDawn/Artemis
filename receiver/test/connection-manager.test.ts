import { test } from 'node:test';import assert from 'node:assert/strict';
import { generateKeyPairSync,createHash,randomBytes,randomUUID,sign } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';import { resolve,sep } from 'node:path';
import { openTrustRepository } from '../src/trust-repository.js';import { createConnectionManager,type DeviceChannel } from '../src/connection-manager.js';import {canonicalProof} from '../src/protocol.js';
function identity(){const k=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const der=k.publicKey.export({type:'spki',format:'der'});return {key:k.privateKey,peer:{id:createHash('sha256').update(der).digest('base64url'),publicKeySpki:der.toString('base64url'),label:'Phone'}};}
async function fixture(){const dir=await mkdtemp(resolve('../.cache/manager-unit-'));const repo=await openTrustRepository(dir);let mono=0;const clock={wallMs:()=>100000+mono,monotonicMs:()=>mono};const manager=createConnectionManager(repo,clock,randomBytes);const pc=identity(),phone=identity();const events:any[]=[];const channel:DeviceChannel={connectionId:randomUUID(),send:e=>events.push(e),close:()=>{}};return {manager,phone,pc,channel,events,repo,advance:(ms:number)=>{mono+=ms;},cleanup:async()=>{await manager.close();await repo.close();assert.ok(dir.startsWith(resolve('../.cache')+sep));await rm(dir,{recursive:true,force:true});}};}
test('unknown presence requires a click and a signed phone decision exactly once',async()=>{
 const f=await fixture();try{f.manager.registerDevice(f.phone.peer,f.channel,f.pc.peer.id);assert.equal(f.manager.devices().length,1);assert.equal(f.manager.state().sessionId,null);
 await f.manager.select(f.phone.peer.id);const request=f.events.find(e=>e.kind==='enroll-request');assert.ok(request,'PC click must request approval');
 const bytes=canonicalProof('enroll-decision',f.pc.peer.id,f.phone.peer.id,request.requestId,request.nonce,f.channel.connectionId,'allow');
 await assert.rejects(f.manager.decide(f.phone.peer.id,request.requestId,request.nonce,true,sign('sha256',Buffer.from('wrong'),f.phone.key).toString('base64url')));
 await f.manager.decide(f.phone.peer.id,request.requestId,request.nonce,true,sign('sha256',bytes,f.phone.key).toString('base64url'));
 assert.ok(f.repo.find(f.phone.peer.id));assert.ok(f.manager.state().sessionId);assert.equal(f.manager.state().expiresAt,null);
 await assert.rejects(f.manager.decide(f.phone.peer.id,request.requestId,request.nonce,true,sign('sha256',bytes,f.phone.key).toString('base64url')));
 }finally{await f.cleanup();}
});
test('72 hours do not expire trusted active connection',async()=>{
 const f=await fixture();try{await f.repo.trust(f.phone.peer,100);f.manager.registerDevice(f.phone.peer,f.channel,f.pc.peer.id);await f.manager.select(f.phone.peer.id);const session=f.manager.state().sessionId;assert.ok(session);
 f.advance(72*60*60*1000);assert.equal(f.manager.state().sessionId,session);
 await f.manager.disconnect();assert.equal(f.repo.readIntent().desired,'disconnected');assert.equal(f.manager.state().sessionId,null);
 }finally{await f.cleanup();}
});
test('socket loss restores remembered selection without approval, manual disconnect stops restore',async()=>{
 const f=await fixture();try{await f.repo.trust(f.phone.peer,100);f.manager.registerDevice(f.phone.peer,f.channel,f.pc.peer.id);await f.manager.select(f.phone.peer.id);const first=f.manager.state().sessionId;
 f.manager.lostDevice(f.phone.peer.id,f.channel);const next={...f.channel,connectionId:randomUUID()};f.manager.registerDevice(f.phone.peer,next,f.pc.peer.id);assert.ok(f.manager.state().sessionId);assert.notEqual(f.manager.state().sessionId,first);assert.equal(f.events.filter(e=>e.kind==='enroll-request').length,0);
 await f.manager.disconnect();f.manager.lostDevice(f.phone.peer.id,next);f.manager.registerDevice(f.phone.peer,f.channel,f.pc.peer.id);assert.equal(f.manager.state().sessionId,null);
 await f.manager.forget(f.phone.peer.id);assert.equal(f.repo.find(f.phone.peer.id),null);
 }finally{await f.cleanup();}
});
test('temporary phone loss clears the session and recovery issues a fresh sessionId',async()=>{
 const f=await fixture();try{await f.repo.trust(f.phone.peer,100);f.manager.registerDevice(f.phone.peer,f.channel,f.pc.peer.id);await f.manager.select(f.phone.peer.id);const old=f.manager.state().sessionId;assert.ok(old);
 f.manager.lostDevice(f.phone.peer.id,f.channel);assert.equal(f.manager.state().sessionId,null);
 f.manager.registerDevice(f.phone.peer,{...f.channel,connectionId:randomUUID()},f.pc.peer.id);const next=f.manager.state().sessionId;assert.ok(next);assert.notEqual(next,old);
 }finally{await f.cleanup();}
});
test('forgetting another remembered device does not disconnect the selected device',async()=>{
 const f=await fixture();try{const other=identity();await f.repo.trust(f.phone.peer,100);await f.repo.trust(other.peer,100);f.manager.registerDevice(f.phone.peer,f.channel,f.pc.peer.id);await f.manager.select(f.phone.peer.id);const session=f.manager.state().sessionId;assert.ok(session);await f.manager.forget(other.peer.id);assert.equal(f.manager.state().sessionId,session);assert.ok(f.repo.find(f.phone.peer.id));
 }finally{await f.cleanup();}
});
test('activation distinguishes a new PC click from automatic resume after socket loss',async()=>{
 const f=await fixture();try{await f.repo.trust(f.phone.peer,100);f.manager.registerDevice(f.phone.peer,f.channel,f.pc.peer.id);await f.manager.select(f.phone.peer.id);assert.ok(f.events.find(e=>e.kind==='activated'&&e.manual===true));f.manager.lostDevice(f.phone.peer.id,f.channel);f.manager.registerDevice(f.phone.peer,{...f.channel,connectionId:randomUUID()},f.pc.peer.id);assert.ok(f.events.find(e=>e.kind==='activated'&&e.manual===false));
 }finally{await f.cleanup();}
});
test('only an already selected trusted phone may request renewed first consent',async()=>{
 const f=await fixture();try{f.manager.registerDevice(f.phone.peer,f.channel,f.pc.peer.id);await assert.rejects(f.manager.requestEnrollment(f.phone.peer.id));await f.repo.trust(f.phone.peer,1);await f.manager.select(f.phone.peer.id);await f.manager.requestEnrollment(f.phone.peer.id);assert.equal(f.manager.state().sessionId,null);assert.ok(f.events.find(e=>e.kind==='enroll-request'));assert.equal(f.repo.readIntent().desired,'disconnected');
 }finally{await f.cleanup();}
});
test('fresh proof of the same selected identity can replace a stale transport without waiting 90 seconds',async()=>{
 const f=await fixture();try{await f.repo.trust(f.phone.peer,1);let oldClosed=0;const old={...f.channel,close:()=>{oldClosed++;}};f.manager.registerDevice(f.phone.peer,old,f.pc.peer.id);await f.manager.select(f.phone.peer.id);const before=f.manager.state().sessionId;assert.ok(before);const fresh={...f.channel,connectionId:randomUUID()};f.manager.registerDevice(f.phone.peer,fresh,f.pc.peer.id);assert.equal(oldClosed,1);assert.ok(f.manager.state().sessionId);assert.notEqual(f.manager.state().sessionId,before);assert.equal(f.repo.readIntent().deviceId,f.phone.peer.id);
 }finally{await f.cleanup();}
});
