param([Parameter(Mandatory)][string]$HostIp,[Parameter(Mandatory)][string]$DataDir,[Parameter(Mandatory)][string]$OpenSslPath,[switch]$TestOnly,[switch]$Renew,[switch]$Rotate)
$ErrorActionPreference='Stop'
$taskData=[System.IO.Path]::GetFullPath($DataDir)
if(-not $taskData.StartsWith('E:\',[StringComparison]::OrdinalIgnoreCase)){throw 'DataDir must be on E drive'}
if($TestOnly){if($HostIp -notin @('127.0.0.1','127.0.0.2')){throw 'TestOnly permits loopback fixtures only'}}else{
 if($HostIp -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'){throw 'HostIp must be a private IPv4 address'}
}
if($Rotate){
 if(Test-Path -LiteralPath (Join-Path $taskData 'running.lock')){throw 'Stop receiver before identity rotation'}
 $taskSuffix=Get-Date -Format 'yyyyMMddHHmmssfff'
 foreach($taskName in @('identity-key.pem','certificate.pem','trust-store.json','selection.json')){
  $taskFile=Join-Path $taskData $taskName
  if(Test-Path -LiteralPath $taskFile){Rename-Item -LiteralPath $taskFile -NewName ($taskName+'.before-rotation-'+$taskSuffix)}
 }
}
$taskModule=Join-Path $PSScriptRoot '..\receiver\dist\src\identity.js'
if(-not(Test-Path -LiteralPath $taskModule)){throw 'Run npm --prefix receiver run build first'}
$taskCode=@'
import {pathToFileURL} from 'node:url';
const [modulePath,host,data,openssl,testOnly,renew]=process.argv.slice(1);
const {loadOrCreateIdentity,renewCertificate}=await import(pathToFileURL(modulePath));
let identity=await loadOrCreateIdentity({controlHost:'127.0.0.1',controlPort:3000,lanHost:host,tlsPort:3443,dataDir:data,opensslPath:openssl,testOnly:testOnly==='True'});
if(renew==='True')identity=await renewCertificate(identity,host,Date.now());
console.log(JSON.stringify({identityId:identity.peer.id,certificateExpiresAt:identity.certificateExpiresAt,privateKey:'not displayed'}));
'@
& node --input-type=module -e $taskCode $taskModule $HostIp $taskData $OpenSslPath $TestOnly.IsPresent.ToString() $Renew.IsPresent.ToString()
if($LASTEXITCODE -ne 0){throw 'Local identity generation failed'}
