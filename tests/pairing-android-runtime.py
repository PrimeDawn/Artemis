"""Use only the pre-existing AVD chosen by this run; own boot, install and cleanup."""
from pathlib import Path
import sys,json,os,subprocess,datetime,time,socket,hashlib,re
sys.stdout.reconfigure(encoding='utf-8',errors='replace');cfg=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'));out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=False);api=int(sys.argv[3]);name='artemis_api36_16k' if api==36 else 'artemis_api29'
sdk=Path('E:/Dev/Artemis/Android/Sdk');adb=str(sdk/'platform-tools/adb.exe');env={**os.environ,'ANDROID_HOME':str(sdk),'ANDROID_SDK_ROOT':str(sdk),'ANDROID_AVD_HOME':'E:/Dev/Artemis/avd','ANDROID_USER_HOME':'E:/Dev/Artemis/.android','ANDROID_EMULATOR_HOME':'E:/Dev/Artemis/.android','TEMP':str(Path('.cache/test-tmp').resolve()),'TMP':str(Path('.cache/test-tmp').resolve())}
port=5558
for p in [port,port+1]:
 with socket.socket() as probe:probe.bind(('127.0.0.1',p))
serial='emulator-'+str(port);args=[str(sdk/'emulator/emulator.exe'),'-avd',name,'-port',str(port),'-no-window','-no-audio','-no-boot-anim','-no-snapshot','-gpu','swiftshader','-camera-back','none','-camera-front','none','-memory','2048','-cores','2']
started=datetime.datetime.now(datetime.timezone.utc).isoformat();boot=(out/'emulator-boot.log').open('wb');boot.write(('Command: '+subprocess.list2cmdline(args)+'\nTimestamp: '+started+'\n').encode());boot.flush();child=subprocess.Popen(args,env=env,stdout=boot,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW);result={'startedAt':started,'apiRequired':api,'avd':name,'passed':False,'forcedCleanup':False,'instrumentation':[]}
def run(label,tail,timeout=120,stream=False):
 argv=[adb,'-s',serial,*tail];path=out/(label+'.log');now=datetime.datetime.now(datetime.timezone.utc).isoformat()
 if not stream:r=subprocess.run(argv,capture_output=True,timeout=timeout);text=(r.stdout+r.stderr).decode('utf-8',errors='replace');code=r.returncode
 else:
  p=subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);rows=[]
  for b in p.stdout:
   t=b.decode('utf-8',errors='replace');rows.append(t)
   if 'INSTRUMENTATION_STATUS: stage=' in t:print(json.dumps({'stage':t.split('stage=',1)[1].strip()}),flush=True)
  code=p.wait(timeout=timeout);text=''.join(rows)
 path.write_text('Command: '+subprocess.list2cmdline(argv)+'\nTimestamp: '+now+'\n'+text+'\nExit code: '+str(code)+'\n',encoding='utf-8')
 if code:raise RuntimeError(label+' command failed')
 return text
