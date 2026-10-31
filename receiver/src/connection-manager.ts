import { createHash,randomUUID } from 'node:crypto';
import { PairingError,parsePeer,canonicalProof,verifyIdentityProof,decodeClientSignal,type Clock,type RandomBytes,type PeerIdentity,type PublicState,type DeviceView,type Role } from './protocol.js';
import type { TrustRepository } from './trust-repository.js';
export interface DeviceChannel { connectionId: string; send(event: unknown): void; close(code: number): void }
export interface ReceiverChannel { send(event: unknown): void; close(code: number): void }
export interface ConnectionManager {
  devices(): DeviceView[]; state(): PublicState; select(deviceId: string): Promise<void>; disconnect(): Promise<void>; forget(deviceId: string): Promise<void>;
  issueReceiverTicket(): { ticket: string; sessionId: string; expiresAt: number }; redeemReceiverTicket(ticket: string): { sessionId: string };
  subscribe(listener: (state: PublicState) => void): () => void; close(): Promise<void>;
  registerDevice(peer: PeerIdentity, channel: DeviceChannel, pcId: string): void; lostDevice(id: string, channel: DeviceChannel): void;
  decide(id: string, requestId: string, nonce: string, allow: boolean, signature: string): Promise<void>;
  requestEnrollment(id: string): Promise<void>;
  attachReceiver(channel: ReceiverChannel): void; lostReceiver(channel: ReceiverChannel): void;
  route(role: Role, text: string): void;
}
export function createConnectionManager(repo: TrustRepository, clock: Clock, random: RandomBytes): ConnectionManager {
  const online=new Map<string,{peer:PeerIdentity;channel:DeviceChannel;pcId:string}>();
  const listeners=new Set<(state:PublicState)=>void>();
  let approval:{id:string;requestId:string;nonce:string;connectionId:string}|null=null;
  let sessionId:string|null=null,epoch:string|null=null,receiver:ReceiverChannel|null=null,closed=false;
  let ticket:{hash:string;deadline:number;sessionId:string}|null=null,reserved=false;
  let ids=new Set<string>(),iceCount=0,operations=Promise.resolve();
  function fail(code:string,status=409):never{throw new PairingError(code,status);}
  const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
  function devices():DeviceView[]{
    const all=new Map(repo.list().map(r=>[r.peer.id,r.peer]));for(const [id,p]of online)all.set(id,p.peer);
    const intent=repo.readIntent();return [...all.values()].map(device=>({device:structuredClone(device),online:online.has(device.id),trusted:repo.find(device.id)!==null,state:approval?.id===device.id?'awaiting-approval':intent.deviceId===device.id&&intent.desired==='connected'?(sessionId?'connected':'reconnecting'):'available'}));
  }
  function state():PublicState{return {devices:devices(),intent:repo.readIntent(),sessionId,expiresAt:null,receiverConnected:receiver!==null,epoch};}
  function emit(){const value=state();for(const f of listeners)f(value);}
  function sender(){const intent=repo.readIntent();return intent.deviceId?online.get(intent.deviceId):undefined;}
  function sendState(){const kind=epoch?'ready':'waiting';const event={v:2,kind,sessionId,epoch};sender()?.channel.send(event);receiver?.send(event);emit();}
  function invalidate(){epoch=null;ticket=null;reserved=false;ids=new Set();iceCount=0;}
  function clearSession(keepReceiver=false){sessionId=null;invalidate();if(!keepReceiver){const old=receiver;receiver=null;old?.close(4000);}}
  function activate(id:string,manual=true){if(closed)return;const p=online.get(id);if(!p||!repo.find(id))return;clearSession(true);sessionId=randomUUID();if(receiver)epoch=randomUUID();p.channel.send({v:2,kind:'activated',manual});sendState();}
  function run(action:()=>Promise<void>):Promise<void>{const work=operations.then(()=>{if(closed)fail('E_CLOSED');return action();});operations=work.catch(()=>{});return work;}
  return {
    devices,state,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f);},
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
    lostDevice:(id,channel)=>{if(online.get(id)?.channel!==channel)return;online.delete(id);if(approval?.id===id)approval=null;if(repo.readIntent().deviceId===id){clearSession(true);receiver?.send({v:2,kind:'waiting',sessionId:null,epoch:null});}emit();},
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
    issueReceiverTicket:()=>{
      if(!sessionId||!sender())fail('E_NOT_FOUND',404);if(receiver||reserved)fail('E_CONFLICT');
      const raw=random(32).toString('base64url');ticket={hash:digest(raw),deadline:clock.monotonicMs()+60000,sessionId};return {ticket:raw,sessionId,expiresAt:clock.wallMs()+60000};
    },
    redeemReceiverTicket:raw=>{const t=ticket;if(!t||digest(raw)!==t.hash)fail('E_AUTH',401);ticket=null;if(clock.monotonicMs()>=t.deadline)fail('E_HANDSHAKE_EXPIRED',410);if(t.sessionId!==sessionId||receiver||reserved)fail('E_CONFLICT');reserved=true;return {sessionId:t.sessionId};},
    attachReceiver:channel=>{if(!reserved||!sessionId||receiver)fail('E_AUTH',401);reserved=false;receiver=channel;epoch=randomUUID();ids=new Set();iceCount=0;sendState();},
    lostReceiver:channel=>{if(receiver!==channel)return;receiver=null;invalidate();sendState();},
    route:(role,text)=>{
      if(!sessionId||!epoch||!receiver||!sender())fail('E_NOT_TRUSTED',403);
      const message=decodeClientSignal(text,{sessionId,epoch,role});if(ids.has(message.id))fail('E_REPLAY');if(ids.size>=1024||message.kind==='ice-candidate'&&iceCount>=128)fail('E_RATE_LIMIT',429);
      ids.add(message.id);if(message.kind==='ice-candidate')iceCount++;
      const destination=role==='sender'?receiver:sender()!.channel;destination.send({v:2,kind:'signal',signal:message});
    },
    close:async()=>{closed=true;await operations;for(const p of online.values())p.channel.close(1001);online.clear();clearSession();listeners.clear();},
  };
}
