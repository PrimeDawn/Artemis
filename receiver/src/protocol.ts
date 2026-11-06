// Spec2 writer/plan.html r2 §3.3: v2 identity and signal boundary.
import { createHash, createPublicKey, verify } from 'node:crypto';
export type DeviceId = string;
export type Clock = { wallMs(): number; monotonicMs(): number };
export type RandomBytes = (count: number) => Buffer;
export interface PeerIdentity { id: string; publicKeySpki: string; label: string }
export interface TrustRecord { peer: PeerIdentity; trustedAt: number; expiresAt: null }
export interface ConnectIntent { deviceId: string | null; desired: 'connected' | 'disconnected' }
export interface DeviceView { device: PeerIdentity; online: boolean; trusted: boolean; state: 'available' | 'awaiting-approval' | 'connecting' | 'connected' | 'reconnecting' | 'busy' | 'identity-changed' }
export interface PublicState { devices: DeviceView[]; intent: ConnectIntent; sessionId: string | null; expiresAt: null }
export interface PairingConfig { controlHost: '127.0.0.1'; controlPort: number; lanHost: string; tlsPort: number; dataDir: string; mediaPort?: number; testOnly?: boolean }
export interface TlsIdentity { peer: PeerIdentity; privateKeyPem: Buffer; certificatePem: Buffer; certificateExpiresAt: number; ipAddress: string }
export type SafeLogger = (event: { name: string; requestId: string; code: string | null }) => void;
export class PairingError extends Error {
  constructor(public code: string, public status = 400) { super(code); this.name = 'PairingError'; }
}
export function canonicalProof(kind: string, pcId: string, deviceId: string, challengeId: string, nonce: string, connectionId: string, decision: string): Buffer {
  const fields = [kind, pcId, deviceId, challengeId, nonce, connectionId, decision];
  if (fields.some(x => !x || /[\r\n]/u.test(x))) throw new PairingError('E_INPUT');
  return Buffer.from(['artemis-v2', ...fields].join('\n'));
}
export function base64(value: unknown, maxBytes: number): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value) || value.length > Math.ceil(maxBytes * 4 / 3)) throw new PairingError('E_INPUT');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length > maxBytes || bytes.toString('base64url') !== value) throw new PairingError('E_INPUT');
  return bytes;
}
export function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PairingError('E_INPUT');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== keys.length || !keys.every(k => Object.hasOwn(data, k))) throw new PairingError('E_INPUT');
  return data;
}
export function verifyIdentityProof(publicKeySpki: string, message: Buffer, signature: string): boolean {
  try { return verify('sha256', message, createPublicKey({ key: base64(publicKeySpki, 256), format: 'der', type: 'spki' }), base64(signature, 80)); } catch { return false; }
}
export function parsePeer(value: unknown): PeerIdentity {
  const p = object(value, ['id', 'publicKeySpki', 'label']);
  if (typeof p.label !== 'string' || !p.label.trim() || [...p.label].length > 64 || /[\x00-\x1f\x7f]/u.test(p.label)) throw new PairingError('E_INPUT');
  try {
    const bytes = base64(p.publicKeySpki, 256);
    const key = createPublicKey({ key: bytes, format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1' || !key.export({ format: 'der', type: 'spki' }).equals(bytes) || p.id !== createHash('sha256').update(bytes).digest('base64url')) throw new Error();
  } catch { throw new PairingError('E_INPUT'); }
  return p as unknown as PeerIdentity;
}
export function uuid(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value); }
