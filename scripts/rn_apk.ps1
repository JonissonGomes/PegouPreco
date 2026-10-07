# Gera APK release do app React Native (Windows-friendly).
# Saida: PegouPreco-<versionName>.apk (nome do app + versao).
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'env.ps1')
. (Join-Path $PSScriptRoot 'rn_windows_ninja.ps1')
$root = Get-RepoRoot
$android = Join-Path $root 'mobile\android'
$appGradle = Join-Path $android 'app\build.gradle'
$stringsXml = Join-Path $android 'app\src\main\res\values\strings.xml'

if (-not $env:ANDROID_HOME) {
  throw 'Android SDK nao encontrado. Defina ANDROID_HOME ou instale o SDK em %LOCALAPPDATA%\Android\Sdk.'
}

if (-not (Test-Path (Join-Path $root 'mobile\node_modules'))) {
  Write-Host 'node_modules ausente. Rode: make deps' -ForegroundColor Yellow
  exit 1
}

$versionName = '1.0'
if (Test-Path $appGradle) {
  $m = Select-String -Path $appGradle -Pattern 'versionName\s+"([^"]+)"' | Select-Object -First 1
  if ($m) { $versionName = $m.Matches[0].Groups[1].Value }
}

$appName = 'PegouPreco'
if (Test-Path $stringsXml) {
  $m = Select-String -Path $stringsXml -Pattern '<string name="app_name">([^<]+)</string>' | Select-Object -First 1
  if ($m) { $appName = $m.Matches[0].Groups[1].Value }
}
# Nome de arquivo seguro (ASCII): remove diacriticos via FormD.
$safeName = $appName.Normalize([Text.NormalizationForm]::FormD) `
  -replace '\p{M}', '' `
  -replace '[^A-Za-z0-9\-]+', ''
if ([string]::IsNullOrWhiteSpace($safeName)) { $safeName = 'PegouPreco' }
$outFileName = "$safeName-$versionName.apk"

$gradleHome = 'C:\g'
if (-not (Test-Path $gradleHome)) {
  New-Item -ItemType Directory -Path $gradleHome | Out-Null
}
$env:GRADLE_USER_HOME = $gradleHome

Push-Location $android
try {
  Write-Host "Gerando APK release (arm64-v8a) → $outFileName ..." -ForegroundColor Cyan
  & .\gradlew.bat assembleRelease --no-daemon "-PreactNativeArchitectures=arm64-v8a"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  $apkDir = Join-Path $android 'app\build\outputs\apk\release'
  $apk = Join-Path $apkDir 'app-release.apk'
  if (-not (Test-Path $apk)) {
    Write-Host 'Build concluiu, mas o APK nao foi encontrado.' -ForegroundColor Red
    exit 1
  }

  $named = Join-Path $apkDir $outFileName
  if (Test-Path $named) { Remove-Item -Force $named }
  Copy-Item -Path $apk -Destination $named -Force

  # Copia tambem na raiz do repo para achar fácil.
  $repoCopy = Join-Path $root $outFileName
  Copy-Item -Path $named -Destination $repoCopy -Force

  $sizeMb = [math]::Round((Get-Item $named).Length / 1MB, 1)
  Write-Host "APK OK: $named ($sizeMb MB)" -ForegroundColor Green
  Write-Host "Copia:  $repoCopy" -ForegroundColor Green
} finally {
  Pop-Location
}
