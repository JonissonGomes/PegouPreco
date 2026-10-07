# Garante Ninja >= 1.12 no CMake do Android SDK (necessario para New Arch no Windows).
$ErrorActionPreference = 'Stop'

$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path $sdk)) {
  throw "Android SDK nao encontrado ($sdk)."
}

$cmakeBins = Get-ChildItem (Join-Path $sdk 'cmake') -Directory -ErrorAction SilentlyContinue |
  ForEach-Object { Join-Path $_.FullName 'bin' } |
  Where-Object { Test-Path (Join-Path $_ 'ninja.exe') }

if (-not $cmakeBins) {
  throw "Nenhum CMake com ninja.exe em $sdk\cmake. Instale CMake via Android Studio SDK Tools."
}

function Get-NinjaVersion([string]$ninjaPath) {
  $out = & $ninjaPath --version 2>&1 | Out-String
  if ($out -match '(\d+\.\d+\.\d+)') { return $Matches[1] }
  return '0.0.0'
}

function Test-NinjaOk([string]$ver) {
  $parts = $ver.Split('.') | ForEach-Object { [int]$_ }
  return ($parts[0] -gt 1) -or ($parts[0] -eq 1 -and $parts[1] -ge 12)
}

$needUpgrade = @()
foreach ($bin in $cmakeBins) {
  $ninja = Join-Path $bin 'ninja.exe'
  $ver = Get-NinjaVersion $ninja
  if (-not (Test-NinjaOk $ver)) {
    Write-Host "Ninja antigo em $ninja (v$ver)" -ForegroundColor Yellow
    $needUpgrade += $bin
  } else {
    Write-Host "Ninja OK: $ninja (v$ver)" -ForegroundColor Green
  }
}

if (-not $needUpgrade.Count) { return }

$tmp = Join-Path $env:TEMP 'ninja-win-upgrade'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$zip = Join-Path $tmp 'ninja-win.zip'
$url = 'https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip'
Write-Host "Baixando Ninja 1.12.1..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $url -OutFile $zip
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$newNinja = Join-Path $tmp 'ninja.exe'
if (-not (Test-Path $newNinja)) { throw 'Download do Ninja falhou.' }

foreach ($bin in $needUpgrade) {
  $target = Join-Path $bin 'ninja.exe'
  $backup = Join-Path $bin 'ninja.exe.bak-1.10'
  if (-not (Test-Path $backup)) {
    Copy-Item $target $backup -Force
  }
  Copy-Item $newNinja $target -Force
  $ver = Get-NinjaVersion $target
  Write-Host "Atualizado: $target (v$ver)" -ForegroundColor Green
}
