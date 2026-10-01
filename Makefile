# PegouPreço — atalhos Windows (make + PowerShell)
# Uso tipico (primeira vez):
#   make setup
#   make deps
#   make apk
#   make run

SHELL := powershell.exe
.SHELLFLAGS := -NoProfile -ExecutionPolicy Bypass -Command
PS := powershell -NoProfile -ExecutionPolicy Bypass -File

.PHONY: help setup deps apk apk-debug run seed api doctor all clean install logcat devices

help:
	@Write-Host "Alvos disponiveis:" -ForegroundColor Cyan
	@Write-Host "  make setup      Instala/configura Android Studio + SDK + licencas"
	@Write-Host "  make deps       pub get + Isar codegen + icones"
	@Write-Host "  make apk        Gera APK release"
	@Write-Host "  make apk-debug  Gera APK debug (mais rapido)"
	@Write-Host "  make install    Desinstala + instala APK release via USB/adb"
	@Write-Host "  make logcat     Captura erros do app no device (abra o app apos iniciar)"
	@Write-Host "  make devices    Lista aparelhos adb"
	@Write-Host "  make run        Sobe emulador (se preciso) e roda o app"
	@Write-Host "  make seed       Roda o app com banco demo (mercados, precos, carrinho, listas)"
	@Write-Host "  make api        Sobe a sync_api (porta 8080)"
	@Write-Host "  make doctor     flutter doctor"
	@Write-Host "  make all        setup + deps + apk"
	@Write-Host ""
	@Write-Host "Primeira vez (sem nunca ter aberto o Android Studio):"
	@Write-Host "  1) make setup"
	@Write-Host "  2) Se pedir, abra o Android Studio 1x (Standard) e rode make setup de novo"
	@Write-Host "  3) make deps"
	@Write-Host "  4) make apk    OU    make run"
	@Write-Host ""
	@Write-Host "Crash no celular (USB):"
	@Write-Host "  make devices"
	@Write-Host "  make install"
	@Write-Host "  make logcat   (depois abra o app no celular)"

setup:
	$(PS) scripts/setup_android.ps1

deps:
	$(PS) scripts/deps.ps1

apk:
	$(PS) scripts/apk.ps1 release

apk-debug:
	$(PS) scripts/apk.ps1 debug

run:
	$(PS) scripts/run.ps1

seed:
	$(PS) scripts/seed.ps1

api:
	$(PS) scripts/api.ps1

doctor:
	@$$env:PATH = 'C:\src\flutter\bin;' + $$env:PATH; if (Test-Path \"$$env:LOCALAPPDATA\Android\Sdk\") { $$env:ANDROID_HOME = \"$$env:LOCALAPPDATA\Android\Sdk\"; $$env:ANDROID_SDK_ROOT = $$env:ANDROID_HOME }; flutter doctor -v

devices:
	$(PS) scripts/devices.ps1

install:
	$(PS) scripts/install_apk.ps1

logcat:
	$(PS) scripts/logcat.ps1

all: setup deps apk

clean:
	@if (Test-Path app\build) { Remove-Item -Recurse -Force app\build }
	@Write-Host "app/build removido."
