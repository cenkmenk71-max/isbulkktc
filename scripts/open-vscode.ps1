$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
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

$extensionDirectory = Join-Path $projectRoot ".tools\vscode-extensions"
$userDataDirectory = Join-Path $projectRoot ".cache\vscode-user-data"
$gitDirectory = Join-Path $projectRoot ".tools\git\cmd"
$gitExecutable = Join-Path $gitDirectory "git.exe"

if (!(Test-Path -LiteralPath $extensionDirectory)) {
  throw "Project-local VS Code extensions are missing. Run 'npm run tools:vscode-extensions' first."
}

if (!(Test-Path -LiteralPath $gitExecutable)) {
  throw "Project-local Git is missing. Run 'npm run tools:git' first."
}

New-Item -ItemType Directory -Path $userDataDirectory -Force | Out-Null
$env:PATH = "$gitDirectory;$env:PATH"
& $code --user-data-dir $userDataDirectory --extensions-dir $extensionDirectory --new-window $projectRoot

if ($LASTEXITCODE -ne 0) {
  throw "VS Code did not open with the project-local user-data and extension directories."
}
