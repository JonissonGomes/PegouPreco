$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root "sync_api")

if (-not (Get-Command dart -ErrorAction SilentlyContinue)) {
  throw "Dart SDK nao encontrado no PATH (necessario para sync_api)."
}

if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
}

dart pub get
Write-Host "==> sync_api em http://0.0.0.0:8080" -ForegroundColor Cyan
dart run bin/server.dart
