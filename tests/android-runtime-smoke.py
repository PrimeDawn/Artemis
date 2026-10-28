"""Run the planned install, launch and JNI checks on one authorized device.

Device identifiers remain in memory. Only the Artemis UI is retained in the
hierarchy and a screenshot is taken after its expected texts are verified.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')
p = argparse.ArgumentParser()
p.add_argument('--sdk-root', type=Path, required=True)
p.add_argument('--report-dir', type=Path, required=True)
p.add_argument('--wait-seconds', type=int, default=0)
p.add_argument('--skip-install', action='store_true', help='Verify installed APK hashes instead of reinstalling')
p.add_argument('--device-kind', choices=['usb', 'emulator'], default='usb')
p.add_argument('--expected-api', type=int)
p.add_argument('--expected-page-size', type=int)
a = p.parse_args()
root = Path.cwd().resolve()
out = a.report_dir.resolve()
assert out.is_relative_to(root), 'Evidence must stay inside the project'
assert 0 <= a.wait_seconds <= 60
out.mkdir(parents=True, exist_ok=True)
adb = str(a.sdk_root / 'platform-tools/adb.exe')
selector = '-d' if a.device_kind == 'usb' else '-e'
package = 'io.github.primedawn.artemis'
records = []

def now(): return datetime.now(timezone.utc).isoformat()
def sha(data): return hashlib.sha256(data).hexdigest()
def redact(text):
    for raw, replacement in [(str(Path.home()), '%USERPROFILE%'),
                             (str(root), '%PROJECT_ROOT%'),
                             (str(root).replace('\\', '/'), '%PROJECT_ROOT%')]:
        text = text.replace(raw, replacement)
    return text

def command(label, args, timeout=60, binary=False, project_ui_only=False):
    argv = [adb, selector, *args]
    started = now()
    try:
        result = subprocess.run(argv, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        (out / (label + '.log')).write_text(
            f'Command: {redact(subprocess.list2cmdline(argv))}\nTimestamp: {started}\n'
            f'Timeout seconds: {timeout}\nExit code: not-returned (timeout)\nFinished: {now()}\n', encoding='utf-8')
        raise AssertionError(label + ' timed out') from error
    stdout = result.stdout.decode('utf-8', errors='replace') if not binary else ''
    stderr = result.stderr.decode('utf-8', errors='replace')
    if project_ui_only:
        source = ET.fromstring(result.stdout)
        selected = ET.Element('artemis-hierarchy', {'scope': 'Artemis package nodes only'})
        for node in source.iter('node'):
            if node.get('package') == package:
                ET.SubElement(selected, 'node', dict(node.attrib))
        ET.ElementTree(selected).write(out / 'artemis-ui.xml', encoding='utf-8', xml_declaration=True)
        stdout = 'App-only UI tree saved; other package nodes were not persisted.'
    if binary:
        stdout = f'Binary output: {len(result.stdout)} bytes, SHA256 {sha(result.stdout)}'
    text = (f'Command: {redact(subprocess.list2cmdline(argv))}\nTimestamp: {started}\n'
            f'{redact(stdout)}\n--- stderr ---\n{redact(stderr)}\n'
            f'Exit code: {result.returncode}\nFinished: {now()}\n')
    (out / (label + '.log')).write_text(text, encoding='utf-8')
    records.append({'label': label, 'command': redact(subprocess.list2cmdline(argv)),
                    'startedAt': started, 'finishedAt': now(), 'exitCode': result.returncode,
                    'stdoutSha256': sha(result.stdout), 'stderrSha256': sha(result.stderr),
                    'privacyFilter': 'Artemis UI package only' if project_ui_only else None})
    assert result.returncode == 0, f'{label} failed: {redact(stderr or stdout)}'
    return result.stdout if binary or project_ui_only else stdout

deadline = time.monotonic() + a.wait_seconds
while True:
    state = subprocess.run([adb, selector, 'get-state'], capture_output=True, timeout=10)
    if state.returncode == 0 and state.stdout.strip() == b'device': break
    if time.monotonic() >= deadline:
        result = {'verifiedAt': now(), 'status': 'not-run', 'reason': 'No single authorized ' + a.device_kind + ' device is available',
                  'cases': [{'id': name, 'status': 'not-run', 'reason': a.device_kind + ' debug connection not ready'} for name in ['TC-D1', 'TC-D2', 'TC-D3']]}
        (out / 'runtime-results.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result))
        raise SystemExit(2)
    time.sleep(2)

result = {'startedAt': now(), 'device': {'id': a.device_kind + '-device-1', 'kind': a.device_kind}, 'cases': [],
          'scope': 'The current built APK on one authorized device; no other system version is inferred.'}
try:
    for key, args in {'manufacturer': ['getprop', 'ro.product.manufacturer'],
                      'model': ['getprop', 'ro.product.model'],
                      'android': ['getprop', 'ro.build.version.release'],
                      'api': ['getprop', 'ro.build.version.sdk'],
                      'abi': ['getprop', 'ro.product.cpu.abi'],
                      'pageSize': ['getconf', 'PAGE_SIZE']}.items():
        result['device'][key] = command('device-' + key, ['shell', *args]).strip()
    assert int(result['device']['api']) >= 29, 'This app needs API29 or higher'
    if a.expected_api is not None: assert int(result['device']['api']) == a.expected_api, 'Actual API differs from the test environment requirement'
    if a.expected_page_size is not None: assert int(result['device']['pageSize']) == a.expected_page_size, 'Actual page size differs from the test environment requirement'
    apk = root / 'android/app/build/outputs/apk/debug/app-debug.apk'
    test_apk = root / 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'
    result['artifacts'] = [{'path': x.relative_to(root).as_posix(), 'bytes': x.stat().st_size,
                            'sha256': sha(x.read_bytes())} for x in [apk, test_apk]]
    if a.skip_install:
        for name, application, local in [('app', package, apk), ('test', package + '.test', test_apk)]:
            remote = command('installed-path-' + name, ['shell', 'pm', 'path', application]).strip().removeprefix('package:')
            assert remote.startswith('/data/app/') and '\n' not in remote, 'Expected a single installed APK'
            observed = command('installed-hash-' + name, ['shell', 'sha256sum', remote]).split()[0]
            assert observed == sha(local.read_bytes()), 'Installed APK differs from the current built APK'
        result['installation'] = 'Previously installed; both on-device APK hashes rechecked against the current build'
    else:
        assert 'Success' in command('install-app', ['install', '-r', str(apk)], timeout=180)
        assert 'Success' in command('install-test', ['install', '-r', str(test_apk)], timeout=120)
        result['installation'] = 'Both APKs installed in this run'
    instrumentation = command('jni-instrumentation', ['shell', 'am', 'instrument', '-w', '-r',
        '-e', 'class', package + '.WebRtcSdkSmokeTest', package + '.test/androidx.test.runner.AndroidJUnitRunner'], timeout=180)
    assert re.search(r'OK\s*\(1 test\)', instrumentation), instrumentation
    assert 'INSTRUMENTATION_CODE: -1' in instrumentation, instrumentation
    assert not re.search(r'FAILURES!!!|INSTRUMENTATION_FAILED|Process crashed', instrumentation), instrumentation
    result['jniPassed'] = True
    launch = command('launch-activity', ['shell', 'am', 'start', '-W', '-n', package + '/.MainActivity'])
    assert 'Status: ok' in launch and 'Error:' not in launch, launch
    # A Samsung install/update dialog or lock screen must not be treated as the App UI.
    dump_path = '/data/local/tmp/artemis-sdk-ui.xml'
    command('ui-dump', ['shell', 'uiautomator', 'dump', dump_path], timeout=45)
    command('ui-read', ['exec-out', 'cat', dump_path], project_ui_only=True)
    ui = ET.parse(out / 'artemis-ui.xml')
    texts = [node.get('text', '') for node in ui.getroot().iter('node')]
    for text in ['Artemis', '工具链验证工程', '当前构建用于开发环境验证。音视频采集与连接暂未启用。']:
        assert text in texts, f'Expected Artemis UI text absent: {text}'
    screenshot = command('app-screenshot', ['exec-out', 'screencap', '-p'], binary=True)
    assert screenshot.startswith(b'\x89PNG\r\n\x1a\n'), 'Invalid device screenshot'
    (out / 'artemis-validation.png').write_bytes(screenshot)
    result['cases'].append({'id': 'TC-D1', 'status': 'pass',
        'detail': 'App and test APK installed; expected Compose UI observed; actual JNI initialization and native factory creation/disposal passed (1 instrumentation test).',
        'evidence': (['installed-hash-app.log', 'installed-hash-test.log'] if a.skip_install else ['install-app.log', 'install-test.log']) + ['launch-activity.log', 'artemis-ui.xml', 'artemis-validation.png', 'jni-instrumentation.log']})
    result['cases'].append({'id': 'TC-D2', 'status': 'pass' if result['device']['api'] == '29' else 'not-run',
        'reason': 'Actual API29 install/start completed' if result['device']['api'] == '29' else 'Connected phone is API' + result['device']['api'] + ', not Android 10/API29'})
    result['cases'].append({'id': 'TC-D3', 'status': 'pass' if result['device']['pageSize'] == '16384' else 'not-run',
        'reason': 'Actual 16384-byte-page device JNI test passed' if result['device']['pageSize'] == '16384' else 'Connected phone page size is ' + result['device']['pageSize'] + ', not 16384'})
    result['status'] = 'pass'
except Exception as error:
    result['status'] = 'fail'
    result['error'] = redact(f'{type(error).__name__}: {error}')
finally:
    result['finishedAt'] = now()
    result['commands'] = records
    (out / 'runtime-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k != 'commands'}, ensure_ascii=False))
raise SystemExit(0 if result['status'] == 'pass' else 1)
