import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, generateKeyPairSync, X509Certificate } from 'node:crypto';
import { issueSelfSignedCertificate } from '../src/cert.js';

function newKeyPairPem(): { privateKeyPem: string; publicKey: ReturnType<typeof createPublicKey> } {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: createPublicKey(privateKey),
  };
}

const ONE_DAY_MS = 86400000;

test('issues a self-signed certificate that verifies against its own key and carries the IP SAN', async () => {
  const key = newKeyPairPem();
  const notBeforeMs = Date.parse('2026-11-06T00:00:00Z');
  const result = await issueSelfSignedCertificate({
    privateKeyPem: key.privateKeyPem,
    ipAddress: '192.168.1.20',
    notBeforeMs,
    validDays: 30,
  });

  const certificate = new X509Certificate(result.certificatePem);
  assert.equal(certificate.verify(key.publicKey), true);
  assert.equal(certificate.checkIP('192.168.1.20'), '192.168.1.20');
  assert.equal(certificate.checkIP('192.168.1.21'), undefined);
  assert.equal(result.expiresAtMs - notBeforeMs, 30 * ONE_DAY_MS);
  assert.equal(Date.parse(certificate.validTo), result.expiresAtMs);
});

test('re-issuing with the same private key keeps the pinned public key while changing the serial number', async () => {
  const key = newKeyPairPem();
  const first = await issueSelfSignedCertificate({
    privateKeyPem: key.privateKeyPem,
    ipAddress: '10.0.0.5',
    notBeforeMs: Date.parse('2026-11-06T00:00:00Z'),
    validDays: 30,
  });
  const second = await issueSelfSignedCertificate({
    privateKeyPem: key.privateKeyPem,
    ipAddress: '10.0.0.6',
    notBeforeMs: Date.parse('2026-11-06T01:00:00Z'),
    validDays: 30,
  });

  const firstCert = new X509Certificate(first.certificatePem);
  const secondCert = new X509Certificate(second.certificatePem);
  assert.equal(firstCert.publicKey.export({ type: 'spki', format: 'der' }).equals(
    secondCert.publicKey.export({ type: 'spki', format: 'der' })), true);
  assert.notEqual(firstCert.serialNumber, secondCert.serialNumber);
  assert.equal(secondCert.checkIP('10.0.0.6'), '10.0.0.6');
  assert.equal(secondCert.checkIP('10.0.0.5'), undefined);
});

test('rejects an address that is not an IPv4 literal instead of silently emitting a broken SAN', async () => {
  const key = newKeyPairPem();
  await assert.rejects(() => issueSelfSignedCertificate({
    privateKeyPem: key.privateKeyPem,
    ipAddress: 'not-an-ip',
    notBeforeMs: Date.parse('2026-11-06T00:00:00Z'),
    validDays: 30,
  }));
});

test('rejects a private key that is not a P-256 PKCS#8 PEM', async () => {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  await assert.rejects(() => issueSelfSignedCertificate({
    privateKeyPem: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    ipAddress: '192.168.1.20',
    notBeforeMs: Date.parse('2026-11-06T00:00:00Z'),
    validDays: 30,
  }));
});

test('exposes the parsed identity through node:crypto without an external openssl process', async () => {
  const key = newKeyPairPem();
  const result = await issueSelfSignedCertificate({
    privateKeyPem: key.privateKeyPem,
    ipAddress: '172.16.4.9',
    notBeforeMs: Date.parse('2026-11-06T00:00:00Z'),
    validDays: 30,
  });
  const parsed = new X509Certificate(result.certificatePem);
  assert.equal(parsed.ca, false);
  assert.match(parsed.subject, /CN=Artemis local receiver/u);
  assert.match(parsed.keyUsage?.join(',') ?? '', /1\.3\.6\.1\.5\.5\.7\.3\.1/u);
  assert.equal(createPrivateKey(key.privateKeyPem).asymmetricKeyType, 'ec');
});
