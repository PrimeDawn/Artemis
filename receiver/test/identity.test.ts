import {test} from 'node:test';import assert from 'node:assert/strict';import { mkdtemp,rm } from 'node:fs/promises';import { resolve,sep } from 'node:path';import { X509Certificate } from 'node:crypto';
import {loadOrCreateIdentity,renewCertificate} from '../src/identity.js';
test('identity survives restart and same-key renewal keeps the SPKI ID',async()=>{
 const dir=await mkdtemp(resolve('../.cache/identity-unit-'));try{
  const config={controlHost:'127.0.0.1' as const,controlPort:0,lanHost:'127.0.0.1',tlsPort:0,dataDir:dir,testOnly:true};
  const first=await loadOrCreateIdentity(config);assert.match(first.peer.id,/^[A-Za-z0-9_-]{43}$/u);assert.ok(new X509Certificate(first.certificatePem).checkIP('127.0.0.1'));
  const again=await loadOrCreateIdentity(config);assert.equal(again.peer.id,first.peer.id);assert.ok(again.privateKeyPem.equals(first.privateKeyPem));
  const renewed=await renewCertificate(first,'127.0.0.2',Date.now());assert.equal(renewed.peer.id,first.peer.id);assert.ok(new X509Certificate(renewed.certificatePem).checkIP('127.0.0.2'));
 }finally{assert.ok(dir.startsWith(resolve('../.cache')+sep));await rm(dir,{recursive:true,force:true});}
});
