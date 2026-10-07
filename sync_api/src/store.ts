import {Db, Collection, MongoClient} from 'mongodb';
import {v4 as uuidv4} from 'uuid';
import {JevClient} from './jev.js';
import {sha256} from './util.js';

type MemMap = Record<string, Record<string, unknown>>;

export class DataStore {
  readonly mode: 'memory' | 'mongo';
  private readonly db?: Db;
  private readonly client?: MongoClient;

  private readonly _memUsers: MemMap = {};
  private readonly _memTokens: Record<string, string> = {};
  private readonly _memProducts: MemMap = {};
  private readonly _memMarkets: MemMap = {};
  private readonly _memLogs: MemMap = {};
  private readonly _memShoppingLists: MemMap = {};
  private readonly _memVotes: MemMap = {};
  private readonly _memReputation: MemMap = {};
  private readonly _memReviews: MemMap = {};
  private readonly _memPrefs: MemMap = {};
  private _jev?: JevClient;

  private constructor(mode: 'memory' | 'mongo', db?: Db, client?: MongoClient) {
    this.mode = mode;
    this.db = db;
    this.client = client;
  }

  static async open({
    mongoUri,
    dbName,
  }: {
    mongoUri?: string | null;
    dbName: string;
  }): Promise<DataStore> {
    if (!mongoUri?.trim()) {
      console.log('MONGODB_URI ausente — usando store em memória (dev).');
      return new DataStore('memory');
    }
    const client = new MongoClient(mongoUri);
    await client.connect();
    console.log(`Conectado ao MongoDB (${dbName})`);
    const db = client.db(dbName);
    return new DataStore('mongo', db, client);
  }

  private col(name: string): Collection {
    return this.db!.collection(name);
  }

  attachJev(client: JevClient): void {
    this._jev = client;
  }

  async userVoteWeight(userId: string): Promise<number> {
    return this._userWeight(userId);
  }

  async findUser(email: string): Promise<Record<string, unknown> | null> {
    if (this.mode === 'memory') {
      for (const u of Object.values(this._memUsers)) {
        if (u.email === email) return u;
      }
      return null;
    }
    const doc = await this.col('users').findOne({email});
    return doc as Record<string, unknown> | null;
  }

  async findUserByPhone(phone: string): Promise<Record<string, unknown> | null> {
    if (this.mode === 'memory') {
      for (const u of Object.values(this._memUsers)) {
        if (u.phone === phone) return u;
      }
      return null;
    }
    const doc = await this.col('users').findOne({phone});
    return doc as Record<string, unknown> | null;
  }

  async createUser(args: {
    email: string;
    phone?: string | null;
    passwordHash: string;
    displayName: string;
    uf?: string | null;
    city?: string | null;
    emailVerified: boolean;
    phoneVerified?: boolean;
    verificationCodeHash: string;
  }): Promise<Record<string, unknown>> {
    const id = uuidv4();
    const token = uuidv4();
    const now = new Date();
    const doc: Record<string, unknown> = {
      id,
      email: args.email,
      phone: args.phone,
      passwordHash: args.passwordHash,
      displayName: args.displayName,
      uf: args.uf,
      city: args.city,
      emailVerified: args.emailVerified,
      phoneVerified: args.phoneVerified ?? false,
      verificationCodeHash: args.verificationCodeHash,
      verificationExpiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
      token,
      createdAt: now.toISOString(),
    };
    if (this.mode === 'memory') {
      this._memUsers[id] = doc;
      this._memTokens[token] = id;
      return doc;
    }
    await this.col('users').insertOne(doc);
    return doc;
  }

  async findUserById(id: string): Promise<Record<string, unknown> | null> {
    if (this.mode === 'memory') return this._memUsers[id] ?? null;
    const doc = await this.col('users').findOne({id});
    return doc as Record<string, unknown> | null;
  }

