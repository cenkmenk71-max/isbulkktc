$ErrorActionPreference = "Stop"

$version = "2.120.0"
$expectedSha256 = "7074584113aa00495beeac661c41fb09f1ddd0a483cd7333894b0d080086dc6e"
$distro = if ($env:ISBULKKTC_WSL_DISTRO) {
  $env:ISBULKKTC_WSL_DISTRO
} else {
  "Ubuntu-24.04"
}
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$drive = [System.IO.Path]::GetPathRoot($projectRoot).Substring(0, 1).ToLowerInvariant()
$relativeProjectPath = $projectRoot.Substring(3).Replace("\", "/")

if (!$drive -or !$relativeProjectPath) {
  throw "The WSL Supabase installer requires the project on a local Windows drive."
}

$linuxProjectRoot = "/mnt/$drive/$relativeProjectPath"
$toolDirectory = Join-Path $projectRoot ".tools\supabase-wsl"
$cacheDirectory = Join-Path $projectRoot ".cache\downloads"
$archivePath = Join-Path $cacheDirectory "supabase-$version-linux-amd64.tar.gz"
$linuxToolDirectory = "$linuxProjectRoot/.tools/supabase-wsl"
$linuxCliPath = "$linuxToolDirectory/supabase"

New-Item -ItemType Directory -Path $toolDirectory, $cacheDirectory -Force | Out-Null

& wsl.exe -d $distro -- test -d $linuxProjectRoot
if ($LASTEXITCODE -ne 0) {
  throw "WSL distro '$distro' cannot access the project at $linuxProjectRoot."
}

$archiveUrl = "https://github.com/supabase/cli/releases/download/v$version/supabase_${version}_linux_amd64.tar.gz"
Write-Output "Downloading the official Supabase CLI $version Linux binary..."
Invoke-WebRequest -Uri $archiveUrl -OutFile $archivePath

$actualSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualSha256 -ne $expectedSha256) {
  throw "Supabase CLI archive SHA-256 mismatch. Expected $expectedSha256, got $actualSha256."
}

Write-Output "Verified SHA-256. Extracting the CLI into the ignored D: tools directory..."
& wsl.exe -d $distro -- mkdir -p $linuxToolDirectory
if ($LASTEXITCODE -ne 0) {
  throw "Could not create $linuxToolDirectory inside WSL."
}

& wsl.exe -d $distro -- tar -xzf "/mnt/$drive/$($archivePath.Substring(3).Replace('\', '/'))" -C $linuxToolDirectory supabase
if ($LASTEXITCODE -ne 0) {
  throw "Could not extract the Supabase CLI archive inside WSL distro '$distro'."
}

& wsl.exe -d $distro -- chmod 755 $linuxCliPath
if ($LASTEXITCODE -ne 0) {
  throw "Could not make the project-local Supabase CLI executable."
}

$installedVersion = & wsl.exe -d $distro -- $linuxCliPath --version
if ($LASTEXITCODE -ne 0 -or "$installedVersion" -notmatch [regex]::Escape($version)) {
  throw "The project-local WSL CLI did not report the expected version $version."
}

Set-Content -LiteralPath (Join-Path $toolDirectory "version.txt") -Value $version -NoNewline
Remove-Item -LiteralPath $archivePath -Force
Write-Output "Installed and verified Supabase CLI $installedVersion for WSL distro '$distro'."
