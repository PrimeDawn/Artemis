"""Real CTRL+C to a hidden console owned by this test; no user console touched."""
import sys,os,subprocess,ctypes,time,socket,json,threading,queue,datetime
from pathlib import Path
def send(pid):
 k=ctypes.WinDLL('kernel32',use_last_error=True);k.FreeConsole()
 if not k.AttachConsole(int(pid)):return 10
 try:
  if not k.SetConsoleCtrlHandler(None,True):return 11
  if not k.GenerateConsoleCtrlEvent(0,0):return 12
  time.sleep(.2);return 0
 finally:k.FreeConsole()
if len(sys.argv)>1 and sys.argv[1]=='--send':raise SystemExit(send(sys.argv[2]))
sys.stdout.reconfigure(encoding='utf-8');out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False);data=Path(sys.argv[2]).resolve();data.mkdir(parents=True,exist_ok=False);host=sys.argv[3]
def port(ip):
 with socket.socket() as p:p.bind((ip,0));return p.getsockname()[1]
cp,tp=port('127.0.0.1'),port(host)
env={**os.environ,'ARTEMIS_LAN_HOST':host,'ARTEMIS_DATA_DIR':str(data),'ARTEMIS_CONTROL_PORT':str(cp),'ARTEMIS_TLS_PORT':str(tp)}
startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=subprocess.SW_HIDE
argv=[os.environ.get('ARTEMIS_NODE','E:/Dev/Nodejs/node.exe'),'receiver/dist/src/pairing-cli.js'];started=datetime.datetime.now(datetime.timezone.utc).isoformat();child=subprocess.Popen(argv,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',creationflags=subprocess.CREATE_NEW_CONSOLE,startupinfo=startup)
stdout=[];stderr=[];events=queue.Queue()
def reader(stream,rows):
 for line in stream:
  rows.append(line.rstrip())
  try:events.put(json.loads(line))
  except ValueError:pass
t=threading.Thread(target=reader,args=(child.stdout,stdout),daemon=True);t.start();threading.Thread(target=reader,args=(child.stderr,stderr),daemon=True).start()
result={'startedAt':started,'transport':'Windows GenerateConsoleCtrlEvent CTRL_C_EVENT','passed':False,'forcedCleanup':False,'ports':{'control':cp,'tls':tp},'caseId':'TC-19'}
try:
 deadline=time.monotonic()+15;ready=False
 while time.monotonic()<deadline:
  try:
   if events.get(timeout=.1).get('event')=='pairing_started':ready=True;break
  except queue.Empty:pass
 if not ready:raise RuntimeError('production CLI did not start')
 sender=subprocess.run([sys.executable,str(Path(__file__).resolve()),'--send',str(child.pid)],capture_output=True,timeout=6);result['signalSenderExitCode']=sender.returncode
 if sender.returncode:raise RuntimeError('isolated console signal delivery failed')
 child.wait(timeout=15);t.join(timeout=2);result['childExitCode']=child.returncode
 if child.returncode:raise RuntimeError('nonzero production CLI exit')
 if not any('pairing_stopped' in x for x in stdout):raise RuntimeError('no graceful stopped event')
 for ip,p in [('127.0.0.1',cp),(host,tp)]:
  with socket.socket() as probe:probe.bind((ip,p))
 result.update(passed=True,portsRebound=True,processExited=True,mdnsReleasedByProcessExit=True)
except Exception as e:result['error']=str(e)
finally:
 if child.poll() is None:result['forcedCleanup']=True;child.kill();child.wait(timeout=5)
 t.join(timeout=2);result['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();(out/'console.log').write_text('Command: '+subprocess.list2cmdline(argv)+'\nTimestamp: '+started+'\n'+'\n'.join(stdout+stderr)+'\nExit code: '+str(child.returncode)+'\n',encoding='utf-8');(out/'result.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))
raise SystemExit(0 if result['passed'] and not result['forcedCleanup'] else 1)
