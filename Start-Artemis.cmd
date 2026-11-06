@echo off
rem 双击本文件即可启动 Artemis：解码进程 + 接收服务 + 打开控制页。
rem 关闭本窗口会停止全部服务。
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-artemis.ps1"
if errorlevel 1 pause
endlocal
