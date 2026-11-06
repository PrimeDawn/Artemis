import { mkdir, readFile, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PairingError, object, parsePeer, type ConnectIntent, type PeerIdentity, type TrustRecord } from './protocol.js';
export interface TrustRepository {
  list(): TrustRecord[]; find(id: string): TrustRecord | null;
  trust(peer: PeerIdentity, nowMs: number): Promise<void>; forget(id: string): Promise<void>;
  readIntent(): ConnectIntent; writeIntent(intent: ConnectIntent): Promise<void>; close(): Promise<void>;
}
export async function openTrustRepository(dataDir: string): Promise<TrustRepository> {
  await mkdir(dataDir,{recursive:true});
  const trustPath=join(dataDir,'trust-store.json'),selectionPath=join(dataDir,'selection.json');
  async function read(path: string, fallback: unknown): Promise<unknown> {
    try { const bytes=await readFile(path);if(bytes.length>65536)throw new Error();return JSON.parse(bytes.toString()); }
    catch(e){ if((e as NodeJS.ErrnoException).code==='ENOENT')return fallback;throw new PairingError('E_STORAGE',500); }
  }
  let peers: TrustRecord[];
  let intent: ConnectIntent;
  try {
    const data=object(await read(trustPath,{schemaVersion:2,peers:[]}),['schemaVersion','peers']);
    if(data.schemaVersion!==2||!Array.isArray(data.peers)||data.peers.length>32)throw new Error();
    peers=data.peers.map(value=>{const r=object(value,['peer','trustedAt','expiresAt']);if(!Number.isSafeInteger(r.trustedAt)||(r.trustedAt as number)<0||r.expiresAt!==null)throw new Error();return{peer:parsePeer(r.peer),trustedAt:r.trustedAt as number,expiresAt:null};});
    if(new Set(peers.map(p=>p.peer.id)).size!==peers.length)throw new Error();
    const i=object(await read(selectionPath,{deviceId:null,desired:'disconnected'}),['deviceId','desired']);
    if(!(i.deviceId===null||typeof i.deviceId==='string'&&peers.some(p=>p.peer.id===i.deviceId))||!['connected','disconnected'].includes(i.desired as string)||i.desired==='connected'&&i.deviceId===null)throw new Error();
    intent=i as unknown as ConnectIntent;
  }catch{throw new PairingError('E_STORAGE',500);}
  let queue=Promise.resolve(),closed=false;
  function serialize(action:()=>Promise<void>):Promise<void>{if(closed)return Promise.reject(new PairingError('E_STORAGE',500));const work=queue.then(action);queue=work.catch(()=>{});return work;}
  async function atomic(path:string,value:unknown):Promise<void>{
    const temp=join(dataDir,`.write-${randomUUID()}`);
    try {const f=await open(temp,'wx',0o600);try{await f.writeFile(JSON.stringify(value));await f.sync();}finally{await f.close();}await rename(temp,path);}
    catch{await unlink(temp).catch(()=>{});throw new PairingError('E_STORAGE',500);}
  }
  return {
    list:()=>structuredClone(peers), find:(id)=>structuredClone(peers.find(p=>p.peer.id===id)??null),
    trust:(input,nowMs)=>serialize(async()=>{const peer=parsePeer(input);if(!Number.isSafeInteger(nowMs)||nowMs<0)throw new PairingError('E_INPUT');const existing=peers.find(p=>p.peer.id===peer.id);if(existing&&existing.peer.publicKeySpki!==peer.publicKeySpki)throw new PairingError('E_IDENTITY_CHANGED',409);if(!existing&&peers.length>=32)throw new PairingError('E_RATE_LIMIT',429);const next=[...peers.filter(p=>p.peer.id!==peer.id),{peer,trustedAt:existing?.trustedAt??nowMs,expiresAt:null as null}];await atomic(trustPath,{schemaVersion:2,peers:next});peers=next;}),
    forget:(id)=>serialize(async()=>{
      // Clear selection first: a crash between writes must never auto-resume a forgotten peer.
      if(intent.deviceId===id){const next:ConnectIntent={deviceId:null,desired:'disconnected'};await atomic(selectionPath,next);intent=next;}
      const next=peers.filter(p=>p.peer.id!==id);await atomic(trustPath,{schemaVersion:2,peers:next});peers=next;
    }),
    readIntent:()=>structuredClone(intent),
    writeIntent:(i)=>serialize(async()=>{if(!['connected','disconnected'].includes(i.desired)||i.deviceId!==null&&!peers.some(p=>p.peer.id===i.deviceId)||i.desired==='connected'&&i.deviceId===null)throw new PairingError('E_INPUT');await atomic(selectionPath,i);intent=structuredClone(i);}),
    close:async()=>{closed=true;await queue;},
  };
}
