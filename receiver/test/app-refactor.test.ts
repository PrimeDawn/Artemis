import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { WebSocket as WsClient } from 'ws';
import { startPairingServer } from '../src/pairing-server.js';
import { canonicalProof } from '../src/protocol.js';

// Spec: spec/versions/v0.1/specs/20261101-1013-tech-应用层无感改造/writer/plan.html §2.2–2.4
// 目标形态：浏览器接收端的页面、票据与通道均不存在；配对与连接状态保留。
// 验证方式：真实 HTTP / 真实 TLS WebSocket 连接真实服务，只在时序上不做真实时长等待。

interface ServerContext { base: string; lan: string; cert: Buffer }

async function withServer(run: (context: ServerContext) => Promise<void>) {
  const dir = await mkdtemp(resolve('../.cache/refactor-unit-'));
  let running: Awaited<ReturnType<typeof startPairingServer>> | undefined;
  try {
    running = await startPairingServer({
      controlHost: '127.0.0.1', controlPort: 0, lanHost: '127.0.0.1', tlsPort: 0,
      dataDir: dir, testOnly: true,
    });
    const cert = await readFile(join(dir, 'certificate.pem'));
    await run({ base: running.controlAddress, lan: running.lanAddress, cert });
  } finally {
    await running?.close();
    assert.ok(dir.startsWith(resolve('../.cache') + sep));
    await rm(dir, { recursive: true, force: true });
  }
}

async function controlCookie(base: string): Promise<string> {
  const control = await fetch(base + '/control');
  const cookie = (control.headers.get('set-cookie') ?? '').split(';')[0];
  assert.ok(cookie.startsWith('artemis_control='), 'control page must issue a session cookie');
  return cookie;
}

test('legacy receiver page route is gone', async () => {
  await withServer(async ({ base }) => {
    const cookie = await controlCookie(base);
    const response = await fetch(base + '/receiver', { headers: { Cookie: cookie } });
    assert.equal(response.status, 404);
  });
});

test('legacy receiver script route is gone', async () => {
  await withServer(async ({ base }) => {
    const cookie = await controlCookie(base);
    const response = await fetch(base + '/assets/receiver.js', { headers: { Cookie: cookie } });
    assert.equal(response.status, 404);
  });
});

test('public state served over real HTTP no longer exposes receiver channel fields', async () => {
  await withServer(async ({ base }) => {
    const cookie = await controlCookie(base);
    const response = await fetch(base + '/api/state', { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const state = (await response.json()).state as Record<string, unknown>;
    assert.equal(Object.hasOwn(state, 'receiverConnected'), false);
    assert.equal(Object.hasOwn(state, 'epoch'), false);
    assert.equal(Object.hasOwn(state, 'sessionId'), true, 'session lifecycle must remain observable');
  });
});

test('waiting event over a real TLS device socket keeps the epoch key for phone compatibility', async () => {
  await withServer(async ({ lan, cert }) => {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const der = pair.publicKey.export({ type: 'spki', format: 'der' });
    const device = {
      id: createHash('sha256').update(der).digest('base64url'),
      publicKeySpki: der.toString('base64url'),
      label: 'test phone',
    };
    const socket = new WsClient(lan.replace('https:', 'wss:') + '/v2/device', { ca: cert });
    const buffered: Array<Record<string, any>> = [];
    const waiters: Array<{ kind: string; resolve: (message: Record<string, any>) => void }> = [];
    socket.on('message', raw => {
      const message = JSON.parse(raw.toString()) as Record<string, any>;
      const index = waiters.findIndex(waiter => waiter.kind === message.kind);
      if (index >= 0) waiters.splice(index, 1)[0].resolve(message);
      else buffered.push(message);
    });
    const next = (kind: string): Promise<Record<string, any>> => {
      const index = buffered.findIndex(message => message.kind === kind);
      if (index >= 0) return Promise.resolve(buffered.splice(index, 1)[0]);
      return new Promise((resolveMessage, reject) => {
        const timer = setTimeout(() => reject(new Error('timed out waiting for ' + kind)), 8000);
        waiters.push({ kind, resolve: message => { clearTimeout(timer); resolveMessage(message); } });
      });
    };
    try {
      await new Promise<void>((resolveOpen, rejectOpen) => { socket.once('open', () => resolveOpen()); socket.once('error', rejectOpen); });
      socket.send(JSON.stringify({ v: 2, kind: 'hello', device }));
      const challenge = await next('challenge');
      const signature = sign('sha256', canonicalProof('proof', challenge.pc.id, device.id, challenge.challengeId, challenge.nonce, challenge.connectionId, 'proof'), pair.privateKey).toString('base64url');
      socket.send(JSON.stringify({ v: 2, kind: 'proof', deviceId: device.id, challengeId: challenge.challengeId, connectionId: challenge.connectionId, signature }));
      const waiting = await next('waiting');
      assert.equal(Object.hasOwn(waiting, 'epoch'), true, 'phone rejects messages without the epoch key');
      assert.equal(waiting.epoch, null);
      assert.equal(waiting.sessionId, null, 'an untrusted device must not receive a session');
    } finally {
      socket.close();
    }
  });
});
