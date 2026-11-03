import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveUpgradeTarget } from '../src/upgrade-router.js';

// writer/plan.html §3：/audio 与 /media 平级，控制通道路径不得被抢走。
test('/media routes to the video channel', () => {
  assert.equal(resolveUpgradeTarget('/media'), 'media');
});

test('/media keeps routing with a query string', () => {
  assert.equal(resolveUpgradeTarget('/media?session=s-1'), 'media');
});

test('/audio routes to the audio channel', () => {
  assert.equal(resolveUpgradeTarget('/audio'), 'audio');
});

test('/audio keeps routing with a query string', () => {
  assert.equal(resolveUpgradeTarget('/audio?session=s-1'), 'audio');
});

test('lookalike prefixes stay on the control channel', () => {
  assert.equal(resolveUpgradeTarget('/mediax'), 'control');
  assert.equal(resolveUpgradeTarget('/audiofoo'), 'control');
});

test('the device control path stays on the control channel', () => {
  assert.equal(resolveUpgradeTarget('/v2/device'), 'control');
});

test('an empty path stays on the control channel', () => {
  assert.equal(resolveUpgradeTarget(''), 'control');
});
