$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $root "mobile"
Set-Location $mobile

if (-not (Test-Path "node_modules")) {
  npm install --legacy-peer-deps
}

Write-Host "==> Metro + Android (PegouPreço RN)" -ForegroundColor Cyan
npx react-native run-android
