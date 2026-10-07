$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "env.ps1")
. (Join-Path $PSScriptRoot "rn_windows_ninja.ps1")
$root = Get-RepoRoot
$mobile = Join-Path $root "mobile"
Set-Location $mobile

if (-not $env:ANDROID_HOME) {
  throw "Android SDK nao encontrado. Instale o SDK em %LOCALAPPDATA%\Android\Sdk."
}

if (-not (Test-Path "node_modules")) {
  npm install --legacy-peer-deps
}

$gradleHome = "C:\g"
if (-not (Test-Path $gradleHome)) {
  New-Item -ItemType Directory -Force -Path $gradleHome | Out-Null
}
$env:GRADLE_USER_HOME = $gradleHome

function Invoke-AdbSafe {
  param(
    [Parameter(Mandatory = $true)][string[]]$AdbArgs,
    [int]$TimeoutSec = 8
  )
  $adb = Get-Command adb -ErrorAction SilentlyContinue
  if (-not $adb) { return $null }

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $adb.Source
  $psi.Arguments = ($AdbArgs -join ' ')
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  [void]$p.Start()
  if (-not $p.WaitForExit($TimeoutSec * 1000)) {
    try { $p.Kill() } catch {}
    Write-Host "==> adb travado - reiniciando servidor" -ForegroundColor Yellow
    Get-Process -Name adb -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    return $null
  }
  return $p.StandardOutput.ReadToEnd()
}

# Device USB: API no host via 127.0.0.1 (SYNC_API_BASE=http://127.0.0.1:8080 no .env).
$devicesOut = Invoke-AdbSafe -AdbArgs @('devices') -TimeoutSec 8
if ($devicesOut -match "device\s*$") {
  $null = Invoke-AdbSafe -AdbArgs @('reverse', 'tcp:8080', 'tcp:8080') -TimeoutSec 8
  Write-Host "==> adb reverse tcp:8080" -ForegroundColor DarkCyan
}

Write-Host "==> Metro + Android (PegouPreco RN, New Arch)" -ForegroundColor Cyan
# RN as vezes retorna exit != 0 apos am start mesmo com app no ar.
$prev = $ErrorActionPreference
$ErrorActionPreference = "Continue"
npx react-native run-android --mode=debug --active-arch-only
$code = $LASTEXITCODE
$ErrorActionPreference = $prev
if ($code -ne 0) {
  Write-Host "==> run-android exit=$code (app pode ter iniciado mesmo assim)" -ForegroundColor Yellow
  exit $code
}
