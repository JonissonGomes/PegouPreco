# PegouPreço (React Native)

App **offline-first** para registrar preços (OCR de etiquetas + QR de NFC-e), montar carrinho com cálculo atacado/varejo e sincronizar via MongoDB Atlas (tier gratuito M0).

## Estrutura

```
PegouPreço/
  mobile/      # App React Native CLI (Android + iOS)
  sync_api/    # API Node/TypeScript (Express) — ponte segura até o Atlas
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
| Sync | `sync_api` (Express/TS) + LWW |

## Começar

```powershell
make deps     # npm install em mobile/
make run      # emulador/device Android (New Architecture)
make apk      # APK release (arm64-v8a)
make api         # sync_api na porta 8080
make test        # testes de domínio
```

No Windows, o primeiro build New Arch pode exigir Ninja ≥ 1.12 (o `make run` / `make apk` atualizam automaticamente). Se o Gradle cair por falta de memória, feche outros processos Java e rode de novo.

### Variáveis (`mobile/.env`)

```env
# Mesmo valor de REACT_APP_MAPBOX_ACCESS_TOKEN do ResenhaFC
MAPBOX_ACCESS_TOKEN=
# Emulador: http://10.0.2.2:8080
# Device USB: http://127.0.0.1:8080  (make api / make run fazem adb reverse)
SYNC_API_BASE=http://127.0.0.1:8080
```

`react-native-config` embute o `.env` no build nativo: depois de alterar `SYNC_API_BASE` ou o token, rode `make run` (ou reinstale o APK). Só reiniciar o Metro não atualiza.

**Importante:** `10.0.2.2` só funciona no emulador. Em celular USB use `127.0.0.1:8080` + `adb reverse tcp:8080 tcp:8080` (já feito por `make api` / `make run`). Na mesma Wi‑Fi, use o IP LAN do PC.
## sync_api

```bash
cd sync_api
cp .env.example .env
npm install
npm start
```

Admin (CRUD de supermercados no app): no `sync_api/.env` defina

```env
ADMIN_EMAILS=seu@email.com
```

Contas com esse e-mail recebem `role=admin` no login e veem **Admin · Mercados** no Perfil.

## Módulos

1. **Captura** — OCR com campos mapeados (Produto / Varejo / Atacado / Qtd mín.) + NFC-e SEFAZ  
2. **Carrinho** — lista ativa, editar item, finalizar, economia atacado/varejo  
3. **Mapa** — GPS + pins de mercados (Mapbox se token; senão OSM)  
4. **Comparar** — busca, hoje no mercado, menor/média/maior, histórico  
5. **Perfil** — auth + sync  

## Branding

- Nome: **PegouPreço**
- Cores: amarelo `#FFD400`, navy `#0B2A6B`, ciano `#00C2FF`
