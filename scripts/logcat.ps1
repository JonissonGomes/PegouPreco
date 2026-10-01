$ErrorActionPreference = "Stop"

$sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools"
if (Test-Path $sdk) {
  $env:PATH = "$sdk;" + $env:PATH
}

Write-Host "Dispositivos:" -ForegroundColor Cyan
adb devices

$devices = adb devices | Select-String "`tdevice$" | ForEach-Object {
  ($_ -split "`t")[0].Trim()
} | Where-Object { $_ -and $_ -ne "List of devices attached" }

if (-not $devices) {
  Write-Host ""
  Write-Host "Nenhum device 'device' no adb." -ForegroundColor Yellow
  Write-Host "No celular: Ativar opcoes do desenvolvedor + Depuracao USB,"
  Write-Host "aceitar o dialogo 'Permitir depuracao USB', e rode de novo: make logcat"
  exit 1
}

# Prefere aparelho fisico (nao emulator-*)
$serial = $devices | Where-Object { $_ -notlike "emulator-*" } | Select-Object -First 1
if (-not $serial) {
  $serial = $devices | Select-Object -First 1
  Write-Host "Usando emulador $serial (nenhum USB fisico detectado)." -ForegroundColor Yellow
} else {
  Write-Host "Usando aparelho $serial" -ForegroundColor Green
}

Write-Host ""
Write-Host "Limpando logcat e aguardando crash do PegouPreco..." -ForegroundColor Cyan
Write-Host "Abra o app no celular agora. Ctrl+C para parar." -ForegroundColor DarkGray
Write-Host ""

adb -s $serial logcat -c
adb -s $serial logcat *:E Flutter:V AndroidRuntime:E libc:E | Select-String -Pattern "pegou|flutter|FATAL|AndroidRuntime|isar|Exception" -CaseSensitive:$false
