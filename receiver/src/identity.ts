import type { PairingConfig, TlsIdentity } from './protocol.js';
import { PairingError,parsePeer } from './protocol.js';
import { generateKeyPairSync,createHash,createPrivateKey,createPublicKey,X509Certificate,randomUUID } from 'node:crypto';
import { mkdir,readFile,writeFile,rename,unlink,realpath } from 'node:fs/promises';
import { join,win32 } from 'node:path';import { hostname } from 'node:os';import { execFile } from 'node:child_process';import { promisify } from 'node:util';import { issueSelfSignedCertificate } from './cert.js';
const exec=promisify(execFile),contexts=new WeakMap<TlsIdentity,PairingConfig>();
async function protect(dir:string):Promise<void>{
  if(!win32.isAbsolute(await realpath(dir)))throw new PairingError('E_IDENTITY',500);
  if(process.platform==='win32'){
    const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command','[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],{windowsHide:true});
    const sid=stdout.trim();if(!/^S-1-[0-9-]+$/u.test(sid))throw new Error();
    await exec('icacls.exe',[dir,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`],{windowsHide:true});
  }
}
function describe(key:Buffer,certificate:Buffer,ip:string,config:PairingConfig):TlsIdentity{
  const publicKey=createPublicKey(createPrivateKey(key));const bytes=publicKey.export({type:'spki',format:'der'});
  const cert=new X509Certificate(certificate);
  if(!cert.publicKey.export({type:'spki',format:'der'}).equals(bytes)||!cert.verify(publicKey)||!cert.checkIP(ip))throw new PairingError('E_IDENTITY',500);
  const peer=parsePeer({id:createHash('sha256').update(bytes).digest('base64url'),publicKeySpki:bytes.toString('base64url'),label:hostname().slice(0,64)||'Artemis PC'});
  const identity={peer,privateKeyPem:key,certificatePem:certificate,certificateExpiresAt:Date.parse(cert.validTo),ipAddress:ip};contexts.set(identity,config);return identity;
}
async function issue(config:PairingConfig,key:Buffer,ip:string):Promise<TlsIdentity>{
  const tmp=join(config.dataDir,`.certificate-${randomUUID()}.pem`);
  try{
    // 依据 writer/plan.html §3.2：自签证书在进程内生成，不再调用外部 openssl。
    const issued=await issueSelfSignedCertificate({privateKeyPem:key.toString('utf8'),ipAddress:ip,notBeforeMs:Date.now(),validDays:30});
    const identity=describe(key,issued.certificatePem,ip,config);
    await writeFile(tmp,issued.certificatePem,{mode:0o600});
    await rename(tmp,join(config.dataDir,'certificate.pem'));return identity;
  }catch{await unlink(tmp).catch(()=>{});throw new PairingError('E_IDENTITY',500);}
}
export async function loadOrCreateIdentity(config: PairingConfig): Promise<TlsIdentity> {
  try{
    await mkdir(config.dataDir,{recursive:true,mode:0o700});await protect(config.dataDir);
    const keyPath=join(config.dataDir,'identity-key.pem');let key:Buffer;
    try{key=await readFile(keyPath);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;key=Buffer.from(generateKeyPairSync('ec',{namedCurve:'prime256v1',privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey);await writeFile(keyPath,key,{flag:'wx',mode:0o600});}
    try{const certificate=await readFile(join(config.dataDir,'certificate.pem'));const identity=describe(key,certificate,config.lanHost,config);const now=Date.now(),cert=new X509Certificate(certificate);if(Date.parse(cert.validFrom)>now)throw new Error();if(identity.certificateExpiresAt-now>=7*86400000)return identity;}catch{}
    return await issue(config,key,config.lanHost);
  }catch{throw new PairingError('E_IDENTITY',500);}
}
export async function renewCertificate(identity: TlsIdentity, ip: string, nowMs: number): Promise<TlsIdentity> {
  const config=contexts.get(identity);if(!config||!Number.isFinite(nowMs))throw new PairingError('E_IDENTITY',500);
  return issue({...config,lanHost:ip},identity.privateKeyPem,ip);
}
