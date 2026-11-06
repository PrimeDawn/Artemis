# 导出发布线：只把产品代码与用户文档复制到目标目录，开发流程资产一律排除（writer/plan.html §3.5、D-001）。
# 只读 dev 工作树、只写目标目录，从不修改仓库。
param(
    [string]$Target = '',
    [switch]$Verify
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $Target) { $Target = Join-Path $root 'dist\release-tree' }
$targetFull = [System.IO.Path]::GetFullPath($Target)
$rootFull = [System.IO.Path]::GetFullPath($root)
if ($targetFull -eq $rootFull -or $rootFull.StartsWith($targetFull + [System.IO.Path]::DirectorySeparatorChar)) {
    throw "目标目录不能是仓库本身或其父目录：$targetFull"
}

# 白名单：相对仓库根。只有列在这里的才会进入发布线。
$include = @(
    'android',
    'receiver',
    'native',
    'protocol',
    'tests',
    'tools',
    'installer',
    'licenses',
    'scripts\build-release.ps1',
    'scripts\export-release.ps1',
    'scripts\bootstrap-android-sdk.ps1',
    'scripts\verify-native-libs.py',
    'scripts\verify-toolchain.ps1',
    'docs\user',
    'README.md',
    'LICENSE'
)

# 黑名单：即使出现在白名单路径下也必须剔除。
$excludeNames = @('.git', '.github', 'node_modules', 'dist', 'build', '.gradle', '.idea', 'out', '.cache', '.tools')
$excludeFiles = @('local.properties', 'signing.properties', '*.jks', '*.keystore', '*.tsbuildinfo', '*.log', '.env', 'config.json')
$excludeRelative = @(
    'native\out',
    'android\app\build',
    'android\.gradle',
    'receiver\dist',
    'receiver\node_modules'
)
# 开发流程资产：任何情况下都不得出现在发布线。
$forbidden = @('spec', '.agents', '.codex', '.awr', 'html-report', 'work-ledger.yaml', 'AGENTS.md', 'GOALS.md', '产品规划.md')

function Test-Excluded([string]$relative, [string]$name) {
    foreach ($pattern in $excludeFiles) {
        if ($name -like $pattern) { return $true }
    }
    foreach ($blocked in $excludeRelative) {
        if ($relative -eq $blocked -or $relative.StartsWith($blocked + '\')) { return $true }
    }
    return $false
}

function Copy-Tree([string]$sourceRelative, [string]$destinationRoot, [string]$rootPath) {
    $source = Join-Path $rootPath $sourceRelative
    if (-not (Test-Path $source)) { Write-Host "skip (missing): $sourceRelative" -ForegroundColor DarkGray; return }
    $item = Get-Item $source
    if ($item.PSIsContainer) {
        $files = Get-ChildItem $source -Recurse -File
        foreach ($file in $files) {
            $relativeToSource = $file.FullName.Substring($rootPath.Length).TrimStart('\')
            $relativeToRepo = ($file.FullName.Substring($rootPath.Length).TrimStart([char]92))
            if (Test-Excluded $relativeToRepo $file.Name) { continue }
            if ($excludeNames -contains $file.Directory.Name) { continue }
            $destination = Join-Path $destinationRoot $relativeToRepo
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
            Copy-Item $file.FullName $destination
        }
    } else {
        $relativeToRepo = $item.FullName.Substring($rootPath.Length).TrimStart([char]92)
        $destination = Join-Path $destinationRoot $relativeToRepo
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
        Copy-Item $item.FullName $destination
    }
}

function Find-Forbidden([string]$rootPath) {
    $hits = @()
    foreach ($name in $forbidden) {
        $path = Join-Path $rootPath $name
        if (Test-Path $path) { $hits += $name }
    }
    foreach ($file in (Get-ChildItem $rootPath -Recurse -File -ErrorAction SilentlyContinue)) {
        foreach ($name in @('signing.properties', 'local.properties')) {
            if ($file.Name -eq $name) { $hits += ($file.FullName.Substring($rootPath.Length).TrimStart([char]92)) }
        }
        if ($file.Extension -in @('.jks', '.keystore', '.log')) {
            $hits += ($file.FullName.Substring($rootPath.Length).TrimStart([char]92))
        }
    }
    return $hits
}

if ($Verify) {
    if (-not (Test-Path $targetFull)) { throw "目标目录不存在：$targetFull" }
    $hits = Find-Forbidden $targetFull
    $missing = @()
    foreach ($must in @('receiver\src', 'native\build.ps1', 'README.md', 'LICENSE')) {
        if (-not (Test-Path (Join-Path $targetFull $must))) { $missing += $must }
    }
    $fileCount = (Get-ChildItem $targetFull -Recurse -File | Measure-Object).Count
    if ($hits.Count -gt 0) {
        Write-Host "VERIFY FAILED: 发布线含禁止内容" -ForegroundColor Red
        $hits | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        exit 1
    }
    if ($missing.Count -gt 0) {
        Write-Host "VERIFY FAILED: 缺少必需内容" -ForegroundColor Red
        $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        exit 1
    }
    Write-Host "VERIFY OK: $fileCount 个文件，无开发资产" -ForegroundColor Green
    exit 0
}

if (Test-Path $targetFull) { Remove-Item $targetFull -Recurse -Force }
New-Item -ItemType Directory -Force -Path $targetFull | Out-Null

foreach ($entry in $include) {
    Copy-Tree $entry $targetFull $root
}

$fileCount = (Get-ChildItem $targetFull -Recurse -File | Measure-Object).Count
$hits = Find-Forbidden $targetFull
if ($hits.Count -gt 0) {
    Write-Host "EXPORT FAILED: 导出结果含禁止内容（不发布）" -ForegroundColor Red
    $hits | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}
Write-Host "EXPORT OK: $fileCount 个文件 -> $targetFull" -ForegroundColor Green
exit 0
