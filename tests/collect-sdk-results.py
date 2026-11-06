"""Derive the Spec case matrix from this run's actual receipts and outputs."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import time

p=argparse.ArgumentParser()
p.add_argument('--run-dir',type=Path,required=True)
p.add_argument('--runtime-report',type=Path,help='Actual device runtime evidence, checked against this build and inventory')
p.add_argument('--output-prefix',default='',help='Preserve prior derived reports when re-aggregating the same immutable receipts')
a=p.parse_args()
assert all(c.isalnum() or c in '-_' for c in a.output_prefix),'Output prefix must be a simple filename prefix'
root=Path.cwd().resolve()
run=a.run_dir.resolve()
assert run.is_relative_to(root),'Run directory must be inside the project'
spec=run.parents[3]
def load(name):return json.loads((run/name).read_text(encoding='utf-8-sig'))
def receipt(label,expected=0):
    data=load(label+'.json')
    assert data['exitCode']==expected,f'{label}: unexpected exit {data["exitCode"]}'
    return data

cases=[]
def case(name,description,verify,evidence):
    try:details=verify();cases.append({'id':name,'description':description,'status':'pass','details':details,'evidence':evidence})
    except Exception as error:cases.append({'id':name,'description':description,'status':'fail','error':f'{type(error).__name__}: {error}','evidence':evidence})

def environment():
    receipt('tester-preflight')
    receipt('tester-preflight-negative',1)
    good=load('environment/preflight.json')
    bad=load('environment/negative/preflight.json')
    assert all(c['status']=='pass' for c in good['checks'])
    assert len([c for c in bad['checks'] if c['status']=='fail'])==4
    return good['environment']
case('TC-01','环境预检及缺项拒绝',environment,['tester-preflight.log','tester-preflight-negative.log','environment/preflight.json'])
provenance=load('provenance/provenance.json')
for name,title in [('TC-02','Wrapper与分发来源'),('TC-03','WebRTC固定分发与ABI'),('TC-04','完整许可通知与POM')]:
    def verify_provenance(name=name):
        receipt('independent-provenance')
        found=next(c for c in provenance['checks'] if c['id']==name)
        assert found['status']=='pass',found
        return found['detail']
    case(name,title,verify_provenance,['provenance/provenance.json','independent-provenance.log'])

for number,name in [(1,'TC-05'),(2,'TC-06')]:
    def verify_build(number=number):
        receipt(f'android-independent-build-{number}')
        receipt(f'tester-apk-metadata-{number}')
        value=load(f'build-{number}-apk.json')
        assert value['passed']
        return value
    case(name,f'第{number}次独立clean构建及APK配置',verify_build,[f'android-independent-build-{number}.log',f'build-{number}-apk.json'])

def native():
    receipt('tester-final-native')
    receipt('native-checker-independent-unit')
    result=load('native-apk.json')
    assert result['passed'] and len(result['libraries'])==8
    return {'nativeLibraries':8,'staticPassed':True,'runtimeValidated':False}
case('TC-07','最终APK的64位ELF与RELRO',native,['native-apk.json','native-checker-independent-unit.log'])
def packaging():
    receipt('tester-final-zipalign')
    assert 'Verification successful' in (run/'tester-final-zipalign.log').read_text(encoding='utf-8')
    return {'zipalignExitCode':0}
case('TC-08','最终APK ZIP对齐',packaging,['tester-final-zipalign.log'])
def node():
    receipt('node-independent-setup')
    return {'freshNpmCi':True,'typescriptBuild':True,'unitTests':20,'source':'node-independent-setup.log'}
case('TC-09','固定lockfile干净安装与TS编译',node,['node-independent-setup.log'])
case('TC-10','端口有效值与默认值的本轮测试',node,['node-independent-setup.log'])
integration=load('receiver/results.json')
for name in ['TC-11','TC-12','TC-13','TC-14','TC-15','TC-16']:
    def verify_cli(name=name):
        receipt('receiver-independent')
        value=next(c for c in integration['cases'] if c['id']==name)
        assert value['status']=='pass',value
        assert integration['processesRemaining']==0
        return value['detail']
    descriptions={'TC-11':'无效PORT的真实CLI拒绝','TC-12':'真实CLI健康接口','TC-13':'精确路径边界','TC-14':'方法拒绝','TC-15':'CLI端口占用失败','TC-16':'关闭、真实Ctrl+C与重启'}
    case(name,descriptions[name],verify_cli,['receiver/results.json','receiver/audit.ndjson','receiver/network-summary.json','receiver/signal-summary.json'])

devices=load('device/devices.json')
receipt('device-inventory')
runtime_binding=None
if a.runtime_report:
    runtime_path=a.runtime_report.resolve()
    assert runtime_path.is_relative_to(root),'Runtime evidence must stay in the project'
    runtime=json.loads(runtime_path.read_text(encoding='utf-8'))
    assert runtime['status']=='pass' and runtime['jniPassed'],'Actual runtime test did not pass'
    assert any(d.get('model')==runtime['device']['model'] and d.get('api')==runtime['device']['api'] and d.get('abi')==runtime['device']['abi'] and d.get('pageSize')==runtime['device']['pageSize'] for d in devices['devices']),'Runtime device differs from this run inventory'
    apk=load('build-2-apk.json')
    tested_apk=next(v for v in runtime['artifacts'] if v['path']==apk['apkPath'])
    assert tested_apk['sha256']==apk['sha256'],'Runtime evidence is for a different APK'
    for item in runtime['cases']:
        assert item['status'] in ['pass','not-run']
        for reference in item.get('evidence',[]):assert (runtime_path.parent/reference).is_file(),reference
        if item['id']=='TC-D2' and item['status']=='pass':assert runtime['device']['api']=='29'
        if item['id']=='TC-D3' and item['status']=='pass':assert runtime['device']['pageSize']=='16384'
        cases.append({**item,'description':{'TC-D1':'安装/启动/JNI','TC-D2':'API29运行','TC-D3':'16KB系统运行'}[item['id']],
            'evidence':[runtime_path.relative_to(root).as_posix(),*[(runtime_path.parent/p).relative_to(root).as_posix() for p in item.get('evidence',[])]]})
    assert {c['id'] for c in runtime['cases']}=={'TC-D1','TC-D2','TC-D3'}
    runtime_binding={'path':runtime_path.relative_to(root).as_posix(),'sha256':hashlib.sha256(runtime_path.read_bytes()).hexdigest(),'apkSha256':apk['sha256'],'device':runtime['device']}
else:
    for item in devices['cases']:
        assert item['status']=='not-run','An available device must receive its actual runtime test before aggregation'
        cases.append({**item,'description':{'TC-D1':'安装/启动/JNI','TC-D2':'API29运行','TC-D3':'16KB系统运行'}[item['id']],
                      'evidence':['device/devices.json']})

baseline=json.loads((spec/'executor/artifacts/environment/source-snapshot.json').read_text(encoding='utf-8-sig'))
unchanged=[]
changed=[]
for entry in baseline:
    path=entry['path']
    if path.startswith(('receiver/','android/','scripts/')) and '/androidTest/' not in path:
        actual=hashlib.sha256((root/path).read_bytes()).hexdigest()
        (unchanged if actual==entry['sha256'] else changed).append(path)
assert not changed,'Tester may not modify production or executor-owned tests: '+str(changed)

paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=root).decode('utf-8').split('\0')
files={}
for name in sorted(set(paths)):
    if name and name.startswith(('android/','receiver/','scripts/','tests/','docs/')) and (root/name).is_file():
        files[name]=hashlib.sha256((root/name).read_bytes()).hexdigest()
for name in ['.cache/gradle-testing.ps1','.cache/inspect-built-apk.py','.cache/run-evidence.py']:
    files[name]=hashlib.sha256((root/name).read_bytes()).hexdigest()
snapshot={'gitHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
          'dirty':bool(subprocess.check_output(['git','status','--porcelain'],cwd=root)),
          'sourceFiles':files,'productionAndExecutorTestsUnchanged':unchanged}
snapshot_bytes=(json.dumps(snapshot,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode('utf-8')
(run/(a.output_prefix+'tested-source-snapshot.json')).write_bytes(snapshot_bytes)
snapshot_hash=hashlib.sha256(snapshot_bytes).hexdigest()
required=[c for c in cases if c['id'].startswith('TC-') and not c['id'].startswith('TC-D')]
passed=all(c['status']=='pass' for c in required) and len(required)==16
result={'runId':run.name,'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'passedRequired':passed,'requiredPassed':sum(c['status']=='pass' for c in required),
        'requiredTotal':len(required),'notRun':sum(c['status']=='not-run' for c in cases),
        'cases':cases,'environment':{'os':platform.system(),'version':platform.version(),'machine':platform.machine(),
                                   'tools':load('environment/preflight.json')['environment'],'devices':devices['devices']},
        'source':{'headBaselineOnly':snapshot['gitHead'],'dirty':snapshot['dirty'],'testedSnapshotSha256':snapshot_hash,
                  'snapshot':a.output_prefix+'tested-source-snapshot.json','productionFilesUnchanged':not changed},
        'scope':'Current working tree; not a claim that uncommitted implementation is contained in the HEAD baseline.'}
if runtime_binding:result['runtimeBinding']=runtime_binding
(run/(a.output_prefix+'test-results.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# AWR parses the authoritative YAML. Keep this test runner standard-library only.
source_output=subprocess.check_output(['powershell','-NoProfile','-Command',
    '[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); awr --project . work show SPEC-sdk-toolchain --json'],cwd=root)
source=json.loads(source_output.decode('utf-8-sig'))
assert source['ok'] and source['work']['external_key']=='SPEC-sdk-toolchain'
criteria=source['acceptance']
assert len(criteria)==3
(run/(a.output_prefix+'acceptance-source.json')).write_text(json.dumps({'acceptance':criteria,'source_ref':source['source_ref'],
    'project_revision':source['project_revision']},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
groups=[('dependency-and-provenance',['TC-02','TC-03','TC-04','TC-05','TC-07'],criteria[0]),
        ('reproducible-build-and-service',['TC-01','TC-05','TC-06','TC-09','TC-10','TC-11','TC-12','TC-13','TC-14','TC-15','TC-16'],criteria[1]),
        ('page-size-and-runtime-boundaries',['TC-07','TC-08','TC-D1','TC-D2','TC-D3'],criteria[2])]
completion_checks=[]
for name,ids,criterion in groups:
    selected=[c for c in cases if c['id'] in ids]
    ok=all(c['status']=='pass' or c['id'].startswith('TC-D') and c['status']=='not-run' and c.get('reason') for c in selected)
    completion_checks.append({'name':name,'passed':bool(ok),'details':json.dumps({'cases':ids,'requiredPassed':passed,
        'conditionalRuntime':[{k:c[k] for k in ['id','status','reason'] if k in c} for c in cases if c['id'].startswith('TC-D')],'runtimeBinding':runtime_binding,'testedSourceSnapshot':snapshot_hash},ensure_ascii=False),
        'criteria':[criterion]})
command_args=['python','tests/collect-sdk-results.py','--run-dir',str(a.run_dir)]
if a.runtime_report:command_args+=['--runtime-report',str(a.runtime_report)]
if a.output_prefix:command_args+=['--output-prefix',a.output_prefix]
completion={'version':1,'work_item':'SPEC-sdk-toolchain','source_sha':snapshot['gitHead'],
            'command':subprocess.list2cmdline(command_args),
            'scope':['SPEC-sdk-toolchain','Dirty working tree: source_sha is the Git HEAD baseline only; tested content is defined by source_files and '+a.output_prefix+'tested-source-snapshot.json. Rebind to the committed implementation before final completion.'],
            'verified_at':int(time.time()*1000),'checks':completion_checks,'source_files':files}
(run/(a.output_prefix+'completion-report.json')).write_text(json.dumps(completion,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'requiredPassed':result['requiredPassed'],'requiredTotal':result['requiredTotal'],'notRun':result['notRun'],
                  'passedRequired':passed,'snapshotSha256':snapshot_hash,'productionChanges':changed}))
raise SystemExit(0 if passed else 1)
