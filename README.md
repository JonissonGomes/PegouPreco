# PegouPreço (MVP)

App Flutter **offline-first** para registrar preços (OCR de etiquetas + QR de NFC-e), montar carrinho com cálculo atacado/varejo e sincronizar preços compartilhados via MongoDB Atlas (tier gratuito M0).

## Estrutura

```
PegouPreço/
  app/         # App Flutter (Android + iOS)
  sync_api/    # API Dart (Shelf) — ponte segura até o Atlas
  README.md
```

## Stack (100% gratuita no MVP)

| Camada | Tecnologia |
|--------|------------|
| Mobile | Flutter |
| DB local | Isar 3.x |
| OCR | Google ML Kit Text Recognition (on-device) |
| QR | mobile_scanner |
| Rede | connectivity_plus + http |
| Nuvem | MongoDB Atlas **M0** (free) |
| Sync | `sync_api` própria (Shelf) + LWW |

Sem APIs fiscais pagas: a NFC-e é buscada **direto no aparelho** pela URL do QR (SEFAZ).

## Começar do zero (recomendado)

Guia curto: **[SETUP.md](SETUP.md)**

Na raiz do projeto:

```powershell
make setup    # Android Studio/SDK + licenças (só na 1ª vez)
make deps     # dependências do app
make apk      # gera o APK
# ou:
make run      # sobe emulador e abre o app
make seed     # abre o app com banco demo (mercados, preços, carrinho, listas)
```

Se o Flutter não estiver no PATH, o projeto usa `C:\src\flutter\bin`.

## App Flutter (manual)

```bash
cd app
flutter pub get
dart run build_runner build --delete-conflicting-outputs
dart run flutter_launcher_icons
flutter test
flutter run
```

### URL da sync_api

Por padrão o app aponta para o emulador Android (`10.0.2.2:8080`):

```bash
flutter run --dart-define=SYNC_API_BASE=http://10.0.2.2:8080
```

Em dispositivo físico na mesma rede:

```bash
flutter run --dart-define=SYNC_API_BASE=http://SEU_IP_LAN:8080
```

## sync_api

```bash
cd sync_api
cp .env.example .env
# Edite MONGODB_URI ou deixe vazio para store em memória (dev)
dart pub get
dart run bin/server.dart
```

Endpoints:

- `GET /health`
- `POST /auth/register` `{ "email", "password" }`
- `POST /auth/login` `{ "email", "password" }`
- `POST /sync/push` (Bearer) — lotes de products/markets/priceLogs
- `GET /sync/pull?since=ISO` (Bearer) — dados compartilhados (LWW)

Credenciais do Atlas ficam **somente** no `.env` da API — nunca no app.

## Módulos do MVP

1. **Vision** — câmera com guia; OCR de etiqueta; QR NFC-e → `pending_receipts` → fetch SEFAZ → **lista de conferência** antes de salvar  
2. **Carrinho** — qtd, check-off, preço efetivo atacado/varejo, subtotal e economia  
3. **Histórico** — Isar + fuzzy (Levenshtein); menor/último/média  
4. **Sync** — fila offline, worker com `connectivity_plus`, push/pull compartilhado  

## Branding

- Nome: **PegouPreço**
- Ícone/logo: `app/assets/branding/`
- Cores: amarelo `#FFD400`, navy `#0B2A6B`, ciano `#00C2FF`

## Notas SEFAZ

Layouts HTML variam por UF e alguns portais usam CAPTCHA. O parser é genérico (tabelas + regex `Qtd x Unit = Total`). Em falha, a nota fica `failed` na fila e o usuário pode usar OCR de etiqueta ou edição manual na conferência.
