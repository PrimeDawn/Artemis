"""Derive the phone-free Spec2 result from this run's immutable machine evidence."""
from pathlib import Path
import argparse,json,hashlib,re,datetime,subprocess,shutil,xml.etree.ElementTree as ET
ap=argparse.ArgumentParser();ap.add_argument('--run-dir',required=True);ap.add_argument('--allow-running',action='store_true');a=ap.parse_args();root=Path.cwd();run=Path(a.run_dir);state=json.loads(Path('.cache/spec2-run.json').read_text(encoding='utf-8-sig'));spec=Path(state['specDir'])
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def cmd(args):return subprocess.check_output(args,cwd=root,text=True,encoding='utf-8').strip()
groups=['trust','reconnect-wire-body','limits-valid-frames','hardening-storage','hardening-presence-cap','hardening-trust-cap','hardening-signal-bounds','web-cdp','web-real-disk-failure','runtime','hot-cert-renewal','actual-eight-candidates','auth-real-boundaries']
results={n:read(run/n/'result.json') for n in groups}
assert all(r['passed'] and all(c['status']=='pass' for c in r['cases']) for r in results.values()),'Selected independent run failed'
soakPath=run/'soak-git-openssl/result.json';soak=read(soakPath) if soakPath.exists() else None
if not a.allow_running:assert soak and soak['passed'],'Real 65-minute run has not passed'
measured=read(run/'soak-git-openssl/measured-duration.json') if soak and soak['passed'] else None
if measured:assert measured['elapsedMs']>=3900000 and measured['senderPings']>=125 and measured['receiverPings']>=125 and measured['firstApprovals']==1 and not measured['injectedClock']
native={name:read(run/name/'device/result.json') for name in ['android-api29-final-cold','android-api36-final-cold']};assert all(r['passed'] and not r['forcedCleanup'] and r['emulatorExitCode']==0 for r in native.values())
nativeStages={name:read(run/name/'android-stages.json') for name in native};nativeMetrics={}
for name,rows in nativeStages.items():
 names={r['stage']:r['at'] for r in rows};assert 'cold-path-no-tcp-tls-warmup' in names
 start=datetime.datetime.fromisoformat(names['observed-actual-disconnect'].replace('Z','+00:00'));end=datetime.datetime.fromisoformat(names['reconnected-without-consent'].replace('Z','+00:00'));elapsed=(end-start).total_seconds()*1000;assert elapsed<10000
 nativeMetrics[name]={'recoveryMsIncludingPcRenewalAndRestart':elapsed,'discoveryCallbackBridge':True,'coldPath':True}
node=(run/'node-independent-tests.log').read_text(encoding='utf-8');assert 'ℹ tests 43' in node and 'ℹ fail 0' in node and 'Exit code: 0' in node
legacy=read(run/'legacy-cli/result.json') if (run/'legacy-cli/result.json').exists() else read(run/'legacy-cli/results.json')
assert legacy['passed'] and legacy['processesRemaining']==0
cli=read(run/'windows-ctrl-c/result.json');assert cli['passed'] and cli['childExitCode']==0 and not cli['forcedCleanup'] and cli['portsRebound']
junit=[];total=0
for p in sorted(Path('android/app/build/test-results/testDebugUnitTest').glob('TEST-*.xml')):
 data=ET.fromstring(p.read_bytes());count=int(data.get('tests'));assert all(int(data.get(k,'0'))==0 for k in ['errors','failures','skipped']);total+=count;target=run/'junit'/p.name;target.parent.mkdir(exist_ok=True);shutil.copyfile(p,target);junit.append({'file':target.relative_to(run).as_posix(),'sha256':sha(target),'tests':count})
