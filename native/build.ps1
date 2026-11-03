# 编译 Artemis Camera 过滤器与合成帧 producer。
# 依据 writer/plan.html §4：不引入 CMake，直接调用 cl.exe。
param(
    [string]$VsRoot = 'C:\DEV\ArtemisEnv\VS2022BuildTools',
    [string]$FfmpegRoot = 'C:\DEV\ArtemisEnv\ffmpeg\ffmpeg-master-latest-win64-gpl-shared'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $root 'out'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$vcvars = Get-ChildItem (Join-Path $VsRoot 'VC\Auxiliary\Build\vcvars64.bat') -ErrorAction SilentlyContinue
if (-not $vcvars) {
    Write-Error "vcvars64.bat not found under $VsRoot; VS Build Tools is not installed"
    exit 2
}

$filterSources = @(
    (Join-Path $root 'artemis-camera\ArtemisCamera.cpp'),
    (Join-Path $root 'artemis-camera\Filter.cpp'),
    (Join-Path $root 'artemis-camera\Pin.cpp'),
    (Join-Path $root 'artemis-camera\FrameSource.cpp')
)
$producerSources = @((Join-Path $root 'synthetic-producer\main.cpp'))
$decodeSources = @(
    (Join-Path $root 'decode-host\main.cpp'),
    (Join-Path $root 'decode-host\Decoder.cpp'),
    (Join-Path $root 'decode-host\SharedWriter.cpp'),
    (Join-Path $root 'decode-host\AudioDecoder.cpp'),
    (Join-Path $root 'decode-host\AudioEndpoint.cpp'),
    (Join-Path $root 'decode-host\WasapiSink.cpp')
)
$audioTestSources = @(
    (Join-Path $root 'decode-host\test-audio.cpp'),
    (Join-Path $root 'decode-host\AudioDecoder.cpp'),
    (Join-Path $root 'decode-host\AudioEndpoint.cpp')
)

$common = '/nologo /EHsc /std:c++17 /O2 /W3 /utf-8 /DUNICODE /D_UNICODE /DNOMINMAX /DWIN32_LEAN_AND_MEAN'

$dll = "cl $common /LD `"$($filterSources -join '" "')`" /Fe:`"$out\ArtemisCamera.dll`" " +
       "/link /EXPORT:DllGetClassObject /EXPORT:DllCanUnloadNow /EXPORT:DllRegisterServer /EXPORT:DllUnregisterServer " +
       "ole32.lib oleaut32.lib uuid.lib strmiids.lib advapi32.lib user32.lib"
$exe = "cl $common `"$($producerSources -join '" "')`" /Fe:`"$out\synthetic-producer.exe`" /link kernel32.lib"
$decode = "cl $common /I`"$FfmpegRoot\include`" `"$($decodeSources -join '" "')`" /Fe:`"$out\artemis-decode-host.exe`" /link /LIBPATH:`"$FfmpegRoot\lib`" avcodec.lib avutil.lib swscale.lib swresample.lib ws2_32.lib ole32.lib oleaut32.lib uuid.lib"
$audioTest = "cl $common /I`"$FfmpegRoot\include`" `"$($audioTestSources -join '" "')`" /Fe:`"$out\test-audio.exe`" /link /LIBPATH:`"$FfmpegRoot\lib`" avcodec.lib avutil.lib swresample.lib avformat.lib"

$script = "call `"$($vcvars.FullName)`" >nul && $dll && $exe && $decode && $audioTest"
Write-Host "Building Artemis Camera..."
$output = cmd /c $script 2>&1
$code = $LASTEXITCODE
$output | ForEach-Object { Write-Host $_ }

if ($code -ne 0) {
    Write-Host "BUILD FAILED (exit $code)" -ForegroundColor Red
    exit $code
}

$dllPath = Join-Path $out 'ArtemisCamera.dll'
$exePath = Join-Path $out 'synthetic-producer.exe'
$decodePath = Join-Path $out 'artemis-decode-host.exe'
if (-not (Test-Path $dllPath) -or -not (Test-Path $exePath) -or -not (Test-Path $decodePath)) {
    Write-Host "BUILD FAILED: expected artifacts missing" -ForegroundColor Red
    exit 3
}

Write-Host "BUILD OK: $dllPath"
Write-Host "BUILD OK: $exePath"
Write-Host "BUILD OK: $decodePath"
foreach ($dll in @('avcodec-63.dll','avutil-61.dll','swscale-10.dll','swresample-7.dll','avformat-63.dll')) {
    $source = Join-Path $FfmpegRoot "bin\$dll"
    if (Test-Path $source) { Copy-Item $source (Join-Path $out $dll) -Force }
}
exit 0