  async verifyOtp(args: {
    email?: string | null;
    phone?: string | null;
    codeHash: string;
    markEmail?: boolean;
    markPhone?: boolean;
  }): Promise<Record<string, unknown>> {
    const markEmail = args.markEmail ?? false;
    const markPhone = args.markPhone ?? false;
    let user: Record<string, unknown> | null = null;
    if (args.phone) user = await this.findUserByPhone(args.phone);
    if (!user && args.email) user = await this.findUser(args.email);
    if (!user) return {error: 'usuário não encontrado', status: 404};

    const attempts = Number(user.verifyAttempts ?? 0);
    if (attempts >= 5) {
      return {error: 'muitas tentativas — peça um novo código', status: 429};
    }
    const exp = Date.parse(String(user.verificationExpiresAt ?? ''));
    if (!Number.isNaN(exp) && Date.now() > exp) {
      return {error: 'código expirado', status: 400};
    }
    if (user.verificationCodeHash !== args.codeHash) {
      user.verifyAttempts = attempts + 1;
      const uid = String(user.id);
      if (this.mode === 'memory') {
        this._memUsers[uid] = user;
      } else {
        await this.col('users').replaceOne({id: user.id}, user);
      }
      return {error: 'código inválido', status: 400};
    }
    if (markEmail) user.emailVerified = true;
    if (markPhone) user.phoneVerified = true;
    if (markPhone) user.emailVerified = true;
    if (markEmail) user.phoneVerified = user.phoneVerified === true;
    user.verificationCodeHash = null;
    user.verifyAttempts = 0;
    const token = await this.issueToken(String(user.id));
    const uid = String(user.id);
    if (this.mode === 'memory') {
      this._memUsers[uid] = user;
    } else {
      await this.col('users').replaceOne({id: user.id}, user);
    }
    return {
      token,
      userId: user.id,
      email: user.email,
      phone: user.phone,
      displayName: user.displayName ?? 'Fiscal',
      emailVerified: user.emailVerified === true,
      phoneVerified: user.phoneVerified === true,
      uf: user.uf,
      city: user.city,
    };
  }

  async setVerificationCodeFor(args: {
    email?: string | null;
    phone?: string | null;
    codeHash: string;
  }): Promise<Record<string, unknown>> {
    let user: Record<string, unknown> | null = null;
    if (args.phone) user = await this.findUserByPhone(args.phone);
    if (!user && args.email) user = await this.findUser(args.email);
    if (!user) return {error: 'usuário não encontrado', status: 404};

    const lastMs = Date.parse(String(user.lastCodeSentAt ?? ''));
    if (!Number.isNaN(lastMs) && Date.now() - lastMs < 60_000) {
      return {error: 'aguarde 60s para reenviar', status: 429};
    }
    const now = new Date();
    user.verificationCodeHash = args.codeHash;
    user.verificationExpiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    user.lastCodeSentAt = now.toISOString();
    user.verifyAttempts = 0;
    const uid = String(user.id);
    if (this.mode === 'memory') {
      this._memUsers[uid] = user;
    } else {
      await this.col('users').replaceOne({id: user.id}, user);
    }
    return {ok: true, email: user.email, phone: user.phone};
  }

  async listMarketReviews(marketId: string): Promise<Record<string, unknown>[]> {
    let reviews: Record<string, unknown>[];
    if (this.mode === 'memory') {
      reviews = Object.values(this._memReviews).filter(
        (r) => r.marketId === marketId,
      );
    } else {
      reviews = (await this.col('market_reviews')
        .find({marketId})
        .toArray()) as Record<string, unknown>[];
    }
    return reviews.map((r) => ({
      stars: r.stars,
      createdAt: r.createdAt,
      ...(r.comment != null ? {comment: r.comment} : {}),
    }));
  }

  ensureDemoMarkets(): void {
    if (this.mode !== 'memory' || Object.keys(this._memMarkets).length > 0) return;
    const now = new Date().toISOString();
    const demos: Record<string, unknown>[] = [
      {
        id: uuidv4(),
        name: 'Atacadão Cruz de Rebouças',
        uf: 'PE',
        lat: -8.0284,
        lng: -34.9352,
        address: 'Av. Dr. José Rufino, Recife - PE',
        priceLevel: 'low',
        updatedAt: now,
      },
      {
        id: uuidv4(),
        name: 'Novo Atacarejo Imbiribeira',
        uf: 'PE',
        lat: -8.1145,
        lng: -34.9188,
        address: 'Imbiribeira, Recife - PE',
        priceLevel: 'low',
        updatedAt: now,
      },
      {
        id: uuidv4(),
        name: 'Assaí Atacadista Imbiribeira',
        uf: 'PE',
        lat: -8.1015,
        lng: -34.9255,
        address: 'Av. Marechal Mascarenhas, Recife - PE',
        priceLevel: 'low',
        updatedAt: now,
      },
      {
        id: uuidv4(),
        name: 'Carrefour Dourados',
        uf: 'PE',
        lat: -8.0476,
        lng: -34.877,
        address: 'Av. Mal. Mascarenhas de Morais, Recife - PE',
        priceLevel: 'fair',
        updatedAt: now,
      },
      {
        id: uuidv4(),
        name: "Sam's Club Recife",
        uf: 'PE',
        lat: -8.1121,
        lng: -34.9148,
        address: 'Av. Eng. Domingos Ferreira, Recife - PE',
        priceLevel: 'fair',
        updatedAt: now,
      },
    ];
    for (const m of demos) {
      this._memMarkets[String(m.id)] = m;
    }
  }

