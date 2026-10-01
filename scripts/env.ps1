# Ambiente comum PegouPreço (Flutter + Android SDK)
$ErrorActionPreference = "Stop"

$FlutterRoot = if (Test-Path "C:\src\flutter\bin\flutter.bat") {
  "C:\src\flutter"
} elseif ($env:FLUTTER_ROOT -and (Test-Path "$env:FLUTTER_ROOT\bin\flutter.bat")) {
  $env:FLUTTER_ROOT
} else {
  $null
}

$SdkCandidates = @(
  $env:ANDROID_HOME,
  $env:ANDROID_SDK_ROOT,
  "$env:LOCALAPPDATA\Android\Sdk",
  "$env:USERPROFILE\AppData\Local\Android\Sdk"
) | Where-Object { $_ -and (Test-Path $_) }

$AndroidSdk = $SdkCandidates | Select-Object -First 1

if ($FlutterRoot) {
  $env:PATH = "$FlutterRoot\bin;$env:PATH"
  $env:FLUTTER_ROOT = $FlutterRoot
}

# Prefere JDK 17 (Gradle 8 / AGP 8). Android Studio recente traz Java 25.
$jdk17 = Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "jdk-17*" } |
  Select-Object -First 1
if ($jdk17 -and (Test-Path (Join-Path $jdk17.FullName "bin\java.exe"))) {
  $env:JAVA_HOME = $jdk17.FullName
  $env:PATH = "$($jdk17.FullName)\bin;$env:PATH"
} else {
  $jbr = "C:\Program Files\Android\Android Studio\jbr"
  if (Test-Path "$jbr\bin\java.exe") {
    $env:JAVA_HOME = $jbr
    $env:PATH = "$jbr\bin;$env:PATH"
  }
}

if ($AndroidSdk) {
  $env:ANDROID_HOME = $AndroidSdk
  $env:ANDROID_SDK_ROOT = $AndroidSdk
  $cmdline = Get-ChildItem -Path "$AndroidSdk\cmdline-tools" -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName "bin\sdkmanager.bat") } |
    Select-Object -First 1
  $extra = @(
    "$AndroidSdk\platform-tools",
    "$AndroidSdk\emulator"
  )
  if ($cmdline) { $extra += (Join-Path $cmdline.FullName "bin") }
  $env:PATH = (($extra + $env:PATH) -join ";")
}

function Assert-Flutter {
  if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
    throw "Flutter nao encontrado. Instale em C:\src\flutter ou defina FLUTTER_ROOT."
  }
}

function Get-RepoRoot {
  Split-Path -Parent $PSScriptRoot
}

function Get-AppDir {
  Join-Path (Get-RepoRoot) "app"
}

function Get-ApiDir {
  Join-Path (Get-RepoRoot) "sync_api"
}
