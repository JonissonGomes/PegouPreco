$ErrorActionPreference = "Stop"

$sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools"
if (Test-Path $sdk) {
  $env:PATH = "$sdk;" + $env:PATH
}

$apk = Join-Path $PSScriptRoot "..\app\build\app\outputs\flutter-apk\app-release.apk"
$apk = [System.IO.Path]::GetFullPath($apk)

if (-not (Test-Path $apk)) {
  Write-Host "APK nao encontrado. Rode: make apk" -ForegroundColor Red
  exit 1
}

Write-Host "Dispositivos:" -ForegroundColor Cyan
adb devices

$devices = adb devices | Select-String "`tdevice$" | ForEach-Object {
  ($_ -split "`t")[0].Trim()
} | Where-Object { $_ -and $_ -ne "List of devices attached" }

$serial = $devices | Where-Object { $_ -notlike "emulator-*" } | Select-Object -First 1
if (-not $serial) {
  $serial = $devices | Select-Object -First 1
}

if (-not $serial) {
  Write-Host "Nenhum device. Ative Depuracao USB e aceite o dialogo." -ForegroundColor Yellow
  exit 1
}

Write-Host "Desinstalando versao antiga (se houver)..." -ForegroundColor Cyan
adb -s $serial uninstall br.com.pegoupreco.app 2>$null | Out-Null

Write-Host "Instalando $apk em $serial ..." -ForegroundColor Cyan
adb -s $serial install -r $apk
Write-Host "OK. Abra o app e, se crashar, rode: make logcat" -ForegroundColor Green
