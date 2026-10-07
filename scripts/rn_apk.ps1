# Gera APK release do app React Native (Windows-friendly).
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env.ps1')
. (Join-Path $PSScriptRoot 'rn_windows_ninja.ps1')
$root = Get-RepoRoot
$android = Join-Path $root 'mobile\android'

if (-not $env:ANDROID_HOME) {
  throw 'Android SDK nao encontrado. Defina ANDROID_HOME ou instale o SDK em %LOCALAPPDATA%\Android\Sdk.'
}

if (-not (Test-Path (Join-Path $root 'mobile\node_modules'))) {
  Write-Host 'node_modules ausente. Rode: make deps' -ForegroundColor Yellow
  exit 1
}

$gradleHome = 'C:\g'
if (-not (Test-Path $gradleHome)) {
  New-Item -ItemType Directory -Path $gradleHome | Out-Null
}
$env:GRADLE_USER_HOME = $gradleHome

Push-Location $android
try {
  Write-Host 'Gerando APK release (arm64-v8a)...' -ForegroundColor Cyan
  & .\gradlew.bat assembleRelease --no-daemon "-PreactNativeArchitectures=arm64-v8a"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  $apk = Join-Path $android 'app\build\outputs\apk\release\app-release.apk'
  if (Test-Path $apk) {
    $sizeMb = [math]::Round((Get-Item $apk).Length / 1MB, 1)
    Write-Host "APK OK: $apk ($sizeMb MB)" -ForegroundColor Green
  } else {
    Write-Host 'Build concluiu, mas o APK nao foi encontrado.' -ForegroundColor Red
    exit 1
  }
} finally {
  Pop-Location
}
