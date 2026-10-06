$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $root "mobile"
Set-Location $mobile

Copy-Item -Force ".env.seed" ".env"
Write-Host "==> SEED_DEMO=true (.env atualizado)" -ForegroundColor Cyan
Write-Host "    Reinstale/rode o app para popular o banco demo." -ForegroundColor Yellow
npx react-native run-android
