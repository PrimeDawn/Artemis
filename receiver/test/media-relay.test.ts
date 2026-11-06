import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  authorizeMediaHello,
  createMediaRelay,
  type MediaSession,
  type MediaSocket,
  type MediaSink,
} from '../src/media-relay.js';

const session: MediaSession = { sessionId: 's-1', pcId: 'pc-1', deviceId: 'dev-1' };

class FakeSocket implements MediaSocket {
  closed: Array<{ code: number; reason: string }> = [];
  handlers = new Map<string, (...args: any[]) => void>();

  on(event: string, handler: (...args: any[]) => void): this {
    this.handlers.set(event, handler);
    return this;
  }

  close(code: number, reason: string): void {
    this.closed.push({ code, reason });
  }

  emit(event: string, ...args: any[]): void {
    this.handlers.get(event)?.(...args);
  }
}

class FakeSink implements MediaSink {
  chunks: Buffer[] = [];
  ended = false;

  write(chunk: Buffer): void {
    this.chunks.push(Buffer.from(chunk));
  }

  end(): void {
    this.ended = true;
  }
}

const findSession = (id: string) => (id === session.sessionId ? session : null);

test('hello with known session is authorized', () => {
  const hello = JSON.stringify({ pcId: 'pc-1', deviceId: 'dev-1', sessionId: 's-1' });
  assert.deepEqual(authorizeMediaHello(hello, findSession), session);
});

test('hello with unknown session is rejected', () => {
  const hello = JSON.stringify({ pcId: 'pc-1', deviceId: 'dev-1', sessionId: 'other' });
  assert.equal(authorizeMediaHello(hello, findSession), null);
});

test('hello with mismatched device id is rejected', () => {
  const hello = JSON.stringify({ pcId: 'pc-1', deviceId: 'other', sessionId: 's-1' });
  assert.equal(authorizeMediaHello(hello, findSession), null);
});

test('hello that is not valid json is rejected', () => {
  assert.equal(authorizeMediaHello('not json', findSession), null);
});

test('binary before hello closes the socket and writes nothing', () => {
  const socket = new FakeSocket();
  const sink = new FakeSink();
  let opened = 0;
  createMediaRelay({ findSession, openSink: () => { opened += 1; return sink; } }).handle(socket);

  socket.emit('message', Buffer.from([0, 1, 2]), true);

  assert.equal(opened, 0);
  assert.equal(sink.chunks.length, 0);
  assert.equal(socket.closed.length, 1);
  assert.equal(socket.closed[0].code, 1008);
});

test('binary after hello is forwarded to the sink', () => {
  const socket = new FakeSocket();
  const sink = new FakeSink();
  createMediaRelay({ findSession, openSink: () => sink }).handle(socket);

  socket.emit('message', Buffer.from(JSON.stringify({ pcId: 'pc-1', deviceId: 'dev-1', sessionId: 's-1' })), false);
  socket.emit('message', Buffer.from([9, 8, 7]), true);

  assert.equal(sink.chunks.length, 1);
  assert.deepEqual([...sink.chunks[0]], [9, 8, 7]);
  assert.equal(socket.closed.length, 0);
});

test('closing the socket ends the sink once', () => {
  const socket = new FakeSocket();
  const sink = new FakeSink();
  createMediaRelay({ findSession, openSink: () => sink }).handle(socket);

  socket.emit('message', Buffer.from(JSON.stringify({ pcId: 'pc-1', deviceId: 'dev-1', sessionId: 's-1' })), false);
  socket.emit('close');
  socket.emit('close');

  assert.equal(sink.ended, true);
  assert.equal(sink.chunks.length, 0);
});
