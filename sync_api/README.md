# PegouPreço sync_api

API Express (TypeScript) para auth + sync LWW com MongoDB Atlas M0 (ou memória em dev).

```bash
cp .env.example .env
npm install
npm start
```

Desenvolvimento com reload:

```bash
npm run dev
```

Ou pela raiz do monorepo: `make api`.

### Auth

- `POST /auth/register` — e-mail + senha + **telefone** (obrigatório); envia OTP (SMS preferencial)
- `POST /auth/verify` — confirma código (e-mail e/ou telefone)
- `POST /auth/login` — e-mail + senha
- `POST /auth/otp/request` — pede OTP por telefone (ou e-mail)
- `POST /auth/otp/verify` — login sem senha via OTP
- `POST /auth/resend-code` — reenvio

Sem Twilio/SMTP em store memory, a API devolve `devCode` no JSON (e loga no console) para testes locais.

Ver [../README.md](../README.md) para integração com o app.
