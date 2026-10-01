# Corrige isar_flutter_libs (AGP 8+/9 exige namespace).
$ErrorActionPreference = "Stop"
$pubCache = if ($env:PUB_CACHE) { $env:PUB_CACHE } else { Join-Path $env:LOCALAPPDATA "Pub\Cache" }
$gradle = Join-Path $pubCache "hosted\pub.dev\isar_flutter_libs-3.1.0+1\android\build.gradle"

if (-not (Test-Path $gradle)) {
  Write-Host "isar_flutter_libs ainda nao esta no pub-cache (ok se ainda nao rodou pub get)."
  exit 0
}

$content = Get-Content $gradle -Raw
if ($content -match 'namespace\s+"dev\.isar\.isar_flutter_libs"') {
  Write-Host "isar_flutter_libs ja possui namespace."
  exit 0
}

$patched = $content -replace '(android\s*\{)', "`$1`r`n    namespace `"dev.isar.isar_flutter_libs`""
if ($patched -eq $content) {
  throw "Nao foi possivel aplicar patch em $gradle"
}
Set-Content -Path $gradle -Value $patched -NoNewline
Write-Host "Patch aplicado: namespace em isar_flutter_libs" -ForegroundColor Green
