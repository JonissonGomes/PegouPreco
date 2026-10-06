# PegouPreço — React Native (make + PowerShell)
# Uso tipico:
#   make deps
#   make run
#   make seed
#   make seed-clear

SHELL := powershell.exe
.SHELLFLAGS := -NoProfile -ExecutionPolicy Bypass -Command
PS := powershell -NoProfile -ExecutionPolicy Bypass -File

.PHONY: help deps run seed seed-clear api test apk clean devices

help:
	@Write-Host "Alvos disponiveis:" -ForegroundColor Cyan
	@Write-Host "  make deps        npm install no mobile/"
	@Write-Host "  make run         Sobe o app React Native (Android)"
	@Write-Host "  make seed        Popula banco demo (mercados com geo, precos, carrinho)"
	@Write-Host "  make seed-clear  Remove dados inseridos pelo seed (preserva auth)"
	@Write-Host "  make test        Testes unitarios (labelParser, pricing, nfce)"
	@Write-Host "  make apk         Gera APK release (arm64-v8a)"
	@Write-Host "  make api         Sobe a sync_api (porta 8080)"
	@Write-Host "  make devices     Lista aparelhos adb"
	@Write-Host "  make clean       Limpa build Android"

deps:
	$(PS) scripts/rn_deps.ps1

run:
	$(PS) scripts/rn_run.ps1

seed:
	$(PS) scripts/rn_seed.ps1

seed-clear:
	$(PS) scripts/rn_seed_clear.ps1

test:
	@Set-Location mobile; npm test -- --passWithNoTests

apk:
	$(PS) scripts/rn_apk.ps1

api:
	$(PS) scripts/api.ps1

devices:
	$(PS) scripts/devices.ps1

clean:
	@if (Test-Path mobile\android\app\build) { Remove-Item -Recurse -Force mobile\android\app\build }
	@Write-Host "mobile/android/app/build removido."
