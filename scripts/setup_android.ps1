# Instala/configura Android SDK o maximo possivel sem voce abrir o Android Studio.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\setup_android.ps1
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\env.ps1"

Write-Host "==> PegouPreco: setup Android" -ForegroundColor Cyan

# 1) Flutter
Assert-Flutter
Write-Host "Flutter: $(flutter --version | Select-Object -First 1)"

# 2) Android Studio (traz o SDK na primeira instalacao)
$studioOk = Get-Command studio64 -ErrorAction SilentlyContinue
$studioPath = @(
  "$env:ProgramFiles\Android\Android Studio\bin\studio64.exe",
  "${env:ProgramFiles(x86)}\Android\Android Studio\bin\studio64.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $studioPath -and -not $studioOk) {
  Write-Host "==> Instalando Android Studio via winget (pode pedir UAC / demorar)..." -ForegroundColor Yellow
  winget install -e --id Google.AndroidStudio --accept-package-agreements --accept-source-agreements
} else {
  Write-Host "==> Android Studio ja presente."
}

# 3) Platform-tools (adb)
winget install -e --id Google.PlatformTools --accept-package-agreements --accept-source-agreements | Out-Null

# Recarrega caminho do SDK
. "$PSScriptRoot\env.ps1"
if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) {
  Write-Host @"

Android SDK ainda nao apareceu em %LOCALAPPDATA%\Android\Sdk.

Faca UMA vez (manual, ~2 minutos):
  1. Abra o Android Studio
  2. Se aparecer o assistente, escolha Standard e Finish
  3. Se nao aparecer: More Actions -> SDK Manager -> Apply
  4. Feche o Android Studio e rode de novo:  make setup

"@ -ForegroundColor Yellow
  exit 2
}

Write-Host "ANDROID_HOME=$env:ANDROID_HOME"

# 4) Garante cmdline-tools
$sdkmanager = Get-Command sdkmanager.bat -ErrorAction SilentlyContinue
if (-not $sdkmanager) {
  Write-Host "==> Baixando Android command-line tools..."
  $toolsZip = Join-Path $env:TEMP "android-cmdline-tools.zip"
  $url = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
  Invoke-WebRequest -Uri $url -OutFile $toolsZip
  $unpack = Join-Path $env:TEMP "android-cmdline-tools-unpack"
  if (Test-Path $unpack) { Remove-Item -Recurse -Force $unpack }
  Expand-Archive -Path $toolsZip -DestinationPath $unpack -Force
  $dest = Join-Path $env:ANDROID_HOME "cmdline-tools\latest"
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  # O zip vem com pasta "cmdline-tools"
  $inner = Join-Path $unpack "cmdline-tools"
  Move-Item $inner $dest
  . "$PSScriptRoot\env.ps1"
  $sdkmanager = Get-Command sdkmanager.bat -ErrorAction SilentlyContinue
}

if (-not $sdkmanager) {
  throw "sdkmanager nao encontrado apos instalar cmdline-tools."
}

Write-Host "==> Instalando platforms/build-tools (API 34)..."
$packages = @(
  "platform-tools",
  "platforms;android-34",
  "build-tools;34.0.0",
  "emulator",
  "system-images;android-34;google_apis;x86_64"
)
# Aceita licencas automaticamente
$yes = ("y`n" * 50)
$yes | & sdkmanager.bat --sdk_root=$env:ANDROID_HOME $packages

Write-Host "==> Aceitando licencas Flutter/Android..."
$yes | flutter doctor --android-licenses

flutter config --android-sdk $env:ANDROID_HOME | Out-Null

Write-Host "==> flutter doctor"
flutter doctor

Write-Host @"

Setup Android concluido.

Proximos comandos:
  make deps     # dependencias do app
  make apk      # gera APK
  make run      # roda no emulador/celular
  make api      # sobe sync_api

"@ -ForegroundColor Green
