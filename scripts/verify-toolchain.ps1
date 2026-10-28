[CmdletBinding()]
param(
    [string]$SdkRoot = $(if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User') }),
    [Parameter(Mandatory = $true)][string]$ReportPath
)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($SdkRoot)) { throw 'Choose the installed SDK with -SdkRoot or ANDROID_HOME.' }
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
# SDK/toolchain plan section 3.3: inspect actual tools without changing global settings.
$checks = @()
$jdkVersion = $null
$nodeVersion = $null
$packages = @()
try {
    $java = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { (Get-Command java -ErrorAction Stop).Source }
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = $java
    $psi.Arguments = '-version'
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardError = $true
    $psi.RedirectStandardOutput = $true
    $javaProcess = [Diagnostics.Process]::Start($psi)
    $javaText = $javaProcess.StandardError.ReadToEnd() + $javaProcess.StandardOutput.ReadToEnd()
    $javaProcess.WaitForExit()
    if ($javaProcess.ExitCode -eq 0 -and $javaText -match 'version "([^"]+)"') { $jdkVersion = $Matches[1] }
} catch { }
$checks += [ordered]@{ id = 'jdk17'; status = $(if ($jdkVersion -like '17.*') { 'pass' } else { 'fail' }); reason = 'JDK 17 is required.' }
try { $nodeVersion = (& node --version).Trim() } catch { }
$checks += [ordered]@{ id = 'node24'; status = $(if ($nodeVersion -like 'v24.*') { 'pass' } else { 'fail' }); reason = 'Node 24 is required.' }
foreach ($item in @(
    @{ id = 'platform-api36'; path = 'platforms/android-36/android.jar' },
    @{ id = 'build-tools36'; path = 'build-tools/36.0.0/zipalign.exe' },
    @{ id = 'platform-tools'; path = 'platform-tools/adb.exe' },
    @{ id = 'cli-tools19'; path = 'cmdline-tools/19.0/bin/sdkmanager.bat' }
)) {
    $exists = Test-Path -LiteralPath (Join-Path $SdkRoot $item.path)
    $checks += [ordered]@{ id = $item.id; status = $(if ($exists) { 'pass' } else { 'fail' }); reason = $item.path }
}
foreach ($file in @('platforms/android-36/source.properties', 'build-tools/36.0.0/source.properties', 'platform-tools/source.properties', 'cmdline-tools/19.0/source.properties')) {
    $path = Join-Path $SdkRoot $file
    if (Test-Path -LiteralPath $path) {
        $revision = (Get-Content -LiteralPath $path | Where-Object { $_ -match '^Pkg.Revision\s*=' }) -join ';'
        $packages += "$file : $revision"
    }
}
$sourceFiles = @()
foreach ($sourceFile in (& git -c core.quotePath=false ls-files --cached --others --exclude-standard | Sort-Object -Unique)) {
    if ($sourceFile -match '(^|/)artifacts/' -or -not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) { continue }
    $algorithm = [Security.Cryptography.SHA256]::Create()
    $inputFile = [IO.File]::OpenRead([IO.Path]::GetFullPath($sourceFile))
    try { $hash = ([BitConverter]::ToString($algorithm.ComputeHash($inputFile))).Replace('-', '').ToLowerInvariant() } finally { $inputFile.Dispose(); $algorithm.Dispose() }
    $sourceFiles += [ordered]@{ path = $sourceFile; sha256 = $hash }
}
$sourceSnapshot = ConvertTo-Json -InputObject @($sourceFiles) -Depth 4 -Compress
$dirty = [bool](& git status --porcelain)
$diffHash = $null
if ($dirty) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $diffHash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($sourceSnapshot)))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
}
$now = [DateTimeOffset]::UtcNow.ToString('o')
$report = [ordered]@{
    schemaVersion = 1; runId = [DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss'); verifiedAt = $now
    sourceSha = (& git rev-parse HEAD).Trim(); dirty = $dirty; workingTreeDiffSha256 = $diffHash
    commands = @(); checks = @($checks)
    environment = [ordered]@{ jdkVersion = $jdkVersion; nodeVersion = $nodeVersion; sdkPackages = @($packages); deviceChecked = $false; deviceSummary = $null }
    artifacts = @()
}
$fullReport = [IO.Path]::GetFullPath($ReportPath)
New-Item -ItemType Directory -Path (Split-Path $fullReport) -Force | Out-Null
$snapshotPath = Join-Path (Split-Path $fullReport) 'source-snapshot.json'
[IO.File]::WriteAllText($snapshotPath, $sourceSnapshot, (New-Object Text.UTF8Encoding($false)))
$report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $fullReport -Encoding utf8
$checks | ForEach-Object { Write-Output ($_.id + ': ' + $_.status) }
if (@($checks | Where-Object { $_.status -ne 'pass' }).Count -gt 0) { exit 1 }
exit 0
