// Passive observation of real TLS plaintext frame headers and socket events.
// Payloads, keys, cookies and signatures are never logged. No traffic is changed.
import {runContext,startService,controlSession,invariant,delay} from './pairing-test-support.mjs';
import {readFile,writeFile,readdir,appendFile} from 'node:fs/promises';import {resolve,join} from 'node:path';
import {X509Certificate,createHash} from 'node:crypto';import {Server as HttpsServer} from 'node:https';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return[x.slice(2,i),x.slice(i+1)];}));
// D-032: bounded individual operations, no obsolete five-minute round cutoff.
const budget={startedAt:new Date().toISOString()},deadline=Infinity;
const run=await runContext(args.out,'Real S24 lock transport diagnosis'),exec=promisify(execFile),adb='E:/Dev/Artemis/Android/Sdk/platform-tools/adb.exe',app='io.github.primedawn.artemis';
let service,control,error,sequence=0,originalPower,powerChanged=false,restoredPower;const originalEmit=HttpsServer.prototype.emit,observations=[];
const left=()=>{const value=deadline-Date.now();invariant(value>0,'E_TEST_BUDGET');return value;};
async function device(...a){return(await exec(adb,a,{timeout:Math.min(8000,left()),windowsHide:true})).stdout.trim();}
const shell=(...a)=>device('shell',...a);
async function wait(fn,ms,message){const end=Date.now()+Math.min(ms,left());while(Date.now()<end){if(await fn())return;await delay(100);}throw Error(message);}
async function actualState(label){const state=await control.state();observations.push({at:new Date().toISOString(),label,state});return state;}
async function phoneSnapshot(label){
 const pid=await shell('pidof',app),port=await device('forward','tcp:0','jdwp:'+pid);
 try{const value=await exec('C:/Program Files/BellSoft/LibericaJDK-17/bin/java.exe',['--add-modules','jdk.jdi','-cp','.cache/diag-classes','ArtemisRuntimeSnapshot',port],{timeout:Math.min(7000,left()),windowsHide:true});await writeFile(join(run.out,label+'-runtime.json'),value.stdout);}
 finally{await exec(adb,['forward','--remove','tcp:'+port],{timeout:5000,windowsHide:true});}
 const power=await shell('dumpsys','power'),guard=await shell('dumpsys','window','policy');await writeFile(join(run.out,label+'-power.txt'),power.split('\n').filter(x=>/mWakefulness=|mIsPowered=|[Ff]ullEnabled|[Bb]attery[Ss]aver|[Ll]ow[Pp]ower/.test(x)).join('\n'));await writeFile(join(run.out,label+'-keyguard.txt'),guard.split('\n').filter(x=>/showing=|inputRestricted=|occluded=/.test(x)).join('\n'));
}
async function normalUnlock(label){
 await shell('input','keyevent','224');
 await wait(async()=>(await shell('dumpsys','power')).includes('mWakefulness=Awake'),5000,'Actual screen wakes before foreground launch');
 if(label==='before diagnostic') await shell('am','start','-n',app+'/.MainActivity');
 console.log('PHONE_UNLOCK_NEEDED: '+label+'; unlock normally and open Artemis');
 // Human interaction is not a failed connection. Keep the same service alive
 // until the user returns; individual ADB calls still have bounded timeouts.
 await run.event('waiting-for-user-unlock',{label,servicePid:process.pid});
 while(true){
  const [guard,windows]=await Promise.all([shell('dumpsys','window','policy'),shell('dumpsys','window')]);
  if(/\bshowing=false\b/.test(guard)&&!/\bshowing=true\b/.test(guard)&&windows.split('\n').some(line=>line.includes('mCurrentFocus=')&&line.includes(app+'/')))break;
  await delay(1000);
 }
 await run.event('user-unlocked',{label,servicePid:process.pid});
}
try{
 const previous=JSON.parse(await readFile(args.from,'utf8')),root=resolve('.cache/spec2-independent-data');let dataDir;
 for(const entry of await readdir(root,{withFileTypes:true}))if(entry.isDirectory())try{const cert=new X509Certificate(await readFile(join(root,entry.name,'certificate.pem')));if(createHash('sha256').update(cert.publicKey.export({format:'der',type:'spki'})).digest('base64url')===previous.pcId)dataDir=join(root,entry.name);}catch{}
 invariant(dataDir,'Owned actual prior PC identity');
 HttpsServer.prototype.emit=function(name,...values){
  if(name==='upgrade')try{
   const socket=values[1],head=values[2],id=++sequence;let buffer=Buffer.alloc(0);
   const event=(event,data={})=>{void appendFile(join(run.out,'actual-wire-events.ndjson'),JSON.stringify({at:new Date().toISOString(),id,event,...data})+'\n');};
   function headers(chunk){buffer=Buffer.concat([buffer,chunk]);if(buffer.length>131072){event('observer-buffer-cap');buffer=Buffer.alloc(0);return;}while(buffer.length>=2){const opcode=buffer[0]&15,masked=(buffer[1]&128)!==0;let length=buffer[1]&127,offset=2;if(length===126){if(buffer.length<4)return;length=buffer.readUInt16BE(2);offset=4;}else if(length===127){if(buffer.length<10)return;const n=buffer.readBigUInt64BE(2);if(n>65536n){buffer=Buffer.alloc(0);return;}length=Number(n);offset=10;}if(masked)offset+=4;if(buffer.length<offset+length)return;event('incoming-frame-header',{opcode,length,masked});buffer=buffer.subarray(offset+length);}}
   event('actual-upgrade');socket.on('data',headers);socket.on('end',()=>event('socket-end'));socket.on('close',hadError=>event('socket-close',{hadError}));socket.on('error',e=>event('socket-error',{code:e.code}));if(head?.length)headers(head);
  }catch(e){void run.event('observer-error',{message:e.message});}
  return originalEmit.call(this,name,...values);
 };
 service=await startService(run,{lanHost:previous.host,tlsPort:Number(new URL(previous.endpoint).port),dataDir,testOnly:false});control=await controlSession(service);invariant(service.pcId===previous.pcId,'Original actual PC identity');
 await normalUnlock('before diagnostic');
 // Acceptance must recover directly; Home normalization would hide the defect.
 await actualState('before-direct-connection');
 originalPower=await shell('settings','get','global','low_power');invariant(['0','1'].includes(originalPower),'Read original actual power setting');powerChanged=true;await shell('cmd','power','set-mode',args.powerSave??'1');await run.event('power-save-requested',{originalPower,requested:args.powerSave??'1'});
 await wait(async()=>!!(await control.state()).sessionId,15000,'Actual remembered connection before lock');await phoneSnapshot('before-lock');const beforeLock=await actualState('before-lock');
 if(args.recoveryOnly==='true') {
  await run.test('FG-04.unlocked-phone-restores-original-PC-after-service-restart',async()=>{
   const state=await actualState('recovered-after-service-restart');
   invariant(!!state.sessionId,'Actual authenticated session restored');
   return {samePcIdentity:true,consentRepeated:false,serviceRestarted:true};
  });
 } else {
 await shell('input','keyevent','223');const lockedAt=Date.now();await run.event('actual-lock-key');let at3;
 await run.test('FG-04.PC-clears-session-within-three-seconds',async()=>{await wait(async()=>!(await control.state()).sessionId,3000,'Actual lock must clear PC session within 3 seconds');return {elapsedMs:Date.now()-lockedAt};}).catch(e=>{error??=e;});
 at3=await actualState('after-three-second-window');await phoneSnapshot('locked');
 if(at3.sessionId){await wait(async()=>!(await control.state()).sessionId,Math.max(1,10000-(Date.now()-lockedAt)),'PC session still stale after 10 seconds').then(()=>run.event('late-clear',{elapsedMs:Date.now()-lockedAt})).catch(e=>run.event('still-stale',{elapsedMs:Date.now()-lockedAt,message:e.message}));await actualState('after-observation-window');}
 await normalUnlock('after actual lock');await run.test('FG-04.unlock-return-restores-real-session',async()=>{await wait(async()=>!!(await control.state()).sessionId,15000,'Unlock and App return restores original PC');await phoneSnapshot('returned');const returned=await actualState('returned');invariant(returned.sessionId!==beforeLock.sessionId,'Fresh session replaces the cleared old session');return {samePcIdentity:true,consentRepeated:false,serviceRestarted:false,servicePid:process.pid,oldSessionCleared:!at3.sessionId,newSession:true};});
 }
}catch(e){error??=e;await run.event('failure',{message:e.message});try{if(control)await actualState('failure');await phoneSnapshot('failure');}catch(snapshotError){await run.event('failure-snapshot-incomplete',{message:snapshotError.message});}}
finally{const cleanupErrors=[];if(powerChanged)try{await exec(adb,['shell','cmd','power','set-mode',originalPower],{timeout:5000,windowsHide:true});restoredPower=(await exec(adb,['shell','settings','get','global','low_power'],{timeout:5000,windowsHide:true})).stdout.trim();invariant(restoredPower===originalPower,'Original power setting restored');}catch(e){cleanupErrors.push(e.message);}await service?.close().catch(e=>cleanupErrors.push(e.message));HttpsServer.prototype.emit=originalEmit;if(cleanupErrors.length)error??=Error('E_CLEANUP: '+cleanupErrors.join('; '));await writeFile(join(run.out,'cleanup.json'),JSON.stringify({powerChanged,originalPower,restoredPower,ownedServiceClosed:!!service,errors:cleanupErrors},null,2));await writeFile(join(run.out,'state-timeline.json'),JSON.stringify(observations,null,2));await writeFile(join(run.out,'budget.json'),JSON.stringify({startedAt:budget.startedAt,finishedAt:new Date().toISOString(),elapsedSeconds:(Date.now()-Date.parse(budget.startedAt))/1000,limitSeconds:null},null,2));await run.finish(error);}
if(error)process.exitCode=1;
