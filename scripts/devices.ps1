$ErrorActionPreference = "Continue"

$sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools"
if (Test-Path $sdk) {
  $env:PATH = "$sdk;" + $env:PATH
}

adb devices -l
