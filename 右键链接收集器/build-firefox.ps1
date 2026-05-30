$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDir = Join-Path $projectRoot 'dist\firefox'
$zipPath = Join-Path $projectRoot 'dist\right-click-link-collector-firefox.zip'
$xpiPath = Join-Path $projectRoot 'dist\right-click-link-collector-firefox.xpi'
$xpiZipPath = Join-Path $projectRoot 'dist\right-click-link-collector-firefox-xpi-source.zip'

$filesToCopy = @(
  'background.js',
  'content.js',
  'db.js',
  'icon.png',
  'manager.css',
  'manager.html',
  'manager.js',
  'popup.css',
  'popup.html',
  'popup.js'
)

if (Test-Path $outputDir) {
  Remove-Item -LiteralPath $outputDir -Recurse -Force
}

if (Test-Path $xpiPath) {
  Remove-Item -LiteralPath $xpiPath -Force
}

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

if (Test-Path $xpiZipPath) {
  Remove-Item -LiteralPath $xpiZipPath -Force
}

New-Item -ItemType Directory -Path $outputDir | Out-Null

foreach ($file in $filesToCopy) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $outputDir $file)
}

Copy-Item -LiteralPath (Join-Path $projectRoot 'manifest.firefox.json') -Destination (Join-Path $outputDir 'manifest.json')

Write-Host "Firefox extension files generated in: $outputDir"

# Generate a normal ZIP package for browsers that accept ZIP extension packages.
Compress-Archive -Path (Join-Path $outputDir '*') -DestinationPath $zipPath
Write-Host "Firefox ZIP package generated at: $zipPath"

# XPI files are regular ZIP archives with a different extension.
Compress-Archive -Path (Join-Path $outputDir '*') -DestinationPath $xpiZipPath
Move-Item -LiteralPath $xpiZipPath -Destination $xpiPath
Write-Host "Firefox XPI package generated at: $xpiPath"
