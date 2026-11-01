import { randomUUID } from 'node:crypto';
import { PairingError,parsePeer,canonicalProof,verifyIdentityProof,type Clock,type RandomBytes,type PeerIdentity,type PublicState,type DeviceView } from './protocol.js';
import type { TrustRepository } from './trust-repository.js';
export interface DeviceChannel { connectionId: string; send(event: unknown): void; close(code: number): void }
export interface ConnectionManager {
  devices(): DeviceView[]; state(): PublicState; activeDevice(): string | null; select(deviceId: string): Promise<void>; disconnect(): Promise<void>; forget(deviceId: string): Promise<void>;
  subscribe(listener: (state: PublicState) => void): () => void; close(): Promise<void>;
  registerDevice(peer: PeerIdentity, channel: DeviceChannel, pcId: string): void; lostDevice(id: string, channel: DeviceChannel): void;
  decide(id: string, requestId: string, nonce: string, allow: boolean, signature: string): Promise<void>;
  requestEnrollment(id: string): Promise<void>;
}
export function createConnectionManager(repo: TrustRepository, clock: Clock, random: RandomBytes): ConnectionManager {
  const online=new Map<string,{peer:PeerIdentity;channel:DeviceChannel;pcId:string}>();
  const listeners=new Set<(state:PublicState)=>void>();
  let approval:{id:string;requestId:string;nonce:string;connectionId:string}|null=null;
  let sessionId:string|null=null,activeDeviceId:string|null=null,closed=false;
  let operations=Promise.resolve();
  function fail(code:string,status=409):never{throw new PairingError(code,status);}
  function devices():DeviceView[]{
    const all=new Map(repo.list().map(r=>[r.peer.id,r.peer]));for(const [id,p]of online)all.set(id,p.peer);
    const intent=repo.readIntent();return [...all.values()].map(device=>({device:structuredClone(device),online:online.has(device.id),trusted:repo.find(device.id)!==null,state:approval?.id===device.id?'awaiting-approval':intent.deviceId===device.id&&intent.desired==='connected'?(sessionId?'connected':'reconnecting'):'available'}));
  }
  function activeDevice():string|null{return activeDeviceId;}
function state():PublicState{return {devices:devices(),intent:repo.readIntent(),sessionId,expiresAt:null};}
  function emit(){const value=state();for(const f of listeners)f(value);}
  function sender(){const intent=repo.readIntent();return intent.deviceId?online.get(intent.deviceId):undefined;}
  // Wire contract: the phone validates the exact key set `v,kind,sessionId,epoch` (DeviceClient.kt:70),
  // so `epoch` stays present as null even though the receiver channel no longer exists.
  function sendState(){const kind=sessionId?'ready':'waiting';const event={v:2,kind,sessionId,epoch:null};sender()?.channel.send(event);emit();}
  function clearSession(){sessionId=null;activeDeviceId=null;}
  function activate(id:string,manual=true){if(closed)return;const p=online.get(id);if(!p||!repo.find(id))return;clearSession();sessionId=randomUUID();activeDeviceId=id;p.channel.send({v:2,kind:'activated',manual});sendState();}
  function run(action:()=>Promise<void>):Promise<void>{const work=operations.then(()=>{if(closed)fail('E_CLOSED');return action();});operations=work.catch(()=>{});return work;}
  return {
    devices,state,activeDevice,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f);},
    registerDevice:(input,channel,pcId)=>{
      if(closed)fail('E_CLOSED');const peer=parsePeer(input);
      const known=repo.find(peer.id);if(known&&known.peer.publicKeySpki!==peer.publicKeySpki)fail('E_IDENTITY_CHANGED');
      const intent=repo.readIntent(),previous=online.get(peer.id);
      // Only a fresh, broker-verified proof of the same selected identity may supersede its old TCP transport.
      if(previous){if(!known||intent.deviceId!==peer.id||intent.desired!=='connected')fail('E_CONFLICT');online.delete(peer.id);previous.channel.close(4009);}
      if(online.size>=32)fail('E_RATE_LIMIT',429);
      online.set(peer.id,{peer,channel,pcId});
      if(known&&intent.deviceId===peer.id&&intent.desired==='connected')activate(peer.id,false);
      else {channel.send({v:2,kind:'waiting',sessionId:null,epoch:null});emit();}
    },
    lostDevice:(id,channel)=>{if(online.get(id)?.channel!==channel)return;online.delete(id);if(approval?.id===id)approval=null;if(repo.readIntent().deviceId===id)clearSession();emit();},
    select:id=>run(async()=>{
      const p=online.get(id);if(!p)fail('E_NOT_FOUND',404);const intent=repo.readIntent();
      if(intent.desired==='connected'&&intent.deviceId!==id||approval&&approval.id!==id)fail('E_BUSY');
      if(repo.find(id)){await repo.writeIntent({deviceId:id,desired:'connected'});if(!sessionId)activate(id);return;}
      if(approval?.id===id)return;
      approval={id,requestId:randomUUID(),nonce:random(32).toString('base64url'),connectionId:p.channel.connectionId};
      p.channel.send({v:2,kind:'enroll-request',pcId:p.pcId,deviceId:id,requestId:approval.requestId,nonce:approval.nonce});emit();
    }),
    decide:(id,requestId,nonce,allow,signature)=>run(async()=>{
      const p=online.get(id),request=approval;
      if(!p||!request||request.id!==id||request.requestId!==requestId||request.nonce!==nonce||request.connectionId!==p.channel.connectionId)fail('E_REPLAY');
      if(!verifyIdentityProof(p.peer.publicKeySpki,canonicalProof('enroll-decision',p.pcId,id,requestId,nonce,p.channel.connectionId,allow?'allow':'deny'),signature))fail('E_AUTH',401);
      approval=null;
      if(!allow){p.channel.send({v:2,kind:'denied'});emit();return;}
      await repo.trust(p.peer,clock.wallMs());await repo.writeIntent({deviceId:id,desired:'connected'});
      p.channel.send({v:2,kind:'trusted',pcId:p.pcId});activate(id);
    }),
    requestEnrollment:id=>run(async()=>{
      const p=online.get(id),intent=repo.readIntent();if(!p||!repo.find(id)||intent.deviceId!==id||intent.desired!=='connected')fail('E_NOT_TRUSTED',403);
      await repo.writeIntent({...intent,desired:'disconnected'});clearSession();approval={id,requestId:randomUUID(),nonce:random(32).toString('base64url'),connectionId:p.channel.connectionId};
      p.channel.send({v:2,kind:'enroll-request',pcId:p.pcId,deviceId:id,requestId:approval.requestId,nonce:approval.nonce});emit();
    }),
    disconnect:()=>run(async()=>{await repo.writeIntent({...repo.readIntent(),desired:'disconnected'});approval=null;const old=sender();clearSession();old?.channel.send({v:2,kind:'waiting',sessionId:null,epoch:null});emit();}),
    forget:id=>run(async()=>{const selected=repo.readIntent().deviceId===id;await repo.forget(id);if(approval?.id===id)approval=null;const p=online.get(id);online.delete(id);if(selected)clearSession();p?.channel.send({v:2,kind:'revoked'});p?.channel.close(4001);emit();}),
    close:async()=>{closed=true;await operations;for(const p of online.values())p.channel.close(1001);online.clear();clearSession();listeners.clear();},
  };
}
