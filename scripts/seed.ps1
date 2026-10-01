$ErrorActionPreference = "Stop"
. "$PSScriptRoot\env.ps1"
Assert-Flutter
if (-not $env:ANDROID_HOME) {
  throw "Android SDK ausente. Rode: make setup"
}

$app = Get-AppDir
Set-Location $app

Write-Host @"
==> Seed demo PegouPreco
    Na abertura do app (SEED_DEMO=true):
    - limpa o Isar local
    - cria 6 mercados com GPS/avaliacao
    - 20 produtos + historico de precos
    - carrinho ativo (lista "Compras de hoje")
    - 3 listas finalizadas
    - pula onboarding
"@ -ForegroundColor Cyan

function Get-AndroidDeviceIds {
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

$deviceIds = Get-AndroidDeviceIds
if ($deviceIds.Count -eq 0) {
  Write-Host "==> Nenhum device. Use o mesmo fluxo do make run para subir o emulador..." -ForegroundColor Yellow
  # Delega a subida do emulador ao run.ps1, mas precisamos do seed — inicia emulador via run helpers.
  $avdName = "PegouPreco_API34"
  $emulatorCmd = Get-Command emulator.exe -ErrorAction SilentlyContinue
  if (-not $emulatorCmd) {
    $candidate = Join-Path $env:ANDROID_HOME "emulator\emulator.exe"
    if (Test-Path $candidate) {
      $emulatorCmd = Get-Item $candidate
    }
  }
  if (-not $emulatorCmd) {
    throw "Nenhum Android conectado e emulator.exe ausente. Rode: make setup / make run"
  }
  Write-Host "==> Iniciando emulador $avdName..." -ForegroundColor Cyan
  Start-Process -FilePath $emulatorCmd.Source -ArgumentList @(
    "-avd", $avdName,
    "-netdelay", "none",
    "-netspeed", "full"
  ) -WindowStyle Normal
  $deadline = (Get-Date).AddMinutes(4)
  do {
    Start-Sleep -Seconds 5
    $deviceIds = Get-AndroidDeviceIds
    if ($deviceIds.Count -gt 0) { break }
    Write-Host "  aguardando emulador..."
  } while ((Get-Date) -lt $deadline)
  if ($deviceIds.Count -eq 0) {
    throw "Emulador nao ficou pronto. Abra o Device Manager e rode make seed de novo."
  }
}

$syncBase = $env:SYNC_API_BASE
if (-not $syncBase) {
  $syncBase = "http://10.0.2.2:8080"
}

$device = $deviceIds[0]
Write-Host "==> flutter run -d $device (SEED_DEMO=true, SYNC_API_BASE=$syncBase)" -ForegroundColor Cyan
Write-Host "    ATENCAO: o banco local sera APAGADO e recriado." -ForegroundColor Yellow

flutter run -d $device `
  --dart-define="SYNC_API_BASE=$syncBase" `
  --dart-define="SEED_DEMO=true"
