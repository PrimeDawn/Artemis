import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--report-dir' || !args[1]) {
  console.error('Usage: node tests/receiver-smoke.mjs --report-dir PATH');
  process.exit(1);
}
const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const reportDir = resolve(args[1]);
await mkdir(reportDir, { recursive: true });
const auditPath = join(reportDir, 'audit.ndjson');
const cliPath = join(project, 'receiver/dist/src/cli.js');
const cases = [];
const processes = new Set();
const network = [];
const signals = [];
let auditChain = Promise.resolve();
const audit = (event) => { auditChain = auditChain.then(() => appendFile(auditPath, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n')); };
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const timeout = async (promise, ms, message) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]); }
  finally { clearTimeout(timer); }
};

function launch(port) {
  const child = spawn(process.execPath, [cliPath], { cwd: project, env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  const state = { child, events: [], stdout: '', stderr: '', exited: false };
  processes.add(state);
  state.exit = new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => { state.exited = true; audit({ kind:'process_exit', code, signal }); resolveExit({code,signal}); });
  });
  let pending = '';
  child.stdout.on('data', chunk => {
    const text = chunk.toString('utf8'); state.stdout += text; pending += text;
    while (pending.includes('\n')) {
      const index = pending.indexOf('\n');
      const line = pending.slice(0,index).trim(); pending = pending.slice(index+1);
      audit({kind:'stdout',line});
      try { state.events.push(JSON.parse(line)); } catch {}
    }
  });
  child.stderr.on('data', chunk => {
    const text = chunk.toString('utf8'); state.stderr += text; audit({kind:'stderr',text});
    for (const line of text.trim().split(/\r?\n/)) { try { state.events.push(JSON.parse(line)); } catch {} }
  });
  audit({kind:'launch',port:String(port)});
  return state;
}

async function ready(state) {
  const wait = async () => {
    for (;;) {
      const event = state.events.find(e => e.event === 'receiver_started');
      if (event) { assert.equal(event.host,'127.0.0.1'); assert.ok(event.port > 0 && event.port <= 65535); return event; }
      if (state.exited) throw new Error('CLI exited before startup: '+state.stderr);
      await delay(15);
    }
  };
  return timeout(wait(),8000,'CLI startup timeout');
}

async function cleanup(state) {
  if (!state.exited) { audit({kind:'fixture_cleanup',method:'forced process termination; not graceful-exit evidence'}); state.child.kill(); }
  await timeout(state.exit,5000,'Fixture process did not exit');
  processes.delete(state);
}

async function request(port,path,method='GET') {
  const response = await fetch(`http://127.0.0.1:${port}${path}`,{method,signal:AbortSignal.timeout(3000),...(method==='POST'?{body:'not-json-and-not-parsed'}:{})});
  const body = await response.json();
  const observed = {path,method,status:response.status,contentType:response.headers.get('content-type'),allow:response.headers.get('allow'),body};
  network.push(observed); audit({kind:'http',...observed});
  return observed;
}

async function runCase(id,body) {
  const startedAt = new Date().toISOString();
  try { const detail = await body(); cases.push({id,status:'pass',startedAt,finishedAt:new Date().toISOString(),detail}); }
  catch(error) { cases.push({id,status:'fail',startedAt,finishedAt:new Date().toISOString(),error:String(error.stack??error)}); }
  audit({kind:'case_result',...cases.at(-1)});
}

