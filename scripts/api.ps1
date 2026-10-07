$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "env.ps1")

$root = Get-RepoRoot
Set-Location (Get-ApiDir)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js nao encontrado. Instale Node >= 18 e garanta que esteja no PATH."
}

if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
}

if (-not (Test-Path "node_modules")) {
  npm install
}

# Libera a porta 8080 se outro processo (API antiga / Dart) ainda estiver ouvindo.
$port = 8080
$pids = @(
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
)
if (-not $pids.Count) {
  $pids = @(
    netstat -ano |
      Select-String ":$port\s+.*LISTENING" |
      ForEach-Object {
        if ($_.Line -match '\s(\d+)\s*$') { [int]$Matches[1] }
      } |
      Select-Object -Unique
  )
}
foreach ($procId in $pids) {
  if ($procId -and $procId -gt 0) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Write-Host "==> porta $port liberada (PID $procId)" -ForegroundColor Yellow
  }
}
Start-Sleep -Milliseconds 400

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

# Device USB: encaminha 8080 do aparelho para o PC (SYNC_API_BASE=http://127.0.0.1:8080).
$devicesOut = Invoke-AdbSafe -AdbArgs @('devices') -TimeoutSec 8
if ($devicesOut -match "device\s*$") {
  $null = Invoke-AdbSafe -AdbArgs @('reverse', 'tcp:8080', 'tcp:8080') -TimeoutSec 8
  Write-Host "==> adb reverse tcp:8080 (device USB usa 127.0.0.1:8080)" -ForegroundColor DarkCyan
}

Write-Host "==> sync_api em http://0.0.0.0:8080" -ForegroundColor Cyan
Write-Host "    Emulador: SYNC_API_BASE=http://10.0.2.2:8080" -ForegroundColor DarkGray
Write-Host "    Device USB: SYNC_API_BASE=http://127.0.0.1:8080 (+ adb reverse)" -ForegroundColor DarkGray
npm start
