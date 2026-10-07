import {Router, type Request, type Response} from 'express';
import {config} from './config.js';
import {DataStore} from './store.js';
import {sendVerificationEmail} from './email.js';
import {sendVerificationSms} from './sms.js';
import {JevClient} from './jev.js';
import {
  normalizePhone,
  sixDigitCode,
  sha256,
  sendError,
  publicUser,
  resolveRole,
} from './util.js';

async function requireAdmin(
  req: Request,
  store: DataStore,
): Promise<{userId: string; user: Record<string, unknown>} | null> {
  const userId = await auth(req, store);
  if (!userId) return null;
  const user = await store.findUserById(userId);
  if (!user || resolveRole(user) !== 'admin') return null;
  return {userId, user};
}

async function auth(req: Request, store: DataStore): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return store.userIdForToken(header.slice(7));
}

export function createRouter(store: DataStore): Router {
  const router = Router();
  const skipEmailVerification = config.skipEmailVerification;
  const skipSmsVerification = config.skipSmsVerification;
  const exposeOtp =
    config.exposeOtpInResponse || store.mode === 'memory';
  const jev = new JevClient(config.jevApiKey);

  /** Alinhado ao login: e-mail, telefone ou skips de ambiente. */
  function accountVerified(user: Record<string, unknown> | null): boolean {
    if (!user) return false;
    return (
      user.emailVerified === true ||
      user.phoneVerified === true ||
      skipEmailVerification ||
      skipSmsVerification
    );
  }

  async function sendOtp(args: {
    channel: string;
    target: string;
    code: string;
  }): Promise<Record<string, unknown>> {
    const {channel, target, code} = args;
    if (channel === 'email') {
      if (skipEmailVerification) {
        return {
          ok: true,
          channel: 'email',
          skipped: true,
          ...(exposeOtp ? {devCode: code} : {}),
        };
      }
      if (!config.emailUser || !config.emailPass) {
        if (!exposeOtp) {
          return {
            error: 'EMAIL_USER/EMAIL_PASS não configurados',
            status: 500,
          };
        }
        console.log(`[EMAIL] SMTP ausente — código para ${target}: ${code}`);
        return {
          ok: true,
          channel: 'email',
          devCode: code,
          hint: 'SMTP não configurado; use devCode em dev',
        };
      }
      try {
        await sendVerificationEmail({
          user: config.emailUser,
          pass: config.emailPass,
          to: target,
          code,
          logoUrl: config.emailLogoUrl || undefined,
        });
      } catch (e) {
        return {error: `falha ao enviar e-mail: ${e}`, status: 500};
      }
    } else {
      if (skipSmsVerification) {
        return {
          ok: true,
          channel: 'phone',
          skipped: true,
          ...(exposeOtp ? {devCode: code} : {}),
        };
      }
      try {
        await sendVerificationSms({
          toE164: target,
          code,
          accountSid: config.twilioSid,
          authToken: config.twilioToken,
          fromNumber: config.twilioFrom,
        });
      } catch (e) {
        return {error: `falha ao enviar SMS: ${e}`, status: 500};
      }
      if (
        exposeOtp &&
        (!config.twilioSid || !config.twilioToken || !config.twilioFrom)
      ) {
        return {
          ok: true,
          channel: 'phone',
          devCode: code,
          hint: 'Twilio não configurado; use devCode em dev',
        };
      }
    }
    return {
      ok: true,
      channel,
      ...(exposeOtp ? {devCode: code} : {}),
    };
  }

  function otpResponse(res: Response, payload: Record<string, unknown>) {
    if (payload.error != null) {
      return sendError(
        res,
        Number(payload.status ?? 400),
        String(payload.error),
      );
    }
    return res.json(payload);
  }

  router.get('/health', (_req, res) => {
    res.json({ok: true, store: store.mode});
  });

  router.post('/auth/register', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(body.password ?? '');
    const displayName = String(body.displayName ?? 'Fiscal').trim();
    const phone = normalizePhone(body.phone as string | undefined);
    const uf = String(body.uf ?? '').trim() || undefined;
    const city = String(body.city ?? '').trim() || undefined;
    if (!email || password.length < 6) {
      return sendError(res, 400, 'email/password inválidos');
    }
    if (!phone || phone.length < 12) {
      return sendError(res, 400, 'telefone inválido (use DDD + número)');
    }
    if (await store.findUser(email)) {
      return sendError(res, 409, 'usuário já existe');
    }
    if (await store.findUserByPhone(phone)) {
      return sendError(res, 409, 'telefone já cadastrado');
    }
    const code = sixDigitCode();
    const user = await store.createUser({
      email,
      phone,
      passwordHash: sha256(password),
      displayName: displayName || email.split('@')[0] || 'Fiscal',
      uf,
      city,
      emailVerified: skipEmailVerification,
      // Confirmação do produto é por e-mail; celular fica só como contato.
      phoneVerified: true,
      verificationCodeHash: sha256(code),
    });
    const needsVerification =
      !skipEmailVerification && user.emailVerified !== true;

    let delivery: Record<string, unknown> = {ok: true};
    if (!skipEmailVerification) {
      delivery = await sendOtp({channel: 'email', target: email, code});
      if (delivery.error != null) return otpResponse(res, delivery);
    } else if (exposeOtp) {
      delivery = {ok: true, devCode: code, skipped: true, channel: 'email'};
    }

    return res.json({
      ok: true,
      userId: user.id,
      email,
      phone,
      needsVerification,
      ...(!needsVerification ? {token: user.token} : {}),
      ...(delivery.devCode != null ? {devCode: delivery.devCode} : {}),
      ...(delivery.hint != null ? {hint: delivery.hint} : {}),
      otpChannel: 'email',
    });
  });

  router.post('/auth/verify', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    const phone = normalizePhone(body.phone as string | undefined);
    const code = String(body.code ?? '').trim();
    if (!code) return sendError(res, 400, 'código obrigatório');
    const result = await store.verifyOtp({
      email: email || null,
      phone,
      codeHash: sha256(code),
      markEmail: email.length > 0,
      markPhone: phone != null,
    });
    if (result.error != null) {
      return sendError(res, Number(result.status ?? 400), String(result.error));
    }
    return res.json(result);
  });

  router.post('/auth/resend-code', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    const phone = normalizePhone(body.phone as string | undefined);
    // Canal padrão do produto: e-mail (SMS só se pedido explicitamente).
    const channel = String(body.channel ?? 'email').toLowerCase();
    const code = sixDigitCode();
    const setResult = await store.setVerificationCodeFor({
      email: email || null,
      phone,
      codeHash: sha256(code),
    });
    if (setResult.error != null) {
      return sendError(
        res,
        Number(setResult.status ?? 400),
        String(setResult.error),
      );
    }
    const target =
      channel === 'phone'
        ? phone ?? String(setResult.phone ?? '')
        : email || String(setResult.email ?? '');
    if (!target) {
      return sendError(res, 400, 'informe o e-mail');
    }
    return otpResponse(
      res,
      await sendOtp({channel, target, code}),
    );
  });

  router.post('/auth/otp/request', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const phone = normalizePhone(body.phone as string | undefined);
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    if (!phone && !email) {
      return sendError(res, 400, 'informe telefone ou e-mail');
    }
    let user: Record<string, unknown> | null;
    if (phone) {
      user = await store.findUserByPhone(phone);
      if (!user) {
        return sendError(res, 404, 'telefone não cadastrado — crie uma conta');
      }
    } else {
      user = await store.findUser(email);
      if (!user) {
        return sendError(res, 404, 'e-mail não cadastrado — crie uma conta');
      }
    }
    const code = sixDigitCode();
    const setResult = await store.setVerificationCodeFor({
      email: user.email as string,
      phone: user.phone as string,
      codeHash: sha256(code),
    });
    if (setResult.error != null) {
      return sendError(
        res,
        Number(setResult.status ?? 400),
        String(setResult.error),
      );
    }
    // Preferência do produto: OTP por e-mail quando ambos vierem.
    const channel = email ? 'email' : 'phone';
    const target = email || phone!;
    return otpResponse(
      res,
      await sendOtp({channel, target, code}),
    );
  });

  router.post('/auth/otp/verify', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const phone = normalizePhone(body.phone as string | undefined);
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    const code = String(body.code ?? '').trim();
    if (!code) return sendError(res, 400, 'código obrigatório');
    const result = await store.verifyOtp({
      email: email || null,
      phone,
      codeHash: sha256(code),
      markEmail: email.length > 0 || phone == null,
      markPhone: phone != null,
    });
    if (result.error != null) {
      return sendError(res, Number(result.status ?? 400), String(result.error));
    }
    return res.json(result);
  });

  router.post('/auth/login', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(body.password ?? '');
    const user = await store.findUser(email);
    if (!user || user.passwordHash !== sha256(password)) {
      return sendError(res, 401, 'credenciais inválidas');
    }
    const verified =
      user.emailVerified === true ||
      user.phoneVerified === true ||
      skipEmailVerification ||
      skipSmsVerification;
    if (!verified) {
      return sendError(
        res,
        403,
        'conta não confirmada — confira o código enviado por e-mail',
      );
    }
    const token = await store.issueToken(String(user.id));
    return res.json(publicUser(user, token));
  });

  router.get('/auth/me', async (req, res) => {
    const userId = await auth(req, store);
    if (!userId) return sendError(res, 401, 'unauthorized');
    const user = await store.findUserById(userId);
    if (!user) return sendError(res, 404, 'usuário não encontrado');
    return res.json(publicUser(user));
  });

  router.post('/sync/push', async (req, res) => {
    const userId = await auth(req, store);
    if (!userId) return sendError(res, 401, 'unauthorized');
    const user = await store.findUserById(userId);
    if (!accountVerified(user)) {
      return sendError(res, 403, 'conta não confirmada — use o código OTP');
    }
    const result = await store.push(userId, req.body as Record<string, unknown>);
    return res.json(result);
  });

  router.get('/sync/pull', async (req, res) => {
    const userId = await auth(req, store);
    if (!userId) return sendError(res, 401, 'unauthorized');
    const sinceRaw = req.query.since as string | undefined;
    const since = sinceRaw
      ? new Date(Number.isNaN(Date.parse(sinceRaw)) ? 0 : sinceRaw)
      : new Date(0);
    const result = await store.pull(userId, since);
    return res.json(result);
  });

  router.post('/votes/check', async (req, res) => {
    const userId = await auth(req, store);
    if (!userId) return sendError(res, 401, 'unauthorized');
    const user = await store.findUserById(userId);
    if (!accountVerified(user)) {
      return sendError(res, 403, 'conta não confirmada — use o código OTP');
    }
    const body = req.body as Record<string, unknown>;
    const priceLogId = String(body.priceLogId ?? '');
    const vote = String(body.vote ?? '');
    const withPhoto = body.withPhoto === true;
    let weight = body.weight != null ? Number(body.weight) : undefined;
    if (weight == null || Number.isNaN(weight)) {
      weight = await store.userVoteWeight(userId);
    }
    if (withPhoto) weight += 0.5;
    if (!priceLogId || (vote !== 'confirm' && vote !== 'reject')) {
      return sendError(res, 400, 'priceLogId/vote inválidos');
    }
    const result = await store.castVote({
      userId,
      priceLogId,
      vote,
      weight,
      withPhoto,
    });
    if (result.error != null) {
      return sendError(res, Number(result.status ?? 400), String(result.error));
    }
    return res.json(result);
  });

  router.get('/prices/:id/trust', async (req, res) => {
    const userId = await auth(req, store);
    if (!userId) return sendError(res, 401, 'unauthorized');
    const trust = await store.trustFor(req.params.id);
    if (!trust) return sendError(res, 404, 'price log não encontrado');
    return res.json(trust);
  });

  router.get('/markets/map', async (req, res) => {
    const lat =
      req.query.lat != null ? Number(req.query.lat) : undefined;
    const lng =
      req.query.lng != null ? Number(req.query.lng) : undefined;
    const radiusKm =
      req.query.radiusKm != null ? Number(req.query.radiusKm) : undefined;
    const markets = await store.marketsForMap({lat, lng, radiusKm});
    return res.json({markets});
  });

  router.post('/markets/:id/reviews', async (req, res) => {
    const userId = await auth(req, store);
    if (!userId) return sendError(res, 401, 'unauthorized');
    const user = await store.findUserById(userId);
    if (!accountVerified(user)) {
      return sendError(res, 403, 'conta não confirmada — use o código OTP');
    }
    const body = req.body as Record<string, unknown>;
    const stars = Number(body.stars ?? 0);
    if (stars < 1 || stars > 5) return sendError(res, 400, 'stars 1–5');
    const result = await store.upsertMarketReview({
      marketId: req.params.id,
      userId,
      stars,
      comment: body.comment as string | undefined,
    });
    if (result.error != null) {
      return sendError(res, Number(result.status ?? 400), String(result.error));
    }
    return res.json(result);
  });

  router.get('/markets/:id/reviews', async (req, res) => {
    const reviews = await store.listMarketReviews(req.params.id);
    return res.json({reviews});
  });

  router.post('/markets/suggestions', async (req, res) => {
    const userId = await auth(req, store);
    if (!userId) return sendError(res, 401, 'unauthorized');
    const user = await store.findUserById(userId);
    if (!accountVerified(user)) {
      return sendError(res, 403, 'conta não confirmada — use o código OTP');
    }
    const body = req.body as Record<string, unknown>;
    const name = String(body.name ?? '').trim();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const kindRaw = String(body.kind ?? 'add');
    const kind =
      kindRaw === 'fix' || kindRaw === 'confirm' ? kindRaw : 'add';
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return sendError(res, 400, 'name/lat/lng obrigatórios');
    }
    const suggestion = await store.createMarketSuggestion({
      userId,
      name,
      lat,
      lng,
      address: body.address != null ? String(body.address) : null,
      cnpj: body.cnpj != null ? String(body.cnpj) : null,
      kind,
      targetMarketId:
        body.targetMarketId != null ? String(body.targetMarketId) : null,
      note: body.note != null ? String(body.note) : null,
    });
    return res.json({suggestion});
  });

  router.get('/admin/market-suggestions', async (req, res) => {
    const admin = await requireAdmin(req, store);
    if (!admin) return sendError(res, 403, 'admin only');
    const status =
      typeof req.query.status === 'string' ? req.query.status : 'pending';
    const suggestions = await store.listMarketSuggestions(status);
    return res.json({suggestions});
  });

  router.post('/admin/market-suggestions/:id/resolve', async (req, res) => {
    const admin = await requireAdmin(req, store);
    if (!admin) return sendError(res, 403, 'admin only');
    const body = req.body as Record<string, unknown>;
    const approve = body.approve === true || body.approve === 'true';
    const result = await store.resolveMarketSuggestion({
      id: req.params.id,
      approve,
      adminUserId: admin.userId,
    });
    if (!result.ok) {
      return sendError(res, 400, result.error ?? 'falha ao resolver');
    }
    return res.json(result);
  });

  router.get('/me/prefs', async (req, res) => {
    const userId = await auth(req, store);
    if (!userId) return sendError(res, 401, 'unauthorized');
    const prefs = await store.getUserPrefs(userId);
    return res.json(prefs);
  });

  router.put('/me/prefs', async (req, res) => {
    const userId = await auth(req, store);
    if (!userId) return sendError(res, 401, 'unauthorized');
    const prefs = await store.setUserPrefs(
      userId,
      req.body as Record<string, unknown>,
    );
    return res.json(prefs);
  });

  router.get('/me/reputation', async (req, res) => {
    const userId = await auth(req, store);
    if (!userId) return sendError(res, 401, 'unauthorized');
    const rep = await store.getReputation(userId);
    return res.json(rep);
  });

  router.post('/compare/basket', async (req, res) => {
    const userId = await auth(req, store);
    if (!userId) return sendError(res, 401, 'unauthorized');
    const result = await store.compareBasket(
      userId,
      req.body as Record<string, unknown>,
    );
    return res.json(result);
  });

  router.get('/prices/community', async (req, res) => {
    const userId = await auth(req, store);
    if (!userId) return sendError(res, 401, 'unauthorized');
    const productName = req.query.productName as string | undefined;
    const city = req.query.city as string | undefined;
    const result = await store.communityPrices({productName, city});
    return res.json({prices: result});
  });

  router.get('/admin/markets', async (req, res) => {
    const admin = await requireAdmin(req, store);
    if (!admin) return sendError(res, 403, 'admin only');
    const markets = await store.adminListMarkets();
    return res.json(markets);
  });

  router.post('/admin/markets', async (req, res) => {
    const admin = await requireAdmin(req, store);
    if (!admin) return sendError(res, 403, 'admin only');
    const body = req.body as Record<string, unknown>;
    const name = String(body.name ?? '').trim();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return sendError(res, 400, 'name/lat/lng obrigatórios');
    }
    const market = await store.adminUpsertMarket({
      id: body.id != null ? String(body.id) : null,
      name,
      lat,
      lng,
      address: body.address != null ? String(body.address) : null,
      cnpj: body.cnpj != null ? String(body.cnpj) : null,
      city: body.city != null ? String(body.city) : null,
      uf: body.uf != null ? String(body.uf) : null,
    });
    return res.json(market);
  });

  router.delete('/admin/markets/:id', async (req, res) => {
    const admin = await requireAdmin(req, store);
    if (!admin) return sendError(res, 403, 'admin only');
    const ok = await store.adminDeleteMarket(req.params.id);
    if (!ok) return sendError(res, 404, 'mercado não encontrado');
    return res.json({ok: true});
  });

  store.attachJev(jev);

  return router;
}
