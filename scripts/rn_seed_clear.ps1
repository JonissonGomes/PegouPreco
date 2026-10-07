$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "env_keys.ps1")
. (Join-Path $PSScriptRoot "env.ps1")
. (Join-Path $PSScriptRoot "rn_windows_ninja.ps1")

$root = Get-RepoRoot
$mobile = Join-Path $root "mobile"
Set-Location $mobile

$envPath = Ensure-MobileEnvFile
Set-EnvKey -Path $envPath -Key "SEED_DEMO" -Value "false"
Set-EnvKey -Path $envPath -Key "CLEAR_SEED_DEMO" -Value "true"

Write-Host "==> CLEAR_SEED_DEMO=true (remove mercados/precos/carrinho/listas do seed)" -ForegroundColor Cyan
Write-Host "    Auth e onboarding sao preservados." -ForegroundColor Yellow
Write-Host "    Apos limpar, rode 'make run' (ou desligue CLEAR_SEED_DEMO) para uso normal." -ForegroundColor Yellow

if (-not (Test-Path "node_modules")) {
  npm install --legacy-peer-deps
}

$gradleHome = "C:\g"
if (-not (Test-Path $gradleHome)) {
  New-Item -ItemType Directory -Path $gradleHome | Out-Null
}
$env:GRADLE_USER_HOME = $gradleHome

npx react-native run-android --mode=debug --active-arch-only

# Volta a flag para false para o proximo boot nao limpar de novo
Set-EnvKey -Path $envPath -Key "CLEAR_SEED_DEMO" -Value "false"
Write-Host "==> CLEAR_SEED_DEMO=false restaurado no .env" -ForegroundColor Green
