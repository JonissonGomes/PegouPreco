$ErrorActionPreference = "Stop"
. "$PSScriptRoot\env.ps1"
Assert-Flutter
$api = Get-ApiDir
Set-Location $api
if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
}
dart pub get
Write-Host "==> sync_api em http://0.0.0.0:8080" -ForegroundColor Cyan
dart run bin/server.dart
