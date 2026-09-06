[CmdletBinding()]
param(
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot 'manifest.json'
$packagePath = Join-Path $projectRoot 'package.json'
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$package = Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json

if ($manifest.manifest_version -ne 3) {
    throw 'Chrome Web Store packages must use Manifest V3.'
}
if ($manifest.version -ne $package.version) {
    throw "Version mismatch: manifest=$($manifest.version), package=$($package.version)"
}

$runtimeFiles = @('manifest.json', 'LICENSE')
foreach ($contentScript in $manifest.content_scripts) {
    $runtimeFiles += @($contentScript.js)
    $runtimeFiles += @($contentScript.css)
}
if ($manifest.icons) {
    $runtimeFiles += @($manifest.icons.PSObject.Properties.Value)
}
if ($manifest.action.default_icon) {
    $runtimeFiles += @($manifest.action.default_icon.PSObject.Properties.Value)
}
$runtimeFiles = @($runtimeFiles | Sort-Object -Unique)

foreach ($relativePath in $runtimeFiles) {
    $sourcePath = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "Required package file is missing: $relativePath"
    }
}

if (-not $SkipTests) {
    $nodeCommand = Get-Command node -ErrorAction Stop
    foreach ($relativePath in $runtimeFiles | Where-Object { $_ -like '*.js' }) {
        & $nodeCommand.Source --check (Join-Path $projectRoot $relativePath)
        if ($LASTEXITCODE -ne 0) {
            throw "JavaScript syntax check failed: $relativePath"
        }
    }
    Push-Location $projectRoot
    try {
        & $nodeCommand.Source --test
        if ($LASTEXITCODE -ne 0) {
            throw 'Automated tests failed.'
        }
    } finally {
        Pop-Location
    }
}

$distDirectory = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Path $distDirectory -Force | Out-Null
$outputName = "$($package.name)-$($manifest.version)-chrome-web-store.zip"
$outputPath = Join-Path $distDirectory $outputName
$stagingRoot = Join-Path ([IO.Path]::GetTempPath()) ("prompt-outline-store-" + [guid]::NewGuid().ToString('N'))

try {
    New-Item -ItemType Directory -Path $stagingRoot | Out-Null
    foreach ($relativePath in $runtimeFiles) {
        $sourcePath = Join-Path $projectRoot $relativePath
        $destinationPath = Join-Path $stagingRoot $relativePath
        $destinationDirectory = Split-Path -Parent $destinationPath
        New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
        Copy-Item -LiteralPath $sourcePath -Destination $destinationPath
    }

    Compress-Archive -Path (Join-Path $stagingRoot '*') -DestinationPath $outputPath -CompressionLevel Optimal -Force

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($outputPath)
    try {
        $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
        if ($entries -notcontains 'manifest.json') {
            throw 'manifest.json is not at the ZIP root.'
        }
        $unexpected = @($entries | Where-Object {
            $_ -match '^(tests|docs|store-assets|scripts)/' -or
            $_ -in @('AGENTS.md', 'package.json', 'README.md', 'README.ja.md', 'PRIVACY.md', 'PRIVACY.ja.md')
        })
        if ($unexpected.Count) {
            throw "Unexpected development files in store package: $($unexpected -join ', ')"
        }
    } finally {
        $archive.Dispose()
    }
} finally {
    $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    $resolvedStaging = [IO.Path]::GetFullPath($stagingRoot)
    if ($resolvedStaging.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedStaging).StartsWith('prompt-outline-store-', [StringComparison]::Ordinal)) {
        Remove-Item -LiteralPath $resolvedStaging -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $outputPath
[PSCustomObject]@{
    Package = $outputPath
    Version = $manifest.version
    Files = $runtimeFiles.Count
    Bytes = (Get-Item -LiteralPath $outputPath).Length
    SHA256 = $hash.Hash
}
