import type{PairingConfig,TlsIdentity}from'./protocol.js';
import Bonjour from'bonjour-service';
export function discoveryAdvertisement(config:PairingConfig,identity:TlsIdentity):{name:string;type:string;port:number;host:string;txt:Record<string,string>;disableIPv6:boolean}{return{name:`Artemis-${identity.peer.id.slice(0,12)}`,type:'artemis',port:config.tlsPort,host:`artemis-${Buffer.from(identity.peer.id,'base64url').toString('hex').slice(0,16)}.local`,txt:{v:'2',pcId:identity.peer.id,spki:identity.peer.publicKeySpki,label:identity.peer.label},disableIPv6:true};}
export async function publishDiscovery(config:PairingConfig,identity:TlsIdentity,onError:(error:Error)=>void):Promise<{close():Promise<void>}>{
 const options={interface:config.lanHost,reuseAddr:true};const bonjour=new Bonjour(options as never,(error:Error)=>onError(error));
 const service=bonjour.publish(discoveryAdvertisement(config,identity));
 // bonjour-service normally advertises every NIC. Keep the selected IPv4 only.
 const records=service.records.bind(service);service.records=()=>records().filter(r=>r.type!=='AAAA'&&(r.type!=='A'||r.data===config.lanHost));
 service.on('error',onError);let closed:Promise<void>|undefined;
 return{close:()=>closed??=new Promise<void>(resolve=>{bonjour.unpublishAll(()=>bonjour.destroy(()=>resolve()));})};
}
