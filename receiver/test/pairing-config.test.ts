import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePairingConfig } from '../src/pairing-config.js';
const env={ARTEMIS_LAN_HOST:'192.168.1.50',ARTEMIS_DATA_DIR:'C:\\ArtemisData'};
const interfaces={eth:[{address:'192.168.1.50',netmask:'255.255.255.0',family:'IPv4' as const,mac:'00:00:00:00:00:00',internal:false,cidr:'192.168.1.50/24'}]};
test('explicit assigned LAN address and absolute data directory are required',()=>{
  const config=parsePairingConfig(env,interfaces);assert.equal(config.lanHost,'192.168.1.50');assert.equal(config.dataDir,env.ARTEMIS_DATA_DIR);assert.equal(config.controlPort,3000);
  for(const change of [{ARTEMIS_LAN_HOST:'8.8.8.8'},{ARTEMIS_LAN_HOST:'192.168.1.51'},{ARTEMIS_DATA_DIR:'data'},{ARTEMIS_LAN_HOST:'0.0.0.0'},{ARTEMIS_TLS_PORT:'3000'},{ARTEMIS_TLS_PORT:'2e3'}]) assert.throws(()=>parsePairingConfig({...env,...change},interfaces));
});

test('media port defaults to 3450 and accepts an explicit override', () => {
  assert.equal(parsePairingConfig(env, interfaces).mediaPort, 3450);
  const custom = parsePairingConfig({ ...env, ARTEMIS_MEDIA_PORT: '3460' }, interfaces);
  assert.equal(custom.mediaPort, 3460);
});

test('invalid media port is rejected without fallback', () => {
  for (const raw of ['', '1023', '65536', '3e3', '3460a', '-1']) {
    assert.throws(() => parsePairingConfig({ ...env, ARTEMIS_MEDIA_PORT: raw }, interfaces));
  }
});
