# Helpers para upsert de chaves no mobile/.env sem imprimir valores sensíveis.

function Get-MobileEnvPath {
  $root = Split-Path -Parent $PSScriptRoot
  return (Join-Path $root "mobile\.env")
}

function Ensure-MobileEnvFile {
  $envPath = Get-MobileEnvPath
  $example = Join-Path (Split-Path $envPath) ".env.example"
  if (-not (Test-Path $envPath)) {
    if (Test-Path $example) {
      Copy-Item -Force $example $envPath
    } else {
      @(
        "MAPBOX_ACCESS_TOKEN="
        "SYNC_API_BASE=http://10.0.2.2:8080"
        "SEED_DEMO=false"
        "CLEAR_SEED_DEMO=false"
      ) | Set-Content -Path $envPath -Encoding utf8
    }
  }
  return $envPath
}

function Set-EnvKey {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][string]$Value
  )
  $lines = @()
  if (Test-Path $Path) {
    $lines = Get-Content -Path $Path
  }
  $found = $false
  $out = foreach ($line in $lines) {
    if ($line -match ("^" + [regex]::Escape($Key) + "\s*=")) {
      $found = $true
      "$Key=$Value"
    } else {
      $line
    }
  }
  if (-not $found) {
    $out = @($out) + "$Key=$Value"
  }
  Set-Content -Path $Path -Value $out -Encoding utf8
}