  async marketsForMap(): Promise<Record<string, unknown>[]> {
    this.ensureDemoMarkets();
    let markets: Record<string, unknown>[];
    if (this.mode === 'memory') {
      markets = Object.values(this._memMarkets);
    } else {
      markets = (await this.col('markets').find().toArray()) as Record<
        string,
        unknown
      >[];
    }
    const out: Record<string, unknown>[] = [];
    for (const m of markets) {
      const id = m.id as string | undefined;
      if (!id) continue;
      const agg = await this._aggregateReviews(id);
      out.push({
        ...m,
        avgRating: agg.avg,
        ratingsCount: agg.count,
        priceLevel: m.priceLevel ?? (await this._computePriceLevel(id)),
      });
    }
    return out;
  }

  private async _aggregateReviews(
    marketId: string,
  ): Promise<{avg: number; count: number}> {
    let reviews: Record<string, unknown>[];
    if (this.mode === 'memory') {
      reviews = Object.values(this._memReviews).filter(
        (r) => r.marketId === marketId,
      );
    } else {
      reviews = (await this.col('market_reviews')
        .find({marketId})
        .toArray()) as Record<string, unknown>[];
    }
    if (reviews.length === 0) return {avg: 0, count: 0};
    let sum = 0;
    let weightSum = 0;
    for (const r of reviews) {
      const w = Number(r.weight ?? 1);
      sum += Number(r.stars) * w;
      weightSum += w;
    }
    return {
      avg: weightSum === 0 ? 0 : sum / weightSum,
      count: reviews.length,
    };
  }

  private async _computePriceLevel(marketId: string): Promise<string> {
    let logs: Record<string, unknown>[];
    if (this.mode === 'memory') {
      logs = Object.values(this._memLogs);
    } else {
      logs = (await this.col('price_logs').find().toArray()) as Record<
        string,
        unknown
      >[];
    }
    const mine = logs.filter((l) => l.marketId === marketId);
    if (mine.length === 0 || logs.length < 2) return 'fair';
    const myAvg =
      mine.reduce((a, l) => a + Number(l.retailPrice), 0) / mine.length;
    const globalAvg =
      logs.reduce((a, l) => a + Number(l.retailPrice), 0) / logs.length;
    if (globalAvg === 0) return 'fair';
    const delta = (myAvg - globalAvg) / globalAvg;
    if (delta <= -0.08) return 'low';
    if (delta >= 0.08) return 'high';
    return 'fair';
  }

  async upsertMarketReview(args: {
    marketId: string;
    userId: string;
    stars: number;
    comment?: string | null;
  }): Promise<Record<string, unknown>> {
    const voterHash = sha256(`review|${args.userId}|${args.marketId}`);
    const weight = await this._userWeight(args.userId);
    const now = new Date();
    let existing: Record<string, unknown> | null = null;
    if (this.mode === 'memory') {
      for (const r of Object.values(this._memReviews)) {
        if (r.marketId === args.marketId && r.voterHash === voterHash) {
          existing = r;
          break;
        }
      }
    } else {
      existing = (await this.col('market_reviews').findOne({
        marketId: args.marketId,
        voterHash,
      })) as Record<string, unknown> | null;
    }
    if (existing) {
      const lastMs = Date.parse(String(existing.createdAt ?? ''));
      if (!Number.isNaN(lastMs) && now.getTime() - lastMs < 24 * 60 * 60 * 1000) {
        return {error: 'aguarde 24h para alterar a nota', status: 429};
      }
      existing.stars = args.stars;
      existing.comment = args.comment;
      existing.weight = weight;
      existing.createdAt = now.toISOString();
      if (this.mode === 'memory') {
        this._memReviews[String(existing.id)] = existing;
      } else {
        await this.col('market_reviews').replaceOne({id: existing.id}, existing);
      }
    } else {
      const doc: Record<string, unknown> = {
        id: uuidv4(),
        marketId: args.marketId,
        stars: args.stars,
        comment: args.comment,
        voterHash,
        weight,
        createdAt: now.toISOString(),
      };
      if (this.mode === 'memory') {
        this._memReviews[String(doc.id)] = doc;
      } else {
        await this.col('market_reviews').insertOne(doc);
      }
    }
    const agg = await this._aggregateReviews(args.marketId);
    return {ok: true, avgRating: agg.avg, ratingsCount: agg.count};
  }

