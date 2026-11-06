// @peculiar/x509 内部用 tsyringe 做依赖注入，必须在它之前加载 reflect-metadata。
import 'reflect-metadata';
import { webcrypto } from 'node:crypto';
import { createPrivateKey, createPublicKey, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import * as x509 from '@peculiar/x509';

// 依据 writer/plan.html §3.2：证书签发不再调用外部 openssl 进程。
// 手机侧只接受带当前局域网 IP SAN 的证书，因此 SAN 与有效期是硬约束。
x509.cryptoProvider.set(webcrypto as unknown as Crypto);

export interface SelfSignedCertRequest {
  readonly privateKeyPem: string;
  readonly ipAddress: string;
  readonly notBeforeMs: number;
  readonly validDays: number;
}

export interface SelfSignedCertResult {
  readonly certificatePem: Buffer;
  readonly expiresAtMs: number;
}

const ONE_DAY_MS = 86400000;
const SUBJECT = 'CN=Artemis local receiver';
const SERVER_AUTH_OID = '1.3.6.1.5.5.7.3.1';

export async function issueSelfSignedCertificate(request: SelfSignedCertRequest): Promise<SelfSignedCertResult> {
  if (isIP(request.ipAddress) !== 4) {
    throw new Error(`cert: not an IPv4 address: ${request.ipAddress}`);
  }
  if (!Number.isFinite(request.notBeforeMs) || !Number.isInteger(request.validDays) || request.validDays <= 0) {
    throw new Error('cert: invalid validity window');
  }
  const keyObject = createPrivateKey(request.privateKeyPem);
  if (keyObject.asymmetricKeyType !== 'ec' || keyObject.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error('cert: private key must be an EC P-256 key');
  }
  const publicKeyObject = createPublicKey(keyObject);
  const algorithm = { name: 'ECDSA', namedCurve: 'P-256' } as EcKeyImportParams;
  const privateKey = await webcrypto.subtle.importKey('pkcs8', keyObject.export({ type: 'pkcs8', format: 'der' }), algorithm, false, ['sign']);
  const publicKey = await webcrypto.subtle.importKey('spki', publicKeyObject.export({ type: 'spki', format: 'der' }), algorithm, true, ['verify']);

  const notBefore = new Date(request.notBeforeMs);
  const expiresAtMs = request.notBeforeMs + request.validDays * ONE_DAY_MS;
  const certificate = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: randomBytes(16).toString('hex'),
    name: SUBJECT,
    notBefore,
    notAfter: new Date(expiresAtMs),
    signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
    keys: {
      privateKey: privateKey as unknown as CryptoKey,
      publicKey: publicKey as unknown as CryptoKey,
    },
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension([SERVER_AUTH_OID]),
      new x509.SubjectAlternativeNameExtension([{ type: 'ip', value: request.ipAddress }]),
    ],
  });

  return { certificatePem: Buffer.from(certificate.toString('pem'), 'utf8'), expiresAtMs };
}
