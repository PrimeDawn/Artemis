# 一键启动：解码进程 + 接收服务 + 打开控制页；关闭窗口或按 Ctrl+C 时全部停止。
# 供本机试用，不是最终产品形态（最终形态是托盘常驻程序，留给打包阶段）。

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$decodeHost = Join-Path $root 'native\out\artemis-decode-host.exe'
$receiverDist = Join-Path $root 'receiver\dist\src\pairing-cli.js'
$dataDir = 'C:\DEV\ArtemisEnv\receiver-data-run1'
$openssl = 'C:\Program Files\Git\usr\bin\openssl.exe'
$mediaPort = 3450
$controlPort = 3000
$tlsPort = 3443

function Fail($message) {
    Write-Host ""
    Write-Host "无法启动：$message" -ForegroundColor Red
    Write-Host "按任意键关闭..." -ForegroundColor DarkGray
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit 1
}

foreach ($path in @($decodeHost, $receiverDist, $openssl)) {
    if (-not (Test-Path $path)) { Fail "缺少 $path" }
}

# 取本机局域网 IPv4（接收服务要广播这个地址给手机）
# 取默认路由所在网卡的 IPv4，避免选中 WSL/Docker/Hyper-V 虚拟网卡
$route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
    Sort-Object RouteMetric | Select-Object -First 1
$lanIp = $null
if ($route) {
    $lanIp = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty IPAddress
}
if (-not $lanIp) { Fail '找不到局域网 IPv4 地址，请确认已连接 Wi-Fi 或有线网络' }

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$env:ARTEMIS_LAN_HOST = $lanIp
$env:ARTEMIS_DATA_DIR = $dataDir
$env:ARTEMIS_OPENSSL_PATH = $openssl
$env:ARTEMIS_CONTROL_PORT = "$controlPort"
$env:ARTEMIS_TLS_PORT = "$tlsPort"

Write-Host "Artemis 启动中" -ForegroundColor Cyan
Write-Host "  局域网地址：$lanIp" -ForegroundColor DarkGray
Write-Host "  控制页：http://127.0.0.1:$controlPort/control" -ForegroundColor DarkGray
$logDir = Join-Path $dataDir 'logs'
Write-Host "  日志目录：$logDir" -ForegroundColor DarkGray

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$decodeLog = Join-Path $logDir 'decode-host.log'
$receiverLog = Join-Path $logDir 'receiver.log'
$children = @()

try {
    $decodeProc = Start-Process -FilePath $decodeHost -ArgumentList @('--port', "$mediaPort") `
        -WorkingDirectory (Split-Path $decodeHost) -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $decodeLog -RedirectStandardError "$decodeLog.err"
    $children += $decodeProc
    Write-Host "  [1/2] 解码进程已启动" -ForegroundColor Green

    $receiverProc = Start-Process -FilePath 'node' -ArgumentList @($receiverDist) -WorkingDirectory $root `
        -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $receiverLog -RedirectStandardError "$receiverLog.err"
    $children += $receiverProc
    Write-Host "  [2/2] 接收服务已启动" -ForegroundColor Green

    Start-Sleep -Seconds 4
    $controlReady = Test-NetConnection -ComputerName 127.0.0.1 -Port $controlPort -InformationLevel Quiet -WarningAction SilentlyContinue
    if (-not $controlReady) { Fail "接收服务没有在 $controlPort 端口监听" }
    $tlsReady = Test-NetConnection -ComputerName $lanIp -Port $tlsPort -InformationLevel Quiet -WarningAction SilentlyContinue
    if (-not $tlsReady) { Fail "接收服务没有在 $lanIp`:$tlsPort 监听，手机将无法连接" }

    Start-Process "http://127.0.0.1:$controlPort/control"
    Write-Host ""
    Write-Host "已全部就绪。" -ForegroundColor Green
    Write-Host "下一步：在控制页里选中手机，手机上点『允许并记住』；OBS 里选 Artemis Camera。" -ForegroundColor Yellow
    Write-Host "关闭本窗口或按 Ctrl+C 停止全部服务。" -ForegroundColor DarkGray

    while ($true) {
        Start-Sleep -Seconds 2
        foreach ($child in $children) {
            if ($child.HasExited) { throw "子进程意外退出：$($child.ProcessName)" }
        }
    }
}
catch {
    Write-Host ""
    Write-Host "$($_.Exception.Message)" -ForegroundColor Red
}
finally {
    foreach ($child in $children) {
        if ($child -and -not $child.HasExited) {
            try { $child.Kill() } catch { }
        }
    }
    Write-Host "服务已停止。" -ForegroundColor DarkGray
}