  private async _userWeight(userId: string): Promise<number> {
    let rep: Record<string, unknown> | null | undefined;
    if (this.mode === 'memory') {
      rep = this._memReputation[userId];
    } else {
      rep = (await this.col('user_reputation').findOne({
        userId,
      })) as Record<string, unknown> | null;
    }
    const level = String(rep?.level ?? 'bronze');
    if (level === 'gold') return 2.0;
    if (level === 'silver') return 1.5;
    return 1.0;
  }

  async issueToken(userId: string): Promise<string> {
    const token = uuidv4();
    if (this.mode === 'memory') {
      this._memTokens[token] = userId;
      const user = this._memUsers[userId];
      if (user) user.token = token;
      return token;
    }
    await this.col('users').updateOne({id: userId}, {$set: {token}});
    return token;
  }

  async userIdForToken(token: string): Promise<string | null> {
    if (this.mode === 'memory') return this._memTokens[token] ?? null;
    const user = await this.col('users').findOne({token});
    return (user?.id as string) ?? null;
  }

  async push(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const productIdMap: Record<string, string> = {};
    const marketIdMap: Record<string, string> = {};
    const priceLogIdMap: Record<string, string> = {};
    const shoppingListIdMap: Record<string, string> = {};

    for (const raw of (body.markets as unknown[] | undefined) ?? []) {
      const m = {...(raw as Record<string, unknown>)};
      const remoteId = await this._upsertLww({
        collection: 'markets',
        mem: this._memMarkets,
        incoming: {
          id: m.remoteId ?? uuidv4(),
          name: m.name,
          cnpj: m.cnpj,
          uf: m.uf,
          lat: m.lat,
          lng: m.lng,
          address: m.address,
          priceLevel: m.priceLevel,
          updatedAt: m.updatedAt,
          contributorId: userId,
        },
        matchKeys: ['cnpj', 'name'],
      });
      marketIdMap[String(m.localId)] = remoteId;
    }

    for (const raw of (body.products as unknown[] | undefined) ?? []) {
      const p = {...(raw as Record<string, unknown>)};
      const remoteId = await this._upsertLww({
        collection: 'products',
        mem: this._memProducts,
        incoming: {
          id: p.remoteId ?? uuidv4(),
          name: p.name,
          aliases: p.aliases ?? [],
          category: p.category,
          updatedAt: p.updatedAt,
          contributorId: userId,
        },
        matchKeys: ['name'],
      });
      productIdMap[String(p.localId)] = remoteId;
    }

    for (const raw of (body.priceLogs as unknown[] | undefined) ?? []) {
      const l = {...(raw as Record<string, unknown>)};
      const productRemote =
        productIdMap[String(l.productLocalId)] ??
        (await this._resolveProductRemote(l.productLocalId));
      const marketRemote =
        l.marketLocalId == null
          ? null
          : marketIdMap[String(l.marketLocalId)] ?? null;

      const source = String(l.source ?? 'label');
      let trustLevel = String(l.trustLevel ?? 'suspect');
      let confirmScore = Number(l.confirmScore ?? 0);
      if (source === 'nfce' && confirmScore < 1) confirmScore = 1;

      const classified = await this._classifyWithJev({
        productId: productRemote,
        marketId: marketRemote,
        retailPrice: Number(l.retailPrice ?? 0),
        source,
        userId,
      });
      if (classified.action === 'reject') {
        trustLevel = 'hidden';
      } else if (classified.action === 'accept' && source === 'nfce') {
        trustLevel = this._computeTrust({
          confirmScore: confirmScore + 2,
          rejectScore: Number(l.rejectScore ?? 0),
          lastConfirmedAt: new Date(),
        });
        confirmScore = confirmScore + 2;
      } else {
        trustLevel = 'suspect';
      }

      const remoteId = await this._upsertLww({
        collection: 'price_logs',
        mem: this._memLogs,
        incoming: {
          id: l.remoteId ?? uuidv4(),
          productId: productRemote,
          marketId: marketRemote,
          retailPrice: l.retailPrice,
          wholesalePrice: l.wholesalePrice,
          minWholesaleQty: l.minWholesaleQty,
          source,
          capturedAt: l.capturedAt,
          nfceKey: l.nfceKey,
          confirmScore,
          rejectScore: l.rejectScore ?? 0,
          trustLevel,
          lastConfirmedAt: l.lastConfirmedAt,
          jevAction: classified.action,
          jevRisk: classified.risk,
          updatedAt: l.updatedAt,
          contributorId: l.contributorId ?? userId,
        },
        matchKeys: ['nfceKey'],
      });
      priceLogIdMap[String(l.localId)] = remoteId;
      await this._awardContributionBadges({userId, source});
    }

    for (const raw of (body.shoppingLists as unknown[] | undefined) ?? []) {
      const s = {...(raw as Record<string, unknown>)};
      const remoteId = await this._upsertLww({
        collection: 'shopping_lists',
        mem: this._memShoppingLists,
        incoming: {
          id: s.remoteId ?? uuidv4(),
          ownerId: userId,
          name: s.name,
          marketId: s.marketId,
          marketName: s.marketName,
          itemsJson: s.itemsJson,
          subtotal: s.subtotal,
          savings: s.savings,
          itemCount: s.itemCount,
          finishedAt: s.finishedAt,
          updatedAt: s.updatedAt,
        },
        matchKeys: [],
      });
      shoppingListIdMap[String(s.localId)] = remoteId;
    }

    return {
      productIdMap,
      marketIdMap,
      priceLogIdMap,
      shoppingListIdMap,
    };
  }

