import {runContext,startService,controlSession,invariant,delay} from './pairing-test-support.mjs';
import {readFile,writeFile,readdir,appendFile} from 'node:fs/promises';import {resolve,join} from 'node:path';
import {X509Certificate,createHash} from 'node:crypto';import {execFile,spawn} from 'node:child_process';import {promisify} from 'node:util';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const n=x.indexOf('=');return[x.slice(2,n),x.slice(n+1)];}));
const budget=JSON.parse(await readFile('.cache/foreground-test-budget.json','utf8')),deadline=Date.parse(budget.startedAt)+280000;
const run=await runContext(args.out,'D026 real foreground lifecycle diagnosis'),exec=promisify(execFile),adb='E:/Dev/Artemis/Android/Sdk/platform-tools/adb.exe',java='C:/Program Files/BellSoft/LibericaJDK-17/bin/java.exe',app='io.github.primedawn.artemis';let service,control,error,trace,port;const timeline=[];
const left=()=>{const n=deadline-Date.now();invariant(n>0,'E_TEST_BUDGET');return n;};
async function device(...a){return(await exec(adb,a,{timeout:Math.min(8000,left()),windowsHide:true})).stdout.trim();}
const shell=(...a)=>device('shell',...a);
async function wait(fn,ms,message){const end=Date.now()+Math.min(ms,left());while(Date.now()<end){if(await fn())return;await delay(100);}throw Error(message);}
async function snapshot(label){
 const pid=await shell('pidof',app),p=await device('forward','tcp:0','jdwp:'+pid);
 try{const r=await exec(java,['--add-modules','jdk.jdi','-cp','.cache/diag-classes','ArtemisRuntimeSnapshot',p],{timeout:Math.min(6000,left()),windowsHide:true});await writeFile(join(run.out,label+'-runtime.json'),r.stdout);}finally{await exec(adb,['forward','--remove','tcp:'+p],{timeout:5000,windowsHide:true});}
 const power=await shell('dumpsys','power'),keyguard=await shell('dumpsys','window','policy');await writeFile(join(run.out,label+'-power.txt'),power.split('\n').filter(x=>/mWakefulness=|mIsPowered=/.test(x)).join('\n'));await writeFile(join(run.out,label+'-keyguard.txt'),keyguard.split('\n').filter(x=>/showing=|inputRestricted=|occluded=/.test(x)).join('\n'));
 const state=await control.state();timeline.push({at:new Date().toISOString(),label,state});await run.event('snapshot',{label,sessionPresent:!!state.sessionId,deviceCount:state.devices.length});
}
try{
 const previous=JSON.parse(await readFile(args.from,'utf8')),root=resolve('.cache/spec2-independent-data');let dataDir;
 for(const entry of await readdir(root,{withFileTypes:true}))if(entry.isDirectory())try{const cert=new X509Certificate(await readFile(join(root,entry.name,'certificate.pem')));if(createHash('sha256').update(cert.publicKey.export({format:'der',type:'spki'})).digest('base64url')===previous.pcId)dataDir=join(root,entry.name);}catch{}
 invariant(dataDir,'Owned actual prior certificate identity');service=await startService(run,{lanHost:previous.host,tlsPort:Number(new URL(previous.endpoint).port),dataDir,testOnly:false});control=await controlSession(service);invariant(service.pcId===previous.pcId,'Actual PC identity preserved');
 let initialPid;try{initialPid=await shell('pidof',app);}catch{}
 if(!initialPid){await run.event('App-not-running-start-before-observation');await shell('am','start','-n',app+'/.MainActivity');await wait(async()=>{try{return !!(await shell('pidof',app));}catch{return false;}},2500,'Installed App starts before diagnostic snapshot');}
 await snapshot('00-before-launch');
 const awake=await readFile(join(run.out,'00-before-launch-power.txt'),'utf8'),guard=await readFile(join(run.out,'00-before-launch-keyguard.txt'),'utf8');
 if(!awake.includes('mWakefulness=Awake')||/\bshowing=true\b/.test(guard)){
  await shell('input','keyevent','224');console.log('PHONE_UNLOCK_NEEDED: please unlock normally and open Artemis');
  await wait(async()=>{const keyguard=await shell('dumpsys','window','policy');return /\bshowing=false\b/.test(keyguard)&&!/\bshowing=true\b/.test(keyguard);},60000,'Normal user unlock before foreground diagnosis');
 }
 await shell('am','start','-n',app+'/.MainActivity');await snapshot('01-after-launch');
 if(args.mode==='plain'){
  await shell('input','keyevent','3');await shell('am','start','-n',app+'/.MainActivity');await wait(async()=>!!(await control.state()).sessionId,9000,'Connected baseline before duplicate Activity');
  for(let round=1;round<=2;round++){
   await run.test('I009.duplicate-Activity-keeps-foreground-'+round,async()=>{
    const before=(await control.state()).sessionId;invariant(before,'Actual connected baseline');
    await shell('am','start','-n',app+'/.MainActivity');let dropped=false;
    const message='Observation window ends without a session drop';await wait(async()=>!(await control.state()).sessionId,3000,message).then(()=>{dropped=true;}).catch(e=>{if(e.message!==message)throw e;});
    await snapshot('direct-'+round);invariant(!dropped&&(await control.state()).sessionId===before,'Old Activity pause must not disconnect the new foreground Activity');return {sessionRetained:true,sameSessionId:true};
   }).catch(e=>{error??=e;});
   await run.test('I009.Home-return-restores-'+round,async()=>{await shell('input','keyevent','3');await shell('am','start','-n',app+'/.MainActivity');await wait(async()=>!!(await control.state()).sessionId,9000,'Actual Home/return normalization');await snapshot('normalized-'+round);return {realStoredTrust:true,sessionRestored:true};});
  }
 }else{
 const pid=await shell('pidof',app);port=await device('forward','tcp:0','jdwp:'+pid);let ready=false;
 trace=spawn(java,['--add-modules','jdk.jdi','-cp','.cache/diag-classes','ArtemisForegroundTrace',port,String(Math.min(45000,Math.max(1000,left()-15000)))],{windowsHide:true});trace.stdout.on('data',b=>{if(b.toString().includes('trace-ready'))ready=true;void appendFile(join(run.out,'lifecycle-trace.ndjson'),b);});trace.stderr.on('data',b=>{void appendFile(join(run.out,'trace-stderr.txt'),b);});await wait(()=>ready,4000,'Read-only lifecycle trace attaches');
 // Start each counterexample from an observed connected foreground, so an
 // already-paused baseline cannot masquerade as reproduction.
 await shell('input','keyevent','3');await shell('am','start','-n',app+'/.MainActivity');await wait(async()=>!!(await control.state()).sessionId,9000,'Connected real baseline before duplicate-Activity experiment');await run.event('actual-connected-baseline');
 for(let round=1;round<=2;round++){
  await shell('am','start','-n',app+'/.MainActivity');await run.event('actual-direct-launch-while-visible',{round});await wait(async()=>!(await control.state()).sessionId,3000,'Hypothesis: new Activity resumes then old Activity pauses global connection').then(()=>run.event('hypothesis-reproduced',{round})).catch(e=>run.event('hypothesis-not-reproduced',{round,message:e.message}));
  await shell('input','keyevent','3');await wait(async()=>!(await control.state()).sessionId,2500,'Home pauses');await run.event('actual-home',{round});
  await shell('am','start','-n',app+'/.MainActivity');await run.event('actual-App-return',{round});
  // JDI allows only one debugger: detach the timed trace before full snapshots.
  await wait(async()=>!!(await control.state()).sessionId,9000,'Return should restore actual remembered service').catch(e=>run.event('return-failed',{round,message:e.message}));
  const actual=await control.state();await run.event('actual-return-result',{round,sessionPresent:!!actual.sessionId,onlineDevices:actual.devices.filter(d=>d.online).length});
 }
 await new Promise((ok,no)=>{if(trace.exitCode!==null)return ok();const timer=setTimeout(()=>{trace.kill();no(Error('Trace exceeds budget'));},Math.min(47000,left()));trace.once('exit',()=>{clearTimeout(timer);ok();});});
 invariant(trace.exitCode===0,'Read-only lifecycle trace must finish successfully');await snapshot('02-after-two-real-returns');
 }
}catch(e){error=e;await run.event('failure',{message:e.message});}
finally{trace?.kill();if(port)await exec(adb,['forward','--remove','tcp:'+port],{timeout:5000,windowsHide:true}).catch(()=>{});await service?.close().catch(e=>{error??=e;});await writeFile(join(run.out,'state-timeline.json'),JSON.stringify(timeline,null,2));await writeFile(join(run.out,'budget.json'),JSON.stringify({startedAt:budget.startedAt,finishedAt:new Date().toISOString(),elapsedSeconds:(Date.now()-Date.parse(budget.startedAt))/1000},null,2));await run.finish(error);}
if(error)process.exitCode=1;
