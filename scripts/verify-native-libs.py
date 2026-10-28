#!/usr/bin/env python3
"""Read AAR/APK ELF headers without extracting or executing native code.

SDK/toolchain writer/plan.html section 3.3. ZIP packaging is checked separately
with Android zipalign; this report never proves device runtime compatibility.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import struct
import sys
import zipfile

PAGE = 16384
AAR_SHA256 = '0a1627b1a48c2bc17d9a40d62fc47bd45166f44a311e95917f147c402de379b0'
ABI = {'armeabi-v7a': (32, 40), 'arm64-v8a': (64, 183), 'x86': (32, 3), 'x86_64': (64, 62)}


def inspect_elf(data, abi):
    if len(data) < 52 or data[:4] != b'\x7fELF' or data[4] not in (1, 2) or data[5] not in (1, 2):
        raise ValueError('Invalid or truncated ELF header')
    bits = 64 if data[4] == 2 else 32
    endian = '<' if data[5] == 1 else '>'
    header = struct.unpack_from(endian + ('HHIQQQIHHHHHH' if bits == 64 else 'HHIIIIIHHHHHH'), data, 16)
    if (bits, header[1]) != ABI[abi]:
        raise ValueError('ELF class or machine does not match ABI ' + abi)
    offset, entry_size, count = header[4], header[8], header[9]
    minimum = 56 if bits == 64 else 32
    if count == 0 or entry_size < minimum or offset + count * entry_size > len(data):
        raise ValueError('Invalid or truncated program-header table')
    segments = []
    for i in range(count):
        row = struct.unpack_from(endian + ('IIQQQQQQ' if bits == 64 else 'IIIIIIII'), data, offset + i * entry_size)
        if bits == 64:
            kind, flags, file_offset, address, _, file_size, memory_size, alignment = row
        else:
            kind, file_offset, address, _, file_size, memory_size, flags, alignment = row
        segments.append({'type': kind, 'flags': flags, 'offset': file_offset, 'virtualAddress': address,
                         'fileSize': file_size, 'memorySize': memory_size, 'alignment': alignment})
    loads = [s for s in segments if s['type'] == 1]
    if not loads:
        raise ValueError('ELF has no PT_LOAD segment')
    load_ok = all(s['alignment'] >= PAGE and s['alignment'] & (s['alignment'] - 1) == 0
                  and s['offset'] % s['alignment'] == s['virtualAddress'] % s['alignment'] for s in loads)
    relro = []
    for segment in (s for s in segments if s['type'] == 0x6474E552):
        start = segment['virtualAddress']
        end = start + segment['memorySize']
        # Android permits a dedicated RELRO LOAD whose rounded protection range
        # cannot overlap writable data in another LOAD (official 16KB guidance).
        matching = [s for s in loads if s['virtualAddress'] == start
                    and s['memorySize'] <= segment['memorySize']]
        protected_start = start // PAGE * PAGE
        protected_end = (end + PAGE - 1) // PAGE * PAGE
        isolated = bool(matching) and not any(
            s not in matching and s['flags'] & 2 and s['memorySize'] > 0
            and s['virtualAddress'] < protected_end
            and s['virtualAddress'] + s['memorySize'] > protected_start for s in loads)
        relro.append({'virtualAddress': start, 'memorySize': segment['memorySize'],
                      'endModulo16kb': end % PAGE, 'isolatedLoad': isolated,
                      'passed': end % PAGE == 0 or isolated})
    return {'bits': bits, 'loadAlignments': [s['alignment'] for s in loads],
            'loadAlignmentPassed': load_ok, 'relro': relro,
            'passed': (load_ok and all(s['passed'] for s in relro)) if bits == 64 else True,
            'scope': '64-bit static 16KB checks' if bits == 64 else '32-bit recorded; 16KB predicate not applied'}


def inspect_archive(path, kind):
    libraries = []
    errors = []
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if kind == 'aar' and digest != AAR_SHA256:
        errors.append('Maven WebRTC AAR SHA256 mismatch')
    prefix = 'jni' if kind == 'aar' else 'lib'
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            parts = name.split('/')
            if len(parts) != 3 or parts[0] != prefix or not name.endswith('.so'):
                continue
            data = archive.read(name)
            item = {'archive': kind, 'path': name, 'abi': parts[1], 'bytes': len(data),
                    'sha256': hashlib.sha256(data).hexdigest()}
            try:
                if parts[1] not in ABI:
                    raise ValueError('Unknown ABI: ' + parts[1])
                item.update(inspect_elf(data, parts[1]))
            except (ValueError, struct.error) as error:
                item.update({'passed': False, 'error': str(error)})
            libraries.append(item)
    present = {lib['abi'] for lib in libraries}
    missing = {'arm64-v8a', 'x86_64'} - present
    if missing:
        errors.append('Missing required 64-bit ABI: ' + ', '.join(sorted(missing)))
    return {'name': path.name, 'kind': kind, 'sha256': digest}, libraries, errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--aar', type=Path)
    parser.add_argument('--apk', type=Path)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    libraries, inputs, errors = [], [], []
    if not args.aar and not args.apk:
        errors.append('Provide --aar or --apk, or both')
    for kind, path in [('aar', args.aar), ('apk', args.apk)]:
        if path is None:
            continue
        try:
            source, found, issues = inspect_archive(path, kind)
            inputs.append(source)
            libraries.extend(found)
            errors.extend(issues)
        except (OSError, ValueError, zipfile.BadZipFile) as error:
            errors.append(f'{kind}: {type(error).__name__}: {error}')
    passed = not errors and bool(libraries) and all(lib['passed'] for lib in libraries)
    report = {'schemaVersion': 1, 'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'passed': passed, 'inputs': inputs, 'libraries': libraries, 'errors': errors,
              'limitations': ['Static ELF and AAR hash checks only; run zipalign on the final APK separately.',
                              'No JNI, Android version, 16KB runtime, media or performance validation.'],
              'source': 'https://developer.android.com/guide/practices/page-sizes#check-elf-alignment'}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'passed': passed, 'libraries': len(libraries), 'errors': errors}))
    return 0 if passed else 1


if __name__ == '__main__':
    sys.exit(main())
