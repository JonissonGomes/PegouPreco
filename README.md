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
| Mapa | react-native-maps + tiles Mapbox (token ResenhaFC) ou OSM |
| GPS | react-native-geolocation-service |
| Rede | axios + react-native-config |
| Nuvem | MongoDB Atlas **M0** (free) |
| Sync | `sync_api` (Shelf) + LWW |

## Começar

```powershell
make deps     # npm install em mobile/
make run      # emulador/device Android
make seed     # banco demo (mercados, preços, carrinho, listas)
make api      # sync_api na porta 8080
make test     # testes de domínio
```

### Variáveis (`mobile/.env`)

```env
# Mesmo valor de REACT_APP_MAPBOX_ACCESS_TOKEN do ResenhaFC
MAPBOX_ACCESS_TOKEN=
SYNC_API_BASE=http://10.0.2.2:8080
SEED_DEMO=false
```

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
