$ErrorActionPreference = "Stop"
. "$PSScriptRoot\env.ps1"
Assert-Flutter
$app = Get-AppDir
Set-Location $app
Write-Host "==> pub get" -ForegroundColor Cyan
flutter pub get
Write-Host "==> patch isar_flutter_libs (namespace AGP)" -ForegroundColor Cyan
& "$PSScriptRoot\patch_isar_android.ps1"
Write-Host "==> build_runner (Isar)" -ForegroundColor Cyan
dart run build_runner build --delete-conflicting-outputs
if (Test-Path "assets\branding\app_icon.png") {
  Write-Host "==> launcher icons" -ForegroundColor Cyan
  dart run flutter_launcher_icons
}
Write-Host "Deps OK." -ForegroundColor Green

