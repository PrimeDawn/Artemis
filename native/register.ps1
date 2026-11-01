# 注册/反注册 Artemis Camera 过滤器。需要管理员权限。
# 依据 writer/plan.html §4：失败必须返回非 0，不静默吞错。
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('register', 'unregister')]
    [string]$Action
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dll = Join-Path $root 'out\ArtemisCamera.dll'
$clsid = '{7E1F3A10-2C4B-4D8E-9A55-3F0C1B7D9E21}'
$category = '{860BB310-5D01-11D0-BD3B-00A0C911CE86}'

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 逐用户注册（HKCU\Software\Classes）不需要管理员；若某天改回 HKLM，这里要重新加权限检查。
if (-not (Test-Admin)) {
    Write-Host "NOTE: running unelevated; registering per-user under HKCU\Software\Classes" -ForegroundColor Yellow
}

if ($Action -eq 'register') {
    if (-not (Test-Path $dll)) {
        Write-Host "MISSING: $dll (run build.ps1 first)" -ForegroundColor Red
        exit 3
    }
    $process = Start-Process -FilePath 'regsvr32.exe' -ArgumentList @('/s', "`"$dll`"") -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        Write-Host "REGSVR32 FAILED: exit $($process.ExitCode)" -ForegroundColor Red
        exit 5
    }
    $key = "Registry::HKEY_CURRENT_USER\Software\Classes\CLSID\$clsid\InprocServer32"
    $instance = "Registry::HKEY_CURRENT_USER\Software\Classes\CLSID\$category\Instance\$clsid"
    if (-not (Test-Path $key) -or -not (Test-Path $instance)) {
        Write-Host "REGISTRY VERIFY FAILED: expected keys missing" -ForegroundColor Red
        exit 6
    }
    $friendly = (Get-ItemProperty -Path $instance).FriendlyName
    if ($friendly -ne 'Artemis Camera') {
        Write-Host "REGISTRY VERIFY FAILED: FriendlyName is '$friendly'" -ForegroundColor Red
        exit 7
    }
    Write-Host "REGISTER OK: Artemis Camera"
    exit 0
}

$process = Start-Process -FilePath 'regsvr32.exe' -ArgumentList @('/s', '/u', "`"$dll`"") -Wait -PassThru
if ($process.ExitCode -ne 0) {
    Write-Host "REGSVR32 UNREGISTER FAILED: exit $($process.ExitCode)" -ForegroundColor Red
    exit 5
}
$key = "Registry::HKEY_CURRENT_USER\Software\Classes\CLSID\$clsid"
if (Test-Path $key) {
    Write-Host "UNREGISTER VERIFY FAILED: $clsid still present" -ForegroundColor Red
    exit 8
}
Write-Host "UNREGISTER OK"
exit 0
