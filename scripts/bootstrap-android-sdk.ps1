[CmdletBinding()]
param(
    [string]$SdkRoot = $(if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User') }),
    [switch]$DownloadOnly
)
$ErrorActionPreference = 'Stop'
# SDK/toolchain plan section 3.3: install only inside the selected root; never accept licenses.
if ([string]::IsNullOrWhiteSpace($SdkRoot)) {
    throw 'Choose an SDK directory with -SdkRoot or ANDROID_HOME before downloading. No default installation directory is selected.'
}
$SdkRoot = [IO.Path]::GetFullPath($SdkRoot)
$downloadRoot = Join-Path $SdkRoot '.downloads'
$toolsRoot = Join-Path $SdkRoot 'cmdline-tools/19.0'
$sdkManager = Join-Path $toolsRoot 'bin/sdkmanager.bat'
$archive = Join-Path $downloadRoot 'commandlinetools-win-13114758_latest.zip'
$expectedSha1 = '54a582f3bf73e04253602f2d1c80bd5868aac115'

function Assert-InSdkRoot([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $full.StartsWith($SdkRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing a file operation outside SdkRoot.'
    }
}

try {
    New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
    if (-not (Test-Path -LiteralPath $sdkManager)) {
        if (-not (Test-Path -LiteralPath $archive)) {
            $url = 'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip'
            $part = $archive + '.partial'
            $client = New-Object Net.WebClient
            try { $client.DownloadFile($url, $part) } finally { $client.Dispose() }
            Assert-InSdkRoot $part
            Assert-InSdkRoot $archive
            Move-Item -LiteralPath $part -Destination $archive
        }
        $hashAlgorithm = [Security.Cryptography.SHA1]::Create()
        $stream = [IO.File]::OpenRead($archive)
        try { $actualSha1 = ([BitConverter]::ToString($hashAlgorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() } finally { $stream.Dispose(); $hashAlgorithm.Dispose() }
        if ($actualSha1 -ne $expectedSha1) { throw 'Android CLI archive SHA1 mismatch; do not execute it.' }
        $extractRoot = Join-Path $downloadRoot ('cli-' + [Guid]::NewGuid().ToString('N'))
        Assert-InSdkRoot $extractRoot
        [Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem') | Out-Null
        [IO.Compression.ZipFile]::ExtractToDirectory($archive, $extractRoot)
        $sourceTools = Join-Path $extractRoot 'cmdline-tools'
        Assert-InSdkRoot $sourceTools
        Assert-InSdkRoot $toolsRoot
        if (Test-Path -LiteralPath $toolsRoot) { throw 'Existing CLI tools directory is incomplete; inspect it manually.' }
        New-Item -ItemType Directory -Path (Split-Path $toolsRoot) -Force | Out-Null
        Move-Item -LiteralPath $sourceTools -Destination $toolsRoot
        [ordered]@{
            url = $url; algorithm = 'SHA1'; hash = $actualSha1
            downloadedAt = [DateTimeOffset]::UtcNow.ToString('o')
        } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $downloadRoot 'cli-download.json') -Encoding utf8
    }
    if ($DownloadOnly) {
        Write-Output 'Android CLI tools are ready. No package licenses were accepted.'
        exit 0
    }
    $license = Join-Path $SdkRoot 'licenses/android-sdk-license'
    if (-not (Test-Path -LiteralPath $license)) {
        Write-Error 'Android SDK licenses are not accepted. Review the official agreement and run sdkmanager --licenses explicitly; this script does not accept it for you.' -ErrorAction Continue
        exit 2
    }
    & $sdkManager "--sdk_root=$SdkRoot" 'platforms;android-36' 'build-tools;36.0.0' 'platform-tools'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $sdkManager "--sdk_root=$SdkRoot" --list_installed
    exit $LASTEXITCODE
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
