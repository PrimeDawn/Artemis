"""Consolidate immutable mandatory and runtime evidence for the same APKs."""
import argparse
from datetime import datetime,timezone
import hashlib,json,subprocess,time
from pathlib import Path

p=argparse.ArgumentParser()
for name in ['base-results','base-completion','phone-runtime','api29-runtime','page16k-runtime','output-dir']:
    p.add_argument('--'+name,type=Path,required=True)
a=p.parse_args();root=Path.cwd().resolve();out=a.output_dir.resolve()
assert out.is_relative_to(root)
out.mkdir(parents=True,exist_ok=True)
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def load(path):return json.loads(path.read_text(encoding='utf-8-sig'))
base=load(a.base_results);completion=load(a.base_completion)
assert base['passedRequired'] and base['requiredPassed']==base['requiredTotal']==16
inputs={}
for name,expected in completion['source_files'].items():
    if name.startswith(('android/','receiver/','scripts/','tests/')):
        assert digest(root/name)==expected,'Mandatory test input changed: '+name
        inputs[name]=expected
cases=[]
for c in base['cases']:
    if c['id'].startswith('TC-D'):continue
    assert c['status']=='pass'
    evidence=[]
    for name in c['evidence']:
        target=(root/name if name.startswith('spec/') else a.base_results.parent/name).resolve()
        assert target.is_file()
        evidence.append(target.relative_to(root).as_posix())
    cases.append({**c,'evidence':evidence,'origin':a.base_results.as_posix()})
bindings=[];apk_hashes=None
for case_id,path,kind,api,page in [
    ('TC-D1',a.phone_runtime,'usb',36,4096),
    ('TC-D2',a.api29_runtime,'emulator',29,4096),
    ('TC-D3',a.page16k_runtime,'emulator',36,16384),
]:
    value=load(path)
    assert value['status']=='pass' and value['jniPassed']
    device=value['device']
    assert device['kind']==kind and int(device['api'])==api and int(device['pageSize'])==page
    current={v['path']:v['sha256'] for v in value['artifacts']}
    assert all(digest(root/name)==sha for name,sha in current.items()),'Runtime APK differs from current build'
    if apk_hashes is None:apk_hashes=current
    assert current==apk_hashes,'Runtime environments used different APKs'
    selected=next(c for c in value['cases'] if c['id']==case_id)
    assert selected['status']=='pass'
    ui_case=next(c for c in value['cases'] if c['id']=='TC-D1')
    evidence=[path.resolve().relative_to(root).as_posix()]
    for name in ui_case['evidence']+['device-api.log','device-pageSize.log','device-abi.log']:
        target=path.parent/name;assert target.is_file(),str(target)
        evidence.append(target.resolve().relative_to(root).as_posix())
    jni=(path.parent/'jni-instrumentation.log').read_text(encoding='utf-8')
    assert 'OK (1 test)' in jni and 'INSTRUMENTATION_CODE: -1' in jni and 'Exit code: 0' in jni
    assert all(c['exitCode']==0 for c in value['commands'])
    cases.append({**selected,'description':{'TC-D1':'手机安装/界面/JNI','TC-D2':'Android10模拟器运行','TC-D3':'16KB模拟器运行'}[case_id],
                  'device':device,'evidence':evidence})
    bindings.append({'case':case_id,'path':path.as_posix(),'sha256':digest(path),'device':device,
                     'startedAt':value['startedAt'],'finishedAt':value['finishedAt'],'apkHashes':current})
assert len(cases)==19 and len({c['id'] for c in cases})==19 and all(c['status']=='pass' for c in cases)
for name in ['tests/collect-runtime-matrix.py','.cache/run-emulator-runtime.py','.cache/create-emulator-avds.ps1']:
    inputs[name]=digest(root/name)
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
scope='Consolidated immutable mandatory receipts and three actual runtime environments, bound to identical current APK hashes. Mandatory code/test inputs are unchanged. Current dirty working tree: source_sha is the HEAD baseline only; rebind to the committed implementation before work completion.'
snapshot={'gitHeadBaselineOnly':head,'sourceFiles':inputs,'runtimeBindings':bindings,'scope':scope}
snapshot_path=out/'consolidated-source-snapshot.json'
assert not snapshot_path.exists(),'Never overwrite prior evidence'
snapshot_path.write_text(json.dumps(snapshot,ensure_ascii=False,sort_keys=True,indent=2)+'\n',encoding='utf-8')
result={'runId':out.name,'verifiedAt':datetime.now(timezone.utc).isoformat(),'passedRequired':True,
        'requiredPassed':16,'requiredTotal':16,'passed':19,'notRun':0,'failed':0,'cases':cases,
        'baseResults':{'path':a.base_results.as_posix(),'sha256':digest(a.base_results),'runId':base['runId']},
        'runtimeBindings':bindings,'snapshotSha256':digest(snapshot_path),'scope':scope}
(out/'consolidated-test-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
criteria=[v for check in completion['checks'] for v in check['criteria']]
assert len(criteria)==len(set(criteria))==3
command=['python','tests/collect-runtime-matrix.py']
for key in ['base_results','base_completion','phone_runtime','api29_runtime','page16k_runtime','output_dir']:
    command+=['--'+key.replace('_','-'),str(getattr(a,key))]
report={'version':1,'work_item':'SPEC-sdk-toolchain','source_sha':head,'command':subprocess.list2cmdline(command),
        'scope':['SPEC-sdk-toolchain',scope],'verified_at':int(time.time()*1000),'source_files':inputs,
        'checks':[{'name':check['name'],'passed':True,'criteria':check['criteria'],
                   'details':json.dumps({'all19CasesPassed':True,'runtimeBindings':bindings,'baseResultsSha256':digest(a.base_results),'sourceSnapshotSha256':digest(snapshot_path)},ensure_ascii=False)} for check in completion['checks']]}
(out/'consolidated-completion-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':19,'notRun':0,'failed':0,'snapshotSha256':digest(snapshot_path)}))
