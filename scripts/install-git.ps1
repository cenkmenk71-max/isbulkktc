$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$toolDirectory = Join-Path $projectRoot ".tools\git"
$cacheDirectory = Join-Path $projectRoot ".cache\downloads"
$archivePath = Join-Path $cacheDirectory "MinGit-2.56.0.2-64-bit.zip"
$archiveUrl = "https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.2/MinGit-2.56.0.2-64-bit.zip"
$expectedHash = "da35e72aa21c005a5a0d298cfbae110bc1609a815730ea0dde84b01a1b3cd3be"
$gitExecutable = Join-Path $toolDirectory "cmd\git.exe"

if (Test-Path -LiteralPath $gitExecutable) {
  $version = & $gitExecutable --version
  if ($LASTEXITCODE -ne 0) {
    throw "The project-local Git executable exists but could not run."
  }

  Write-Output $version
  exit 0
}

New-Item -ItemType Directory -Path $cacheDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $toolDirectory -Force | Out-Null

Invoke-WebRequest -Uri $archiveUrl -OutFile $archivePath
$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) {
  Remove-Item -LiteralPath $archivePath -Force
  throw "The downloaded MinGit archive checksum did not match the official release digest."
}

Expand-Archive -LiteralPath $archivePath -DestinationPath $toolDirectory -Force
Remove-Item -LiteralPath $archivePath -Force

if (!(Test-Path -LiteralPath $gitExecutable)) {
  throw "The verified MinGit archive did not contain the expected cmd\git.exe."
}

$version = & $gitExecutable --version
if ($LASTEXITCODE -ne 0) {
  throw "The project-local Git executable failed its version check."
}

Write-Output $version
