import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash, randomUUID, sign } from 'node:crypto';
import { canonicalProof, verifyIdentityProof, parsePeer, decodeClientSignal } from '../src/protocol.js';
const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const der = keys.publicKey.export({ type: 'spki', format: 'der' });
const peer = { id: createHash('sha256').update(der).digest('base64url'), publicKeySpki: der.toString('base64url'), label: '测试手机' };
test('proof canonical bytes bind both peers, nonce and connection', () => {
  assert.equal(canonicalProof('proof','pc','device','challenge','nonce','connection','proof').toString(), 'artemis-v2\nproof\npc\ndevice\nchallenge\nnonce\nconnection\nproof');
  assert.throws(() => canonicalProof('proof','pc\nother','d','c','n','s','proof'));
});
test('real P-256 proof verifies and rejects changed transcript', () => {
  const message = Buffer.from('independent expected bytes');
  const signature = sign('sha256', message, keys.privateKey).toString('base64url');
  assert.equal(verifyIdentityProof(peer.publicKeySpki,message,signature),true);
  assert.equal(verifyIdentityProof(peer.publicKeySpki,Buffer.from('changed'),signature),false);
  assert.equal(verifyIdentityProof(peer.publicKeySpki,message,'malformed'),false);
});
test('peer identity is derived from SPKI, not label/IP', () => {
  assert.deepEqual(parsePeer(peer),peer);
  assert.throws(() => parsePeer({ ...peer, id: 'A'.repeat(43) }));
  assert.throws(() => parsePeer({ ...peer, label: 'a\nb' }));
  assert.throws(() => parsePeer({ ...peer, role: 'admin' }));
});
test('signal decoding preserves opaque mDNS candidate and checks role/epoch', () => {
  const sessionId=randomUUID(), epoch=randomUUID();
  const message={v:2,id:randomUUID(),sessionId,epoch,kind:'ice-candidate',payload:{candidate:'candidate:1 host.local',sdpMid:null,sdpMLineIndex:null}};
  const expected={sessionId,epoch,role:'sender' as const};
  assert.deepEqual(decodeClientSignal(JSON.stringify(message),expected),message);
  assert.throws(() => decodeClientSignal(JSON.stringify({...message,epoch:randomUUID()}),expected));
  assert.throws(() => decodeClientSignal(JSON.stringify({...message,kind:'answer',payload:{type:'answer',sdp:'v=0'}}),expected));
  assert.throws(() => decodeClientSignal(JSON.stringify({...message,payload:{candidate:'x'.repeat(2049),sdpMid:null,sdpMLineIndex:null}}),expected));
});
