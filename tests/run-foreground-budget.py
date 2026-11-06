import subprocess,datetime,json,time,os
from pathlib import Path
budget=json.loads(Path('.cache/foreground-test-budget.json').read_text(encoding='utf-8-sig'))
deadline=datetime.datetime.fromisoformat(budget['startedAt'].replace('Z','+00:00')).timestamp()+280
base=Path('spec/versions/v0.1/specs/20261029-0934-tech-离线配对与信令信任')
run_id=datetime.datetime.now().strftime('%Y%m%d-%H%M%S-foreground')
out=base/'tester/artifacts/test-logs'/run_id
Path('.cache/foreground-active-run.json').write_text(json.dumps({'runId':run_id,'runDir':out.as_posix(),'roundStartedAt':budget['startedAt']}),encoding='utf-8')
def run(label,command):
 remaining=deadline-time.time()
 if remaining<=0:raise SystemExit('E_TEST_BUDGET')
 path=base/'executor/artifacts'/(run_id+'-'+label)
 with path.open('w',encoding='utf-8') as log:
  log.write('Command: '+subprocess.list2cmdline(command)+'\nTimestamp: '+datetime.datetime.now(datetime.timezone.utc).isoformat()+'\n');log.flush()
  child=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT)
  try:code=child.wait(timeout=remaining)
  except subprocess.TimeoutExpired:
   subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],stdout=log,stderr=subprocess.STDOUT);code=124
  log.write('\nExit code: '+str(code)+'\n')
 print(json.dumps({'step':label,'exitCode':code,'remainingSeconds':deadline-time.time()}),flush=True)
 if code:raise SystemExit(code)
run('foreground-build-green.log',[str(Path('android/gradlew.bat').resolve()),'-p','android','--offline','--no-daemon','-PartemisMirror=true','testDebugUnitTest',':app:assembleDebug',':app:assembleDebugAndroidTest'])
run('foreground-phone-launch.log',['node','tests/pairing-phone-lifecycle.mjs','--out='+str(out)])
