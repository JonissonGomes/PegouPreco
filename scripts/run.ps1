$ErrorActionPreference = "Stop"
. "$PSScriptRoot\env.ps1"
Assert-Flutter
if (-not $env:ANDROID_HOME) {
  throw "Android SDK ausente. Rode: make setup"
}

$app = Get-AppDir
Set-Location $app

$avdName = "PegouPreco_API34"
$systemImage = "system-images;android-34;google_apis;x86_64"

function Get-AndroidDeviceIds {
  # JSON evita falso-positivo com a palavra "emulators" no texto do Flutter.
  $json = flutter devices --machine 2>$null
  if (-not $json) { return @() }
  try {
    $devices = $json | ConvertFrom-Json
  } catch {
    return @()
  }
  $ids = @()
  foreach ($d in $devices) {
    $target = "$($d.targetPlatform)".ToLowerInvariant()
    $id = "$($d.id)"
    if ($target -like "android*" -or $id -like "emulator-*") {
      $ids += $id
    }
  }
  return $ids
}

function Ensure-SystemImage {
  $imgPath = Join-Path $env:ANDROID_HOME ($systemImage -replace ";", "\")
  if (Test-Path $imgPath) { return }
  Write-Host "==> Baixando system image $systemImage (pode demorar)..." -ForegroundColor Yellow
  $sdkmanager = Get-Command sdkmanager.bat -ErrorAction SilentlyContinue
  if (-not $sdkmanager) {
    throw "sdkmanager nao encontrado. Rode: make setup"
  }
  $yes = ("y`n" * 40)
  $yes | & sdkmanager.bat --sdk_root=$env:ANDROID_HOME $systemImage "emulator" "platform-tools"
}

function Ensure-Avd {
  Ensure-SystemImage
  $avdDir = Join-Path $env:USERPROFILE ".android\avd\$avdName.avd"
  if (Test-Path $avdDir) { return }
  Write-Host "==> Criando AVD $avdName..." -ForegroundColor Yellow
  $avdmanager = Get-Command avdmanager.bat -ErrorAction SilentlyContinue
  if (-not $avdmanager) {
    throw "avdmanager nao encontrado. Rode: make setup"
  }
  # "no" = nao criar custom hardware profile interativo
  "no" | & avdmanager.bat create avd -n $avdName -k $systemImage -d pixel_6 --force
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao criar AVD. Abra o Android Studio > Device Manager e crie um Pixel 6 (API 34)."
  }
}

function Start-AndroidEmulator {
  Ensure-Avd
  $emulatorCmd = Get-Command emulator.exe -ErrorAction SilentlyContinue
  if (-not $emulatorCmd) {
    $emulatorCmd = Get-Item (Join-Path $env:ANDROID_HOME "emulator\emulator.exe") -ErrorAction SilentlyContinue
  }
  if (-not $emulatorCmd) {
    throw "emulator.exe nao encontrado em ANDROID_HOME\emulator. Rode: make setup"
  }

  Write-Host "==> Iniciando emulador $avdName..." -ForegroundColor Cyan
  Start-Process -FilePath $emulatorCmd.Source -ArgumentList @(
    "-avd", $avdName,
    "-netdelay", "none",
    "-netspeed", "full"
  ) -WindowStyle Normal

  Write-Host "Aguardando emulador ficar online (ate 4 min)..."
  $deadline = (Get-Date).AddMinutes(4)
  do {
    Start-Sleep -Seconds 5
    $ids = Get-AndroidDeviceIds
    if ($ids.Count -gt 0) {
      Write-Host "Device pronto: $($ids -join ', ')" -ForegroundColor Green
      return $ids[0]
    }
    Write-Host "  ainda aguardando..."
  } while ((Get-Date) -lt $deadline)

  throw @"
Emulador nao subiu a tempo.

Alternativas:
  1) Abra o Android Studio > Device Manager > Play no emulador
  2) Ou conecte um celular com Depuracao USB e rode make run de novo
"@
}

$deviceIds = Get-AndroidDeviceIds
if ($deviceIds.Count -eq 0) {
  Write-Host "==> Nenhum Android conectado. Preparando emulador..." -ForegroundColor Yellow
  $null = Start-AndroidEmulator
  $deviceIds = Get-AndroidDeviceIds
  if ($deviceIds.Count -eq 0) {
    throw "Emulador iniciou, mas o Flutter ainda nao o enxerga. Espere 30s e rode make run de novo."
  }
}

$syncBase = $env:SYNC_API_BASE
if (-not $syncBase) {
  # Emulador Android enxerga o host como 10.0.2.2
  $syncBase = "http://10.0.2.2:8080"
}

$device = $deviceIds[0]
Write-Host "==> flutter run -d $device (SYNC_API_BASE=$syncBase)" -ForegroundColor Cyan
flutter run -d $device --dart-define="SYNC_API_BASE=$syncBase"