  private async _resolveProductRemote(_localId: unknown): Promise<string | null> {
    return null;
  }

  private async _upsertLww(args: {
    collection: string;
    mem: MemMap;
    incoming: Record<string, unknown>;
    matchKeys: string[];
  }): Promise<string> {
    const incomingUpdated =
      Date.parse(String(args.incoming.updatedAt ?? '')) || Date.now();

    if (this.mode === 'memory') {
      let existing: Record<string, unknown> | null = null;
      for (const doc of Object.values(args.mem)) {
        if (doc.id === args.incoming.id) {
          existing = doc;
          break;
        }
        for (const k of args.matchKeys) {
          const v = args.incoming[k];
          if (v != null && String(v) !== '' && doc[k] === v) {
            existing = doc;
            break;
          }
        }
        if (existing) break;
      }
      if (!existing) {
        const id = String(args.incoming.id);
        args.mem[id] = args.incoming;
        return id;
      }
      const existingUpdated =
        Date.parse(String(existing.updatedAt ?? '')) || 0;
      if (incomingUpdated > existingUpdated) {
        args.incoming.id = existing.id;
        args.mem[String(existing.id)] = args.incoming;
      }
      return String(existing.id);
    }

    let existing = (await this.col(args.collection).findOne({
      id: args.incoming.id,
    })) as Record<string, unknown> | null;
    if (!existing) {
      for (const k of args.matchKeys) {
        const v = args.incoming[k];
        if (v == null || String(v) === '') continue;
        existing = (await this.col(args.collection).findOne({
          [k]: v,
        })) as Record<string, unknown> | null;
        if (existing) break;
      }
    }
    if (!existing) {
      await this.col(args.collection).insertOne(args.incoming);
      return String(args.incoming.id);
    }
    const existingUpdated =
      Date.parse(String(existing.updatedAt ?? '')) || 0;
    if (incomingUpdated > existingUpdated) {
      args.incoming.id = existing.id;
      await this.col(args.collection).replaceOne({id: existing.id}, args.incoming);
    }
    return String(existing.id);
  }

  async pull(userId: string, since: Date): Promise<Record<string, unknown>> {
    if (this.mode === 'memory') {
      const after = (d: Record<string, unknown>) => {
        const u = Date.parse(String(d.updatedAt ?? ''));
        return !Number.isNaN(u) && u > since.getTime();
      };
      return {
        products: Object.values(this._memProducts).filter(after),
        markets: Object.values(this._memMarkets).filter(after),
        priceLogs: Object.values(this._memLogs).filter(after),
        shoppingLists: Object.values(this._memShoppingLists).filter(
          (d) => d.ownerId === userId && after(d),
        ),
      };
    }
    const iso = since.toISOString();
    const products = await this.col('products').find({updatedAt: {$gt: iso}}).toArray();
    const markets = await this.col('markets').find({updatedAt: {$gt: iso}}).toArray();
    const logs = await this.col('price_logs').find({updatedAt: {$gt: iso}}).toArray();
    const shoppingLists = await this.col('shopping_lists')
      .find({ownerId: userId, updatedAt: {$gt: iso}})
      .toArray();
    return {products, markets, priceLogs: logs, shoppingLists};
  }

  private async _findLog(id: string): Promise<Record<string, unknown> | null> {
    if (this.mode === 'memory') return this._memLogs[id] ?? null;
    return (await this.col('price_logs').findOne({id})) as Record<
      string,
      unknown
    > | null;
  }

  private async _saveLog(log: Record<string, unknown>): Promise<void> {
    if (this.mode === 'memory') {
      this._memLogs[String(log.id)] = log;
      return;
    }
    await this.col('price_logs').replaceOne({id: log.id}, log);
  }

