$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$extensionDirectory = Join-Path $projectRoot ".tools\vscode-extensions"
$candidates = @(
  (Get-Command code.cmd -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
  (Get-Command code.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
  (Join-Path $env:ProgramFiles "Microsoft VS Code\bin\code.cmd"),
  (Join-Path $env:LOCALAPPDATA "Programs\Microsoft VS Code\bin\code.cmd"),
  "D:\Microsoft VS Code\bin\code.cmd"
)
$code = $null
foreach ($candidate in $candidates) {
  if ($candidate -and (Test-Path -LiteralPath $candidate)) {
    $code = $candidate
    break
  }
}

if (!$code) {
  throw "VS Code's code.cmd was not found. Install VS Code, then run this script again."
}

New-Item -ItemType Directory -Path $extensionDirectory -Force | Out-Null
$recommendationFile = Join-Path $projectRoot ".vscode\extensions.json"
if (!(Test-Path -LiteralPath $recommendationFile)) {
  throw "Workspace extension recommendations were not found."
}

$recommendationData = Get-Content -LiteralPath $recommendationFile -Raw | ConvertFrom-Json -ErrorAction Stop
$recommendations = @($recommendationData.recommendations)
if ($recommendations.Count -eq 0) {
  throw "Workspace extension recommendations are empty."
}

$pinnedVersions = @{
  "bradlc.vscode-tailwindcss" = "0.16.0"
  "dbaeumer.vscode-eslint" = "3.0.34"
  "ms-playwright.playwright" = "1.1.19"
}
$extensions = foreach ($extensionId in $recommendations) {
  if ($extensionId -notmatch "^[A-Za-z0-9-]+\.[A-Za-z0-9-]+$") {
    throw "Invalid VS Code extension ID in workspace recommendations: $extensionId"
  }

  if ($pinnedVersions.ContainsKey($extensionId)) {
    "$extensionId@$($pinnedVersions[$extensionId])"
  } else {
    $extensionId
  }
}

foreach ($extension in $extensions) {
  & $code --extensions-dir $extensionDirectory --install-extension $extension --force
  if ($LASTEXITCODE -ne 0) {
    throw "Could not install $extension into the project-local extension directory."
  }
}

$installedExtensions = @(& $code --extensions-dir $extensionDirectory --list-extensions --show-versions)
if ($LASTEXITCODE -ne 0) {
  throw "Could not verify the project-local VS Code extension installation."
}

$installedIds = @($installedExtensions | ForEach-Object { ($_ -split "@", 2)[0].ToLowerInvariant() })
foreach ($extension in $extensions) {
  $extensionId = ($extension -split "@", 2)[0]
  if ($installedIds -notcontains $extensionId.ToLowerInvariant()) {
    throw "Could not verify that $extensionId is installed in the project-local extension directory."
  }
}

$installedExtensions
