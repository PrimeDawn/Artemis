import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve,join,sep } from 'node:path';
import { generateKeyPairSync,createHash } from 'node:crypto';
import { openTrustRepository } from '../src/trust-repository.js';
function peer(label='Phone'){const k=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({type:'spki',format:'der'});return {id:createHash('sha256').update(k).digest('base64url'),publicKeySpki:k.toString('base64url'),label};}
test('trust and selected intent survive restart with no expiry; forget revokes',async()=>{
  const dir=await mkdtemp(resolve('../.cache/trust-unit-'));try{
    const p=peer(),repo=await openTrustRepository(dir);await repo.trust(p,1000);await repo.writeIntent({deviceId:p.id,desired:'connected'});await repo.close();
    const next=await openTrustRepository(dir);assert.deepEqual(next.find(p.id),{peer:p,trustedAt:1000,expiresAt:null});assert.equal(next.readIntent().deviceId,p.id);
    const detached=next.list();detached[0].peer.label='spoof';assert.equal(next.find(p.id)?.peer.label,'Phone');
    await next.forget(p.id);assert.equal(next.find(p.id),null);assert.equal(next.readIntent().desired,'disconnected');await next.close();
  }finally{assert.ok(dir.startsWith(resolve('../.cache')+sep));await rm(dir,{recursive:true,force:true});}
});
test('corrupt persisted trust fails closed and is preserved',async()=>{
  const dir=await mkdtemp(resolve('../.cache/trust-corrupt-'));try{await writeFile(join(dir,'trust-store.json'),'broken');await assert.rejects(openTrustRepository(dir));}finally{assert.ok(dir.startsWith(resolve('../.cache')+sep));await rm(dir,{recursive:true,force:true});}
});
