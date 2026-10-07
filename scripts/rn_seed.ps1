$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "env_keys.ps1")
. (Join-Path $PSScriptRoot "env.ps1")
. (Join-Path $PSScriptRoot "rn_windows_ninja.ps1")

$root = Get-RepoRoot
$mobile = Join-Path $root "mobile"
Set-Location $mobile

$envPath = Ensure-MobileEnvFile
Set-EnvKey -Path $envPath -Key "SEED_DEMO" -Value "true"
Set-EnvKey -Path $envPath -Key "CLEAR_SEED_DEMO" -Value "false"

Write-Host "==> SEED_DEMO=true (pontos de mapa + catalogo demo)" -ForegroundColor Cyan
Write-Host "    Mercados: Atacadao, Novo Atacarejo, Assai, Carrefour, Sam's..." -ForegroundColor Yellow

if (-not (Test-Path "node_modules")) {
  npm install --legacy-peer-deps
}

$gradleHome = "C:\g"
if (-not (Test-Path $gradleHome)) {
  New-Item -ItemType Directory -Path $gradleHome | Out-Null
}
$env:GRADLE_USER_HOME = $gradleHome

npx react-native run-android --mode=debug --active-arch-only