try:
 until=time.monotonic()+180
 while time.monotonic()<until:
  if child.poll() is not None:raise RuntimeError('owned emulator exited before boot')
  q=subprocess.run([adb,'-s',serial,'shell','getprop','sys.boot_completed'],capture_output=True,timeout=10)
  if q.returncode==0 and q.stdout.strip()==b'1':break
  time.sleep(2)
 else:raise RuntimeError('owned AVD boot timeout')
 if name not in run('owned-avd',['emu','avd','name']):raise RuntimeError('wrong owned AVD')
 actualApi=int(run('actual-api',['shell','getprop','ro.build.version.sdk']).strip());pageSize=int(run('actual-page-size',['shell','getconf','PAGE_SIZE']).strip());result.update(actualApi=actualApi,pageSize=pageSize)
 if actualApi!=api or pageSize!=(16384 if api==36 else 4096):raise RuntimeError('unexpected runtime matrix')
 run('virtual-device-routes',['shell','ip','route','show'])
 run('unlock',['shell','wm','dismiss-keyguard']);run('install-main',['install','-r','android/app/build/outputs/apk/debug/app-debug.apk']);run('install-test',['install','-r','android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'])
 hashes=[]
 for package,apk in [('io.github.primedawn.artemis','android/app/build/outputs/apk/debug/app-debug.apk'),('io.github.primedawn.artemis.test','android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')]:
  remote=run('path-'+package,['shell','pm','path',package]).strip().removeprefix('package:');assert re.fullmatch(r'/data/app/[A-Za-z0-9_~+=/.-]+/base.apk',remote);observed=run('sha-'+package,['exec-out','sha256sum',remote]).split()[0];expected=hashlib.sha256(Path(apk).read_bytes()).hexdigest();assert observed==expected;hashes.append({'package':package,'sha256':observed,'matchesApk':True})
 result['installedArtifacts']=hashes
 for label,klass,count in [('components','io.github.primedawn.artemis.pairing.ConnectionInstrumentedTest',3),('jni','io.github.primedawn.artemis.WebRtcSdkSmokeTest',1),('real-app-e2e','io.github.primedawn.artemis.pairing.PairingEndToEndInstrumentedTest',1)]:
  tail=['shell','am','instrument','-w','-r','-e','class',klass]
  if label=='real-app-e2e':tail+=['-e','host',cfg['host'],'-e','tlsPort',str(cfg['tlsPort']),'-e','pcPeerB64',cfg['pcPeerB64'],'-e','skipTransportProbe',str(cfg.get('skipTransportProbe',False)).lower()]
  tail+=['io.github.primedawn.artemis.test/androidx.test.runner.AndroidJUnitRunner'];text=run(label,tail,180,stream=True);good=('OK ('+str(count)+(' test)' if count==1 else ' tests)')) in text and 'FAILURES!!!' not in text;result['instrumentation'].append({'name':label,'tests':count,'passed':good})
  if not good:raise RuntimeError(label+' assertion failed')
 # Instrumentation completion closes its Activity. Reopen and observe the actual
 # App before capturing, rather than mislabelling the launcher as an App screenshot.
 run('reopen-for-ui-evidence',['shell','am','start','-W','-n','io.github.primedawn.artemis/.MainActivity'])
 deadline=time.monotonic()+15;appUi=False
 while time.monotonic()<deadline:
  dump=subprocess.run([adb,'-s',serial,'shell','uiautomator','dump','/data/local/tmp/artemis-pairing-ui.xml'],capture_output=True,timeout=15)
  tree=subprocess.run([adb,'-s',serial,'exec-out','cat','/data/local/tmp/artemis-pairing-ui.xml'],capture_output=True,timeout=10)
  if tree.returncode==0 and '设备连接' in tree.stdout.decode('utf-8',errors='replace') and b'io.github.primedawn.artemis' in tree.stdout:
   (out/'actual-app-ui.xml').write_bytes(tree.stdout);appUi=True;break
 if not appUi:raise RuntimeError('actual App UI not observed before screenshot')
 shot=subprocess.run([adb,'-s',serial,'exec-out','screencap','-p'],capture_output=True,check=True,timeout=15);(out/'final-app-screen.png').write_bytes(shot.stdout);result['actualAppUiObserved']=True;result['passed']=True
except Exception as e:
 result['error']=str(e)
 if child.poll() is None:
  try:run('failure-crash-buffer',['logcat','-d','-b','crash','-v','brief'],20)
  except Exception:pass
finally:
 if child.poll() is None:
  stopped=subprocess.run([adb,'-s',serial,'emu','kill'],capture_output=True,timeout=15);result['emulatorKillExitCode']=stopped.returncode
  try:child.wait(timeout=20)
  except subprocess.TimeoutExpired:result['forcedCleanup']=True;child.terminate();child.wait(timeout=10)
 boot.write(('\nExit code: '+str(child.returncode)+'\n').encode());boot.close();result['emulatorExitCode']=child.returncode;result['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();result['passed']=result['passed'] and not result['forcedCleanup'];(out/'result.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps({'androidResult':result}),flush=True)
raise SystemExit(0 if result['passed'] else 1)
