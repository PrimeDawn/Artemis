import {runContext,startService,controlSession,pair,until,invariant} from './pairing-test-support.mjs';
const run=await runContext(process.argv[2],'Real TLS heartbeat loss and trusted reconnect');
let service,peer,error;
try {
 service=await startService(run);const control=await controlSession(service);
 peer=await pair(service,control);
 await run.test('responsive-session-remains-connected',async()=>{
  const session=(await control.state()).sessionId;
  await until(()=>peer.box.pings>=4,'Four actual ping/pong exchanges',6500);
  invariant((await control.state()).sessionId===session,'Same responsive session retained');
  return {actualPings:peer.box.pings,sameSession:true};
 });
 await run.test('missing-pong-clears-session',async()=>{
  // Disable only the real test peer's automatic Pong; TCP and TLS stay open.
  peer.box.ws._autoPong=false;const started=performance.now();
  await until(async()=>!(await control.state()).sessionId,'PC detects missing Pong',3100);
  return {elapsedMs:Math.round(performance.now()-started)};
 });
 await run.test('trusted-peer-reconnects-without-consent',async()=>{
  await peer.connect(service);
  await until(async()=>!!(await control.state()).sessionId,'Remembered intent restores session');
  invariant(peer.approvals===1,'No second approval');
  return {approvals:peer.approvals};
 });
}catch(e){error=e;}finally{await peer?.close();await service?.close();await run.finish(error);}
if(error)process.exitCode=1;
