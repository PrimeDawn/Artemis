import{pathToFileURL}from'node:url';import{networkInterfaces}from'node:os';import{parsePairingConfig}from'./pairing-config.js';import{startPairingServer}from'./pairing-server.js';import{PairingError}from'./protocol.js';
export async function pairingMain(env:NodeJS.ProcessEnv=process.env):Promise<void>{
 try{const running=await startPairingServer(parsePairingConfig(env,networkInterfaces()),event=>console.log(JSON.stringify(event)));console.log(JSON.stringify({event:'pairing_started',control:running.controlAddress}));
  const shutdown=()=>{process.off('SIGINT',shutdown);process.off('SIGTERM',shutdown);void running.close().then(()=>console.log(JSON.stringify({event:'pairing_stopped'}))).catch(()=>{console.error(JSON.stringify({event:'pairing_error',code:'E_CLOSE'}));process.exitCode=1;});};process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
 }catch(e){console.error(JSON.stringify({event:'pairing_error',code:e instanceof PairingError?e.code:'E_START'}));process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await pairingMain();