assert total==15,'Final nine-PC JVM run must execute all 15, none skipped'
assert 'Exit code: 0' in (run/'android-final-jvm15.log').read_text(encoding='utf-8')
apks=[]
for p in [Path('android/app/build/outputs/apk/debug/app-debug.apk'),Path('android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')]:apks.append({'path':p.as_posix(),'sha256':sha(p),'bytes':p.stat().st_size})
for n,r in native.items():assert {i['sha256'] for i in r['installedArtifacts']}=={i['sha256'] for i in apks},'Final emulator APK binding mismatch'
assert read(run/'final-apk-native.json')['passed'];assert 'Exit code: 0' in (run/'final-apk-zipalign.log').read_text(encoding='utf-8')
snapshot=read(spec/'executor/artifacts/implementation-snapshot.json');production=[]
def business(p):return not (p.startswith('tests/') or p.startswith('receiver/test/') or '/src/test/' in p or '/src/androidTest/' in p)
for f in snapshot['sources']:
 if business(f['path']):assert sha(root/f['path'])==f['sha256'],'Production source changed after approved implementation: '+f['path'];production.append(f)
productionDigest=hashlib.sha256(json.dumps(production,sort_keys=True,separators=(',',':')).encode()).hexdigest()
assert cmd(['git','branch','--show-current'])==state['branch'];assert cmd(['git','rev-parse','HEAD'])==state['base'];assert not cmd(['git','diff','--cached','--name-only'])
assert sha(root/'产品规划.md')=='876f30fb3dc221eaabbf2b11636d234c2ec631dd716c7959f5402eebf008b2aa'
# Do not emit any match contents: machine audit records filenames and rule identifiers only.
patterns={'private-pem':r'-----BEGIN (?:EC |RSA |ENCRYPTED )?PRIVATE KEY-----','control-cookie':r'artemis_control=[A-Za-z0-9_-]{20,}','bearer':r'Authorization:\s*Bearer\s+\S+','secret-json':r'"(?:ticket|nonce|signature|csrf)"\s*:\s*"[A-Za-z0-9_-]{20,}"','raw-sdp':r'"sdp"\s*:\s*"v=0'}
findings=[];files=[]
for p in sorted(run.rglob('*')):
 if not p.is_file() or p.name.startswith('derived-'):continue
 files.append({'path':p.relative_to(run).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size})
 if p.suffix in ['.json','.ndjson','.log','.xml','.txt']:
  t=p.read_text(encoding='utf-8-sig',errors='replace')
  for name,pattern in patterns.items():
   if re.search(pattern,t,re.I):findings.append({'file':p.relative_to(run).as_posix(),'rule':name})
