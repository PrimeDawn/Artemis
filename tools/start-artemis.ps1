# 一键启动：解码进程 + 接收服务 + 打开控制页；关闭窗口或按 Ctrl+C 时全部停止。
# 供开发机试用；用户安装包里的入口是 Artemis.exe（进程管家）。
#
# 运行时依赖只有随包 Node：优先用安装目录的 runtime\node.exe，没有时回退 PATH 中的 node。
# 证书由进程内签发（writer/plan.html §3.2），不再需要 openssl。
#
# 所有机器相关的输入都可覆盖，默认值不指向某台开发机：
#   -DataDir       数据目录（身份、信任、日志），默认 %LOCALAPPDATA%\Artemis\data
#   -NodePath      指定 node.exe；省略时按 runtime\node.exe → PATH 顺序探测
#   -LanIp         指定局域网 IPv4；省略时按默认路由自动选取
#   -NoBrowser     不自动打开控制页（自动化/无桌面环境用）
#   -NonInteractive 出错时直接退出，不等待按键

[CmdletBinding()]
param(
    [string]$DataDir,
    [string]$NodePath,
    [string]$LanIp,
    [int]$MediaPort = 3450,
    [int]$ControlPort = 3000,
    [int]$TlsPort = 3443,
    [switch]$NoBrowser,
    [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$decodeHost = Join-Path $root 'native\out\artemis-decode-host.exe'
$receiverDist = Join-Path $root 'receiver\dist\src\pairing-cli.js'
if (-not $DataDir) { $DataDir = Join-Path $env:LOCALAPPDATA 'Artemis\data' }

function Fail($message) {
    Write-Host ""
    Write-Host "无法启动：$message" -ForegroundColor Red
    if (-not $NonInteractive) {
        Write-Host "按任意键关闭..." -ForegroundColor DarkGray
        $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    }
    exit 1
}

# 安装布局把 Node 放在程序目录下；开发布局用 PATH 里的 node。
function Resolve-Node($explicit) {
    if ($explicit) {
        if (-not (Test-Path $explicit)) { Fail "指定的 Node 不存在：$explicit" }
        return $explicit
    }
    $bundled = Join-Path $root 'runtime\node.exe'
    if (Test-Path $bundled) { return $bundled }
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    Fail '找不到 node.exe（安装包应自带 runtime\node.exe，开发机可用 -NodePath 指定）'
}

foreach ($path in @($decodeHost, $receiverDist)) {
    if (-not (Test-Path $path)) { Fail "缺少 $path，请先构建：native/build.ps1 与 receiver 的 npm run build" }
}
$node = Resolve-Node $NodePath

# 取本机局域网 IPv4（接收服务要广播这个地址给手机）
# 取默认路由所在网卡的 IPv4，避免选中 WSL/Docker/Hyper-V 虚拟网卡
if (-not $LanIp) {
    $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
        Sort-Object RouteMetric | Select-Object -First 1
    if ($route) {
        $LanIp = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue |
            Select-Object -First 1 -ExpandProperty IPAddress
    }
}
if (-not $LanIp) { Fail '找不到局域网 IPv4 地址，请确认已连接 Wi-Fi 或有线网络，或用 -LanIp 指定' }

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$env:ARTEMIS_LAN_HOST = $LanIp
$env:ARTEMIS_DATA_DIR = $DataDir
$env:ARTEMIS_MEDIA_PORT = "$MediaPort"
$env:ARTEMIS_CONTROL_PORT = "$ControlPort"
$env:ARTEMIS_TLS_PORT = "$TlsPort"
$audioStatusPath = Join-Path $DataDir 'audio-status.json'
$env:ARTEMIS_AUDIO_STATUS_PATH = $audioStatusPath

Write-Host "Artemis 启动中" -ForegroundColor Cyan
Write-Host "  数据目录：$DataDir" -ForegroundColor DarkGray
Write-Host "  Node：$node" -ForegroundColor DarkGray
Write-Host "  局域网地址：$LanIp" -ForegroundColor DarkGray
Write-Host "  控制页：http://127.0.0.1:$ControlPort/control" -ForegroundColor DarkGray
$logDir = Join-Path $DataDir 'logs'
Write-Host "  日志目录：$logDir" -ForegroundColor DarkGray

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$decodeLog = Join-Path $logDir 'decode-host.log'
$receiverLog = Join-Path $logDir 'receiver.log'
$children = @()

try {
    $decodeProc = Start-Process -FilePath $decodeHost -ArgumentList @('--port', "$MediaPort", '--audio-status', $audioStatusPath) `
        -WorkingDirectory (Split-Path $decodeHost) -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $decodeLog -RedirectStandardError "$decodeLog.err"
    $children += $decodeProc
    Write-Host "  [1/2] 解码进程已启动" -ForegroundColor Green

    $receiverProc = Start-Process -FilePath $node -ArgumentList @($receiverDist) -WorkingDirectory $root `
        -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $receiverLog -RedirectStandardError "$receiverLog.err"
    $children += $receiverProc
    Write-Host "  [2/2] 接收服务已启动" -ForegroundColor Green

    Start-Sleep -Seconds 4
    $controlReady = Test-NetConnection -ComputerName 127.0.0.1 -Port $ControlPort -InformationLevel Quiet -WarningAction SilentlyContinue
    if (-not $controlReady) { Fail "接收服务没有在 $ControlPort 端口监听，详见 $receiverLog" }
    $tlsReady = Test-NetConnection -ComputerName $LanIp -Port $TlsPort -InformationLevel Quiet -WarningAction SilentlyContinue
    if (-not $tlsReady) { Fail "接收服务没有在 $LanIp`:$TlsPort 监听，手机将无法连接" }

    if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$ControlPort/control" }
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
