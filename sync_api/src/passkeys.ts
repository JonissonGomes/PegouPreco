import {Router, type Request} from 'express';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/types';
import {config} from './config.js';
import {DataStore} from './store.js';
import {publicUser, sendError} from './util.js';

const CHALLENGE_MS = 5 * 60 * 1000;

function androidOrigin(fingerprint: string): string {
  const hex = fingerprint.replace(/:/g, '');
  const hash = Buffer.from(hex, 'hex').toString('base64url');
  return `android:apk-key-hash:${hash}`;
}

function expectedOrigins(): string[] {
  return [
    `https://${config.passkeyRpId}`,
    ...config.passkeySha256.map(androidOrigin),
  ];
}

function assetLinks() {
  return config.passkeySha256.map(fingerprint => ({
    relation: [
      'delegate_permission/common.handle_all_urls',
      'delegate_permission/common.get_login_creds',
    ],
    target: {
      namespace: 'android_app',
      package_name: 'com.pegoupreco',
      sha256_cert_fingerprints: [fingerprint],
    },
  }));
}

async function bearerUserId(
  req: Request,
  store: DataStore,
): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return store.userIdForToken(header.slice('Bearer '.length).trim());
}

function challengeFrom(clientDataJSON: string): string {
  const json = JSON.parse(
    Buffer.from(clientDataJSON, 'base64url').toString('utf8'),
  ) as {challenge?: string};
  return String(json.challenge ?? '');
}

export function mountPasskeyRoutes(router: Router, store: DataStore): void {
  router.get('/.well-known/assetlinks.json', (_req, res) => {
    res.type('application/json').json(assetLinks());
  });

  router.post('/auth/passkey/register/options', async (req, res) => {
    const userId = await bearerUserId(req, store);
    if (!userId) return sendError(res, 401, 'unauthorized');
    const user = await store.findUserById(userId);
    if (!user) return sendError(res, 404, 'usuário não encontrado');
    const existing = Array.isArray(user.passkeys)
      ? (user.passkeys as {id?: string}[])
      : [];
    const options = await generateRegistrationOptions({
      rpName: config.passkeyRpName,
      rpID: config.passkeyRpId,
      userName: String(user.email ?? userId),
      userDisplayName: String(user.displayName ?? user.email ?? 'Fiscal'),
      userID: new TextEncoder().encode(userId),
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      excludeCredentials: existing
        .filter(item => item.id)
        .map(item => ({id: String(item.id)})),
    });
    await store.saveWebauthnChallenge({
      challenge: options.challenge,
      userId,
      expiresAt: new Date(Date.now() + CHALLENGE_MS).toISOString(),
    });
    return res.json(options);
  });

  router.post('/auth/passkey/register/verify', async (req, res) => {
    const userId = await bearerUserId(req, store);
    if (!userId) return sendError(res, 401, 'unauthorized');
    const body = req.body as RegistrationResponseJSON;
    if (!body?.response?.clientDataJSON) {
      return sendError(res, 400, 'resposta de passkey inválida');
    }
    const challenge = challengeFrom(body.response.clientDataJSON);
    const saved = await store.consumeWebauthnChallenge(challenge);
    if (!saved || saved.userId !== userId) {
      return sendError(res, 400, 'desafio de passkey expirado');
    }
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge: challenge,
        expectedOrigin: expectedOrigins(),
        expectedRPID: config.passkeyRpId,
        requireUserVerification: true,
      });
    } catch {
      return sendError(res, 400, 'não foi possível confirmar a passkey');
    }
    if (!verification.verified || !verification.registrationInfo) {
      return sendError(res, 400, 'não foi possível confirmar a passkey');
    }
    const cred = verification.registrationInfo.credential;
    await store.upsertPasskey(userId, {
      id: cred.id,
      publicKey: Buffer.from(cred.publicKey).toString('base64url'),
      counter: cred.counter,
      transports: cred.transports ?? [],
    });
    return res.json({ok: true});
  });

  router.post('/auth/passkey/disable', async (req, res) => {
    const userId = await bearerUserId(req, store);
    if (!userId) return sendError(res, 401, 'unauthorized');
    await store.clearPasskeys(userId);
    return res.json({ok: true, hasPasskey: false});
  });

  router.post('/auth/passkey/login/options', async (_req, res) => {
    const options = await generateAuthenticationOptions({
      rpID: config.passkeyRpId,
      userVerification: 'required',
    });
    await store.saveWebauthnChallenge({
      challenge: options.challenge,
      userId: null,
      expiresAt: new Date(Date.now() + CHALLENGE_MS).toISOString(),
    });
    return res.json(options);
  });

  router.post('/auth/passkey/login/verify', async (req, res) => {
    const body = req.body as AuthenticationResponseJSON;
    if (!body?.id || !body.response?.clientDataJSON) {
      return sendError(res, 400, 'resposta de passkey inválida');
    }
    const challenge = challengeFrom(body.response.clientDataJSON);
    const saved = await store.consumeWebauthnChallenge(challenge);
    if (!saved) return sendError(res, 400, 'desafio de passkey expirado');
    const user = await store.findUserByCredentialId(body.id);
    const list = Array.isArray(user?.passkeys)
      ? (user?.passkeys as Record<string, unknown>[])
      : [];
    const cred = list.find(item => item.id === body.id);
    if (!user || !cred) {
      return sendError(res, 401, 'passkey não reconhecida');
    }
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: challenge,
        expectedOrigin: expectedOrigins(),
        expectedRPID: config.passkeyRpId,
        requireUserVerification: true,
        credential: {
          id: String(cred.id),
          publicKey: new Uint8Array(
            Buffer.from(String(cred.publicKey ?? ''), 'base64url'),
          ),
          counter: Number(cred.counter ?? 0),
          transports: cred.transports as never,
        },
      });
    } catch {
      return sendError(res, 401, 'passkey não reconhecida');
    }
    if (!verification.verified) {
      return sendError(res, 401, 'passkey não reconhecida');
    }
    await store.upsertPasskey(String(user.id), {
      ...cred,
      counter: verification.authenticationInfo.newCounter,
    });
    const issued = await store.issueToken(String(user.id));
    return res.json(
      publicUser(
        {...user, tokenExpiresAt: issued.tokenExpiresAt},
        issued.token,
      ),
    );
  });
}