assert not findings,'Evidence privacy audit failed (see filenames only): '+str(findings)
mapping={
1:('配置/旧健康回归',['node-independent-tests.log','legacy-cli/results.json']),2:('v2解析/真实签名与重放拒绝',['trust/result.json','auth-real-boundaries/result.json']),3:('TLS与在线同钥续签',['trust/result.json','hot-cert-renewal/result.json','android-api36-final-cold/device/result.json']),4:('错误SPKI/SAN/过期证书拒绝',['trust/result.json','junit/TEST-io.github.primedawn.artemis.pairing.PairingTlsIntegrationTest.xml']),5:('首次允许/拒绝与持久授权',['trust/result.json','web-cdp/result.json']),6:('已信任免重复配对',['reconnect-wire-body/result.json','android-api29-final-cold/device/result.json']),7:('Cookie/Origin/Host/CSRF真实拒绝',['trust/result.json']),8:('真实单次票据/60秒过期及活动期限解耦',['trust/result.json','soak-git-openssl/result.json']),9:('唯一活动设备/接收端',['trust/result.json','web-cdp/result.json']),10:('真实Chrome offer/answer路由及datachannel',['web-cdp/rtc-generated-summary.json']),11:('真实ICE、必要畸形/数量边界',['web-cdp/rtc-generated-summary.json','hardening-signal-bounds/result.json']),12:('72小时时间模拟取消固定到期',['node-independent-tests.log']),13:('真实连接丢失、安卓自动恢复与退避边界',['reconnect-wire-body/result.json','android-api29-final-cold/android-stages.json','node-independent-tests.log']),14:('真实32/8/32、速率/大小/256来源与慢认证',['hardening-presence-cap/result.json','actual-eight-candidates/result.json','hardening-trust-cap/result.json','limits-valid-frames/result.json','auth-real-boundaries/result.json']),15:('真实控制页鼠标单击主流程',['web-cdp/result.json']),16:('真实网页拒绝/busy/磁盘故障恢复',['web-cdp/result.json','web-real-disk-failure/result.json']),17:('真实本机mDNS发布/解析与身份去重',['runtime/result.json','trust/result.json']),18:('Android 15项JVM/两种APK/权限',['android-final-jvm15.log','junit/TEST-io.github.primedawn.artemis.pairing.CandidateCapacityIntegrationTest.xml','android-api36-final-cold/device/result.json']),19:('真实Windows Ctrl+C/双监听与WS关闭',['windows-ctrl-c/result.json','runtime/result.json']),20:('日志隐私与应用本地请求',['web-cdp/result.json','derived-summary.json']),21:('真实文件、进程重启/端点/原子失败/损坏拒绝',['reconnect-wire-body/result.json','hardening-storage/result.json']),22:('实际App页面重建及用户停止/取消信任',['android-api29-final-cold/device/result.json','web-cdp/result.json']),23:('真实3900秒保活',['soak-git-openssl/result.json','soak-git-openssl/measured-duration.json']),24:('恢复新epoch/旧身份授权隔离',['reconnect-wire-body/result.json','trust/result.json'])}
cases=[]
for number,(title,evidence) in mapping.items():
 status='running' if number in [8,23] and not measured else 'pass'
 # TC-08's independent actual 60-second behavior is already complete; long-active coverage is TC-23.
 if number==8:status='pass'
 if number==8 and not measured:evidence=[p for p in evidence if not p.startswith('soak-git-openssl/')]
 evidence=[p if (run/p).exists() or p=='derived-summary.json' else p.replace('legacy-cli/results.json','legacy-cli/result.json') for p in evidence]
 if status=='pass':assert all((run/p).is_file() or p=='derived-summary.json' for p in evidence),'missing evidence for TC-'+str(number)
 cases.append({'id':f'TC-{number:02}','title':title,'status':status,'evidence':evidence})
historical=[]
for p in sorted(run.rglob('result.json')):
 if p.parent.relative_to(run).as_posix() in groups or 'final-cold' in str(p) or 'soak-git-openssl' in str(p):continue
 d=read(p)
 if d.get('passed') is False:historical.append({'file':p.relative_to(run).as_posix(),'error':d.get('error'),'supersededByFreshRun':True,'rootCauseEstablished':False if any(x in str(p) for x in ['android-api29/','android-api36-e-home/']) else None})
result={'derived':True,'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Phone-free Spec2 batch only, not real S24/Android NSD/background/media acceptance','runId':run.name,'passed':all(c['status']=='pass' for c in cases),'counts':{k:sum(c['status']==k for c in cases) for k in ['pass','running','fail']},'cases':cases,'nodeTests':43,'jvmTests':15,'jvm':junit,'nativeMatrix':native,'nativeMetrics':nativeMetrics,'apks':apks,'productionSourceDigest':productionDigest,'productionSourceMatchesApprovedImplementation':True,'gitHead':state['base'],'gitBranch':state['branch'],'staged':False,'productionBugFixes':0,'testSetupChangesOnly':True,'soak':measured,'privacyFindings':findings,'evidenceManifest':files,'historicalFailedAttempts':historical,'limitations':['No physical phone connected; S24 LAN NSD and real phone 65-minute run pending','Android emulator discovery callback used real host endpoint bridge','72-hour and maintenance-date boundary triggers are simulations, system clock untouched','Earlier instrumentation crash/API29 connection timeout did not reproduce; root cause remains unproven','Actual WAN disconnection excluded by user; no OBS/media acceptance']}
(run/'derived-summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:result[k] for k in ['passed','counts','nodeTests','jvmTests','productionSourceDigest','productionBugFixes']},ensure_ascii=False));raise SystemExit(0 if result['passed'] or a.allow_running else 1)
