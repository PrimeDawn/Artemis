import{test}from'node:test';import assert from'node:assert/strict';import{Readable}from'node:stream';import{randomBytes}from'node:crypto';import type{IncomingMessage,ServerResponse}from'node:http';
import{createControlHandler}from'../src/control-http.js';import{createConnectionManager}from'../src/connection-manager.js';import type{TrustRepository}from'../src/trust-repository.js';
test('control API requires a local session and CSRF; Host cannot be rebound',async()=>{
 const repo:TrustRepository={list:()=>[],find:()=>null,readIntent:()=>({deviceId:null,desired:'disconnected'}),writeIntent:async()=>{},trust:async()=>{},forget:async()=>{},close:async()=>{}};
 const manager=createConnectionManager(repo,{wallMs:Date.now,monotonicMs:()=>performance.now()},randomBytes),handler=createControlHandler({config:{controlHost:'127.0.0.1',controlPort:3000,lanHost:'192.168.1.2',tlsPort:3443,dataDir:'E:/fixture'},manager,random:randomBytes,log:()=>{}});
 async function request(url:string,headers:Record<string,string>={},method='GET',body=''){const req=Object.assign(Readable.from(body?[body]:[]),{url,method,headers:{host:'127.0.0.1:3000',...headers}});let status=0,response='',out:Record<string,string>={};const res={setHeader:(k:string,v:string)=>{out[k.toLowerCase()]=v;},writeHead:(code:number)=>{status=code;return res;},end:(text='')=>{response+=text;}};await handler(req as unknown as IncomingMessage,res as unknown as ServerResponse);return{status,response,headers:out};}
 try{assert.equal((await request('/api/state')).status,401);assert.equal((await request('/control',{host:'attacker.invalid:3000'})).status,403);
 const page=await request('/control');assert.equal(page.status,200);assert.match(page.headers['content-type'],/text\/html/);const cookie=page.headers['set-cookie'].split(';')[0];
 const state=await request('/api/state',{cookie});assert.equal(state.status,200);assert.deepEqual(JSON.parse(state.response).state.devices,[]);
 assert.equal((await request('/api/disconnect',{cookie,origin:'http://127.0.0.1:3000','content-type':'application/json'},'POST','{}')).status,403);
 const csrf=JSON.parse(state.response).csrf;assert.equal((await request('/api/disconnect',{cookie,origin:'http://127.0.0.1:3000','content-type':'application/json','x-artemis-csrf':csrf},'POST','{}')).status,204);
 }finally{await manager.close();}
});
// 回归：真机日志里出现过 ERR_HTTP_HEADERS_SENT 把整个接收服务打挂。
// 触发条件：响应已经发出后，后续代码（这里是日志回调）抛错，catch 里再次写头。
test('a failure after the response was sent does not rewrite headers or crash the receiver', async () => {
  const repo: TrustRepository = {list:()=>[],find:()=>null,readIntent:()=>({deviceId:null,desired:'disconnected'}),writeIntent:async()=>{},trust:async()=>{},forget:async()=>{},close:async()=>{}};
  const manager = createConnectionManager(repo,{wallMs:Date.now,monotonicMs:()=>performance.now()},randomBytes);
  const handler = createControlHandler({
    config:{controlHost:'127.0.0.1',controlPort:3000,lanHost:'192.168.1.2',tlsPort:3443,dataDir:'E:/fixture'},
    manager,random:randomBytes,
    log:(event)=>{ if(event.name==='control_action') throw new Error('log sink failed'); },
  });

  // 模拟 Node 的行为：响应头一旦发出，再 setHeader 就抛 ERR_HTTP_HEADERS_SENT。
  function makeRes(){
    let headersSent=false, ended=false, status=0, body='';
    const headers:Record<string,string>={};
    const res={
      get headersSent(){ return headersSent; },
      get writableEnded(){ return ended; },
      setHeader(key:string,value:string){ if(headersSent) throw new Error('ERR_HTTP_HEADERS_SENT'); headers[key.toLowerCase()]=value; },
      writeHead(code:number){ if(headersSent) throw new Error('ERR_HTTP_HEADERS_SENT'); status=code; headersSent=true; return res; },
      end(text=''){ body+=text; ended=true; },
    };
    return {res, get status(){return status;}, get body(){return body;}, headers};
  }
  async function call(url:string,headers:Record<string,string>={},method='GET',payload=''){
    const holder=makeRes();
    const req=Object.assign(Readable.from(payload?[payload]:[]),{url,method,headers:{host:'127.0.0.1:3000',...headers}});
    await handler(req as unknown as IncomingMessage, holder.res as unknown as ServerResponse);
    return holder;
  }

  try {
    const page=await call('/control');
    const cookie=page.headers['set-cookie'].split(';')[0];
    const state=await call('/api/state',{cookie});
    const csrf=(JSON.parse(state.body) as {csrf:string}).csrf;

    // 这一步在修复前会抛 ERR_HTTP_HEADERS_SENT 并让进程退出。
    const disconnect=await call('/api/disconnect',{cookie,origin:'http://127.0.0.1:3000','content-type':'application/json','x-artemis-csrf':csrf},'POST','{}');
    assert.equal(disconnect.status,204);
    assert.equal(disconnect.body,'');
  } finally {
    await manager.close();
  }
});