let main;
try {
  await runCase('TC-11',async()=>{
    const invalid=['','-1','65536','abc','1.5',' 3000','3000 '];
    for (const input of invalid) {
      const state=launch(input);
      try {
        const result=await timeout(state.exit,5000,'Invalid PORT CLI did not exit');
        assert.equal(result.code,1);
        assert.ok(state.events.some(e=>e.event==='receiver_error' && e.code==='RangeError'));
        assert.ok(!state.events.some(e=>e.event==='receiver_started'));
      } finally { await cleanup(state); }
    }
    return {invalidValues:invalid,exitCode:1};
  });
  main=launch(0);
  const started=await ready(main);
  await runCase('TC-12',async()=>{
    const got=await request(started.port,'/healthz');
    assert.equal(got.status,200); assert.match(got.contentType,/^application\/json/);
    assert.deepEqual(got.body,{service:'artemis-receiver',status:'ok',version:'0.1.0-dev'});
    return {realCli:true};
  });
  await runCase('TC-13',async()=>{
    for(const path of ['/missing','/healthz?x=1']) {
      const got=await request(started.port,path);
      assert.equal(got.status,404); assert.deepEqual(got.body,{error:'not_found'});
    }
    return {exactPathBoundary:true};
  });
  await runCase('TC-14',async()=>{
    const got=await request(started.port,'/healthz','POST');
    assert.equal(got.status,405); assert.equal(got.allow,'GET'); assert.deepEqual(got.body,{error:'method_not_allowed'});
    return {unparsedBodyAcceptedForRejection:true};
  });
  await cleanup(main); main=null;
  await runCase('TC-15',async()=>{
    const reservation=createServer();
    await new Promise((resolveListen,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolveListen);});
    const port=reservation.address().port;
    const state=launch(port);
    try {
      const result=await timeout(state.exit,5000,'Occupied-port CLI did not exit');
      assert.equal(result.code,1);
      assert.ok(state.events.some(e=>e.event==='receiver_error' && e.code==='EADDRINUSE'));
      assert.ok(!state.events.some(e=>e.event==='receiver_started'));
    } finally {
      await cleanup(state);
      await new Promise((resolveClose,reject)=>reservation.close(e=>e?reject(e):resolveClose()));
    }
    return {errorCode:'EADDRINUSE',exitCode:1};
  });
  await runCase('TC-16',async()=>{
    const {startReceiver}=await import(pathToFileURL(join(project,'receiver/dist/src/server.js')));
    const first=await startReceiver({host:'127.0.0.1',port:0});
    const port=first.address.port;
    await Promise.all([first.close(),first.close()]); await first.close();
    const second=await startReceiver({host:'127.0.0.1',port}); await second.close();
    let signal={status:'not-run',reason:'No Windows test transport'};
    if(process.platform==='win32') {
      const helper=spawn('python',[join(project,'tests/windows-cli-signal.py'),process.execPath,cliPath],{cwd:project,windowsHide:true,stdio:['ignore','pipe','pipe']});
      let output='',errors='';
      helper.stdout.on('data',b=>{output+=b.toString('utf8');});
      helper.stderr.on('data',b=>{errors+=b.toString('utf8');});
      const finished=new Promise((r,j)=>{helper.once('error',j);helper.once('close',code=>r(code));});
      let code;
      try { code=await timeout(finished,25000,'Windows console helper timeout'); }
      finally { if(helper.exitCode===null)helper.kill(); }
      assert.ok(output.trim(),'Windows helper produced no report: '+errors);
      signal=JSON.parse(output.trim().split(/\r?\n/).at(-1));
      signals.push(signal); audit({kind:'console_signal',result:signal});
      assert.equal(code,0,JSON.stringify(signal));
      assert.notEqual(signal.status,'fail',JSON.stringify(signal));
      if(signal.status==='pass') {
        assert.equal(signal.childExitCode,0); assert.equal(signal.stoppedEvent,true); assert.equal(signal.forcedCleanup,false);
        const restarted=launch(signal.started.port);
        try { const restartedInfo=await ready(restarted); assert.equal((await request(restartedInfo.port,'/healthz')).status,200); }
        finally { await cleanup(restarted); }
      }
    }
    return {closeIdempotent:true,portRebind:true,signal};
  });
} catch(error) {
  cases.push({id:'fixture',status:'fail',error:String(error.stack??error)});
} finally {
  for(const state of [...processes]) { try { await cleanup(state); } catch(error) { cases.push({id:'cleanup',status:'fail',error:String(error)}); } }
}

await auditChain;
const inputs=[];
for(const file of ['receiver/src/config.ts','receiver/src/server.ts','receiver/src/cli.ts','receiver/dist/src/config.js','receiver/dist/src/server.js','receiver/dist/src/cli.js','tests/receiver-smoke.mjs','tests/windows-cli-signal.py']) {
  inputs.push({path:file,sha256:createHash('sha256').update(await readFile(join(project,file))).digest('hex')});
}
const result={schemaVersion:1,sourceSha:execFileSync('git',['rev-parse','HEAD'],{cwd:project,encoding:'utf8'}).trim(),
  verifiedAt:new Date().toISOString(),scope:'Independent real CLI and public API tests',
  passed:cases.length===6 && cases.every(c=>c.status==='pass'),cases,inputs,processesRemaining:processes.size};
await writeFile(join(reportDir,'results.json'),JSON.stringify(result,null,2)+'\n');
await writeFile(join(reportDir,'network-summary.json'),JSON.stringify(network,null,2)+'\n');
await writeFile(join(reportDir,'signal-summary.json'),JSON.stringify(signals,null,2)+'\n');
console.log(JSON.stringify({passed:result.passed,cases:cases.map(c=>({id:c.id,status:c.status,error:c.error})),processesRemaining:processes.size}));
process.exitCode=result.passed?0:1;
