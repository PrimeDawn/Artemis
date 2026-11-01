import type { NetworkInterfaceInfo } from 'node:os';
import { isIP } from 'node:net';
import { win32 } from 'node:path';
import { PairingError, type PairingConfig } from './protocol.js';
export function privateIpv4(ip: string): boolean {
  if (isIP(ip) !== 4) return false;
  const [a,b] = ip.split('.').map(Number); return a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31;
}
export function parsePairingConfig(env: NodeJS.ProcessEnv, interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>): PairingConfig {
  const fail = () => { throw new PairingError('E_CONFIG'); };
  const lanHost = env.ARTEMIS_LAN_HOST ?? fail();
  const assigned = Object.values(interfaces).flat().some(i => i?.family === 'IPv4' && i.address === lanHost && !i.internal);
  if (!privateIpv4(lanHost) || !assigned) fail();
  const dataDir = env.ARTEMIS_DATA_DIR ?? fail(), opensslPath = env.ARTEMIS_OPENSSL_PATH ?? fail();
  if (!win32.isAbsolute(dataDir) || !win32.isAbsolute(opensslPath)) fail();
  function port(raw: string | undefined, fallback: number): number {
    if (raw === undefined) return fallback;
    if (!/^[0-9]+$/u.test(raw)) return fail();
    const n=Number(raw); if (!Number.isSafeInteger(n) || n < 1024 || n > 65535) return fail(); return n;
  }
  const controlPort=port(env.ARTEMIS_CONTROL_PORT,3000),tlsPort=port(env.ARTEMIS_TLS_PORT,3443);
  if (controlPort === tlsPort) fail();
  return { controlHost:'127.0.0.1',controlPort,lanHost,tlsPort,dataDir,opensslPath };
}
