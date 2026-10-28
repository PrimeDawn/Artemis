"""Independent hash, publication metadata and complete-notice checks."""
import argparse
import datetime
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

p=argparse.ArgumentParser()
p.add_argument('--report-dir',type=Path,required=True)
p.add_argument('--sdk-root',type=Path,required=True)
a=p.parse_args()
a.report_dir.mkdir(parents=True,exist_ok=True)
root=Path.cwd()
cache=root/'.cache/test-provenance'
cache.mkdir(parents=True,exist_ok=True)
lock=json.loads((root/'docs/toolchain-lock.json').read_text(encoding='utf-8'))
downloads=[]
checks=[]
def digest(path,algorithm='sha256'):
    h=hashlib.new(algorithm)
    with path.open('rb') as stream:
        while data:=stream.read(1024*1024):h.update(data)
    return h.hexdigest()
def fetch(url,name):
    path=cache/name
    from_cache=path.exists()
    if not from_cache:
        part=path.with_suffix(path.suffix+'.partial')
        with urllib.request.urlopen(url,timeout=60) as source,part.open('wb') as out:
            while data:=source.read(1024*1024):out.write(data)
        part.replace(path)
    downloads.append({'url':url,'cacheReused':from_cache,'bytes':path.stat().st_size,'sha256':digest(path)})
    return path
def record(case,action):
    try:detail=action();checks.append({'id':case,'status':'pass','detail':detail})
    except Exception as error:checks.append({'id':case,'status':'fail','error':f'{type(error).__name__}: {error}'})

def wrapper():
    jar=digest(root/'android/gradle/wrapper/gradle-wrapper.jar')
    assert jar==lock['android']['gradleWrapperSha256'],'Wrapper JAR SHA256 mismatch'
    official=fetch('https://services.gradle.org/distributions/gradle-8.13-bin.zip.sha256','gradle-8.13-bin.zip.sha256').read_text().strip()
    assert official==lock['android']['gradleDistributionSha256'],'Official distribution checksum differs from lock'
    archive=fetch('https://services.gradle.org/distributions/gradle-8.13-bin.zip','gradle-8.13-bin.zip')
    distribution=digest(archive)
    assert distribution==official,'Downloaded distribution SHA256 mismatch'
    cli_archive=a.sdk_root/'.downloads/commandlinetools-win-13114758_latest.zip'
    cli_sha1=digest(cli_archive,'sha1')
    assert cli_sha1==lock['android']['commandlineToolsSha1'],'CLI tools archive SHA1 mismatch'
    return {'wrapperSha256':jar,'distributionSha256':distribution,'sdkCliArchiveSha1':cli_sha1}

def sdk():
    resolved=root/'.cache/gradle/caches/modules-2/files-2.1/io.github.webrtc-sdk/android/150.7871.01'
    candidates=list(resolved.rglob('*.aar'))
    assert candidates,'Resolved Maven AAR is absent'
    aar=candidates[0]
    value=digest(aar)
    assert value==lock['webrtc']['aarSha256'],'Resolved Maven AAR SHA256 mismatch'
    with zipfile.ZipFile(aar) as archive:
        abis=sorted({name.split('/')[1] for name in archive.namelist() if name.startswith('jni/') and name.endswith('.so')})
        assert abis==sorted(lock['webrtc']['abis']),'Unexpected ABI inventory'
        with zipfile.ZipFile(io.BytesIO(archive.read('classes.jar'))) as classes:
            required=['org/webrtc/PeerConnectionFactory.class','org/webrtc/Camera2Enumerator.class','org/webrtc/audio/JavaAudioDeviceModule.class']
            assert all(name in classes.namelist() for name in required),'Required Java API class missing'
        manifest=ET.fromstring(archive.read('AndroidManifest.xml'))
        minimum=manifest.find('uses-sdk').attrib['{http://schemas.android.com/apk/res/android}minSdkVersion']
        assert minimum=='21','Unexpected SDK minimum API'
    return {'coordinate':lock['webrtc']['coordinate'],'aarSha256':value,'abis':abis,'javaClasses':required,'manifestMinSdk':minimum}

def licenses():
    base='https://raw.githubusercontent.com/webrtc-sdk/android/v150.7871.01/'
    publisher=fetch(base+'LICENSE','publisher-LICENSE')
    notices=fetch(base+'Licenses/WEBRTC.md','WEBRTC.md')
    pom=fetch('https://repo.maven.apache.org/maven2/io/github/webrtc-sdk/android/150.7871.01/android-150.7871.01.pom','webrtc.pom')
    ns={'m':'http://maven.apache.org/POM/4.0.0'}
    names=[node.text for node in ET.fromstring(pom.read_bytes()).findall('m:licenses/m:license/m:name',ns)]
    assert any('BSD' in name for name in names),'POM BSD license declaration missing'
    bundle=(root/'docs/third-party/WEBRTC-150.7871.01.md').read_bytes()
    assert publisher.read_bytes() in bundle,'Complete publisher license not preserved'
    assert notices.read_bytes() in bundle,'Complete original notice collection not preserved'
    return {'pomLicenseNames':names,'publisherLicenseSha256':digest(publisher),'fullNoticesSha256':digest(notices),
            'fullNoticesBytes':notices.stat().st_size,'completeSourceBytesPreserved':True}

record('TC-02',wrapper)
record('TC-03',sdk)
record('TC-04',licenses)
result={'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':checks,
        'downloads':downloads,'passed':all(c['status']=='pass' for c in checks)}
(a.report_dir/'provenance.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':result['passed'],'checks':checks},ensure_ascii=False))
raise SystemExit(0 if result['passed'] else 1)
