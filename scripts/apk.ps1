$ErrorActionPreference = "Stop"
. "$PSScriptRoot\env.ps1"
Assert-Flutter
if (-not $env:ANDROID_HOME) {
  throw "Android SDK ausente. Rode: make setup"
}
& "$PSScriptRoot\patch_isar_android.ps1"
$app = Get-AppDir
Set-Location $app
$mode = if ($args.Count -gt 0) { $args[0] } else { "release" }
Write-Host "==> flutter build apk --$mode" -ForegroundColor Cyan
# Garante JAVA_HOME do env.ps1 (JDK 17) para o Gradle
flutter build apk "--$mode" --android-skip-build-dependency-validation
if ($LASTEXITCODE -ne 0) {
  throw "Build APK falhou (exit $LASTEXITCODE)."
}
$apk = Join-Path $app "build\app\outputs\flutter-apk\app-$mode.apk"
if (-not (Test-Path $apk)) {
  throw "Build terminou sem gerar $apk"
}
Write-Host "APK gerado: $apk" -ForegroundColor Green
Write-Host "Tamanho: $([math]::Round((Get-Item $apk).Length / 1MB, 2)) MB"
