"""Read-only ADB device inventory; never persist or print complete serial IDs."""
import argparse
import datetime
import json
from pathlib import Path
import subprocess

p=argparse.ArgumentParser()
p.add_argument('--sdk-root',type=Path,required=True)
p.add_argument('--report-dir',type=Path,required=True)
a=p.parse_args()
a.report_dir.mkdir(parents=True,exist_ok=True)
adb=a.sdk_root/'platform-tools/adb.exe'
result=subprocess.run([str(adb),'devices'],capture_output=True,text=True,timeout=20)
devices=[]
for line in result.stdout.splitlines():
    fields=line.split()
    if len(fields)<2 or fields[1] not in ['device','unauthorized','offline']:continue
    serial,state=fields[:2]
    item={'id':f'device-{len(devices)+1}','state':state}
    if state=='device':
        for key,command in {
            'model':['getprop','ro.product.model'],
            'api':['getprop','ro.build.version.sdk'],
            'abi':['getprop','ro.product.cpu.abi'],
            'pageSize':['getconf','PAGE_SIZE'],
        }.items():
            observed=subprocess.run([str(adb),'-s',serial,'shell',*command],capture_output=True,text=True,timeout=10)
            item[key]=observed.stdout.strip() if observed.returncode==0 else None
    devices.append(item)
authorized=[d for d in devices if d['state']=='device']
def conditional(case,predicate,reason):
    suitable=[d['id'] for d in authorized if predicate(d)]
    return {'id':case,'status':'available' if suitable else 'not-run','devices':suitable,
            'reason':'Device available; runtime test still required' if suitable else reason}
report={'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'adbExitCode':result.returncode,'devices':devices,
        'cases':[
            conditional('TC-D1',lambda d:int(d.get('api') or 0)>=29,'No authorized Android API29+ device is connected'),
            conditional('TC-D2',lambda d:d.get('api')=='29','No authorized API29 device or emulator is connected'),
            conditional('TC-D3',lambda d:d.get('pageSize')=='16384','No authorized 16KB device or emulator is connected'),
        ],'privacy':'Complete ADB serial identifiers were kept only in process memory and not persisted.'}
(a.report_dir/'devices.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
raise SystemExit(0 if result.returncode==0 else 1)
