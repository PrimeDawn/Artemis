import{test}from'node:test';import assert from'node:assert/strict';import{Readable}from'node:stream';import{randomBytes}from'node:crypto';import type{IncomingMessage,ServerResponse}from'node:http';
import{createControlHandler}from'../src/control-http.js';import{createConnectionManager}from'../src/connection-manager.js';import type{TrustRepository}from'../src/trust-repository.js';
test('control API requires a local session and CSRF; Host cannot be rebound',async()=>{
 const repo:TrustRepository={list:()=>[],find:()=>null,readIntent:()=>({deviceId:null,desired:'disconnected'}),writeIntent:async()=>{},trust:async()=>{},forget:async()=>{},close:async()=>{}};
 const manager=createConnectionManager(repo,{wallMs:Date.now,monotonicMs:()=>performance.now()},randomBytes),handler=createControlHandler({config:{controlHost:'127.0.0.1',controlPort:3000,lanHost:'192.168.1.2',tlsPort:3443,dataDir:'E:/fixture',opensslPath:'unused'},manager,random:randomBytes,log:()=>{}});
 async function request(url:string,headers:Record<string,string>={},method='GET',body=''){const req=Object.assign(Readable.from(body?[body]:[]),{url,method,headers:{host:'127.0.0.1:3000',...headers}});let status=0,response='',out:Record<string,string>={};const res={setHeader:(k:string,v:string)=>{out[k.toLowerCase()]=v;},writeHead:(code:number)=>{status=code;return res;},end:(text='')=>{response+=text;}};await handler(req as unknown as IncomingMessage,res as unknown as ServerResponse);return{status,response,headers:out};}
 try{assert.equal((await request('/api/state')).status,401);assert.equal((await request('/control',{host:'attacker.invalid:3000'})).status,403);
 const page=await request('/control');assert.equal(page.status,200);assert.match(page.headers['content-type'],/text\/html/);const cookie=page.headers['set-cookie'].split(';')[0];
 const state=await request('/api/state',{cookie});assert.equal(state.status,200);assert.deepEqual(JSON.parse(state.response).state.devices,[]);
 assert.equal((await request('/api/disconnect',{cookie,origin:'http://127.0.0.1:3000','content-type':'application/json'},'POST','{}')).status,403);
 const csrf=JSON.parse(state.response).csrf;assert.equal((await request('/api/disconnect',{cookie,origin:'http://127.0.0.1:3000','content-type':'application/json','x-artemis-csrf':csrf},'POST','{}')).status,204);
 }finally{await manager.close();}
});
