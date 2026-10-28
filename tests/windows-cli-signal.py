"""Exercise the real Windows console CTRL+C path in a hidden test console.

No TerminateProcess result is accepted as graceful shutdown. A separate sender
attaches only to the console of the child that this test created.
"""
import ctypes
import json
import os
from pathlib import Path
import queue
import socket
import subprocess
import sys
import threading
import time


def send_control(pid):
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.FreeConsole()
    if not kernel.AttachConsole(int(pid)):
        return 10
    try:
        if not kernel.SetConsoleCtrlHandler(None, True):
            return 11
        if not kernel.GenerateConsoleCtrlEvent(0, 0):
            return 12
        time.sleep(0.2)
        return 0
    finally:
        kernel.FreeConsole()


def main():
    if os.name != 'nt':
        print(json.dumps({'status': 'not-run', 'reason': 'Windows-only console transport'}))
        return 0
    if len(sys.argv) >= 3 and sys.argv[1] == '--send':
        return send_control(sys.argv[2])
    if len(sys.argv) != 3:
        raise ValueError('Expected node executable and CLI file')
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = subprocess.SW_HIDE
    child = subprocess.Popen([sys.argv[1], sys.argv[2]], env={**os.environ, 'PORT': '0'},
                             stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             text=True, encoding='utf-8', creationflags=subprocess.CREATE_NEW_CONSOLE,
                             startupinfo=startup)
    events = queue.Queue()
    output = []
    errors = []
    def read_stdout():
        for line in child.stdout:
            output.append(line.rstrip())
            try: events.put(json.loads(line))
            except json.JSONDecodeError: pass
    def read_stderr():
        for line in child.stderr: errors.append(line.rstrip())
    thread = threading.Thread(target=read_stdout, daemon=True)
    thread.start()
    threading.Thread(target=read_stderr, daemon=True).start()
    result = {'status': 'fail', 'transport': 'GenerateConsoleCtrlEvent(CTRL_C_EVENT, 0)',
              'stdout': output, 'stderr': errors, 'forcedCleanup': False}
    try:
        deadline = time.monotonic() + 8
        started = None
        while time.monotonic() < deadline:
            try: event = events.get(timeout=0.1)
            except queue.Empty: continue
            if event.get('event') == 'receiver_started':
                started = event
                break
        if not started:
            raise RuntimeError('CLI did not start in its hidden console')
        result['started'] = started
        sender = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--send', str(child.pid)],
                                capture_output=True, timeout=5)
        result['signalSenderExitCode'] = sender.returncode
        if sender.returncode != 0:
            result.update({'status':'not-run', 'reason':'Windows console event could not be delivered'})
            return 0
        child.wait(timeout=8)
        thread.join(timeout=1)
        result['childExitCode'] = child.returncode
        result['stoppedEvent'] = any('"receiver_stopped"' in line for line in output)
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', started['port']))
        result['portRebindPassed'] = True
        result['status'] = 'pass' if child.returncode == 0 and result['stoppedEvent'] else 'fail'
        return 0 if result['status'] == 'pass' else 1
    except Exception as error:
        result['error'] = f'{type(error).__name__}: {error}'
        return 1
    finally:
        if child.poll() is None:
            result['forcedCleanup'] = True
            child.kill()
            child.wait(timeout=5)
        thread.join(timeout=1)
        print(json.dumps(result))


if __name__ == '__main__':
    raise SystemExit(main())
