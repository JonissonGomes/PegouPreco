$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $root "mobile"
Set-Location $mobile
npm install --legacy-peer-deps
Write-Host "==> Dependências RN instaladas" -ForegroundColor Green