  private _computeTrust(args: {
    confirmScore: number;
    rejectScore: number;
    lastConfirmedAt?: Date | null;
  }): string {
    const now = Date.now();
    if (args.rejectScore >= 3 && args.rejectScore > args.confirmScore) {
      return 'hidden';
    }
    const recent =
      args.lastConfirmedAt != null &&
      now - args.lastConfirmedAt.getTime() <= 3 * 24 * 60 * 60 * 1000 &&
      args.confirmScore >= 3;
    if (recent) return 'verified';
    return 'suspect';
  }

  private async _classifyWithJev(args: {
    productId: string | null;
    marketId: string | null;
    retailPrice: number;
    source: string;
    userId: string;
  }): Promise<Record<string, unknown>> {
    const jev = this._jev;
    if (!jev) {
      return {action: 'quarantine', risk: 1.0, fallback: true};
    }
    let productName = args.productId ?? 'produto';
    let marketName = args.marketId ?? 'mercado';
    if (this.mode === 'memory') {
      if (args.productId) {
        productName = String(this._memProducts[args.productId]?.name ?? productName);
      }
      if (args.marketId) {
        marketName = String(this._memMarkets[args.marketId]?.name ?? marketName);
      }
    } else {
      if (args.productId) {
        const p = await this.col('products').findOne({id: args.productId});
        productName = String(p?.name ?? productName);
      }
      if (args.marketId) {
        const m = await this.col('markets').findOne({id: args.marketId});
        marketName = String(m?.name ?? marketName);
      }
    }
    const prefs = await this.getUserPrefs(args.userId);
    const result = await jev.classifyPrice({
      productName,
      marketName,
      retailPrice: args.retailPrice,
      source: args.source,
      city: (prefs.city as string) || null,
    });
    return {action: result.action, risk: result.risk, fallback: result.fallback};
  }

  private async _awardContributionBadges(args: {
    userId: string;
    source: string;
  }): Promise<void> {
    const rep = await this.getReputation(args.userId);
    const badges = [...((rep.badges as string[] | undefined) ?? [])];
    if (args.source === 'nfce' && !badges.includes('primeira_nfce')) {
      badges.push('primeira_nfce');
    }
    if (
      (args.source === 'label' || args.source === 'manual') &&
      !badges.includes('primeira_captura')
    ) {
      badges.push('primeira_captura');
    }
    rep.badges = badges;
    await this._saveReputation(args.userId, rep);
  }

  async getUserPrefs(userId: string): Promise<Record<string, unknown>> {
    if (this.mode === 'memory') {
      const doc = this._memPrefs[userId];
      return {
        city: doc?.city ?? '',
        neighborhood: doc?.neighborhood ?? '',
        favoriteMarketIds: [...((doc?.favoriteMarketIds as string[]) ?? [])],
      };
    }
    const doc = (await this.col('user_prefs').findOne({userId})) as Record<
      string,
      unknown
    > | null;
    return {
      city: doc?.city ?? '',
      neighborhood: doc?.neighborhood ?? '',
      favoriteMarketIds: [
        ...((doc?.favoriteMarketIds as string[] | undefined) ?? []),
      ],
    };
  }

  async setUserPrefs(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const doc: Record<string, unknown> = {
      userId,
      city: String(body.city ?? '').trim(),
      neighborhood: String(body.neighborhood ?? '').trim(),
      favoriteMarketIds: ((body.favoriteMarketIds as unknown[]) ?? []).map(
        (e) => String(e),
      ),
      updatedAt: new Date().toISOString(),
    };
    if (this.mode === 'memory') {
      this._memPrefs[userId] = doc;
      return doc;
    }
    await this.col('user_prefs').replaceOne({userId}, doc, {upsert: true});
    return doc;
  }

  async getReputation(userId: string): Promise<Record<string, unknown>> {
    let rep: Record<string, unknown> | null | undefined;
    if (this.mode === 'memory') {
      rep = this._memReputation[userId];
    } else {
      rep = (await this.col('user_reputation').findOne({userId})) as Record<
        string,
        unknown
      > | null;
    }
    if (!rep) {
      rep = {
        userId,
        points: 0,
        level: 'bronze',
        validationsCount: 0,
        badges: [] as string[],
        updatedAt: new Date().toISOString(),
      };
    }
    rep.badges = [...((rep.badges as string[] | undefined) ?? [])];
    return {...rep};
  }

  private async _saveReputation(
    userId: string,
    rep: Record<string, unknown>,
  ): Promise<void> {
    rep.updatedAt = new Date().toISOString();
    if (this.mode === 'memory') {
      this._memReputation[userId] = rep;
      return;
    }
    await this.col('user_reputation').replaceOne({userId}, rep, {upsert: true});
  }

