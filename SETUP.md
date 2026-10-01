# PegouPreço — setup do zero (Windows)

Você **não precisa** aprender Android Studio. O `Makefile` faz quase tudo.
Só existe **um** momento opcional em que o Studio precisa abrir uma vez para criar a pasta do SDK.

## Comandos (na pasta do projeto)

Abra o PowerShell em `c:\Users\pineapple\Documents\FeiraSegura` e rode:

```powershell
make help
make setup
make deps
make apk
```

Ou, para abrir o app no emulador/celular:

```powershell
make run
```

(Em outro terminal, se quiser sync:)

```powershell
make api
```

## O que cada alvo faz

| Comando | Faz o quê |
|---------|-----------|
| `make setup` | Instala Android Studio (winget), SDK, platform 34, licenças |
| `make deps` | Baixa pacotes Flutter, gera código Isar e ícones |
| `make apk` | Gera `app\build\app\outputs\flutter-apk\app-release.apk` |
| `make run` | Cria/inicia emulador se precisar e roda o app |
| `make api` | Sobe a API de sync na porta 8080 |
| `make doctor` | Mostra se Flutter/Android estão ok |

## Se `make setup` pedir para abrir o Android Studio

1. Abra **Android Studio** pelo menu Iniciar.
2. Se aparecer um assistente: escolha **Standard** → **Finish** / **Next** até o fim.
3. Espere baixar o que ele pedir (pode demorar).
4. Feche o Android Studio.
5. Volte ao PowerShell e rode de novo:

```powershell
make setup
```

Pronto — daí em diante é só `make deps` e `make apk` / `make run`.

## Instalar o APK no celular

Depois de `make apk`, o arquivo fica em:

`app\build\app\outputs\flutter-apk\app-release.apk`

(Se o build falhar por `isar_flutter_libs` / namespace, rode `make deps` e depois `make apk` de novo — o patch é automático.)

No celular, abra o arquivo e permita instalar. Ou, com USB + depuração:

```powershell
adb install -r app\build\app\outputs\flutter-apk\app-release.apk
```

## Sem `make`?

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup_android.ps1
powershell -ExecutionPolicy Bypass -File scripts\deps.ps1
powershell -ExecutionPolicy Bypass -File scripts\apk.ps1
```
