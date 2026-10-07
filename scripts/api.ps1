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

Write-Host "==> sync_api em http://0.0.0.0:8080" -ForegroundColor Cyan
npm start
