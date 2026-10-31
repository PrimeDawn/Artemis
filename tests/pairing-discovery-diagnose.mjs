import {createRequire} from 'node:module';
import {writeFile,appendFile,readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {networkInterfaces} from 'node:os';import {join} from 'node:path';
import {runContext,startService,controlSession,delay} from './pairing-test-support.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return[x.slice(2,i),x.slice(i+1)];}));
const run=await runContext(args.out,'I-007 production mDNS causal diagnosis');
const deadline=Date.parse(args.start)+280000,exec=promisify(execFile),adb='E:/Dev/Artemis/Android/Sdk/platform-tools/adb.exe',app='io.github.primedawn.artemis';
const require=createRequire(new URL('../receiver/package.json',import.meta.url)),Bonjour=require('bonjour-service');
const dgram=require('node:dgram'),originalBind=dgram.Socket.prototype.bind;
let s,c,error,up=false,browser;const packets=[],rounds=[];const original=Bonjour.prototype.publish;
function left(){const n=deadline-Date.now();if(n<=0)throw Error('E_TEST_BUDGET');return n;}
async function shell(...argv){return(await exec(adb,['shell',...argv],{timeout:Math.min(8000,left()),windowsHide:true})).stdout.trim();}
function relevant(q){return /artemis/i.test(q.name||'')}
function packet(p,remote,direction){const questions=(p.questions||[]).filter(relevant).map(q=>({name:q.name,type:q.type}));const records=[...(p.answers||[]),...(p.additionals||[])].filter(relevant).map(q=>({name:q.name,type:q.type,ttl:q.ttl,address:q.type==='A'?q.data:undefined}));if(questions.length||records.length){const row={at:new Date().toISOString(),direction,remote:remote?.address,questions,records};packets.push(row);void appendFile(join(run.out,'mdns-packets.ndjson'),JSON.stringify(row)+'\n');}}
Bonjour.prototype.publish=function(...a){const server=Object.values(this).find(v=>v?.mdns?.on);if(!server)throw Error('Diagnostic cannot locate real production mDNS socket');const m=server.mdns;m.on('query',(p,r)=>packet(p,r,'received-query'));m.on('response',(p,r)=>packet(p,r,'received-response'));const respond=m.respond.bind(m);m.respond=(...x)=>{packet(Array.isArray(x[0])?{answers:x[0]}:x[0],null,'send-response');return respond(...x);};const service=original.apply(this,a);service.once('up',()=>{up=true;void run.event('production-advertisement-up',{name:service.fqdn,port:service.port});});return service;};
try{
 if(args.cold==='true')await shell('am','force-stop',app);
 if(args.bind==='wildcard')dgram.Socket.prototype.bind=function(...a){if(a[0]===5353&&typeof a[1]==='string'){void run.event('experimental-udp-bind',{from:a[1],to:'0.0.0.0'});a[1]='0.0.0.0';}return originalBind.apply(this,a);};
 const host=Object.values(networkInterfaces()).flat().find(x=>x?.family==='IPv4'&&!x.internal&&x.address.startsWith('192.168.'))?.address;if(!host)throw Error('No real private IPv4');
 s=await startService(run,{lanHost:host,testOnly:false});c=await controlSession(s);await writeFile(join(run.out,'endpoint.json'),JSON.stringify({host,endpoint:s.lan,pcId:s.pcId,startedAt:new Date().toISOString(),hypothesis:'Waiting for actual production advertisement readiness before restarting phone should eliminate missing discovery if startup readiness causes it.'},null,2));
 if(args.browser==='true'){const {chromium}=require('../.cache/spec2-browser-tools/node_modules/playwright-core');const {mkdtemp}=await import('node:fs/promises');const {resolve}=await import('node:path');browser=await chromium.launchPersistentContext(await mkdtemp(resolve('.cache/discovery-probe-browser-')),{channel:'chrome',headless:true,args:['--disable-background-networking','--no-first-run'],acceptDownloads:false});const page=await browser.newPage();await page.goto(s.control+'/control');await run.event('actual-control-browser-started');}
 if(args.ready!=='false'){const readyEnd=Date.now()+Math.min(5000,left());while(!up&&Date.now()<readyEnd)await delay(50);}
 for(let i=1;i<=2;i++){
  left();await shell('am','force-stop',app);await shell('am','start','-n',app+'/.MainActivity');const began=Date.now();let online=false;const end=Date.now()+Math.min(12000,left());while(Date.now()<end){online=(await c.state()).devices.some(d=>d.online);if(online)break;await delay(100);}
  const result={attempt:i,advertisementUpBeforeClient:up,online,elapsedMs:Date.now()-began};rounds.push(result);await run.event('reproduction',result);
  await run.test('I007.actual-phone-discovery-'+i,async()=>{if(!online)throw Error('Native NSD phone presence missing');return result;}).catch(e=>{error??=e;});
 }
 const raw=await shell('dumpsys','servicediscovery');await writeFile(join(run.out,'android-nsd-filtered.txt'),raw.split('\n').filter(x=>/artemis|foundServices|sentQueries/.test(x)&&!/nearby-presence/.test(x)).slice(0,65).join('\n'));
 const windows=await shell('dumpsys','window','windows');const rows=[];let own=false;for(const line of windows.split('\n')){if(/^\s*Window #\d+ Window\{/.test(line))own=line.includes(app+'/');if(own&&/Window #|mAttrs|^\s+fl=|isOnScreen=/.test(line))rows.push(line);}await writeFile(join(run.out,'actual-window.txt'),rows.join('\n'));
 const power=await shell('dumpsys','power');await writeFile(join(run.out,'power-filtered.txt'),power.split('\n').filter(x=>/mWakefulness=|mIsPowered=/.test(x)).join('\n'));
}catch(e){error=e;}finally{Bonjour.prototype.publish=original;dgram.Socket.prototype.bind=originalBind;await browser?.close().catch(e=>error??=e);await s?.close().catch(e=>error??=e);await writeFile(join(run.out,'diagnostic-result.json'),JSON.stringify({rounds,advertisementUp:up,coldBeforePublisher:args.cold==='true',bindOverride:args.bind??null,browserEnabled:args.browser==='true',waitedForReady:args.ready!=='false',packets:packets.length,error:error?.message??null,finishedAt:new Date().toISOString(),elapsedSeconds:(Date.now()-Date.parse(args.start))/1000},null,2));await run.finish(error);}if(error)process.exitCode=1;
