$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "env.ps1")
. (Join-Path $PSScriptRoot "rn_windows_ninja.ps1")
$root = Get-RepoRoot
$mobile = Join-Path $root "mobile"
Set-Location $mobile

if (-not $env:ANDROID_HOME) {
  throw "Android SDK nao encontrado. Defina ANDROID_HOME ou instale o SDK em %LOCALAPPDATA%\Android\Sdk."
}

if (-not (Test-Path "node_modules")) {
  npm install --legacy-peer-deps
}

$gradleHome = "C:\g"
if (-not (Test-Path $gradleHome)) {
  New-Item -ItemType Directory -Path $gradleHome | Out-Null
}
$env:GRADLE_USER_HOME = $gradleHome

Write-Host "==> Metro + Android (PegouPreço RN, New Arch)" -ForegroundColor Cyan
npx react-native run-android --mode=debug --active-arch-only