  async compareBasket(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const items = ((body.items as unknown[]) ?? []).map((e) => ({
      ...(e as Record<string, unknown>),
    }));
    let favIds = ((body.favoriteMarketIds as unknown[]) ?? []).map((e) =>
      String(e),
    );
    const prefs = await this.getUserPrefs(userId);
    if (favIds.length === 0) {
      favIds = [...((prefs.favoriteMarketIds as string[]) ?? [])];
    }

    const markets =
      this.mode === 'memory'
        ? Object.values(this._memMarkets)
        : ((await this.col('markets').find().toArray()) as Record<
            string,
            unknown
          >[]);
    const logs =
      this.mode === 'memory'
        ? Object.values(this._memLogs)
        : ((await this.col('price_logs').find().toArray()) as Record<
            string,
            unknown
          >[]);

    const pool = markets.filter((m) => {
      if (favIds.length === 0) return true;
      return favIds.includes(String(m.id));
    });

    const now = Date.now();
    const usable = (log: Record<string, unknown>) => {
      const trust = String(log.trustLevel ?? 'suspect');
      if (trust === 'hidden') return false;
      if (trust === 'verified') return true;
      if (log.source === 'nfce') {
        const t = Date.parse(String(log.capturedAt ?? ''));
        if (Number.isNaN(t)) return false;
        return now - t <= 7 * 24 * 60 * 60 * 1000;
      }
      return false;
    };

    const community = logs.filter(usable);
    const ranks: Record<string, unknown>[] = [];

    for (const market of pool) {
      let total = 0;
      let covered = 0;
      const missing: string[] = [];
      for (const item of items) {
        const name = String(item.productName ?? '').toLowerCase();
        const qty = Number(item.quantity ?? 1);
        const productRemote = item.productRemoteId as string | undefined;
        const candidates = community.filter((l) => {
          if (l.marketId !== market.id) return false;
          if (productRemote != null && l.productId === productRemote) return true;
          return false;
        });

        let best: Record<string, unknown> | null = null;
        if (candidates.length > 0) {
          candidates.sort((a, b) => {
            const ta = Date.parse(String(a.capturedAt ?? '')) || 0;
            const tb = Date.parse(String(b.capturedAt ?? '')) || 0;
            return tb - ta;
          });
          best = candidates[0] ?? null;
        } else if (name) {
          for (const l of community) {
            if (l.marketId !== market.id) continue;
            const pid = l.productId as string | undefined;
            let p: Record<string, unknown> | null | undefined;
            if (this.mode === 'memory') {
              p = pid ? this._memProducts[pid] : undefined;
            } else if (pid) {
              p = (await this.col('products').findOne({id: pid})) as Record<
                string,
                unknown
              > | null;
            }
            const pname = String(p?.name ?? '').toLowerCase();
            if (pname === name || pname.includes(name) || name.includes(pname)) {
              best = l;
              break;
            }
          }
        }

        if (!best) {
          missing.push(String(item.productName ?? 'item'));
          continue;
        }
        const unit = Number(best.retailPrice ?? 0);
        total += unit * qty;
        covered += 1;
      }
      const coverage = items.length === 0 ? 0 : covered / items.length;
      if (covered === 0) continue;
      ranks.push({
        marketId: market.id,
        marketName: market.name,
        total,
        coveredItems: covered,
        totalItems: items.length,
        coverage,
        missingNames: missing,
      });
    }

    ranks.sort((a, b) => {
      const c = Number(b.coverage) - Number(a.coverage);
      if (c !== 0) return c;
      return Number(a.total) - Number(b.total);
    });

    return {
      markets: ranks.slice(0, 12),
      coldStart:
        ranks.length === 0 ||
        ranks.every((r) => Number(r.coverage) < 0.34),
    };
  }

  async communityPrices(args: {
    productName?: string | null;
    city?: string | null;
  }): Promise<Record<string, unknown>[]> {
    const logs =
      this.mode === 'memory'
        ? Object.values(this._memLogs)
        : ((await this.col('price_logs').find().toArray()) as Record<
            string,
            unknown
          >[]);
    const now = Date.now();
    const out: Record<string, unknown>[] = [];
    for (const l of logs) {
      const trust = String(l.trustLevel ?? 'suspect');
      let ok = trust === 'verified';
      if (!ok && l.source === 'nfce') {
        const t = Date.parse(String(l.capturedAt ?? ''));
        ok = !Number.isNaN(t) && now - t <= 7 * 24 * 60 * 60 * 1000;
      }
      if (!ok || trust === 'hidden') continue;
      if (args.productName) {
        const needle = args.productName.toLowerCase();
        const pid = l.productId as string | undefined;
        let p: Record<string, unknown> | null | undefined;
        if (this.mode === 'memory') {
          p = pid ? this._memProducts[pid] : undefined;
        } else if (pid) {
          p = (await this.col('products').findOne({id: pid})) as Record<
            string,
            unknown
          > | null;
        }
        const pname = String(p?.name ?? '').toLowerCase();
        if (!pname.includes(needle)) continue;
      }
      out.push({
        priceLogId: l.id,
        productId: l.productId,
        marketId: l.marketId,
        retailPrice: l.retailPrice,
        trustLevel: trust,
        capturedAt: l.capturedAt,
        city: args.city,
      });
    }
    out.sort((a, b) => Number(a.retailPrice) - Number(b.retailPrice));
    return out.slice(0, 40);
  }

