// Resume only the owned, real service identity from a previous phone run.
// No generated peer, discovery bridge, mock response or new pairing consent.
import {runContext,startService,controlSession,invariant,delay} from './pairing-test-support.mjs';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,X509Certificate} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const options=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return[x.slice(2,i),x.slice(i+1)];}));
const budget=JSON.parse(await readFile('.cache/foreground-test-budget.json','utf8'));
const deadline=Date.parse(budget.startedAt)+280000,run=await runContext(options.out,'S24 remaining lifecycle with remembered real PC');
const exec=promisify(execFile),adb='E:/Dev/Artemis/Android/Sdk/platform-tools/adb.exe',app='io.github.primedawn.artemis';
let server,control,error,originalPower,powerChanged=false,restoredPower;
const remaining=()=>{const value=deadline-Date.now();invariant(value>0,'E_TEST_BUDGET');return value;};
async function device(...args){return(await exec(adb,args,{timeout:Math.min(args.includes('instrument')?35000:8000,remaining()),windowsHide:true,maxBuffer:8*1024*1024})).stdout.trim();}
const shell=(...args)=>device('shell',...args);
async function wait(condition,message,ms=12000){const end=Date.now()+Math.min(ms,remaining());while(Date.now()<end){if(await condition())return;await delay(100);}throw Error(message);}
async function launch(){await shell('am','start','-n',app+'/.MainActivity');}
async function windowState(label){
 const dump=await shell('dumpsys','window','windows');let own=false;const rows=[];
 for(const line of dump.split('\n')){if(/^\s*Window #\d+ Window\{/.test(line))own=line.includes(app+'/');if(own&&(/Window #|mAttrs|^\s+fl=|isOnScreen=|isVisible=/.test(line)))rows.push(line);}
 const text=rows.join('\n'),flags=[...text.matchAll(/^\s*fl=([0-9a-f]+)/gmi)].map(m=>parseInt(m[1],16));
 await writeFile(join(run.out,label+'-window.txt'),text);invariant(flags.length>0,'Actual Artemis window exists');return {keepScreenOn:flags.some(n=>(n&0x80)!==0),flags:flags.map(n=>n.toString(16))};
}
async function screenshot(label){
 await shell('uiautomator','dump','/data/local/tmp/artemis-remainder.xml');const xml=await shell('cat','/data/local/tmp/artemis-remainder.xml');invariant(xml.includes('package="'+app+'"'),'Artemis must be foreground and unlocked');
 await writeFile(join(run.out,label+'.xml'),xml);const result=await exec(adb,['exec-out','screencap','-p'],{timeout:Math.min(8000,remaining()),encoding:'buffer',windowsHide:true});await writeFile(join(run.out,label+'.png'),result.stdout);
}
try{
 const priorPath=resolve(options.from);invariant(priorPath.startsWith(resolve('spec/versions/v0.1/specs')+'\\'),'Owned previous run only');
 const previous=JSON.parse(await readFile(priorPath,'utf8')),endpoint=new URL(previous.endpoint);let dataDir;
 const root=resolve('.cache/spec2-independent-data');
 for(const entry of await readdir(root,{withFileTypes:true}))if(entry.isDirectory())try{
  const certificate=new X509Certificate(await readFile(join(root,entry.name,'certificate.pem')));
  const id=createHash('sha256').update(certificate.publicKey.export({format:'der',type:'spki'})).digest('base64url');if(id===previous.pcId){invariant(!dataDir,'Exactly one actual prior identity');dataDir=join(root,entry.name);}
 }catch(e){if(e.message==='Exactly one actual prior identity')throw e;}
 invariant(dataDir,'Original actual PC data found by public certificate identity');
 const apk=resolve('android/app/build/outputs/apk/debug/app-debug.apk'),expected=createHash('sha256').update(await readFile(apk)).digest('hex');
 const installed=(await shell('pm','path',app)).replace(/^package:/,'').split(/\r?\n/)[0];invariant((await shell('sha256sum',installed)).split(/\s+/)[0]===expected,'Installed current APK matches repaired build');
 const testApk=resolve('android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'),expectedTest=createHash('sha256').update(await readFile(testApk)).digest('hex');
 const installedTest=(await shell('pm','path',app+'.test')).replace(/^package:/,'').split(/\r?\n/)[0];invariant((await shell('sha256sum',installedTest)).split(/\s+/)[0]===expectedTest,'Installed actual instrumentation APK matches build');
 server=await startService(run,{lanHost:previous.host,tlsPort:Number(endpoint.port),dataDir,testOnly:false});control=await controlSession(server);invariant(server.pcId===previous.pcId,'Same real PC identity and stored trust');
 await writeFile(join(run.out,'actual-fixture.json'),JSON.stringify({pcId:server.pcId,host:previous.host,port:Number(endpoint.port),dataDir,apkSha256:expected,testApkSha256:expectedTest,previousRun:priorPath},null,2));
 await run.test('FG-08.resume-real-remembered-PC',async()=>{await launch();await wait(async()=>!!(await control.state()).sessionId,'Remembered real service must reconnect without pairing',20000);const flags=await windowState('resumed');invariant(flags.keepScreenOn,'Foreground keeps screen on');return {samePcIdentity:true,existingTrust:true,...flags};});
 originalPower=await shell('settings','get','global','low_power');invariant(['0','1'].includes(originalPower),'Read actual original power setting');powerChanged=true;await shell('cmd','power','set-mode','1');let actualPower=false;
 await run.test('FG-07.actual-Activity-recreation',async()=>{
  const log=await shell('am','instrument','-w','-r','-e','class',app+'.pairing.ForegroundLifecycleInstrumentedTest',app+'.test/androidx.test.runner.AndroidJUnitRunner');await writeFile(join(run.out,'actual-lifecycle-instrumentation.log'),log);
  invariant(log.includes('OK (1 test)')&&!log.includes('FAILURES!!!'),'Actual Activity recreation assertions');actualPower=log.includes('actualPowerSaveMode=true');return {sameSessionOnRecreation:log.includes('actualRecreatedSameSession=true'),actualPowerSaveMode:actualPower};
 });
 await run.test('FG-07.return-after-instrumentation',async()=>{
  await wait(async()=>!(await control.state()).sessionId,'Runner Activity cleanup must pause the foreground-only connection',3000);
  const activity=await shell('dumpsys','activity','activities');await writeFile(join(run.out,'runner-cleanup-activity.txt'),activity.split('\n').filter(x=>/topResumedActivity|mResumedActivity/.test(x)).join('\n'));
  await launch();await wait(async()=>!!(await control.state()).sessionId,'Returning to App after runner cleanup restores trusted connection');const flags=await windowState('after-runner-return');invariant(flags.keepScreenOn,'Returned App keeps screen on');await screenshot('returned-after-runner');return {runnerActuallyPaused:true,reopenedApp:true,consentRepeated:false,...flags};
 });
 if(actualPower)await run.test('FG-05.actual-power-save',async()=>{const flags=await windowState('power-save');invariant(flags.keepScreenOn&&!!(await control.state()).sessionId,'Connected foreground window while actual power saving');return {actualPowerSaveMode:true,...flags};});
 else await run.event('FG-05.not-tested',{reason:'System did not actually enable power saving; no simulated battery value used'});
 await run.test('FG-04.actual-lock-and-normal-unlock',async()=>{
  await shell('input','keyevent','223');await wait(async()=>!(await control.state()).sessionId,'Actual lock must pause connection',3000);
  const power=await shell('dumpsys','power');await writeFile(join(run.out,'locked-power.txt'),power.split('\n').filter(x=>/mWakefulness=|mIsPowered=/.test(x)).join('\n'));
  await run.event('actual-screen-off-paused');await shell('input','keyevent','224');console.log('PHONE_LOCK_TEST: please unlock normally and return to Artemis');await launch();
  await wait(async()=>!!(await control.state()).sessionId,'Normal user unlock and App return must restore trusted connection',60000);const flags=await windowState('unlocked');invariant(flags.keepScreenOn,'Unlocked App keeps screen on');await screenshot('unlocked-connected');return {actualScreenOff:true,normalUserUnlock:true,consentRepeated:false,...flags};
 });
}catch(e){error=e;await run.event('failure',{message:e.message});
 // Capture the failure before closing the real service, including Activity
 // ownership. Never infer foreground from a top task name alone.
 try{
  if(control)await writeFile(join(run.out,'failure-service-state.json'),JSON.stringify(await control.state(),null,2));
  const power=await shell('dumpsys','power');await writeFile(join(run.out,'failure-power.txt'),power.split('\n').filter(x=>/mWakefulness=|mIsPowered=/.test(x)).join('\n'));
  const keyguard=await shell('dumpsys','window','policy');await writeFile(join(run.out,'failure-keyguard.txt'),keyguard.split('\n').filter(x=>/showing=|inputRestricted=|occluded=/.test(x)).join('\n'));
  const pid=await shell('pidof',app);invariant(/^\d+$/.test(pid),'Owned App PID');const port=await device('forward','tcp:0','jdwp:'+pid);
  try{const snapshot=await exec('C:/Program Files/BellSoft/LibericaJDK-17/bin/java.exe',['--add-modules','jdk.jdi','-cp','.cache/diag-classes','ArtemisRuntimeSnapshot',port],{timeout:Math.min(8000,remaining()),windowsHide:true});await writeFile(join(run.out,'failure-runtime.json'),snapshot.stdout);}
  finally{await exec(adb,['forward','--remove','tcp:'+port],{timeout:5000,windowsHide:true});}
 }catch(snapshotError){await run.event('failure_snapshot_incomplete',{message:snapshotError.message});}
}
finally{
 const errors=[];if(powerChanged)try{await exec(adb,['shell','cmd','power','set-mode',originalPower],{timeout:5000,windowsHide:true});restoredPower=(await exec(adb,['shell','settings','get','global','low_power'],{timeout:5000,windowsHide:true})).stdout.trim();invariant(restoredPower===originalPower,'Restore original actual power setting');}catch(e){errors.push(e.message);}
 await server?.close().catch(e=>errors.push(e.message));if(errors.length)error??=Error('E_CLEANUP: '+errors.join('; '));await writeFile(join(run.out,'cleanup.json'),JSON.stringify({powerChanged,originalPower,restoredPower,ownedServiceClosed:!!server,errors},null,2));
 await writeFile(join(run.out,'budget.json'),JSON.stringify({startedAt:budget.startedAt,finishedAt:new Date().toISOString(),elapsedSeconds:(Date.now()-Date.parse(budget.startedAt))/1000,limitSeconds:300},null,2));await run.finish(error);
}
if(error)process.exitCode=1;
