import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile

CHECKER = Path(__file__).resolve().parents[1] / 'verify-native-libs.py'


def elf(abi, alignment=16384, relro='none'):
    # Program-header fixtures describe memory layouts; no code is executed.
    loads = [(1, 0, 0x4000, alignment)]
    if relro == 'aligned':
        loads += [(1, 0x4000, 0x8000, alignment), (0x6474e552, 0x4000, 0x4000, 1)]
    elif relro == 'unsafe':
        loads += [(1, 0x4000, 0x8000, alignment), (0x6474e552, 0x4000, 0x1000, 1)]
    elif relro == 'isolated':
        loads += [(1, 0x4680, 0x980, alignment), (1, 0x8000, 0x4000, alignment), (0x6474e552, 0x4680, 0x980, 1)]
    elif relro in ('isolated-padded', 'isolated-overlap'):
        # RELRO MemSiz can include padding beyond the actual dedicated LOAD.
        next_start = 0x8000 if relro == 'isolated-padded' else 0x6000
        loads += [(1, 0x4680, 0x800, alignment), (1, next_start, 0x1000, alignment), (0x6474e552, 0x4680, 0x980, 1)]
    ident = b'\x7fELF\x02\x01\x01' + b'\0' * 9
    header = struct.pack('<HHIQQQIHHHHHH', 3, 183 if abi == 'arm64-v8a' else 62, 1, 0, 64, 0, 0, 64, 56, len(loads), 0, 0, 0)
    ph = b''.join(struct.pack('<IIQQQQQQ', kind, 6, address % alignment, address, address, 0, size, align)
                  for kind, address, size, align in loads)
    return ident + header + ph


class NativeChecks(unittest.TestCase):
    def run_case(self, *, alignment=16384, relro='none', corrupt=False, omit=None, no_input=False):
        fixture_root = Path(__file__).resolve().parents[2] / '.cache/native-check-fixtures'
        fixture_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=fixture_root) as temporary:
            base = Path(temporary)
            self.assertTrue(base.resolve().is_relative_to(fixture_root.resolve()))
            archive = base / 'fixture.apk'
            with zipfile.ZipFile(archive, 'w') as z:
                for abi in ['arm64-v8a', 'x86_64']:
                    if abi != omit:
                        z.writestr(f'lib/{abi}/libfixture.so', b'broken' if corrupt else elf(abi, alignment, relro))
            report = base / 'report.json'
            command = [sys.executable, str(CHECKER), '--report', str(report)]
            if not no_input:
                command += ['--apk', str(archive)]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertTrue(report.is_file(), result.stderr)
            return result.returncode, json.loads(report.read_text(encoding='utf-8'))

    def test_16kb_load_passes(self):
        code, report = self.run_case()
        self.assertEqual(code, 0)
        self.assertTrue(report['passed'])
        self.assertEqual(len(report['libraries']), 2)

    def test_4kb_load_fails(self):
        code, report = self.run_case(alignment=4096)
        self.assertEqual(code, 1)
        self.assertFalse(report['passed'])

    def test_shared_relro_end_must_be_16kb_aligned(self):
        self.assertEqual(self.run_case(relro='unsafe')[0], 1)
        self.assertEqual(self.run_case(relro='aligned')[0], 0)

    def test_isolated_relro_load_is_valid_even_with_nonzero_end_modulo(self):
        code, report = self.run_case(relro='isolated')
        self.assertEqual(code, 0)
        self.assertTrue(report['passed'])
        self.assertEqual(len(report['libraries']), 2)
        self.assertTrue(all(lib['relro'][0]['isolatedLoad'] for lib in report['libraries']))

    def test_corrupt_elf_fails(self):
        self.assertEqual(self.run_case(corrupt=True)[0], 1)

    def test_relro_padding_after_a_dedicated_load_is_safe(self):
        code, report = self.run_case(relro='isolated-padded')
        self.assertEqual(code, 0)
        self.assertEqual(len(report['libraries']), 2)
        self.assertTrue(report['passed'])

    def test_relro_padding_must_not_protect_another_writable_load(self):
        self.assertEqual(self.run_case(relro='isolated-overlap')[0], 1)

    def test_missing_64bit_abi_fails(self):
        self.assertEqual(self.run_case(omit='x86_64')[0], 1)

    def test_missing_archive_input_fails(self):
        self.assertEqual(self.run_case(no_input=True)[0], 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