  async castVote(args: {
    userId: string;
    priceLogId: string;
    vote: string;
    weight: number;
    withPhoto?: boolean;
  }): Promise<Record<string, unknown>> {
    const log = await this._findLog(args.priceLogId);
    if (!log) return {error: 'price log não encontrado', status: 404};

    const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
    const voteKey = `${args.userId}|${args.priceLogId}`;
    if (this.mode === 'memory') {
      const existing = this._memVotes[voteKey];
      if (existing) {
        const created = Date.parse(String(existing.createdAt ?? ''));
        if (!Number.isNaN(created) && created > sinceMs) {
          return {error: 'já votou nas últimas 24h', status: 429};
        }
      }
    } else {
      const existing = await this.col('price_votes').findOne({
        voterId: args.userId,
        priceLogId: args.priceLogId,
      });
      if (existing) {
        const created = Date.parse(String(existing.createdAt ?? ''));
        if (!Number.isNaN(created) && created > sinceMs) {
          return {error: 'já votou nas últimas 24h', status: 429};
        }
      }
    }

    const now = new Date();
    let confirm = Number(log.confirmScore ?? 0);
    let reject = Number(log.rejectScore ?? 0);
    let lastConfirmed: Date | null =
      log.lastConfirmedAt != null
        ? new Date(String(log.lastConfirmedAt))
        : null;

    if (args.vote === 'confirm') {
      confirm += args.weight;
      lastConfirmed = now;
    } else {
      reject += args.weight;
    }

    log.confirmScore = confirm;
    log.rejectScore = reject;
    log.lastConfirmedAt = lastConfirmed?.toISOString() ?? null;
    log.trustLevel = this._computeTrust({
      confirmScore: confirm,
      rejectScore: reject,
      lastConfirmedAt: lastConfirmed,
    });
    log.updatedAt = now.toISOString();
    await this._saveLog(log);

    const voteDoc: Record<string, unknown> = {
      id: uuidv4(),
      priceLogId: args.priceLogId,
      voterId: args.userId,
      vote: args.vote,
      weight: args.weight,
      createdAt: now.toISOString(),
    };
    if (this.mode === 'memory') {
      this._memVotes[voteKey] = voteDoc;
    } else {
      await this.col('price_votes').insertOne(voteDoc);
    }

    const pts =
      args.vote === 'confirm' ? 10 : args.withPhoto ? 25 : 5;
    const rep = await this.getReputation(args.userId);
    rep.points = Number(rep.points ?? 0) + pts;
    rep.validationsCount = Number(rep.validationsCount ?? 0) + 1;
    const p = Number(rep.points);
    rep.level = p >= 300 ? 'gold' : p >= 100 ? 'silver' : 'bronze';
    const badges = [...((rep.badges as string[]) ?? [])];
    if (Number(rep.validationsCount) >= 10 && !badges.includes('comunidade_ativa')) {
      badges.push('comunidade_ativa');
    }
    if (p >= 100 && !badges.includes('fiscal_prata')) {
      badges.push('fiscal_prata');
    }
    if (p >= 300 && !badges.includes('fiscal_ouro')) {
      badges.push('fiscal_ouro');
    }
    rep.badges = badges;
    await this._saveReputation(args.userId, rep);

    return {
      ok: true,
      trustLevel: log.trustLevel,
      confirmScore: confirm,
      rejectScore: reject,
      reputation: rep,
    };
  }

  async trustFor(id: string): Promise<Record<string, unknown> | null> {
    const log = await this._findLog(id);
    if (!log) return null;
    return {
      priceLogId: id,
      trustLevel: log.trustLevel ?? 'suspect',
      confirmScore: log.confirmScore ?? 0,
      rejectScore: log.rejectScore ?? 0,
      lastConfirmedAt: log.lastConfirmedAt,
    };
  }
}
