# PegouPreço (React Native)

App **offline-first** para registrar preços (OCR de etiquetas + QR de NFC-e), montar carrinho com cálculo atacado/varejo e sincronizar via MongoDB Atlas (tier gratuito M0).

## Estrutura

```
PegouPreço/
  mobile/      # App React Native CLI (Android + iOS)
  sync_api/    # API Dart (Shelf) — ponte segura até o Atlas
  README.md
```

## Stack

| Camada | Tecnologia |
|--------|------------|
| Mobile | React Native 0.76 (CLI / TypeScript) |
| Estado | Zustand |
| Persistência | AsyncStorage (store tipado offline) |
| OCR | Vision Camera + ML Kit Text Recognition |
| Mapa | WebView + Leaflet (tiles Mapbox ResenhaFC ou OSM) |
| GPS | react-native-geolocation-service |
| Rede | axios + react-native-config |
| Nuvem | MongoDB Atlas **M0** (free) |
| Sync | `sync_api` (Shelf) + LWW |

## Começar

```powershell
make deps     # npm install em mobile/
make run      # emulador/device Android (New Architecture)
make apk      # APK release (arm64-v8a)
make seed        # banco demo (mercados com geo, preços, carrinho, listas)
make seed-clear  # remove dados do seed (preserva login)
make api         # sync_api na porta 8080
make test        # testes de domínio
```

No Windows, o primeiro build New Arch pode exigir Ninja ≥ 1.12 (o `make run` / `make apk` atualizam automaticamente). Se o Gradle cair por falta de memória, feche outros processos Java e rode de novo.

### Variáveis (`mobile/.env`)

```env
# Mesmo valor de REACT_APP_MAPBOX_ACCESS_TOKEN do ResenhaFC
MAPBOX_ACCESS_TOKEN=
SYNC_API_BASE=http://10.0.2.2:8080
SEED_DEMO=false
CLEAR_SEED_DEMO=false
```

`react-native-config` embute o `.env` no build nativo: depois de alterar o token, rode `make run` (ou reinstale o APK). Só reiniciar o Metro não atualiza.

Em dispositivo físico na mesma rede:

```env
SYNC_API_BASE=http://SEU_IP_LAN:8080
```

## sync_api

```bash
cd sync_api
cp .env.example .env
dart pub get
dart run bin/server.dart
```

## Módulos

1. **Captura** — OCR com campos mapeados (Produto / Varejo / Atacado / Qtd mín.) + NFC-e SEFAZ  
2. **Carrinho** — lista ativa, editar item, finalizar, economia atacado/varejo  
3. **Mapa** — GPS + pins de mercados (Mapbox se token; senão OSM)  
4. **Comparar** — busca, hoje no mercado, menor/média/maior, histórico  
5. **Perfil** — auth + sync  

## Branding

- Nome: **PegouPreço**
- Cores: amarelo `#FFD400`, navy `#0B2A6B`, ciano `#00C2FF`
