# 一键构建发布产物：receiver -> native -> APK -> stage -> 安装包 -> 校验和（writer/plan.html §3.5）。
# 产物全部落在 dist\，不进仓库。
param(
    [string]$Version = '0.1.0',
    [switch]$SkipAndroid,
    [switch]$SkipNative,
    [string]$DistDir,
    [string]$NodePath,
    [string]$AndroidHome = 'C:\DEV\ArtemisEnv\Android\Sdk',
    [string]$JdkHome = 'C:\Program Files\Java\jdk-21.0.12',
    [string]$InnoSetup = 'C:\DEV\ArtemisEnv\artemis-tools\inno-setup\ISCC.exe'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $DistDir) { $DistDir = Join-Path $root 'dist' }
$stage = Join-Path $DistDir 'stage'

function Step($message) { Write-Host ""; Write-Host "== $message ==" -ForegroundColor Cyan }

function Assert-Path($path, $what) {
    if (-not (Test-Path $path)) { throw "缺少$what：$path" }
}

if (Test-Path $DistDir) { Remove-Item $DistDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

# 1. 接收服务
Step 'receiver: npm ci + build'
Push-Location (Join-Path $root 'receiver')
try {
    npm ci --ignore-scripts --no-audit --no-fund | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    npm run build | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'receiver build failed' }
} finally { Pop-Location }

# 2. 原生件（过滤器、解码进程、托盘）
if (-not $SkipNative) {
    Step 'native: build.ps1'
    & (Join-Path $root 'native\build.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'native build failed' }
}

# 3. APK
$apkSource = Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk'
if (-not $SkipAndroid) {
    Step 'android: assembleRelease'
    $env:ANDROID_HOME = $AndroidHome
    $env:ANDROID_SDK_ROOT = $AndroidHome
    $env:JAVA_HOME = $JdkHome
    Push-Location $root
    try {
        & (Join-Path $root 'android\gradlew.bat') -p android --no-daemon -PartemisMirror=true :app:assembleRelease
        if ($LASTEXITCODE -ne 0) { throw 'gradle assembleRelease failed（检查 android\signing.properties 是否存在）' }
    } finally { Pop-Location }
}
Assert-Path $apkSource '已签名的 release APK'

# 4. 组装 stage
Step 'stage: 组装安装目录'
$node = if ($NodePath) { $NodePath } else { (Get-Command node -ErrorAction Stop).Source }
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'runtime') | Out-Null
Copy-Item $node (Join-Path $stage 'runtime\node.exe')
Copy-Item (Join-Path $root 'native\out\Artemis.exe') $stage

$receiverStage = Join-Path $stage 'app\receiver'
New-Item -ItemType Directory -Force -Path $receiverStage | Out-Null
Copy-Item (Join-Path $root 'receiver\dist') (Join-Path $receiverStage 'dist') -Recurse
Copy-Item (Join-Path $root 'receiver\package.json') $receiverStage
Copy-Item (Join-Path $root 'receiver\package-lock.json') $receiverStage
# 只装生产依赖：安装包不该带 typescript、@types 这类构建期包。
Push-Location $receiverStage
try {
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'staging npm ci failed' }
} finally { Pop-Location }

$nativeStage = Join-Path $stage 'app\native'
New-Item -ItemType Directory -Force -Path $nativeStage | Out-Null
foreach ($name in @('artemis-decode-host.exe', 'ArtemisCamera.dll', 'avcodec-63.dll', 'avformat-63.dll', 'avutil-61.dll', 'swscale-10.dll', 'swresample-7.dll')) {
    $source = Join-Path $root "native\out\$name"
    Assert-Path $source '原生依赖'
    Copy-Item $source $nativeStage
}

$licenseStage = Join-Path $stage 'licenses'
New-Item -ItemType Directory -Force -Path $licenseStage | Out-Null
Copy-Item (Join-Path $root 'LICENSE') $stage
Copy-Item (Join-Path $root 'licenses\THIRD-PARTY.md') $licenseStage
# FFmpeg 是 GPL 的 shared 构建：分发时必须随包给出许可证原文与源码获取方式。
$ffmpegLicense = Join-Path $root 'licenses\FFmpeg-GPL.txt'
if (-not (Test-Path $ffmpegLicense)) {
    $ffmpegRoot = 'C:\DEV\ArtemisEnv\ffmpeg\ffmpeg-master-latest-win64-gpl-shared'
    $candidate = Join-Path $ffmpegRoot 'LICENSE.txt'
    if (-not (Test-Path $candidate)) { throw "缺少 FFmpeg 许可证原文：$candidate" }
    Copy-Item $candidate $ffmpegLicense
}
Copy-Item $ffmpegLicense $licenseStage
if (Test-Path (Join-Path $root 'README.md')) { Copy-Item (Join-Path $root 'README.md') $stage }
# README 里链接到 docs\user，安装目录里必须同时存在这些文件。
$userDocs = Join-Path $root 'docs\user'
if (Test-Path $userDocs) { Copy-Item $userDocs (Join-Path $stage 'docs\user') -Recurse }

# 5. 安装包
Step 'installer: ISCC'
Assert-Path $InnoSetup 'Inno Setup 编译器；用 -InnoSetup 指定 ISCC.exe 路径'
& $InnoSetup "/DMyAppVersion=$Version" (Join-Path $root 'installer\artemis.iss')
if ($LASTEXITCODE -ne 0) { throw 'ISCC failed' }

# 6. 产物与校验和
Step 'artifacts: 复制 APK 并写校验和'
$apkTarget = Join-Path $DistDir "Artemis-$Version.apk"
Copy-Item $apkSource $apkTarget
$setup = Join-Path $DistDir "Artemis-Setup-$Version.exe"
Assert-Path $setup '安装包产物'

$lines = @()
foreach ($file in @($setup, $apkTarget)) {
    $hash = (Get-FileHash $file -Algorithm SHA256).Hash.ToLowerInvariant()
    $lines += "$hash  $(Split-Path -Leaf $file)"
}
$lines | Set-Content (Join-Path $DistDir 'SHA256SUMS.txt') -Encoding ASCII

Write-Host ""
Write-Host "构建完成：" -ForegroundColor Green
foreach ($file in @($setup, $apkTarget)) {
    Write-Host ("  {0}  {1:N1} MB" -f (Split-Path -Leaf $file), ((Get-Item $file).Length / 1MB))
}
Write-Host ("  SHA256SUMS.txt")
exit 0
