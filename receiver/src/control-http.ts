import type {IncomingMessage,ServerResponse} from 'node:http';import type {PairingConfig,RandomBytes,SafeLogger}from'./protocol.js';import type{ConnectionManager}from'./connection-manager.js';
import {PairingError,object}from'./protocol.js';import{randomUUID,timingSafeEqual}from'node:crypto';import{readFile}from'node:fs/promises';
export interface ControlContext {config:PairingConfig;manager:ConnectionManager;random:RandomBytes;log:SafeLogger}
export function createControlHandler(context:ControlContext):(req:IncomingMessage,res:ServerResponse)=>Promise<void>{
 const sessions=new Map<string,string>(),base=new URL('../../public/',import.meta.url);
 const assets:Record<string,[string,string]>={'/control':['control.html','text/html'],'/assets/control.js':['control.js','text/javascript'],'/assets/app.css':['app.css','text/css']};
 function json(res:ServerResponse,status:number,value:unknown){res.setHeader('Content-Type','application/json; charset=utf-8');res.writeHead(status).end(JSON.stringify(value));}
 async function body(req:IncomingMessage):Promise<unknown>{let length=0,parts:Buffer[]=[];for await(const data of req){const part=Buffer.from(data);length+=part.length;if(length>4096)throw new PairingError('E_TOO_LARGE',413);parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString());}catch{throw new PairingError('E_INPUT');}}
 return async(req,res)=>{
  const requestId=randomUUID(),origin=`http://127.0.0.1:${context.config.controlPort}`;
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws://127.0.0.1:${context.config.controlPort}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
  try{
   if(req.headers.host!==`127.0.0.1:${context.config.controlPort}`)throw new PairingError('E_ORIGIN',403);
   const path=req.url??'';
   if(path==='/healthz'){if(req.method!=='GET')throw new PairingError('E_METHOD',405);json(res,200,{service:'artemis-receiver',status:'ok',version:'0.1.0-dev'});return;}
   if(assets[path]&&req.method==='GET'){
    if(path==='/control'){
     const cookie=context.random(32).toString('base64url'),csrf=context.random(32).toString('base64url');if(sessions.size>=32)sessions.delete(sessions.keys().next().value!);sessions.set(cookie,csrf);res.setHeader('Set-Cookie',`artemis_control=${cookie}; HttpOnly; SameSite=Strict; Path=/`);
    }
    const [file,type]=assets[path];res.setHeader('Content-Type',`${type}; charset=utf-8`);res.writeHead(200).end(await readFile(new URL(file,base)));return;
   }
   const match=/(?:^|;\s*)artemis_control=([A-Za-z0-9_-]{43})(?:;|$)/u.exec(req.headers.cookie??'');const csrf=match?sessions.get(match[1]):undefined;
   if(!csrf)throw new PairingError('E_AUTH',401);
   if(path==='/api/state'&&req.method==='GET'){let audio:unknown=null;try{audio=JSON.parse(await readFile(process.env.ARTEMIS_AUDIO_STATUS_PATH??`${context.config.dataDir}/audio-status.json`,'utf8'));}catch{audio=null;}json(res,200,{state:context.manager.state(),csrf,audio});return;}
   if(!['POST','DELETE'].includes(req.method??''))throw new PairingError('E_NOT_FOUND',404);
   if(req.headers.origin!==origin)throw new PairingError('E_ORIGIN',403);
   const supplied=req.headers['x-artemis-csrf'];if(typeof supplied!=='string'||supplied.length!==csrf.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(csrf)))throw new PairingError('E_CSRF',403);
   if(req.headers['content-type']!=='application/json')throw new PairingError('E_INPUT');object(await body(req),[]);
   const device=/^\/api\/devices\/([A-Za-z0-9_-]{43})\/connect$/u.exec(path),forget=/^\/api\/trust\/([A-Za-z0-9_-]{43})$/u.exec(path);
   if(device&&req.method==='POST'){await context.manager.select(device[1]);json(res,202,{status:'connecting'});}
   else if(forget&&req.method==='DELETE'){await context.manager.forget(forget[1]);res.writeHead(204).end();}
   else if(path==='/api/disconnect'&&req.method==='POST'){await context.manager.disconnect();res.writeHead(204).end();}
   else throw new PairingError('E_NOT_FOUND',404);
   context.log({name:'control_action',requestId,code:null});
  }catch(e){const error=e instanceof PairingError?e:new PairingError('E_INTERNAL',500);context.log({name:'control_rejected',requestId,code:error.code});json(res,error.status,{code:error.code,message:error.code,requestId});}
 };
}
